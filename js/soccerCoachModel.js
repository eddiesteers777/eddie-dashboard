/* ==========================================
   Southbound — the coach's Soccer page (pure)

   What a soccer coach needs on one screen: the next session (with who is
   booked), requests waiting, homework with practices the coach hasn't
   looked at yet, and the numbers over them. Nothing is stored. Unit-tested
   in tests/soccerCoachModel.test.mjs.
========================================== */

import { sessionList } from "./sessionModel.js";

// Sessions from today on, grouped by date + start time + open time (a group
// session is one row with everyone booked). Soonest first.
export function upcomingSessions(requests = [], today = "", limit = 6) {
    const groups = new Map();
    for (const s of sessionList(requests, today)) {
        if (s.date < today || ["cancelled", "late-cancel"].includes(s.log?.status)) continue;
        const key = `${s.date}|${s.startTime}|${s.slotId || s.bookingId}`;
        const g = groups.get(key) || { key, date: s.date, startTime: s.startTime, endTime: s.endTime, label: s.label, sessionType: s.sessionType, players: [] };
        g.players.push({ clientUid: s.clientUid, name: s.clientName || "Player" });
        groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime))).slice(0, limit);
}

export const waitingRequests = (requests = []) => (requests || []).filter(r => r?.status === "requested");

// Homework with practices logged since the coach last reviewed it.
// Returns [{ hw, fresh }] with the most recent practice first.
export function homeworkToReview(homework = []) {
    const out = [];
    for (const hw of homework || []) {
        if (!hw || hw.status === "archived") continue;
        const reviewed = Number(hw.reviewedMs) || 0;
        const fresh = (hw.logs || []).filter(l => (l?.at || 0) > reviewed);
        if (fresh.length) out.push({ hw, fresh: fresh.length, last: Math.max(...fresh.map(l => l.at || 0)) });
    }
    return out.sort((a, b) => b.last - a.last);
}

// The strip of numbers: sessions this week, requests, practices to look at.
export function soccerCounts({ requests = [], homework = [], today = "" } = {}) {
    const sessions = upcomingSessions(requests, today, 500);
    const end = new Date(`${today}T00:00:00`); end.setDate(end.getDate() + 7);
    const endIso = end.toLocaleDateString("en-CA");
    const review = homeworkToReview(homework);
    return {
        thisWeek: sessions.filter(s => s.date < endIso).length,
        requests: waitingRequests(requests).length,
        toReview: review.length,
        practices: review.reduce((n, r) => n + r.fresh, 0)
    };
}

// ---- Players (every soccer client) ----

const hasSvc = (profile, id) => (profile?.services || []).includes(id);

// One row per soccer client. `homework` is everything this coach assigned.
// status: "new" (nothing active), "behind" (something behind or overdue), "ok".
// `standingOf(hw)` comes from homeworkModel.standing so this stays pure.
export function playerRows({ links = [], profiles = new Map(), homework = [], standingOf = () => "on-track" } = {}) {
    const by = new Map();
    for (const hw of homework || []) {
        if (!hw || hw.status === "archived") continue;
        (by.get(hw.clientUid) || by.set(hw.clientUid, []).get(hw.clientUid)).push(hw);
    }
    const rows = [];
    for (const link of links || []) {
        const profile = profiles.get(link.clientUid);
        const group = hasSvc(profile, "soccer_group"), one = hasSvc(profile, "soccer_1on1");
        if (!group && !one) continue;
        const active = by.get(link.clientUid) || [];
        const behind = active.filter(h => ["behind", "overdue"].includes(standingOf(h))).length;
        const lastMs = Math.max(0, ...active.flatMap(h => (h.logs || []).map(l => l?.at || 0)));
        rows.push({
            uid: link.clientUid,
            name: profile?.displayName || link.clientName || "Player",
            group, one,
            kind: group && one ? "Group + 1-on-1" : group ? "Group" : "1-on-1",
            homework: active.length, behind, lastMs,
            status: !active.length ? "new" : behind ? "behind" : "ok"
        });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export const PLAYER_FILTERS = [["all", "All"], ["group", "Group"], ["one", "1-on-1"], ["needs", "Needs homework"]];

export function filterPlayers(rows = [], filter = "all", search = "") {
    const q = String(search || "").trim().toLowerCase();
    return rows.filter(r =>
        (filter === "all" || (filter === "group" && r.group) || (filter === "one" && r.one) || (filter === "needs" && r.status !== "ok"))
        && (!q || r.name.toLowerCase().includes(q)));
}
