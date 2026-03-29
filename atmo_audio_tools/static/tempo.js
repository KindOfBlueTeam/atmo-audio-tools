'use strict';

/* ──────────────────────────────────────────────────────────────────────────
   Tap Tempo + Metronome tool
   Drives MasterClock BPM and subscribes to its tick stream for visuals.
   All audio uses the shared MasterClock AudioContext.
   ────────────────────────────────────────────────────────────────────────── */

class TempoTool {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // State
        this.mode         = 'tap';   // 'tap' | 'metronome'
        this.taps         = [];      // timestamps (seconds, performance.now() based)
        this.isRunning    = false;
        this.clickEnabled = true;
        this.beatCount    = 0;

        // MasterClock unsubscribe handles
        this._unsubTick  = null;
        this._unsubBPM   = null;
        this._unsubStop  = null;

        this._render();
        this._bind();
    }

    // ── DOM ──────────────────────────────────────────────────────────────────

    _render() {
        this.container.innerHTML = `
            <div class="tempo-tool">

                <div class="tempo-mode-toggle">
                    <button class="tempo-mode-btn active" data-mode="tap">Tap Tempo</button>
                    <button class="tempo-mode-btn"        data-mode="metronome">Metronome</button>
                </div>

                <div class="tempo-metro-bpm" style="display:none;">
                    <button class="tempo-adj" data-delta="-10">−10</button>
                    <button class="tempo-adj" data-delta="-1">−1</button>
                    <span class="tempo-metro-val">${MasterClock.bpm}</span>
                    <button class="tempo-adj" data-delta="1">+1</button>
                    <button class="tempo-adj" data-delta="10">+10</button>
                </div>

                <div class="tempo-tap-area" tabindex="0" role="button"
                     aria-label="Tap to detect tempo or start metronome">
                    <div class="tempo-center">
                        <div class="tempo-num">---</div>
                        <div class="tempo-unit">BPM</div>
                    </div>
                    <div class="tempo-hint">Tap here or press Space</div>
                </div>

                <div class="tempo-controls">
                    <button class="tempo-ctrl tempo-click-btn is-on">♪ Click: ON</button>
                    <button class="tempo-ctrl tempo-reset-btn">↺ Reset</button>
                    <button class="tempo-ctrl tempo-stop-btn" disabled>■ Stop</button>
                </div>

                <div class="tempo-info">Tap twice to detect tempo</div>

            </div>`;

        // Cache refs
        this.tapArea    = this.container.querySelector('.tempo-tap-area');
        this.numEl      = this.container.querySelector('.tempo-num');
        this.hintEl     = this.container.querySelector('.tempo-hint');
        this.infoEl     = this.container.querySelector('.tempo-info');
        this.stopBtn    = this.container.querySelector('.tempo-stop-btn');
        this.clickBtn   = this.container.querySelector('.tempo-click-btn');
        this.resetBtn   = this.container.querySelector('.tempo-reset-btn');
        this.metroBpmEl = this.container.querySelector('.tempo-metro-bpm');
        this.metroValEl = this.container.querySelector('.tempo-metro-val');
        this.modeBtns   = this.container.querySelectorAll('.tempo-mode-btn');
    }

    _bind() {
        // Mode toggle
        this.modeBtns.forEach(btn =>
            btn.addEventListener('click', () => this._setMode(btn.dataset.mode)));

        // Tap area — pointer + touch
        this.tapArea.addEventListener('click', () => this._handleTap());
        this.tapArea.addEventListener('touchstart', e => {
            e.preventDefault();
            this._handleTap();
        }, { passive: false });

        // Spacebar (only when tempo tab is visible)
        document.addEventListener('keydown', e => {
            if (e.code !== 'Space') return;
            const tab = document.getElementById('tempoTab');
            if (!tab || tab.style.display === 'none') return;
            const tag = document.activeElement && document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            e.preventDefault();
            this._handleTap();
        });

        // Controls
        this.stopBtn.addEventListener('click',  () => this._stop());
        this.resetBtn.addEventListener('click', () => this._reset());
        this.clickBtn.addEventListener('click', () => this._toggleClick());

        // BPM nudge (metronome mode)
        this.container.querySelectorAll('.tempo-adj').forEach(btn => {
            btn.addEventListener('click', () => {
                const newBpm = Math.max(20, Math.min(300, MasterClock.bpm + parseInt(btn.dataset.delta, 10)));
                MasterClock.setBPM(newBpm, 'tap');
            });
        });

        // Sync display when drum machine (or any tool) changes master BPM
        this._unsubBPM = MasterClock.onBPM((bpm, src) => {
            this.metroValEl.textContent = bpm;
            if (src !== 'tap' && this.isRunning) {
                this.numEl.textContent  = bpm;
                this.infoEl.textContent = `${bpm} BPM`;
            }
            if (src !== 'tap' && !this.isRunning && this.mode === 'metronome') {
                this.numEl.textContent = bpm;
            }
        });

        // If drum machine stops the master clock, reflect it in our UI
        this._unsubStop = MasterClock.onStop(() => {
            if (this.isRunning) this._markStopped();
        });
    }

    // ── Mode ─────────────────────────────────────────────────────────────────

    _setMode(mode) {
        if (mode === this.mode) return;
        this._stop(false);
        this._clearTaps();
        this.mode = mode;

        this.modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

        if (mode === 'metronome') {
            this.metroBpmEl.style.display = '';
            this.numEl.textContent        = MasterClock.bpm;
            this.hintEl.textContent       = 'Tap to start';
            this.infoEl.textContent       = 'Set BPM, then tap to start';
        } else {
            this.metroBpmEl.style.display = 'none';
            this.numEl.textContent        = '---';
            this.hintEl.textContent       = 'Tap here or press Space';
            this.infoEl.textContent       = 'Tap twice to detect tempo';
        }
    }

    // ── Tap handler ──────────────────────────────────────────────────────────

    _handleTap() {
        if (this.mode === 'tap') {
            this._tapTempoTap();
        } else {
            this._metronomeTap();
        }
    }

    _tapTempoTap() {
        const now = performance.now() / 1000;
        this.taps.push(now);
        if (this.taps.length > 8) this.taps.shift();

        // Immediate feedback — the tap itself IS a beat
        this._spawnRipples(true);
        if (this.clickEnabled) this._playClick(MasterClock.ctx.currentTime, true);

        if (this.taps.length >= 2) {
            const intervals = [];
            for (let i = 1; i < this.taps.length; i++) {
                intervals.push(this.taps[i] - this.taps[i - 1]);
            }
            const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const bpm = Math.max(20, Math.min(300, Math.round(60 / avg)));
            MasterClock.setBPM(bpm, 'tap');
            this.numEl.textContent = bpm;

            if (!this.isRunning) {
                this._subscribeToTicks();
                MasterClock.start();
                this.isRunning = true;
                this.stopBtn.disabled = false;
                this.hintEl.textContent = 'Keep tapping to refine';
            }

            this.infoEl.textContent = `${this.taps.length} tap${this.taps.length !== 1 ? 's' : ''}`;
        } else {
            this.infoEl.textContent = 'Tap again…';
        }
    }

    _metronomeTap() {
        if (this.isRunning) return;
        this._subscribeToTicks();
        MasterClock.start();
        this.isRunning    = true;
        this.beatCount    = 0;
        this.stopBtn.disabled = false;
        this.hintEl.textContent = '';
        this.numEl.textContent  = MasterClock.bpm;
        this.infoEl.textContent = `${MasterClock.bpm} BPM`;
    }

    // ── MasterClock tick subscription ────────────────────────────────────────

    _subscribeToTicks() {
        if (this._unsubTick) return; // already subscribed
        this._unsubTick = MasterClock.onTick((tick, time) => {
            if (tick % 4 !== 0) return; // quarter notes only
            const isAccent = tick % 16 === 0;
            if (this.clickEnabled) this._playClick(time, isAccent);
            const delay = Math.max(0, (time - MasterClock.ctx.currentTime) * 1000);
            setTimeout(() => this._spawnRipples(isAccent), delay);
            this.beatCount++;
        });
    }

    _unsubscribeFromTicks() {
        if (this._unsubTick) { this._unsubTick(); this._unsubTick = null; }
    }

    // ── Audio ────────────────────────────────────────────────────────────────

    _playClick(time, isAccent = false) {
        const ctx = MasterClock.ctx;

        // Tonal wood-block component: short pitch sweep
        const osc     = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.connect(oscGain);
        oscGain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isAccent ? 1800 : 1050, time);
        osc.frequency.exponentialRampToValueAtTime(isAccent ? 900 : 520, time + 0.018);
        oscGain.gain.setValueAtTime(isAccent ? 0.75 : 0.45, time);
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
        osc.start(time);
        osc.stop(time + 0.08);

        // Transient noise burst
        const bufLen = Math.ceil(ctx.sampleRate * 0.012);
        const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data   = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
        const noise     = ctx.createBufferSource();
        const noiseGain = ctx.createGain();
        noise.buffer = buf;
        noise.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noiseGain.gain.setValueAtTime(isAccent ? 0.35 : 0.22, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.012);
        noise.start(time);
        noise.stop(time + 0.015);
    }

    // ── Ripple ───────────────────────────────────────────────────────────────

    _spawnRipples(isAccent = false) {
        [0, 80, 160].forEach(delay => {
            setTimeout(() => {
                const ring = document.createElement('div');
                ring.className = 'tempo-ripple' + (isAccent ? ' tempo-ripple-accent' : '');
                this.tapArea.appendChild(ring);
                ring.addEventListener('animationend', () => ring.remove());
            }, delay);
        });
    }

    // ── Controls ─────────────────────────────────────────────────────────────

    _stop(callMasterStop = true) {
        this._unsubscribeFromTicks();
        if (callMasterStop) MasterClock.stop();
        this._markStopped();
    }

    _markStopped() {
        this.isRunning = false;
        this.stopBtn.disabled = true;
        if (this.mode === 'tap') {
            this.hintEl.textContent = 'Tap here or press Space';
            this.infoEl.textContent = this.taps.length
                ? `Last detected: ${MasterClock.bpm} BPM`
                : 'Tap twice to detect tempo';
        } else {
            this.hintEl.textContent = 'Tap to start';
            this.infoEl.textContent = 'Set BPM, then tap to start';
        }
    }

    _reset() {
        this._stop();
        this._clearTaps();
        if (this.mode === 'tap') {
            this.numEl.textContent  = '---';
            this.infoEl.textContent = 'Tap twice to detect tempo';
        } else {
            this.numEl.textContent  = MasterClock.bpm;
            this.infoEl.textContent = 'Set BPM, then tap to start';
        }
        this.tapArea.querySelectorAll('.tempo-ripple').forEach(r => r.remove());
    }

    _clearTaps() {
        this.taps      = [];
        this.beatCount = 0;
    }

    _toggleClick() {
        this.clickEnabled = !this.clickEnabled;
        this.clickBtn.classList.toggle('is-on', this.clickEnabled);
        this.clickBtn.textContent = `♪ Click: ${this.clickEnabled ? 'ON' : 'OFF'}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TempoTool('tempoEngine');
});
