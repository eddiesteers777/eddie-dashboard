/* ==========================================
   Southbound — Homework (homework.html), the client's side

   What the coach assigned: a list, then one practice screen with the
   video (YouTube, trimmed to the coach's clip), the coach's note, and a
   small log (a count, how it felt). Data: js/homework.js; model:
   js/homeworkModel.js. A coach opening this page is sent to the hub.
========================================== */

import { listenForAuth } from "./auth.js";
import { listMyHomework, logPractice } from "./homework.js";
import { listMyCoaches } from "./coachAccess.js";
import { progress, sortForClient, streak, isoOf, embedUrl, watchUrl, thumbUrl, FEELS, cadenceText } from "./homeworkModel.js";
import { esc, thumbHtml, ticksHtml, metaLine, standingPill, dueText, clipText } from "./homeworkView.js";
import { cachedRole } from "./role.js";
import { icon } from "./icons.js";
import { toast, friendlyError, emptyHtml } from "./ui.js";

const $ = id => document.getElementById(id);
let items = [];
let openId = null;
let playing = false;
const today = () => isoOf(new Date());

function ringHtml(done, target) {
    const pct = target ? Math.min(1, done / target) : 0;
    const C = 2 * Math.PI * 38;
    return `<div class="hw-ring"><svg viewBox="0 0 92 92" aria-hidden="true"><circle class="hw-ring-bg" cx="46" cy="46" r="38"/><circle class="hw-ring-fg" cx="46" cy="46" r="38" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}"/></svg><b>${done}/${target}</b></div>`;
}

function renderSummary(list) {
    const t = today();
    const weekly = list.filter(h => h.cadence === "weekly" || h.cadence === "daily");
    const done = weekly.reduce((n, h) => n + Math.min(progress(h, t).done, progress(h, t).target), 0);
    const target = weekly.reduce((n, h) => n + progress(h, t).target, 0);
    const box = $("hwSummary");
    if (!target) { box.hidden = true; return; }
    const left = target - done;
    const run = streak(items, t);
    box.hidden = false;
    box.innerHTML = `${ringHtml(done, target)}<div><strong>${left > 0 ? `${left} ${left === 1 ? "practice" : "practices"} to go this week` : "All done this week"}</strong><span class="hw-sub">${run >= 2 ? `${run}-day streak. ` : ""}Your coach sees every practice you log.</span></div>`;
}

function cardHtml(hw) {
    const t = today();
    const p = progress(hw, t);
    return `<button type="button" class="hw-card" data-open="${esc(hw.id)}">
        ${thumbHtml(hw)}
        <span class="hw-card-body" style="display:block">
            <span class="hw-card-head"><span class="hw-kicker">${esc(metaLine(hw))}</span>${p.today ? `<span class="hw-pill sage">Done today</span>` : hw.dueDate ? `<span class="hw-pill">Due ${esc(dueText(hw.dueDate))}</span>` : ""}</span>
            <span class="hw-title" style="display:block">${esc(hw.title)}</span>
            ${ticksHtml(hw, t) || `<span class="hw-sub">${esc(p.label)}</span>`}
        </span></button>`;
}

function rowHtml(hw) {
    const t = today();
    const p = progress(hw, t);
    return `<button type="button" class="hw-row" data-open="${esc(hw.id)}">
        ${thumbHtml(hw, { small: true })}
        <span class="hw-row-main"><b>${esc(hw.title)}</b><span>${esc(cadenceText(hw))}${hw.dueDate ? ` · due ${esc(dueText(hw.dueDate))}` : ""}</span></span>
        <span class="hw-row-side">${p.kind === "goal" ? `<b>${p.done}</b><span class="hw-kicker">Best</span>` : `<b>${p.done}/${p.target}</b>${p.complete ? `<span class="hw-pill sage">Done</span>` : ""}`}</span></button>`;
}

