/* ==========================================
   Southbound — Preview as client (soccer-preview.html)

   The coach sees a soccer client's Soccer page the way the player does:
   the week strip, the next session, the homework and the progress card.
   Read-only: nothing here writes. It reads what a coach may already read
   (the coach's own booking requests and homework for this client), so no
   rules change. The player's page is the Book tab on schedule.html; this
   is a second drawing of the same data, so change both together.
========================================== */

import { listenForAuth } from "./auth.js";
import { getProfile } from "./userProfile.js";
import { listRequestsForMyClients } from "./scheduling.js";
import { listHomeworkForClient } from "./homework.js";
import { clientSessions, latestSessionNotes } from "./sessionModel.js";
import { progress as hwProgress, sortForClient } from "./homeworkModel.js";
import { clientWeek, clientWeekLine } from "./soccerWeek.js";
import { weekStartOf, addDays } from "./scheduleWeek.js";
import { soccerProgress } from "./soccerProgress.js";
import { esc } from "./homeworkView.js";
import { cachedRole } from "./role.js";
import { friendlyError } from "./ui.js";
import { listPlansForClient, listVersions } from "./coachingPlans.js";
import { planWeekFor, dayText } from "./coachingPlanModel.js";
import { celebrateHomework } from "./homeworkMoment.js";

const $ = id => document.getElementById(id);
const today = new Date().toLocaleDateString("en-CA");
const uid = new URLSearchParams(location.search).get("uid") || "";
const dateShort = d => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const time = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
const typeText = t => ({ soccer: "Soccer", running: "Running", strength: "Strength" }[t] || "Session");

const state = { tab: "today", requests: [], homework: [], start: weekStartOf(today), picked: today, name: "this client" };

function renderWeek() {
    const days = clientWeek({ requests: state.requests, homework: state.homework, anyDay: state.start, today });
    if (!days.some(d => d.date === state.picked)) state.picked = days[0].date;
    const picked = days.find(d => d.date === state.picked);
    const end = addDays(state.start, 6);
    const strip = days.map(d => {
        const name = new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
        const dots = `${d.sessions.length ? `<i class="d-session"></i>` : ""}${d.homework.some(h => !h.done) ? `<i class="d-hw"></i>` : ""}${d.homework.length && d.homework.every(h => h.done) ? `<i class="d-done"></i>` : ""}`;
        return `<button type="button" class="sb-wday${d.date === today ? " is-today" : ""}${d.date === state.picked ? " is-picked" : ""}${d.date < today ? " is-past" : ""}" data-day="${d.date}" aria-pressed="${d.date === state.picked}"><small>${esc(name)}</small><b>${Number(d.date.slice(8))}</b><span class="sb-wdots">${dots}</span></button>`;
    }).join("");
    const sessions = picked.sessions.map(s => `<div class="sb-wrow"><span class="sb-wkind session">Session</span><div><b>${esc(time(s.startTime))}${s.endTime ? `–${esc(time(s.endTime))}` : ""}</b><small>${esc(typeText(s.sessionType))}${s.label ? ` · ${esc(s.label)}` : ""}</small></div></div>`).join("");
    const work = picked.homework.map(h => `<div class="sb-wrow"><span class="sb-wkind ${h.done ? "done" : "hw"}">${h.done ? "Done" : "Homework"}</span><div><b>${esc(h.title)}</b><small>${h.done ? "Logged" : h.due ? "Due today" : "Practice today"}</small></div></div>`).join("");
    $("spWeek").innerHTML = `
        <div class="sb-sec-row"><h2 class="clients-section-title" id="sbWeekTitle">Your week</h2><span class="sb-kick">${esc(dateShort(state.start))} – ${esc(dateShort(end))}</span></div>
        <div class="sb-wnav"><button type="button" class="clients-btn-secondary" data-wstep="-1" aria-label="Previous week">‹</button><span>${esc(clientWeekLine(days, today) || "Nothing planned yet")}</span><button type="button" class="clients-btn-secondary" data-wstep="1" aria-label="Next week">›</button></div>
        <div class="sb-wstrip">${strip}</div>
        <div class="sb-wdetail"><span class="sb-kick tan">${esc(dateShort(picked.date))}</span>${sessions}${work}${!sessions && !work ? `<p class="sb-wnone">Nothing on this day.</p>` : ""}</div>
        <p class="sb-wkey"><span class="d-session"></span>Session<span class="d-hw"></span>Homework<span class="d-done"></span>Done</p>`;
}

