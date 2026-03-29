/* ============================================================
   Atmo Synth — 2-oscillator subtractive synthesizer
   Web Audio API, fully client-side
   ============================================================ */

// VCF cutoff operates within this range throughout the engine
const VCF_MIN =  1000;
const VCF_MAX = 10000;

const SYNTH_PRESETS = {
    electrofunk: {
        name: 'Electrofunk Bass',
        osc1Wave: 'sawtooth', osc1Oct: 0,   osc1Fine: 0,   osc1Mix: 0.75,
        osc2Wave: 'sawtooth', osc2Oct: -1,  osc2Fine: -4,  osc2Mix: 0.55, osc2Detune: -4,
        vcfCut: 1500, vcfRes: 0.55, vcfEnv: 0.35, vcfDrv: 0.18,
        vcfA: 0.005,  vcfD: 0.18,  vcfS: 0.04,   vcfR: 0.10,
        vcaA: 0.006,  vcaD: 0.12,  vcaS: 0.70,   vcaR: 0.08,
        lfoRate: 0.5, lfoDepth: 0, lfoDest: 'filter', lfoWave: 'sine',
        glide: 0.04,  volume: 0.50,
    },
    subbass: {
        name: 'Sub Bass',
        osc1Wave: 'sine',     osc1Oct: -1,  osc1Fine: 0,   osc1Mix: 0.90,
        osc2Wave: 'triangle', osc2Oct: -1,  osc2Fine: 0,   osc2Mix: 0.30, osc2Detune: 0,
        vcfCut: 1000, vcfRes: 0.20, vcfEnv: 0.15, vcfDrv: 0.05,
        vcfA: 0.003,  vcfD: 0.25,  vcfS: 0.04,   vcfR: 0.12,
        vcaA: 0.005,  vcaD: 0.20,  vcaS: 0.80,   vcaR: 0.14,
        lfoRate: 0.5, lfoDepth: 0, lfoDest: 'filter', lfoWave: 'sine',
        glide: 0.06,  volume: 0.55,
    },
    funkywah: {
        name: 'Funky Wah',
        osc1Wave: 'sawtooth', osc1Oct: 0,   osc1Fine: 0,   osc1Mix: 0.80,
        osc2Wave: 'square',   osc2Oct: 0,   osc2Fine: 7,   osc2Mix: 0.35, osc2Detune: 7,
        vcfCut: 1200, vcfRes: 0.68, vcfEnv: 0.55, vcfDrv: 0.25,
        vcfA: 0.004,  vcfD: 0.22,  vcfS: 0.04,   vcfR: 0.10,
        vcaA: 0.005,  vcaD: 0.15,  vcaS: 0.65,   vcaR: 0.10,
        lfoRate: 3.5, lfoDepth: 0.28, lfoDest: 'filter', lfoWave: 'sine',
        glide: 0.02,  volume: 0.48,
    },
    mooglead: {
        name: 'Moog Lead',
        osc1Wave: 'sawtooth', osc1Oct: 0,   osc1Fine: 0,   osc1Mix: 0.70,
        osc2Wave: 'sawtooth', osc2Oct: 0,   osc2Fine: 5,   osc2Mix: 0.65, osc2Detune: 5,
        vcfCut: 2000, vcfRes: 0.48, vcfEnv: 0.42, vcfDrv: 0.14,
        vcfA: 0.010,  vcfD: 0.28,  vcfS: 0.22,   vcfR: 0.20,
        vcaA: 0.010,  vcaD: 0.20,  vcaS: 0.60,   vcaR: 0.25,
        lfoRate: 5.0, lfoDepth: 0.15, lfoDest: 'pitch', lfoWave: 'sine',
        glide: 0.08,  volume: 0.46,
    },
};

/* ── SubtractiveSynth ─────────────────────────────────────────────── */

class SubtractiveSynth {
    constructor(audioCtx) {
        this.ctx    = audioCtx;
        this.params = { ...SYNTH_PRESETS.electrofunk };
        this._osc1  = null;
        this._osc2  = null;
        this._activeNote = null;
        this._lastFreq   = null;

        // Signal chain: OSC1+OSC2 → mix → filter1 → filter2 → shaper → amp → master → out
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.params.volume;
        this.masterGain.connect(this.ctx.destination);

        this.ampGain = this.ctx.createGain();
        this.ampGain.gain.value = 0.0001;
        this.ampGain.connect(this.masterGain);

        // Waveshaper for drive/saturation
        this.shaper = this.ctx.createWaveShaper();
        this.shaper.oversample = '2x';
        this._updateShaper(this.params.vcfDrv);
        this.shaper.connect(this.ampGain);

        // Two cascaded lowpass biquads → approx 24 dB/oct Moog-style roll-off
        this.filter2 = this.ctx.createBiquadFilter();
        this.filter2.type = 'lowpass';
        this.filter1 = this.ctx.createBiquadFilter();
        this.filter1.type = 'lowpass';
        this.filter1.connect(this.filter2);
        this.filter2.connect(this.shaper);

        // Additive filter frequency: base (cutoff knob) + env (per-note envelope delta)
        // BiquadFilter.frequency is set to 0 so all frequency comes from these two sources.
        // This way the cutoff knob and the envelope each own a separate AudioParam and
        // can never overwrite each other's scheduled values.
        this.filter1.frequency.value = 0;
        this.filter2.frequency.value = 0;

        this.filterBase = this.ctx.createConstantSource();
        this.filterBase.offset.value = this.params.vcfCut;
        this.filterBase.connect(this.filter1.frequency);
        this.filterBase.connect(this.filter2.frequency);
        this.filterBase.start();

        this.filterEnv = this.ctx.createConstantSource();
        this.filterEnv.offset.value = 0;
        this.filterEnv.connect(this.filter1.frequency);
        this.filterEnv.connect(this.filter2.frequency);
        this.filterEnv.start();

        this._updateFilterBase();

        // Oscillator mix bus
        this.mixGain = this.ctx.createGain();
        this.mixGain.gain.value = 1.0;
        this.mixGain.connect(this.filter1);

        this.osc1Gain = this.ctx.createGain();
        this.osc1Gain.gain.value = this.params.osc1Mix;
        this.osc1Gain.connect(this.mixGain);

        this.osc2Gain = this.ctx.createGain();
        this.osc2Gain.gain.value = this.params.osc2Mix;
        this.osc2Gain.connect(this.mixGain);

        // LFO
        this.lfo     = this.ctx.createOscillator();
        this.lfo.type = this.params.lfoWave;
        this.lfo.frequency.value = this.params.lfoRate;
        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.value = 0;
        this.lfo.connect(this.lfoGain);
        this.lfo.start();
        this._connectLfo();
    }

