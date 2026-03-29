// drum808.js — TR-808 style drum machine
// Web Audio API synthesis, 16-step sequencer, look-ahead scheduler

class Drum808 {
    constructor(rootEl) {
        this._root = rootEl;
        this._ctx = null;

        // Sequencer state
        this._swing = 0;        // 0–1
        this._steps = 16;
        this._isPlaying = false;
        this._unsubTick = null;  // MasterClock.onTick unsubscribe handle
        this._tapTimes  = [];    // timestamps for in-header tap tempo

        // Instruments: name, GM drum note, display colour
        this._instruments = [
            { id: 'bd', name: 'Bass Drum',   midi: 36, color: '#ff5533' },
            { id: 'sd', name: 'Snare',       midi: 38, color: '#ff9922' },
            { id: 'lt', name: 'Low Tom',     midi: 41, color: '#ffcc33' },
            { id: 'mt', name: 'Mid Tom',     midi: 45, color: '#eeee33' },
            { id: 'ht', name: 'Hi Tom',      midi: 48, color: '#99ee33' },
            { id: 'rs', name: 'Rim Shot',    midi: 37, color: '#33ddaa' },
            { id: 'cp', name: 'Clap',        midi: 39, color: '#33ccff' },
            { id: 'ch', name: 'Closed Hat',  midi: 42, color: '#3399ff' },
            { id: 'oh', name: 'Open Hat',    midi: 46, color: '#8855ff' },
            { id: 'cb', name: 'Cowbell',     midi: 56, color: '#ff44cc' },
            { id: 'cy', name: 'Cymbal',      midi: 49, color: '#cc55ff' },
        ];

        // Pattern: per-instrument active steps, accent flags, volume
        this._pattern = {};
        this._instruments.forEach(inst => {
            this._pattern[inst.id] = {
                steps:   new Array(16).fill(false),
                accents: new Array(16).fill(false),
                volume:  0.8,
            };
        });

        this._build();
    }

    // ─── Audio context ────────────────────────────────────────────────────────

    _ensureCtx() {
        // All Performance tools share the MasterClock AudioContext
        this._ctx = MasterClock.ctx;
        return this._ctx;
    }

    // ─── TR-808 synthesis ─────────────────────────────────────────────────────

