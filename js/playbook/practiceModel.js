// Playbook practice planner: pure model (no DOM). Turns drills + today's limits into a timed plan.
import { TOPICS } from "./drillModel.js";

export const EQUIPMENT = Object.freeze([
    ["goals", "Full-size goals"], ["smallGoals", "Small goals"], ["cones", "Cones"], ["pinnies", "Pinnies"], ["balls", "Enough balls"]
]);
export const GAME_OPTIONS = Object.freeze([["", "No game soon"], ["1", "Game tomorrow"], ["2", "Game in 2 days"], ["3", "Game in 3+ days"]]);
export const FOCUS_TOPICS = Object.freeze(TOPICS.filter(t => t !== "Warm-up" && t !== "Small-sided"));
const MIN_ITEM = 5, MAX_ITEM = 30;

// Which equipment keys a drill needs, read from its equipment list.
export function equipmentNeeds(drill) {
    const text = drill.equipment.join(" ").toLowerCase();
    const need = new Set();
    if (/small goal/.test(text)) need.add("smallGoals");
    if (/\bgoals?\b/.test(text.replace(/small goals?/g, ""))) need.add("goals");
    if (/cone/.test(text)) need.add("cones");
    if (/pinnie|bib/.test(text)) need.add("pinnies");
    if (/ball/.test(text)) need.add("balls");
    return need;
}

export function drillFits(drill, { players, equipment, gameInDays }) {
    if (players && drill.minPlayers > players) return false;
    for (const n of equipmentNeeds(drill)) if (!equipment.has(n)) return false;
    if (gameInDays === 1 && drill.intensity === "High") return false;
    return true;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Make the planned minutes add up to `total` (grow or shrink fairly; drop drills only as a last resort).
export function fitMinutes(items, total) {
    let out = items.map(i => ({ ...i }));
    const sum = () => out.reduce((a, i) => a + i.minutes, 0);
    let guard = 0;
    while (sum() > total && guard++ < 500) {
        const idx = out.map((_, i) => i).filter(i => out[i].minutes > MIN_ITEM).sort((a, b) => out[b].minutes - out[a].minutes)[0];
        if (idx === undefined) { if (out.length <= 1) break; out.splice(out.length - 2 >= 1 ? out.length - 2 : out.length - 1, 1); continue; }
        out[idx].minutes -= 1;
    }
    guard = 0;
    const order = out.map((_, i) => i).reverse(); // extra time goes to the last blocks first (the game-like ones)
    while (sum() < total && guard++ < 500) {
        const idx = order.find(i => out[i].minutes < MAX_ITEM);
        if (idx === undefined) break;
        out[idx].minutes += 1;
        order.push(order.shift()); // rotate so growth is shared
    }
    return out;
}

// Build a suggested plan. `variant` picks different drills each time it goes up by one.
export function suggestPlan({ drills, total = 75, players = 18, equipment, focus = [], gameInDays = 0, variant = 0 }) {
    const eq = equipment instanceof Set ? equipment : new Set(equipment || []);
    const ctx = { players, equipment: eq, gameInDays };
    const ok = drills.filter(d => drillFits(d, ctx));
    const notes = [];
    const used = new Set();
    const pick = (topics, label) => {
        for (const t of [].concat(topics)) {
            const pool = ok.filter(d => d.topic === t && !used.has(d.id));
            if (pool.length) { const d = pool[variant % pool.length]; used.add(d.id); return d; }
        }
        if (label) notes.push(`No ${label} drill fits your players and equipment today.`);
        return null;
    };
    const items = [];
    const add = d => d && items.push({ drillId: d.id, minutes: d.minutes });
    add(pick("Warm-up", "warm-up"));
    const n = total <= 45 ? 1 : total <= 60 ? 2 : total <= 80 ? 3 : 4;
    const wanted = (focus.length ? focus : ["Passing", "Possession", "Finishing", "Defending"]).slice(0, n);
    const mid = wanted.map(t => pick(t, t.toLowerCase())).filter(Boolean);
    const rank = { Low: 0, Medium: 1, High: 2 };
    mid.sort((a, b) => rank[a.intensity] - rank[b.intensity]); // build up, never start on the hardest
    if (gameInDays === 2) { let high = 0; for (const d of [...mid]) if (d.intensity === "High" && ++high > 1) { mid.splice(mid.indexOf(d), 1); notes.push(`Dropped "${d.name}" (too hard two days before a game).`); } }
    mid.forEach(add);
    add(pick(gameInDays === 1 ? ["Set pieces", "Tactical shape", "Small-sided"] : ["Small-sided", "Transitions", "Possession"], "closing game"));
    if (gameInDays === 1) notes.push("Game tomorrow: no high-intensity drills, finishing on set pieces and shape.");
    return { items: fitMinutes(items, total), notes };
}

export const planTotal = items => items.reduce((a, i) => a + i.minutes, 0);

// "HH:MM" -> list of clock strings for each item ("" when no start time).
export function startTimes(items, start) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(start || "");
    if (!m) return items.map(() => "");
    let t = Number(m[1]) * 60 + Number(m[2]);
    return items.map(i => {
        const h = Math.floor(t / 60) % 24, mm = t % 60;
        t += i.minutes;
        return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    });
}