    _updateShaper(amount) {
        const n = 256;
        const curve = new Float32Array(n);
        const k = amount * 80;
        for (let i = 0; i < n; i++) {
            const x = (2 * i / (n - 1)) - 1;
            curve[i] = k > 0 ? (1 + k / 100) * x / (1 + (k / 100) * Math.abs(x)) : x;
        }
        this.shaper.curve = curve;
    }

    _updateFilterBase() {
        const freq = this.params.vcfCut;
        const q    = 0.5 + this.params.vcfRes * 17.5;
        const t    = this.ctx.currentTime;
        // Only touch filterBase.offset — never filter.frequency directly.
        // filterEnv.offset is owned exclusively by per-note envelopes.
        const ob = this.filterBase.offset;
        if (ob.cancelAndHoldAtTime) {
            ob.cancelAndHoldAtTime(t);
        } else {
            ob.cancelScheduledValues(t);
        }
        ob.setValueAtTime(freq, t);
        [this.filter1, this.filter2].forEach(f => { f.Q.value = q; });
    }

    _connectLfo() {
        try { this.lfoGain.disconnect(); } catch {}
        const rate  = this.params.lfoRate  || 0;
        const depth = this.params.lfoDepth || 0;
        if (depth < 0.01) { this.lfoGain.gain.value = 0; return; }
        const dest = this.params.lfoDest;
        if (dest === 'filter') {
            this.lfoGain.gain.value = depth * this.params.vcfCut * 2;
            this.lfoGain.connect(this.filterBase.offset);
        } else if (dest === 'amp') {
            this.lfoGain.gain.value = depth * 0.3;
            this.lfoGain.connect(this.ampGain.gain);
        }
        // pitch LFO is connected per-note in noteOn
    }

    noteOn(midiNote, velocity = 100, time = null) {
        const t    = time !== null ? time : this.ctx.currentTime;
        const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
        const vel  = velocity / 127;

        const freq1 = freq
            * Math.pow(2, this.params.osc1Oct)
            * Math.pow(2, this.params.osc1Fine / 1200);
        const freq2 = freq
            * Math.pow(2, this.params.osc2Oct)
            * Math.pow(2, (this.params.osc2Fine + this.params.osc2Detune) / 1200);

        // Stop running oscillators
        this._stopOscs(t);

        // Create fresh one-shot oscillators
        this._osc1 = this.ctx.createOscillator();
        this._osc1.type = this.params.osc1Wave;
        this._osc2 = this.ctx.createOscillator();
        this._osc2.type = this.params.osc2Wave;

        // Glide
        const glide = this.params.glide;
        if (this._lastFreq && glide > 0.005) {
            const lf1 = this._lastFreq * Math.pow(2, this.params.osc1Oct) * Math.pow(2, this.params.osc1Fine / 1200);
            const lf2 = this._lastFreq * Math.pow(2, this.params.osc2Oct) * Math.pow(2, (this.params.osc2Fine + this.params.osc2Detune) / 1200);
            this._osc1.frequency.setValueAtTime(lf1, t);
            this._osc1.frequency.linearRampToValueAtTime(freq1, t + glide);
            this._osc2.frequency.setValueAtTime(lf2, t);
            this._osc2.frequency.linearRampToValueAtTime(freq2, t + glide);
        } else {
            this._osc1.frequency.setValueAtTime(freq1, t);
            this._osc2.frequency.setValueAtTime(freq2, t);
        }

        this._osc1.connect(this.osc1Gain);
        this._osc2.connect(this.osc2Gain);

        // Pitch LFO
        if (this.params.lfoDest === 'pitch' && this.params.lfoDepth > 0.01) {
            const pitchRange = freq * this.params.lfoDepth * 0.1;
            this.lfoGain.gain.setValueAtTime(pitchRange, t);
            try { this.lfoGain.disconnect(); } catch {}
            this.lfoGain.connect(this._osc1.frequency);
            this.lfoGain.connect(this._osc2.frequency);
        }

        this._osc1.start(t);
        this._osc2.start(t);

        this._lastFreq   = freq;
        this._activeNote = midiNote;

        // VCA envelope
        const g = this.ampGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(0.0001, t);
        g.linearRampToValueAtTime(vel * 0.92, t + this.params.vcaA);
        g.linearRampToValueAtTime(vel * this.params.vcaS, t + this.params.vcaA + this.params.vcaD);

        // VCF envelope — operates on filterEnv.offset (delta above filterBase.offset)
        // filterBase.offset is never touched here, so cutoff knob value persists.
        const peakDelta = this.params.vcfEnv * (VCF_MAX - this.params.vcfCut);
        const susDelta  = peakDelta * this.params.vcfS;
        const eg = this.filterEnv.offset;
        eg.cancelScheduledValues(t);
        eg.setValueAtTime(0, t);
        eg.linearRampToValueAtTime(peakDelta, t + this.params.vcfA);
        eg.linearRampToValueAtTime(susDelta,  t + this.params.vcfA + this.params.vcfD);
    }

    noteOff(midiNote, time = null) {
        if (this._activeNote !== midiNote) return;
        const t = time !== null ? time : this.ctx.currentTime;

        // VCA release
        const g = this.ampGain.gain;
        if (g.cancelAndHoldAtTime) {
            g.cancelAndHoldAtTime(t);
        } else {
            g.cancelScheduledValues(t);
            g.setValueAtTime(g.value, t);
        }
        g.linearRampToValueAtTime(0.0001, t + this.params.vcaR);

        // VCF release — ramp filterEnv.offset back to 0 (base cutoff remains in filterBase)
        const eg = this.filterEnv.offset;
        if (eg.cancelAndHoldAtTime) {
            eg.cancelAndHoldAtTime(t);
        } else {
            eg.cancelScheduledValues(t);
            eg.setValueAtTime(eg.value, t);
        }
        eg.linearRampToValueAtTime(0, t + this.params.vcfR);

        // Schedule oscillator stop after release
        const stopAt = t + this.params.vcaR + 0.05;
        if (this._osc1) { try { this._osc1.stop(stopAt); } catch {} }
        if (this._osc2) { try { this._osc2.stop(stopAt); } catch {} }

        this._activeNote = null;
    }

    _stopOscs(t = null) {
        const when = t !== null ? t : this.ctx.currentTime;
        if (this._osc1) { try { this._osc1.stop(when); } catch {} this._osc1 = null; }
        if (this._osc2) { try { this._osc2.stop(when); } catch {} this._osc2 = null; }
    }

