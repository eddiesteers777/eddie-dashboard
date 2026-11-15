/* ==========================================
   Southbound — the coach's Homework page (pure)

   Coach → Soccer → Homework: an overview (to review, needs a nudge, this
   week by group), a row per player, and a library built from homework
   already assigned (no new storage). All inputs are passed in so it is
   unit-tested without Firebase (tests/homeworkOverview.test.mjs).
========================================== */

import { homeworkToReview } from "./soccerCoachModel.js";

const active = homework => (homework || []).filter(h => h && h.status !== "archived");
const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// rows: playerRows(). standingOf(hw) / progressOf(hw) come from homeworkModel.
export function overview({ homework = [], rows = [], standingOf = () => "on-track", progressOf = () => ({ kind: "week", done: 0, target: 0 }) } = {}) {
    const by = new Map(rows.map(r => [r.uid, r]));
    const mine = active(homework).filter(h => by.has(h.clientUid));
    const behind = mine.filter(h => ["behind", "overdue"].includes(standingOf(h)))
        .map(hw => ({ hw, name: by.get(hw.clientUid).name, p: progressOf(hw) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const groups = { group: { done: 0, target: 0 }, one: { done: 0, target: 0 } };
    for (const hw of mine) {
        const p = progressOf(hw);
        if (p.kind !== "week" || !p.target) continue;
        const g = by.get(hw.clientUid).group ? groups.group : groups.one;
        g.done += Math.min(p.done, p.target);
        g.target += p.target;
    }
    const done = groups.group.done + groups.one.done, target = groups.group.target + groups.one.target;
    const toReview = homeworkToReview(mine);
    return {
        players: rows.length,
        active: mine.length,
        toReview,
        behind,
        noHomework: rows.filter(r => r.status === "new"),
        pct: target ? Math.round(100 * done / target) : null,
        groups
    };
}

// One row per player for the Players tab.
export function playerProgress({ rows = [], homework = [], standingOf, progressOf, streakOf = () => 0 } = {}) {
    return rows.map(r => {
        const list = active(homework).filter(h => h.clientUid === r.uid);
        let done = 0, target = 0;
        for (const hw of list) { const p = progressOf(hw); if (p.kind === "week" && p.target) { done += Math.min(p.done, p.target); target += p.target; } }
        const needsLook = homeworkToReview(list).length;
        return { ...r, list, done, target, pct: target ? Math.round(100 * done / target) : null, streak: streakOf(homework.filter(h => h.clientUid === r.uid)), needsLook,
            standing: needsLook ? "review" : r.status };
    });
}

// Distinct assignments already given, most used first.
export function library(homework = []) {
    const map = new Map();
    for (const h of homework || []) {
        if (!h || !h.title) continue;
        const key = [norm(h.title), h.cadence, h.timesPerWeek || "", h.goal || ""].join("|");
        const e = map.get(key) || { key, count: 0, last: 0, players: new Set(), item: h };
        e.count++;
        e.players.add(h.clientUid);
        if ((h.createdMs || 0) >= e.last) { e.last = h.createdMs || 0; e.item = h; }
        map.set(key, e);
    }
    return [...map.values()].map(e => {
        const h = e.item;
        return {
            key: e.key, count: e.count, players: e.players.size, last: e.last,
            title: h.title, skill: h.skill || "", note: h.note || "", cadence: h.cadence || "weekly", timesPerWeek: h.timesPerWeek || 3,
            minutes: h.minutes || null, goal: h.goal || null, videoId: h.videoId || "", startSec: h.startSec ?? null, endSec: h.endSec ?? null,
            askClip: Boolean(h.askClip), diagram: h.diagram || ""
        };
    }).sort((a, b) => b.count - a.count || b.last - a.last || a.title.localeCompare(b.title));
}

export const librarySkills = items => [...new Set((items || []).map(i => i.skill).filter(Boolean))].sort();
export const filterLibrary = (items = [], skill = "all", search = "") => {
    const q = norm(search);
    return items.filter(i => (skill === "all" || i.skill === skill) && (!q || norm(i.title).includes(q)));
};

// What the assign sheet gets pre-filled with (due date is chosen fresh).
export const prefillFrom = item => ({
    title: item.title, skill: item.skill, note: item.note, cadence: item.cadence, timesPerWeek: item.timesPerWeek,
    minutes: item.minutes, goal: item.goal, videoId: item.videoId, startSec: item.startSec, endSec: item.endSec, askClip: item.askClip, diagram: item.diagram
});
