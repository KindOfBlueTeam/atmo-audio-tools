"""Comprehensive audio file analysis using librosa, soundfile, and pyloudnorm."""
from __future__ import annotations

# Must be set before numba/librosa are imported so that librosa's
# @numba.guvectorize decorators create plain Python functions rather than
# Dispatcher objects.  If it is already set in the environment (e.g. via the
# Procfile or render.yaml) setdefault leaves it unchanged.
import os
os.environ.setdefault('NUMBA_DISABLE_JIT', '1')

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

# ── Tonic Detection Weights ────────────────────────────────────────────────────
# Positive weights contribute to the tonic score; penalty weights are subtracted.
# All signals are normalized to [0, 1] before weighting.
_TONIC_WEIGHTS: dict[str, float] = {
    'key_fit':                0.30,
    'resolution':             0.18,
    'phrase_end':             0.20,
    'bass_anchor':            0.10,
    'low_freq_anchor':        0.08,
    'duration':               0.07,
    'local_stability':        0.07,
    'relative_major_penalty': 0.25,
    'chromatic_conflict':     0.10,
}

# ── Harmonic Root Detection Weights ───────────────────────────────────────────
# tonic_alignment is the most important signal: the tonic scorer already did the
# disambiguation work (including relative-key penalty).  We trust that result
# heavily and only allow the harmonic root to diverge when other evidence is
# overwhelmingly contradictory.
_HARMONIC_ROOT_WEIGHTS: dict[str, float] = {
    'tonic_alignment':        0.40,  # primary: reward agreement with tonality.tonic
    'key_fit':                0.15,  # KS correlation for H on global chroma
    'phrase_end':             0.15,  # KS fitness in the track's ending section
    'resolution':             0.12,  # V→H / leading-tone→H cadential arrivals
    'section_consistency':    0.08,  # H remains a top KS candidate across sections
    'low_freq_support':       0.05,  # sub-bass (40–300 Hz) energy at H
    'bass_support':           0.05,  # bass CQT frame presence at H
    'relative_major_penalty': 0.30,  # penalise relative-key confusion (e.g. A vs F#m)
    'chromatic_penalty':      0.05,  # penalise out-of-key chromatic conflict
}

# Consistency rule thresholds:
#   When key_confidence is high, tonic_margin is clear, and root_stability is
#   reasonable, inferred_harmonic_root must match tonality.tonic unless a
#   competing candidate beats the tonic score by at least _HR_OVERRIDE_MARGIN.
_HR_HIGH_CONF       = 70.0   # key_confidence (%) above which tonic is trusted
_HR_TONIC_MARGIN    = 0.05   # tonic_margin above which disambiguation is firm
_HR_STAB_PCT        = 40.0   # root_stability_pct (%) threshold for Rule 1
_HR_OVERRIDE_MARGIN = 0.12   # score gap a competitor needs to beat the tonic

# Set True to print per-candidate harmonic-root breakdowns to stdout.
_HARMONIC_ROOT_DEBUG: bool = False

# Set True to print per-candidate score breakdowns to stdout for debugging.
_TONIC_DEBUG: bool = False

# ── BPM / Tempo Detection Weights ─────────────────────────────────────────────
# All positive signals are normalised to [0, 1].  Penalty signals are subtracted.
# Weights for ambient tracks are multiplied by the ambient_scale values below.
_BPM_WEIGHTS: dict[str, float] = {
    'tempogram':        0.25,   # peak strength in the averaged tempogram
    'consistency':      0.30,   # tempo stable across time windows
    'low_freq_pulse':   0.25,   # periodic low-frequency amplitude modulation
    'energy_alignment': 0.10,   # beat grid aligned with RMS energy curve
    'onset_alignment':  0.10,   # beat grid aligned with onset envelope
    'density_penalty':  0.20,   # penalise unrealistically fast beat density
    'extreme_penalty':  0.10,   # penalise tempos outside the preferred range
}

# For ambient / pad-heavy tracks these multipliers adjust the weights above.
_BPM_AMBIENT_SCALE: dict[str, float] = {
    'tempogram':        0.70,   # onset envelope less reliable
    'consistency':      1.40,   # stability matters most
    'low_freq_pulse':   1.60,   # pads encode pulse here
    'energy_alignment': 1.20,   # macro energy beats still useful
    'onset_alignment':  0.25,   # onsets are sparse and misleading
    'density_penalty':  1.50,   # prefer slower tempos
    'extreme_penalty':  1.50,   # strongly prefer the 50-160 BPM range
}

_BPM_PREFERRED_MIN  = 50.0    # soft lower bound — tempos below are penalised
_BPM_PREFERRED_MAX  = 160.0   # soft upper bound
_BPM_HARD_MIN       = 30.0    # absolute floor — no candidate below this
_BPM_HARD_MAX       = 250.0   # absolute ceiling
_BPM_N_CANDIDATES   = 8       # peaks extracted from the tempogram before expansion
_BPM_DEBUG: bool    = False   # print candidate score table to stdout

# ── Ambient classification ─────────────────────────────────────────────────────
# Multi-signal ambient score replaces the old three-condition AND rule.
# All positive signals are in [0, 1]; transient_penalty is subtracted.
_AMBIENT_WEIGHTS: dict[str, float] = {
    'high_freq_suppression': 0.25,  # 2k–10k energy unusually low for genre
    'air_suppression':        0.15,  # 10k+ air band essentially absent
    'sustain_bias':           0.20,  # onset envelope uniform (no sharp transient spikes)
    'low_mid_bias':           0.20,  # energy concentrated in sub / low / mid bands
    'dynamic_softness':       0.10,  # RMS envelope is smooth, not punch-driven
    'downbeat_weakness':      0.10,  # no dominant accent peaks
    'transient_density':      0.20,  # penalise clearly percussive onset density (subtracted)
}
_AMBIENT_THRESHOLD = 0.40     # ambient_score >= threshold → is_ambient = True

# ── Tempo group normalization ──────────────────────────────────────────────────
# Rank-based weights for the weighted-mean group_score calculation.
# Using a weighted mean prevents large groups from dominating purely by count.
# Index 0 = top-scoring member, index 1 = second, index 2+ = remaining.
_GROUP_RANK_WEIGHTS: list[float] = [1.0, 0.9, 0.25]


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


def relative_major_minor_penalty(
    T: int,
    ks_tonic_pc: int,
    ks_mode: str,
    ks_corr: float,
) -> float:
    """
    Penalty for selecting the relative-key tonic instead of the KS-detected tonic.

    Unit tests:
      - F# minor (ks_tonic_pc=6, ks_mode='minor', corr=0.8), T=9 (A) → penalty ~0.75
      - F# minor, T=6 (F#) → penalty = 0.0
      - C major (ks_tonic_pc=0, ks_mode='major', corr=0.8), T=9 (A) → penalty ~0.5

    Returns a value in [0, 1]. Applied with subtraction in the tonic score formula.
    """
    conf = max(0.0, (ks_corr + 0.3) / 1.3)
    if ks_mode in ('minor', 'harmonic minor'):
        # Relative major is 3 semitones above the minor tonic
        relative_major_pc = (ks_tonic_pc + 3) % 12
        if T == relative_major_pc:
            return conf * 0.9
    elif ks_mode == 'major':
        # Relative minor is 3 semitones below the major tonic
        relative_minor_pc = (ks_tonic_pc + 9) % 12
        if T == relative_minor_pc:
            return conf * 0.6
    return 0.0


