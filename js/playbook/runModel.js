// Playbook "Run practice": pure model (no DOM, no clock). The timer is a deadline, not a counter,
// so a reload, a locked phone or a closed tab never loses time. Every function takes `now` (ms).
const MIN = 60000, MAX_ITEMS = 20;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const isNum = v => Number.isFinite(Number(v));

// items: [{ name, minutes, note? }] copied from the plan when the run starts.
export function newRun(items, title = "Practice", now = 0) {
    const list = (items || []).slice(0, MAX_ITEMS).filter(i => i && typeof i.name === "string").map(i => ({
        name: i.name.slice(0, 80), minutes: clamp(Math.round(Number(i.minutes)) || 10, 1, 90), note: typeof i.note === "string" ? i.note.slice(0, 160) : ""
    }));
    return { v: 1, title: String(title || "Practice").slice(0, 60), items: list, done: list.map(() => false), skipped: list.map(() => false), extra: list.map(() => 0), active: firstOpen(list.map(() => false), list.map(() => false)), status: "ready", endAt: 0, leftMs: list[0] ? list[0].minutes * MIN : 0, startedAt: now };
}

function firstOpen(done, skipped, from = 0) {
    for (let i = from; i < done.length; i++) if (!done[i] && !skipped[i]) return i;
    for (let i = 0; i < from; i++) if (!done[i] && !skipped[i]) return i;
    return -1;
}
const lengthMs = (r, i) => (r.items[i].minutes + r.extra[i]) * MIN;

// Milliseconds left on the active activity (negative once over time). 0 when the run is finished.
export function remaining(r, now) {
    if (r.active < 0) return 0;
    return r.status === "running" ? r.endAt - now : r.leftMs;
}
export const isFinished = r => r.active < 0 && r.items.length > 0;
export const doneCount = r => r.done.filter(Boolean).length;
export const plannedMinutes = r => r.items.reduce((a, it, i) => a + it.minutes + r.extra[i], 0);

function setActive(r, i, now, run) {
    if (i < 0) return { ...r, active: -1, status: "finished", endAt: 0, leftMs: 0 };
    const left = lengthMs(r, i);
    return { ...r, active: i, status: run ? "running" : "ready", endAt: run ? now + left : 0, leftMs: left };
}

export function start(r, now) { return r.active < 0 || r.status === "running" ? r : setActive(r, r.active, now, true); }
export function pause(r, now) { return r.status === "running" ? { ...r, status: "paused", leftMs: r.endAt - now, endAt: 0 } : r; }
export function resume(r, now) { return r.status === "paused" ? { ...r, status: "running", endAt: now + r.leftMs, leftMs: 0 } : r; }

// Tapping Done on the active activity: check it off and start the next open one.
export function complete(r, now) {
    if (r.active < 0) return r;
    const done = r.done.slice(); done[r.active] = true;
    const next = firstOpen(done, r.skipped, r.active + 1);
    return setActive({ ...r, done }, next, now, r.status !== "ready" || next >= 0);
}
export function skip(r, now) {
    if (r.active < 0) return r;
    const skipped = r.skipped.slice(); skipped[r.active] = true;
    return setActive({ ...r, skipped }, firstOpen(r.done, skipped, r.active + 1), now, true);
}
// Go to another open activity (Back / Next / tapping the list). Does not check anything off.
export function goTo(r, i, now) {
    if (i < 0 || i >= r.items.length || i === r.active || r.done[i]) return r;
    const skipped = r.skipped.slice(); skipped[i] = false;
    const wasRunning = r.status === "running";
    return setActive({ ...r, skipped }, i, now, wasRunning);
}
export function step(r, dir, now) {
    if (r.active < 0) return r;
    for (let i = r.active + dir; i >= 0 && i < r.items.length; i += dir) if (!r.done[i]) return goTo(r, i, now);
    return r;
}
// Tick an already-checked activity back to open (an honest "oops").
export function undo(r, i, now) {
    if (!r.done[i]) return r;
    const done = r.done.slice(); done[i] = false;
    return r.active < 0 ? setActive({ ...r, done }, i, now, false) : { ...r, done };
}
export function addMinute(r, now, minutes = 1) {
    if (r.active < 0) return r;
    const extra = r.extra.slice(); extra[r.active] += minutes;
    return r.status === "running" ? { ...r, extra, endAt: r.endAt + minutes * MIN } : { ...r, extra, leftMs: r.leftMs + minutes * MIN };
}
export function restartActive(r, now) { return r.active < 0 ? r : setActive({ ...r, extra: r.extra.map((e, i) => (i === r.active ? 0 : e)) }, r.active, now, false); }

// "9:42", "15:00", "-0:20" (over time).
export function clock(ms) {
    const over = ms < 0, s = Math.ceil(Math.abs(ms) / 1000);
    return (over ? "-" : "") + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
// Share of the active activity already used, 0..1 (for the ring).
export function used(r, now) {
    if (r.active < 0) return 1;
    return clamp(1 - remaining(r, now) / lengthMs(r, r.active), 0, 1);
}

export function serializeRun(r) { return JSON.stringify(r); }
export function parseRun(text) {
    let o; try { o = JSON.parse(text); } catch { return null; }
    if (!o || o.v !== 1 || !Array.isArray(o.items) || !o.items.length) return null;
    const base = newRun(o.items, o.title, Number(o.startedAt) || 0);
    const n = base.items.length, arr = (a, d) => (Array.isArray(a) && a.length === n ? a.map(x => (typeof d === "boolean" ? x === true : clamp(Math.round(Number(x)) || 0, 0, 60))) : base[d === false ? "done" : "extra"]);
    const done = arr(o.done, false), skipped = arr(o.skipped, false), extra = arr(o.extra, 0);
    const status = ["ready", "running", "paused", "finished"].includes(o.status) ? o.status : "ready";
    let active = isNum(o.active) ? Math.round(Number(o.active)) : base.active;
    if (active >= n || active < -1 || (active >= 0 && done[active])) active = firstOpen(done, skipped);
    const r = { ...base, done, skipped, extra, active, status: active < 0 ? "finished" : status === "finished" ? "ready" : status, endAt: Number(o.endAt) || 0, leftMs: Number(o.leftMs) || 0 };
    if (r.active >= 0 && r.status === "ready") r.leftMs = lengthMs(r, r.active);
    if (r.active >= 0 && r.status === "paused" && !(r.leftMs > -1e9)) r.leftMs = lengthMs(r, r.active);
    return r;
}
