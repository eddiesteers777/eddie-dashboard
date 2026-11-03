/* ==========================================
   Southbound — the water screen's sea (2026-11-02, rebuilt 2026-11-03)

   The water is two parts: a plain element (the body) that fills from the
   surface down to the bottom of the screen, and a small canvas strip that
   draws the moving surface (two wave layers, a sheen, splash drops) on top
   of it. The level is just where the body sits, set in CSS pixels, so it
   cannot be drawn at the wrong size: iPhone once squashed a full-screen
   canvas into the top third of the screen. With reduced motion the waves
   are flat and still.
========================================== */

const STRIP = 220;      // height of the wave strip in px
const SURF = 120;       // where the surface sits inside the strip (room above it for splashes)

export function createSea(strip, body, { still = false } = {}) {
    const cx = strip.getContext("2d");
    let W = 0, H = 0, dpr = 1, t = 0, level = 0, target = 0, amp = still ? 0 : 4, ampT = 4, flood = 0, floodT = 0, raf = 0, last = 0;
    let drops = [], onFrame = null, lastSet = null;

    function resize(w, h) {
        W = w; H = h; dpr = Math.min(2, window.devicePixelRatio || 1);
        strip.width = Math.round(W * dpr); strip.height = Math.round(STRIP * dpr);
        strip.style.width = `${W}px`; strip.style.height = `${STRIP}px`;
        cx.setTransform(dpr, 0, 0, dpr, 0, 0);
        body.style.height = `${H + 40}px`;
        place();
        draw();
    }
    const surface = () => level - flood * (level - 60);
    // The body starts where the strip's colour ends, so the two read as one body of water.
    function place() {
        const y = surface();
        const top = Math.round((y - SURF) * 10) / 10;
        if (top === lastSet) return;
        lastSet = top;
        strip.style.transform = `translate3d(0,${top}px,0)`;
        body.style.transform = `translate3d(0,${top + STRIP}px,0)`;
    }
    function wave(yb, a, k, p, sp) {
        cx.beginPath(); cx.moveTo(0, STRIP);
        for (let x = 0; x <= W + 6; x += 6) cx.lineTo(x, yb + Math.sin(x * k + t * sp + p) * a + Math.sin(x * k * 2.3 + t * sp * 1.7) * a * 0.35);
        cx.lineTo(W, STRIP); cx.closePath();
    }
    function draw() {
        const y = SURF;
        cx.clearRect(0, 0, W, STRIP);
        wave(y - 6, amp * 0.9, 0.018, 1.3, 1.1);
        let g = cx.createLinearGradient(0, y, 0, STRIP); g.addColorStop(0, "rgba(191,224,248,.9)"); g.addColorStop(1, "rgba(120,170,215,.95)"); cx.fillStyle = g; cx.fill();
        wave(y, amp, 0.022, 0, 1.6);
        g = cx.createLinearGradient(0, y, 0, STRIP); g.addColorStop(0, "#9ccaee"); g.addColorStop(1, "#78aad8"); cx.fillStyle = g; cx.fill();
        cx.save(); wave(y, amp, 0.022, 0, 1.6); cx.clip();
        const sh = cx.createLinearGradient(0, y - 10, 0, y + 40); sh.addColorStop(0, "rgba(255,255,255,.55)"); sh.addColorStop(1, "rgba(255,255,255,0)"); cx.fillStyle = sh; cx.fillRect(0, y - 20, W, 70);
        cx.restore();
        for (const d of drops) { d.vy += 0.35; d.x += d.vx; d.y += d.vy; d.life--; cx.globalAlpha = Math.max(0, d.life / 40); cx.beginPath(); cx.ellipse(d.x, d.y, d.r * 0.8, d.r, 0, 0, 7); cx.fillStyle = "#bfe0f8"; cx.fill(); }
        cx.globalAlpha = 1;
        drops = drops.filter(d => d.life > 0 && d.y < STRIP);
        onFrame?.(surface());
    }
    function tick(now) {
        const dt = Math.min(2, (now - (last || now)) / 16.67); last = now;
        t += dt / 60;
        level += (target - level) * Math.min(1, 0.06 * dt); amp += (ampT - amp) * Math.min(1, 0.08 * dt); ampT += (4 - ampT) * Math.min(1, 0.03 * dt); flood += (floodT - flood) * Math.min(1, 0.04 * dt);
        place(); draw();
        raf = requestAnimationFrame(tick);
    }
    return {
        resize,
        setTarget(y, jump = false) { target = y; if (jump || still) level = y; if (still) { place(); draw(); } },
        surge(a = 12) { if (!still) ampT = a; },
        flood(on, jump = false) { floodT = on ? 1 : 0; if (jump || still) flood = floodT; if (on && !still && !jump) ampT = 18; if (still) { place(); draw(); } },
        splash(n, x) { if (still) return; for (let i = 0; i < n; i++) drops.push({ x: (x ?? W / 2) + (Math.random() - 0.5) * 160, y: SURF, vx: (Math.random() - 0.5) * 4, vy: -4 - Math.random() * 6, r: 2 + Math.random() * 3, life: 40 + Math.random() * 20 }); },
        onFrame(fn) { onFrame = fn; },
        start() { if (still) { place(); draw(); return; } cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(tick); },
        stop() { cancelAnimationFrame(raf); raf = 0; },
        surface
    };
}
