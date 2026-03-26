"""Comprehensive audio file analysis using librosa, soundfile, and pyloudnorm."""
from __future__ import annotations

import io
import numpy as np
import soundfile as sf
import librosa
import pyloudnorm as pyln

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_HARM_MINOR    = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 2.29, 4.50])

_MODE_INTERVALS = {
    'ionian':         [0, 2, 4, 5, 7, 9, 11],
    'dorian':         [0, 2, 3, 5, 7, 9, 10],
    'phrygian':       [0, 1, 3, 5, 7, 8, 10],
    'lydian':         [0, 2, 4, 6, 7, 9, 11],
    'mixolydian':     [0, 2, 4, 5, 7, 9, 10],
    'aeolian':        [0, 2, 3, 5, 7, 8, 10],
    'locrian':        [0, 1, 3, 5, 6, 8, 10],
    'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
    'melodic minor':  [0, 2, 3, 5, 7, 9, 11],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x.astype(np.float64) ** 2) + 1e-10))

def _to_db(linear: float) -> float:
    return float(20.0 * np.log10(max(float(linear), 1e-10)))

def _ks_correlate(dist: np.ndarray):
    """Krumhansl-Schmuckler key finding. Returns (tonic, mode, correlation)."""
    best_r, best_tonic, best_mode = -np.inf, 'C', 'major'
    for i in range(12):
        for profile, mode in [(_MAJOR_PROFILE, 'major'),
                               (_MINOR_PROFILE, 'minor'),
                               (_HARM_MINOR,    'harmonic minor')]:
            r = float(np.corrcoef(dist, np.roll(profile, i))[0, 1])
            if r > best_r:
                best_r, best_tonic, best_mode = r, NOTE_NAMES[i], mode
    return best_tonic, best_mode, best_r

def _modal_flavor(dist: np.ndarray, tonic_pc: int) -> str:
    rot = np.roll(dist, -tonic_pc)
    best, best_score = 'ionian', -np.inf
    for name, ivs in _MODE_INTERVALS.items():
        p = np.zeros(12)
        for i in ivs:
            p[i] = 1.0
        s = float(np.dot(rot, p))
        if s > best_score:
            best_score, best = s, name
    return best


# ── Audio loader ──────────────────────────────────────────────────────────────

def _load_audio(file_bytes: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    """
    Load audio from raw bytes.
    Returns (y_left, y_right, y_mono, sr) — all float32, shape (N,).
    Tries soundfile first (WAV/AIFF/FLAC/OGG), then librosa (MP3 via ffmpeg).
    """
    buf = io.BytesIO(file_bytes)
    try:
        data, sr = sf.read(buf, always_2d=True, dtype='float32')
        # soundfile returns (samples, channels)
        y_mono = librosa.to_mono(data.T)
        y_left  = data[:, 0]
        y_right = data[:, 1] if data.shape[1] >= 2 else data[:, 0]
        return y_left, y_right, y_mono, int(sr)
    except Exception:
        pass

    buf.seek(0)
    y_lr, sr = librosa.load(buf, sr=None, mono=False)
    if y_lr.ndim == 1:
        return y_lr, y_lr, y_lr, int(sr)
    y_left  = np.asarray(y_lr[0], dtype=np.float32)
    y_right = np.asarray(y_lr[1], dtype=np.float32)
    y_mono  = librosa.to_mono(y_lr)
    return y_left, y_right, y_mono, int(sr)


# ── Public entry point ────────────────────────────────────────────────────────

def analyze_audio(file_bytes: bytes, filename: str) -> dict:
    """Load audio once, dispatch to all sub-analyzers, return JSON-ready dict."""
    y_left, y_right, y_mono, sr = _load_audio(file_bytes)

    is_mono = bool(np.allclose(y_left, y_right, atol=1e-6))
    result: dict = {
        'file':             filename,
        'duration_seconds': round(len(y_mono) / sr, 2),
        'sample_rate':      sr,
        'channels':         1 if is_mono else 2,
    }

    tonic_pc = 0  # default; updated after tonality runs

    def _run(key, fn, *args):
        nonlocal tonic_pc
        try:
            out = fn(*args)
            result[key] = out
            if key == 'tonality':
                tonic_pc = NOTE_NAMES.index(out.get('tonic', 'C'))
        except Exception as exc:
            result[key] = {'error': str(exc)}

    _run('tonality',  _analyze_tonality,        y_mono, sr)
    _run('bpm',       _analyze_bpm,             y_mono, sr)
    _run('loudness',  _analyze_loudness,        y_left, y_right, y_mono, sr)
    _run('frequency', _analyze_frequency,       y_mono, sr)
    _run('stereo',    _analyze_stereo,          y_left, y_right)
    _run('harmonic',  _analyze_harmonic,        y_mono, sr)
    _run('bass',      _analyze_bass,            y_mono, sr, tonic_pc)
    _run('structure', _analyze_structure,       y_mono, sr)
    _run('optional',  _analyze_optional,        y_mono, sr)

    return result


# ── Section analyzers ─────────────────────────────────────────────────────────

def _analyze_tonality(y: np.ndarray, sr: int) -> dict:
    y_harm = librosa.effects.harmonic(y)
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr)
    # For each frame, count only the top 3 pitch classes (reflecting real chord tones).
    # Averaging raw energy always leaks into all 12 bins; this avoids that entirely.
    n_top = 3
    hist = np.zeros(12)
    for t in range(chroma.shape[1]):
        top = np.argsort(chroma[:, t])[-n_top:]
        hist[top] += 1.0
    if hist.sum() > 0:
        hist = hist / hist.sum()
    # Zero out pitch classes that appear in fewer than 15% of frames vs the peak
    threshold = hist.max() * 0.15
    hist[hist < threshold] = 0.0
    if hist.sum() > 0:
        hist = hist / hist.sum()

    tonic, mode, corr = _ks_correlate(hist)
    tonic_pc = NOTE_NAMES.index(tonic)
    flavor = _modal_flavor(hist, tonic_pc)
    confidence = round(max(0.0, min(1.0, (corr + 0.3) / 1.3)) * 100, 1)

    return {
        'tonic':                  tonic,
        'mode':                   mode,
        'modal_flavor':           flavor,
        'key':                    f"{tonic} {mode}",
        'key_confidence':         confidence,
        'correlation':            round(corr, 4),
        'pitch_class_histogram':  {NOTE_NAMES[i]: round(float(hist[i]), 4) for i in range(12)},
    }