function renderRest() {
    const { upcoming } = clientSessions(state.requests, today);
    const next = upcoming[0];
    $("spNext").hidden = !next;
    if (next) {
        $("spNext").innerHTML = `<div class="sb-next-top"><span class="sb-kick tan">Next session · ${esc(next.date === today ? "Today" : dateShort(next.date))}</span><span class="sb-chip">Booked</span></div>
            <div class="sb-next-when"><b>${esc(time(next.startTime))}</b><span>${esc(dateShort(next.date))} · ${esc(typeText(next.sessionType))}${next.label ? ` · ${esc(next.label)}` : ""}</span></div>`;
    }
    const open = sortForClient(state.homework, today).filter(h => !hwProgress(h, today).complete);
    $("spHw").innerHTML = `<div class="sb-sec-row"><h2 class="clients-section-title">Homework</h2></div>` + (open.length
        ? open.map(h => { const p = hwProgress(h, today); return `<div class="sb-wrow"><div style="flex:1"><b>${esc(h.title)}</b><small>${esc(p.label)}${h.dueDate && h.dueDate >= today ? ` · due ${esc(dateShort(h.dueDate))}` : ""}</small></div></div>`; }).join("")
        : `<div class="clients-card"><p class="sb-wnone">No homework yet. When you give ${esc(state.name)} something to practice, it shows here.</p></div>`);
    const p = soccerProgress(state.requests, state.homework, today);
    const note = latestSessionNotes(state.requests, today);
    $("spProgress").hidden = !p.show;
    if (p.show) {
        $("spProgress").innerHTML = `<div class="sb-sec-row"><h2 class="clients-section-title">Your progress</h2></div><div class="sb-progress-card"><div class="sb-progress-stats"><div><b>${p.sessions}</b><span>Sessions done</span></div><div><b>${p.practices}</b><span>Practices, last 30 days</span></div></div>${p.last ? `<div class="sb-progress-last"><span class="sb-kick">Last time · ${esc(dateShort(p.last.date))}</span><p>${p.last.workedOn ? `Worked on: ${esc(p.last.workedOn)}` : ""}${p.last.nextTime ? `<br>Next time: ${esc(p.last.nextTime)}` : ""}</p></div>` : note ? `<div class="sb-progress-last"><span class="sb-kick">Last time · ${esc(dateShort(note.date))}</span><p>${esc(note.text)}</p></div>` : ""}</div>`;
    }
}

function renderGreet() {
    const { upcoming } = clientSessions(state.requests, today);
    const open = state.homework.filter(h => h.status !== "archived" && !hwProgress(h, today).complete).length;
    $("spGreet").innerHTML = `<div class="sb-sec-row"><h2 class="clients-section-title">Hi, ${esc(state.name)}</h2></div><div class="clients-card"><p class="sb-wnone">${upcoming.length ? `Next session ${esc(upcoming[0].date === today ? "today" : dateShort(upcoming[0].date))}. ` : "No session booked. "}${open ? `${open} homework to practice.` : "Homework is all caught up."}</p></div>`;
}

// Every homework the player has, done or not. "Play the finish" shows the celebration they get
// after a practice. Nothing is saved: the homework is copied with one extra practice in memory.
function renderHomeworkTab() {
    const items = sortForClient(state.homework.filter(h => h.status !== "archived"), today);
    $("spHwAll").innerHTML = `<div class="sb-sec-row"><h2 class="clients-section-title">Homework</h2></div>` + (items.length
        ? items.map(h => { const p = hwProgress(h, today); return `<div class="sb-wrow"><div style="flex:1"><b>${esc(h.title)}</b><small>${esc(p.label)}${h.dueDate ? ` · due ${esc(dateShort(h.dueDate))}` : ""}</small></div><button type="button" class="clients-btn-secondary" data-finish="${esc(h.id)}">Play the finish</button></div>`; }).join("")
        : `<div class="clients-card"><p class="sb-wnone">No homework yet. When you give ${esc(state.name)} something to practice, it shows here.</p></div>`);
}

