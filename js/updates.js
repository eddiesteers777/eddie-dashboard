/* ==========================================
   Southbound — From Your Coach (updates.html)

   The client's one place for everything their coach has told them:
   updates sent from the Client Hub (clientUpdates), replies to weekly
   check-ins, and notes on sessions that have happened. Merged by
   buildCoachFeed (js/clientSummary.js). Opening the page marks new
   updates as read, which the coach sees in the hub.

   The coach's private notes (coachNotes) are a different collection
   that clients can't read at all, so they can never show here.
========================================== */

import { listenForAuth } from "./auth.js";
import { listMyUpdates, markUpdatesRead } from "./clientNotes.js";
import { listMyResults } from "./workoutResults.js";
import { listMyCheckins } from "./checkins.js";
import { listMyBookingRequests } from "./scheduling.js";
import { listMyCoaches } from "./coachAccess.js";
import { buildCoachFeed, isoDate } from "./clientSummary.js";
import { cachedRole } from "./role.js";
import { icon } from "./icons.js";
import { emptyHtml } from "./ui.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const KIND_ICON = { update: "send", feedback: "star", session: "clipboard", workout: "activity" };

function when(ms) {
    const date = new Date(ms);
    const today = isoDate(new Date());
    const iso = isoDate(date);
    if (iso === today) return "Today";
    if (iso === isoDate(new Date(Date.now() - 86400000))) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function itemHtml(item) {
    const tag = item.link ? `a href="${item.link}"` : "div";
    return `
        <${tag} class="updates-item ${item.unread ? "is-new" : ""} kind-${item.kind}">
            <span class="updates-icon">${icon(KIND_ICON[item.kind] || "messageSquare")}</span>
            <span class="updates-body">
                <span class="updates-head">
                    <strong>${esc(item.title)}</strong>
                    ${item.unread ? `<span class="updates-new">New</span>` : ""}
                    <span class="updates-when">${esc(when(item.at))}${item.detail ? ` · ${esc(item.detail)}` : ""}</span>
                </span>
                <span class="updates-text">${esc(item.text)}</span>
            </span>
        </${tag.split(" ")[0]}>`;
}

let started = false;

listenForAuth(async user => {
    if (!user || started) return;
    started = true;

    if (cachedRole() === "coach") {
        $("feedLoading").hidden = true;
        $("feed").innerHTML = `<div class="clients-card"><p class="clients-card-note">This is where your clients read what you send them. Send an update from a client's page in <a href="clients.html">My Clients</a> (Notes tab).</p></div>`;
        return;
    }

    const [updates, checkins, requests, coaches, results] = await Promise.all([
        listMyUpdates().catch(error => { console.warn("Southbound: updates unavailable.", error); return []; }),
        listMyCheckins().catch(() => []),
        listMyBookingRequests().catch(() => []),
        listMyCoaches().catch(() => []),
        listMyResults().catch(() => [])
    ]);
    const feed = buildCoachFeed({ updates, checkins, requests, results, today: isoDate(new Date()) });

    $("feedLoading").hidden = true;
    $("feed").innerHTML = feed.length
        ? feed.map(itemHtml).join("")
        : `<div class="clients-card">${coaches.length
            ? emptyHtml({ iconName: "messageSquare", title: "Nothing from your coach yet", text: "Updates, replies to your weekly check-in and notes from your sessions show up here.", actionHref: "checkin.html", actionLabel: "Send a check-in" })
            : emptyHtml({ iconName: "link", title: "Not connected to a coach yet", text: "Connect with your coach and their updates show up here.", actionHref: "clients.html?tab=share", actionLabel: "Connect with Coach" })}</div>`;

    // Seen now; the "New" tags stay until the next visit.
    markUpdatesRead(updates);
});
