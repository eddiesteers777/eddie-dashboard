// Calera tactical board: pure model (no DOM). Coordinates are 0..1 across the pitch,
// x left to right, y top to bottom. "Home" defends the bottom goal and attacks up.

export const FORMATIONS = Object.freeze(["4-4-2", "4-3-3", "4-5-1", "4-2-3-1", "3-5-2", "3-4-3", "5-3-2"]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Home slots for a formation, GK first, then defenders to forwards. Returns [{x, y}] x11.
export function formationSlots(formation) {
    const lines = String(formation).split("-").map(Number);
    if (lines.length < 2 || lines.some(n => !(n > 0)) || lines.reduce((a, b) => a + b, 0) !== 10) {
        throw new Error("Unknown formation: " + formation);
    }
    const slots = [{ x: 0.5, y: 0.93 }];
    lines.forEach((count, i) => {
        const y = lines.length === 1 ? 0.7 : 0.78 - (0.2 * i) / (lines.length - 1);
        for (let j = 0; j < count; j++) {
            const x = count === 1 ? 0.5 : count <= 3 ? 0.25 + (0.5 * j) / (count - 1) : 0.14 + (0.72 * j) / (count - 1);
            slots.push({ x: round(x), y: round(y) });
        }
    });
    return slots;
}

const round = n => Math.round(n * 1000) / 1000;

function team(side, formation, old = []) {
    return formationSlots(formation).map((s, i) => ({
        id: side + (i + 1),
        num: old[i]?.num ?? i + 1,
        name: old[i]?.name ?? "",
        x: side === "a" ? round(1 - s.x) : s.x,
        y: side === "a" ? round(1 - s.y) : s.y
    }));
}

export function newBoard() {
    return {
        v: 1,
        title: "Untitled board",
        scenario: "Build-up",
        homeFormation: "4-4-2",
        awayFormation: "4-4-2",
        showAway: true,
        home: team("h", "4-4-2"),
        away: team("a", "4-4-2"),
        ball: { x: 0.5, y: 0.5 },
        marks: [],
        view: "full"
    };
}

export function setFormation(board, side, formation) {
    const key = side === "away" ? "away" : "home";
    return {
        ...board,
        [key + "Formation"]: formation,
        [key]: team(key === "home" ? "h" : "a", formation, board[key])
    };
}

export function findPlayer(board, id) {
    return board.home.find(p => p.id === id) || board.away.find(p => p.id === id) || null;
}

export function movePlayer(board, id, x, y) {
    const nx = round(clamp(x, 0.03, 0.97)), ny = round(clamp(y, 0.03, 0.97));
    const mv = list => list.map(p => (p.id === id ? { ...p, x: nx, y: ny } : p));
    return { ...board, home: mv(board.home), away: mv(board.away) };
}

export function moveBall(board, x, y) {
    return { ...board, ball: { x: round(clamp(x, 0.02, 0.98)), y: round(clamp(y, 0.02, 0.98)) } };
}

export function editPlayer(board, id, { num, name }) {
    const ed = list => list.map(p => {
        if (p.id !== id) return p;
        const n = num === undefined ? p.num : Math.round(Number(num));
        return {
            ...p,
            num: Number.isFinite(n) ? clamp(n, 0, 99) : p.num,
            name: name === undefined ? p.name : String(name).slice(0, 24)
        };
    });
    return { ...board, home: ed(board.home), away: ed(board.away) };
}

export function setShowAway(board, show) { return { ...board, showAway: Boolean(show) }; }
export function setMeta(board, patch) {
    const out = { ...board };
    if (typeof patch.title === "string") out.title = patch.title.slice(0, 60);
    if (typeof patch.scenario === "string") out.scenario = patch.scenario.slice(0, 30);
    return out;
}

// ---- drawings: pass, run, dribble, arrow (lines), zone (box), text (note) ----
export const MARK_TYPES = Object.freeze(["pass", "run", "dribble", "arrow", "zone", "text"]);
export const VIEWS = Object.freeze(["full", "top", "bottom"]);
const FREEHAND = new Set(["run", "dribble"]);
const pt = p => ({ x: round(clamp(p.x, 0, 1)), y: round(clamp(p.y, 0, 1)) });

// Build a mark from the points the finger or mouse passed through.
// Lines keep a light freehand path for run/dribble and a straight line otherwise.
export function makeMark(type, rawPts, id) {
    if (!MARK_TYPES.includes(type) || !rawPts.length) return null;
    let pts = rawPts.map(pt);
    if (type === "text") return { id, type, pts: [pts[0]], text: "Note" };
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.hypot(b.x - a.x, (b.y - a.y) * 1.54) < 0.025) return null; // a tap, not a drawing
    if (type === "zone") return { id, type, pts: [a, b] };
    if (!FREEHAND.has(type)) return { id, type, pts: [a, b] };
    const kept = [a];
    for (const p of pts.slice(1, -1)) {
        const l = kept[kept.length - 1];
        if (Math.hypot(p.x - l.x, (p.y - l.y) * 1.54) >= 0.03) kept.push(p);
    }
    kept.push(b);
    return { id, type, pts: kept.slice(0, 40) };
}
export function nextMarkId(board) {
    return "m" + (1 + Math.max(0, ...board.marks.map(m => Number(m.id.slice(1)) || 0)));
}
export function addMark(board, mark) { return { ...board, marks: [...board.marks, mark] }; }
export function removeMark(board, id) { return { ...board, marks: board.marks.filter(m => m.id !== id) }; }
export function clearMarks(board) { return { ...board, marks: [] }; }
export function updateMark(board, id, patch) {
    return { ...board, marks: board.marks.map(m => (m.id === id && typeof patch.text === "string" ? { ...m, text: patch.text.slice(0, 40) } : m)) };
}
export function moveMark(board, id, dx, dy) {
    return {
        ...board,
        marks: board.marks.map(m => {
            if (m.id !== id) return m;
            // keep the shape intact: limit the shift so no point leaves the pitch
            const xs = m.pts.map(p => p.x), ys = m.pts.map(p => p.y);
            const sx = clamp(dx, -Math.min(...xs), 1 - Math.max(...xs));
            const sy = clamp(dy, -Math.min(...ys), 1 - Math.max(...ys));
            return { ...m, pts: m.pts.map(p => ({ x: round(p.x + sx), y: round(p.y + sy) })) };
        })
    };
}
export function setView(board, view) { return VIEWS.includes(view) ? { ...board, view } : board; }

