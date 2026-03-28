"""Web interface for MIDI analysis."""
from __future__ import annotations

import io
import os
import shutil
import tempfile
import threading
import uuid
import zipfile
from pathlib import Path
from threading import Thread, Timer

import mido
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from flask import Flask, render_template, request, jsonify, send_file

from .analyzer import MIDIAnalyzer
from .audio_analyzer import analyze_audio

_AUDIO_EXTENSIONS = {'.wav', '.aif', '.aiff', '.flac', '.ogg', '.mp3'}
_AUDIO_MAX_BYTES  = 100 * 1024 * 1024  # 100 MB per file
_REQUEST_MAX_BYTES = 300 * 1024 * 1024  # 300 MB total (mastering sends two files)

# Limit concurrent audio analyses — each one peaks at ~2 GB RAM
_AUDIO_SEMAPHORE  = threading.Semaphore(2)
# Only one mastering job at a time (mg.set_handlers is global)
_MASTER_SEMAPHORE = threading.Semaphore(1)

# In-memory job store: job_id → job dict
_MASTER_JOBS: dict = {}
_LOUDNESS_JOBS: dict = {}
_SHEET_JOBS:   dict = {}
_STEMS_JOBS:   dict = {}
_CONVERT_JOBS: dict = {}
_MASTER_JOB_TTL = 600  # seconds before temp files are cleaned up

_LOUDNESS_PLATFORMS = {
    'spotify':     {'name': 'Spotify',               'lufs': -14.0},
    'apple_music': {'name': 'Apple Music',            'lufs': -16.0},
    'youtube':     {'name': 'YouTube / YT Music',     'lufs': -14.0},
    'tidal':       {'name': 'Tidal',                  'lufs': -14.0},
    'amazon':      {'name': 'Amazon Music',           'lufs': -14.0},
    'soundcloud':  {'name': 'SoundCloud',             'lufs': -14.0},
    'deezer':      {'name': 'Deezer',                 'lufs': -15.0},
    'pandora':     {'name': 'Pandora',                'lufs': -13.0},
    'ebu_r128':    {'name': 'Broadcast (EBU R128)',   'lufs': -23.0},
    'atsc_a85':    {'name': 'Broadcast (ATSC A/85)',  'lufs': -24.0},
}


def _cleanup_master_job(job_id: str) -> None:
    job = _MASTER_JOBS.pop(job_id, None)
    if job and job.get('tmpdir'):
        shutil.rmtree(job['tmpdir'], ignore_errors=True)


def _cleanup_loudness_job(job_id: str) -> None:
    job = _LOUDNESS_JOBS.pop(job_id, None)
    if job and job.get('tmpdir'):
        shutil.rmtree(job['tmpdir'], ignore_errors=True)


def _cleanup_sheet_job(job_id: str) -> None:
    job = _SHEET_JOBS.pop(job_id, None)
    if job and job.get('tmpdir'):
        shutil.rmtree(job['tmpdir'], ignore_errors=True)


def _cleanup_stems_job(job_id: str) -> None:
    job = _STEMS_JOBS.pop(job_id, None)
    if job and job.get('tmpdir'):
        shutil.rmtree(job['tmpdir'], ignore_errors=True)


def _cleanup_convert_job(job_id: str) -> None:
    job = _CONVERT_JOBS.pop(job_id, None)
    if job and job.get('tmpdir'):
        shutil.rmtree(job['tmpdir'], ignore_errors=True)


_STEMS_SEMAPHORE = threading.Semaphore(1)  # one job at a time — CPU intensive


