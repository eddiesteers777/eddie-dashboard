/* ==========================================
   Southbound — session prep for a soccer client (pure)

   One screen for the coach before a session: when it is, what happened
   last time, how the homework is going, and a few drills worth assigning
   next. Everything is derived from data the Client Hub already has.
   Unit-tested in tests/prepModel.test.mjs.
========================================== */

import { logWords } from "./sessionModel.js";

// Homework skill -> Playbook drill topics worth looking at.
export const TOPICS_FOR_SKILL = {
    Passing: ["Passing", "Possession"], "First touch": ["Receiving"], Dribbling: ["Dribbling"], Finishing: ["Finishing"],
    Fitness: ["Conditioning", "Warm-up"], "Weak foot": ["Passing", "Finishing"], Scanning: ["Receiving", "Possession"], Juggling: ["Receiving"]
};
const GENERAL = ["Passing", "Receiving", "Dribbling"];

/**
 * sessions: sessionList() rows. homework: the client's homework docs. standing(hw): "on-track" | "behind" | "overdue" | "done".
 * Returns { next, last, skills, behind }.
 */
export function prepSummary({ sessions = [], homework = [], today = "", standing = () => "" } = {}) {
    const live = sessions.filter(s => !["cancelled", "late-cancel"].includes(s.log?.status));
    const next = live.filter(s => s.date >= today && !s.log).sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime)))[0] || null;
    const done = live.filter(s => s.date < today || s.log).filter(s => s.log?.status === "completed" || (!s.log && s.date < today));
    const lastRow = done.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    const last = lastRow ? { date: lastRow.date, status: lastRow.log?.status || "", words: logWords(lastRow.log) } : null;
    const active = homework.filter(h => h.status !== "archived");
    const skills = [...new Set(active.map(h => h.skill).filter(Boolean))];
    const behind = active.filter(h => ["behind", "overdue"].includes(standing(h))).map(h => h.title);
    return { next, last, skills, behind };
}

// A few solo-friendly drills for what they are working on, skipping ones already assigned.
export function suggestDrills(drills = [], skills = [], assignedTitles = [], limit = 4) {
    const have = new Set(assignedTitles.map(t => String(t).toLowerCase()));
    const topics = [...new Set(skills.flatMap(s => TOPICS_FOR_SKILL[s] || []))];
    const wanted = topics.length ? topics : GENERAL;
    const pool = drills.filter(d => (d.minPlayers || 1) <= 2 && !have.has(String(d.name).toLowerCase()));
    const out = [];
    // Round-robin over the wanted topics so one skill doesn't crowd out the rest.
    const lists = wanted.map(t => pool.filter(d => d.topic === t));
    for (let i = 0; out.length < limit && lists.some(l => i < l.length); i++) {
        for (const l of lists) if (i < l.length && out.length < limit) out.push(l[i]);
    }
    return out;
}