def _analyze_bpm(y: np.ndarray, sr: int) -> dict:
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.squeeze(tempo))
    beat_times = librosa.frames_to_time(beats, sr=sr).tolist()

    stability = 1.0
    stability_label = 'Unknown'
    if len(beat_times) > 2:
        ibis = np.diff(beat_times)
        ibi_mean = float(np.mean(ibis))
        ibi_std  = float(np.std(ibis))
        stability = round(max(0.0, 1.0 - ibi_std / (ibi_mean + 1e-10)), 3)
        if stability > 0.95:   stability_label = 'Very stable'
        elif stability > 0.85: stability_label = 'Stable'
        elif stability > 0.70: stability_label = 'Moderate drift'
        else:                  stability_label = 'High drift'

    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    downbeat_conf = 0.0
    if len(beats) > 0:
        downbeat_conf = round(
            min(5.0, float(onset_env[beats[0]]) / (float(np.mean(onset_env)) + 1e-10)), 2
        )

    return {
        'tempo_bpm':             round(bpm, 1),
        'beat_count':            len(beats),
        'tempo_stability':       stability,
        'tempo_stability_label': stability_label,
        'downbeat_confidence':   downbeat_conf,
    }


def _analyze_loudness(
    y_left: np.ndarray, y_right: np.ndarray, y_mono: np.ndarray, sr: int
) -> dict:
    stereo = np.stack([y_left, y_right], axis=1).astype(np.float64)
    meter  = pyln.Meter(sr)

    try:
        integrated = float(meter.integrated_loudness(stereo))
        integrated = None if not np.isfinite(integrated) else round(integrated, 1)
    except Exception:
        integrated = None

    # Short-term LUFS — loudest 3-second window
    window, hop = int(3.0 * sr), int(1.0 * sr)
    st_values: list[float] = []
    for start in range(0, len(y_mono) - window, hop):
        try:
            v = float(meter.integrated_loudness(stereo[start:start + window]))
            if np.isfinite(v):
                st_values.append(v)
        except Exception:
            pass
    short_term = round(max(st_values), 1) if st_values else None

    peak_linear = float(np.max(np.abs(y_mono)))
    true_peak   = round(_to_db(peak_linear), 1)
    rms_val     = _rms(y_mono)
    rms_db      = round(_to_db(rms_val), 1)
    crest_db    = round(true_peak - rms_db, 1)

    # Dynamic range — 95th vs 10th percentile of 200ms RMS chunks
    chunk = int(0.2 * sr)
    chunks_db = [_to_db(_rms(y_mono[i:i + chunk]))
                 for i in range(0, len(y_mono) - chunk, chunk)]
    dr = round(float(np.percentile(chunks_db, 95) - np.percentile(chunks_db, 10)), 1) \
         if chunks_db else None

    return {
        'integrated_lufs':  integrated,
        'short_term_lufs':  short_term,
        'true_peak_dbtp':   true_peak,
        'rms_db':           rms_db,
        'crest_factor_db':  crest_db,
        'dynamic_range_dr': dr,
    }