// SVG path (in pitch units) for a line mark. Dribbles wiggle; others are smooth or straight.
export function markPath(mark, W, H) {
    const P = mark.pts.map(p => [p.x * W, p.y * H]);
    if (P.length < 2) return "";
    if (mark.type !== "dribble") {
        if (P.length === 2) return `M${f(P[0])}L${f(P[1])}`;
        let d = `M${f(P[0])}`;
        for (let i = 1; i < P.length - 1; i++) {
            const mid = [(P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2];
            d += `Q${f(P[i])} ${f(i === P.length - 2 ? P[i + 1] : mid)}`;
        }
        return d;
    }
    const pts = [];
    let travelled = 0;
    for (let i = 0; i < P.length - 1; i++) {
        const [x0, y0] = P[i], [x1, y1] = P[i + 1];
        const len = Math.hypot(x1 - x0, y1 - y0) || 1e-6;
        const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
        for (let t = 0; t < len; t += 0.6) {
            const w = Math.sin(((travelled + t) / 3.4) * Math.PI * 2) * 0.85;
            pts.push([x0 + ((x1 - x0) * t) / len + nx * w, y0 + ((y1 - y0) * t) / len + ny * w]);
        }
        travelled += len;
    }
    const last = P[P.length - 1];
    pts.push(last);
    return "M" + pts.map(f).join("L");
}
const f = p => `${Math.round(p[0] * 100) / 100} ${Math.round(p[1] * 100) / 100}`;

// ---- undo / redo: whole-board snapshots (a board is tiny) ----
export function createHistory(initial) { return { past: [], present: initial, future: [] }; }
export function commit(h, next) {
    if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
    return { past: [...h.past, h.present].slice(-100), present: next, future: [] };
}
export function undo(h) { return h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h; }
export function redo(h) { return h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h; }

// ---- save format: validated on load so a bad file can't break the page ----
export function serialize(board) { return JSON.stringify({ app: "calera-board", ...board }); }

export function parseBoard(text) {
    let o;
    try { o = JSON.parse(text); } catch { return null; }
    if (!o || o.v !== 1 || !Array.isArray(o.home) || !Array.isArray(o.away) || o.home.length !== 11 || o.away.length !== 11) return null;
    const okP = p => p && typeof p.id === "string" && Number.isFinite(p.x) && Number.isFinite(p.y);
    if (!o.home.every(okP) || !o.away.every(okP) || !o.ball || !Number.isFinite(o.ball.x)) return null;
    const base = newBoard();
    const fix = (list, side) => list.map((p, i) => ({
        id: side + (i + 1), num: Number.isFinite(p.num) ? clamp(Math.round(p.num), 0, 99) : i + 1,
        name: typeof p.name === "string" ? p.name.slice(0, 24) : "",
        x: clamp(p.x, 0.03, 0.97), y: clamp(p.y, 0.03, 0.97)
    }));
    return {
        ...base,
        title: typeof o.title === "string" ? o.title.slice(0, 60) : base.title,
        scenario: typeof o.scenario === "string" ? o.scenario.slice(0, 30) : base.scenario,
        homeFormation: FORMATIONS.includes(o.homeFormation) ? o.homeFormation : base.homeFormation,
        awayFormation: FORMATIONS.includes(o.awayFormation) ? o.awayFormation : base.awayFormation,
        showAway: o.showAway !== false,
        home: fix(o.home, "h"), away: fix(o.away, "a"),
        ball: { x: clamp(o.ball.x, 0.02, 0.98), y: clamp(Number(o.ball.y) || 0.5, 0.02, 0.98) },
        marks: parseMarks(o.marks),
        view: VIEWS.includes(o.view) ? o.view : "full"
    };
}

function parseMarks(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const m of list.slice(0, 200)) {
        if (!m || !MARK_TYPES.includes(m.type) || !Array.isArray(m.pts) || !m.pts.length || m.pts.length > 40) continue;
        if (!m.pts.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) continue;
        const mk = { id: "m" + (out.length + 1), type: m.type, pts: m.pts.map(pt) };
        if (m.type === "text") mk.text = typeof m.text === "string" ? m.text.slice(0, 40) : "Note";
        out.push(mk);
    }
    return out;
}
