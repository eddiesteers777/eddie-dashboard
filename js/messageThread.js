/* ==========================================
   Southbound — the coach-client message thread (pure)

   A message: { id, coachUid, clientUid, from: "coach" | "client",
   senderName, text, createdAt, readAt } (firestore.rules "messages").
   Nothing here touches Firestore, so it's unit-tested in
   tests/messageThread.test.mjs.

     sortThread(messages)              oldest first; one still being sent
                                       (no server time yet) goes last
     threadDays(messages, opts)        grouped by day for drawing, each
                                       message marked mine / theirs, the
                                       first of a run from the same side
     unreadFor(messages, role)         what the other side sent that I
                                       haven't read
     inboxByClient(messages)           coach side: per client, the last
                                       message, how many of theirs are
                                       unread and since when
     messageAttention(entry, opts)     the "Who needs you today" line for
                                       a client's unread messages
     shouldEmail(messages, role)       email the other side only for the
                                       first message they haven't read,
                                       so a burst of messages is one email
     preview(text, n)                  one line, reactions as [Label]
========================================== */

import { emojiPlainText } from "./emoji.js";

export const MAX_MESSAGE = 2000;

export function millis(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

const other = role => (role === "coach" ? "client" : "coach");

export function sortThread(messages) {
    return (messages || [])
        .filter(m => m && typeof m.text === "string")
        .map((m, i) => ({ m, i, at: millis(m.createdAt) || millis(m.sentAt) }))
        // A message still waiting for the server's clock is the newest.
        .sort((a, b) => (a.at || Infinity) - (b.at || Infinity) || a.i - b.i)
        .map(x => x.m);
}

function dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayLabel(key, today) {
    if (key === today) return "Today";
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const [ty, tm, td] = String(today || "").split("-").map(Number);
    if (ty) {
        const t = new Date(ty, tm - 1, td);
        const diff = Math.round((t - date) / 86400000);
        if (diff === 1) return "Yesterday";
        if (diff > 1 && diff < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
        if (date.getFullYear() !== t.getFullYear()) return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function timeLabel(ms) {
    return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** [{ key, label, items: [{ ...message, at, mine, first, time }] }] */
export function threadDays(messages, { role = "client", today = dayKey(Date.now()), now = Date.now() } = {}) {
    const days = [];
    let prev = null;
    let prevAt = 0;
    for (const m of sortThread(messages)) {
        const at = millis(m.createdAt) || millis(m.sentAt) || now;
        const key = dayKey(at);
        let day = days[days.length - 1];
        if (!day || day.key !== key) {
            day = { key, label: dayLabel(key, today), items: [] };
            days.push(day);
            prev = null;
        }
        // A new run starts when the side changes or 10+ minutes pass.
        const first = !prev || prev.from !== m.from || at - prev.at > 10 * 60000;
        const item = { ...m, at, mine: m.from === role, first, time: timeLabel(at) };
        // iPhone-style time stamp: shown above a run that starts after a long pause.
        item.stamp = !prevAt || at - prevAt >= 30 * 60000 ? timeLabel(at) : "";
        prevAt = at;
        day.items.push(item);
        prev = item;
    }
    // Where each bubble sits in its run (joined corners, tail on the last).
    for (const day of days) {
        day.items.forEach((item, i) => {
            const startsRun = item.first;
            const endsRun = !day.items[i + 1] || day.items[i + 1].first;
            item.pos = startsRun && endsRun ? "single" : startsRun ? "top" : endsRun ? "end" : "mid";
        });
    }
    return days;
}

export function unreadFor(messages, role) {
    return (messages || []).filter(m => m && m.from === other(role) && !m.readAt && m.id);
}

/** Coach side: Map clientUid -> { last, unread, waitingSince, count } */
export function inboxByClient(messages) {
    const by = new Map();
    for (const m of sortThread(messages)) {
        const e = by.get(m.clientUid) || { last: null, unread: 0, waitingSince: 0, count: 0 };
        e.count++;
        e.last = m;
        if (m.from === "client" && !m.readAt) {
            e.unread++;
            if (!e.waitingSince) e.waitingSince = millis(m.createdAt);
        }
        by.set(m.clientUid, e);
    }
    return by;
}

export function preview(text, n = 90) {
    const plain = emojiPlainText(String(text || "")).replace(/\s+/g, " ").trim();
    return plain.length > n ? `${plain.slice(0, n - 1).trimEnd()}…` : plain;
}

/** The dashboard / hub attention line for a client's unread messages, or null. */
export function messageAttention(entry) {
    if (!entry?.unread) return null;
    const last = entry.last?.from === "client" ? entry.last : null;
    const text = entry.unread === 1 && last
        ? `Sent you a message: "${preview(last.text)}"`
        : `${entry.unread} messages waiting on you${last ? `, the last: "${preview(last.text, 60)}"` : ""}`;
    return { kind: "message", text, tab: "messages", at: entry.waitingSince || undefined };
}

/**
 * Email the other side only when this message is the first one they
 * haven't read yet (`messages` is the thread before this one was sent).
 */
export function shouldEmail(messages, role) {
    return !(messages || []).some(m => m && m.from === role && !m.readAt);
}

/** True while the other side's last "typing" ping is fresh (they ping every ~3s). */
export function isTyping(at, now = Date.now()) {
    const t = millis(at);
    return t > 0 && now - t < 6000 && t - now < 60000;
}

/** The receipt line under my newest message ("Delivered" / "Read 6:41 PM"). */
export function seenLine(messages, role) {
    const mine = sortThread(messages).filter(m => m.from === role);
    const last = mine[mine.length - 1];
    if (!last || !last.id) return "";
    return last.readAt ? `Read ${timeLabel(millis(last.readAt))}` : "Delivered";
}

/** Pins: the coach's pinned chats are a list of client uids (js/pinnedChats usage). */
export function togglePinned(list, uid) {
    const have = Array.isArray(list) ? list.filter(x => typeof x === "string") : [];
    return have.includes(uid) ? have.filter(x => x !== uid) : [uid, ...have];
}
