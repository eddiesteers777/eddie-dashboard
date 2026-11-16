/* ==========================================
   Southbound — prayer requests (pure)

   One localStorage key per request, "prayer-req-<id>", so two devices adding
   requests never overwrite each other (js/cloudSync.js KEY_PREFIXES).
   { id, text, note, group, added: "YYYY-MM-DD", answered: null | { date, note }, updatedAt }
   A deleted request stays as { id, deleted: true, updatedAt } so the deletion syncs.
   Tests: tests/prayerRequests.test.mjs.
========================================== */

export const REQ_PREFIX = "prayer-req-";
export const GROUPS = Object.freeze(["Family", "Players", "Friends", "Me"]);

const trim = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const stamp = () => Date.now();
let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const keyFor = id => REQ_PREFIX + id;

/** A new open request, or null when the text is empty. */
export function newRequest(text, note, group, today) {
    const t = trim(text, 90);
    if (!t) return null;
    return { id: newId(), text: t, note: trim(note, 240), group: GROUPS.includes(group) ? group : "", added: today, answered: null, updatedAt: stamp() };
}

/** A saved value that is a usable request, else null (deleted markers and junk are null). */
export function cleanRequest(saved) {
    if (!saved || saved.deleted || typeof saved.id !== "string" || typeof saved.text !== "string" || !saved.text.trim()) return null;
    const a = saved.answered && typeof saved.answered === "object" && /^\d{4}-\d{2}-\d{2}$/.test(saved.answered.date || "")
        ? { date: saved.answered.date, note: trim(saved.answered.note, 240) } : null;
    return { id: saved.id, text: trim(saved.text, 90), note: trim(saved.note, 240), group: GROUPS.includes(saved.group) ? saved.group : "",
        added: /^\d{4}-\d{2}-\d{2}$/.test(saved.added || "") ? saved.added : "", answered: a, updatedAt: Number(saved.updatedAt) || 0 };
}

export const edit = (r, { text, note, group }) => ({ ...r, text: trim(text, 90) || r.text, note: trim(note, 240), group: GROUPS.includes(group) ? group : "", updatedAt: stamp() });
export const markAnswered = (r, date, note) => ({ ...r, answered: { date, note: trim(note, 240) }, updatedAt: stamp() });
export const reopen = r => ({ ...r, answered: null, updatedAt: stamp() });
export const tombstone = r => ({ id: r.id, deleted: true, updatedAt: stamp() });

/** Open requests, oldest first (the ones waiting longest on top). */
export const openRequests = (all, group = "") => all.filter(r => !r.answered && (!group || r.group === group)).sort((a, b) => a.added.localeCompare(b.added) || a.updatedAt - b.updatedAt);
/** Answered requests, newest answer first. */
export const answeredRequests = all => all.filter(r => r.answered).sort((a, b) => b.answered.date.localeCompare(a.answered.date));

const dayNumber = key => Math.floor(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400000);
/** "Asked Oct 2 · Answered Oct 28" and "12 days" style bits. */
export const daysBetween = (from, to) => (from && to ? Math.max(0, dayNumber(to) - dayNumber(from)) : 0);
export const shortDate = key => key ? new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

/** Read every request from a Storage-like object. */
export function loadAll(storage) {
    const out = [];
    for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!k || !k.startsWith(REQ_PREFIX)) continue;
        try { const r = cleanRequest(JSON.parse(storage.getItem(k))); if (r) out.push(r); } catch { /* skip one bad key */ }
    }
    return out;
}
