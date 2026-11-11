// Playbook drill diagrams: pure model (no DOM). A diagram is a small picture on a 100 x 70 grid:
// cones, players (a = your team, d = defenders, k = keeper, n = neutral), a ball, goals,
// and steps. Each step has one coaching line and the arrows drawn in that step.
// Starter drills get their diagram from the lookup in drillDiagramData.js, matched by name,
// so saved drills and returning devices need no migration.

export const GRID = Object.freeze({ w: 100, h: 70 });
export const MARKS = Object.freeze(["pass", "run", "dribble", "press"]);
const MAX_STEPS = 6;

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const pt = p => {
    if (!Array.isArray(p)) return null;
    const x = num(p[0], 0, GRID.w), y = num(p[1], 0, GRID.h);
    return x === null || y === null ? null : [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
};
const pts = (list, max) => (Array.isArray(list) ? list : []).map(pt).filter(Boolean).slice(0, max);
const who = (list, max) => (Array.isArray(list) ? list : []).map(p => {
    const q = pt(p);
    if (!q) return null;
    const n = p[2] === undefined || p[2] === null ? "" : String(p[2]).slice(0, 2);
    return { x: q[0], y: q[1], n };
}).filter(Boolean).slice(0, max);

// Clean any input into a safe diagram; returns null when there is nothing to draw.
export function normalizeDiagram(d) {
    if (!d || typeof d !== "object") return null;
    const zone = Array.isArray(d.z) && d.z.length === 4 ? d.z.map(Number) : null;
    const steps = (Array.isArray(d.steps) ? d.steps : []).slice(0, MAX_STEPS).map(s => ({
        say: typeof s?.say === "string" ? s.say.trim().slice(0, 140) : "",
        marks: (Array.isArray(s?.m) ? s.m : []).slice(0, 8).map(m => {
            if (!Array.isArray(m) || !MARKS.includes(m[0])) return null;
            const p = m.slice(1, 4).map(pt).filter(Boolean);
            return p.length >= 2 ? { kind: m[0], pts: p } : null;
        }).filter(Boolean)
    }));
    const out = {
        zone: zone && zone.every(Number.isFinite) ? zone.map(n => Math.round(n * 10) / 10) : null,
        goals: (Array.isArray(d.g) ? d.g : []).map(g => (Array.isArray(g) && g.length === 4 && g.every(n => Number.isFinite(Number(n))) ? g.map(Number) : null)).filter(Boolean).slice(0, 4),
        cones: pts(d.c, 24),
        a: who(d.a, 12), d: who(d.d, 12), k: who(d.k, 2), n: who(d.n, 4),
        ball: pt(d.ball),
        label: typeof d.label === "string" ? d.label.trim().slice(0, 20) : "",
        steps
    };
    if (!out.steps.length || (!out.a.length && !out.d.length && !out.cones.length)) return null;
    return out;
}

// What a viewer sees at step i (0-based): earlier steps' marks are "done", this step's are "now".
export function marksAt(diagram, i) {
    const last = Math.min(Math.max(0, i), diagram.steps.length - 1);
    const out = [];
    diagram.steps.slice(0, last + 1).forEach((s, k) => s.marks.forEach(m => out.push({ ...m, now: k === last })));
    return out;
}

// SVG path for a mark: two points make a line, three make a curve through a control point.
export function markD(m) {
    const [a, b, c] = m.pts;
    return c ? `M${a[0]} ${a[1]} Q${b[0]} ${b[1]} ${c[0]} ${c[1]}` : `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`;
}
