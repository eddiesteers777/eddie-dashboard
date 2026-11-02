/* ==========================================
   Southbound — the water screen's sea (2026-11-02)

   A canvas drawing: two layers of waves, a sheen, soft light bands,
   rising bubbles and splash drops. The screen tells it where the surface
   should sit (setTarget); it eases there. With reduced motion the waves
   are flat and still: it just draws the level.
========================================== */

export function createSea(canvas, { still = false } = {}) {
    const cx = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, t = 0, level = 0, target = 0, amp = still ? 0 : 4, ampT = 4, flood = 0, floodT = 0, raf = 0, last = 0;
    let drops = [], bubbles = [], onFrame = null;

    function resize(w, h) {
        W = w; H = h; dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        cx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bubbles = still ? [] : Array.from({ length: 26 }, () => ({ x: Math.random() * W, y: H * Math.random(), r: 1 + Math.random() * 3, v: 0.2 + Math.random() * 0.5 }));
        if (still) draw();
    }
    const surface = () => level - flood * (level - 60);
    function wave(yb, a, k, p, sp) {
        cx.beginPath(); cx.moveTo(0, H);
        for (let x = 0; x <= W + 6; x += 6) cx.lineTo(x, yb + Math.sin(x * k + t * sp + p) * a + Math.sin(x * k * 2.3 + t * sp * 1.7) * a * 0.35);
        cx.lineTo(W, H); cx.closePath();
    }
    function draw() {
        const y = surface();
        cx.clearRect(0, 0, W, H);
        wave(y - 6, amp * 0.9, 0.018, 1.3, 1.1);
        let g = cx.createLinearGradient(0, y, 0, H); g.addColorStop(0, "rgba(191,224,248,.85)"); g.addColorStop(1, "rgba(111,163,210,.9)"); cx.fillStyle = g; cx.fill();
        wave(y, amp, 0.022, 0, 1.6);
        g = cx.createLinearGradient(0, y, 0, H); g.addColorStop(0, "#9ccaee"); g.addColorStop(0.5, "#6aa2d2"); g.addColorStop(1, "#3d6f9c"); cx.fillStyle = g; cx.fill();
        cx.save(); wave(y, amp, 0.022, 0, 1.6); cx.clip();
        const sh = cx.createLinearGradient(0, y - 10, 0, y + 40); sh.addColorStop(0, "rgba(255,255,255,.55)"); sh.addColorStop(1, "rgba(255,255,255,0)"); cx.fillStyle = sh; cx.fillRect(0, y - 20, W, 70);
        if (!still) {
            cx.globalAlpha = 0.08; cx.fillStyle = "#fff";
            for (let i = 0; i < 5; i++) { cx.beginPath(); cx.ellipse(((i * 97 + t * 14) % (W + 120)) - 60, y + 120 + i * 90, 90, 12, -0.3, 0, 7); cx.fill(); }
            cx.globalAlpha = 1; cx.strokeStyle = "rgba(255,255,255,.55)"; cx.lineWidth = 1;
            for (const b of bubbles) { b.y -= b.v; b.x += Math.sin(t * 2 + b.y * 0.05) * 0.2; if (b.y < y + 8) { b.y = H + 10; b.x = Math.random() * W; } cx.beginPath(); cx.arc(b.x, b.y, b.r, 0, 7); cx.stroke(); }
        }
        cx.restore();
        for (const d of drops) { d.vy += 0.35; d.x += d.vx; d.y += d.vy; d.life--; cx.globalAlpha = Math.max(0, d.life / 40); cx.beginPath(); cx.ellipse(d.x, d.y, d.r * 0.8, d.r, 0, 0, 7); cx.fillStyle = "#bfe0f8"; cx.fill(); }
        cx.globalAlpha = 1;
        drops = drops.filter(d => d.life > 0 && d.y < H);
        onFrame?.(y);
    }
    function tick(now) {
        const dt = Math.min(2, (now - (last || now)) / 16.67); last = now;
        t += dt / 60;
        level += (target - level) * Math.min(1, 0.06 * dt); amp += (ampT - amp) * Math.min(1, 0.08 * dt); ampT += (4 - ampT) * Math.min(1, 0.03 * dt); flood += (floodT - flood) * Math.min(1, 0.04 * dt);
        draw();
        raf = requestAnimationFrame(tick);
    }
    return {
        resize,
        setTarget(y, jump = false) { target = y; if (jump || still) { level = y; } if (still) draw(); },
        surge(a = 12) { if (!still) ampT = a; },
        flood(on, jump = false) { floodT = on ? 1 : 0; if (jump || still) flood = floodT; if (on && !still && !jump) ampT = 18; if (still) draw(); },
        splash(n, x) { if (still) return; for (let i = 0; i < n; i++) drops.push({ x: (x ?? W / 2) + (Math.random() - 0.5) * 160, y: surface(), vx: (Math.random() - 0.5) * 4, vy: -4 - Math.random() * 6, r: 2 + Math.random() * 3, life: 40 + Math.random() * 20 }); },
        onFrame(fn) { onFrame = fn; },
        start() { if (still) { draw(); return; } cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(tick); },
        stop() { cancelAnimationFrame(raf); raf = 0; },
        surface
    };
}