function renderList() {
    $("hwDetail").hidden = true;
    $("hwList").hidden = false;
    const t = today();
    const active = sortForClient(items, t);
    const open = active.filter(h => !progress(h, t).complete);
    const finished = active.filter(h => progress(h, t).complete);
    document.querySelector(".hw-page .eos-today-hero").hidden = false;
    renderSummary(active);
    if (!active.length) {
        $("hwList").innerHTML = `<div class="clients-card">${emptyHtml({ iconName: "target", title: "No homework yet", text: "When your coach gives you something to practice, it shows up here with the video." })}</div>`;
        return;
    }
    const [first, ...rest] = open;
    $("hwList").innerHTML = `
        ${first ? `<div class="hw-section"><h2>Up next</h2><span class="hw-kicker">${first.dueDate ? `Due ${esc(dueText(first.dueDate))}` : ""}</span></div>${cardHtml(first)}` : ""}
        ${rest.length ? `<div class="hw-section"><h2>${first ? "Also" : "To do"}</h2><span class="hw-kicker">${rest.length}</span></div><div class="hw-rows">${rest.map(rowHtml).join("")}</div>` : ""}
        ${finished.length ? `<div class="hw-section"><h2>Done</h2><span class="hw-kicker">${finished.length}</span></div><div class="hw-rows">${finished.map(rowHtml).join("")}</div>` : ""}`;
    import("./icons.js").then(m => m.hydrate());
}

function playerHtml(hw) {
    if (!hw.videoId) return "";
    if (playing) return `<div class="hw-player"><iframe src="${esc(embedUrl(hw.videoId, hw.startSec, hw.endSec))}" title="${esc(hw.title)}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    return `<div class="hw-player"><button type="button" class="hw-thumb" data-play aria-label="Play the video"><img src="${esc(thumbUrl(hw.videoId))}" alt=""><span class="hw-play"><i></i></span></button></div>`;
}

let draft = { count: 0, feel: "okay" };

function renderDetail(id) {
    const hw = items.find(h => h.id === id);
    if (!hw) { openId = null; renderList(); return; }
    openId = id;
    const t = today();
    const p = progress(hw, t);
    document.querySelector(".hw-page .eos-today-hero").hidden = true;
    $("hwSummary").hidden = true;
    $("hwList").hidden = true;
    const box = $("hwDetail");
    box.hidden = false;
    const logs = [...hw.logs].sort((a, b) => (b.at || 0) - (a.at || 0));
    box.className = "hw-detail";
    box.innerHTML = `
        <button type="button" class="hw-back" data-back>${icon("chevronLeft")} Homework</button>
        ${playerHtml(hw)}
        <div class="hw-kicker tan">${esc(metaLine(hw))}</div>
        <h1 class="hw-title">${esc(hw.title)}</h1>
        ${ticksHtml(hw, t) || `<p class="hw-sub">${esc(p.label)}</p>`}
        ${hw.note ? `<div class="hw-coachnote"><small>From your coach</small>${esc(hw.note)}${clipText(hw) ? `<br><span class="hw-sub">Watch ${esc(clipText(hw))}.</span>` : ""}</div>` : ""}
        ${hw.diagram ? `<div class="hw-diagram" id="hwDiagram" hidden><span class="hw-kicker">Diagram</span></div>` : ""}
        ${hw.coachReply ? `<div class="hw-coachnote"><small>Coach replied</small>${esc(hw.coachReply)}</div>` : ""}
        ${hw.status === "archived" ? `<p class="hw-sub">Your coach closed this one.</p>` : `
        <div class="clients-card hw-log">
            <div class="hw-kicker" style="margin-bottom:6px">Log today's practice</div>
            <div class="hw-log-row"><span>${hw.cadence === "goal" ? "Your best in a row" : "How many (optional)"}</span>
                <span class="hw-step"><button type="button" data-step="-1" aria-label="One less">−</button><input id="hwCount" type="number" inputmode="numeric" min="0" max="100000" value="${draft.count || ""}" placeholder="0" aria-label="Count"><button type="button" data-step="1" aria-label="One more">+</button></span></div>
            <div class="hw-log-row"><span>How did it feel?</span>
                <span class="hw-chips" role="group" aria-label="How did it feel">${FEELS.map(f => `<button type="button" class="hw-chip${draft.feel === f.value ? " on" : ""}" data-feel="${f.value}" aria-pressed="${draft.feel === f.value}">${f.label}</button>`).join("")}</span></div>
        </div>
        <div class="hw-btn-row"><button type="button" class="sb-btn sb-btn-primary" id="hwDone">${p.today ? "Log another practice" : "Mark done for today"}</button>
        ${hw.videoId ? `<a class="sb-btn sb-btn-secondary" href="${esc(watchUrl(hw.videoId))}" target="_blank" rel="noopener">Open on YouTube</a>` : ""}</div>`}
        ${logs.length ? `<div class="hw-section"><h2>Your practices</h2><span class="hw-kicker">${logs.length}</span></div><div class="hw-history">${logs.slice(0, 12).map(l => `<div><span>${esc(dueText(l.date))}${l.feel ? ` · ${esc(l.feel)}` : ""}</span><span>${l.count != null ? esc(l.count) : ""}</span></div>`).join("")}</div>` : ""}`;
    if (hw.diagram) showDiagram(hw.diagram);
    window.scrollTo(0, 0);
}

document.addEventListener("click", async event => {
    const open = event.target.closest("[data-open]");
    if (open) { playing = false; draft = { count: 0, feel: "okay" }; history.replaceState(null, "", `#${open.dataset.open}`); renderDetail(open.dataset.open); return; }
    if (event.target.closest("[data-back]")) { history.replaceState(null, "", location.pathname); openId = null; renderList(); return; }
    if (event.target.closest("[data-play]")) { playing = true; renderDetail(openId); return; }
    const step = event.target.closest("[data-step]");
    if (step) { const input = $("hwCount"); draft.count = Math.max(0, (Number(input.value) || 0) + Number(step.dataset.step)); input.value = draft.count; return; }
    const feel = event.target.closest("[data-feel]");
    if (feel) { draft.feel = feel.dataset.feel; document.querySelectorAll("[data-feel]").forEach(b => { const on = b === feel; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }); return; }
    if (event.target.closest("#hwDone")) {
        const btn = $("hwDone");
        const hw = items.find(h => h.id === openId);
        if (!hw || btn.disabled) return;
        const raw = $("hwCount").value;
        btn.disabled = true;
        try {
            const { log, queued } = await logPractice(hw.id, { date: today(), count: raw === "" ? null : Number(raw), feel: draft.feel });
            hw.logs = [...hw.logs, log];
            toast(queued ? "Saved on this device. It sends when you're back online." : "Logged. Your coach sees it.");
            draft = { count: 0, feel: "okay" };
            playing = false;
            renderDetail(hw.id);
        } catch (error) {
            console.error(error);
            toast(friendlyError(error, "save that"), { type: "error" });
            btn.disabled = false;
        }
    }
});