    panic() {
        // Silence and kill all running oscillators immediately
        const t = this.ctx.currentTime;
        const g = this.ampGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0.0001, t + 0.02);  // 20ms click-free fade
        this._stopOscs(t + 0.025);
        const eg = this.filterEnv.offset;
        eg.cancelScheduledValues(t);
        eg.setValueAtTime(0, t);
        this._activeNote = null;
    }

    loadPreset(preset) {
        this.params = { ...preset };
        this.masterGain.gain.value  = preset.volume;
        this.osc1Gain.gain.value    = preset.osc1Mix;
        this.osc2Gain.gain.value    = preset.osc2Mix;
        this.lfo.frequency.value    = preset.lfoRate;
        this.lfo.type               = preset.lfoWave;
        this._updateFilterBase();
        this._updateShaper(preset.vcfDrv);
        this._connectLfo();
    }

    setParam(key, value) {
        this.params[key] = value;
        if (key === 'volume')   this.masterGain.gain.value = value;
        if (key === 'osc1Mix')  this.osc1Gain.gain.value   = value;
        if (key === 'osc2Mix')  this.osc2Gain.gain.value   = value;
        if (key === 'vcfCut' || key === 'vcfRes') this._updateFilterBase();
        if (key === 'vcfDrv')   this._updateShaper(value);
        if (key === 'lfoRate')  this.lfo.frequency.value   = value;
        if (key === 'lfoWave')  this.lfo.type              = value;
        if (key === 'lfoRate' || key === 'lfoDepth' || key === 'lfoDest') this._connectLfo();
    }
}

/* ── MidiPlayer ───────────────────────────────────────────────────── */

class MidiPlayer {
    constructor(synth, onNote, onEnd) {
        this.synth   = synth;
        this.onNote  = onNote;  // (midiNote, isOn) → void
        this.onEnd   = onEnd;   // () → void
        this.loop    = false;

        this._active   = false;
        this._events   = null;
        this._fileBpm  = 120;   // BPM embedded in the MIDI file
        this._fireIdx  = 0;     // index of next note-on to fire
        this._pendOffs = [];    // pending note-offs: { offBeat, note }
        this._timer    = null;

        // Beat-position tracking — robust to mid-playback BPM changes.
        // Beat space is defined by the file BPM; we accumulate beats independently
        // of MasterClock rate so changing BPM only affects future notes.
        this._anchorAudio = 0;  // audioCtx time of last anchor point
        this._anchorBeat  = 0;  // beat count at that anchor
        this._curBpm      = 120;
        this._unsubBPM    = null;
    }

    get isPlaying() { return this._active; }

    // Beat position right now, accounting for all BPM changes since play started.
    _beat() {
        return this._anchorBeat +
               (MasterClock.ctx.currentTime - this._anchorAudio) * (this._curBpm / 60);
    }

    // Audio time for a given absolute beat position.
    _audioAt(beat) {
        return this._anchorAudio + (beat - this._anchorBeat) * (60 / this._curBpm);
    }

    play(events, fileBpm) {
        if (this._active) return;
        if (!events || !events.length) return;

        this._events      = events;
        this._fileBpm     = fileBpm || MasterClock.bpm;
        this._fireIdx     = 0;
        this._pendOffs    = [];
        this._active      = true;
        this._curBpm      = MasterClock.bpm;
        this._anchorAudio = MasterClock.ctx.currentTime;
        this._anchorBeat  = 0;

        // Re-anchor on every BPM change so future note times use the new rate.
        this._unsubBPM = MasterClock.onBPM(newBpm => {
            if (!this._active) return;
            this._anchorBeat  = this._beat();
            this._anchorAudio = MasterClock.ctx.currentTime;
            this._curBpm      = newBpm;
        });

        this._poll();
    }

    _poll() {
        if (!this._active) return;

        const ctx      = MasterClock.ctx;
        const now      = ctx.currentTime;
        const curBeat  = this._beat();
        const AHEAD    = 0.10;                              // look-ahead seconds
        const fwdBeat  = curBeat + AHEAD * (this._curBpm / 60);
        const bpfs     = this._fileBpm / 60;               // beats per file-second

        // Fire pending note-offs that fall within the look-ahead window.
        this._pendOffs = this._pendOffs.filter(off => {
            if (off.offBeat > fwdBeat) return true;        // not yet
            const t = Math.max(now, this._audioAt(off.offBeat));
            this.synth.noteOff(off.note, 0, t);
            this.onNote(off.note, false);
            return false;
        });

        // Fire note-ons within the window.
        while (this._fireIdx < this._events.length) {
            const ev     = this._events[this._fireIdx];
            const onBeat = ev.time * bpfs;
            if (onBeat > fwdBeat) break;

            // Only fire if not more than 50 ms in the past (skip stale notes on resume).
            const t = this._audioAt(onBeat);
            if (t > now - 0.05) {
                this.synth.noteOn(ev.note, ev.velocity, Math.max(now, t));
                this.onNote(ev.note, true);
            }
            this._pendOffs.push({ offBeat: (ev.time + ev.duration) * bpfs, note: ev.note });
            this._fireIdx++;
        }

        // Schedule next poll, or detect end-of-song.
        if (this._fireIdx < this._events.length || this._pendOffs.length > 0) {
            this._timer = setTimeout(() => this._poll(), 25);
        } else {
            // All notes fired and all offs handled — wait a moment then wrap up.
            this._timer = setTimeout(() => {
                if (!this._active) return;
                this._active = false;
                this._cleanup();
                if (this.loop && this._events) {
                    this.play(this._events, this._fileBpm);
                } else {
                    this.onEnd && this.onEnd();
                }
            }, 200);
        }
    }

    stop() {
        this._active = false;
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        this._cleanup();
        this._pendOffs = [];
        this.synth.panic();
    }

    _cleanup() {
        if (this._unsubBPM) { this._unsubBPM(); this._unsubBPM = null; }
    }
}

/* ── SynthKnob ────────────────────────────────────────────────────── */

class SynthKnob {
    constructor({ container, label, min, max, value, scale = 'linear', decimals = 2, unit = '', onChange }) {
        this.min      = min;
        this.max      = max;
        this.value    = Math.max(min, Math.min(max, value));
        this.scale    = scale;
        this.decimals = decimals;
        this.unit     = unit;
        this.onChange = onChange;

        const SIZE = 46;
        this.SIZE = SIZE;

        this.el = document.createElement('div');
        this.el.className = 'synth-knob';

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('width',   SIZE);
        this.svg.setAttribute('height',  SIZE);
        this.svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);

        this._bgPath  = this._makePath('none', 'rgba(0,60,150,0.22)', 4);
        this._valPath = this._makePath('none', '#0099ff',              4);
        this._circle  = this._makeCircle(SIZE / 2, SIZE / 2, 11,
            'rgba(6,14,32,0.96)', 'rgba(0,100,200,0.38)', 1.5);
        this._dot = this._makeLine('#00ccff', 2.5);

        this.svg.append(this._bgPath, this._valPath, this._circle, this._dot);

        this._lbl = document.createElement('div');
        this._lbl.className = 'synth-knob-label';
        this._lbl.textContent = label;