    _makeNoiseBuf(ctx, seconds) {
        const len = Math.ceil(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    _makeDistortionCurve(amount) {
        const n = 256, curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = (i * 2) / n - 1;
            curve[i] = (3 + amount) * x * 20 * (Math.PI / 180) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    _synthBD(time, accent) {
        const ctx  = this._ctx;
        const vol  = this._pattern.bd.volume * (accent ? 1.25 : 1.0);

        // Pitch sweep: 180 Hz → 50 Hz
        const osc  = ctx.createOscillator();
        osc.type   = 'sine';
        osc.frequency.setValueAtTime(180, time);
        osc.frequency.exponentialRampToValueAtTime(50, time + 0.065);

        // Soft saturation
        const shaper   = ctx.createWaveShaper();
        shaper.curve   = this._makeDistortionCurve(18);

        // Amplitude envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.55);

        // Click transient
        const click     = ctx.createBufferSource();
        click.buffer    = this._makeNoiseBuf(ctx, 0.007);
        const clickFlt  = ctx.createBiquadFilter();
        clickFlt.type   = 'bandpass';
        clickFlt.frequency.value = 1400;
        clickFlt.Q.value = 0.5;
        const clickGain = ctx.createGain();
        clickGain.gain.setValueAtTime(vol * 0.55, time);
        clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.018);

        osc.connect(shaper); shaper.connect(gain); gain.connect(ctx.destination);
        click.connect(clickFlt); clickFlt.connect(clickGain); clickGain.connect(ctx.destination);

        osc.start(time);   osc.stop(time + 0.6);
        click.start(time); click.stop(time + 0.025);
    }

    _synthSD(time, accent) {
        const ctx = this._ctx;
        const vol = this._pattern.sd.volume * (accent ? 1.25 : 1.0);

        // Tone
        const osc  = ctx.createOscillator();
        osc.type   = 'triangle';
        osc.frequency.setValueAtTime(200, time);
        osc.frequency.exponentialRampToValueAtTime(140, time + 0.06);

        const toneGain = ctx.createGain();
        toneGain.gain.setValueAtTime(vol * 0.6, time);
        toneGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

        // Noise
        const noise  = ctx.createBufferSource();
        noise.buffer = this._makeNoiseBuf(ctx, 0.25);
        const flt    = ctx.createBiquadFilter();
        flt.type     = 'bandpass';
        flt.frequency.value = 3200;
        flt.Q.value  = 0.55;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(vol * 0.75, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);

        osc.connect(toneGain); toneGain.connect(ctx.destination);
        noise.connect(flt); flt.connect(noiseGain); noiseGain.connect(ctx.destination);

        osc.start(time);   osc.stop(time + 0.15);
        noise.start(time); noise.stop(time + 0.26);
    }

    _synthTom(time, accent, id, freqStart, decay) {
        const ctx  = this._ctx;
        const vol  = this._pattern[id].volume * (accent ? 1.25 : 1.0);

        const osc  = ctx.createOscillator();
        osc.type   = 'sine';
        osc.frequency.setValueAtTime(freqStart, time);
        osc.frequency.exponentialRampToValueAtTime(freqStart * 0.38, time + decay * 0.45);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(time); osc.stop(time + decay + 0.02);
    }

    _synthRS(time, accent) {
        const ctx  = this._ctx;
        const vol  = this._pattern.rs.volume * (accent ? 1.25 : 1.0);

        const noise  = ctx.createBufferSource();
        noise.buffer = this._makeNoiseBuf(ctx, 0.04);
        const flt    = ctx.createBiquadFilter();
        flt.type     = 'bandpass';
        flt.frequency.value = 2000;
        flt.Q.value  = 3.5;
        const gain   = ctx.createGain();
        gain.gain.setValueAtTime(vol * 0.9, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

        noise.connect(flt); flt.connect(gain); gain.connect(ctx.destination);
        noise.start(time); noise.stop(time + 0.045);
    }

    _synthCP(time, accent) {
        const ctx  = this._ctx;
        const vol  = this._pattern.cp.volume * (accent ? 1.25 : 1.0);

        // Three quick noise bursts → clap texture
        [0, 0.009, 0.018].forEach((offset, i) => {
            const noise  = ctx.createBufferSource();
            noise.buffer = this._makeNoiseBuf(ctx, 0.022);
            const flt    = ctx.createBiquadFilter();
            flt.type     = 'bandpass';
            flt.frequency.value = 1100 + i * 250;
            flt.Q.value  = 0.8;
            const gain   = ctx.createGain();
            const v      = vol * (i === 2 ? 1.0 : 0.55);
            gain.gain.setValueAtTime(v, time + offset);
            gain.gain.exponentialRampToValueAtTime(0.001, time + offset + 0.065);

            noise.connect(flt); flt.connect(gain); gain.connect(ctx.destination);
            noise.start(time + offset); noise.stop(time + offset + 0.07);
        });
    }

    // Six square oscillators at metallic ratios — TR-808 hi-hat technique
    _synthHat(time, vol, decay) {
        const ctx   = this._ctx;
        const freqs = [205.3, 369.0, 302.5, 540.2, 441.9, 722.4];

        const mix  = ctx.createGain();
        mix.gain.value = 0.16;

        freqs.forEach(f => {
            const osc  = ctx.createOscillator();
            osc.type   = 'square';
            osc.frequency.value = f * 2;
            osc.connect(mix);
            osc.start(time);
            osc.stop(time + decay + 0.02);
        });

        const hpf  = ctx.createBiquadFilter();
        hpf.type   = 'highpass';
        hpf.frequency.value = 7200;
        hpf.Q.value = 1.0;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

        mix.connect(hpf); hpf.connect(gain); gain.connect(ctx.destination);
    }

    _synthCH(time, accent) {
        this._synthHat(time, this._pattern.ch.volume * (accent ? 1.25 : 1.0), 0.042);
    }

    _synthOH(time, accent) {
        this._synthHat(time, this._pattern.oh.volume * (accent ? 1.25 : 1.0), 0.38);
    }

    _synthCB(time, accent) {
        const ctx  = this._ctx;
        const vol  = this._pattern.cb.volume * (accent ? 1.25 : 1.0);

        // TR-808 cowbell: two square oscillators at specific frequencies
        [562.5, 845.0].forEach(f => {
            const osc  = ctx.createOscillator();
            osc.type   = 'square';
            osc.frequency.value = f;
            const bpf  = ctx.createBiquadFilter();
            bpf.type   = 'bandpass';
            bpf.frequency.value = f;
            bpf.Q.value = 4.5;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(vol * 0.45, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.50);

            osc.connect(bpf); bpf.connect(gain); gain.connect(ctx.destination);
            osc.start(time); osc.stop(time + 0.55);
        });
    }

    _synthCY(time, accent) {
        const ctx  = this._ctx;
        const vol  = this._pattern.cy.volume * (accent ? 1.25 : 1.0);

        // Richer mix than hi-hat, longer decay
        const freqs = [205.3, 369.0, 302.5, 540.2, 441.9, 722.4, 1062.5, 1462.9];
        const mix   = ctx.createGain();
        mix.gain.value = 0.08;

        freqs.forEach(f => {
            const osc  = ctx.createOscillator();
            osc.type   = 'square';
            osc.frequency.value = f;
            osc.connect(mix);
            osc.start(time);
            osc.stop(time + 1.2);
        });

        const hpf  = ctx.createBiquadFilter();
        hpf.type   = 'highpass';
        hpf.frequency.value = 5200;
        hpf.Q.value = 0.8;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 1.1);

        mix.connect(hpf); hpf.connect(gain); gain.connect(ctx.destination);
    }

    _triggerInstrument(id, time, accent) {
        switch (id) {
            case 'bd': this._synthBD(time, accent); break;
            case 'sd': this._synthSD(time, accent); break;
            case 'lt': this._synthTom(time, accent, 'lt', 118, 0.38); break;
            case 'mt': this._synthTom(time, accent, 'mt', 175, 0.30); break;
            case 'ht': this._synthTom(time, accent, 'ht', 248, 0.22); break;
            case 'rs': this._synthRS(time, accent); break;
            case 'cp': this._synthCP(time, accent); break;
            case 'ch': this._synthCH(time, accent); break;
            case 'oh': this._synthOH(time, accent); break;
            case 'cb': this._synthCB(time, accent); break;
            case 'cy': this._synthCY(time, accent); break;
        }
    }

    // ─── Sequencer ────────────────────────────────────────────────────────────

    _stepDuration() {
        return (60 / MasterClock.bpm) / 4; // 16th-note duration in seconds
    }

    _swingOffset(step) {
        // Even-indexed off-beats (1, 3, 5 …) get pushed forward
        if (step % 2 === 1) return this._swing * this._stepDuration() * 0.30;
        return 0;
    }

    _scheduleVisualUpdate(step, time) {
        const delay = Math.max(0, (time - MasterClock.ctx.currentTime) * 1000);
        setTimeout(() => {
            if (!this._isPlaying) return;
            this._root.querySelectorAll('.drum-step.playing').forEach(el => el.classList.remove('playing'));
            this._root.querySelectorAll(`.drum-step[data-step="${step}"]`).forEach(el => el.classList.add('playing'));
        }, delay);
    }

    start() {
        if (this._isPlaying) return;
        this._ensureCtx();
        this._isPlaying = true;

        // Subscribe to MasterClock 16th-note ticks
        this._unsubTick = MasterClock.onTick((tick, time) => {
            const step      = tick % this._steps;
            const swingTime = time + this._swingOffset(step);
            this._instruments.forEach(inst => {
                const p = this._pattern[inst.id];
                if (p.steps[step]) this._triggerInstrument(inst.id, swingTime, p.accents[step]);
            });
            this._scheduleVisualUpdate(step, swingTime);
        });

        MasterClock.start();
        this._updatePlayBtn();
    }

    stop() {
        if (!this._isPlaying) return;
        this._isPlaying = false;
        if (this._unsubTick) { this._unsubTick(); this._unsubTick = null; }
        MasterClock.stop();
        this._root.querySelectorAll('.drum-step.playing').forEach(el => el.classList.remove('playing'));
        this._updatePlayBtn();
    }

    toggle() {
        if (this._isPlaying) this.stop(); else this.start();
    }

    // ─── Presets ──────────────────────────────────────────────────────────────

    _presets = {
        'boom-bap': {
            bd: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,0],
            sd: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
            ch: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
            oh: [0,1,0,0, 0,1,0,0, 0,1,0,0, 0,1,0,0],
        },
        'four-on-floor': {
            bd: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
            sd: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
            ch: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
            oh: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
            cb: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
        },
        'trap': {
            bd: [1,0,0,0, 1,1,0,0, 0,0,1,0, 1,0,0,0],
            sd: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
            ch: [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
            oh: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,1,0,1],
        },
        'funky': {
            bd: [1,0,0,1, 0,0,1,0, 1,0,0,0, 0,1,0,0],
            sd: [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,1,0],
            ch: [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0],
            oh: [0,1,0,0, 0,1,0,1, 0,1,0,0, 0,1,0,1],
            lt: [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,1],
            rs: [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
        },
    };

    loadPreset(name) {
        this._instruments.forEach(inst => {
            this._pattern[inst.id].steps.fill(false);
            this._pattern[inst.id].accents.fill(false);
        });
        const preset = this._presets[name];
        if (!preset) return;
        Object.entries(preset).forEach(([id, steps]) => {
            if (this._pattern[id]) {
                steps.forEach((v, i) => { this._pattern[id].steps[i] = !!v; });
            }
        });
        this._updateStepButtons();
    }

    clearPattern() {
        this._instruments.forEach(inst => {
            this._pattern[inst.id].steps.fill(false);
            this._pattern[inst.id].accents.fill(false);
        });
        this._updateStepButtons();
    }

    // ─── MIDI export ──────────────────────────────────────────────────────────

    exportMIDI() {
        const PPQ  = 480;
        const usec = Math.round(60_000_000 / MasterClock.bpm); // microseconds/beat
        const ticksPerStep = PPQ / 4; // 16th note
        const BARS = 2;

        const events = [];

        // Tempo
        events.push({ tick: 0, data: [0xFF, 0x51, 0x03, (usec >> 16) & 0xFF, (usec >> 8) & 0xFF, usec & 0xFF] });
        // Time signature 4/4
        events.push({ tick: 0, data: [0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] });

        this._instruments.forEach(inst => {
            const p = this._pattern[inst.id];
            for (let bar = 0; bar < BARS; bar++) {
                for (let step = 0; step < this._steps; step++) {
                    if (!p.steps[step]) continue;
                    const tick = (bar * this._steps + step) * ticksPerStep;
                    const vel  = p.accents[step] ? 110 : 80;
                    events.push({ tick,                       data: [0x99, inst.midi, vel] });
                    events.push({ tick: tick + ticksPerStep - 1, data: [0x89, inst.midi, 0] });
                }
            }
        });

        const endTick = BARS * this._steps * ticksPerStep;
        events.push({ tick: endTick, data: [0xFF, 0x2F, 0x00] });
        events.sort((a, b) => a.tick - b.tick);

        // Serialize to bytes
        const trackBytes = [];
        let prev = 0;
        events.forEach(ev => {
            this._writeVarLen(trackBytes, ev.tick - prev);
            prev = ev.tick;
            ev.data.forEach(b => trackBytes.push(b));
        });

        const out = [];
        // MThd
        out.push(0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1,
                 (PPQ >> 8) & 0xFF, PPQ & 0xFF);
        // MTrk
        const tl = trackBytes.length;
        out.push(0x4D, 0x54, 0x72, 0x6B,
                 (tl >> 24) & 0xFF, (tl >> 16) & 0xFF, (tl >> 8) & 0xFF, tl & 0xFF);
        trackBytes.forEach(b => out.push(b));

        const blob = new Blob([new Uint8Array(out)], { type: 'audio/midi' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `atmo-808-${MasterClock.bpm}bpm.mid`;
        a.click();
        URL.revokeObjectURL(url);
    }

    _writeVarLen(buf, v) {
        if (v < 0x80) { buf.push(v); return; }
        if (v < 0x4000) { buf.push((v >> 7) | 0x80, v & 0x7F); return; }
        if (v < 0x200000) { buf.push((v >> 14) | 0x80, ((v >> 7) & 0x7F) | 0x80, v & 0x7F); return; }
        buf.push((v >> 21) | 0x80, ((v >> 14) & 0x7F) | 0x80, ((v >> 7) & 0x7F) | 0x80, v & 0x7F);
    }

    // ─── UI build ─────────────────────────────────────────────────────────────

    _build() {
        this._root.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.className = 'drum-machine';

        // Transport / controls row
        const header = document.createElement('div');
        header.className = 'drum-header';
        header.innerHTML = `
            <div class="drum-ctrl-group">
                <label class="drum-label">BPM</label>
                <input type="number" class="drum-bpm-input" value="${MasterClock.bpm}" min="60" max="200">
                <button class="drum-btn drum-tap-btn" title="Tap to set BPM">TAP</button>
            </div>
            <div class="drum-ctrl-group drum-swing-group">
                <label class="drum-label">SWING</label>
                <input type="range" class="drum-swing-slider" min="0" max="80" value="0">
                <span class="drum-swing-val">0%</span>
            </div>
            <div class="drum-transport">
                <button class="drum-btn drum-play-btn">&#9654; PLAY</button>
                <button class="drum-btn drum-stop-btn">&#9632; STOP</button>
            </div>
            <div class="drum-ctrl-group drum-preset-group">
                <label class="drum-label">PRESET</label>
                <select class="drum-preset-select">
                    <option value="">— load —</option>
                    <option value="boom-bap">Boom Bap</option>
                    <option value="four-on-floor">Four on the Floor</option>
                    <option value="trap">Trap</option>
                    <option value="funky">Funky</option>
                </select>
            </div>
            <div class="drum-ctrl-group">
                <button class="drum-btn drum-action-btn drum-clear-btn">CLEAR</button>
                <button class="drum-btn drum-action-btn drum-export-btn">&#8595; MIDI</button>
            </div>
        `;
        wrap.appendChild(header);

        // Step index bar
        const indexRow = document.createElement('div');
        indexRow.className = 'drum-index-row';
        let idxHtml = '<div class="drum-name-col"></div><div class="drum-steps-grid">';
        for (let i = 0; i < 16; i++) {
            idxHtml += `<div class="drum-step-idx${i % 4 === 0 ? ' beat-start' : ''}">${i + 1}</div>`;
        }
        idxHtml += '</div><div class="drum-vol-col"></div>';
        indexRow.innerHTML = idxHtml;
        wrap.appendChild(indexRow);

        // Instrument rows
        this._instruments.forEach((inst, rowIdx) => {
            const row = document.createElement('div');
            row.className = 'drum-row';
            row.dataset.inst = inst.id;

            // Name
            const nameCol = document.createElement('div');
            nameCol.className = 'drum-name-col';
            nameCol.innerHTML = `<span class="drum-inst-name" style="--ic:${inst.color}">${inst.name}</span>`;
            row.appendChild(nameCol);

            // Steps
            const stepsGrid = document.createElement('div');
            stepsGrid.className = 'drum-steps-grid';
            for (let i = 0; i < 16; i++) {
                const btn = document.createElement('button');
                btn.className = 'drum-step' + (i % 4 === 0 ? ' beat-start' : '');
                btn.dataset.inst = inst.id;
                btn.dataset.step = String(i);
                btn.title = `${inst.name} — step ${i + 1}  •  shift+click = accent`;
                btn.addEventListener('click', e => this._onStepClick(e, inst.id, i));
                stepsGrid.appendChild(btn);
            }
            row.appendChild(stepsGrid);

            // Volume
            const volCol = document.createElement('div');
            volCol.className = 'drum-vol-col';
            volCol.innerHTML = `<input type="range" class="drum-vol-slider" min="0" max="100"
                value="${Math.round(this._pattern[inst.id].volume * 100)}"
                data-inst="${inst.id}" title="Volume: ${inst.name}">`;
            row.appendChild(volCol);

            wrap.appendChild(row);
        });

        // Footer hint
        const hint = document.createElement('p');
        hint.className = 'drum-hint';
        hint.innerHTML = '<strong>Click</strong> a step to toggle it &nbsp;·&nbsp; <strong>Shift+click</strong> an active step to add accent (louder hit) &nbsp;·&nbsp; Clicking a step previews the sound';
        wrap.appendChild(hint);

        this._root.appendChild(wrap);
        this._wireEvents();
    }

    _wireEvents() {
        const r = this._root;

        const bpmInput = r.querySelector('.drum-bpm-input');
        bpmInput.addEventListener('change', e => {
            const bpm = Math.max(60, Math.min(200, parseInt(e.target.value) || 120));
            e.target.value = bpm;
            MasterClock.setBPM(bpm, 'drum');
        });

        // Tap tempo button in drum header
        r.querySelector('.drum-tap-btn').addEventListener('click', () => {
            const now = performance.now() / 1000;
            this._tapTimes.push(now);
            if (this._tapTimes.length > 4) this._tapTimes.shift();
            if (this._tapTimes.length >= 2) {
                const intervals = [];
                for (let i = 1; i < this._tapTimes.length; i++) {
                    intervals.push(this._tapTimes[i] - this._tapTimes[i - 1]);
                }
                const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const bpm = Math.max(60, Math.min(200, Math.round(60 / avg)));
                bpmInput.value = bpm;   // update the display directly (src='drum' skips onBPM echo)
                MasterClock.setBPM(bpm, 'drum');
            }
        });

        // Keep BPM input in sync when another tool (Tap Tempo) changes the master BPM
        MasterClock.onBPM((bpm, src) => {
            if (src !== 'drum') bpmInput.value = bpm;
        });

        // If another tool stops the master clock, update our play button
        MasterClock.onStop(() => {
            if (this._isPlaying) {
                this._isPlaying = false;
                if (this._unsubTick) { this._unsubTick(); this._unsubTick = null; }
                this._root.querySelectorAll('.drum-step.playing').forEach(el => el.classList.remove('playing'));
                this._updatePlayBtn();
            }
        });

        const swingSlider = r.querySelector('.drum-swing-slider');
        const swingLabel  = r.querySelector('.drum-swing-val');
        swingSlider.addEventListener('input', e => {
            this._swing = parseInt(e.target.value) / 100;
            swingLabel.textContent = `${e.target.value}%`;
        });

        r.querySelector('.drum-play-btn').addEventListener('click', () => this.toggle());
        r.querySelector('.drum-stop-btn').addEventListener('click', () => this.stop());
        r.querySelector('.drum-clear-btn').addEventListener('click', () => this.clearPattern());
        r.querySelector('.drum-export-btn').addEventListener('click', () => this.exportMIDI());

        r.querySelector('.drum-preset-select').addEventListener('change', e => {
            if (e.target.value) { this.loadPreset(e.target.value); e.target.value = ''; }
        });

        r.querySelectorAll('.drum-vol-slider').forEach(sl => {
            sl.addEventListener('input', e => {
                this._pattern[e.target.dataset.inst].volume = parseInt(e.target.value) / 100;
            });
        });
    }

    _onStepClick(e, id, step) {
        const p = this._pattern[id];
        if (e.shiftKey && p.steps[step]) {
            p.accents[step] = !p.accents[step];
        } else {
            p.steps[step] = !p.steps[step];
            if (!p.steps[step]) p.accents[step] = false;
        }
        const btn = e.currentTarget;
        btn.classList.toggle('active', p.steps[step]);
        btn.classList.toggle('accent', p.accents[step]);

        if (p.steps[step]) {
            this._ensureCtx();
            this._triggerInstrument(id, this._ctx.currentTime + 0.01, p.accents[step]);
        }
    }

    _updateStepButtons() {
        this._instruments.forEach(inst => {
            const p = this._pattern[inst.id];
            for (let i = 0; i < 16; i++) {
                const btn = this._root.querySelector(`.drum-step[data-inst="${inst.id}"][data-step="${i}"]`);
                if (btn) {
                    btn.classList.toggle('active', p.steps[i]);
                    btn.classList.toggle('accent', p.accents[i]);
                }
            }
        });
    }

    _updatePlayBtn() {
        const btn = this._root.querySelector('.drum-play-btn');
        if (!btn) return;
        btn.classList.toggle('active', this._isPlaying);
        btn.textContent = this._isPlaying ? '⏸ PAUSE' : '▶ PLAY';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('drumEngine');
    if (root) window._drum808 = new Drum808(root);
});
