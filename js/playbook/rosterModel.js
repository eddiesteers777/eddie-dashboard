// Playbook roster: pure model (no DOM). First names and numbers only, kept on this device.

export const POSITIONS = Object.freeze(["GK", "DEF", "MID", "FWD", "Any"]);
export const POSITION_LABELS = Object.freeze({ GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward", Any: "Any position" });

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export function normalizePlayer(p, id) {
    if (!p || typeof p !== "object") return null;
    const name = str(p.name, 24);
    if (!name) return null;
    const n = Math.round(Number(p.num));
    return {
        id: id || str(p.id, 20) || "r1",
        name,
        num: Number.isFinite(n) && p.num !== "" && p.num !== null ? Math.min(99, Math.max(0, n)) : null,
        pos: POSITIONS.includes(p.pos) ? p.pos : "Any",
        here: p.here !== false,
        note: str(p.note, 60)
    };
}

export const nextId = list => "r" + (1 + Math.max(0, ...list.map(p => Number(String(p.id).slice(1)) || 0)));

export function savePlayer(list, player) {
    const known = player.id && list.some(p => p.id === player.id);
    const id = known ? player.id : nextId(list);
    const clean = normalizePlayer(player, id);
    if (!clean) return { id: null, list };
    return { id, list: known ? list.map(p => (p.id === id ? clean : p)) : [...list, clean].slice(0, 60) };
}
export const deletePlayer = (list, id) => list.filter(p => p.id !== id);
export const setHere = (list, id, here) => list.map(p => (p.id === id ? { ...p, here: Boolean(here) } : p));
export const available = list => list.filter(p => p.here);

// "Marcus 10 MID" lines -> players. Number and position are optional, in any order after the name.
// Several players can share a line when separated by commas or semicolons ("Marcus, Eli 7, Sam GK").
// A spreadsheet paste works too (tabs count as spaces).
export function parseBulk(text) {
    const out = [];
    for (const raw of String(text || "").split("\n")) {
        // A piece that is only a number or position ("4", "def") belongs to the name before it.
        const chunks = [];
        for (const c of raw.split(/[;,]/)) {
            const t = c.trim();
            if (!t) continue;
            const detail = t.split(/\s+/).every(w => /^#?\d{1,2}$/.test(w) || ["GK", "DEF", "MID", "FWD"].includes(w.toUpperCase()));
            if (detail && chunks.length) chunks[chunks.length - 1] += " " + t; else chunks.push(t);
        }
        for (const chunk of chunks) {
            const tokens = chunk.trim().split(/\s+/).filter(Boolean);
            if (!tokens.length) continue;
            let num = null, pos = "Any";
            const name = [];
            for (const t of tokens) {
                const up = t.toUpperCase().replace(/^#/, "");
                if (/^\d{1,2}$/.test(up) && name.length) num = Number(up);
                else if (name.length && ["GK", "DEF", "MID", "FWD"].includes(up)) pos = up;
                else name.push(t);
            }
            if (name.length) out.push({ name: name.join(" "), num, pos });
        }
    }
    return out;
}
export function addBulk(list, text) {
    let out = list, added = 0;
    for (const p of parseBulk(text)) {
        const r = savePlayer(out, { ...p, id: "" });
        if (r.id) { out = r.list; added++; }
    }
    return { list: out, added };
}

export const serializeRoster = list => JSON.stringify({ app: "playbook-roster", v: 1, players: list });
export function parseRoster(text) {
    try {
        const o = JSON.parse(text);
        if (!o || !["playbook-roster", "calera-roster"].includes(o.app) || !Array.isArray(o.players)) return null;
        const out = [];
        const seen = new Set();
        for (const p of o.players.slice(0, 60)) {
            // keep ids so boards that point at a player still match after a restore
            const keep = p && typeof p.id === "string" && /^r\d{1,4}$/.test(p.id) && !seen.has(p.id);
            const c = normalizePlayer(p, keep ? p.id : nextId([...out, ...[...seen].map(id => ({ id }))]));
            if (c) { out.push(c); seen.add(c.id); }
        }
        return out;
    } catch { return null; }
}

// ---- lineup: which roster player goes in which of the 11 home slots ----
// Roles by slot for a formation string like "4-3-3": GK, first line DEF, last line FWD, lines between MID.
export function slotRoles(formation) {
    const lines = String(formation).split("-").map(Number);
    const roles = ["GK"];
    lines.forEach((n, i) => { for (let j = 0; j < n; j++) roles.push(i === 0 ? "DEF" : i === lines.length - 1 ? "FWD" : "MID"); });
    return roles;
}

// Fill the slots from the players who are here: exact position first, then "Any", then anyone left.
export function autoLineup(list, formation) {
    const roles = slotRoles(formation);
    const pool = available(list).map(p => ({ ...p }));
    const take = pred => { const i = pool.findIndex(pred); return i < 0 ? null : pool.splice(i, 1)[0]; };
    const out = roles.map(() => null);
    roles.forEach((r, i) => { out[i] = take(p => p.pos === r); });
    roles.forEach((r, i) => { if (!out[i]) out[i] = take(p => p.pos === "Any" && (r !== "GK")); });
    roles.forEach((r, i) => { if (!out[i]) out[i] = take(p => p.pos !== "GK" || r === "GK"); });
    return out; // [player|null] x11, slot order = board home order
}
