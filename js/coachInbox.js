/* ==========================================
   Southbound — the coach's message inbox (pure)

   Turns the clients (from the client directory, each with its messages)
   into the grouped list on coach-messages.html. No Firebase here.

   Groups, in order:
     needs    they wrote and I haven't read it (longest wait first)
     waiting  my message went unanswered for WAIT_DAYS or more
     caught   the rest with a conversation
     none     nobody has written yet (so the coach can start one)
========================================== */

import { inboxByClient, preview } from "./messageThread.js";

export const WAIT_DAYS = 2;
export const GROUPS = [
    { key: "needs", label: "Needs your reply" },
    { key: "waiting", label: "Waiting on them" },
    { key: "caught", label: "Caught up" },
    { key: "none", label: "No messages yet" }
];

const ms = v => (typeof v?.toMillis === "function" ? v.toMillis() : Number(v?.seconds ? v.seconds * 1000 : v) || 0);

/** One row per client: { uid, name, group, unread, at, text, mine }. */
export function inboxRows(clients, now = Date.now()) {
    return (clients || []).map(c => {
        const entry = inboxByClient(c.messages || []).get(c.uid);
        const last = entry?.last || null;
        const at = last ? ms(last.createdAt) : 0;
        let group = "none";
        if (last) {
            if (entry.unread) group = "needs";
            else if (last.from === "coach" && now - at >= WAIT_DAYS * 86400000) group = "waiting";
            else group = "caught";
        }
        return {
            uid: c.uid, name: c.name, searchText: c.searchText || String(c.name || "").toLowerCase(),
            group, unread: entry?.unread || 0, at, waitingSince: entry?.waitingSince || 0,
            text: last ? preview(last.text, 70) : "", mine: last?.from === "coach"
        };
    });
}

/** [{ key, label, rows }] for the groups that have rows, after search. */
export function inboxGroups(rows, { query = "" } = {}) {
    const q = String(query || "").trim().toLowerCase();
    const shown = (rows || []).filter(r => !q || r.searchText.includes(q));
    return GROUPS.map(g => {
        const list = shown.filter(r => r.group === g.key);
        list.sort(g.key === "needs"
            ? (a, b) => (a.waitingSince || a.at) - (b.waitingSince || b.at) || a.name.localeCompare(b.name)
            : g.key === "none" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.at - a.at);
        return { ...g, rows: list };
    }).filter(g => g.rows.length);
}

/** Total waiting on the coach (the badge). */
export const needsCount = rows => (rows || []).filter(r => r.group === "needs").length;
