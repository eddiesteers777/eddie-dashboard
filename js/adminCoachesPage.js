/* ==========================================
   Southbound — My Coaches (admin-coaches.html page logic)

   List: one card per coach with the numbers. Tap one (?coach=uid) for
   their next session, requests, homework to review, coming up and players.
   Their own running plan opens in the Client Hub, because they are also
   your clients. Read-only. Pure logic: js/soccerCoachModel.js.
========================================== */

import { listenForAuth } from "./auth.js";
import { listMyCoachAccounts, loadCoachData } from "./adminCoaches.js";
import { upcomingSessions, waitingRequests, homeworkToReview, soccerCounts } from "./soccerCoachModel.js";
import { scopeLabel } from "./services.js";
import { esc } from "./homeworkView.js";
import { friendlyError } from "./ui.js";

const $ = id => document.getElementById(id);
const today = new Date().toLocaleDateString("en-CA");
const dateShort = d => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const time = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
const empty = text => `<div class="sc-empty">${esc(text)}</div>`;
const playerLine = players => players.length > 4 ? `${players.slice(0, 4).map(p => esc(p.name)).join(", ")} +${players.length - 4}` : players.map(p => esc(p.name)).join(", ");
const initials = name => String(name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();

const counts4 = (c, players) => [[players, "Players"], [c.thisWeek, "Sessions, 7 days"], [c.requests, "Requests"], [c.toReview, "To review"]]
    .map(([n, label]) => `<div><b>${n}</b><span>${esc(label)}</span></div>`).join("");

function renderList(coaches, datas) {
    $("acLead").textContent = coaches.length ? `${coaches.length} ${coaches.length === 1 ? "coach" : "coaches"}` : "No coaches yet.";
    $("acList").innerHTML = coaches.length ? coaches.map((c, i) => {
        const d = datas[i];
        const k = soccerCounts({ requests: d.requests, homework: d.homework, today });
        return `<a class="ac-card" href="admin-coaches.html?coach=${encodeURIComponent(c.uid)}">
            <div class="ac-head"><span class="ac-av">${esc(initials(c.name))}</span><div><b>${esc(c.name)}</b><small>${esc(scopeLabel(c.scope))}</small></div><span class="sc-pill">Open</span></div>
            <div class="sc-counts ac-counts">${counts4(k, d.links.length)}</div></a>`;
    }).join("") : `<div class="clients-empty"><p>Nobody is a coach yet. Open a client in the Client Hub and use the coach role button.</p></div>`;
}

function renderDetail(coach, d) {
    $("acEyebrow").textContent = scopeLabel(coach.scope);
    $("acTitle").textContent = coach.name;
    const k = soccerCounts({ requests: d.requests, homework: d.homework, today });
    $("acLead").textContent = k.requests || k.toReview ? [k.requests && `${k.requests} waiting`, k.toReview && `${k.toReview} to review`].filter(Boolean).join(" · ") : "Nothing waiting.";
    $("acCounts").innerHTML = counts4(k, d.links.length);
    $("acActions").innerHTML = `<a class="clients-btn-primary" href="client.html?uid=${encodeURIComponent(coach.uid)}&tab=plan">Edit their running plan</a>
        <a class="clients-btn-secondary" href="client.html?uid=${encodeURIComponent(coach.uid)}">Open in Client Hub</a>`;

    const names = new Map(d.links.map(l => [l.clientUid, l.clientName]));
    const sessions = upcomingSessions(d.requests, today);
    const next = sessions[0];
    $("acNext").innerHTML = next
        ? `<div class="sb-next-top"><span class="sb-kick tan">Next session · ${esc(next.date === today ? "Today" : dateShort(next.date))}</span><span class="sb-chip">${next.players.length} booked</span></div>
           <div class="sb-next-when"><b>${esc(time(next.startTime))}</b><span>${esc(next.label || "Soccer")}${next.endTime ? ` · until ${esc(time(next.endTime))}` : ""}</span></div>
           <p class="sc-players">${playerLine(next.players)}</p>`
        : `<div class="sb-next-top"><span class="sb-kick tan">Next session</span></div><div class="sc-empty">No sessions booked.</div>`;

    const waiting = waitingRequests(d.requests);
    $("acRequests").innerHTML = waiting.length ? waiting.slice(0, 8).map(r => `<div class="sc-row"><div><b>${esc(r.clientName || names.get(r.clientUid) || "Player")}</b><small>${esc(r.label || "Soccer")} · ${esc(dateShort((r.dates || [])[0] || today))} · ${esc(time(r.startTime))}</small></div><span class="sc-pill">Waiting</span></div>`).join("") : empty("No requests waiting.");

    const review = homeworkToReview(d.homework);
    $("acHomework").innerHTML = review.length ? review.slice(0, 8).map(({ hw, fresh }) => `<div class="sc-row"><div><b>${esc(names.get(hw.clientUid) || "Player")}</b><small>${esc(hw.title)}</small></div><span class="sc-pill ice">${fresh} new</span></div>`).join("") : empty("No new practices to look at.");

    $("acUpcoming").innerHTML = sessions.length ? sessions.map(s => `<div class="sc-row"><div><b>${esc(dateShort(s.date))} · ${esc(time(s.startTime))}</b><small>${esc(s.label || "Soccer")} · ${playerLine(s.players)}</small></div><span class="sc-pill">${s.players.length}</span></div>`).join("") : empty("Nothing coming up.");

    $("acPlayers").innerHTML = d.links.length ? d.links.map(l => `<a class="sc-row" href="client.html?uid=${encodeURIComponent(l.clientUid)}"><div><b>${esc(l.clientName || "Player")}</b><small>Open in Client Hub</small></div></a>`).join("") : empty("No players linked yet.");
}

listenForAuth(async user => {
    if (!user) return;
    // Admin only: PAGE_REQUIRES in js/navAccess.js.
    try {
        const coaches = await listMyCoachAccounts();
        const pick = new URLSearchParams(location.search).get("coach");
        const chosen = coaches.find(c => c.uid === pick);
        if (chosen) {
            renderDetail(chosen, await loadCoachData(chosen.uid));
            $("acDetail").hidden = false;
        } else {
            const datas = await Promise.all(coaches.map(c => loadCoachData(c.uid)));
            renderList(coaches, datas);
            $("acList").hidden = false;
        }
        $("acLoading").hidden = true;
    } catch (error) {
        console.warn("Southbound: couldn't load My Coaches.", error);
        $("acLoading").hidden = true;
        $("acError").hidden = false;
        $("acError").innerHTML = `<p>${esc(friendlyError(error, "open My Coaches"))}</p><button type="button" class="clients-btn-primary" onclick="location.reload()">Try again</button>`;
    }
});