        this._val = document.createElement('div');
        this._val.className = 'synth-knob-value';

        this.el.append(this.svg, this._lbl, this._val);
        container.appendChild(this.el);

        this._render();
        this._bindDrag();
    }

    _makePath(fill, stroke, sw) {
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('fill', fill);
        p.setAttribute('stroke', stroke);
        p.setAttribute('stroke-width', sw);
        p.setAttribute('stroke-linecap', 'round');
        return p;
    }

    _makeCircle(cx, cy, r, fill, stroke, sw) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
        c.setAttribute('fill', fill); c.setAttribute('stroke', stroke);
        c.setAttribute('stroke-width', sw);
        return c;
    }

    _makeLine(stroke, sw) {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('stroke', stroke);
        l.setAttribute('stroke-width', sw);
        l.setAttribute('stroke-linecap', 'round');
        return l;
    }

    _arcPath(cx, cy, r, startDeg, endDeg) {
        const toRad  = d => (d - 90) * Math.PI / 180;
        const s      = toRad(startDeg), e = toRad(endDeg);
        const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
        const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
        const large = (endDeg - startDeg) > 180 ? 1 : 0;
        return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    }

    _toNorm(v) {
        if (this.scale === 'log') return Math.log(v / this.min) / Math.log(this.max / this.min);
        return (v - this.min) / (this.max - this.min);
    }

    _fromNorm(n) {
        if (this.scale === 'log') return this.min * Math.pow(this.max / this.min, n);
        return this.min + n * (this.max - this.min);
    }

    _render() {
        const cx = this.SIZE / 2, cy = this.SIZE / 2, r = 17;
        const START = 135, RANGE = 270;
        const norm  = this._toNorm(this.value);
        const sweep = norm * RANGE;

        this._bgPath.setAttribute('d', this._arcPath(cx, cy, r, START, START + RANGE));

        if (sweep > 0.5) {
            // Arc color: blue→cyan as value increases
            const g = Math.round(100 + norm * 132);
            this._valPath.setAttribute('stroke', `rgb(0,${g},255)`);
            this._valPath.setAttribute('d', this._arcPath(cx, cy, r, START, START + sweep));
        } else {
            this._valPath.setAttribute('d', '');
        }

        // Indicator dot at knob edge
        const angle  = (START + sweep - 90) * Math.PI / 180;
        const inner  = 3, outer = 10;
        this._dot.setAttribute('x1', cx + Math.cos(angle) * inner);
        this._dot.setAttribute('y1', cy + Math.sin(angle) * inner);
        this._dot.setAttribute('x2', cx + Math.cos(angle) * outer);
        this._dot.setAttribute('y2', cy + Math.sin(angle) * outer);

        // Value label
        let txt = this.value.toFixed(this.decimals);
        if (this.decimals === 0) txt = String(Math.round(this.value));
        this._val.textContent = txt + this.unit;
    }

    _bindDrag() {
        let startY, startNorm;

        const move = (e) => {
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const delta   = (startY - clientY) / 140;
            const n       = Math.max(0, Math.min(1, startNorm + delta));
            this.value    = this._fromNorm(n);
            this._render();
            this.onChange(this.value);
        };

        const up = () => {
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup',   up);
            window.removeEventListener('touchmove', move);
            window.removeEventListener('touchend',  up);
        };

        this.svg.addEventListener('mousedown', e => {
            e.preventDefault();
            startY    = e.clientY;
            startNorm = this._toNorm(this.value);
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup',   up);
        });

        this.svg.addEventListener('touchstart', e => {
            e.preventDefault();
            startY    = e.touches[0].clientY;
            startNorm = this._toNorm(this.value);
            window.addEventListener('touchmove', move, { passive: false });
            window.addEventListener('touchend',  up);
        }, { passive: false });

        this.svg.style.cursor = 'ns-resize';
        this.svg.title        = 'Drag up / down to adjust';
    }

    setValue(v) {
        this.value = Math.max(this.min, Math.min(this.max, v));
        this._render();
    }
}

/* ── SynthUI ──────────────────────────────────────────────────────── */

class SynthUI {
    constructor(containerId) {
        this._containerId = containerId;
        this._ctx        = null;
        this._synth      = null;
        this._player     = null;
        this._knobs      = {};
        this._keyEls     = {};
        this._events     = null;
        this._bpm        = 120;
        this._loopActive = false;
        this._kbStart    = 24;   // C1
        this._kbEnd      = 72;   // C5 (4 octaves default)
        this._kbWrap     = null;

        // Wave selector and LFO dest element refs for preset updates
        this._osc1WaveSel  = null;
        this._osc2WaveSel  = null;
        this._lfoWaveSel   = null;
        this._lfoDestRow   = null;

        this._build();
        this._loadDemo('just_chill.mid');
    }

    // All Performance tools share the MasterClock AudioContext
    _getCtx() {
        if (!this._ctx) {
            this._ctx    = MasterClock.ctx;
            this._synth  = new SubtractiveSynth(this._ctx);
            this._player = new MidiPlayer(
                this._synth,
                (note, on) => this._highlightKey(note, on),
                ()         => this._onPlaybackEnd(),
            );
        }
        return this._ctx;
    }

    _build() {
        const root = document.getElementById(this._containerId);
        if (!root) return;
        root.innerHTML = '';

        // ── Preset row ──
        const presetRow = document.createElement('div');
        presetRow.className = 'synth-preset-row';
        Object.entries(SYNTH_PRESETS).forEach(([key, preset], i) => {
            const btn = document.createElement('button');
            btn.className = 'btn synth-preset-btn' + (i === 0 ? ' active' : '');
            btn.textContent = preset.name;
            btn.dataset.preset = key;
            btn.addEventListener('click', () => this._loadPreset(key, btn));
            presetRow.appendChild(btn);
        });

        // Random button — randomizes current patch settings without changing preset selection
        const randBtn = document.createElement('button');
        randBtn.className   = 'btn synth-random-btn';
        randBtn.textContent = 'Random';
        randBtn.addEventListener('click', () => { this._getCtx(); this._randomize(); });
        presetRow.appendChild(randBtn);

        root.appendChild(presetRow);

        // ── Controls ──
        const row = document.createElement('div');
        row.className = 'synth-controls-row';
        root.appendChild(row);

        this._addPanel(row, 'VCO 1',         body => this._buildVCO1(body));
        this._addPanel(row, 'VCO 2',         body => this._buildVCO2(body));
        this._addPanel(row, 'VCF',           body => this._buildVCF(body));
        this._addPanel(row, 'VCA',           body => this._buildVCA(body));
        this._addPanel(row, 'LFO + MASTER',  body => this._buildLFOMaster(body));

        // ── Keyboard ──
        const kbWrap = document.createElement('div');
        kbWrap.className = 'synth-keyboard-wrap';
        root.appendChild(kbWrap);
        this._kbWrap = kbWrap;
        this._buildKeyboard();

        // Rebuild keyboard when container width changes
        const ro = new ResizeObserver(() => this._updateKeyboardOctaves());
        ro.observe(root);

        // ── Transport ──
        const transport = document.createElement('div');
        transport.className = 'synth-transport';
        root.appendChild(transport);
        this._buildTransport(transport);
    }

