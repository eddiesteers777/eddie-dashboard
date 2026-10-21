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
        ball: { x: 0.5, y: 0.5 }
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
        ball: { x: clamp(o.ball.x, 0.02, 0.98), y: clamp(Number(o.ball.y) || 0.5, 0.02, 0.98) }
    };
}
