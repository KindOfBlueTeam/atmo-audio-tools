# Atmo Audio Toolbox

A Python tool for comprehensive audio and MIDI file analysis, with a web UI and CLI. Designed to handle real-world MIDI files including those exported from AI music generators like Suno, which often contain corrupt metadata.

---

## Features

### Analysis
| Feature | Description |
|---|---|
| **Key & Mode** | Krumhansl-Schmuckler key detection across major/minor/modal flavors |
| **Modulation** | Detects high-confidence key changes and displays the full modulation path (e.g. `C → F#m → Bb`) |
| **Tempo** | Initial BPM, tempo type (constant/variable), BPM range, and tempo change timeline |
| **Dynamics** | Average velocity, dynamic range, velocity distribution bar chart, humanness score |
| **Quantization** | Measures how tightly notes align to the 16th-note grid — a "human vs. software" timing score |
| **Structure** | Note count, polyphony, note range, time signature, instruments per channel |

### Actions
| Action | Description |
|---|---|
| **Humanize Velocity** | Adds gaussian velocity variation at three intensity levels — makes machine-generated MIDI sound more naturally played |
| **Normalize Velocity** | Shifts all velocities so the average lands in the mp–mf range, preserving relative dynamics |
| **Humanize Timing** | Nudges note onsets slightly off the beat grid at three intensity levels — removes the "quantized" feel |

All processing is done in memory. No files are written to disk on the server.

---

## Screenshots

The web interface provides drag-and-drop file upload and displays all analysis results in a clean dark-themed layout.

---

## Installation

Requires Python 3.9+.

```bash
git clone https://github.com/KindOfBlueTeam/atmo-audio-toolbox.git
cd atmo-audio-toolbox
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -e ".[web]"
```

---

## Usage

### Web Interface

```bash
atmo-audio-toolbox web
```