// The coached running plan as the player's copy shows it (the newest published version).
function renderPlanTab() {
    const plan = state.plan;
    $("spTabPlan").hidden = !plan;
    if (!plan) return;
    const { week, state: where } = planWeekFor(plan.plan, today);
    const weeks = plan.plan?.weeks || [];
    const next = week ? weeks[weeks.indexOf(week) + 1] : null;
    const block = (title, w) => w ? `<div class="sb-sec-row"><h3 class="clients-section-title">${esc(title)}</h3><span class="sb-kick">${w.plannedMiles ? `${esc(String(w.plannedMiles))} mi` : ""}</span></div>${(w.days || []).map(d => `<div class="sb-wrow"><span class="sb-wkind ${d.date === today ? "hw" : "session"}">${esc(d.day || "")}</span><div><b>${esc(dayText(d))}</b><small>${esc(d.date ? dateShort(d.date) : "")}</small></div></div>`).join("")}` : "";
    $("spPlan").innerHTML = `<div class="sb-sec-row"><h2 class="clients-section-title">${esc(plan.name || "Plan")}</h2><span class="sb-kick">Version ${esc(String(plan.version || 1))}</span></div>`
        + (week ? block(where === "current" ? "This week" : where === "upcoming" ? "First week" : "Last week", week) + block("Next week", next) : `<div class="clients-card"><p class="sb-wnone">Nothing in this plan yet.</p></div>`)
        + `<p class="sb-wnone">For the whole plan or to change it, open the <a href="client.html?uid=${encodeURIComponent(uid)}&tab=plan">Client Hub plan</a>.</p>`;
}

function showTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".sp-tabs [data-tab]").forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    ["today", "week", "homework", "plan"].forEach(t => { $("spPane" + t[0].toUpperCase() + t.slice(1)).hidden = t !== tab; });
}
document.querySelector(".sp-tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
$("spHwAll").addEventListener("click", e => {
    const b = e.target.closest("[data-finish]");
    const hw = b && state.homework.find(h => h.id === b.dataset.finish);
    if (!hw) return;
    const was = hwProgress(hw, today).complete;
    const preview = { ...hw, logs: [...(hw.logs || []), { date: today, count: 1, feel: "okay" }] };
    celebrateHomework({ hw: preview, wasComplete: was, today, streak: 1, firstName: state.name === "this client" ? "" : state.name });
});

$("spWeek").addEventListener("click", event => {
    const step = event.target.closest("[data-wstep]");
    if (step) { state.start = addDays(state.start, 7 * Number(step.dataset.wstep)); state.picked = ""; renderWeek(); return; }
    const day = event.target.closest("[data-day]");
    if (day) { state.picked = day.dataset.day; renderWeek(); }
});

function missing(text) {
    $("spLoading").hidden = true;
    $("spMissing").hidden = false;
    $("spMissing").innerHTML = `<p>${esc(text)}</p><a class="clients-btn-primary" href="clients.html">Back to clients</a>`;
}

listenForAuth(async user => {
    if (!user) return;
    if (cachedRole() !== "coach") { location.replace("index.html"); return; }
    if (!uid) { missing("Pick a client first."); return; }
    try {
        const planPromise = listPlansForClient(uid).then(async list => {
            const active = list.filter(p => p.status === "active").sort((a, b) => (b.version || 0) - (a.version || 0))[0];
            if (!active) return null;
            const versions = await listVersions(active.id);
            const latest = versions.find(v => v.plan) || null;
            return latest ? { ...active, plan: latest.plan } : null;
        }).catch(() => null);
        const [profile, requests, homework] = await Promise.all([
            getProfile(uid).catch(() => null),
            listRequestsForMyClients(),
            listHomeworkForClient(uid)
        ]);
        state.name = profile?.displayName?.split(" ")[0] || "this client";
        state.requests = requests.filter(r => r.clientUid === uid);
        state.homework = homework;
        state.plan = await planPromise;
        $("spBanner").hidden = false;
        $("spBanner").innerHTML = `<span><b>Viewing as ${esc(profile?.displayName || "client")}.</b> This is what they see (play the finish on the Homework tab). Read-only: nothing here is saved.</span><a class="clients-btn-secondary" href="client.html?uid=${encodeURIComponent(uid)}">Exit preview</a>`;
        renderWeek();
        renderRest();
        renderGreet();
        renderPlanTab();
        renderHomeworkTab();
        $("spLoading").hidden = true;
        $("spBody").hidden = false;
    } catch (error) {
        console.warn("Southbound: couldn't load the preview.", error);
        missing(friendlyError(error, "open this preview"));
    }
});