let started = false;
listenForAuth(async user => {
    if (!user || started) return;
    started = true;
    if (cachedRole() === "coach") {
        $("hwLoading").hidden = true;
        $("hwList").innerHTML = `<div class="clients-card"><p class="clients-card-note">This is where your soccer clients practice. Assign homework from a client's page in <a href="clients.html">My Clients</a> (Homework tab).</p></div>`;
        return;
    }
    const [list, coaches] = await Promise.all([
        listMyHomework().catch(error => { console.warn("Southbound: homework unavailable.", error); return []; }),
        listMyCoaches().catch(() => [])
    ]);
    items = list;
    $("hwLoading").hidden = true;
    if (!coaches.length && !items.length) {
        $("hwList").innerHTML = `<div class="clients-card">${emptyHtml({ iconName: "link", title: "Not connected to a coach yet", text: "Connect with your coach and the skills they give you to practice show up here.", actionHref: "clients.html?tab=share", actionLabel: "Connect with Coach" })}</div>`;
        return;
    }
    const wanted = location.hash.slice(1);
    if (wanted && items.some(h => h.id === wanted)) renderDetail(wanted); else renderList();
});

// The coach's drill picture (a name-free Playbook board kept as a short token on the homework).
async function showDiagram(token) {
    try {
        const [{ diagramBoard }, { boardThumb }] = await Promise.all([import("./playbook/drillHomework.js"), import("./playbook/boardThumb.js")]);
        const board = await diagramBoard(token), box = document.getElementById("hwDiagram");
        if (board && box) { box.append(boardThumb(board)); box.hidden = false; }
    } catch { /* no picture: the note still has the steps */ }
}
