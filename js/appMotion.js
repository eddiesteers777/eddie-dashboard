// Scroll-driven motion for the app's background drawings (Eddie, 2026-10-29, option A).
// Pure maths: given the page, how far it has scrolled (y) and the most it can scroll (max), say where each
// part of that page's instrument should be. js/appLook.js applies the numbers to the drawing.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function scrollProgress(y, max) {
    if (!(max > 0) || !Number.isFinite(y)) return 0;
    return clamp(y / max, 0, 1);
}

export function instrumentState(page, y, max) {
    const yy = Number.isFinite(y) ? Math.max(0, y) : 0;
    const p = scrollProgress(yy, max);
    switch (page) {
        case "train": {
            const deg = yy * 0.7;
            return { hand: deg, tick: Math.floor((((deg % 360) + 360) % 360) / 6) };
        }
        case "plan": return { cell: Math.floor(p * 20.99) };
        case "nutrition": return { fillY: 68 - p * 56, waveX: (yy * 0.1) % 22, waveX2: -((yy * 0.17) % 22), bub: [0, 1, 2, 3, 4].map(i => ((yy * (0.04 + i * 0.012) + i * 17) % 50) / 50) };
        case "fueling": return { run: p };
        case "more": return { sq: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => 0.4 + 0.6 * clamp(p * 1.6 - i * 0.075, 0, 1)) };
        case "habits": return { rings: [0, 1, 2].map(i => clamp(p * 1.1 - i * 0.12, 0, 1) * 0.9) };
        case "progress": return { ecgX: -((yy * 0.12) % 100) };
        case "messages": return { lines: [0, 1, 2].map(i => clamp(p * 3 - i * 0.9, 0.15, 1)) };
        case "coach":
        case "clients": return { ball: { x: 30 + 38 * p, y: 52 - 26 * p } };
        default: return null;
    }
}

// Water sloshing in the bottle: a spring pulled by how fast the page just scrolled.
// Returns the new surface tilt (degrees) and its speed; settles back to level.
export function sloshStep(angle, vel, dy) {
    const a = Number.isFinite(angle) ? angle : 0, v = Number.isFinite(vel) ? vel : 0, d = Number.isFinite(dy) ? dy : 0;
    const nv = (v + -0.12 * a + clamp(d, -80, 80) * 0.03) * 0.9;
    return { angle: clamp(a + nv, -5, 5), vel: nv };
}

// Today: folded fabric behind a solid compass. The four folds drift up at their own (slow) speeds, the compass
// turns toward you a little as the page scrolls, and the needle swings. All scroll-driven, never idle.
export const FOLD_SPEEDS = [0.004, 0.007, 0.01, 0.013];
export function fabricState(y) {
    const yy = Number.isFinite(y) ? Math.max(0, y) : 0, t = Math.min(yy, 1500);
    return { folds: FOLD_SPEEDS.map(k => -yy * k), rx: 26 - t * 0.006, ry: -16 + t * 0.012, needle: yy * 0.15 };
}
