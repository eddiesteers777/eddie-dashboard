/* ==========================================
   Southbound — one soccer session (soccer-session.html?key=&date=)

   The coach plans a booked session in parts: a drill, minutes and a
   private note each. Start from the last plan for this open time, a
   Playbook practice, or blank. Players see the focus, drill names and
   times (sessionPlans); the notes are coach only (sessionPlanNotes).
   Pure logic: js/sessionBuild.js. Wrap up comes next (step 2).
========================================== */

import { listenForAuth } from "./auth.js";
import { listRequestsForMyClients } from "./scheduling.js";
import { sessionList } from "./sessionModel.js";
import { listMyPlans, savePlan, deletePlan, getPlanNotes, savePlanNotes } from "./sessionPlans.js";
import { linesFromPractice } from "./sessionPlanModel.js";
import {
    PART_KINDS, MAX_NOTE, linesFromParts, notesFromParts, partsFromLines, totalMins, sessionMinutes,
    blankParts, lastPlanFor, sessionGroups, findGroup, cleanParts
} from "./sessionBuild.js";
import { esc } from "./homeworkView.js";
import { icon } from "./icons.js";
import { toast, friendlyError, sbConfirm } from "./ui.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const KEY = params.get("key") || "", DATE = params.get("date") || "";
const MAX_PARTS = 12;
const dateLong = d => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const time = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };

const st = { group: null, plans: [], existing: null, parts: [], playbook: null, dirty: false };

const hasContent = () => st.parts.some(p => p.name || p.note);

function partHtml(p, i) {
    return `<section class="ss-part" data-i="${i}" data-kind="${esc(p.kind)}">
        <div class="ss-part-top">
            <select class="ss-kind" data-f="kind" aria-label="Part ${i + 1} type">${PART_KINDS.map(k => `<option${k === p.kind ? " selected" : ""}>${esc(k)}</option>`).join("")}</select>
            <label class="ss-mins"><input type="number" inputmode="numeric" min="0" max="180" data-f="mins" value="${p.mins || ""}" placeholder="0" aria-label="Part ${i + 1} minutes"><span>min</span></label>
        </div>
        <input class="sb-dialog-input" data-f="name" maxlength="60" value="${esc(p.name)}" placeholder="Drill or activity" aria-label="Part ${i + 1} drill" autocomplete="off">
        <textarea class="sb-dialog-input ss-note" data-f="note" maxlength="${MAX_NOTE}" rows="2" placeholder="Coach note for this part (only you see it)" aria-label="Part ${i + 1} coach note">${esc(p.note)}</textarea>
        <div class="ss-part-acts">
            <button type="button" class="sb-btn sb-btn-icon" data-up aria-label="Move part ${i + 1} up" ${i === 0 ? "disabled" : ""}>${icon("arrowUp")}</button>
            <button type="button" class="sb-btn sb-btn-icon" data-down aria-label="Move part ${i + 1} down" ${i === st.parts.length - 1 ? "disabled" : ""}>${icon("arrowDown")}</button>
            <button type="button" class="sb-btn sb-btn-icon" data-del aria-label="Remove part ${i + 1}">${icon("trash")}</button>
        </div>
    </section>`;
}

function renderParts() {
    $("ssParts").innerHTML = st.parts.map(partHtml).join("");
    $("ssAdd").disabled = $("ssDrills").disabled = st.parts.length >= MAX_PARTS;
    renderTotal();
}

function renderTotal() {
    const planned = totalMins(st.parts);
    const length = sessionMinutes(st.group.startTime, st.group.endTime);
    const named = cleanParts(st.parts).length;
    $("ssTotal").textContent = !named ? "Name a part to start the plan."
        : length ? `${planned} of ${length} minutes planned${planned > length ? ". That is over the session length." : ""}`
        : `${planned} minutes planned`;
    $("ssTotal").classList.toggle("over", Boolean(length && planned > length));
}

function renderFrom() {
    const last = lastPlanFor(st.plans, KEY, DATE);
    $("ssFrom").innerHTML = [
        last ? `<button type="button" class="sc-chip" data-from="last">Last plan (${esc(dateLong(last.date))})</button>` : "",
        `<button type="button" class="sc-chip" data-from="playbook">Playbook practice</button>`,
        `<button type="button" class="sc-chip" data-from="blank">Blank</button>`
    ].join("");
}

async function replaceParts(parts, focus = null, bring = null) {
    if (hasContent() && !await sbConfirm("Replace what is here with this?", { confirmLabel: "Replace" })) return;
    st.parts = parts.length ? parts : blankParts();
    if (focus != null) $("ssFocus").value = focus;
    if (bring != null) $("ssBring").value = bring;
    st.dirty = true;
    renderParts();
}