def _analyze_frequency(y: np.ndarray, sr: int) -> dict:
    S     = np.abs(librosa.stft(y)) ** 2
    freqs = librosa.fft_frequencies(sr=sr)
    total = S.sum() + 1e-10

    def _band(lo, hi):
        mask = (freqs >= lo) & (freqs < hi)
        return round(float(S[mask].sum() / total * 100), 1) if mask.any() else 0.0

    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)

    return {
        'sub_20_60_pct':          _band(20,    60),
        'low_60_250_pct':         _band(60,    250),
        'mid_250_2k_pct':         _band(250,   2000),
        'high_2k_10k_pct':        _band(2000,  10000),
        'air_10k_plus_pct':       _band(10000, sr // 2),
        'spectral_centroid_hz':   round(float(np.mean(centroid))),
    }


def _analyze_stereo(y_left: np.ndarray, y_right: np.ndarray) -> dict:
    is_mono = bool(np.allclose(y_left, y_right, atol=1e-6))
    mid  = (y_left + y_right) / 2
    side = (y_left - y_right) / 2

    mid_rms  = _rms(mid)
    side_rms = _rms(side)
    total    = mid_rms + side_rms + 1e-10

    mid_pct  = round(mid_rms  / total * 100, 1)
    side_pct = round(side_rms / total * 100, 1)
    width    = round(min(side_rms / total * 200, 100.0), 1)

    l_n   = y_left  - y_left.mean()
    r_n   = y_right - y_right.mean()
    denom = float(np.sqrt(np.sum(l_n ** 2) * np.sum(r_n ** 2))) + 1e-10
    phase_corr = round(float(np.dot(l_n, r_n)) / denom, 3)

    mono_rms   = _rms((y_left + y_right) / 2)
    stereo_rms = float(np.sqrt((_rms(y_left) ** 2 + _rms(y_right) ** 2) / 2)) + 1e-10
    compat_pct = round(mono_rms / stereo_rms * 100, 1)
    if compat_pct >= 90:   compat_label = 'Excellent'
    elif compat_pct >= 75: compat_label = 'Good'
    elif compat_pct >= 55: compat_label = 'Fair'
    else:                  compat_label = 'Poor'

    return {
        'is_mono':                  is_mono,
        'stereo_width_pct':         width,
        'mid_energy_pct':           mid_pct,
        'side_energy_pct':          side_pct,
        'phase_correlation':        phase_corr,
        'mono_compatibility_pct':   compat_pct,
        'mono_compatibility_label': compat_label,
    }


def _analyze_harmonic(y: np.ndarray, sr: int) -> dict:
    y_harm = librosa.effects.harmonic(y)
    hop    = 4096
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop)

    frame_roots = np.argmax(chroma, axis=0)
    tonic_pc    = int(np.bincount(frame_roots).argmax())

    root_stability = round(float(np.mean(frame_roots == tonic_pc)) * 100, 1)

    frame_corrs = []
    for i in range(chroma.shape[1]):
        col = chroma[:, i]
        s = col.sum()
        if s > 0:
            _, _, r = _ks_correlate(col / s)
            frame_corrs.append(r)
    key_drift = round(float(np.std(frame_corrs)), 4) if frame_corrs else 0.0

    changes = int(np.sum(np.diff(frame_roots) != 0))
    duration = len(y) / sr
    chord_changes_per_min = round(changes / duration * 60, 1) if duration > 0 else 0.0

    dominant_pc = (tonic_pc + 7) % 12
    vi_count = sum(
        1 for i in range(len(frame_roots) - 1)
        if frame_roots[i] == dominant_pc and frame_roots[i + 1] == tonic_pc
    )
    vi_rate = round(vi_count / max(1, len(frame_roots) - 1) * 100, 1)

    return {
        'dominant_root':                   NOTE_NAMES[tonic_pc],
        'root_stability_pct':              root_stability,
        'key_drift':                       key_drift,
        'dominant_tonic_resolution_pct':   vi_rate,
        'chord_changes_per_min':           chord_changes_per_min,
    }