def _compute_tonic_scores(
    chroma: np.ndarray,
    y: np.ndarray,
    sr: int,
    hop_length: int,
    global_hist: np.ndarray,
    ks_tonic: str,
    ks_mode: str,
    ks_corr: float,
    weights: dict | None = None,
) -> tuple[str, float, dict]:
    """
    Multi-signal tonic scoring for all 12 pitch classes.

    Signals (all normalized [0,1]):
      key_fit            — KS correlation for T as tonic on global histogram
      resolution         — fraction of harmonic arrivals at T via V or leading-tone
      phrase_end         — KS fitness of T in the ending 15% of the track
      bass_anchor        — fraction of bass-register CQT frames where T dominates
      low_freq_anchor    — T's energy share in 40–300 Hz STFT band
      duration           — energy-weighted fraction of frames where T is in top-3
      local_stability    — fraction of time windows where T is a top-2 KS candidate

    Penalties (subtracted):
      relative_major_penalty  — relative-key confusion (e.g. A vs F# minor)
      chromatic_conflict      — fraction of active pitch classes outside T's best key

    Returns:
        (best_tonic_name, margin_over_runner_up, {note: score_breakdown_dict})
    """
    if weights is None:
        weights = _TONIC_WEIGHTS

    ks_tonic_pc = NOTE_NAMES.index(ks_tonic)
    n_frames = chroma.shape[1]
    _PROFILES = [_MAJOR_PROFILE, _MINOR_PROFILE, _HARM_MINOR]

    def _best_ks(hist: np.ndarray, T: int) -> float:
        """Best KS correlation for pitch class T across all mode profiles."""
        return max(
            float(np.corrcoef(hist, np.roll(p, T))[0, 1])
            for p in _PROFILES
        )

    # ── Pre-compute shared structures ─────────────────────────────────────

    # Frame-level dominant pitch class for resolution signal
    frame_roots = np.argmax(chroma, axis=0)

    # Top-3 membership mask for duration score: shape (12, n_frames)
    top3_mask = np.zeros((12, n_frames), dtype=bool)
    for t in range(n_frames):
        top3_mask[np.argsort(chroma[:, t])[-3:], t] = True

    # RMS per frame for energy weighting
    rms_frames = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    n_rms = min(n_frames, len(rms_frames))
    rms_arr = rms_frames[:n_rms]
    total_rms = float(rms_arr.sum()) + 1e-10

    # Energy-weighted presence per pitch class (for duration score)
    weighted_presence = top3_mask[:, :n_rms] @ rms_arr  # shape (12,)

    # Ending-section histogram for phrase_end signal (last 15% of track, 5–20 s)
    duration_sec = n_frames * hop_length / sr
    ending_sec = float(np.clip(duration_sec * 0.15, 5.0, 20.0))
    ending_frames = max(1, int(ending_sec * sr / hop_length))
    end_hist = np.zeros(12)
    for t in range(max(0, n_frames - ending_frames), n_frames):
        end_hist[np.argsort(chroma[:, t])[-3:]] += 1.0
    if end_hist.sum() > 0:
        end_hist /= end_hist.sum()

    # Per-window histograms for local_stability signal
    n_windows = 8
    win_size = max(1, n_frames // n_windows)
    window_hists: list[np.ndarray] = []
    for w in range(n_windows):
        s, e = w * win_size, min((w + 1) * win_size, n_frames)
        if e <= s:
            continue
        wh = np.zeros(12)
        for t in range(s, e):
            wh[np.argsort(chroma[:, t])[-3:]] += 1.0
        if wh.sum() > 0:
            wh /= wh.sum()
        window_hists.append(wh)

    # KS score matrix: ks_scores[T, w] for local stability
    n_win = len(window_hists)
    ks_win = np.zeros((12, n_win))
    for w, wh in enumerate(window_hists):
        for T in range(12):
            ks_win[T, w] = _best_ks(wh, T)

    # Bass-register CQT for bass_anchor signal
    fmin = librosa.note_to_hz('C1')
    try:
        C_bass = np.abs(librosa.cqt(y, sr=sr, fmin=fmin, n_bins=36, bins_per_octave=12))
        bass_pc_counts = np.zeros(12)
        for t in range(C_bass.shape[1]):
            bass_pc_counts[int(np.argmax(C_bass[:, t])) % 12] += 1.0
        bass_anchor_scores = bass_pc_counts / (bass_pc_counts.sum() + 1e-10)
    except Exception:
        bass_anchor_scores = np.ones(12) / 12.0

    # Low-frequency STFT energy per pitch class (40–300 Hz)
    S = np.abs(librosa.stft(y, hop_length=hop_length)) ** 2
    freqs_hz = librosa.fft_frequencies(sr=sr)
    low_mask = (freqs_hz >= 40) & (freqs_hz <= 300)
    low_pc_energy = np.zeros(12)
    if low_mask.any():
        low_e = S[low_mask, :].sum(axis=1)
        for i, f in enumerate(freqs_hz[low_mask]):
            if f > 0:
                pc = int(round(69.0 + 12.0 * np.log2(f / 440.0))) % 12
                low_pc_energy[pc] += float(low_e[i])
    low_freq_scores = low_pc_energy / (low_pc_energy.sum() + 1e-10)

    # ── Per-candidate scoring loop ─────────────────────────────────────────

    scores: dict[str, dict] = {}

    for T in range(12):

        # 1. Key fit: best KS correlation for T on global histogram
        s_key_fit = max(0.0, (_best_ks(global_hist, T) + 0.5) / 1.5)

        # 2. Resolution: arrivals at T via dominant (T+7) or leading-tone (T+11)
        dom_pc     = (T + 7) % 12
        leading_pc = (T + 11) % 12
        arrivals_T   = int(np.sum(frame_roots[1:] == T))
        resolving_T  = int(np.sum(
            (frame_roots[1:] == T) & np.isin(frame_roots[:-1], [dom_pc, leading_pc])
        ))
        s_resolution = resolving_T / arrivals_T if arrivals_T > 0 else 0.0

        # 3. Phrase end: KS fitness of T in the final section
        s_phrase_end = max(0.0, (_best_ks(end_hist, T) + 0.5) / 1.5) if end_hist.sum() > 0 else 0.0

        # 4. Bass anchor: fraction of bass frames dominated by T
        s_bass_anchor = float(bass_anchor_scores[T])

        # 5. Low-freq anchor: T's energy share in 40-300 Hz
        s_low_freq = float(low_freq_scores[T])

        # 6. Duration: energy-weighted sustained presence in top-3
        s_duration = float(weighted_presence[T]) / total_rms

        # 7. Local stability: fraction of windows where T is a top-2 KS candidate
        if n_win > 0:
            top2_wins = int(np.sum(
                np.argsort(ks_win[:, :n_win], axis=0)[-2:, :] == T
            ))
            s_stability = top2_wins / n_win
        else:
            s_stability = 0.0

        # 8. Relative major/minor penalty
        pen_relative = relative_major_minor_penalty(T, ks_tonic_pc, ks_mode, ks_corr)

        # 9. Chromatic conflict: out-of-key fraction of active pitch classes
        # Find the best-fitting key interval set for T
        best_ivs = max(
            [([0,2,4,5,7,9,11], _MAJOR_PROFILE),
             ([0,2,3,5,7,8,10], _MINOR_PROFILE),
             ([0,2,3,5,7,8,11], _HARM_MINOR)],
            key=lambda x: float(np.corrcoef(global_hist, np.roll(x[1], T))[0, 1])
        )[0]
        key_pcs = {(T + iv) % 12 for iv in best_ivs}
        active_pcs = [i for i in range(12) if global_hist[i] > 0]
        pen_chromatic = (
            sum(1 for pc in active_pcs if pc not in key_pcs) / len(active_pcs)
            if active_pcs else 0.0
        )

        # ── Total score ───────────────────────────────────────────────────
        total_score = (
            weights['key_fit']           * s_key_fit
          + weights['resolution']        * s_resolution
          + weights['phrase_end']        * s_phrase_end
          + weights['bass_anchor']       * s_bass_anchor
          + weights['low_freq_anchor']   * s_low_freq
          + weights['duration']          * s_duration
          + weights['local_stability']   * s_stability
          - weights['relative_major_penalty'] * pen_relative
          - weights['chromatic_conflict']     * pen_chromatic
        )

        scores[NOTE_NAMES[T]] = {
            'total_score':                round(float(total_score), 4),
            'key_fit_score':              round(s_key_fit, 4),
            'resolution_score':           round(s_resolution, 4),
            'phrase_end_score':           round(s_phrase_end, 4),
            'bass_anchor_score':          round(s_bass_anchor, 4),
            'low_freq_anchor_score':      round(s_low_freq, 4),
            'duration_score':             round(s_duration, 4),
            'local_stability_score':      round(s_stability, 4),
            'relative_major_penalty':     round(pen_relative, 4),
            'chromatic_conflict_penalty': round(pen_chromatic, 4),
        }

    # ── Rank candidates ────────────────────────────────────────────────────
    ranked = sorted(scores.items(), key=lambda x: x[1]['total_score'], reverse=True)
    best_tonic   = ranked[0][0]
    best_score   = ranked[0][1]['total_score']
    second_score = ranked[1][1]['total_score'] if len(ranked) > 1 else 0.0
    margin       = round(best_score - second_score, 4)

    if _TONIC_DEBUG:
        print(f"\n[TONIC DEBUG] KS initial: {ks_tonic} {ks_mode} (corr={ks_corr:.3f})")
        print(f"  {'NOTE':4s}  {'TOTAL':6s}  kf     res    end    bass   lf     dur    stab   rel_p  chr_p")
        for name, sc in ranked[:5]:
            print(
                f"  {name:4s}  {sc['total_score']:6.4f}  "
                f"{sc['key_fit_score']:.3f}  "
                f"{sc['resolution_score']:.3f}  "
                f"{sc['phrase_end_score']:.3f}  "
                f"{sc['bass_anchor_score']:.3f}  "
                f"{sc['low_freq_anchor_score']:.3f}  "
                f"{sc['duration_score']:.3f}  "
                f"{sc['local_stability_score']:.3f}  "
                f"{sc['relative_major_penalty']:.3f}  "
                f"{sc['chromatic_conflict_penalty']:.3f}"
            )

    return best_tonic, margin, scores


def _compute_harmonic_root_scores(
    chroma: np.ndarray,
    y: np.ndarray,
    sr: int,
    hop: int,
    tonic_pc: int,
    key_confidence: float,
    tonic_margin: float,
    ks_mode: str,
    ks_corr: float,
    rel_penalty_applied: bool,
    bass_pc_counts: 'np.ndarray | None' = None,
    weights: 'dict | None' = None,
) -> 'tuple[str, float, dict]':
    """
    Multi-signal harmonic root scoring.

    The key difference from _compute_tonic_scores is that tonic_alignment is
    the dominant signal (weight 0.40).  The tonic scorer already resolved
    relative-key ambiguity; this function respects that result instead of
    re-deriving a root purely from frequency counts.

    Signals (all normalised [0, 1]):
      tonic_alignment    — reward for agreeing with tonality.tonic, scaled by
                           key_confidence and tonic_margin
      key_fit            — best KS correlation for H on the global chroma histogram
      phrase_end         — KS fitness of H in the track's final 15 %
      resolution         — V→H and leading-tone→H cadential arrivals
      section_consistency— fraction of equal-length sections where H is top-2 KS
      low_freq_support   — H's energy share in the 40–300 Hz band
      bass_support       — fraction of bass CQT frames dominated by H

    Penalties (subtracted):
      relative_major_penalty — relative-key confusion (amplified if already applied
                                in tonic scoring)
      chromatic_penalty      — out-of-key pitch conflict for H

    Returns:
        (best_root_name, best_root_score, {note: score_breakdown_dict})
    """
    if weights is None:
        weights = _HARMONIC_ROOT_WEIGHTS

    n_frames  = chroma.shape[1]
    _PROFILES = [_MAJOR_PROFILE, _MINOR_PROFILE, _HARM_MINOR]

    def _best_ks(hist: np.ndarray, T: int) -> float:
        return max(
            float(np.corrcoef(hist, np.roll(p, T))[0, 1])
            for p in _PROFILES
        )

    # ── Global histogram (top-3 frame counting, 15 % threshold) ───────────
    global_hist = np.zeros(12)
    for t in range(n_frames):
        global_hist[np.argsort(chroma[:, t])[-3:]] += 1.0
    if global_hist.sum() > 0:
        global_hist /= global_hist.sum()
    global_hist[global_hist < global_hist.max() * 0.15] = 0.0
    if global_hist.sum() > 0:
        global_hist /= global_hist.sum()

    frame_roots = np.argmax(chroma, axis=0)

    # ── Ending histogram (phrase_end signal) ───────────────────────────────
    duration_sec   = n_frames * hop / sr
    ending_sec     = float(np.clip(duration_sec * 0.15, 5.0, 20.0))
    ending_frames  = max(1, int(ending_sec * sr / hop))
    end_hist       = np.zeros(12)
    for t in range(max(0, n_frames - ending_frames), n_frames):
        end_hist[np.argsort(chroma[:, t])[-3:]] += 1.0
    if end_hist.sum() > 0:
        end_hist /= end_hist.sum()

    # ── Section KS matrix (section_consistency signal) ────────────────────
    n_sections  = 6
    win_size    = max(1, n_frames // n_sections)
    section_ks  = np.zeros((12, n_sections))
    for w in range(n_sections):
        s, e = w * win_size, min((w + 1) * win_size, n_frames)
        if e <= s:
            continue
        wh = np.zeros(12)
        for t in range(s, e):
            wh[np.argsort(chroma[:, t])[-3:]] += 1.0
        if wh.sum() > 0:
            wh /= wh.sum()
        for T in range(12):
            section_ks[T, w] = _best_ks(wh, T)

    # ── Bass support (re-use pre-computed counts if provided) ──────────────
    if bass_pc_counts is None:
        try:
            fmin    = librosa.note_to_hz('C1')
            C_bass  = np.abs(librosa.cqt(y, sr=sr, fmin=fmin,
                                         n_bins=36, bins_per_octave=12))
            bass_pc_counts = np.zeros(12)
            for t in range(C_bass.shape[1]):
                bass_pc_counts[int(np.argmax(C_bass[:, t])) % 12] += 1.0
        except Exception:
            bass_pc_counts = np.ones(12)
    bass_support_scores = bass_pc_counts / (bass_pc_counts.sum() + 1e-10)

    # ── Low-frequency STFT energy (low_freq_support) ──────────────────────
    S        = np.abs(librosa.stft(y, hop_length=hop)) ** 2
    freqs_hz = librosa.fft_frequencies(sr=sr)
    low_mask = (freqs_hz >= 40) & (freqs_hz <= 300)
    low_pc_energy = np.zeros(12)
    if low_mask.any():
        low_e = S[low_mask, :].sum(axis=1)
        for i, f in enumerate(freqs_hz[low_mask]):
            if f > 0:
                pc = int(round(69.0 + 12.0 * np.log2(f / 440.0))) % 12
                low_pc_energy[pc] += float(low_e[i])
    low_freq_scores = low_pc_energy / (low_pc_energy.sum() + 1e-10)

    # ── Pre-compute tonic alignment factors ───────────────────────────────
    # conf_norm and margin_factor scale how strongly we lean on tonic_pc.
    conf_norm     = key_confidence / 100.0             # [0, 1]
    margin_factor = min(1.0, tonic_margin / 0.15)      # saturates at margin ≥ 0.15

    # Key membership set for the detected tonic/mode (partial alignment reward)
    if ks_mode in ('minor', 'harmonic minor'):
        _tonic_key_ivs = [0, 2, 3, 5, 7, 8, 10]
    else:
        _tonic_key_ivs = [0, 2, 4, 5, 7, 9, 11]
    tonic_key_pcs = {(tonic_pc + iv) % 12 for iv in _tonic_key_ivs}

    # ── Per-candidate scoring loop ─────────────────────────────────────────
    scores: dict[str, dict] = {}

    for T in range(12):

        # 1. Tonic alignment
        # Full credit if H == tonic_pc, scaled by confidence and margin.
        # Small partial credit for tonic-key members; zero for out-of-key.
        if T == tonic_pc:
            # Ranges from 0.5 (zero confidence/margin) to 1.0 (perfect)
            s_tonic_align = 0.5 + 0.5 * conf_norm * margin_factor
        elif T in tonic_key_pcs:
            # In-key but not the tonic: small reward that shrinks as confidence grows
            # (high confidence → we trust the tonic, so key members matter less)
            s_tonic_align = 0.10 * (1.0 - conf_norm * 0.7)
        else:
            s_tonic_align = 0.0

        # 2. Key fit: best KS correlation for H on global histogram
        s_key_fit = max(0.0, (_best_ks(global_hist, T) + 0.5) / 1.5)

        # 3. Phrase end: KS fitness in ending section
        s_phrase_end = (
            max(0.0, (_best_ks(end_hist, T) + 0.5) / 1.5)
            if end_hist.sum() > 0 else 0.0
        )

        # 4. Resolution: V→H or leading-tone→H cadential arrivals
        dom_pc  = (T + 7) % 12
        lead_pc = (T + 11) % 12
        arrivals  = int(np.sum(frame_roots[1:] == T))
        resolving = int(np.sum(
            (frame_roots[1:] == T) & np.isin(frame_roots[:-1], [dom_pc, lead_pc])
        ))
        s_resolution = resolving / arrivals if arrivals > 0 else 0.0

        # 5. Section consistency: fraction of sections where H is top-2 KS
        top2_secs = int(np.sum(
            np.argsort(section_ks, axis=0)[-2:, :] == T
        ))
        s_section = top2_secs / max(1, n_sections)

        # 6. Low-freq support
        s_low_freq = float(low_freq_scores[T])

        # 7. Bass support
        s_bass = float(bass_support_scores[T])

        # 8. Relative major/minor penalty
        # Amplify if tonic scoring already applied this penalty — the evidence
        # for the tonic is even stronger in that case.
        pen_relative = relative_major_minor_penalty(T, tonic_pc, ks_mode, ks_corr)
        if rel_penalty_applied and pen_relative > 0:
            pen_relative = min(1.0, pen_relative * 1.3)

        # 9. Chromatic conflict: out-of-key pitch fraction for H
        best_ivs = max(
            [([0, 2, 4, 5, 7, 9, 11], _MAJOR_PROFILE),
             ([0, 2, 3, 5, 7, 8, 10], _MINOR_PROFILE),
             ([0, 2, 3, 5, 7, 8, 11], _HARM_MINOR)],
            key=lambda x: float(np.corrcoef(global_hist, np.roll(x[1], T))[0, 1])
        )[0]
        key_pcs_h = {(T + iv) % 12 for iv in best_ivs}
        active_pcs = [i for i in range(12) if global_hist[i] > 0]
        pen_chromatic = (
            sum(1 for pc in active_pcs if pc not in key_pcs_h) / len(active_pcs)
            if active_pcs else 0.0
        )

        total_score = (
            weights['tonic_alignment']        * s_tonic_align
          + weights['key_fit']                * s_key_fit
          + weights['phrase_end']             * s_phrase_end
          + weights['resolution']             * s_resolution
          + weights['section_consistency']    * s_section
          + weights['low_freq_support']       * s_low_freq
          + weights['bass_support']           * s_bass
          - weights['relative_major_penalty'] * pen_relative
          - weights['chromatic_penalty']      * pen_chromatic
        )

        scores[NOTE_NAMES[T]] = {
            'total_score':                        round(float(total_score), 4),
            'tonic_alignment_score':              round(s_tonic_align, 4),
            'harmonic_key_fit_score':             round(s_key_fit, 4),
            'harmonic_phrase_end_score':          round(s_phrase_end, 4),
            'harmonic_resolution_score':          round(s_resolution, 4),
            'harmonic_section_consistency_score': round(s_section, 4),
            'harmonic_low_freq_support_score':    round(s_low_freq, 4),
            'harmonic_bass_support_score':        round(s_bass, 4),
            'harmonic_relative_major_penalty':    round(pen_relative, 4),
            'harmonic_chromatic_penalty':         round(pen_chromatic, 4),
        }

    ranked   = sorted(scores.items(), key=lambda x: x[1]['total_score'], reverse=True)
    raw_best = ranked[0][0]

    if _HARMONIC_ROOT_DEBUG:
        print(f"\n[HARM ROOT DEBUG] tonic={NOTE_NAMES[tonic_pc]} conf={key_confidence:.1f}% "
              f"margin={tonic_margin:.3f} mode={ks_mode}")
        print(f"  {'NOTE':4s}  {'TOTAL':6s}  talign kfit   end    res    sec    lf     bass   relp   chrp")
        for name, sc in ranked[:5]:
            print(
                f"  {name:4s}  {sc['total_score']:6.4f}  "
                f"{sc['tonic_alignment_score']:.3f}  "
                f"{sc['harmonic_key_fit_score']:.3f}  "
                f"{sc['harmonic_phrase_end_score']:.3f}  "
                f"{sc['harmonic_resolution_score']:.3f}  "
                f"{sc['harmonic_section_consistency_score']:.3f}  "
                f"{sc['harmonic_low_freq_support_score']:.3f}  "
                f"{sc['harmonic_bass_support_score']:.3f}  "
                f"{sc['harmonic_relative_major_penalty']:.3f}  "
                f"{sc['harmonic_chromatic_penalty']:.3f}"
            )

    return raw_best, scores[raw_best]['total_score'], scores


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

    # Pass tonality context so _analyze_harmonic can apply consistency rules.
    _ton = result.get('tonality', {})
    _run('harmonic',  _analyze_harmonic,        y_mono, sr, tonic_pc,
         _ton.get('key_confidence', 0.0),
         _ton.get('tonic_margin', 0.0),
         _ton.get('mode', 'major'),
         _ton.get('correlation', 0.5),
         _ton.get('relative_key_penalty_applied', False))

    _run('bass',      _analyze_bass,            y_mono, sr, tonic_pc)
    _run('structure', _analyze_structure,       y_mono, sr)
    _run('optional',  _analyze_optional,        y_mono, sr)

    # ── Interpretive labels (require both harmonic and bass results) ──────────
    _harm = result.get('harmonic', {})
    _bass = result.get('bass', {})
    _ton  = result.get('tonality', {})
    if not isinstance(_harm, dict) or 'error' in _harm:
        pass
    else:
        labels: list[str] = []

        # Floating tonic: tonic is harmonically clear but bass rarely anchors it
        root_bass_pct  = float(_bass.get('root_bass_pct', 100.0)) if isinstance(_bass, dict) else 100.0
        tonic_score    = float(_ton.get('tonic_score', 0.0))      if isinstance(_ton,  dict) else 0.0
        if root_bass_pct < 30.0 and tonic_score > 0.5:
            labels.append('Floating tonic (ambient/modal)')

        # Relative-major bass anchoring: bass gravitates to the relative major
        # root of a minor key rather than the tonic itself.
        mode = _ton.get('mode', '') if isinstance(_ton, dict) else ''
        dom_bass = _harm.get('dominant_bass_pitch_class')
        if 'minor' in mode and dom_bass:
            rel_major_pc   = (tonic_pc + 3) % 12   # minor → relative major is +3 semitones
            rel_major_name = NOTE_NAMES[rel_major_pc]
            if dom_bass == rel_major_name:
                labels.append('Relative-major bass anchoring')

        if labels:
            _harm['interpretive_labels'] = labels

    return result


# ── Section analyzers ─────────────────────────────────────────────────────────

def _analyze_tonality(y: np.ndarray, sr: int) -> dict:
    hop_length = 512
    y_harm = librosa.effects.harmonic(y)
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop_length)

    # Global pitch-class histogram via top-3 frame counting.
    # Counting top-N active pitch classes per frame avoids the spectral leakage
    # of averaging raw chroma energy (which fills all 12 bins).
    hist = np.zeros(12)
    for t in range(chroma.shape[1]):
        hist[np.argsort(chroma[:, t])[-3:]] += 1.0
    if hist.sum() > 0:
        hist /= hist.sum()
    # Zero out pitch classes below 15% of the peak to suppress residual leakage
    hist[hist < hist.max() * 0.15] = 0.0
    if hist.sum() > 0:
        hist /= hist.sum()

    # Step 1: KS correlation gives an initial tonic/mode estimate
    ks_tonic, ks_mode, ks_corr = _ks_correlate(hist)

    # Step 2: Multi-signal scoring refines the tonic, handling relative-key ambiguity
    best_tonic, tonic_margin, candidate_scores = _compute_tonic_scores(
        chroma=chroma,
        y=y,
        sr=sr,
        hop_length=hop_length,
        global_hist=hist,
        ks_tonic=ks_tonic,
        ks_mode=ks_mode,
        ks_corr=ks_corr,
    )

    # If the multi-signal scorer chose a different tonic, re-run KS with the
    # new tonic fixed to find the most appropriate mode for it.
    if best_tonic != ks_tonic:
        T_pc = NOTE_NAMES.index(best_tonic)
        # Find best mode for the new tonic
        best_mode_r = -np.inf
        final_mode  = ks_mode
        for profile, mode in [(_MAJOR_PROFILE, 'major'),
                               (_MINOR_PROFILE, 'minor'),
                               (_HARM_MINOR,    'harmonic minor')]:
            r = float(np.corrcoef(hist, np.roll(profile, T_pc))[0, 1])
            if r > best_mode_r:
                best_mode_r, final_mode = r, mode
        final_corr = best_mode_r
    else:
        final_mode = ks_mode
        final_corr = ks_corr

    tonic_pc = NOTE_NAMES.index(best_tonic)
    flavor   = _modal_flavor(hist, tonic_pc)
    # NOTE: key_confidence is expressed as a PERCENTAGE (0–100), unlike the
    # 0–1 range used by beat_grid_confidence and other *_confidence fields.
    # The frontend displays it directly as `${key_confidence}%`.
    confidence = round(max(0.0, min(1.0, (final_corr + 0.3) / 1.3)) * 100, 1)

    # Relative key for disambiguation transparency
    if final_mode in ('minor', 'harmonic minor'):
        relative_key_pc   = (tonic_pc + 3) % 12
        relative_key_name = f"{NOTE_NAMES[relative_key_pc]} major"
    else:
        relative_key_pc   = (tonic_pc + 9) % 12
        relative_key_name = f"{NOTE_NAMES[relative_key_pc]} minor"

    rel_penalty_applied = (
        candidate_scores.get(NOTE_NAMES[relative_key_pc], {}).get('relative_major_penalty', 0.0) > 0.05
    )

    # Top candidates for display (sorted by total score)
    top_candidates = dict(
        sorted(candidate_scores.items(), key=lambda x: x[1]['total_score'], reverse=True)[:5]
    )

    return {
        'tonic':                         best_tonic,
        'mode':                          final_mode,
        'modal_flavor':                  flavor,
        'key':                           f"{best_tonic} {final_mode}",
        'key_confidence':                confidence,
        'correlation':                   round(final_corr, 4),
        'tonic_score':                   candidate_scores[best_tonic]['total_score'],
        'tonic_margin':                  tonic_margin,
        'relative_key_candidate':        relative_key_name,
        'relative_key_penalty_applied':  rel_penalty_applied,
        'candidate_tonics':              top_candidates,
        'pitch_class_histogram':         {NOTE_NAMES[i]: round(float(hist[i]), 4) for i in range(12)},
    }


# ── BPM helper functions (all numba-free) ─────────────────────────────────────

def _bpm_tempogram_candidates(
    onset_env: np.ndarray, sr: int, hop: int, n: int = 8
) -> list:
    """
    Extract the top N tempo candidates from the averaged Fourier tempogram.

    Returns list of (bpm, normalised_strength) tuples sorted by strength
    descending.  All values in [_BPM_HARD_MIN, _BPM_HARD_MAX].

    Uses only librosa.feature.tempogram / tempo_frequencies / util.localmax —
    none of which require numba.
    """
    try:
        # win_length: cap at half the onset envelope to avoid size errors
        win_length = min(384, max(64, len(onset_env) // 2))
        tg  = librosa.feature.tempogram(
            onset_envelope=onset_env, sr=sr, hop_length=hop,
            win_length=win_length, window='hann',
        )
        avg_tg = np.mean(np.abs(tg), axis=1)
        bpm_ax = librosa.tempo_frequencies(len(avg_tg), sr=sr, hop_length=hop)
    except Exception:
        # Bare autocorrelation fallback (pure numpy)
        oe = onset_env - onset_env.mean()
        fft_n = int(2 ** np.ceil(np.log2(2 * len(oe))))
        F     = np.fft.rfft(oe, n=fft_n)
        ac    = np.fft.irfft(F * np.conj(F))[:len(oe)]
        ac    = ac / (ac[0] + 1e-10)
        min_k = max(1, int(sr * 60 / (hop * _BPM_HARD_MAX)))
        max_k = min(len(ac) - 1, int(sr * 60 / (hop * _BPM_HARD_MIN)))
        if min_k >= max_k:
            return [(120.0, 1.0)]
        lags   = np.arange(min_k, max_k + 1)
        bpm_ax = sr * 60.0 / (hop * lags.astype(float))
        avg_tg = ac[lags]

    # Restrict to hard BPM range
    valid = (bpm_ax >= _BPM_HARD_MIN) & (bpm_ax <= _BPM_HARD_MAX)
    bpm_ax, avg_tg = bpm_ax[valid], avg_tg[valid]
    if len(avg_tg) == 0:
        return [(120.0, 1.0)]

    # Mild Gaussian smooth before peak picking to suppress noisy micro-peaks
    sigma = max(1, len(avg_tg) // 80)
    k     = max(1, int(3 * sigma))
    kern  = np.exp(-0.5 * (np.arange(-k, k + 1) / sigma) ** 2)
    kern /= kern.sum()
    smoothed = np.convolve(avg_tg, kern, mode='same')

    peaks = librosa.util.localmax(smoothed)
    if not peaks.any():
        idx = int(np.argmax(smoothed))
        return [(float(bpm_ax[idx]), 1.0)]

    peak_bpms   = bpm_ax[peaks]
    peak_scores = smoothed[peaks]
    order       = np.argsort(peak_scores)[::-1][:n]
    candidates  = [(float(peak_bpms[i]), float(peak_scores[i])) for i in order]

    max_s = max(s for _, s in candidates)
    return [(t, s / max_s if max_s > 0 else 1.0) for t, s in candidates]


def _bpm_expand_candidates(candidates: list) -> list:
    """
    For each seed tempo T add T/2 (half-time) and T*2 (double-time) variants.

    Half/double variants inherit 70% of the seed's strength — enough to
    compete with genuine alternatives but not enough to overwhelm a true
    direct match.  Deduplication within 2% prevents near-duplicate entries.
    """
    pool: list[tuple[float, float]] = []
    for bpm, score in candidates:
        for mult, scale in [(1.0, 1.0), (0.5, 0.70), (2.0, 0.70)]:
            variant = bpm * mult
            if not (_BPM_HARD_MIN <= variant <= _BPM_HARD_MAX):
                continue
            dup = any(
                abs(ex - variant) / max(ex, variant) < 0.02
                for ex, _ in pool
            )
            if not dup:
                pool.append((variant, score * scale))
    return pool


def _bpm_consistency_score(
    T_bpm: float, onset_env: np.ndarray, sr: int, hop: int, n_windows: int = 8
) -> float:
    """
    Fraction of time windows where the local dominant tempo is within 8% of T
    (or T/2 or T*2 — the score rewards any musically equivalent tempo).

    A high score means the track consistently suggests this tempo throughout,
    not just in one section.
    """
    n    = len(onset_env)
    win  = max(32, n // n_windows)
    hits, valid = 0, 0

    for i in range(n_windows):
        s, e = i * win, min((i + 1) * win, n)
        if e - s < 32:
            continue
        valid += 1
        wenv = onset_env[s:e]
        try:
            wl   = min(256, max(32, (e - s) // 2))
            tg   = librosa.feature.tempogram(
                onset_envelope=wenv, sr=sr, hop_length=hop,
                win_length=wl, window='hann',
            )
            avg  = np.mean(np.abs(tg), axis=1)
            bax  = librosa.tempo_frequencies(len(avg), sr=sr, hop_length=hop)
            vm   = (bax >= _BPM_HARD_MIN) & (bax <= _BPM_HARD_MAX)
            if not vm.any():
                continue
            local = float(bax[vm][np.argmax(avg[vm])])
        except Exception:
            continue

        for mult in (1.0, 0.5, 2.0):
            if abs(local - T_bpm * mult) / T_bpm < 0.08:
                hits += 1
                break

    return hits / max(1, valid)


def _bpm_low_freq_pulse_score(
    T_bpm: float, low_env: np.ndarray, sr: int, hop: int
) -> float:
    """
    Autocorrelation peak strength of the 20–250 Hz amplitude envelope at the
    lag corresponding to one beat (and at 2× and 4× the beat period to also
    capture half-note and whole-note pulsations).

    For ambient / pad-heavy material the rhythmic pulse often lives here even
    when there are no percussive transients.

    low_env must be pre-computed outside the scoring loop (STFT is expensive).
    """
    try:
        oe  = low_env - low_env.mean()
        n   = len(oe)
        if n < 4:
            return 0.5
        # FFT-based autocorrelation (O(n log n) vs O(n²) for np.correlate)
        fft_n = int(2 ** np.ceil(np.log2(2 * n)))
        F     = np.fft.rfft(oe, n=fft_n)
        ac    = np.fft.irfft(F * np.conj(F))[:n].real
        if ac[0] < 1e-12:
            return 0.5
        ac /= ac[0]

        beat_f = (60.0 / T_bpm) * sr / hop
        best   = 0.0
        # Check at 1, 2, and 4 beat periods
        for period_mult in (1.0, 2.0, 4.0):
            lag    = int(round(beat_f * period_mult))
            margin = max(1, int(lag * 0.08))
            lo, hi = max(1, lag - margin), min(n - 1, lag + margin)
            if lo < hi:
                peak = float(np.max(ac[lo : hi + 1]))
                best = max(best, peak)

        return max(0.0, min(1.0, (best + 1.0) / 2.0))
    except Exception:
        return 0.5


def _bpm_energy_alignment_score(
    T_bpm: float, rms_env: np.ndarray, sr: int, hop: int
) -> float:
    """
    Pearson correlation between the RMS energy envelope and a smooth beat-grid
    pulse at T_bpm.

    Uses a generous Gaussian (±20% of beat duration) so that the grid can
    match energy peaks that aren't precisely on the beat — common in ambient
    music where chord swells lead or trail the theoretical downbeat.
    """
    try:
        n       = len(rms_env)
        beat_f  = (60.0 / T_bpm) * sr / hop

        # Smooth impulse grid at beat positions
        grid    = np.zeros(n)
        b = beat_f
        while b < n:
            idx = int(round(b))
            if 0 <= idx < n:
                grid[idx] = 1.0
            b += beat_f

        sigma = max(1.0, beat_f * 0.20)
        k     = max(1, int(3 * sigma))
        kern  = np.exp(-0.5 * (np.arange(-k, k + 1) / sigma) ** 2)
        kern /= kern.sum()
        sg    = np.convolve(grid, kern, mode='same')

        if rms_env.std() < 1e-8 or sg.std() < 1e-8:
            return 0.5
        return max(0.0, float(np.corrcoef(rms_env, sg)[0, 1]) * 0.5 + 0.5)
    except Exception:
        return 0.5


def _bpm_onset_alignment_score(
    T_bpm: float, onset_env: np.ndarray, sr: int, hop: int
) -> float:
    """
    Pearson correlation between the onset strength envelope and a tight
    beat-grid impulse at T_bpm (σ = ±5% of beat duration).

    This signal is reliable for rhythmically dense material; for ambient
    tracks it should carry lower weight (see _BPM_AMBIENT_SCALE).
    """
    try:
        n      = len(onset_env)
        beat_f = (60.0 / T_bpm) * sr / hop

        grid   = np.zeros(n)
        b = beat_f
        while b < n:
            idx = int(round(b))
            if 0 <= idx < n:
                grid[idx] = 1.0
            b += beat_f

        sigma = max(1.0, beat_f * 0.05)
        k     = max(1, int(3 * sigma))
        kern  = np.exp(-0.5 * (np.arange(-k, k + 1) / sigma) ** 2)
        kern /= kern.sum()
        sg    = np.convolve(grid, kern, mode='same')

        if onset_env.std() < 1e-8 or sg.std() < 1e-8:
            return 0.5
        return max(0.0, float(np.corrcoef(onset_env, sg)[0, 1]) * 0.5 + 0.5)
    except Exception:
        return 0.5


def _bpm_density_penalty(T_bpm: float) -> float:
    """
    Penalise tempos that imply more than 3 beats/second (≥ 180 BPM).

    Most music we care about sits below this threshold.  Penalising dense
    candidates nudges the scorer away from double-time errors.
    """
    bps = T_bpm / 60.0
    if bps <= 3.0:
        return 0.0
    return min(1.0, (bps - 3.0) / 3.0)


def _bpm_extreme_penalty(T_bpm: float) -> float:
    """Linear penalty for tempos outside [_BPM_PREFERRED_MIN, _BPM_PREFERRED_MAX]."""
    if _BPM_PREFERRED_MIN <= T_bpm <= _BPM_PREFERRED_MAX:
        return 0.0
    if T_bpm < _BPM_PREFERRED_MIN:
        return min(1.0, (_BPM_PREFERRED_MIN - T_bpm) / _BPM_PREFERRED_MIN)
    return min(1.0, (T_bpm - _BPM_PREFERRED_MAX) / _BPM_PREFERRED_MAX)


def _bpm_ambient_score(
    onset_env:  np.ndarray,
    y:          np.ndarray,
    sr:         int,
    S_power:    np.ndarray | None = None,  # |STFT|² shape (n_fft_bins, n_frames)
    freqs:      np.ndarray | None = None,  # FFT bin frequencies (Hz)
    rms_env:    np.ndarray | None = None,  # per-frame RMS
) -> tuple[bool, float, dict]:
    """
    Multi-signal ambient classification.  Returns (is_ambient, score, subscores).

    Seven signals replace the old three-condition AND rule, which failed on
    arpeggiated / pad-heavy tracks that still have moderate onset density.

    Signal definitions
    ------------------
    high_freq_suppression   High-frequency (2k–10k Hz) energy is unusually low.
    air_suppression         Air band (10k+ Hz) is essentially absent.
    sustain_bias            Onset envelope is flat / uniform — no sharp peaks.
    low_mid_bias            Power concentrated in sub + low + mid bands.
    dynamic_softness        RMS envelope is smooth; mean is close to max.
    downbeat_weakness       No dominant accent peaks in the onset envelope.
    transient_penalty       (subtracted) High onset rate → clearly percussive.

    Note: transient density alone does NOT disqualify a track.  Arpeggiated
    pads can produce many soft onsets while remaining ambient in character.
    """
    subscores: dict[str, float] = {}
    duration_sec = max(1.0, len(y) / sr)

    # ── 1. High-frequency suppression (2k–10k Hz) ─────────────────────────
    try:
        if S_power is not None and freqs is not None:
            total_pwr  = float(S_power.sum()) + 1e-10
            hf_mask    = (freqs >= 2000) & (freqs <= 10000)
            hf_pct     = float(S_power[hf_mask, :].sum()) / total_pwr if hf_mask.any() else 0.05
        else:
            hf_pct = 0.05  # neutral fallback
        # Score → 1.0 when hf_pct ≤ 3%; → 0.0 when hf_pct ≥ 20%
        subscores['high_freq_suppression_score'] = round(
            float(np.clip((0.20 - hf_pct) / 0.17, 0.0, 1.0)), 4)
    except Exception:
        subscores['high_freq_suppression_score'] = 0.5

    # ── 2. Air band suppression (10k+ Hz) ─────────────────────────────────
    try:
        if S_power is not None and freqs is not None:
            air_mask   = freqs >= 10000
            air_pct    = float(S_power[air_mask, :].sum()) / total_pwr if air_mask.any() else 0.02
        else:
            air_pct = 0.02
        # Score → 1.0 when air_pct ≤ 1%; → 0.0 when air_pct ≥ 10%
        subscores['air_suppression_score'] = round(
            float(np.clip((0.10 - air_pct) / 0.09, 0.0, 1.0)), 4)
    except Exception:
        subscores['air_suppression_score'] = 0.5

    # ── 3. Sustain bias — legato / pad material vs articulated transients ────
    # Blend of four sub-signals so no single outlier (e.g. one loud peak in
    # onset_env) can collapse the score to zero.
    #
    # Sub-signals (all [0, 1], higher = more sustained):
    #   onset_flatness  — mean / p95(onset_env); p95 is robust to isolated spikes
    #   inv_flux        — low spectral frame-to-frame change → sustained texture
    #   inv_hf          — already captures pad-like spectral thinness (reuse)
    #   inv_air         — reinforces pad character at the top of the spectrum
    try:
        p95_oe = float(np.percentile(onset_env, 95)) if len(onset_env) > 0 else 1.0
        onset_flatness = float(np.mean(onset_env)) / (p95_oe + 1e-10)
        # map 0 → 0.05 (spiky), 1 → 0.45 (flat/uniform)
        flat_score = float(np.clip((onset_flatness - 0.05) / 0.40, 0.0, 1.0))

        if S_power is not None:
            # Spectral flux: mean |ΔS^0.5| normalised by mean |S^0.5|
            sq_S   = np.sqrt(S_power + 1e-10)
            flux   = float(np.mean(np.abs(np.diff(sq_S, axis=1)))) / (float(np.mean(sq_S)) + 1e-10)
            inv_flux = float(np.clip(1.0 - flux / 0.50, 0.0, 1.0))
        else:
            inv_flux = 0.5

        # Borrow already-computed spectral subscores (available at this point)
        inv_hf  = subscores['high_freq_suppression_score']
        inv_air = subscores['air_suppression_score']

        subscores['sustain_bias_score'] = round(float(np.clip(
            0.30 * flat_score
          + 0.25 * inv_flux
          + 0.25 * inv_hf
          + 0.20 * inv_air,
            0.0, 1.0
        )), 4)
    except Exception:
        subscores['sustain_bias_score'] = 0.5

    # ── 4. Low/mid energy bias (sub + low + mid dominate over HF) ─────────
    try:
        if S_power is not None and freqs is not None:
            lm_mask    = (freqs >= 20) & (freqs <= 2000)
            lm_pct     = float(S_power[lm_mask, :].sum()) / total_pwr if lm_mask.any() else 0.8
        else:
            lm_pct = 0.8
        # Score → 1.0 when lm_pct ≥ 95%; → 0.0 when lm_pct ≤ 60%
        subscores['low_mid_bias_score'] = round(
            float(np.clip((lm_pct - 0.60) / 0.35, 0.0, 1.0)), 4)
    except Exception:
        subscores['low_mid_bias_score'] = 0.5

    # ── 5. Dynamic softness — RMS envelope is smooth, not punchy ──────────
    try:
        if rms_env is not None and len(rms_env) > 0:
            rms_crest = float(np.mean(rms_env)) / (float(np.max(rms_env)) + 1e-10)
        elif len(y) > 0:
            # Fallback: coarse RMS from waveform chunks
            chunk = max(1, len(y) // 16)
            rms_chunks = [float(np.sqrt(np.mean(y[i:i+chunk].astype(np.float64)**2)))
                          for i in range(0, len(y) - chunk, chunk)]
            rms_crest  = (float(np.mean(rms_chunks)) /
                          (float(np.max(rms_chunks)) + 1e-10)) if rms_chunks else 0.3
        else:
            rms_crest = 0.3
        # Score → 1.0 when rms_crest ≥ 0.6; → 0.0 when rms_crest ≤ 0.10
        subscores['dynamic_softness_score'] = round(
            float(np.clip((rms_crest - 0.10) / 0.50, 0.0, 1.0)), 4)
    except Exception:
        subscores['dynamic_softness_score'] = 0.3

    # ── 6. Downbeat weakness — soft "1" accent relative to the overall level ─
    # Uses p95 / mean instead of max / mean to avoid a single loud moment
    # (e.g. one bright cymbal swell) falsely signalling strong accent activity.
    # p95 ≈ the "typical loud frame"; max is too sensitive to outliers.
    # Ambient tracks: p95 ≈ 2–3× mean → ratio 2–3 → score ≈ 0.75–0.88
    # Percussive tracks: p95 ≈ 6–8× mean → ratio 6–8 → score ≈ 0.25–0.50
    try:
        if len(onset_env) > 0:
            p95_dw    = float(np.percentile(onset_env, 95))
            peak_ratio = p95_dw / (float(np.mean(onset_env)) + 1e-10)
        else:
            peak_ratio = 4.0
        # ratio ≈ 1 → completely flat, no accents → score = 1.0
        # ratio ≥ 9 → very prominent accent peaks → score → 0.0
        subscores['downbeat_weakness_score'] = round(
            float(np.clip(1.0 - (peak_ratio - 1.0) / 8.0, 0.0, 1.0)), 4)
    except Exception:
        subscores['downbeat_weakness_score'] = 0.5

    # ── 7. Transient density — clearly percussive onset density ───────────
    # Kept at low weight (0.20): arpeggiated pads can still have moderate
    # onset rates without being genuinely percussive in character.
    try:
        onsets     = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        onset_rate = len(onsets) / duration_sec
        # Penalty → 1.0 when rate ≥ 6 onsets/sec; → 0.0 when rate ≤ 1/sec
        subscores['transient_density_score'] = round(
            float(np.clip((onset_rate - 1.0) / 5.0, 0.0, 1.0)), 4)
    except Exception:
        subscores['transient_density_score'] = 0.3

    # ── Weighted ambient score ─────────────────────────────────────────────
    w = _AMBIENT_WEIGHTS
    ambient_score = (
        w['high_freq_suppression'] * subscores['high_freq_suppression_score']
      + w['air_suppression']        * subscores['air_suppression_score']
      + w['sustain_bias']           * subscores['sustain_bias_score']
      + w['low_mid_bias']           * subscores['low_mid_bias_score']
      + w['dynamic_softness']       * subscores['dynamic_softness_score']
      + w['downbeat_weakness']      * subscores['downbeat_weakness_score']
      - w['transient_density']       * subscores['transient_density_score']
    )
    ambient_score = round(float(np.clip(ambient_score, -0.20, 1.0)), 4)
    is_ambient    = ambient_score >= _AMBIENT_THRESHOLD

    if _BPM_DEBUG:
        print(f"\n[BPM DEBUG] ambient_score={ambient_score:.4f}  "
              f"is_ambient={is_ambient}")
        for k, v in subscores.items():
            print(f"  {k}: {v:.4f}")

    return is_ambient, ambient_score, subscores


def _bpm_bar_periodicity_score(
    T_bpm: float, env: np.ndarray, sr: int, hop: int, beats_per_bar: int = 4
) -> float:
    """
    FFT autocorrelation strength of `env` at the bar period
    (beats_per_bar × beat_period).  Returns [0, 1].

    A high score means the signal has energy that repeats periodically at
    bar-level spacing.  Works for both onset_env (rhythmic accent pattern)
    and low_env (low-frequency amplitude modulation at bar rate).
    """
    try:
        bar_sec    = beats_per_bar * 60.0 / T_bpm
        bar_frames = int(round(bar_sec * sr / hop))
        if bar_frames <= 0 or bar_frames >= len(env):
            return 0.0
        e = (env - env.mean()).astype(float)
        if float(np.max(np.abs(e))) < 1e-10:
            return 0.0
        fft_n  = int(2 ** np.ceil(np.log2(2 * len(e))))
        F      = np.fft.rfft(e, n=fft_n)
        ac     = np.fft.irfft(F * np.conj(F))[:len(e)]
        ac_norm = ac / (ac[0] + 1e-10)
        return float(np.clip(ac_norm[bar_frames], 0.0, 1.0))
    except Exception:
        return 0.0


def _bpm_onset_accent_score(
    T_bpm: float, onset_env: np.ndarray, sr: int, hop: int
) -> float:
    """
    Phase-folded accent score: measures whether beat 1 of a 4-beat bar is
    systematically stronger than beats 2–4.  Returns [0, 1].

    Returns 0.25 (neutral) when there are fewer than 8 beats — insufficient
    data to distinguish a real accent pattern from noise.

    Ambient tracks typically score 0.15–0.35 (weak downbeat emphasis).
    Drum-forward tracks typically score 0.50–0.90.
    """
    try:
        beat_frames = (60.0 / T_bpm) * sr / hop
        n_beats = int(len(onset_env) / beat_frames)
        if n_beats < 8:
            return 0.25
        buckets: list[list[float]] = [[] for _ in range(4)]
        for i in range(n_beats):
            pos = int(round(i * beat_frames))
            if pos < len(onset_env):
                buckets[i % 4].append(float(onset_env[pos]))
        means = [float(np.mean(v)) if v else 0.0 for v in buckets]
        if max(means) < 1e-10:
            return 0.25
        downbeat_mean = means[0]
        other_mean    = float(np.mean(means[1:])) + 1e-10
        # ratio > 1 → beat 1 accent present; map [0.5, 2.5] → [0, 1]
        ratio = downbeat_mean / other_mean
        return float(np.clip((ratio - 0.5) / 2.0, 0.0, 1.0))
    except Exception:
        return 0.25


def _bpm_group_by_ratio(
    scored: list[dict],
    ratios: list[float] | None = None,
    tolerance: float = 0.03,
) -> list[dict]:
    """
    Group tempo candidates that are harmonically related (×2 or ÷2).

    Candidates related by the given ratio factors (within ±tolerance) are
    collapsed into one group whose total_score is the sum of its members'
    scores.  This prevents double-time / half-time variants from splitting
    the evidence and artificially reducing confidence.

    Parameters
    ----------
    scored      : list of dicts with 'bpm' and 'score', sorted descending
    ratios      : multiplicative relationships to consider (default [2.0])
    tolerance   : fractional tolerance for ratio matching (default 3%)

    Returns
    -------
    list of group dicts sorted by group_score descending:
        group_id       – 1-based rank after sorting
        members        – [bpm, ...] sorted descending by score
        member_scores  – parallel score list
        total_score    – raw sum of member scores (informational)
        group_score    – rank-weighted mean (used for selection & confidence)
        best_candidate – bpm of highest-scoring member
    """
    if ratios is None:
        ratios = [2.0]

    remaining = [(c['bpm'], c['score']) for c in scored]
    groups: list[dict] = []

    while remaining:
        seed_bpm, seed_score = remaining.pop(0)
        members = [(seed_bpm, seed_score)]

        still_remaining: list[tuple[float, float]] = []
        for bpm, score in remaining:
            matched = False
            for m_bpm, _ in members:
                for r in ratios:
                    if (abs(bpm - m_bpm * r)  / (m_bpm * r  + 1e-10) <= tolerance or
                            abs(bpm - m_bpm / r) / (m_bpm / r + 1e-10) <= tolerance):
                        matched = True
                        break
                if matched:
                    break
            if matched:
                members.append((bpm, score))
            else:
                still_remaining.append((bpm, score))
        remaining = still_remaining

        members.sort(key=lambda x: x[1], reverse=True)

        # Rank-weighted mean: top score × 1.0, second × 0.9, rest × 0.25.
        # Prevents groups from gaining spurious dominance purely through
        # member count (e.g. [187.5, 93.8, 47.7] vs a clean single-member group).
        rw       = _GROUP_RANK_WEIGHTS
        m_scores = [s for _, s in members]
        weights  = [rw[min(i, len(rw) - 1)] for i in range(len(m_scores))]
        w_sum    = sum(weights)
        g_score  = sum(w * s for w, s in zip(weights, m_scores)) / (w_sum + 1e-10)

        groups.append({
            'group_id':       len(groups) + 1,
            'members':        [round(b, 1) for b, _ in members],
            'member_scores':  [round(s, 4) for _, s in members],
            'group_score':    round(float(g_score), 4),
            'best_candidate': round(members[0][0], 1),
        })

    groups.sort(key=lambda g: g['group_score'], reverse=True)
    for i, g in enumerate(groups):
        g['group_id'] = i + 1
    return groups


def _analyze_bpm(y: np.ndarray, sr: int) -> dict:
    """
    Multi-signal BPM estimator designed to work correctly on ambient,
    pad-heavy, and low-transient material as well as standard tracks.

    Pipeline
    --------
    Stage 1  Classify the track as ambient / sustained using seven spectral
             and timbral signals (_bpm_ambient_score).
    Stage 2  Extract up to _BPM_N_CANDIDATES peaks from the prior-free
             Fourier tempogram (no Gaussian start_bpm bias).
    Stage 3  Expand each peak with its ½× and 2× variants to surface the
             full set of musically valid tempo candidates.
    Stage 4  Score every candidate with five independent signals (tempogram
             strength, cross-window consistency, low-frequency pulse,
             energy alignment, onset alignment) minus two penalties
             (beat density, extreme-range).  Ambient tracks receive
             adjusted weights via _BPM_AMBIENT_SCALE.
    Stage 5  Cluster candidates by 2× harmonic ratio (_bpm_group_by_ratio).
             Confidence is the normalised score margin between the best
             and second group, so double-time variants reinforce rather
             than dilute confidence.
    Stage 6  Select the preferred BPM within the best group: in-range
             (50–160 BPM) first, then slowest-within-range for ambient
             tracks, highest-scoring-within-range otherwise.

    beat_count  = tempo_bpm × duration_seconds / 60  (not onset_detect,
                  which massively overcounts chord changes as 'beats').
    beat_grid_confidence  = stability + group dominance + low-freq pulse
                             + consistency (four independent signals).
    downbeat_confidence   = bar-period autocorrelation + phrase-period
                             autocorrelation + low-freq bar accent +
                             phase-folded onset accent.  Expected to be
                             low for ambient tracks even when the grid is
                             stable.
    """
    hop          = 512
    duration_sec = len(y) / sr

    # ── Pre-compute shared signals (once, shared across candidate loop) ────
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    except Exception:
        onset_env = np.zeros(max(1, int(duration_sec * sr / hop)))

    try:
        rms_env = librosa.feature.rms(y=y, hop_length=hop)[0].astype(float)
    except Exception:
        rms_env = np.array([0.0])

    S_power: np.ndarray | None = None
    freqs_arr: np.ndarray | None = None
    try:
        S_power   = np.abs(librosa.stft(y, hop_length=hop)) ** 2
        freqs_arr = librosa.fft_frequencies(sr=sr)
        lm        = (freqs_arr >= 20) & (freqs_arr <= 250)
        low_env   = S_power[lm, :].sum(axis=0).astype(float) if lm.any() else np.array([0.0])
    except Exception:
        low_env = np.array([0.0])

    # ── Ambient classification (multi-signal) ──────────────────────────────
    is_ambient, ambient_score, ambient_subscores = _bpm_ambient_score(
        onset_env, y, sr, S_power=S_power, freqs=freqs_arr, rms_env=rms_env
    )

    # ── Stage 1: tempogram candidates ─────────────────────────────────────
    raw_candidates = _bpm_tempogram_candidates(onset_env, sr, hop, n=_BPM_N_CANDIDATES)

    # ── Stage 2: expand with half/double variants ─────────────────────────
    all_candidates = _bpm_expand_candidates(raw_candidates)
    if not all_candidates:
        all_candidates = [(120.0, 1.0)]

    # ── Build effective weights (ambient adjustments) ──────────────────────
    w = {k: v for k, v in _BPM_WEIGHTS.items()}
    if is_ambient:
        for key, scale in _BPM_AMBIENT_SCALE.items():
            w[key] = w[key] * scale

    # ── Stage 3: score every candidate ────────────────────────────────────
    scored = []
    for T_bpm, seed_score in all_candidates:
        s_tg     = seed_score
        s_con    = _bpm_consistency_score(T_bpm, onset_env, sr, hop)
        s_lf     = _bpm_low_freq_pulse_score(T_bpm, low_env, sr, hop)
        s_en     = _bpm_energy_alignment_score(T_bpm, rms_env, sr, hop)
        s_on     = _bpm_onset_alignment_score(T_bpm, onset_env, sr, hop)
        pen_d    = _bpm_density_penalty(T_bpm)
        pen_e    = _bpm_extreme_penalty(T_bpm)

        total = (
            w['tempogram']       * s_tg
          + w['consistency']     * s_con
          + w['low_freq_pulse']  * s_lf
          + w['energy_alignment']* s_en
          + w['onset_alignment'] * s_on
          - w['density_penalty'] * pen_d
          - w['extreme_penalty'] * pen_e
        )
        scored.append({
            'bpm':             round(T_bpm, 1),
            'score':           round(float(total), 4),
            'tempogram_score': round(float(s_tg), 4),
            'consistency':     round(float(s_con), 4),
            'low_freq_pulse':  round(float(s_lf), 4),
            'energy_align':    round(float(s_en), 4),
            'onset_align':     round(float(s_on), 4),
            'density_penalty': round(float(pen_d), 4),
            'extreme_penalty': round(float(pen_e), 4),
        })

    scored.sort(key=lambda x: x['score'], reverse=True)

    if _BPM_DEBUG:
        print(f"\n[BPM DEBUG] ambient={is_ambient}  duration={duration_sec:.1f}s")
        print(f"  {'BPM':6s}  {'score':6s}  tg    con   lf    en    on    pen_d pen_e")
        for s in scored[:10]:
            print(
                f"  {s['bpm']:6.1f}  {s['score']:6.4f}  "
                f"{s['tempogram_score']:.3f} {s['consistency']:.3f} "
                f"{s['low_freq_pulse']:.3f} {s['energy_align']:.3f} "
                f"{s['onset_align']:.3f} {s['density_penalty']:.3f} "
                f"{s['extreme_penalty']:.3f}"
            )

    # ── Stage 4: group candidates by tempo equivalence (×2 / ÷2) ──────────
    groups = _bpm_group_by_ratio(scored)

    if _BPM_DEBUG:
        print(f"\n[BPM DEBUG] Tempo groups (tolerance=3%):")
        for g in groups:
            print(f"  Group {g['group_id']}: members={g['members']}  "
                  f"scores={g['member_scores']}  group_score={g['group_score']:.4f}  "
                  f"best={g['best_candidate']}")

    best_group = groups[0]

    # ── Stage 5: select preferred tempo within best group ─────────────────
    # Priority 1: prefer tempo in the preferred BPM range.
    # Priority 2: if ambient, prefer the slower member; otherwise prefer
    #             the highest-scoring member.
    paired = list(zip(best_group['members'], best_group['member_scores']))
    paired.sort(key=lambda x: (
        0 if _BPM_PREFERRED_MIN <= x[0] <= _BPM_PREFERRED_MAX else 1,
        x[0] if is_ambient else -x[1],
    ))
    best_bpm = paired[0][0]

    # Detect double/half-time: scan group members for a competitive candidate
    # at a 2× or 0.5× relationship to the selected BPM.
    # "Competitive" = scored ≥ 80% of the selected candidate's raw score.
    # This correctly flags double_detected when, e.g., the group is
    # [93.8, 187.5, 47.7] and 93.8 was selected — 187.5 is a genuine
    # double-time variant that nearly tied for first place.
    selected_raw_score = next(
        (s['score'] for s in scored if s['bpm'] == best_bpm), 0.0
    )
    competitive_threshold = 0.80 * selected_raw_score
    double_detected = False
    half_detected   = False
    for c_bpm, c_score in zip(best_group['members'], best_group['member_scores']):
        if c_bpm == best_bpm:
            continue
        if c_score < competitive_threshold:
            continue
        r = c_bpm / (best_bpm + 1e-10)
        if abs(r - 2.0) / 2.0 <= 0.06:
            double_detected = True
        elif abs(r - 0.5) / 0.5 <= 0.06:
            half_detected = True

    # ── Stability: variance of window-level dominant tempos ───────────────
    win_tempos: list[float] = []
    win_frames = max(32, len(onset_env) // 8)
    for i in range(8):
        s, e = i * win_frames, min((i + 1) * win_frames, len(onset_env))
        if e - s < 32:
            continue
        wenv = onset_env[s:e]
        try:
            wl  = min(256, max(32, (e - s) // 2))
            tg  = librosa.feature.tempogram(
                onset_envelope=wenv, sr=sr, hop_length=hop,
                win_length=wl, window='hann',
            )
            avg = np.mean(np.abs(tg), axis=1)
            bax = librosa.tempo_frequencies(len(avg), sr=sr, hop_length=hop)
            vm  = (bax >= _BPM_HARD_MIN) & (bax <= _BPM_HARD_MAX)
            if vm.any():
                win_tempos.append(float(bax[vm][np.argmax(avg[vm])]))
        except Exception:
            pass

    stability       = 1.0
    stability_label = 'Unknown'
    if len(win_tempos) > 2:
        mean_t = float(np.mean(win_tempos))
        std_t  = float(np.std(win_tempos))
        stability = round(max(0.0, 1.0 - std_t / (mean_t + 1e-10)), 3)
        if stability > 0.90:   stability_label = 'Very stable'
        elif stability > 0.80: stability_label = 'Stable'
        elif stability > 0.65: stability_label = 'Moderate drift'
        else:                  stability_label = 'High drift'

    # ── beat_count from tempo (not onset_detect — avoids overcounting) ─────
    beat_count = int(round(duration_sec * best_bpm / 60.0))

    # ── Tempo group confidence (rank-weighted group scores) ────────────────
    best_group_score   = groups[0]['group_score']
    second_group_score = groups[1]['group_score'] if len(groups) > 1 else 0.0
    group_margin       = best_group_score - second_group_score
    # Relative advantage: what fraction of the best group's normalised score
    # does it lead by?  0 = tied groups, → 1 = totally dominant group.
    group_confidence = round(float(np.clip(
        group_margin / (best_group_score + 1e-10), 0.0, 1.0
    )), 3)

    if _BPM_DEBUG:
        print(f"\n[BPM DEBUG] Confidence: best_group_score={best_group_score:.4f}  "
              f"second={second_group_score:.4f}  margin={group_margin:.4f}  "
              f"confidence={group_confidence:.3f}")

    # ── beat_grid_confidence ───────────────────────────────────────────────
    # How confident are we that a stable beat grid exists?
    # Draws on stability (window variance), group dominance, low-freq pulse
    # alignment, and window-level consistency for the selected tempo.
    best_cand_scores = next(
        (s for s in scored if s['bpm'] == best_bpm), scored[0]
    )
    s_lf_best  = best_cand_scores['low_freq_pulse']
    s_con_best = best_cand_scores['consistency']
    beat_grid_confidence = round(float(np.clip(
        0.30 * stability
      + 0.25 * best_group_score          # normalised group dominance
      + 0.25 * s_lf_best                 # low-freq amplitude modulation
      + 0.20 * s_con_best,               # cross-window consistency
        0.0, 1.0
    )), 3)

    # ── downbeat_confidence ────────────────────────────────────────────────
    # How clearly are bar-level (beat 1) accents articulated?
    # Ambient tracks typically have high beat_grid_confidence but modest
    # downbeat_confidence (pads swell without hard accent emphasis).
    bar_prd    = _bpm_bar_periodicity_score(best_bpm, onset_env, sr, hop, beats_per_bar=4)
    phrase_prd = _bpm_bar_periodicity_score(best_bpm, onset_env, sr, hop, beats_per_bar=8)
    lf_accent  = _bpm_bar_periodicity_score(best_bpm, low_env,   sr, hop, beats_per_bar=4)
    ons_accent = _bpm_onset_accent_score(best_bpm, onset_env, sr, hop)

    downbeat_confidence = round(float(np.clip(
        0.30 * bar_prd
      + 0.25 * phrase_prd
      + 0.25 * lf_accent
      + 0.20 * ons_accent,
        0.0, 1.0
    )), 3)

    if _BPM_DEBUG:
        print(f"\n[BPM DEBUG] beat_grid_conf={beat_grid_confidence:.3f}  "
              f"downbeat_conf={downbeat_confidence:.3f}")
        print(f"  bar_prd={bar_prd:.3f}  phrase_prd={phrase_prd:.3f}  "
              f"lf_accent={lf_accent:.3f}  ons_accent={ons_accent:.3f}")

    raw_bpms              = {c[0] for c in raw_candidates}
    normalization_applied = best_bpm not in raw_bpms

    # Annotate the selected group with the chosen tempo for display
    best_group['selected_bpm'] = best_bpm

    return {
        # ── Primary tempo fields ───────────────────────────────────────────
        'tempo_bpm':                    best_bpm,
        'beat_count':                   beat_count,           # tempo × duration / 60; not derived from onset_detect
        'tempo_stability':              stability,            # 0–1; window-level variance of the dominant tempo
        'tempo_stability_label':        stability_label,      # "Very stable" / "Stable" / "Moderate drift" / "High drift"
        'double_time_detected':         double_detected,      # True when group contains a competitive 2× candidate
        'half_time_detected':           half_detected,        # True when group contains a competitive ½× candidate
        # ── Confidence (all 0–1) ──────────────────────────────────────────
        'tempo_confidence':             group_confidence,     # margin between best and second tempo equivalence group
        'beat_grid_confidence':         beat_grid_confidence, # stability + group dominance + low-freq pulse + consistency
        'downbeat_confidence':          downbeat_confidence,  # bar-level accent strength; low is normal for ambient
        # ── Diagnostic: downbeat sub-signals (components of downbeat_confidence) ─
        'bar_periodicity_score':                round(bar_prd, 3),
        'phrase_boundary_alignment_score':      round(phrase_prd, 3),
        'low_freq_accent_score':                round(lf_accent, 3),
        'onset_accent_score':                   round(ons_accent, 3),
        # ── Ambient classification ─────────────────────────────────────────
        'is_ambient':                   is_ambient,           # True when ambient_score ≥ _AMBIENT_THRESHOLD (0.40)
        'ambient_score':                ambient_score,        # weighted sum of 7 spectral / timbral signals
        'ambient_subscores':            ambient_subscores,    # per-signal breakdown for inspection
        # ── Candidate detail ──────────────────────────────────────────────
        'tempo_candidates':             scored[:5],           # top 5 individually scored candidates
        'tempo_groups':                 groups[:4],           # candidates clustered by 2× harmonic ratio
        # ── Flags ──────────────────────────────────────────────────────────
        'tempo_normalization_applied':  normalization_applied, # True when best BPM was not a raw tempogram peak
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


def _chord_changes_windowed(
    chroma: np.ndarray,
    sr: int,
    hop: int,
    dur_sec: float,
    win_sec: float = 3.0,
    step_sec: float = 1.0,
    cos_threshold: float = 0.15,
    min_gap_sec: float = 1.5,
) -> tuple[float, float]:
    """
    Count chord changes using windowed chroma cosine distance.

    Compares adjacent non-overlapping windows; a change is counted only when
    cosine distance exceeds cos_threshold AND at least min_gap_sec has elapsed
    since the last counted change.  Returns (changes_per_min, confidence).

    confidence is the normalised separation between the "change" and "stable"
    distance distributions — higher means the threshold reliably separates them.
    Returns (0.0, 0.0) for tracks shorter than two windows.
    """
    if dur_sec <= 0 or chroma.size == 0:
        return 0.0, 0.0

    frames_per_sec = sr / hop
    win_frames  = max(1, int(win_sec  * frames_per_sec))
    step_frames = max(1, int(step_sec * frames_per_sec))
    n_frames    = chroma.shape[1]

    # Build window mean vectors
    windows: list[np.ndarray] = []
    w = 0
    while w + win_frames <= n_frames:
        chunk = chroma[:, w: w + win_frames]
        vec   = chunk.mean(axis=1)
        norm  = np.linalg.norm(vec)
        windows.append(vec / norm if norm > 1e-8 else vec)
        w += step_frames

    if len(windows) < 2:
        return 0.0, 0.0

    # Cosine distances between consecutive windows
    dists = np.array([
        1.0 - float(np.dot(windows[i], windows[i + 1]))
        for i in range(len(windows) - 1)
    ])

    # Count changes with minimum gap enforcement
    last_change_idx = -999
    min_gap_steps   = max(1, int(min_gap_sec / step_sec))
    change_count    = 0
    for i, d in enumerate(dists):
        if d >= cos_threshold and (i - last_change_idx) >= min_gap_steps:
            change_count += 1
            last_change_idx = i

    changes_per_min = round(change_count / dur_sec * 60.0, 1) if dur_sec > 0 else 0.0

    # Confidence: how well cos_threshold separates the two populations
    above = dists[dists >= cos_threshold]
    below = dists[dists <  cos_threshold]
    if len(above) == 0 or len(below) == 0:
        confidence = 0.0
    else:
        sep   = above.mean() - below.mean()
        spread = above.std() + below.std() + 1e-8
        confidence = round(float(min(1.0, sep / spread)), 3)

    return changes_per_min, confidence


def _analyze_harmonic(
    y: np.ndarray,
    sr: int,
    tonic_pc: int = 0,
    key_confidence: float = 0.0,
    tonic_margin: float = 0.0,
    ks_mode: str = 'major',
    ks_corr: float = 0.5,
    rel_penalty_applied: bool = False,
) -> dict:
    """
    Music-aware harmonic analysis.

    inferred_harmonic_root is determined by a multi-signal scoring function
    (_compute_harmonic_root_scores) that treats tonality.tonic alignment as its
    primary signal.  Three hard consistency rules then prevent the result from
    reverting to a naive frequency-count answer when the tonic scorer already
    resolved relative-key ambiguity.

    dominant_bass_pitch_class remains the raw most-frequent bass note, which
    is allowed to differ from inferred_harmonic_root.  That distinction is
    musically meaningful: in F# minor the bass may often land on A while the
    harmonic center is still F#.
    """
    y_harm = librosa.effects.harmonic(y)
    hop    = 4096
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop)
    _PROFILES = [_MAJOR_PROFILE, _MINOR_PROFILE, _HARM_MINOR]

    frame_roots = np.argmax(chroma, axis=0)
    n_frames    = chroma.shape[1]

    # ── dominant_bass_pitch_class ──────────────────────────────────────────
    # Computed first so its counts can be passed into the root scorer to avoid
    # re-running the expensive CQT.
    fmin = librosa.note_to_hz('C1')
    bass_pc_counts = None
    try:
        C_bass = np.abs(librosa.cqt(y, sr=sr, fmin=fmin, n_bins=36, bins_per_octave=12))
        bass_pc_counts = np.zeros(12)
        for t in range(C_bass.shape[1]):
            bass_pc_counts[int(np.argmax(C_bass[:, t])) % 12] += 1.0
        dominant_bass_pc = NOTE_NAMES[int(np.argmax(bass_pc_counts))]
    except Exception:
        dominant_bass_pc = NOTE_NAMES[tonic_pc]

    # ── Windowed tonic stability ───────────────────────────────────────────
    # Measures how consistently tonic_pc is a top KS candidate over time.
    n_windows  = 10
    win_size   = max(1, n_frames // n_windows)
    win_ranks: list[int]   = []
    win_margins: list[float] = []

    for w in range(n_windows):
        s, e = w * win_size, min((w + 1) * win_size, n_frames)
        if e <= s:
            continue
        wh = np.zeros(12)
        for t in range(s, e):
            wh[np.argsort(chroma[:, t])[-3:]] += 1.0
        if wh.sum() == 0:
            continue
        wh /= wh.sum()
        win_scores = np.array([
            max(float(np.corrcoef(wh, np.roll(p, T))[0, 1]) for p in _PROFILES)
            for T in range(12)
        ])
        rank   = int(np.sum(win_scores > win_scores[tonic_pc])) + 1
        margin = float(win_scores.max() - win_scores[tonic_pc])
        win_ranks.append(rank)
        win_margins.append(margin)

    n_eval        = max(1, len(win_ranks))
    stability_pct = round(
        sum(1 for r, m in zip(win_ranks, win_margins) if r == 1 or m < 0.05)
        / n_eval * 100, 1
    )
    rank1_pct   = round(sum(1 for r in win_ranks if r == 1) / n_eval * 100, 1)
    top2_pct    = round(sum(1 for r in win_ranks if r <= 2) / n_eval * 100, 1)
    mean_rank   = round(float(np.mean(win_ranks)) if win_ranks else 1.0, 2)
    margin_mean = round(float(np.mean(win_margins)) if win_margins else 0.0, 4)

    # ── Multi-signal harmonic root scoring ────────────────────────────────
    raw_best, raw_best_score, hr_candidates = _compute_harmonic_root_scores(
        chroma=chroma,
        y=y,
        sr=sr,
        hop=hop,
        tonic_pc=tonic_pc,
        key_confidence=key_confidence,
        tonic_margin=tonic_margin,
        ks_mode=ks_mode,
        ks_corr=ks_corr,
        rel_penalty_applied=rel_penalty_applied,
        bass_pc_counts=bass_pc_counts,
    )

    # ── Consistency rules ──────────────────────────────────────────────────
    tonic_name       = NOTE_NAMES[tonic_pc]
    tonic_score_val  = hr_candidates[tonic_name]['total_score']
    rel_key_pc       = (tonic_pc + 3) % 12 if ks_mode in ('minor', 'harmonic minor') \
                       else (tonic_pc + 9) % 12
    rel_key_name     = NOTE_NAMES[rel_key_pc]

    inferred_harmonic_root = raw_best
    divergence_reason: str | None = None

    # Rule 1 — high-confidence tonic default
    # When the tonality scorer was confident and the track is tonally stable,
    # require a competing root to beat the tonic score by _HR_OVERRIDE_MARGIN.
    rule1_active = (
        key_confidence >= _HR_HIGH_CONF
        and tonic_margin >= _HR_TONIC_MARGIN
        and stability_pct >= _HR_STAB_PCT
    )
    if rule1_active and raw_best != tonic_name:
        gap = raw_best_score - tonic_score_val
        if gap < _HR_OVERRIDE_MARGIN:
            # Not enough evidence to deviate — stay with the tonic
            inferred_harmonic_root = tonic_name
        else:
            divergence_reason = (
                f"Rule 1 override: {raw_best} beats {tonic_name} "
                f"by {gap:.3f} (threshold {_HR_OVERRIDE_MARGIN})"
            )

    # Rule 2 — relative-key extra hurdle
    # If the tonic scorer already applied a relative-key penalty, require an
    # even larger gap before the relative key can become the harmonic root.
    if (
        inferred_harmonic_root == rel_key_name
        and rel_penalty_applied
        and inferred_harmonic_root != tonic_name
    ):
        gap = hr_candidates[rel_key_name]['total_score'] - tonic_score_val
        if gap < _HR_OVERRIDE_MARGIN * 1.5:
            inferred_harmonic_root = tonic_name
            divergence_reason = None  # reverted; no longer diverging
        else:
            divergence_reason = (
                divergence_reason or
                f"Rule 2 override allowed: relative key {rel_key_name} "
                f"beats {tonic_name} by {gap:.3f}"
            )

    # Rule 3 — record divergence if root != tonic
    diverges_from_tonic = (inferred_harmonic_root != tonic_name)
    if not diverges_from_tonic:
        divergence_reason = None

    # ── Other harmonic metrics ─────────────────────────────────────────────
    # Key drift: std of per-frame KS correlations
    frame_corrs = []
    for t in range(n_frames):
        col = chroma[:, t]
        s   = col.sum()
        if s > 0:
            _, _, r = _ks_correlate(col / s)
            frame_corrs.append(r)
    key_drift = round(float(np.std(frame_corrs)), 4) if frame_corrs else 0.0

    dur_sec = len(y) / sr
    chord_changes_per_min, chord_change_confidence = _chord_changes_windowed(
        chroma, sr=sr, hop=hop, dur_sec=dur_sec
    )

    dominant_pc = (tonic_pc + 7) % 12
    vi_count    = int(np.sum(
        (frame_roots[:-1] == dominant_pc) & (frame_roots[1:] == tonic_pc)
    ))
    vi_rate = round(vi_count / max(1, len(frame_roots) - 1) * 100, 1)

    # Top 5 harmonic root candidates for transparency
    top_hr_candidates = dict(
        sorted(hr_candidates.items(), key=lambda x: x[1]['total_score'], reverse=True)[:5]
    )

    out = {
        'inferred_harmonic_root':          inferred_harmonic_root,
        'harmonic_root_score':             round(hr_candidates[inferred_harmonic_root]['total_score'], 4),
        'dominant_bass_pitch_class':       dominant_bass_pc,
        'root_stability_pct':              stability_pct,
        'root_rank1_pct':                  rank1_pct,
        'root_top2_pct':                   top2_pct,
        'root_mean_rank':                  mean_rank,
        'tonic_margin_mean':               margin_mean,
        'key_drift':                       key_drift,
        'dominant_tonic_resolution_pct':   vi_rate,
        'chord_changes_per_min':           chord_changes_per_min,
        'chord_change_confidence':         chord_change_confidence,
        'harmonic_root_diverges_from_tonic': diverges_from_tonic,
        'harmonic_root_candidates':        top_hr_candidates,
    }
    if diverges_from_tonic and divergence_reason:
        out['harmonic_root_divergence_reason'] = divergence_reason
    return out


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
