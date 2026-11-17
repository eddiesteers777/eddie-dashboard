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
import { listHomeworkIAssigned, assignHomework } from "./homework.js";
import { listMyClients, assignClient } from "./coachAccess.js";
import { shareWithParent } from "./parentShare.js";
import { loadSoccerRoster, listAllSoccerHomework } from "./soccerRoster.js";
import { upcomingSessions, waitingRequests, homeworkToReview, soccerCounts, playerRows, filterPlayers, PLAYER_FILTERS } from "./soccerCoachModel.js";
import { getProfile } from "./userProfile.js";
import { standing } from "./homeworkModel.js";
import { openSheet } from "./homeworkCoach.js";
import { esc } from "./homeworkView.js";
import { planKey } from "./sessionPlanModel.js";
import { listMyPlans } from "./sessionPlans.js";
import { friendlyError, toast } from "./ui.js";

const $ = id => document.getElementById(id);
const today = new Date().toLocaleDateString("en-CA");
const dateShort = d => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const time = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
const empty = text => `<div class="sc-empty">${esc(text)}</div>`;
const playerLine = players => players.length > 4 ? `${players.slice(0, 4).map(p => esc(p.name)).join(", ")} +${players.length - 4}` : players.map(p => esc(p.name)).join(", ");

// Link to the session page: "Plan" until one is saved, then "Open plan".
let planned = new Set();
const planLink = s => { const key = planKey({ slotId: s.slotId, bookingId: s.bookingId }); return `<a class="sc-plan-link${planned.has(`${key}|${s.date}`) ? " has" : ""}" href="soccer-session.html?key=${encodeURIComponent(key)}&date=${encodeURIComponent(s.date)}">${planned.has(`${key}|${s.date}`) ? "Open plan" : "Plan"}</a>`; };

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
           <p class="sc-players">${playerLine(next.players)}</p><p>${planLink(next)}</p>`
        : `<div class="sb-next-top"><span class="sb-kick tan">Next session</span></div><div class="sc-empty">No sessions booked. Open times are set on <a href="schedule.html">Schedule</a>.</div>`;

    const waiting = waitingRequests(requests);
    $("scRequests").innerHTML = waiting.length ? waiting.slice(0, 6).map(r => `<a class="sc-row" href="schedule.html"><div><b>${esc(r.clientName || "Player")}</b><small>${esc(r.label || "Soccer")} · ${esc(dateShort((r.dates || [])[0] || today))} · ${esc(time(r.startTime))}</small></div><span class="sc-pill">Waiting</span></a>`).join("") : empty("No requests waiting.");

    const review = homeworkToReview(homework);
    $("scHomework").innerHTML = review.length ? review.slice(0, 8).map(({ hw, fresh }) => `<a class="sc-row" href="client.html?uid=${encodeURIComponent(hw.clientUid)}&tab=homework"><div><b>${esc(names.get(hw.clientUid) || "Player")}</b><small>${esc(hw.title)}</small></div><span class="sc-pill ice">${fresh} new</span></a>`).join("") : empty("No new practices to look at.");

    $("scUpcoming").innerHTML = sessions.length ? sessions.map(s => `<div class="sc-row"><div><b>${esc(dateShort(s.date))} · ${esc(time(s.startTime))}</b><small>${esc(s.label || "Soccer")} · ${playerLine(s.players)}</small></div>${planLink(s)}</div>`).join("") : empty("Nothing coming up.");
}

// ---- Players: every soccer client, tick several or tap Assign on one ----
const pl = { user: null, requests: [], onlyMine: false, mine: new Set(), rows: [], filter: "all", search: "", picked: new Set(), homework: [] };
const ago = ms => { if (!ms) return "no practice yet"; const d = Math.floor((Date.now() - ms) / 864e5); return d <= 0 ? "practiced today" : d === 1 ? "practiced yesterday" : `practiced ${d} days ago`; };
const initials = name => String(name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const STATUS = { new: ["New", "ice"], behind: ["Behind", "clay"], ok: ["On track", "sage"] };

function renderPlayers() {
    const base = pl.onlyMine ? pl.rows.filter(r => pl.mine.has(r.uid)) : pl.rows;
    const shown = filterPlayers(base, pl.filter, pl.search);
    $("scPlCount").textContent = `${base.length} ${base.length === 1 ? "player" : "players"}`;
    const n = f => filterPlayers(base, f).length;
    const mineCount = pl.rows.filter(r => pl.mine.has(r.uid)).length;
    const scope = pl.rows.length > mineCount ? `<button type="button" class="sc-chip${pl.onlyMine ? " on" : ""}" data-mine aria-pressed="${pl.onlyMine}">${pl.onlyMine ? `My players ${mineCount}` : `All players ${pl.rows.length}`} · switch</button>` : "";
    $("scPlChips").innerHTML = scope + PLAYER_FILTERS.map(([id, label]) => `<button type="button" class="sc-chip${pl.filter === id ? " on" : ""}" data-filter="${id}" aria-pressed="${pl.filter === id}">${esc(label)} ${n(id)}</button>`).join("")
        + (shown.length ? `<button type="button" class="sc-chip" data-all>${shown.every(r => pl.picked.has(r.uid)) ? "Clear shown" : "Select all shown"}</button>` : "");
    $("scPlayers").innerHTML = shown.length ? shown.map(r => {
        const [label, tone] = STATUS[r.status];
        return `<div class="sc-prow${pl.picked.has(r.uid) ? " picked" : ""}">
            <label class="sc-tick"><input type="checkbox" data-pick="${esc(r.uid)}" ${pl.picked.has(r.uid) ? "checked" : ""} aria-label="Pick ${esc(r.name)}"><span></span></label>
            ${pl.mine.has(r.uid) ? `<a class="sc-pmain" href="client.html?uid=${encodeURIComponent(r.uid)}&tab=homework">` : `<div class="sc-pmain">`}<span class="ac-av">${esc(initials(r.name))}</span><div><b>${esc(r.name)}</b><small>${esc(r.kind)} · ${r.homework ? `${r.homework} homework` : "no homework yet"} · ${esc(ago(r.lastMs))}${pl.mine.has(r.uid) ? "" : " · not yet yours"}</small></div>${pl.mine.has(r.uid) ? "</a>" : "</div>"}
            <span class="sc-pill ${tone}">${label}</span>
            <button type="button" class="sb-btn ${r.status === "new" ? "sb-btn-primary" : "sb-btn-secondary"}" data-assign="${esc(r.uid)}">Assign</button>
            ${pl.mine.has(r.uid) ? `<a class="sb-btn sb-btn-tertiary" href="soccer-preview.html?uid=${encodeURIComponent(r.uid)}">View as player</a><button type="button" class="sb-btn sb-btn-tertiary" data-parent="${esc(r.uid)}">Share with parent</button>` : ""}</div>`;
    }).join("") : empty(pl.rows.length ? "Nobody matches." : "No soccer clients yet. A client with a soccer service shows up here.");
    const k = pl.picked.size;
    $("scPickBar").hidden = !k;
    $("scPickText").textContent = `${k} ${k === 1 ? "player" : "players"} picked`;
}

async function assignTo(uids) {
    const rows = uids.map(u => pl.rows.find(r => r.uid === u)).filter(Boolean);
    if (!rows.length) return;
    const input = await openSheet({ firstName: rows.length === 1 ? rows[0].name.split(" ")[0] : `${rows.length} players` });
    if (!input) return;
    // A player who isn't this coach's yet is added to their players first (homework needs the link).
    const linkResults = await Promise.allSettled(rows.filter(r => !pl.mine.has(r.uid)).map(r => assignClient(r.uid).then(() => pl.mine.add(r.uid))));
    const results = await Promise.allSettled(rows.map(r => pl.mine.has(r.uid) ? assignHomework(r.uid, input) : Promise.reject(new Error("not-linked"))));
    const ok = results.map((x, i) => x.status === "fulfilled" ? { r: rows[i], hw: x.value } : null).filter(Boolean);
    const failed = results.length - ok.length;
    for (const { hw } of ok) pl.homework.push(hw);
    pl.picked = new Set([...pl.picked].filter(u => !ok.some(o => o.r.uid === u)));
    pl.rows = playerRows({ links: pl.links, profiles: pl.profiles, homework: pl.homework, standingOf: h => standing(h, today) });
    renderPlayers();
    if (failed) toast(`Assigned to ${ok.length}. ${failed} didn't save, try those again.`, { type: "error" });
    else toast(ok.length === 1 ? `Assigned to ${ok[0].r.name.split(" ")[0]}` : `Assigned to ${ok.length} players`);
}