def _run_stems(job: dict, audio_path: str, stem_names: list) -> None:
    """Background thread: runs Demucs stem separation."""
    try:
        import torch
        import torchaudio
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        from demucs.audio import save_audio

        model = get_model('htdemucs')
        model.eval()

        # Load audio with soundfile/torchaudio — avoids ffprobe dependency
        wav, sr = torchaudio.load(audio_path, backend='soundfile')
        if wav.shape[0] > model.audio_channels:
            wav = wav[:model.audio_channels]
        elif wav.shape[0] < model.audio_channels:
            wav = wav.repeat(model.audio_channels // wav.shape[0] + 1, 1)[:model.audio_channels]
        if sr != model.samplerate:
            wav = torchaudio.functional.resample(wav, sr, model.samplerate)

        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std()
        wav = wav.unsqueeze(0)  # add batch dim

        job['status'] = 'processing'

        with torch.no_grad():
            sources = apply_model(model, wav, device='cpu', shifts=1, split=True,
                                  overlap=0.25, progress=False)[0]

        sources = sources * ref.std() + ref.mean()

        stem_map = {name: i for i, name in enumerate(model.sources)}
        tmpdir = job['tmpdir']

        for stem in stem_names:
            idx = stem_map.get(stem)
            if idx is None:
                continue
            out_path = os.path.join(tmpdir, f'{stem}.wav')
            save_audio(sources[idx], out_path, samplerate=model.samplerate)
            job['stems'][stem] = out_path

        job['status'] = 'complete'

    except Exception as exc:
        job['error'] = str(exc)
        job['status'] = 'error'
    finally:
        _STEMS_SEMAPHORE.release()


def _run_mastering(job: dict, target_data: bytes, ref_data: bytes,
                   target_ext: str, ref_ext: str, target_stem: str) -> None:
    """Background thread: runs matchering, populates job dict."""
    try:
        import matchering as mg

        def _log(msg: str) -> None:
            job['logs'].append(msg)

        mg.log(default_handler=_log)

        tmpdir = tempfile.mkdtemp()
        job['tmpdir'] = tmpdir

        target_path = os.path.join(tmpdir, f'target{target_ext}')
        ref_path    = os.path.join(tmpdir, f'reference{ref_ext}')
        output_path = os.path.join(tmpdir, 'mastered.wav')

        with open(target_path, 'wb') as f:
            f.write(target_data)
        with open(ref_path, 'wb') as f:
            f.write(ref_data)

        job['metrics_before'] = _audio_metrics(target_path)

        mg.process(
            target=target_path,
            reference=ref_path,
            results=[mg.Result(output_path, subtype='PCM_24')],
        )

        job['metrics_after']  = _audio_metrics(output_path)
        job['download_name']  = f'{target_stem}-mastered.wav'
        job['status']         = 'complete'

    except Exception as exc:
        job['error']  = str(exc)
        job['status'] = 'error'
    finally:
        _MASTER_SEMAPHORE.release()


def _sanitize_midi_bytes(data: bytes) -> bytes:
    """
    Clamp invalid key-signature sf values so mido can parse the file.

    Some MIDI generators (e.g. Suno) write sf bytes outside the valid range
    of -7..7.  Scan for the key-signature meta-event pattern and clamp.
    """
    buf = bytearray(data)
    i = 0
    while i < len(buf) - 3:
        if buf[i] == 0xFF and buf[i + 1] == 0x59 and buf[i + 2] == 0x02:
            sf_idx = i + 3
            if sf_idx < len(buf):
                sf = buf[sf_idx] if buf[sf_idx] <= 127 else buf[sf_idx] - 256
                sf = max(-7, min(7, sf))
                buf[sf_idx] = sf & 0xFF
            i += 4
        else:
            i += 1
    return bytes(buf)


def _audio_metrics(file_path: str) -> dict:
    """Compute LUFS, true peak, RMS, and dynamic range for an audio file."""
    data, rate = sf.read(file_path, always_2d=True)
    # Integrated loudness (LUFS)
    try:
        meter = pyln.Meter(rate)
        lufs = meter.integrated_loudness(data)
        lufs = None if (lufs == float('-inf') or lufs != lufs) else round(float(lufs), 1)
    except Exception:
        lufs = None
    # True peak (dBFS)
    peak_linear = float(np.max(np.abs(data)))
    peak_db = round(20 * np.log10(peak_linear), 1) if peak_linear > 0 else -96.0
    # RMS (dB)
    rms_linear = float(np.sqrt(np.mean(data ** 2)))
    rms_db = round(20 * np.log10(rms_linear), 1) if rms_linear > 0 else -96.0
    # Dynamic range (crest factor approximation)
    dr = round(peak_db - rms_db, 1)
    return {'lufs': lufs, 'peak_db': peak_db, 'rms_db': rms_db, 'dr': dr}


def create_app():
    """Create and configure the Flask application."""
    app = Flask(
        __name__,
        template_folder=str(Path(__file__).parent / 'templates'),
        static_folder=str(Path(__file__).parent / 'static'),
    )
    app.config['MAX_CONTENT_LENGTH'] = _REQUEST_MAX_BYTES  # mastering sends two files

    @app.after_request
    def set_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'"
        )
        return response

    # ── Layout experiment CSS overrides ───────────────────────────────────────
    _LAYOUT_A = """
        /* A: Conservative nudge — 1300px cap, same sidebar, same 2-col cards */
        :root { --sidebar-width: 220px; }
        .tab-content { max-width: 1300px; }
        #globalLoadingBanner { max-width: 1300px; }
    """

    _LAYOUT_B = """
        /* B: Dashboard — 1560px cap, 3-col fluid cards on wide screens */
        :root { --sidebar-width: 220px; }
        .tab-content { max-width: 1560px; }
        #globalLoadingBanner { max-width: 1560px; }
        .results-container {
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        }
    """

    _LAYOUT_C = """
        /* C: Full-bleed — no cap, wider sidebar, 3-col fluid cards */
        :root { --sidebar-width: 260px; }
        .tab-content { max-width: none; }
        #globalLoadingBanner { max-width: none; right: 2.5rem; }
        .results-container {
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        }
    """

    _LAYOUT_D = """
        /* D: Wide & structured — 1600px cap, wider sidebar, 2-col big cards */
        :root { --sidebar-width: 260px; }
        .tab-content { max-width: 1600px; }
        #globalLoadingBanner { max-width: 1600px; }
        .main-content { padding: 2.5rem 3.5rem 8rem; }
        .result-card { padding: 2rem 2.25rem; }
    """

    @app.route('/')
    def index():
        """Serve the main analysis page."""
        return render_template('index.html')

    @app.route('/layout-a')
    def layout_a():
        """Layout experiment A: conservative nudge to 1300px."""
        return render_template('index.html', layout_css=_LAYOUT_A)

    @app.route('/layout-b')
    def layout_b():
        """Layout experiment B: dashboard, 3-col fluid cards."""
        return render_template('index.html', layout_css=_LAYOUT_B)

    @app.route('/layout-c')
    def layout_c():
        """Layout experiment C: full-bleed, no cap, wider sidebar."""
        return render_template('index.html', layout_css=_LAYOUT_C)

    @app.route('/layout-d')
    def layout_d():
        """Layout experiment D: 1600px, wider sidebar, bigger card padding."""
        return render_template('index.html', layout_css=_LAYOUT_D)

    @app.route('/b')
    def index_b():
        """Serve the B-variant (redesigned) analysis page."""
        return render_template('index_b.html')

    @app.route('/c')
    def index_c():
        """Serve the C-variant (gold & blue) analysis page."""
        return render_template('index_c.html')

    @app.route('/d')
    def index_d():
        """Serve the D-variant (studio console) analysis page."""
        return render_template('index_d.html')

    @app.route('/e')
    def index_e():
        """Serve the E-variant (astonishing) analysis page."""
        return render_template('index_e.html')

    @app.route('/api/analyze', methods=['POST'])
    def analyze():
        """
        Analyze an uploaded MIDI file.

        Expects a multipart file upload with key 'midi_file'.
        Returns JSON with analysis results.
        """
        # Check for file in request
        if 'midi_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['midi_file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Sanitize and validate filename
        safe_name = os.path.basename(file.filename)
        if not safe_name.lower().endswith(('.mid', '.midi')):
            return jsonify({'error': 'File must be a MIDI file (.mid or .midi)'}), 400

        try:
            # Read file into memory without saving to disk
            file_data = file.read()
            midi_bytes = io.BytesIO(file_data)
            midi_bytes.name = safe_name

            # Create analyzer from bytes
            analyzer = MIDIAnalyzer(midi_bytes)
            results = analyzer.analyze()

            results['file'] = safe_name

            return jsonify(results), 200

        except ValueError as exc:
            app.logger.error("MIDI analysis ValueError: %s", exc, exc_info=True)
            return jsonify({'error': f'Invalid MIDI file: {exc}'}), 400
        except Exception as exc:
            app.logger.error("MIDI analysis failed: %s", exc, exc_info=True)
            return jsonify({'error': 'Analysis failed: please try another file'}), 400

    @app.route('/api/humanize', methods=['POST'])
    def humanize():
        """
        Humanize note velocities in an uploaded MIDI file.

        Expects a multipart form with:
          - 'midi_file': the MIDI file
          - 'intensity': 1 (a little), 2 (more), or 3 (a lot)

        Returns the modified MIDI file as a download.
        """
        if 'midi_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['midi_file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        safe_name = os.path.basename(file.filename)
        if not safe_name.lower().endswith(('.mid', '.midi')):
            return jsonify({'error': 'File must be a MIDI file (.mid or .midi)'}), 400

        try:
            intensity = int(request.form.get('intensity', 2))
        except (ValueError, TypeError):
            intensity = 2
        intensity = max(1, min(3, intensity))

        # sigma: gaussian noise spread per intensity level
        # beat_accent: extra velocity on downbeats for emphasis
        sigma      = {1: 5,  2: 12, 3: 20}[intensity]
        beat_accent = {1: 3,  2: 6,  3: 10}[intensity]

        try:
            file_data = _sanitize_midi_bytes(file.read())
            mid = mido.MidiFile(file=io.BytesIO(file_data))
            ticks_per_beat = mid.ticks_per_beat or 480
            rng = np.random.default_rng()

            for track_idx, track in enumerate(mid.tracks):
                new_track = mido.MidiTrack()
                abs_tick = 0
                for msg in track:
                    abs_tick += msg.time
                    if msg.type == 'note_on' and msg.velocity > 0:
                        # Beat-position accent: downbeats get a small lift
                        beat_pos = (abs_tick % (ticks_per_beat * 4)) / ticks_per_beat
                        if beat_pos < 0.1:          # beat 1 (downbeat)
                            accent = beat_accent
                        elif 1.9 < beat_pos < 2.1:  # beat 3
                            accent = beat_accent // 2
                        else:
                            accent = 0

                        noise = float(rng.normal(0, sigma))
                        new_vel = int(np.clip(msg.velocity + noise + accent, 1, 127))
                        new_track.append(msg.copy(velocity=new_vel))
                    else:
                        new_track.append(msg)
                mid.tracks[track_idx] = new_track

            output = io.BytesIO()
            mid.save(file=output)
            output.seek(0)

            stem = safe_name.rsplit('.', 1)[0]
            download_name = f"{stem}-humanized.mid"

            return send_file(
                output,
                mimetype='audio/midi',
                as_attachment=True,
                download_name=download_name,
            )

        except Exception as exc:
            app.logger.error("Humanize failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Humanization failed: {exc}'}), 400

    @app.route('/api/analyze-audio', methods=['POST'])
    def analyze_audio_file():
        """
        Analyze an uploaded audio file (WAV, AIFF, FLAC, OGG, MP3).
        MP3 requires ffmpeg to be installed on the server.
        Returns JSON with full analysis results.
        """
        if 'audio_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['audio_file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        safe_name = os.path.basename(file.filename)
        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in _AUDIO_EXTENSIONS:
            return jsonify({
                'error': f'Unsupported format "{ext}". Use: {", ".join(sorted(_AUDIO_EXTENSIONS))}'
            }), 400

        try:
            file_data = file.read()
            if len(file_data) > _AUDIO_MAX_BYTES:
                return jsonify({'error': 'File too large. Maximum size is 100 MB'}), 400

            results = analyze_audio(file_data, safe_name)
            return jsonify(results), 200

        except Exception as exc:
            app.logger.error("Audio analysis failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Analysis failed: {exc}'}), 400

    @app.route('/api/normalize-velocity', methods=['POST'])
    def normalize_velocity():
        """
        Normalize note velocities so the average sits in the mp–mf range (~72).

        Computes the mean velocity across all note-on events and applies a
        constant offset so the new mean lands at the target.  Relative dynamics
        (louder vs. quieter notes) are fully preserved.

        Expects a multipart file upload with key 'midi_file'.
        Returns the modified MIDI file as a download.
        """
        if 'midi_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['midi_file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        safe_name = os.path.basename(file.filename)
        if not safe_name.lower().endswith(('.mid', '.midi')):
            return jsonify({'error': 'File must be a MIDI file (.mid or .midi)'}), 400

        # Target mean velocity: centre of mf range
        _TARGET_MEAN = 72

        try:
            file_data = _sanitize_midi_bytes(file.read())
            mid = mido.MidiFile(file=io.BytesIO(file_data))

            # Collect all current note-on velocities to compute the offset
            velocities = [
                msg.velocity
                for track in mid.tracks
                for msg in track
                if msg.type == 'note_on' and msg.velocity > 0
            ]

            if not velocities:
                return jsonify({'error': 'No note events found in file'}), 400

            current_mean = sum(velocities) / len(velocities)
            offset = round(_TARGET_MEAN - current_mean)

            for track_idx, track in enumerate(mid.tracks):
                new_track = mido.MidiTrack()
                for msg in track:
                    if msg.type == 'note_on' and msg.velocity > 0:
                        new_vel = int(np.clip(msg.velocity + offset, 1, 127))
                        new_track.append(msg.copy(velocity=new_vel))
                    else:
                        new_track.append(msg)
                mid.tracks[track_idx] = new_track

            output = io.BytesIO()
            mid.save(file=output)
            output.seek(0)

            stem = safe_name.rsplit('.', 1)[0]
            download_name = f"{stem}-normalized.mid"

            return send_file(
                output,
                mimetype='audio/midi',
                as_attachment=True,
                download_name=download_name,
            )

        except Exception as exc:
            app.logger.error("Normalize velocity failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Normalization failed: {exc}'}), 400

    @app.route('/api/humanize-timing', methods=['POST'])
    def humanize_timing():
        """
        Humanize note timing by nudging note onsets slightly off the beat grid.

        Expects a multipart form with:
          - 'midi_file': the MIDI file
          - 'intensity': 1 (a little), 2 (more), or 3 (a lot)

        Returns the modified MIDI file as a download.
        """
        if 'midi_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['midi_file']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        safe_name = os.path.basename(file.filename)
        if not safe_name.lower().endswith(('.mid', '.midi')):
            return jsonify({'error': 'File must be a MIDI file (.mid or .midi)'}), 400

        try:
            intensity = int(request.form.get('intensity', 2))
        except (ValueError, TypeError):
            intensity = 2
        intensity = max(1, min(3, intensity))

        # sigma as a fraction of one 16th-note grid unit
        sigma_fraction = {1: 0.05, 2: 0.10, 3: 0.17}[intensity]

        try:
            file_data = _sanitize_midi_bytes(file.read())
            mid = mido.MidiFile(file=io.BytesIO(file_data))
            ticks_per_beat = mid.ticks_per_beat or 480
            grid_size = ticks_per_beat / 4  # 16th note in ticks
            sigma_ticks = grid_size * sigma_fraction

            rng = np.random.default_rng()

            for track_idx, track in enumerate(mid.tracks):
                # Convert delta times to absolute ticks
                abs_events: list[list] = []
                abs_tick = 0
                for msg in track:
                    abs_tick += msg.time
                    abs_events.append([abs_tick, msg])

                # Nudge each note_on onset
                for item in abs_events:
                    t, msg = item
                    if msg.type == 'note_on' and msg.velocity > 0:
                        noise = float(rng.normal(0, sigma_ticks))
                        item[0] = max(0.0, t + noise)

                # Re-sort: note_off/velocity-0 before note_on at same tick
                # to avoid stuck notes when two events land at the same time
                def _sort_key(item):
                    t, msg = item
                    is_on = msg.type == 'note_on' and msg.velocity > 0
                    return (t, 1 if is_on else 0)

                abs_events.sort(key=_sort_key)

                # Convert back to delta times
                new_track = mido.MidiTrack()
                prev_t = 0.0
                for t, msg in abs_events:
                    delta = max(0, round(t - prev_t))
                    new_track.append(msg.copy(time=delta))
                    prev_t = t
                mid.tracks[track_idx] = new_track

            output = io.BytesIO()
            mid.save(file=output)
            output.seek(0)

            stem = safe_name.rsplit('.', 1)[0]
            download_name = f"{stem}-timing-humanized.mid"

            return send_file(
                output,
                mimetype='audio/midi',
                as_attachment=True,
                download_name=download_name,
            )

        except Exception as exc:
            app.logger.error("Humanize timing failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Timing humanization failed: {exc}'}), 400

    @app.route('/api/master', methods=['POST'])
    def master_audio():
        """
        Start a mastering job. Returns a job_id immediately; the job
        runs in a background thread. Poll /api/master/status/<job_id>
        for progress, then download from /api/master/download/<job_id>.
        """
        if 'target' not in request.files or 'reference' not in request.files:
            return jsonify({'error': 'Both target and reference files are required'}), 400

        target_file = request.files['target']
        ref_file    = request.files['reference']

        if not target_file.filename or not ref_file.filename:
            return jsonify({'error': 'Both files must be selected'}), 400

        _MASTER_EXTENSIONS = {'.wav', '.aif', '.aiff', '.flac'}
        target_ext  = os.path.splitext(os.path.basename(target_file.filename))[1].lower()
        ref_ext     = os.path.splitext(os.path.basename(ref_file.filename))[1].lower()
        target_stem = os.path.splitext(os.path.basename(target_file.filename))[0]

        if target_ext not in _MASTER_EXTENSIONS:
            return jsonify({'error': f'Target must be WAV, AIFF, or FLAC (got {target_ext})'}), 400
        if ref_ext not in _MASTER_EXTENSIONS:
            return jsonify({'error': f'Reference must be WAV, AIFF, or FLAC (got {ref_ext})'}), 400

        try:
            import matchering  # noqa — just check it's installed
        except ImportError:
            return jsonify({'error': 'Matchering is not installed on this server'}), 500

        if not _MASTER_SEMAPHORE.acquire(blocking=False):
            return jsonify({'error': 'A mastering job is already running — please wait'}), 503

        target_data = target_file.read()
        ref_data    = ref_file.read()

        if len(target_data) > _AUDIO_MAX_BYTES or len(ref_data) > _AUDIO_MAX_BYTES:
            _MASTER_SEMAPHORE.release()
            return jsonify({'error': 'File too large. Maximum size is 100 MB'}), 400

        job_id = str(uuid.uuid4())
        job = {
            'status':         'running',
            'logs':           [],
            'error':          None,
            'tmpdir':         None,
            'download_name':  None,
            'metrics_before': None,
            'metrics_after':  None,
        }
        _MASTER_JOBS[job_id] = job

        Thread(
            target=_run_mastering,
            args=(job, target_data, ref_data, target_ext, ref_ext, target_stem),
            daemon=True,
        ).start()

        # Auto-cleanup after TTL whether or not the client downloads
        Timer(_MASTER_JOB_TTL, _cleanup_master_job, args=[job_id]).start()

        return jsonify({'job_id': job_id}), 202

    @app.route('/api/master/status/<job_id>')
    def master_status(job_id):
        """Poll for job progress. Pass ?cursor=N to receive only new log lines."""
        job = _MASTER_JOBS.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found or expired'}), 404

        cursor   = max(0, int(request.args.get('cursor', 0)))
        new_logs = job['logs'][cursor:]

        resp = {
            'status':      job['status'],
            'logs':        new_logs,
            'next_cursor': cursor + len(new_logs),
        }
        if job['status'] == 'complete':
            resp['metrics_before'] = job['metrics_before']
            resp['metrics_after']  = job['metrics_after']
            resp['download_name']  = job['download_name']
        elif job['status'] == 'error':
            resp['error'] = job['error']

        return jsonify(resp)

    @app.route('/api/master/download/<job_id>')
    def master_download(job_id):
        """Download the mastered file once the job is complete."""
        job = _MASTER_JOBS.get(job_id)
        if not job or job['status'] != 'complete':
            return jsonify({'error': 'Job not ready or not found'}), 404

        output_path   = os.path.join(job['tmpdir'], 'mastered.wav')
        download_name = job['download_name']

        return send_file(
            output_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name=download_name,
        )

    @app.route('/api/loudness', methods=['POST'])
    def loudness_normalize():
        """
        Normalize an audio file's integrated loudness to a platform target.

        Expects multipart form with:
          - 'audio': the audio file (WAV, AIFF, FLAC)
          - 'platform': key from _LOUDNESS_PLATFORMS

        Returns JSON with before/after stats and a job_id for download.
        """
        if 'audio' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['audio']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400

        safe_name = os.path.basename(file.filename)
        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in {'.wav', '.aif', '.aiff', '.flac'}:
            return jsonify({'error': f'Unsupported format "{ext}". Use WAV, AIFF, or FLAC.'}), 400

        platform_key = request.form.get('platform', 'spotify')
        platform = _LOUDNESS_PLATFORMS.get(platform_key)
        if not platform:
            return jsonify({'error': f'Unknown platform "{platform_key}"'}), 400

        try:
            file_data = file.read()
            if len(file_data) > _AUDIO_MAX_BYTES:
                return jsonify({'error': 'File too large. Maximum size is 100 MB'}), 400

            data, rate = sf.read(io.BytesIO(file_data), always_2d=True)
            meter       = pyln.Meter(rate)
            before_lufs = meter.integrated_loudness(data)

            if before_lufs == float('-inf') or before_lufs != before_lufs:
                return jsonify({'error': 'Could not measure loudness — file may be silent or too short'}), 400

            target_lufs = platform['lufs']
            normalized  = pyln.normalize.loudness(data, before_lufs, target_lufs)

            # True peak limit at -1 dBFS to prevent clipping on boosts
            peak_linear = float(np.max(np.abs(normalized)))
            max_peak    = 10 ** (-1.0 / 20)  # ≈ 0.8913
            clamped     = peak_linear > max_peak
            if clamped:
                normalized = normalized * (max_peak / peak_linear)

            after_lufs  = float(meter.integrated_loudness(normalized))
            before_peak = round(20 * np.log10(max(float(np.max(np.abs(data))), 1e-9)), 1)
            after_peak  = round(20 * np.log10(max(float(np.max(np.abs(normalized))), 1e-9)), 1)
            gain_db     = round(target_lufs - float(before_lufs), 1)

            # Write output to temp file
            stem = os.path.splitext(safe_name)[0]
            platform_slug = platform_key.replace('_', '-')
            download_name = f'{stem}-{platform_slug}.wav'

            tmpdir     = tempfile.mkdtemp()
            out_path   = os.path.join(tmpdir, download_name)
            sf.write(out_path, normalized, rate, subtype='PCM_24')

            job_id = str(uuid.uuid4())
            _LOUDNESS_JOBS[job_id] = {'tmpdir': tmpdir, 'download_name': download_name}
            Timer(_MASTER_JOB_TTL, _cleanup_loudness_job, args=[job_id]).start()

            return jsonify({
                'job_id':       job_id,
                'before_lufs':  round(float(before_lufs), 1),
                'after_lufs':   round(after_lufs, 1),
                'before_peak':  before_peak,
                'after_peak':   after_peak,
                'gain_db':      gain_db,
                'clamped':      clamped,
                'target_lufs':  target_lufs,
                'platform':     platform['name'],
                'download_name': download_name,
            }), 200

        except Exception as exc:
            app.logger.error("Loudness normalization failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Normalization failed: {exc}'}), 400

    @app.route('/api/loudness/download/<job_id>')
    def loudness_download(job_id):
        """Download the loudness-normalized file."""
        job = _LOUDNESS_JOBS.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found or expired'}), 404

        out_path = os.path.join(job['tmpdir'], job['download_name'])
        return send_file(
            out_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name=job['download_name'],
        )

    @app.route('/api/stems', methods=['POST'])
    def split_stems():
        """
        Start a stem separation job using Demucs htdemucs.
        Returns a job_id immediately; poll /api/stems/status/<job_id>.
        Download each stem from /api/stems/download/<job_id>/<stem>.
        """
        if 'audio' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['audio']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400

        safe_name = os.path.basename(file.filename)
        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in _AUDIO_EXTENSIONS:
            return jsonify({'error': f'Unsupported format. Use WAV, AIFF, FLAC, or MP3.'}), 400

        if not _STEMS_SEMAPHORE.acquire(blocking=False):
            return jsonify({'error': 'A stem separation job is already running — please wait'}), 503

        try:
            file_data = file.read()
            if len(file_data) > _AUDIO_MAX_BYTES:
                _STEMS_SEMAPHORE.release()
                return jsonify({'error': 'File too large. Maximum size is 100 MB'}), 400

            tmpdir = tempfile.mkdtemp()
            audio_path = os.path.join(tmpdir, safe_name)
            with open(audio_path, 'wb') as f:
                f.write(file_data)

            stem_names = ['vocals', 'drums', 'bass', 'other']
            job_id = str(uuid.uuid4())
            job = {
                'status':  'queued',
                'error':   None,
                'tmpdir':  tmpdir,
                'stem_names': stem_names,
                'stems':   {},
                'filename': os.path.splitext(safe_name)[0],
            }
            _STEMS_JOBS[job_id] = job

            Thread(target=_run_stems, args=(job, audio_path, stem_names), daemon=True).start()
            Timer(_MASTER_JOB_TTL, _cleanup_stems_job, args=[job_id]).start()

            return jsonify({'job_id': job_id, 'stem_names': stem_names}), 202

        except Exception as exc:
            _STEMS_SEMAPHORE.release()
            return jsonify({'error': str(exc)}), 400

    @app.route('/api/stems/status/<job_id>')
    def stems_status(job_id):
        job = _STEMS_JOBS.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found or expired'}), 404
        resp = {'status': job['status'], 'stems_ready': list(job['stems'].keys())}
        if job['status'] == 'error':
            resp['error'] = job['error']
        if job['status'] == 'complete':
            resp['filename'] = job['filename']
            resp['stem_names'] = job['stem_names']
        return jsonify(resp)

    @app.route('/api/stems/download/<job_id>/<stem>')
    def stems_download(job_id, stem):
        job = _STEMS_JOBS.get(job_id)
        if not job or stem not in job['stems']:
            return jsonify({'error': 'Stem not found'}), 404
        return send_file(
            job['stems'][stem],
            mimetype='audio/wav',
            as_attachment=True,
            download_name=f"{job['filename']}-{stem}.wav",
        )

    @app.route('/api/spectrogram', methods=['POST'])
    def spectrogram():
        """
        Compute a mel spectrogram from an uploaded audio file.
        Returns base64-encoded uint8 pixel matrix (bins × frames), row 0 = highest freq.
        """
        if 'audio' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['audio']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400

        safe_name = os.path.basename(file.filename)
        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in _AUDIO_EXTENSIONS:
            return jsonify({'error': 'Unsupported format. Use WAV, AIFF, FLAC, OGG, or MP3.'}), 400

        try:
            import librosa
            import base64

            file_data = file.read()
            if len(file_data) > _AUDIO_MAX_BYTES:
                return jsonify({'error': 'File too large. Maximum size is 100 MB'}), 400

            # Load (mono, native SR, max 5 minutes)
            y, sr = librosa.load(io.BytesIO(file_data), sr=None, mono=True, duration=300.0)

            # Adaptive hop so we get ≤1400 time frames
            n_mels    = 256
            max_frames = 1400
            hop_length = max(int(len(y) / max_frames), 256)
            fmax       = min(sr // 2, 20000)

            S    = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=n_mels,
                                                   hop_length=hop_length, fmax=fmax)
            S_db = librosa.power_to_db(S, ref=np.max)

            # Normalise to 0-255 (dB range -80 to 0)
            normed = np.clip((S_db + 80.0) / 80.0 * 255.0, 0, 255).astype(np.uint8)

            # Flip rows so row 0 = highest frequency
            normed = np.flipud(normed)

            data_b64 = base64.b64encode(normed.tobytes()).decode('ascii')

            return jsonify({
                'frames':      int(normed.shape[1]),
                'bins':        int(normed.shape[0]),
                'data_b64':    data_b64,
                'duration':    round(float(len(y) / sr), 2),
                'sample_rate': int(sr),
                'fmax':        int(fmax),
                'filename':    safe_name,
            }), 200

        except Exception as exc:
            app.logger.error("Spectrogram failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Spectrogram failed: {exc}'}), 400

    @app.route('/api/stems/download-zip/<job_id>')
    def stems_download_zip(job_id):
        """Download all stems as a single ZIP archive."""
        job = _STEMS_JOBS.get(job_id)
        if not job or job['status'] != 'complete':
            return jsonify({'error': 'Job not ready or not found'}), 404

        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for stem, path in job['stems'].items():
                zf.write(path, arcname=f"{job['filename']}-{stem}.wav")
        zip_buffer.seek(0)

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"{job['filename']}-stems.zip",
        )

    _MIDI_EXAMPLES_DIR = Path(__file__).parent.parent / 'midi_examples'

    @app.route('/api/synth/demos')
    def synth_demos():
        """Return a sorted list of MIDI demo filenames."""
        if not _MIDI_EXAMPLES_DIR.is_dir():
            return jsonify({'demos': []})
        names = sorted(
            f.name for f in _MIDI_EXAMPLES_DIR.iterdir()
            if f.suffix.lower() in ('.mid', '.midi')
        )
        return jsonify({'demos': names})

    @app.route('/api/synth/demos/<path:filename>')
    def synth_demo_load(filename):
        """Parse a bundled demo MIDI file and return note events."""
        safe = os.path.basename(filename)
        path = _MIDI_EXAMPLES_DIR / safe
        if not path.is_file() or path.suffix.lower() not in ('.mid', '.midi'):
            return jsonify({'error': 'Demo not found'}), 404
        try:
            file_data      = _sanitize_midi_bytes(path.read_bytes())
            mid            = mido.MidiFile(file=io.BytesIO(file_data))
            ticks_per_beat = mid.ticks_per_beat
            tempo          = 500000
            bpm            = 120.0
            abs_time       = 0.0
            note_on_map    = {}
            events         = []
            for msg in mido.merge_tracks(mid.tracks):
                abs_time += mido.tick2second(msg.time, ticks_per_beat, tempo)
                if msg.type == 'set_tempo':
                    tempo = msg.tempo
                    bpm   = round(60_000_000 / tempo, 2)
                elif msg.type == 'note_on' and msg.velocity > 0:
                    note_on_map[(msg.note, getattr(msg, 'channel', 0))] = (abs_time, msg.velocity)
                elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                    key = (msg.note, getattr(msg, 'channel', 0))
                    if key in note_on_map:
                        start, vel = note_on_map.pop(key)
                        dur = abs_time - start
                        if dur > 0:
                            events.append({
                                'note':     msg.note,
                                'time':     round(start, 4),
                                'duration': round(max(dur, 0.05), 4),
                                'velocity': vel,
                            })
            events.sort(key=lambda e: e['time'])
            events = events[:300]
            return jsonify({'events': events, 'bpm': bpm,
                            'event_count': len(events), 'filename': safe})
        except Exception as exc:
            app.logger.error("Demo MIDI parse failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Parse failed: {exc}'}), 400

    @app.route('/api/synth/parse-midi', methods=['POST'])
    def synth_parse_midi():
        """Parse a MIDI file and return note events as JSON for the browser synth."""
        if 'midi_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        file = request.files['midi_file']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400
        safe_name = os.path.basename(file.filename)
        if not safe_name.lower().endswith(('.mid', '.midi')):
            return jsonify({'error': 'File must be a MIDI file (.mid or .midi)'}), 400

        try:
            file_data     = _sanitize_midi_bytes(file.read())
            mid           = mido.MidiFile(file=io.BytesIO(file_data))
            ticks_per_beat = mid.ticks_per_beat
            tempo          = 500000  # default 120 BPM
            bpm            = 120.0

            abs_time    = 0.0
            note_on_map = {}   # (note, channel) → (start_sec, velocity)
            events      = []

            for msg in mido.merge_tracks(mid.tracks):
                abs_time += mido.tick2second(msg.time, ticks_per_beat, tempo)
                if msg.type == 'set_tempo':
                    tempo = msg.tempo
                    bpm   = round(60_000_000 / tempo, 2)
                elif msg.type == 'note_on' and msg.velocity > 0:
                    note_on_map[(msg.note, getattr(msg, 'channel', 0))] = (abs_time, msg.velocity)
                elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                    key = (msg.note, getattr(msg, 'channel', 0))
                    if key in note_on_map:
                        start, vel = note_on_map.pop(key)
                        dur = abs_time - start
                        if dur > 0:
                            events.append({
                                'note':     msg.note,
                                'time':     round(start, 4),
                                'duration': round(max(dur, 0.05), 4),
                                'velocity': vel,
                            })

            events.sort(key=lambda e: e['time'])
            events = events[:300]

            return jsonify({
                'events':      events,
                'bpm':         bpm,
                'event_count': len(events),
                'filename':    safe_name,
            })
        except Exception as exc:
            app.logger.error("Synth MIDI parse failed: %s", exc, exc_info=True)
            return jsonify({'error': f'MIDI parse failed: {exc}'}), 400

    @app.route('/api/sheet', methods=['POST'])
    def midi_to_sheet():
        """
        Convert an uploaded MIDI file to sheet music.

        Returns JSON with rendered SVG pages and a job_id for MusicXML download.
        """
        if 'midi_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['midi_file']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400

        safe_name = os.path.basename(file.filename)
        if not safe_name.lower().endswith(('.mid', '.midi')):
            return jsonify({'error': 'File must be a MIDI file (.mid or .midi)'}), 400

        try:
            from music21 import converter as m21converter
            import verovio

            file_data = _sanitize_midi_bytes(file.read())
            stem = os.path.splitext(safe_name)[0]

            # Write MIDI to temp file (music21 converter is most reliable via path)
            tmpdir = tempfile.mkdtemp()
            midi_tmp = os.path.join(tmpdir, safe_name)
            with open(midi_tmp, 'wb') as f:
                f.write(file_data)

            score = m21converter.parse(midi_tmp)
            score.makeNotation(inPlace=True)

            # Title from metadata or filename
            title = stem
            if score.metadata and score.metadata.title:
                title = score.metadata.title

            # Export MusicXML
            xml_path = os.path.join(tmpdir, f'{stem}.musicxml')
            score.write('musicxml', fp=xml_path)
            with open(xml_path, 'r', encoding='utf-8') as f:
                xml_string = f.read()

            # Render all pages to SVG
            tk = verovio.toolkit()
            tk.setOptions({
                'pageWidth':        2100,
                'adjustPageHeight': True,
                'scale':            45,
                'footer':           'none',
                'header':           'none',
            })
            tk.loadData(xml_string)
            page_count = tk.getPageCount()
            svgs = [tk.renderToSVG(p) for p in range(1, page_count + 1)]

            job_id = str(uuid.uuid4())
            _SHEET_JOBS[job_id] = {'tmpdir': tmpdir, 'stem': stem, 'xml_path': xml_path}
            Timer(_MASTER_JOB_TTL, _cleanup_sheet_job, args=[job_id]).start()

            return jsonify({
                'job_id':     job_id,
                'title':      title,
                'page_count': page_count,
                'svgs':       svgs,
            }), 200

        except Exception as exc:
            app.logger.error("MIDI to sheet failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Conversion failed: {exc}'}), 400

    @app.route('/api/sheet/download/<job_id>')
    def sheet_download(job_id):
        """Download the MusicXML file for the converted score."""
        job = _SHEET_JOBS.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found or expired'}), 404
        return send_file(
            job['xml_path'],
            mimetype='application/vnd.recordare.musicxml+xml',
            as_attachment=True,
            download_name=f"{job['stem']}.musicxml",
        )

    @app.route('/api/convert', methods=['POST'])
    def convert_audio():
        """
        Convert an audio file between WAV and MP3 (or other supported formats).

        Expects multipart form with:
          - 'audio': the source audio file
          - 'target_format': 'wav' or 'mp3'

        Returns JSON with job_id and download_name on success.
        """
        if 'audio' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['audio']
        if not file or not file.filename:
            return jsonify({'error': 'No file selected'}), 400

        safe_name = os.path.basename(file.filename)
        src_ext = os.path.splitext(safe_name)[1].lower()
        if src_ext not in _AUDIO_EXTENSIONS:
            return jsonify({'error': f'Unsupported format "{src_ext}". Use WAV, MP3, AIFF, FLAC, or OGG.'}), 400

        target_fmt = request.form.get('target_format', 'wav').lower().strip('.')
        if target_fmt not in ('wav', 'mp3', 'flac', 'ogg', 'aiff'):
            return jsonify({'error': f'Unsupported target format "{target_fmt}"'}), 400

        src_fmt = src_ext.lstrip('.')
        if src_fmt in ('aif',):
            src_fmt = 'aiff'
        if src_fmt == target_fmt:
            return jsonify({'error': f'File is already {target_fmt.upper()}'}), 400

        try:
            file_data = file.read()
            if len(file_data) > _AUDIO_MAX_BYTES:
                return jsonify({'error': 'File too large. Maximum size is 100 MB'}), 400

            data, rate = sf.read(io.BytesIO(file_data), always_2d=True)

            stem = os.path.splitext(safe_name)[0]
            download_name = f'{stem}.{target_fmt}'

            # Subtype selection
            if target_fmt == 'mp3':
                subtype = 'MPEG_LAYER_III'
            elif target_fmt == 'flac':
                subtype = 'PCM_24'
            elif target_fmt in ('wav', 'aiff'):
                subtype = 'PCM_24'
            else:
                subtype = None  # soundfile default

            tmpdir   = tempfile.mkdtemp()
            out_path = os.path.join(tmpdir, download_name)

            write_kwargs = {'subtype': subtype} if subtype else {}
            sf.write(out_path, data, rate, **write_kwargs)

            job_id = str(uuid.uuid4())
            _CONVERT_JOBS[job_id] = {
                'tmpdir':        tmpdir,
                'download_name': download_name,
                'target_fmt':    target_fmt,
            }
            Timer(_MASTER_JOB_TTL, _cleanup_convert_job, args=[job_id]).start()

            return jsonify({
                'job_id':        job_id,
                'download_name': download_name,
                'source_fmt':    src_fmt,
                'target_fmt':    target_fmt,
                'sample_rate':   rate,
                'channels':      data.shape[1] if data.ndim > 1 else 1,
            }), 200

        except Exception as exc:
            app.logger.error("Audio conversion failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Conversion failed: {exc}'}), 400

    @app.route('/api/convert/download/<job_id>')
    def convert_download(job_id):
        """Download the converted audio file."""
        job = _CONVERT_JOBS.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found or expired'}), 404

        out_path = os.path.join(job['tmpdir'], job['download_name'])
        mime_map = {
            'wav':  'audio/wav',
            'mp3':  'audio/mpeg',
            'flac': 'audio/flac',
            'ogg':  'audio/ogg',
            'aiff': 'audio/aiff',
        }
        mime = mime_map.get(job['target_fmt'], 'application/octet-stream')
        return send_file(
            out_path,
            mimetype=mime,
            as_attachment=True,
            download_name=job['download_name'],
        )

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({'error': 'Request too large. Maximum is 100 MB per file (250 MB total for mastering)'}), 413

    return app


def run(host: str = '127.0.0.1', port: int = 8010, debug: bool = False):
    """Run the web server."""
    app = create_app()
    app.run(host=host, port=port, debug=debug)


if __name__ == '__main__':
    run(debug=True)