Opens at [http://localhost:8010](http://localhost:8010). Drag and drop any `.mid` or `.midi` file to analyze it. Use the action buttons to download humanized or normalized versions.

Options:
```bash
atmo-audio-toolbox web --host 0.0.0.0 --port 8080 --debug
```

### Command Line

```bash
atmo-audio-toolbox analyze path/to/file.mid
atmo-audio-toolbox analyze path/to/file.mid --json
```

---

## Project Structure

```
atmo-audio-toolbox/
├── midi_analysis/
│   ├── analyzer.py        # Orchestrates all analysis modules
│   ├── midi_parser.py     # Lightweight parser tolerant of corrupt MIDI files
│   ├── key_detection.py   # Krumhansl-Schmuckler key & modulation detection
│   ├── tempo.py           # Tempo and BPM analysis
│   ├── dynamics.py        # Velocity analysis and humanness scoring
│   ├── quantization.py    # Timing grid alignment analysis
│   ├── structure.py       # Note range, polyphony, instruments
│   ├── web.py             # Flask app with analyze/humanize/normalize endpoints
│   ├── cli.py             # Click CLI (analyze + web subcommands)
│   ├── templates/
│   │   └── index.html     # Web UI
│   └── static/
│       ├── app.js         # Frontend logic
│       └── style.css      # Dark theme styles
├── midi_examples/         # Sample MIDI files including Suno exports
├── tests/
├── requirements.txt
└── pyproject.toml
```

---

## API

The web server exposes a simple REST API:

| Endpoint | Method | Description |
|---|---|---|
| `/api/analyze` | POST | Analyze a MIDI file, returns JSON |
| `/api/humanize` | POST | Randomize velocities (intensity 1–3), returns `.mid` |
| `/api/normalize-velocity` | POST | Shift velocities to mp–mf average, returns `.mid` |
| `/api/humanize-timing` | POST | Nudge note onsets off the beat grid (intensity 1–3), returns `.mid` |

All endpoints accept `multipart/form-data` with a `midi_file` field. Max file size: 16MB.

---

## Humanization Details

### Velocity Humanization
Applies gaussian noise (σ = 5 / 12 / 20 velocity units for intensity 1 / 2 / 3) to each note's velocity, plus a small accent on downbeats and beat 3. Velocities are clamped to 1–127.

### Velocity Normalization
Computes the mean velocity across all notes and applies a constant offset so the new mean is 72 (mf). Relative dynamics are fully preserved.

### Timing Humanization
Converts all events to absolute ticks, applies gaussian noise (σ = 5% / 10% / 17% of a 16th note for intensity 1 / 2 / 3) to each note onset, re-sorts events, then converts back to delta times. Note-off events at the same tick are always sorted before note-on events to prevent stuck notes.

---

## Corrupt MIDI Handling

The custom `midi_parser.py` ignores all meta events (key signatures, tempo, lyrics, etc.) and extracts only note-on/note-off events. This allows it to parse files that crash standard MIDI libraries — including many files exported from Suno, which write out-of-range key signature values. The web endpoints that process files for download also sanitize key signature bytes before passing them to `mido`.

---

## Audio Analysis — Field Reference

### Tonality

| Field | Range | Interpretation |
|---|---|---|
| `tonic` | Note name (C–B) | The pitch class the key resolves to ("home base") |
| `mode` | `major` / `minor` / `harmonic minor` | Broadly major = bright, minor = dark |
| `key` | e.g. `"F# minor"` | Human-readable key label |
| `key_confidence` | **0–100 %** | How strongly the pitch-class histogram matches the detected key. ≥ 70% = reliable; < 40% = modal/ambiguous |
| `inferred_harmonic_root` | Note name | The pitch class that functions as the harmonic centre in the audio. Usually matches `tonic`; diverges for drones, pedal notes, or pieces in an atypical mode |
| `harmonic_root_diverges_from_tonic` | bool | True when `inferred_harmonic_root` ≠ `tonic`. See `harmonic_root_divergence_reason` for explanation |
| `root_stability_pct` | 0–100 % | Percentage of analysis windows in which the harmonic root was the most prominent pitch class. Higher = more tonally grounded |
| `dominant_bass_pitch_class` | Note name | The most common pitch class in the bass register (sub + low bands). Often matches `tonic` but reveals pedal-point deviations |

### Tempo & Rhythm

| Field | Range | Interpretation |
|---|---|---|
| `tempo_bpm` | float | Detected tempo in beats per minute |
| `beat_count` | int | Estimated total beats: `tempo_bpm × duration_seconds / 60`. Not from onset detection |
| `tempo_stability` | 0–1 | Variance of the dominant tempo across 8 time windows. 1.0 = perfectly locked; < 0.65 = significant drift |
| `tempo_stability_label` | string | `"Very stable"` / `"Stable"` / `"Moderate drift"` / `"High drift"` |
| `tempo_confidence` | 0–1 | Normalised score margin between the best and second tempo equivalence group. Low confidence means two equally plausible tempos competed |
| `beat_grid_confidence` | 0–1 | Composite: how certain we are a stable beat grid exists. Combines stability, group dominance, low-frequency pulse, and cross-window consistency. High for any track with a clear pulse, including ambient |
| `downbeat_confidence` | 0–1 | How clearly bar-level "beat 1" accents are articulated. **Naturally low for ambient / pad-heavy tracks** even when `beat_grid_confidence` is high. High for drum-forward tracks |
| `double_time_detected` | bool | True when the best tempo group contains a competitive 2× candidate — the tempogram evidence was ambiguous between the selected BPM and its double |
| `is_ambient` | bool | True when the multi-signal ambient classifier scores ≥ 0.40. Weights: spectral HF suppression (0.25), air suppression (0.15), sustain bias (0.20), low/mid bias (0.20), dynamic softness (0.10), downbeat weakness (0.10), minus transient density penalty (0.20) |

### Scale notes
- `key_confidence` is 0–100 (percent). All other `*_confidence` and `*_score` fields in the audio analysis are **0–1**.
- `root_stability_pct`, `root_rank1_pct`, `root_top2_pct`, and `dominant_tonic_resolution_pct` are **0–100** (percent).

---

## Requirements

- Python 3.9+
- `mido >= 1.3`
- `numpy >= 1.24`
- `click >= 8.0`
- `Flask >= 2.0` (web interface only)
