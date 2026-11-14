/* ==========================================
   Southbound — the prayer map (pure)

   Eddie's prayer list: steps (stations on the map), each with his own items.
   "prayer-list" = { steps: [{ id, name, prompt, items: [{ id, text }] }] }
   "prayer-checks" = { "YYYY-MM-DD": { itemId: true } } (the phone's local day).
   The Prayer habit is done for a day when every item on the list is checked.
   Both keys sync with the account (js/cloudSync.js). Tests: tests/prayerModel.test.mjs.
========================================== */

export const PRAYER_LIST_KEY = "prayer-list";
export const PRAYER_CHECKS_KEY = "prayer-checks";
const KEEP_DAYS = 60;

// Starter steps. The items are plain examples he edits, so nothing here is his private list.
export const STARTER_STEPS = Object.freeze([
    { name: "Adore", prompt: "Start with who God is.", items: ["Who God is"] },
    { name: "Confess", prompt: "Say what you got wrong.", items: ["What I got wrong"] },
    { name: "Thank", prompt: "Name what you are grateful for.", items: ["What I am grateful for"] },
    { name: "Ask", prompt: "Your list for today.", items: ["What I need today"] },
    { name: "Listen", prompt: "Two quiet minutes.", items: ["Sit quiet"] }
]);

let counter = 0;
export const newId = prefix => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function starterList() {
    return { steps: STARTER_STEPS.map(s => ({ id: newId("s"), name: s.name, prompt: s.prompt, items: s.items.map(text => ({ id: newId("i"), text })) })) };
}

/** A saved list that is usable, else null. */
export function cleanList(saved) {
    if (!saved || !Array.isArray(saved.steps)) return null;
    const steps = saved.steps.filter(s => s && s.id && typeof s.name === "string").map(s => ({
        id: String(s.id), name: s.name, prompt: typeof s.prompt === "string" ? s.prompt : "",
        items: (Array.isArray(s.items) ? s.items : []).filter(i => i && i.id && typeof i.text === "string").map(i => ({ id: String(i.id), text: i.text }))
    }));
    return steps.length ? { steps } : null;
}

export const allItems = list => (list?.steps || []).flatMap(s => s.items);

/** { done, total } for a day's checks. */
export function progress(list, checks, day) {
    const items = allItems(list), on = checks?.[day] || {};
    return { done: items.filter(i => on[i.id]).length, total: items.length };
}

/** Done only when the list has items and every one is checked. */
export function isComplete(list, checks, day) {
    const p = progress(list, checks, day);
    return p.total > 0 && p.done === p.total;
}

/** The step to open on the map: the first with an unchecked item (null when all done). */
export function currentStepId(list, checks, day) {
    const on = checks?.[day] || {};
    return (list?.steps || []).find(s => s.items.some(i => !on[i.id]))?.id || null;
}

export function toggleCheck(checks, day, itemId) {
    const next = { ...(checks || {}) }, d = { ...(next[day] || {}) };
    if (d[itemId]) delete d[itemId]; else d[itemId] = true;
    if (Object.keys(d).length) next[day] = d; else delete next[day];
    return next;
}

/** Drop old days and checks for items that no longer exist. */
export function pruneChecks(checks, list, today) {
    const ids = new Set(allItems(list).map(i => i.id)), out = {};
    const limit = new Date(`${today}T12:00:00`); limit.setDate(limit.getDate() - KEEP_DAYS);
    const cut = limit.toISOString().slice(0, 10);
    for (const [day, on] of Object.entries(checks || {})) {
        if (day < cut) continue;
        const kept = Object.fromEntries(Object.entries(on).filter(([id]) => ids.has(id)));
        if (Object.keys(kept).length) out[day] = kept;
    }
    return out;
}

const trim = s => String(s || "").replace(/\s+/g, " ").trim().slice(0, 80);
export function addItem(list, stepId, text) {
    const t = trim(text); if (!t) return list;
    return { steps: list.steps.map(s => s.id === stepId ? { ...s, items: [...s.items, { id: newId("i"), text: t }] } : s) };
}
export function renameItem(list, itemId, text) {
    const t = trim(text); if (!t) return list;
    return { steps: list.steps.map(s => ({ ...s, items: s.items.map(i => i.id === itemId ? { ...i, text: t } : i) })) };
}
export function removeItem(list, itemId) {
    return { steps: list.steps.map(s => ({ ...s, items: s.items.filter(i => i.id !== itemId) })) };
}
export function addStep(list, name) {
    const t = trim(name); if (!t) return list;
    return { steps: [...list.steps, { id: newId("s"), name: t, prompt: "", items: [] }] };
}
export function renameStep(list, stepId, name) {
    const t = trim(name); if (!t) return list;
    return { steps: list.steps.map(s => s.id === stepId ? { ...s, name: t } : s) };
}
export function removeStep(list, stepId) {
    const next = list.steps.filter(s => s.id !== stepId);
    return next.length ? { steps: next } : list;
}