def _analyze_bass(y: np.ndarray, sr: int, tonic_pc: int) -> dict:
    fmin   = librosa.note_to_hz('C1')
    n_bins = 36  # 3 octaves from C1

    C = np.abs(librosa.cqt(y, sr=sr, fmin=fmin, n_bins=n_bins, bins_per_octave=12))

    # For each frame, count only the top 2 bass bins (one dominant bass note per frame)
    bass_pc = np.zeros(12)
    for t in range(C.shape[1]):
        top = np.argsort(C[:, t])[-2:]
        for idx in top:
            bass_pc[idx % 12] += 1.0

    total = bass_pc.sum() + 1e-10
    norm  = bass_pc / total
    threshold = norm.max() * 0.15
    norm[norm < threshold] = 0.0
    if norm.sum() > 0:
        norm = norm / norm.sum()

    top3           = [NOTE_NAMES[i] for i in np.argsort(norm)[::-1][:3]]
    root_pct       = round(float(norm[tonic_pc]) * 100, 1)

    S     = np.abs(librosa.stft(y)) ** 2
    freqs = librosa.fft_frequencies(sr=sr)
    sub_mask = freqs <= 80
    if sub_mask.any():
        sub_e = S[sub_mask, :].sum(axis=0)
        sub_cv = float(np.std(sub_e) / (np.mean(sub_e) + 1e-10))
        sub_label = 'Consistent' if sub_cv < 0.8 else 'Variable'
    else:
        sub_label = 'N/A'

    return {
        'dominant_bass_notes':    top3,
        'bass_note_distribution': {NOTE_NAMES[i]: round(float(norm[i]), 4) for i in range(12)},
        'root_bass_pct':          root_pct,
        'non_root_bass_pct':      round(100 - root_pct, 1),
        'sub_consistency':        sub_label,
    }


def _analyze_structure(y: np.ndarray, sr: int) -> dict:
    hop        = sr  # 1-second frames
    rms_frames = librosa.feature.rms(y=y, frame_length=hop * 2, hop_length=hop)[0]

    r_min, r_max = rms_frames.min(), rms_frames.max()
    rms_norm = (
        (rms_frames - r_min) / (r_max - r_min) * 100
        if r_max > r_min else np.full_like(rms_frames, 50.0)
    )

    n     = len(rms_norm)
    times = librosa.frames_to_time(np.arange(n), sr=sr, hop_length=hop).tolist()
    third = max(1, n // 3)

    sections = [
        {
            'label':      'Intro',
            'energy_pct': round(float(rms_norm[:third].mean()), 1),
            'time_range': f"0s – {times[third - 1]:.0f}s",
        },
        {
            'label':      'Middle',
            'energy_pct': round(float(rms_norm[third:2 * third].mean()), 1),
            'time_range': f"{times[third]:.0f}s – {times[min(2 * third, n - 1)]:.0f}s",
        },
        {
            'label':      'Outro',
            'energy_pct': round(float(rms_norm[2 * third:].mean()), 1),
            'time_range': f"{times[min(2 * third, n - 1)]:.0f}s – end",
        },
    ]

    peak_idx  = int(np.argmax(rms_norm))
    peak_time = round(float(times[peak_idx]) if peak_idx < len(times) else 0.0, 1)

    onsets  = librosa.onset.onset_detect(y=y, sr=sr)
    density = round(len(onsets) / (len(y) / sr), 2)

    step  = max(1, n // 80)
    curve = [round(float(v), 1) for v in rms_norm[::step]]

    return {
        'energy_curve':          curve,
        'peak_energy_time_sec':  peak_time,
        'sections':              sections,
        'density_onsets_per_sec': density,
    }


def _analyze_optional(y: np.ndarray, sr: int) -> dict:
    duration = len(y) / sr

    onsets          = librosa.onset.onset_detect(y=y, sr=sr, delta=0.15)
    transient_density = round(len(onsets) / duration * 60, 1) if duration > 0 else 0.0

    onset_env    = librosa.onset.onset_strength(y=y, sr=sr)
    spectral_flux = round(float(np.mean(onset_env)), 3)

    y_harm = librosa.effects.harmonic(y)
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr)
    frame_max = chroma.max(axis=0, keepdims=True)
    active    = np.sum(chroma > frame_max * 0.05, axis=0)
    mean_act  = round(float(np.mean(active)), 1)

    if mean_act <= 4:   complexity = 'Simple'
    elif mean_act <= 7: complexity = 'Moderate'
    else:               complexity = 'Complex'

    return {
        'transient_density_per_min':    transient_density,
        'spectral_flux':                spectral_flux,
        'harmonic_complexity_pcs':      mean_act,
        'harmonic_complexity_label':    complexity,
    }
