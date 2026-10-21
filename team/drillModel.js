// Calera drills: pure model (no DOM). A drill is plain data a coach can edit.

export const TOPICS = Object.freeze(["Warm-up", "Passing", "Receiving", "Dribbling", "Finishing", "Goalkeeping", "Defending", "Possession", "Transitions", "Tactical shape", "Pressing", "Set pieces", "Small-sided"]);
export const INTENSITY = Object.freeze(["Low", "Medium", "High"]);

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const lines = (v, max = 12, n = 160) => (Array.isArray(v) ? v : String(v || "").split("\n")).map(x => str(String(x), n)).filter(Boolean).slice(0, max);

// Clean any input into a safe drill; returns null when it has no name.
export function normalizeDrill(d, id) {
    if (!d || typeof d !== "object") return null;
    const name = str(d.name, 80);
    if (!name) return null;
    const minutes = Math.round(Number(d.minutes));
    const minPlayers = Math.round(Number(d.minPlayers));
    return {
        id: id || str(d.id, 40) || "d1",
        name,
        topic: TOPICS.includes(d.topic) ? d.topic : "Small-sided",
        minutes: Number.isFinite(minutes) ? Math.min(60, Math.max(1, minutes)) : 10,
        minPlayers: Number.isFinite(minPlayers) ? Math.min(30, Math.max(1, minPlayers)) : 6,
        space: str(d.space, 60),
        intensity: INTENSITY.includes(d.intensity) ? d.intensity : "Medium",
        equipment: lines(d.equipment, 12, 40),
        setup: str(d.setup, 600),
        how: str(d.how, 800),
        points: lines(d.points, 8),
        progressions: lines(d.progressions, 6),
        easier: lines(d.easier, 6),
        boardId: str(d.boardId, 20),
        seed: d.seed === true
    };
}

export const emptyDrills = () => [];

export function nextDrillId(list) {
    return "d" + (1 + Math.max(0, ...list.map(d => Number(String(d.id).slice(1)) || 0)));
}

// Insert (no id or unknown id) or replace a drill. Returns { id, list }.
export function saveDrill(list, drill) {
    const known = drill.id && list.some(d => d.id === drill.id);
    const id = known ? drill.id : nextDrillId(list);
    const clean = normalizeDrill({ ...drill, seed: known ? list.find(d => d.id === id).seed : false }, id);
    if (!clean) return { id: null, list };
    return { id, list: known ? list.map(d => (d.id === id ? clean : d)) : [clean, ...list] };
}
export const deleteDrill = (list, id) => list.filter(d => d.id !== id);
export function duplicateDrill(list, id) {
    const src = list.find(d => d.id === id);
    return src ? saveDrill(list, { ...src, id: "", name: (src.name + " copy").slice(0, 80) }) : { id: null, list };
}

// Add starter drills that are not in the list yet (matched by name); never touches edits.
export function mergeSeeds(list, seeds) {
    let out = list;
    const have = new Set(list.map(d => d.name.toLowerCase()));
    for (const sd of seeds) {
        if (have.has(sd.name.toLowerCase())) continue;
        const r = saveDrill(out, { ...sd, id: "" });
        out = r.list.map(d => (d.id === r.id ? { ...d, seed: true } : d));
    }
    return out;
}

export function filterDrills(list, { topic = "", q = "", intensity = "", maxMinutes = 0 } = {}) {
    const needle = q.trim().toLowerCase();
    return list.filter(d =>
        (!topic || d.topic === topic) &&
        (!intensity || d.intensity === intensity) &&
        (!maxMinutes || d.minutes <= maxMinutes) &&
        (!needle || [d.name, d.topic, d.setup, d.how, ...d.equipment, ...d.points].join(" ").toLowerCase().includes(needle)));
}

export function serializeDrills(list) { return JSON.stringify({ app: "calera-drills", v: 1, drills: list }); }

export function parseDrills(text) {
    let o;
    try { o = JSON.parse(text); } catch { return null; }
    if (!o || o.app !== "calera-drills" || !Array.isArray(o.drills)) return null;
    const out = [];
    for (const d of o.drills.slice(0, 500)) {
        const c = normalizeDrill(d, "d" + (out.length + 1));
        if (c) out.push(c);
    }
    return out;
}

// Import: bring in a file's drills as new entries (same name = skipped).
export function importDrills(list, incoming) {
    let out = list;
    const have = new Set(list.map(d => d.name.toLowerCase()));
    for (const d of incoming) {
        if (have.has(d.name.toLowerCase())) continue;
        out = saveDrill(out, { ...d, id: "" }).list;
        have.add(d.name.toLowerCase());
    }
    return out;
}