async function playbook() {
    if (!st.playbook) st.playbook = (await import("./sessionPlanCoach.js")).loadPlaybook();
    return st.playbook;
}

// A small pick list in a dialog. Resolves to the picked item or null.
function pickFrom(title, items, emptyText) {
    return new Promise(resolve => {
        const dialog = document.createElement("dialog");
        dialog.className = "sb-dialog ss-pick";
        dialog.innerHTML = `<form class="sb-dialog-form" method="dialog" novalidate>
            <h2 class="sb-dialog-title" style="font-size:24px">${esc(title)}</h2>
            <input type="search" class="sb-dialog-input" placeholder="Search" aria-label="Search" autocomplete="off">
            <div class="ss-pick-list"></div>
            <div class="sb-dialog-actions"><button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button></div></form>`;
        const list = dialog.querySelector(".ss-pick-list");
        const draw = q => {
            const shown = items.filter(it => !q || it.label.toLowerCase().includes(q)).slice(0, 60);
            list.innerHTML = shown.length ? shown.map(it => `<button type="button" class="sc-row ss-pick-row" data-id="${esc(it.id)}"><div><b>${esc(it.label)}</b><small>${esc(it.sub || "")}</small></div></button>`).join("") : `<div class="sc-empty">${esc(items.length ? "Nothing matches." : emptyText)}</div>`;
        };
        draw("");
        dialog.querySelector("input").addEventListener("input", e => draw(e.target.value.trim().toLowerCase()));
        let picked = null;
        dialog.addEventListener("click", e => {
            const row = e.target.closest("[data-id]");
            if (row) { picked = items.find(it => it.id === row.dataset.id) || null; dialog.close(); }
            if (e.target.closest("[data-cancel]")) dialog.close();
        });
        dialog.addEventListener("close", () => { dialog.remove(); resolve(picked); });
        document.body.append(dialog);
        dialog.showModal();
    });
}

async function startFrom(kind) {
    if (kind === "blank") return replaceParts(blankParts(), "", "");
    if (kind === "last") {
        const last = lastPlanFor(st.plans, KEY, DATE);
        if (!last) return;
        const notes = await getPlanNotes(last.key, last.date).catch(() => []);
        return replaceParts(partsFromLines(last.lines, notes), last.focus || "", last.bring || "");
    }
    const pb = await playbook();
    const choice = await pickFrom("Playbook practice", pb.practices.map(p => ({ id: p.id, label: p.name, sub: `${p.practice.items.length} drills`, practice: p.practice })), "No saved practices yet. Build one in the Playbook's practice planner.");
    if (choice) await replaceParts(partsFromLines(linesFromPractice(choice.practice, pb.drills, st.group.startTime)));
}

