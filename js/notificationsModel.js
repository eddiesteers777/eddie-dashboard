/* ==========================================
   What the bell shows (pure, unit-tested: tests/notifications.test.mjs)

   What needs the client's attention right now, built from the same lists
   the Today "From Your Coach" card reads (js/coachCard.js): a plan waiting
   for "Got it", unread messages, unread updates, a weekly check-in that is
   due, and a coach reply to one. Nothing new is stored: the count goes down
   when the client reads the thing, on its own page.
========================================== */

import { checkinRows } from "./todayGlance.js";
import { unreadFor } from "./messageThread.js";
import { awaitingAck, noticeVersionOf } from "./planWindow.js";

// A line of someone's words, shortened, with reaction codes (":sb_high_five:") taken out.
function words(text, max = 90) {
    const clean = String(text ?? "").replace(/:sb_[a-z_]+:?/g, "").replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

export function localIso(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Everything that needs attention.
//   plans, messages, updates, checkins: the client's own lists
//   today: "YYYY-MM-DD"; hasCoach / canCheckins: from the account
// Returns [{ id, icon, title, detail, link }]
export function notificationItems({ plans = [], messages = [], updates = [], checkins = [], today = localIso(), hasCoach = false, canCheckins = false } = {}) {
    const items = [];

    for (const plan of plans.filter(awaitingAck)) {
        items.push({
            id: `plan:${plan.id}`,
            icon: "calendar",
            title: noticeVersionOf(plan) > 1 ? "Your plan was updated" : "Your plan is ready",
            detail: plan.name || "",
            link: `plan.html?plan=${encodeURIComponent(plan.id)}`
        });
    }

    const unreadMessages = unreadFor(messages, "client");
    if (unreadMessages.length) {
        const last = unreadMessages[unreadMessages.length - 1];
        const from = last.senderName || "your coach";
        items.push({
            id: "messages",
            icon: "messageSquare",
            title: unreadMessages.length === 1 ? `New message from ${from}` : `${unreadMessages.length} new messages from ${from}`,
            detail: words(last.text),
            link: `messages.html?coach=${encodeURIComponent(last.coachUid)}`
        });
    }

    const unreadUpdates = updates.filter(u => !u.readAt);
    if (unreadUpdates.length) {
        items.push({
            id: "updates",
            icon: "send",
            title: unreadUpdates.length === 1 ? `New update from ${unreadUpdates[0].coachName || "your coach"}` : `${unreadUpdates.length} new updates from your coach`,
            detail: words(unreadUpdates[0].text),
            link: "updates.html"
        });
    }

    // Only the check-in rows that ask for something: one due now, or a reply. "Due Sunday" and "sent" are not news.
    if (hasCoach && canCheckins) {
        for (const r of checkinRows(today, checkins)) {
            if (r.kind !== "checkin-due" && r.kind !== "checkin-reply") continue;
            items.push({ id: r.kind, icon: "star", title: r.title, detail: r.kind === "checkin-reply" ? words(r.note) : r.detail, link: "checkin.html" });
        }
    }

    return items;
}
