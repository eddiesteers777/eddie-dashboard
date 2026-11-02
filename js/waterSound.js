/* ==========================================
   Southbound — water screen sound (2026-11-02)

   A soft pour for each drink and a short chime at the goal, made with the
   Web Audio API (no audio files). On by default; the speaker button on the
   water screen turns it off for this device ("sb-water-sound"). Browsers
   only allow sound after a tap, and every sound here follows a tap.
========================================== */

const KEY = "sb-water-sound";
let ctx = null, master = null, noise = null;

export function soundOn() {
    try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSoundOn(on) {
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* the choice just won't stick */ }
}

function audio() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume?.(); return ctx; }
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        const len = ctx.sampleRate * 1.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        noise = buf;
    } catch { ctx = null; }
    return ctx;
}

/** Call from a tap so the browser lets sound start. */
export function primeSound() { if (soundOn()) audio(); }

/** A pour whose length follows the amount (8 oz short, 24 oz longer), with a few bubbles. */
export function playPour(oz = 12) {
    if (!soundOn()) return;
    const c = audio(); if (!c) return;
    const now = c.currentTime, dur = Math.min(0.75, 0.28 + (Number(oz) || 0) * 0.014);
    const src = c.createBufferSource(); src.buffer = noise;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(420, now); bp.frequency.exponentialRampToValueAtTime(1500, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.5, now + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp); bp.connect(g); g.connect(master); src.start(now, Math.random() * 0.5, dur + 0.05);
    for (let i = 0; i < 4; i++) {
        const t0 = now + 0.04 + Math.random() * (dur - 0.05), f = 500 + Math.random() * 700;
        const o = c.createOscillator(), og = c.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.9, t0 + 0.07);
        og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
        o.connect(og); og.connect(master); o.start(t0); o.stop(t0 + 0.12);
    }
}

/** A short rising chime for reaching the goal. */
export function playChime() {
    if (!soundOn()) return;
    const c = audio(); if (!c) return;
    const now = c.currentTime;
    [784, 988, 1175, 1568].forEach((f, i) => {
        const t0 = now + i * 0.11;
        for (const [mult, vol, type] of [[1, 0.22, "sine"], [2, 0.06, "triangle"]]) {
            const o = c.createOscillator(), g = c.createGain();
            o.type = type; o.frequency.value = f * mult;
            g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
            o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 1.4);
        }
    });
}
