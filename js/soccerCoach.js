/* ==========================================
   Southbound — the coach's Soccer page (soccer-coach.html)

   One screen for a soccer coach (or the admin): the next session and who
   is booked, requests waiting, homework with practices not looked at yet,
   what is coming up, and the Playbook. Read-only: answering requests and
   reviewing homework stay on Schedule and the Client Hub, one tap away.
   Reads only what a coach may already read. Pure logic:
   js/soccerCoachModel.js.
========================================== */

import { listenForAuth } from "./auth.js";
import { listRequestsForMyClients } from "./scheduling.js";
import { listHomeworkIAssigned } from "./homework.js";
import { listMyClients } from "./coachAccess.js";
import { upcomingSessions, waitingRequests, homeworkToReview, soccerCounts } from "./soccerCoachModel.js";
import { esc } from "./homeworkView.js";
import { friendlyError } from "./ui.js";

const $ = id => document.getElementById(id);
const today = new Date().toLocaleDateString("en-CA");
const dateShort = d => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const time = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
const empty = text => `<div class="sc-empty">${esc(text)}</div>`;
const playerLine = players => players.length > 4 ? `${players.slice(0, 4).map(p => esc(p.name)).join(", ")} +${players.length - 4}` : players.map(p => esc(p.name)).join(", ");

function render({ requests, homework, names }) {
    const c = soccerCounts({ requests, homework, today });
    $("scCounts").innerHTML = [
        [c.thisWeek, "Sessions, next 7 days"], [c.requests, "Requests waiting"], [c.toReview, "Homework to review"]
    ].map(([n, label]) => `<div><b>${n}</b><span>${esc(label)}</span></div>`).join("");
    $("scLead").textContent = c.requests || c.toReview ? [c.requests && `${c.requests} ${c.requests === 1 ? "request" : "requests"} waiting`, c.toReview && `${c.toReview} homework to review`].filter(Boolean).join(" · ") : "Nothing waiting on you.";

    const sessions = upcomingSessions(requests, today);
    const next = sessions[0];
    $("scNext").innerHTML = next
        ? `<div class="sb-next-top"><span class="sb-kick tan">Next session · ${esc(next.date === today ? "Today" : dateShort(next.date))}</span><span class="sb-chip">${next.players.length} booked</span></div>
           <div class="sb-next-when"><b>${esc(time(next.startTime))}</b><span>${esc(next.label || "Soccer")}${next.endTime ? ` · until ${esc(time(next.endTime))}` : ""}</span></div>
           <p class="sc-players">${playerLine(next.players)}</p>`
        : `<div class="sb-next-top"><span class="sb-kick tan">Next session</span></div><div class="sc-empty">No sessions booked. Open times are set on <a href="schedule.html">Schedule</a>.</div>`;

    const waiting = waitingRequests(requests);
    $("scRequests").innerHTML = waiting.length ? waiting.slice(0, 6).map(r => `<a class="sc-row" href="schedule.html"><div><b>${esc(r.clientName || "Player")}</b><small>${esc(r.label || "Soccer")} · ${esc(dateShort((r.dates || [])[0] || today))} · ${esc(time(r.startTime))}</small></div><span class="sc-pill">Waiting</span></a>`).join("") : empty("No requests waiting.");

    const review = homeworkToReview(homework);
    $("scHomework").innerHTML = review.length ? review.slice(0, 8).map(({ hw, fresh }) => `<a class="sc-row" href="client.html?uid=${encodeURIComponent(hw.clientUid)}&tab=homework"><div><b>${esc(names.get(hw.clientUid) || "Player")}</b><small>${esc(hw.title)}</small></div><span class="sc-pill ice">${fresh} new</span></a>`).join("") : empty("No new practices to look at.");

    $("scUpcoming").innerHTML = sessions.length ? sessions.map(s => `<div class="sc-row"><div><b>${esc(dateShort(s.date))} · ${esc(time(s.startTime))}</b><small>${esc(s.label || "Soccer")} · ${playerLine(s.players)}</small></div><span class="sc-pill">${s.players.length}</span></div>`).join("") : empty("Nothing coming up.");
}

listenForAuth(async user => {
    if (!user) return;
    // Who may open this page is decided by PAGE_REQUIRES in js/navAccess.js (coach + sessions).
    try {
        const [requests, homework, links] = await Promise.all([listRequestsForMyClients(), listHomeworkIAssigned(), listMyClients().catch(() => [])]);
        const names = new Map(links.map(l => [l.clientUid, l.clientName]));
        for (const r of requests) if (r.clientUid && r.clientName && !names.has(r.clientUid)) names.set(r.clientUid, r.clientName);
        render({ requests, homework, names });
        $("scLoading").hidden = true;
        $("scBody").hidden = false;
    } catch (error) {
        console.warn("Southbound: couldn't load the Soccer page.", error);
        $("scLoading").hidden = true;
        $("scError").hidden = false;
        $("scError").innerHTML = `<p>${esc(friendlyError(error, "open the Soccer page"))}</p><button type="button" class="clients-btn-primary" onclick="location.reload()">Try again</button>`;
    }
});