export function setMinutes(items, index, minutes) {
    return items.map((it, i) => (i === index ? { ...it, minutes: clamp(Math.round(minutes) || it.minutes, 1, 60) } : it));
}
export function moveItem(items, index, dir) {
    const j = index + dir;
    if (j < 0 || j >= items.length) return items;
    const out = [...items]; [out[index], out[j]] = [out[j], out[index]];
    return out;
}
export const removeItem = (items, index) => items.filter((_, i) => i !== index);
export const addItem = (items, drill) => [...items, { drillId: drill.id, minutes: drill.minutes }];

// Every piece of equipment the plan uses, as readable names.
export function planEquipment(items, drillsById) {
    const names = new Map();
    for (const it of items) for (const e of drillsById.get(it.drillId)?.equipment || []) {
        const base = e.replace(/\s*\(.*\)\s*$/, "").trim();
        const key = base.toLowerCase().replace(/s$/, "");
        if (!names.has(key) || /s$/i.test(base)) names.set(key, base); // "Goal" and "Goals" are one thing: keep the plural
    }
    return [...names.values()];
}

// ---- saved practices ----
export function newPractice() {
    return { v: 1, title: "Practice", date: "", start: "", total: 75, players: 18, gameInDays: 0, equipment: EQUIPMENT.map(e => e[0]), focus: [], variant: 0, items: [] };
}
export function parsePractice(o) {
    if (!o || o.v !== 1 || !Array.isArray(o.items)) return null;
    const base = newPractice();
    const num = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? clamp(Math.round(Number(v)), lo, hi) : d);
    return {
        v: 1,
        title: typeof o.title === "string" ? o.title.slice(0, 60) || base.title : base.title,
        date: typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : "",
        start: typeof o.start === "string" && /^\d{1,2}:\d{2}$/.test(o.start) ? o.start : "",
        total: num(o.total, 20, 180, 75),
        players: num(o.players, 1, 30, 18),
        gameInDays: [0, 1, 2, 3].includes(Number(o.gameInDays)) ? Number(o.gameInDays) : 0,
        equipment: Array.isArray(o.equipment) ? o.equipment.filter(e => EQUIPMENT.some(x => x[0] === e)) : base.equipment,
        focus: Array.isArray(o.focus) ? o.focus.filter(t => FOCUS_TOPICS.includes(t)).slice(0, 4) : [],
        variant: num(o.variant, 0, 999, 0),
        items: o.items.slice(0, 20).filter(i => i && typeof i.drillId === "string").map(i => ({ drillId: i.drillId.slice(0, 40), minutes: num(i.minutes, 1, 60, 10) }))
    };
}
export function savePractice(list, practice, id, now = Date.now()) {
    const name = practice.title || "Practice";
    if (id && list.some(p => p.id === id)) return { id, list: list.map(p => (p.id === id ? { ...p, name, updatedAt: now, practice } : p)) };
    const nid = "p" + (1 + Math.max(0, ...list.map(p => Number(p.id.slice(1)) || 0)));
    return { id: nid, list: [{ id: nid, name, updatedAt: now, practice }, ...list].slice(0, 100) };
}
export const deletePractice = (list, id) => list.filter(p => p.id !== id);
export function parsePracticeList(text) {
    try {
        const o = JSON.parse(text);
        if (!o || !Array.isArray(o.practices)) return [];
        return o.practices.map((e, i) => ({ id: "p" + (i + 1), name: String(e.name || "Practice").slice(0, 60), updatedAt: Number(e.updatedAt) || 0, practice: parsePractice(e.practice) })).filter(e => e.practice);
    } catch { return []; }
}
export const serializePracticeList = list => JSON.stringify({ app: "playbook-practices", practices: list.map(({ name, updatedAt, practice }) => ({ name, updatedAt, practice })) });
