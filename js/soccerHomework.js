/* ==========================================
   Southbound — the coach's Homework page (soccer-homework.html)

   Overview (to review, needs a nudge, this week by group, streaks),
   Players (progress per player), Library (homework already assigned,
   one tap to assign again). Assigning reuses the Client Hub sheet and
   assignHomework, once per player. Pure logic: js/homeworkOverview.js.
========================================== */

import { listenForAuth } from "./auth.js";
import { listMyClients } from "./coachAccess.js";
import { getProfile } from "./userProfile.js";
import { listHomeworkIAssigned, assignHomework, markReviewed, replyToHomework } from "./homework.js";
import { standing, progress, streak, isoOf, addDays } from "./homeworkModel.js";
import { playerRows } from "./soccerCoachModel.js";
import { overview, playerProgress, library, librarySkills, filterLibrary, prefillFrom } from "./homeworkOverview.js";
import { openSheet } from "./homeworkCoach.js";
import { esc, dueText } from "./homeworkView.js";
import { toast, friendlyError, sbPrompt } from "./ui.js";

const $ = id => document.getElementById(id);
const today = isoOf(new Date());
const first = n => String(n || "Player").split(/\s+/)[0];
const initials = n => String(n || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const empty = t => `<div class="sc-empty">${esc(t)}</div>`;
const ago = ms => { if (!ms) return "no practice yet"; const d = Math.floor((Date.now() - ms) / 864e5); return d <= 0 ? "practiced today" : d === 1 ? "practiced yesterday" : `practiced ${d} days ago`; };

const st = { tab: "overview", homework: [], rows: [], links: [], profiles: new Map(), skill: "all", search: "" };
const standingOf = h => standing(h, today);
const progressOf = h => progress(h, today);
const rebuildRows = () => { st.rows = playerRows({ links: st.links, profiles: st.profiles, homework: st.homework, standingOf }); };

const bar = pct => `<div class="hwp-bar" role="img" aria-label="${pct ?? 0}% of this week's practices done"><i style="width:${pct ?? 0}%"></i></div>`;

function renderOverview() {
    const o = overview({ homework: st.homework, rows: st.rows, standingOf, progressOf });
    const players = playerProgress({ rows: st.rows, homework: st.homework, standingOf, progressOf, streakOf: list => streak(list, today) });
    $("hwLead").textContent = `${o.players} ${o.players === 1 ? "player" : "players"} · ${o.active} active`;
    const g = o.groups;
    const streaks = players.filter(p => p.streak >= 3).sort((a, b) => b.streak - a.streak).slice(0, 5);
    $("paneOverview").innerHTML = `
        <div class="sc-counts">
            <div><b>${o.toReview.length}</b><span>To review</span></div>
            <div><b>${o.behind.length}</b><span>Behind</span></div>
            <div><b>${o.pct == null ? "—" : `${o.pct}%`}</b><span>Done this week</span></div>
        </div>
        <section class="sc-block"><div class="sb-sec-row"><h2 class="clients-section-title">To review</h2></div>
            <div class="sc-list">${o.toReview.length ? o.toReview.slice(0, 10).map(({ hw, fresh }) => {
                const name = st.rows.find(r => r.uid === hw.clientUid)?.name || "Player";
                const last = [...hw.logs].sort((a, b) => (b.at || 0) - (a.at || 0))[0];
                return `<div class="hwp-card" data-hw="${esc(hw.id)}"><div class="hwp-top"><span class="ac-av">${esc(initials(name))}</span>
                    <div class="hwp-main"><b>${esc(name)} · ${esc(hw.title)}</b><small>${fresh} new ${fresh === 1 ? "practice" : "practices"}${last?.feel ? ` · felt ${esc(last.feel)}` : ""}${last?.count != null ? ` · ${esc(last.count)}` : ""}</small></div></div>
                    <div class="hwp-acts"><button type="button" class="sb-btn sb-btn-secondary" data-seen>Looks good</button><button type="button" class="sb-btn sb-btn-secondary" data-reply>Reply</button><a class="sb-btn sb-btn-tertiary" href="client.html?uid=${encodeURIComponent(hw.clientUid)}&tab=homework">Open</a></div></div>`;
            }).join("") : empty("Nothing waiting. New practices show up here.")}</div></section>
        <section class="sc-block"><div class="sb-sec-row"><h2 class="clients-section-title">Needs a nudge</h2></div>
            <div class="sc-list">${o.behind.length || o.noHomework.length ? [
                ...o.behind.slice(0, 8).map(({ hw, name, p }) => `<a class="sc-row" href="client.html?uid=${encodeURIComponent(hw.clientUid)}&tab=homework"><div><b>${esc(name)}</b><small>${esc(hw.title)} · ${esc(p.label || "")}${hw.dueDate ? ` · due ${esc(dueText(hw.dueDate))}` : ""}</small></div><span class="sc-pill clay">Behind</span></a>`),
                ...o.noHomework.slice(0, 8).map(r => `<div class="sc-row"><div><b>${esc(r.name)}</b><small>No homework assigned</small></div><button type="button" class="sb-btn sb-btn-primary" data-assign="${esc(r.uid)}">Assign</button></div>`)
            ].join("") : empty("Everyone is on track.")}</div></section>
        <section class="sc-block"><div class="sb-sec-row"><h2 class="clients-section-title">This week by group</h2></div>
            <div class="hwp-card">${[["Group", g.group], ["1-on-1", g.one]].map(([label, x]) => `<div class="hwp-grp"><div class="hwp-grp-top"><b>${label}</b><span>${x.target ? `${x.done} of ${x.target}` : "nothing assigned"}</span></div>${bar(x.target ? Math.round(100 * x.done / x.target) : 0)}</div>`).join("")}</div></section>
        ${streaks.length ? `<section class="sc-block"><div class="sb-sec-row"><h2 class="clients-section-title">Streaks</h2></div><div class="sc-list">${streaks.map(p => `<div class="sc-row"><div><b>${esc(p.name)}</b></div><span class="sc-pill sage">${p.streak} days</span></div>`).join("")}</div></section>` : ""}`;
}

function renderPlayers() {
    const players = playerProgress({ rows: st.rows, homework: st.homework, standingOf, progressOf, streakOf: list => streak(list, today) });
    const tone = { review: ["Review", "ice"], new: ["New", "ice"], behind: ["Behind", "clay"], ok: ["On track", "sage"] };
    $("panePlayers").innerHTML = players.length ? `<div class="sc-list">${players.map(p => {
        const [label, t] = tone[p.standing] || tone.ok;
        return `<div class="hwp-card"><div class="hwp-top"><a class="hwp-who" href="client.html?uid=${encodeURIComponent(p.uid)}&tab=homework"><span class="ac-av">${esc(initials(p.name))}</span>
            <div class="hwp-main"><b>${esc(p.name)}</b><small>${esc(p.kind)} · ${p.list.length} active${p.streak ? ` · ${p.streak} day streak` : ""} · ${esc(ago(p.lastMs))}</small></div></a><span class="sc-pill ${t}">${label}</span></div>
            ${p.target ? bar(p.pct) : ""}<div class="hwp-acts"><button type="button" class="sb-btn ${p.list.length ? "sb-btn-secondary" : "sb-btn-primary"}" data-assign="${esc(p.uid)}">Assign</button></div></div>`;
    }).join("")}</div>` : empty("No soccer clients yet. A client with a soccer service shows up here.");
}

function renderLibrary() {
    const all = library(st.homework);
    const items = filterLibrary(all, st.skill, st.search);
    const skills = librarySkills(all);
    $("paneLibrary").innerHTML = all.length ? `
        <input type="search" class="sc-search" id="libSearch" placeholder="Search your homework" aria-label="Search your homework" value="${esc(st.search)}" autocomplete="off">
        <div class="sc-chips">${["all", ...skills].map(s => `<button type="button" class="sc-chip${st.skill === s ? " on" : ""}" data-skill="${esc(s)}" aria-pressed="${st.skill === s}">${s === "all" ? "All" : esc(s)}</button>`).join("")}</div>
        <div class="sc-list">${items.length ? items.map(i => `<div class="hwp-card"><div class="hwp-top"><div class="hwp-main"><b>${esc(i.title)}</b><small>${esc([i.skill, i.cadence === "daily" ? "Daily" : i.cadence === "weekly" ? `${i.timesPerWeek}× a week` : i.cadence === "goal" ? `Goal ${i.goal || ""}` : "Once", i.minutes && `${i.minutes} min`, i.videoId && "video", i.diagram && "diagram"].filter(Boolean).join(" · "))} · assigned ${i.count} ${i.count === 1 ? "time" : "times"}</small></div>
            <button type="button" class="sb-btn sb-btn-secondary" data-lib="${esc(i.key)}">Assign</button></div></div>`).join("") : empty("Nothing matches.")}</div>`
        : empty("Homework you assign shows up here, so you can send it again in one tap.");
}

const RENDER = { overview: renderOverview, players: renderPlayers, library: renderLibrary };
function show(tab) {
    st.tab = tab;
    for (const t of ["overview", "players", "library"]) $(`pane${t[0].toUpperCase()}${t.slice(1)}`).hidden = t !== tab;
    document.querySelectorAll(".ss-tab[data-tab]").forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    RENDER[tab]();
    history.replaceState(null, "", `${location.pathname}${tab === "overview" ? "" : `?tab=${tab}`}`);
}
const refresh = () => { rebuildRows(); RENDER[st.tab](); };

// Pick who gets it (everyone ticked), then the assign sheet.
function pickPlayers(preticked = []) {
    return new Promise(resolve => {
        const picked = new Set(preticked);
        const dialog = document.createElement("dialog");
        dialog.className = "sb-dialog ss-pick";
        const draw = () => {
            dialog.querySelector(".ss-pick-list").innerHTML = st.rows.map(r => `<label class="sc-row hwp-pick"><input type="checkbox" data-u="${esc(r.uid)}" ${picked.has(r.uid) ? "checked" : ""}><div><b>${esc(r.name)}</b><small>${esc(r.kind)}</small></div></label>`).join("") || empty("No soccer clients yet.");
            dialog.querySelector("[data-go]").textContent = picked.size ? `Next · ${picked.size} picked` : "Pick players";
            dialog.querySelector("[data-go]").disabled = !picked.size;
        };
        dialog.innerHTML = `<form class="sb-dialog-form" method="dialog" novalidate><h2 class="sb-dialog-title" style="font-size:24px">Who is it for?</h2>
            <div class="sc-chips"><button type="button" class="sc-chip" data-set="all">Everyone</button><button type="button" class="sc-chip" data-set="group">Group</button><button type="button" class="sc-chip" data-set="one">1-on-1</button><button type="button" class="sc-chip" data-set="none">Clear</button></div>
            <div class="ss-pick-list"></div>
            <div class="sb-dialog-actions"><button type="button" class="sb-btn sb-btn-tertiary" data-cancel>Cancel</button><button type="button" class="sb-btn sb-btn-primary" data-go disabled>Pick players</button></div></form>`;
        let result = [];
        dialog.addEventListener("change", e => { const u = e.target.dataset.u; if (u) { e.target.checked ? picked.add(u) : picked.delete(u); draw(); } });
        dialog.addEventListener("click", e => {
            const s = e.target.closest("[data-set]");
            if (s) { picked.clear(); st.rows.filter(r => s.dataset.set === "all" || (s.dataset.set === "group" && r.group) || (s.dataset.set === "one" && r.one)).forEach(r => picked.add(r.uid)); draw(); }
            if (e.target.closest("[data-go]")) { result = [...picked]; dialog.close(); }
            if (e.target.closest("[data-cancel]")) dialog.close();
        });
        dialog.addEventListener("close", () => { dialog.remove(); resolve(result); });
        document.body.append(dialog); draw(); dialog.showModal();
    });
}

async function assignTo(uids, prefill = null) {
    const rows = uids.map(u => st.rows.find(r => r.uid === u)).filter(Boolean);
    if (!rows.length) return;
    const input = await openSheet({ firstName: rows.length === 1 ? first(rows[0].name) : `${rows.length} players`, prefill: prefill ? { ...prefill, dueDate: addDays(today, 7) } : null });
    if (!input) return;
    const results = await Promise.allSettled(rows.map(r => assignHomework(r.uid, input)));
    const ok = results.filter(r => r.status === "fulfilled");
    st.homework.push(...ok.map(r => r.value));
    refresh();
    if (ok.length < results.length) toast(`Assigned to ${ok.length}. ${results.length - ok.length} didn't save, try those again.`, { type: "error" });
    else toast(rows.length === 1 ? `Assigned to ${first(rows[0].name)}` : `Assigned to ${rows.length} players`);
}

function wire() {
    document.querySelectorAll(".ss-tab[data-tab]").forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));
    $("hwNew").addEventListener("click", async () => { const u = await pickPlayers(); if (u.length) assignTo(u); });
    $("hwBody").addEventListener("click", async e => {
        const a = e.target.closest("[data-assign]");
        if (a) { assignTo([a.dataset.assign]); return; }
        const lib = e.target.closest("[data-lib]");
        if (lib) { const item = library(st.homework).find(i => i.key === lib.dataset.lib); if (!item) return; const u = await pickPlayers(); if (u.length) assignTo(u, prefillFrom(item)); return; }
        const sk = e.target.closest("[data-skill]");
        if (sk) { st.skill = sk.dataset.skill; renderLibrary(); return; }
        const card = e.target.closest("[data-hw]");
        const hw = card && st.homework.find(h => h.id === card.dataset.hw);
        if (!hw) return;
        try {
            if (e.target.closest("[data-seen]")) { hw.reviewedMs = await markReviewed(hw.id); refresh(); toast("Marked as seen"); }
            else if (e.target.closest("[data-reply]")) {
                const name = st.rows.find(r => r.uid === hw.clientUid)?.name || "them";
                const text = await sbPrompt(`A line ${first(name)} sees on this homework.`, { title: "Reply", defaultValue: hw.coachReply || "", multiline: true, maxLength: 300, confirmLabel: "Send" });
                if (text == null) return;
                hw.coachReply = await replyToHomework(hw.id, text); hw.reviewedMs = Date.now(); refresh(); toast("Reply saved");
            }
        } catch (error) { console.error(error); toast(friendlyError(error, "save that"), { type: "error" }); }
    });
    $("hwBody").addEventListener("input", e => { if (e.target.id === "libSearch") { st.search = e.target.value; const pos = e.target.selectionStart; renderLibrary(); const el = $("libSearch"); el.focus(); el.setSelectionRange(pos, pos); } });
}

listenForAuth(async user => {
    if (!user) return;
    try {
        const [homework, links] = await Promise.all([listHomeworkIAssigned(), listMyClients().catch(() => [])]);
        await Promise.all(links.map(async l => { try { const p = await getProfile(l.clientUid); if (p) st.profiles.set(l.clientUid, p); } catch { /* left out: type unknown */ } }));
        Object.assign(st, { homework, links });
        rebuildRows();
        wire();
        const tab = new URLSearchParams(location.search).get("tab");
        show(["players", "library"].includes(tab) ? tab : "overview");
        $("hwLoading").hidden = true;
        $("hwBody").hidden = false;
    } catch (error) {
        console.warn("Southbound: couldn't load Homework.", error);
        $("hwLoading").hidden = true;
        $("hwError").hidden = false;
        $("hwError").innerHTML = `<p>${esc(friendlyError(error, "open Homework"))}</p><button type="button" class="clients-btn-primary" onclick="location.reload()">Try again</button>`;
    }
});
