"""Web interface for MIDI analysis."""
from __future__ import annotations

import io
import os
import tempfile
import threading
from pathlib import Path

import mido
import numpy as np
import soundfile as sf
import pyloudnorm as pyln
from flask import Flask, render_template, request, jsonify, send_file

from .analyzer import MIDIAnalyzer
from .audio_analyzer import analyze_audio

_AUDIO_EXTENSIONS = {'.wav', '.aif', '.aiff', '.flac', '.ogg', '.mp3'}
_AUDIO_MAX_BYTES  = 100 * 1024 * 1024  # 100 MB

# Limit concurrent audio analyses — each one peaks at ~2 GB RAM
_AUDIO_SEMAPHORE = threading.Semaphore(2)


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
    app.config['MAX_CONTENT_LENGTH'] = _AUDIO_MAX_BYTES  # covers audio uploads

    @app.after_request
    def set_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'"
        )
        return response

    @app.route('/')
    def index():
        """Serve the main analysis page."""
        return render_template('index.html')

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
        Apply reference mastering to a target audio file using Matchering.

        Expects a multipart form with:
          - 'target': the audio file to master (WAV, AIFF, FLAC)
          - 'reference': the reference track to match loudness/EQ to

        Returns the mastered WAV as a download.
        """
        if 'target' not in request.files or 'reference' not in request.files:
            return jsonify({'error': 'Both target and reference files are required'}), 400

        target_file = request.files['target']
        ref_file    = request.files['reference']

        if not target_file.filename or not ref_file.filename:
            return jsonify({'error': 'Both target and reference files must be selected'}), 400

        _MASTER_EXTENSIONS = {'.wav', '.aif', '.aiff', '.flac'}
        target_ext = os.path.splitext(os.path.basename(target_file.filename))[1].lower()
        ref_ext    = os.path.splitext(os.path.basename(ref_file.filename))[1].lower()

        if target_ext not in _MASTER_EXTENSIONS:
            return jsonify({'error': f'Target must be WAV, AIFF, or FLAC (got {target_ext})'}), 400
        if ref_ext not in _MASTER_EXTENSIONS:
            return jsonify({'error': f'Reference must be WAV, AIFF, or FLAC (got {ref_ext})'}), 400

        try:
            import matchering as mg
        except ImportError:
            return jsonify({'error': 'Matchering is not installed on this server'}), 500

        if not _AUDIO_SEMAPHORE.acquire(blocking=False):
            return jsonify({'error': 'Server is busy — please try again in a moment'}), 503

        try:
            target_data = target_file.read()
            ref_data    = ref_file.read()

            if len(target_data) > _AUDIO_MAX_BYTES or len(ref_data) > _AUDIO_MAX_BYTES:
                return jsonify({'error': 'File too large. Maximum size is 100 MB'}), 400

            with tempfile.TemporaryDirectory() as tmpdir:
                target_path = os.path.join(tmpdir, f'target{target_ext}')
                ref_path    = os.path.join(tmpdir, f'reference{ref_ext}')
                output_path = os.path.join(tmpdir, 'mastered.wav')

                with open(target_path, 'wb') as f:
                    f.write(target_data)
                with open(ref_path, 'wb') as f:
                    f.write(ref_data)

                before = _audio_metrics(target_path)

                mg.process(
                    target=target_path,
                    reference=ref_path,
                    results=[mg.Result(output_path, subtype='PCM_24')],
                )

                after = _audio_metrics(output_path)

                with open(output_path, 'rb') as f:
                    mastered_bytes = f.read()

            output = io.BytesIO(mastered_bytes)
            output.seek(0)

            stem = os.path.splitext(os.path.basename(target_file.filename))[0]
            download_name = f"{stem}-mastered.wav"

            resp = send_file(
                output,
                mimetype='audio/wav',
                as_attachment=True,
                download_name=download_name,
            )
            for key, val in before.items():
                resp.headers[f'X-Master-Before-{key}'] = str(val)
            for key, val in after.items():
                resp.headers[f'X-Master-After-{key}'] = str(val)
            resp.headers['Access-Control-Expose-Headers'] = (
                'X-Master-Before-lufs,X-Master-Before-peak_db,'
                'X-Master-Before-rms_db,X-Master-Before-dr,'
                'X-Master-After-lufs,X-Master-After-peak_db,'
                'X-Master-After-rms_db,X-Master-After-dr'
            )
            return resp

        except Exception as exc:
            app.logger.error("Mastering failed: %s", exc, exc_info=True)
            return jsonify({'error': f'Mastering failed: {exc}'}), 400

        finally:
            _AUDIO_SEMAPHORE.release()

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({'error': 'File too large. Maximum size is 16MB'}), 413

    return app


def run(host: str = '127.0.0.1', port: int = 8010, debug: bool = False):
    """Run the web server."""
    app = create_app()
    app.run(host=host, port=port, debug=debug)


if __name__ == '__main__':
    run(debug=True)