function wirePlayers() {
    $("scPlSearch").addEventListener("input", e => { pl.search = e.target.value; renderPlayers(); });
    $("scPlayersWrap").addEventListener("click", e => {
        if (e.target.closest("[data-mine]")) { pl.onlyMine = !pl.onlyMine; renderPlayers(); return; }
        const f = e.target.closest("[data-filter]");
        if (f) { pl.filter = f.dataset.filter; renderPlayers(); return; }
        if (e.target.closest("[data-all]")) {
            const shown = filterPlayers(pl.onlyMine ? pl.rows.filter(r => pl.mine.has(r.uid)) : pl.rows, pl.filter, pl.search);
            const all = shown.every(r => pl.picked.has(r.uid));
            shown.forEach(r => all ? pl.picked.delete(r.uid) : pl.picked.add(r.uid));
            renderPlayers(); return;
        }
        const par = e.target.closest("[data-parent]");
        if (par) {
            const row = pl.rows.find(r => r.uid === par.dataset.parent);
            if (row && pl.user) shareWithParent({ coachUid: pl.user.uid, coachName: pl.user.displayName || "", uid: row.uid, name: row.name, requests: pl.requests, homework: pl.homework });
            return;
        }
        const a = e.target.closest("[data-assign]");
        if (a) { assignTo([a.dataset.assign]); return; }
        if (e.target.closest("#scPickGo")) assignTo([...pl.picked]);
    });
    $("scPlayersWrap").addEventListener("change", e => {
        const c = e.target.closest("[data-pick]");
        if (!c) return;
        c.checked ? pl.picked.add(c.dataset.pick) : pl.picked.delete(c.dataset.pick);
        renderPlayers();
    });
}

