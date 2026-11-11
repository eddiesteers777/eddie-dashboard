// Southbound Playbook Game day: the live clock for one game (pure; tests/playbookLive.test.mjs).
// The clock is a deadline (endAt), so a reload or a locked screen loses no time. One period (half or quarter) at a time;
// the changes between periods come from the game plan (gameModel.changes). Kept on this device only.
import { changes } from "./gameModel.js";

const MIN = 60000;
const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function newLive(game, date) {
    return { v: 1, date: String(date), period: 0, status: "ready", endAt: 0, leftMs: game.minutes * MIN, us: 0, them: 0 };
}
export const remaining = (l, now) => (l.status === "running" ? Math.max(0, l.endAt - now) : l.leftMs);
// The period's time is used up and the coach has not moved on yet.
export const isOver = (l, now) => (l.status === "running" || l.status === "paused") && remaining(l, now) <= 0;
export const isFinal = l => l.status === "final";

export function start(l, now) { return l.status === "ready" ? { ...l, status: "running", endAt: now + l.leftMs, leftMs: 0 } : l; }
export function pause(l, now) { return l.status === "running" ? { ...l, status: "paused", leftMs: Math.max(0, l.endAt - now), endAt: 0 } : l; }
export function resume(l, now) { return l.status === "paused" ? { ...l, status: "running", endAt: now + l.leftMs, leftMs: 0 } : l; }
export function addMinute(l, now, m = 1) {
    if (l.status === "running") return { ...l, endAt: Math.max(now, l.endAt + m * MIN) };
    if (l.status === "ready" || l.status === "paused") return { ...l, leftMs: Math.max(0, l.leftMs + m * MIN) };
    return l;
}
// Move to the next period, ready to start; after the last one the game is final.
export function nextPeriod(l, game) {
    if (l.period + 1 >= game.periods) return { ...l, status: "final", endAt: 0, leftMs: 0 };
    return { ...l, period: l.period + 1, status: "ready", endAt: 0, leftMs: game.minutes * MIN };
}
export function goal(l, side, d) {
    const k = side === "us" ? "us" : "them";
    return { ...l, [k]: num(l[k] + d, 0, 99, l[k]) };
}
// Who comes off and on going into this period, or null when nothing changes.
export function changeInto(game, period) {
    const c = changes(game).find(x => x.period === period);
    return c && (c.off.length || c.on.length) ? c : null;
}
// A saved clock only fits the game it was started for.
export const fits = (l, date, game) => !!l && l.date === String(date) && l.period < game.periods;

export const serializeLive = l => JSON.stringify(l);
export function parseLive(text) {
    try {
        const o = JSON.parse(text);
        if (!o || o.v !== 1 || typeof o.date !== "string") return null;
        const status = ["ready", "running", "paused", "final"].includes(o.status) ? o.status : "ready";
        return { v: 1, date: o.date.slice(0, 10), period: num(o.period, 0, 3, 0), status, endAt: status === "running" ? Math.max(0, Number(o.endAt) || 0) : 0, leftMs: Math.max(0, Number(o.leftMs) || 0), us: num(o.us, 0, 99, 0), them: num(o.them, 0, 99, 0) };
    } catch { return null; }
}