async function addDrill() {
    const pb = await playbook();
    const drills = [...pb.drills.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const d = await pickFrom("Add a drill", drills.map(x => ({ id: x.id, label: x.name, sub: [x.topic, x.minutes && `${x.minutes} min`].filter(Boolean).join(" · "), minutes: x.minutes })), "No drills yet.");
    if (!d) return;
    const empty = st.parts.findIndex(p => !p.name);
    const part = { kind: empty >= 0 ? st.parts[empty].kind : "Technical", name: d.label.slice(0, 60), mins: Number(d.minutes) || 10, note: empty >= 0 ? st.parts[empty].note : "" };
    if (empty >= 0) st.parts[empty] = part; else st.parts.push(part);
    st.dirty = true;
    renderParts();
}

async function save() {
    const parts = cleanParts(st.parts);
    const focus = $("ssFocus").value.trim();
    if (!parts.length && !focus) { toast("Add a part or a focus first.", { type: "error" }); return; }
    const button = $("ssSave");
    button.disabled = true;
    try {
        st.existing = await savePlan({
            key: KEY, date: DATE, startTime: st.group.startTime, title: st.group.label || "Soccer session", mode: "plan",
            focus, lines: linesFromParts(parts, st.group.startTime), bring: $("ssBring").value,
            clientUids: [...new Set(st.group.players.map(p => p.clientUid).filter(Boolean))]
        });
        let notesSaved = true;
        try { await savePlanNotes(KEY, DATE, notesFromParts(parts)); } catch (error) { notesSaved = false; console.warn("Southbound: plan notes not saved.", error); }
        st.dirty = false;
        $("ssRemove").hidden = false;
        toast(notesSaved ? "Plan saved" : "Plan saved, but your notes didn't save. The newest rules may not be published yet.", notesSaved ? undefined : { type: "error" });
    } catch (error) {
        console.error(error);
        toast(friendlyError(error, "save the plan"), { type: "error" });
    } finally { button.disabled = false; }
}

async function remove() {
    if (!await sbConfirm("Remove this plan? Players will no longer see it.", { confirmLabel: "Remove", danger: true })) return;
    try {
        await deletePlan(KEY, DATE);
        await savePlanNotes(KEY, DATE, []).catch(() => {});
        st.existing = null; st.parts = blankParts(); st.dirty = false;
        $("ssFocus").value = ""; $("ssBring").value = ""; $("ssRemove").hidden = true;
        renderParts();
        toast("Plan removed");
    } catch (error) { toast(friendlyError(error, "remove the plan"), { type: "error" }); }
}

function wire() {
    $("ssParts").addEventListener("input", e => {
        const part = e.target.closest(".ss-part"), f = e.target.dataset.f;
        if (!part || !f) return;
        const p = st.parts[Number(part.dataset.i)];
        p[f] = f === "mins" ? Number(e.target.value) || 0 : e.target.value;
        if (f === "kind") part.dataset.kind = p.kind;
        st.dirty = true;
        renderTotal();
    });
    $("ssParts").addEventListener("click", e => {
        const part = e.target.closest(".ss-part");
        if (!part) return;
        const i = Number(part.dataset.i);
        const swap = j => { [st.parts[i], st.parts[j]] = [st.parts[j], st.parts[i]]; };
        if (e.target.closest("[data-up]") && i > 0) swap(i - 1);
        else if (e.target.closest("[data-down]") && i < st.parts.length - 1) swap(i + 1);
        else if (e.target.closest("[data-del]")) st.parts.splice(i, 1);
        else return;
        st.dirty = true;
        renderParts();
    });
    for (const id of ["ssFocus", "ssBring"]) $(id).addEventListener("input", () => { st.dirty = true; });
    $("ssAdd").addEventListener("click", () => { st.parts.push({ kind: "Other", name: "", mins: 0, note: "" }); st.dirty = true; renderParts(); $("ssParts").lastElementChild?.querySelector("[data-f=name]")?.focus(); });
    $("ssDrills").addEventListener("click", () => addDrill().catch(e => toast(friendlyError(e, "open your drills"), { type: "error" })));
    $("ssFrom").addEventListener("click", e => { const b = e.target.closest("[data-from]"); if (b) startFrom(b.dataset.from).catch(err => toast(friendlyError(err, "load that"), { type: "error" })); });
    $("ssSave").addEventListener("click", save);
    $("ssRemove").addEventListener("click", remove);
    window.addEventListener("beforeunload", e => { if (st.dirty) e.preventDefault(); });
}

const fail = html => { $("ssLoading").hidden = true; $("ssError").hidden = false; $("ssError").innerHTML = html; };

listenForAuth(async user => {
    if (!user) return;
    try {
        const [requests, plans] = await Promise.all([listRequestsForMyClients(), listMyPlans("coach").catch(() => [])]);
        st.group = findGroup(sessionGroups(sessionList(requests, new Date().toLocaleDateString("en-CA"))), KEY, DATE);
        if (!st.group) { fail(`<p>That session isn't on your schedule any more.</p><a class="clients-btn-primary" href="soccer-coach.html">Back to Soccer</a>`); return; }
        st.plans = plans;
        st.existing = plans.find(p => p.key === KEY && p.date === DATE) || null;
        const notes = st.existing ? await getPlanNotes(KEY, DATE).catch(() => []) : [];
        st.parts = st.existing?.lines?.length ? partsFromLines(st.existing.lines, notes) : blankParts();

        const g = st.group, n = g.players.length, length = sessionMinutes(g.startTime, g.endTime);
        $("ssEyebrow").textContent = `Soccer · ${dateLong(g.date)}${g.startTime ? ` · ${time(g.startTime)}` : ""}`;
        $("ssTitle").textContent = g.label || (n === 1 ? g.players[0].name : "Soccer session");
        $("ssLead").textContent = `${n === 1 ? g.players[0].name : `${n} players`}${length ? ` · ${length} min` : ""}`;
        document.title = `${g.label || "Session"} | Southbound Coaching`;
        $("ssFocus").value = st.existing?.focus || "";
        $("ssBring").value = st.existing?.bring || "";
        $("ssRemove").hidden = !st.existing;
        renderFrom();
        renderParts();
        wire();
        $("ssLoading").hidden = true;
        $("ssBody").hidden = false;
    } catch (error) {
        console.warn("Southbound: couldn't load the session.", error);
        fail(`<p>${esc(friendlyError(error, "open this session"))}</p><button type="button" class="clients-btn-primary" onclick="location.reload()">Try again</button>`);
    }
});