async function loadPlayers(ownLinks, ownHomework) {
    let links = ownLinks, profiles = new Map(), homework = ownHomework;
    pl.mine = new Set(ownLinks.map(l => l.clientUid));
    try {
        // Every soccer player and every coach's homework; falls back to this coach's own if the rules don't allow it yet.
        const roster = await loadSoccerRoster(ownLinks);
        links = roster.links; profiles = roster.profiles;
        homework = await listAllSoccerHomework().catch(() => ownHomework);
    } catch (error) {
        console.warn("Southbound: all-players roster unavailable, showing your own.", error?.code || error);
        await Promise.all(ownLinks.map(async l => { try { const p = await getProfile(l.clientUid); if (p) profiles.set(l.clientUid, p); } catch { /* left out */ } }));
    }
    Object.assign(pl, { links, profiles, homework: [...homework] });
    pl.rows = playerRows({ links, profiles, homework, standingOf: h => standing(h, today) });
    wirePlayers();
    renderPlayers();
}

listenForAuth(async user => {
    if (!user) return;
    // Who may open this page is decided by PAGE_REQUIRES in js/navAccess.js (coach + sessions).
    try {
        const [requests, homework, links, plans] = await Promise.all([listRequestsForMyClients(), listHomeworkIAssigned(), listMyClients().catch(() => []), listMyPlans("coach").catch(() => [])]);
        pl.user = user; pl.requests = requests;
        planned = new Set(plans.map(p => `${p.key}|${p.date}`));
        const names = new Map(links.map(l => [l.clientUid, l.clientName]));
        for (const r of requests) if (r.clientUid && r.clientName && !names.has(r.clientUid)) names.set(r.clientUid, r.clientName);
        render({ requests, homework, names });
        loadPlayers(links, homework).catch(e => console.warn("Southbound: players unavailable.", e));
        $("scLoading").hidden = true;
        $("scBody").hidden = false;
    } catch (error) {
        console.warn("Southbound: couldn't load the Soccer page.", error);
        $("scLoading").hidden = true;
        $("scError").hidden = false;
        $("scError").innerHTML = `<p>${esc(friendlyError(error, "open the Soccer page"))}</p><button type="button" class="clients-btn-primary" onclick="location.reload()">Try again</button>`;
    }
});
