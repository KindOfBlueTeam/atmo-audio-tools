'use strict';

/**
 * MasterClock — shared AudioContext + look-ahead scheduler for all Performance tools.
 *
 * All Performance tools (Drum Machine, Atmo Synth, Tap Tempo) share one AudioContext.
 * This means all Web Audio events live on the same timeline, enables phase-locked sync,
 * and reduces browser resource usage vs. three separate contexts.
 *
 * Tick events fire on every 16th-note boundary. Subscribers filter by tick number:
 *   Quarter notes  → tick % 4  === 0
 *   Half notes     → tick % 8  === 0
 *   Bar starts     → tick % 16 === 0
 *   Drum step n    → tick % 16 === n
 *
 * Usage:
 *   MasterClock.setBPM(128);
 *   MasterClock.start();
 *   const unsub = MasterClock.onTick((tick, time) => { ... });
 *   // later:
 *   unsub();
 *   MasterClock.stop();
 */
const MasterClock = (() => {
    // ── Private state ─────────────────────────────────────────────────────────

    let _ctx      = null;   // shared AudioContext
    let _bpm      = 120;
    let _running  = false;
    let _tick     = 0;      // global 16th-note counter (resets on start)
    let _nextTime = 0;      // audioCtx.currentTime of next scheduled tick
    let _timer    = null;

    const _LOOKAHEAD = 25;    // ms between scheduler polls
    const _AHEAD_SEC = 0.10;  // seconds to schedule ahead

    // Subscriber sets
    const _bpmCbs   = new Set();
    const _tickCbs  = new Set();
    const _startCbs = new Set();
    const _stopCbs  = new Set();

    // ── Internal ──────────────────────────────────────────────────────────────

    function _initCtx() {
        if (!_ctx) {
            _ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (_ctx.state === 'suspended') _ctx.resume();
        return _ctx;
    }

    function _schedule() {
        if (!_running) return;
        const now = _ctx.currentTime;
        while (_nextTime < now + _AHEAD_SEC) {
            const tick = _tick;
            const time = _nextTime;
            _tickCbs.forEach(fn => fn(tick, time));
            _nextTime += (60 / _bpm) / 4;   // advance one 16th note
            _tick++;
        }
        _timer = setTimeout(_schedule, _LOOKAHEAD);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    return {
        /**
         * The shared AudioContext. Lazily created on first access (requires prior
         * user gesture in most browsers — always access inside an event handler).
         */
        get ctx() { return _initCtx(); },

        /** Current BPM. */
        get bpm() { return _bpm; },

        /** True while the look-ahead scheduler is running. */
        get isRunning() { return _running; },

        /**
         * Update BPM. Notifies all onBPM subscribers.
         * Takes effect on the very next scheduled tick — no audio glitch.
         *
         * @param {number} bpm     Target BPM (clamped to 20–300).
         * @param {string} [src]   Optional source tag ('drum', 'tap', …) so a tool can
         *                         ignore its own echoed change and avoid feedback loops.
         */
        setBPM(bpm, src) {
            _bpm = Math.max(20, Math.min(300, Math.round(bpm)));
            _bpmCbs.forEach(fn => fn(_bpm, src));
        },

        /**
         * Start the clock. Idempotent — safe to call when already running.
         * Resets the tick counter and schedules from the given (or current) audio time.
         *
         * @param {number} [atTime]  audioCtx.currentTime to begin from.
         *                           Defaults to currentTime + 50 ms.
         */
        start(atTime) {
            _initCtx();
            if (_running) return;
            _running  = true;
            _tick     = 0;
            _nextTime = atTime !== undefined ? atTime : (_ctx.currentTime + 0.05);
            _schedule();
            _startCbs.forEach(fn => fn());
        },

        /** Stop the clock. Notifies all onStop subscribers. */
        stop() {
            if (!_running) return;
            _running = false;
            clearTimeout(_timer);
            _stopCbs.forEach(fn => fn());
        },

        // ── Subscriptions ─────────────────────────────────────────────────────
        // Each returns an unsubscribe function: call it to remove the listener.

        /** fn(bpm: number, src: string|undefined) — called on every BPM change. */
        onBPM(fn)  { _bpmCbs.add(fn);   return () => _bpmCbs.delete(fn);   },

        /**
         * fn(tick: number, time: number) — called on each 16th-note tick.
         * `time` is an audioCtx timestamp (may be slightly in the future).
         */
        onTick(fn) { _tickCbs.add(fn);  return () => _tickCbs.delete(fn);  },

        /** fn() — called when clock starts. */
        onStart(fn){ _startCbs.add(fn); return () => _startCbs.delete(fn); },

        /** fn() — called when clock stops. */
        onStop(fn) { _stopCbs.add(fn);  return () => _stopCbs.delete(fn);  },
    };
})();