    _addPanel(parent, title, builderFn) {
        const panel = document.createElement('div');
        panel.className = 'synth-panel';
        const hdr = document.createElement('div');
        hdr.className = 'synth-panel-title';
        hdr.textContent = title;
        panel.appendChild(hdr);
        const body = document.createElement('div');
        body.className = 'synth-panel-body';
        panel.appendChild(body);
        builderFn(body);
        parent.appendChild(panel);
    }

    // ── Wave selector ──

    _buildWaveSelector(parent, paramKey, currentWave) {
        const wrap = document.createElement('div');
        wrap.className = 'synth-wave-sel';
        ['sawtooth', 'square', 'triangle', 'sine'].forEach(w => {
            const btn = document.createElement('button');
            btn.className = 'synth-wave-btn' + (w === currentWave ? ' active' : '');
            btn.dataset.wave = w;
            btn.title = w;
            btn.innerHTML = this._waveIcon(w);
            btn.addEventListener('click', () => {
                this._getCtx();
                this._synth.setParam(paramKey, w);
                wrap.querySelectorAll('.synth-wave-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            wrap.appendChild(btn);
        });
        parent.appendChild(wrap);
        return wrap;
    }

    _waveIcon(type) {
        const W = 28, H = 16, mid = H / 2;
        const paths = {
            sawtooth: `M2,${H-2} L${W/2},2 L${W/2},${H-2} L${W-2},2`,
            square:   `M2,${H-2} L2,2 L${W/2},2 L${W/2},${H-2} L${W-2},${H-2} L${W-2},2`,
            triangle: `M2,${H-2} L${W/4+1},2 L${3*W/4-1},${H-2} L${W-2},2`,
            sine:     `M2,${mid} Q${W/4},2 ${W/2},${mid} Q${3*W/4},${H-2} ${W-2},${mid}`,
        };
        return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${paths[type]}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    _updateWaveSel(wrap, waveName) {
        if (!wrap) return;
        wrap.querySelectorAll('.synth-wave-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.wave === waveName));
    }

    // ── Panel builders ──

    _buildVCO1(body) {
        const p = SYNTH_PRESETS.electrofunk;
        this._osc1WaveSel = this._buildWaveSelector(body, 'osc1Wave', p.osc1Wave);
        const row = this._knobRow(body);
        this._knobs.osc1Oct  = this._knob(row, 'Oct',  -2, 2,   p.osc1Oct,  'linear', 0, '',  v => this._sp('osc1Oct',  Math.round(v)));
        this._knobs.osc1Fine = this._knob(row, 'Fine', -50, 50, p.osc1Fine, 'linear', 0, 'c', v => this._sp('osc1Fine', v));
        this._knobs.osc1Mix  = this._knob(row, 'Mix',  0, 1,    p.osc1Mix,  'linear', 2, '',  v => this._sp('osc1Mix',  v));
    }

    _buildVCO2(body) {
        const p = SYNTH_PRESETS.electrofunk;
        this._osc2WaveSel = this._buildWaveSelector(body, 'osc2Wave', p.osc2Wave);
        const row = this._knobRow(body);
        this._knobs.osc2Oct  = this._knob(row, 'Oct',  -2, 2,   p.osc2Oct,     'linear', 0, '',  v => this._sp('osc2Oct',    Math.round(v)));
        this._knobs.osc2Fine = this._knob(row, 'Fine', -50, 50, p.osc2Fine,    'linear', 0, 'c', v => this._sp('osc2Fine',   v));
        this._knobs.osc2Mix  = this._knob(row, 'Mix',  0, 1,    p.osc2Mix,     'linear', 2, '',  v => this._sp('osc2Mix',    v));
        this._knobs.osc2Det  = this._knob(row, 'Det',  -50, 50, p.osc2Detune,  'linear', 0, 'c', v => this._sp('osc2Detune', v));
    }

    _buildVCF(body) {
        const p = SYNTH_PRESETS.electrofunk;
        const r1 = this._knobRow(body);
        this._knobs.vcfCut = this._knob(r1, 'Cutoff', VCF_MIN, VCF_MAX, p.vcfCut, 'log',    0, 'Hz', v => this._sp('vcfCut', v));
        this._knobs.vcfRes = this._knob(r1, 'Res',    0, 0.80,          p.vcfRes, 'linear', 2, '',   v => this._sp('vcfRes', v));
        this._knobs.vcfEnv = this._knob(r1, 'Env',    0, 1,             p.vcfEnv, 'linear', 2, '',   v => this._sp('vcfEnv', v));
        this._knobs.vcfDrv = this._knob(r1, 'Drive',  0, 0.50,          p.vcfDrv, 'linear', 2, '',   v => this._sp('vcfDrv', v));
        const r2 = this._knobRow(body);
        this._knobs.vcfA   = this._knob(r2, 'Atk',    0.001, 0.50, p.vcfA, 'log', 3, 's', v => this._sp('vcfA', v));
        this._knobs.vcfD   = this._knob(r2, 'Dec',    0.02,  1.20, p.vcfD, 'log', 2, 's', v => this._sp('vcfD', v));
        this._knobs.vcfS   = this._knob(r2, 'Sus',    0, 1,        p.vcfS, 'linear', 2, '', v => this._sp('vcfS', v));
        this._knobs.vcfR   = this._knob(r2, 'Rel',    0.02,  1.50, p.vcfR, 'log', 2, 's', v => this._sp('vcfR', v));
    }

    _buildVCA(body) {
        const p = SYNTH_PRESETS.electrofunk;
        const row = this._knobRow(body);
        this._knobs.vcaA = this._knob(row, 'Atk', 0.001, 2, p.vcaA, 'log',    3, 's', v => this._sp('vcaA', v));
        this._knobs.vcaD = this._knob(row, 'Dec', 0.01,  4, p.vcaD, 'log',    2, 's', v => this._sp('vcaD', v));
        this._knobs.vcaS = this._knob(row, 'Sus', 0, 1,    p.vcaS, 'linear', 2, '',  v => this._sp('vcaS', v));
        this._knobs.vcaR = this._knob(row, 'Rel', 0.01,  4, p.vcaR, 'log',    2, 's', v => this._sp('vcaR', v));
    }

    _buildLFOMaster(body) {
        const p = SYNTH_PRESETS.electrofunk;

        // LFO dest selector
        this._lfoDestRow = document.createElement('div');
        this._lfoDestRow.className = 'synth-dest-row';
        const lbl = document.createElement('span');
        lbl.className = 'synth-dest-label';
        lbl.textContent = 'Dest';
        this._lfoDestRow.appendChild(lbl);
        ['filter', 'pitch', 'amp'].forEach(dest => {
            const btn = document.createElement('button');
            btn.className = 'synth-dest-btn' + (dest === p.lfoDest ? ' active' : '');
            btn.textContent = dest;
            btn.dataset.dest = dest;
            btn.addEventListener('click', () => {
                this._getCtx();
                this._synth.setParam('lfoDest', dest);
                this._lfoDestRow.querySelectorAll('.synth-dest-btn')
                    .forEach(b => b.classList.toggle('active', b.dataset.dest === dest));
            });
            this._lfoDestRow.appendChild(btn);
        });
        body.appendChild(this._lfoDestRow);

        // LFO wave
        this._lfoWaveSel = this._buildWaveSelector(body, 'lfoWave', p.lfoWave);

        // Knobs
        const row = this._knobRow(body);
        this._knobs.lfoRate  = this._knob(row, 'Rate',  0.1, 20,  p.lfoRate,  'log',    1, 'Hz', v => this._sp('lfoRate',  v));
        this._knobs.lfoDepth = this._knob(row, 'Depth', 0,   1,   p.lfoDepth, 'linear', 2, '',   v => this._sp('lfoDepth', v));
        this._knobs.glide    = this._knob(row, 'Glide', 0,   0.5, p.glide,    'linear', 2, 's',  v => this._sp('glide',    v));
        this._knobs.volume   = this._knob(row, 'Vol',   0,   1,   p.volume,   'linear', 2, '',   v => this._sp('volume',   v));
    }

    // ── Helpers ──

    _knobRow(parent) {
        const row = document.createElement('div');
        row.className = 'synth-knob-row';
        parent.appendChild(row);
        return row;
    }

    _knob(container, label, min, max, value, scale, decimals, unit, onChange) {
        return new SynthKnob({ container, label, min, max, value, scale, decimals, unit,
            onChange: v => { this._getCtx(); onChange(v); } });
    }

    _sp(key, value) {
        if (this._synth) this._synth.setParam(key, value);
    }

    // ── Keyboard ──

    _updateKeyboardOctaves() {
        const WHITE_W  = 38;
        const OCT_W    = 7 * WHITE_W;          // 266px per octave
        const MIN_OCT  = 2;
        const MAX_OCT  = 7;
        const available = this._kbWrap ? this._kbWrap.parentElement.clientWidth : 0;
        if (available === 0) return;

        const octaves  = Math.min(MAX_OCT, Math.max(MIN_OCT, Math.floor((available - WHITE_W) / OCT_W)));
        const newStart = 24;                   // always anchor at C1
        const newEnd   = newStart + octaves * 12;

        if (newStart === this._kbStart && newEnd === this._kbEnd) return;
        this._kbStart = newStart;
        this._kbEnd   = newEnd;
        this._buildKeyboard();
    }

    _buildKeyboard() {
        const wrap = this._kbWrap;
        if (!wrap) return;

        const WHITE_W = 38, WHITE_H = 108, BLACK_W = 22, BLACK_H = 66;
        const BLACK_SEMIS = [1, 3, 6, 8, 10];  // C# D# F# G# A#
        const BLACK_X     = [27, 65, 141, 179, 217];
        const kbStart = this._kbStart;
        const kbEnd   = this._kbEnd;

        // Release any active notes before rebuilding
        if (this._synth) this._synth.panic();
        wrap.innerHTML = '';
        this._keyEls = {};

        // Count white keys to set inner width
        let totalWhite = 0;
        for (let m = kbStart; m <= kbEnd; m++) {
            if (!BLACK_SEMIS.includes(m % 12)) totalWhite++;
        }

        const inner = document.createElement('div');
        inner.style.cssText = `position:relative;width:${totalWhite * WHITE_W}px;height:${WHITE_H}px;`;
        wrap.appendChild(inner);

        let wIdx = 0;
        for (let midi = kbStart; midi <= kbEnd; midi++) {
            const semi    = midi % 12;
            const isBlack = BLACK_SEMIS.includes(semi);
            const div     = document.createElement('div');
            div.dataset.midi = midi;

            if (!isBlack) {
                div.className     = 'synth-key white';
                div.style.cssText = `left:${wIdx * WHITE_W}px;width:${WHITE_W}px;height:${WHITE_H}px;`;
                wIdx++;
            } else {
                const oct  = Math.floor((midi - kbStart) / 12);
                const bidx = BLACK_SEMIS.indexOf(semi);
                const left = oct * 7 * WHITE_W + BLACK_X[bidx];
                div.className     = 'synth-key black';
                div.style.cssText = `left:${left}px;width:${BLACK_W}px;height:${BLACK_H}px;`;
            }

            this._bindKey(div, midi);
            inner.appendChild(div);
            this._keyEls[midi] = div;
        }

        // Octave labels on each C key
        for (let m = kbStart; m <= kbEnd; m++) {
            if (m % 12 === 0) {
                const el = this._keyEls[m];
                if (!el) continue;
                const span = document.createElement('span');
                span.className   = 'synth-key-label';
                span.textContent = `C${Math.floor(m / 12) - 1}`;
                el.appendChild(span);
            }
        }
    }

    _bindKey(el, midi) {
        const on  = e => { e.preventDefault(); this._getCtx(); this._synth.noteOn(midi, 100);  this._highlightKey(midi, true);  };
        const off = e => { e.preventDefault(); if (this._synth) this._synth.noteOff(midi);     this._highlightKey(midi, false); };
        el.addEventListener('mousedown',  on);
        el.addEventListener('mouseup',    off);
        el.addEventListener('mouseleave', off);
        el.addEventListener('touchstart', on,  { passive: false });
        el.addEventListener('touchend',   off, { passive: false });
    }

    _highlightKey(midi, on) {
        const el = this._keyEls[midi];
        if (el) el.classList.toggle('active', on);
    }

    _clearAllKeyHighlights() {
        Object.values(this._keyEls).forEach(el => el.classList.remove('active'));
    }

    // ── Transport ──

    _buildTransport(parent) {
        // MIDI file upload (label acts as button)
        const uploadWrap = document.createElement('div');
        uploadWrap.className = 'synth-midi-upload';

        const label = document.createElement('label');
        label.className = 'btn synth-midi-upload-btn';
        label.textContent = 'Load MIDI';

        this._midiInput = document.createElement('input');
        this._midiInput.type   = 'file';
        this._midiInput.accept = '.mid,.midi';
        this._midiInput.style.display = 'none';
        this._midiInput.addEventListener('change', () => {
            if (this._midiInput.files[0]) this._loadMidi(this._midiInput.files[0]);
        });
        label.appendChild(this._midiInput);
        uploadWrap.appendChild(label);

        this._midiNameEl = document.createElement('span');
        this._midiNameEl.className   = 'synth-midi-name';
        this._midiNameEl.textContent = 'No file loaded';
        uploadWrap.appendChild(this._midiNameEl);
        parent.appendChild(uploadWrap);

        // Play / Stop
        this._playBtn = document.createElement('button');
        this._playBtn.className   = 'btn synth-play-btn';
        this._playBtn.textContent = 'Play';
        this._playBtn.addEventListener('click', () => this._togglePlay());
        parent.appendChild(this._playBtn);

        // Demos dropdown button (red)
        const demosWrap = document.createElement('div');
        demosWrap.className = 'synth-demos-wrap';
        this._demosBtn = document.createElement('button');
        this._demosBtn.className   = 'btn synth-demos-btn';
        this._demosBtn.textContent = 'Demos';
        this._demosBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleDemosDropdown();
        });
        demosWrap.appendChild(this._demosBtn);
        this._demosDropdown = document.createElement('div');
        this._demosDropdown.className = 'synth-demos-dropdown';
        this._demosDropdown.style.display = 'none';
        demosWrap.appendChild(this._demosDropdown);
        parent.appendChild(demosWrap);

        // Loop button (green)
        this._loopBtn = document.createElement('button');
        this._loopBtn.className   = 'btn synth-loop-btn';
        this._loopBtn.textContent = 'Loop';
        this._loopBtn.addEventListener('click', () => this._toggleLoop());
        parent.appendChild(this._loopBtn);

        // BPM input + TAP — mirrors the drum machine header
        const bpmGroup = document.createElement('div');
        bpmGroup.className = 'synth-bpm-group';

        const bpmLabel = document.createElement('label');
        bpmLabel.className   = 'synth-bpm-label';
        bpmLabel.textContent = 'BPM';

        this._synthBpmInput = document.createElement('input');
        this._synthBpmInput.type      = 'number';
        this._synthBpmInput.className = 'synth-bpm-input';
        this._synthBpmInput.value     = MasterClock.bpm;
        this._synthBpmInput.min       = '20';
        this._synthBpmInput.max       = '300';
        this._synthBpmInput.addEventListener('change', () => {
            const bpm = Math.max(20, Math.min(300, parseInt(this._synthBpmInput.value) || 120));
            this._synthBpmInput.value = bpm;
            MasterClock.setBPM(bpm, 'synth');
        });

        const tapBtn = document.createElement('button');
        tapBtn.className   = 'btn synth-tap-btn';
        tapBtn.textContent = 'TAP';
        this._synthTapTimes = [];
        tapBtn.addEventListener('click', () => {
            const now = performance.now() / 1000;
            this._synthTapTimes.push(now);
            if (this._synthTapTimes.length > 4) this._synthTapTimes.shift();
            if (this._synthTapTimes.length >= 2) {
                const intervals = [];
                for (let i = 1; i < this._synthTapTimes.length; i++) {
                    intervals.push(this._synthTapTimes[i] - this._synthTapTimes[i - 1]);
                }
                const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const bpm = Math.max(20, Math.min(300, Math.round(60 / avg)));
                this._synthBpmInput.value = bpm;
                MasterClock.setBPM(bpm, 'synth');
            }
        });

        bpmGroup.append(bpmLabel, this._synthBpmInput, tapBtn);
        parent.appendChild(bpmGroup);

        // Tempo / info display
        this._tempoEl = document.createElement('span');
        this._tempoEl.className = 'synth-tempo';
        parent.appendChild(this._tempoEl);

        // Close dropdown when clicking elsewhere
        document.addEventListener('click', () => this._closeDemosDropdown());

        // Keep BPM input + tempo display in sync with the master clock
        MasterClock.onBPM((bpm, src) => {
            if (this._tempoEl && this._events) {
                this._tempoEl.textContent = `${bpm} BPM · ${this._events.length} notes`;
            }
            if (src !== 'synth' && this._synthBpmInput) {
                this._synthBpmInput.value = bpm;
            }
        });
    }

    _togglePlay() {
        this._getCtx();
        if (this._player.isPlaying) {
            this._player.stop();
            this._playBtn.textContent = 'Play';
            this._clearAllKeyHighlights();
        } else {
            if (!this._events || !this._events.length) {
                this._midiNameEl.textContent = 'Load a MIDI file first';
                return;
            }
            this._player.loop = this._loopActive;
            this._player.play(this._events, this._bpm || MasterClock.bpm);
            this._playBtn.textContent = 'Stop';
            if (this._tempoEl) this._tempoEl.textContent = `${MasterClock.bpm} BPM · ${this._events.length} notes`;
        }
    }

    _onPlaybackEnd() {
        // Called by MidiPlayer when file finishes and loop is off
        if (this._playBtn) this._playBtn.textContent = 'Play';
        this._clearAllKeyHighlights();
    }

    _toggleLoop() {
        this._loopActive = !this._loopActive;
        this._loopBtn.classList.toggle('active', this._loopActive);
        if (this._player) this._player.loop = this._loopActive;
    }

    async _toggleDemosDropdown() {
        if (this._demosDropdown.style.display !== 'none') {
            this._closeDemosDropdown();
            return;
        }
        this._demosDropdown.innerHTML = '<div class="synth-demos-loading">Loading...</div>';
        this._demosDropdown.style.display = 'block';

        try {
            const res   = await fetch('/api/synth/demos');
            const data  = await res.json();
            this._renderDemosDropdown(data.demos || []);
        } catch {
            this._demosDropdown.innerHTML = '<div class="synth-demos-loading">Failed to load</div>';
        }
    }

    _renderDemosDropdown(demos) {
        this._demosDropdown.innerHTML = '';
        if (!demos.length) {
            this._demosDropdown.innerHTML = '<div class="synth-demos-loading">No demos found</div>';
            return;
        }
        demos.forEach(name => {
            const item = document.createElement('button');
            item.className   = 'synth-demos-item';
            item.textContent = name.replace(/\.midi?$/i, '');
            item.title       = name;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this._loadDemo(name);
                this._closeDemosDropdown();
            });
            this._demosDropdown.appendChild(item);
        });
    }

    _closeDemosDropdown() {
        if (this._demosDropdown) this._demosDropdown.style.display = 'none';
    }

    async _loadDemo(filename) {
        this._midiNameEl.textContent = 'Loading…';
        if (this._player && this._player.isPlaying) {
            this._player.stop();
            if (this._playBtn) this._playBtn.textContent = 'Play';
        }
        try {
            const res  = await fetch(`/api/synth/demos/${encodeURIComponent(filename)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            this._events = data.events;
            this._bpm    = data.bpm;
            this._midiNameEl.textContent = filename.replace(/\.midi?$/i, '');
            this._tempoEl.textContent    = `${MasterClock.bpm} BPM · ${data.event_count} notes`;
        } catch (e) {
            this._midiNameEl.textContent = 'Error: ' + e.message;
        }
    }

    async _loadMidi(file) {
        this._midiNameEl.textContent = 'Parsing...';
        if (this._player && this._player.isPlaying) {
            this._player.stop();
            if (this._playBtn) this._playBtn.textContent = 'Play';
        }
        const fd = new FormData();
        fd.append('midi_file', file);
        try {
            const res  = await fetch('/api/synth/parse-midi', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            this._events = data.events;
            this._bpm    = data.bpm;
            this._midiNameEl.textContent = file.name;
            this._tempoEl.textContent    = `${MasterClock.bpm} BPM · ${data.event_count} notes`;
        } catch (e) {
            this._midiNameEl.textContent = 'Error: ' + e.message;
        }
    }

    // ── Randomize ──

    _rLin(min, max)    { return min + Math.random() * (max - min); }
    _rLog(min, max)    { return min * Math.pow(max / min, Math.random()); }
    _rChoice(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }
    _rInt(min, max)    { return Math.round(this._rLin(min, max)); }

    _randomize() {
        const waves = ['sawtooth', 'square', 'triangle', 'sine'];
        const dests = ['filter', 'pitch', 'amp'];

        const p = {
            // VCO 1
            osc1Wave:  this._rChoice(waves),
            osc1Oct:   this._rInt(-2, 1),
            osc1Fine:  this._rLin(-25, 25),
            osc1Mix:   this._rLin(0.3, 1.0),
            // VCO 2
            osc2Wave:  this._rChoice(waves),
            osc2Oct:   this._rInt(-2, 1),
            osc2Fine:  this._rLin(-25, 25),
            osc2Mix:   this._rLin(0.1, 0.9),
            osc2Detune: this._rLin(-18, 18),
            // VCF — all values kept within the pleasant range defined by VCF_MIN/VCF_MAX
            vcfCut:    this._rLog(VCF_MIN, VCF_MAX),
            vcfRes:    this._rLin(0.05, 0.72),
            vcfEnv:    this._rLin(0.0,  1.0),
            vcfDrv:    this._rLin(0.0,  0.45),
            vcfA:      this._rLog(0.001, 0.45),
            vcfD:      this._rLog(0.02,  1.0),
            vcfS:      this._rLin(0.0,  0.85),
            vcfR:      this._rLog(0.02,  1.2),
            // VCA
            vcaA:      this._rLog(0.001, 0.25),
            vcaD:      this._rLog(0.04, 0.8),
            vcaS:      this._rLin(0.25, 0.95),
            vcaR:      this._rLog(0.02, 0.6),
            // LFO + Master
            lfoRate:   this._rLog(0.1, 12),
            lfoDepth:  this._rLin(0.0, 0.55),
            lfoDest:   this._rChoice(dests),
            lfoWave:   this._rChoice(waves),
            glide:     this._rLin(0.0, 0.18),
            volume:    this._rLin(0.60, 0.92),
        };

        // Apply to synth
        Object.entries(p).forEach(([k, v]) => this._synth.setParam(k, v));

        // Update all knobs
        const kmap = {
            osc1Oct: p.osc1Oct, osc1Fine: p.osc1Fine, osc1Mix: p.osc1Mix,
            osc2Oct: p.osc2Oct, osc2Fine: p.osc2Fine, osc2Mix: p.osc2Mix, osc2Det: p.osc2Detune,
            vcfCut: p.vcfCut, vcfRes: p.vcfRes, vcfEnv: p.vcfEnv, vcfDrv: p.vcfDrv,
            vcfA: p.vcfA, vcfD: p.vcfD, vcfS: p.vcfS, vcfR: p.vcfR,
            vcaA: p.vcaA, vcaD: p.vcaD, vcaS: p.vcaS, vcaR: p.vcaR,
            lfoRate: p.lfoRate, lfoDepth: p.lfoDepth, glide: p.glide, volume: p.volume,
        };
        Object.entries(kmap).forEach(([k, v]) => { if (this._knobs[k]) this._knobs[k].setValue(v); });

        // Update wave selectors and LFO dest
        this._updateWaveSel(this._osc1WaveSel, p.osc1Wave);
        this._updateWaveSel(this._osc2WaveSel, p.osc2Wave);
        this._updateWaveSel(this._lfoWaveSel,  p.lfoWave);
        if (this._lfoDestRow) {
            this._lfoDestRow.querySelectorAll('.synth-dest-btn')
                .forEach(b => b.classList.toggle('active', b.dataset.dest === p.lfoDest));
        }
    }

    // ── Preset loading ──

    _loadPreset(key, clickedBtn) {
        const preset = SYNTH_PRESETS[key];
        if (!preset) return;
        this._getCtx();
        this._synth.loadPreset(preset);

        // Update all knobs
        const map = {
            osc1Oct: preset.osc1Oct, osc1Fine: preset.osc1Fine, osc1Mix: preset.osc1Mix,
            osc2Oct: preset.osc2Oct, osc2Fine: preset.osc2Fine, osc2Mix: preset.osc2Mix,
            osc2Det: preset.osc2Detune,
            vcfCut: preset.vcfCut, vcfRes: preset.vcfRes, vcfEnv: preset.vcfEnv, vcfDrv: preset.vcfDrv,
            vcfA: preset.vcfA, vcfD: preset.vcfD, vcfS: preset.vcfS, vcfR: preset.vcfR,
            vcaA: preset.vcaA, vcaD: preset.vcaD, vcaS: preset.vcaS, vcaR: preset.vcaR,
            lfoRate: Math.max(0.1, preset.lfoRate), lfoDepth: preset.lfoDepth,
            glide: preset.glide, volume: preset.volume,
        };
        Object.entries(map).forEach(([k, v]) => { if (this._knobs[k]) this._knobs[k].setValue(v); });

        // Update wave selectors
        this._updateWaveSel(this._osc1WaveSel, preset.osc1Wave);
        this._updateWaveSel(this._osc2WaveSel, preset.osc2Wave);
        this._updateWaveSel(this._lfoWaveSel,  preset.lfoWave);

        // Update LFO dest buttons
        if (this._lfoDestRow) {
            this._lfoDestRow.querySelectorAll('.synth-dest-btn')
                .forEach(b => b.classList.toggle('active', b.dataset.dest === preset.lfoDest));
        }

        // Update preset button highlight
        document.querySelectorAll('.synth-preset-btn').forEach(b => b.classList.remove('active'));
        clickedBtn.classList.add('active');
    }
}

/* ── Init ─────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    window._atmoSynthUI = new SynthUI('synthEngine');
});
