# Atmo Audio Toolbox

A local-first web app for audio analysis, mastering, and production. Drop in an audio or MIDI file and get deep insight into its structure — frequency content, loudness, dynamics, tonal character, and more. All processing runs on your own machine; nothing is uploaded to a cloud service.

---

## Tools

### Tonal Profile
Analyzes the musical and acoustic DNA of an audio file.

- **Key & Mode** — detected tonic, mode (major/minor/modal), and confidence score
- **Tempo** — BPM, stability, ambient classification, double-time detection
- **Dynamics** — RMS energy curve over time, energy spike detection, dynamic range
- **Stereo & Imaging** — stereo width, mid/side energy balance, phase correlation, mono compatibility
- **Bass Movement** — piano-roll timeline showing which bass notes are active across the track, pitch-sorted by MIDI value with chromatic color coding

### Loudness
Measures and corrects loudness for streaming, broadcast, and distribution.

- **Loudness analysis** — integrated LUFS, true peak (dBTP), dynamic range, and clipping detection visualized as an energy curve with color-coded bars
- **Normalize** — target any LUFS value (default −14 LUFS for streaming)
- **Remove Clipping** — de-clips peaks exceeding 0 dBFS and reports before/after peak values

### Spectrogram
Renders a full mel spectrogram of the audio file — frequency content (Hz) on the Y axis, time on the X axis, energy as color intensity. Useful for spotting problem frequencies, checking high-end content, and seeing the tonal fingerprint of a recording.

### MIDI Analysis
Analyzes MIDI files exported from any source, including AI music generators like Suno that produce corrupt metadata.

- Key, mode, and modulation path detection (Krumhansl-Schmuckler)
- Tempo, time signature, and tempo-change timeline
- Velocity dynamics, humanness score, and quantization analysis
- **Humanize Velocity** — applies gaussian velocity variation at three intensity levels
- **Normalize Velocity** — shifts average velocity to mp–mf range, preserving relative dynamics
- **Humanize Timing** — nudges note onsets off the beat grid to remove the quantized feel

### Sheet Music
Transcribes audio to a sheet music PDF using OMR (optical music recognition) processing.

### Stem Splitter
Separates a mixed track into four stems using AI source separation:
- Vocals · Drums · Bass · Other instruments

Each stem downloads as a full-quality WAV file. A ZIP download of all stems is also available.

### Convert
Converts audio files between WAV, AIFF, FLAC, OGG, and MP3 with configurable bit depth and sample rate.

---

## Installation

Requires Python 3.9+.

```bash
git clone https://github.com/KindOfBlueTeam/atmo-audio-tools.git
cd atmo-audio-tools
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -e ".[web]"
```

Additional dependencies for audio tools (librosa, demucs, etc.) are listed in `requirements.txt`:

```bash
pip install -r requirements.txt
```

---

## Usage

```bash
atmo-audio-tools web
```

Opens at [http://localhost:8010](http://localhost:8010). Drag and drop audio files (WAV, AIFF, FLAC, OGG, MP3) or MIDI files into any tool.

Options:

```bash
atmo-audio-tools web --host 0.0.0.0 --port 8080 --debug
```

---

## API

All endpoints accept `multipart/form-data`. Audio endpoints accept an `audio` field; MIDI endpoints accept a `midi_file` field.

| Endpoint | Method | Description |
|---|---|---|
| `/api/analyze-audio` | POST | Tonal profile analysis — returns JSON with key, tempo, dynamics, stereo, bass timeline |
| `/api/analyze-loudness` | POST | Loudness analysis — returns LUFS, true peak, energy curve, structure |
| `/api/loudness` | POST | Normalize loudness to a target LUFS — returns processed audio file |
| `/api/declip` | POST | Remove clipping — returns processed audio file |
| `/api/spectrogram` | POST | Mel spectrogram — returns base64-encoded pixel data + metadata |
| `/api/stems` | POST | Start stem separation job — returns job ID |
| `/api/stems/status/<job_id>` | GET | Poll stem separation job status |
| `/api/stems/download/<job_id>/<stem>` | GET | Download individual stem WAV |
| `/api/stems/download-zip/<job_id>` | GET | Download all stems as ZIP |
| `/api/sheet` | POST | Start sheet music transcription — returns job ID |
| `/api/convert` | POST | Convert audio format — returns converted file |
| `/api/analyze` | POST | MIDI analysis — returns JSON |
| `/api/humanize` | POST | MIDI velocity humanization (intensity 1–3) |
| `/api/normalize-velocity` | POST | MIDI velocity normalization |
| `/api/humanize-timing` | POST | MIDI timing humanization (intensity 1–3) |

---

## Project Structure

```
atmo_audio_tools/
├── audio_analyzer.py     # Audio analysis: key, tempo, dynamics, stereo, bass timeline, loudness
├── analyzer.py           # MIDI analysis orchestration
├── key_detection.py      # Krumhansl-Schmuckler key & modulation detection
├── tempo.py              # Tempo and BPM analysis
├── dynamics.py           # MIDI velocity analysis
├── quantization.py       # MIDI timing grid analysis
├── structure.py          # MIDI note range, polyphony, instruments
├── midi_parser.py        # Corrupt-tolerant MIDI parser
├── web.py                # Flask app and all API endpoints
├── cli.py                # CLI entry point
├── templates/
│   └── index.html        # Single-page web UI
└── static/
    ├── app.js            # Frontend logic
    └── style.css         # Dark theme styles
```

---

## Requirements

- Python 3.9+
- Flask · librosa · numpy · scipy · mido
- demucs (stem splitting)
- Additional dependencies in `requirements.txt`
