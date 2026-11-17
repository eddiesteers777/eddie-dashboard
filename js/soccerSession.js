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
import { listMyPlans, savePlan, deletePlan, getPlanNotes, savePlanNotes, getWrap, saveWrap, listWraps } from "./sessionPlans.js";
import { listTemplates, saveTemplate, deleteTemplate } from "./sessionTemplates.js";
import { saveSessionLog } from "./sessionLogs.js";
import { listMyClients } from "./coachAccess.js";
import { sendSessionSummaryEmail } from "./emailNotify.js";
import { refreshParentLinks } from "./parentShare.js";
import { listHomeworkIAssigned } from "./homework.js";
import { wrapParts, cleanWrap, logsFor, canWrap, hasWords, emailText, carryNotes, carryPart } from "./sessionWrap.js";
import { getMyProfile } from "./userProfile.js";
import { linesFromPractice } from "./sessionPlanModel.js";
import {
    PART_KINDS, MAX_NOTE, linesFromParts, notesFromParts, partsFromLines, totalMins, sessionMinutes,
    blankParts, lastPlanFor, sessionGroups, findGroup, cleanParts
} from "./sessionBuild.js";
import { esc } from "./homeworkView.js";
import { icon } from "./icons.js";
import { toast, friendlyError, sbConfirm, sbChoose, sbPrompt } from "./ui.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const KEY = params.get("key") || "", DATE = params.get("date") || "";
const MAX_PARTS = 12;
const dateLong = d => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const time = t => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };

const st = { group: null, plans: [], existing: null, parts: [], playbook: null, dirty: false, wrap: { missed: [], carry: [], parts: [], summary: "", lines: {} }, sentAt: null, wrapDirty: false, links: new Map() };

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

function renderCarry() {
    const box = $("ssCarry");
    const notes = st.carry || [];
    box.hidden = !notes.length;
    if (!notes.length) return;
    const nameOf = uid => st.group.players.find(p => p.clientUid === uid)?.name || "Player";
    box.innerHTML = `<div class="ss-carry-head"><span class="sp-lbl">From group</span></div>` + notes.map(n => `<div class="ss-carry-row"><div><b>${esc(first(nameOf(n.uid)))} · ${esc(dateLong(n.date))}</b><p>${esc(n.line)}</p></div>
        <button type="button" class="sb-btn sb-btn-secondary" data-use="${esc(n.uid)}">Start plan from this</button></div>`).join("");
}

function renderFrom() {
    const last = lastPlanFor(st.plans, KEY, DATE);
    $("ssFrom").innerHTML = [
        last ? `<button type="button" class="sc-chip" data-from="last">Last plan (${esc(dateLong(last.date))})</button>` : "",
        `<button type="button" class="sc-chip" data-from="template">Saved template</button>`,
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
    if (kind === "template") {
        const list = await listTemplates();
        const t = await pickFrom("Saved templates", list.map(x => ({ id: x.id, label: x.name, sub: `${(x.parts || []).length} parts${x.focus ? ` · ${x.focus}` : ""}`, tpl: x })), "No templates yet. Save a plan as a template and it shows up here.");
        if (t) await replaceParts(cleanParts(t.tpl.parts), t.tpl.focus || "", t.tpl.bring || "");
        return;
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

async function saveAsTemplate() {
    const parts = cleanParts(st.parts);
    if (!parts.length) { toast("Add a part first.", { type: "error" }); return; }
    const name = (await sbPrompt("Name this template.", { title: "Save as template", defaultValue: $("ssFocus").value.trim() || st.group.label || "", placeholder: "First touch night", confirmLabel: "Save", maxLength: 60 }) || "").trim();
    if (!name) return;
    try { await saveTemplate({ name, focus: $("ssFocus").value, bring: $("ssBring").value, parts }); toast("Saved as a template"); }
    catch (error) { console.error(error); toast(friendlyError(error, "save the template"), { type: "error" }); }
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
    $("ssCarry").addEventListener("click", e => {
        const b = e.target.closest("[data-use]");
        const n = b && (st.carry || []).find(x => x.uid === b.dataset.use);
        if (!n) return;
        if (st.parts.some(p => p.name === carryPart(n).name && p.note === carryPart(n).note)) { toast("That is already in the plan."); return; }
        const empty = st.parts.findIndex(p => !p.name && !p.note);
        const part = carryPart(n);
        st.parts = [part, ...st.parts.filter((_, i) => i !== empty)].slice(0, MAX_PARTS);
        if (!$("ssFocus").value.trim()) $("ssFocus").value = n.line.slice(0, 200);
        st.dirty = true; renderParts(); toast("Added to the top of the plan");
    });
    $("ssSave").addEventListener("click", save);
    $("ssRemove").addEventListener("click", remove);
    $("ssTemplate").addEventListener("click", saveAsTemplate);
    window.addEventListener("beforeunload", e => { if (st.dirty) e.preventDefault(); });
}

// ---- Wrap up ----

const today = new Date().toLocaleDateString("en-CA");
const first = name => String(name || "Player").split(/\s+/)[0];

function renderCame() {
    $("ssCame").innerHTML = st.group.players.map(p => {
        const out = st.wrap.missed.includes(p.clientUid);
        return `<button type="button" class="sc-chip${out ? " out" : " on"}" data-came="${esc(p.clientUid)}" aria-pressed="${!out}">${esc(first(p.name))}${out ? " · missed" : ""}</button>`;
    }).join("");
}

function renderDid() {
    $("ssDid").innerHTML = st.wrap.parts.length ? st.wrap.parts.map((p, i) => `<div class="ss-did" data-i="${i}">
        <div class="ss-did-top"><b>${esc(p.name)}</b><div class="ss-seg" role="group" aria-label="${esc(p.name)}">
            <button type="button" data-st="done" class="${p.status === "done" ? "on" : ""}" aria-pressed="${p.status === "done"}">Done</button>
            <button type="button" data-st="skipped" class="${p.status === "skipped" ? "on skip" : ""}" aria-pressed="${p.status === "skipped"}">Skipped</button></div></div>
        <input class="sb-dialog-input" data-how maxlength="200" value="${esc(p.how)}" placeholder="How it went (optional)" aria-label="How ${esc(p.name)} went" autocomplete="off"></div>`).join("")
        : `<div class="sc-empty">${st.existing ? "Nothing in the plan." : "No plan was saved for this session."} Add what you did below.</div>`;
}

function renderLines() {
    const came = st.group.players.filter(p => !st.wrap.missed.includes(p.clientUid));
    $("ssLines").innerHTML = came.length ? came.map(p => `<div class="ss-pl"><div class="ss-pl-top"><b>${esc(p.name)}</b></div>
        <textarea class="sb-dialog-input ss-note" data-line="${esc(p.clientUid)}" rows="2" maxlength="200" placeholder="A line for ${esc(first(p.name))} (optional)" aria-label="A line for ${esc(p.name)}">${esc(st.wrap.lines[p.clientUid] || "")}</textarea>
        <button type="button" class="sc-chip ss-carry-btn${st.wrap.carry.includes(p.clientUid) ? " on" : ""}" data-carry="${esc(p.clientUid)}" aria-pressed="${st.wrap.carry.includes(p.clientUid)}">${st.wrap.carry.includes(p.clientUid) ? "✓ Goes to their next 1-on-1" : "Carry to their next 1-on-1"}</button></div>`).join("") : `<div class="sc-empty">Nobody is marked as coming.</div>`;
}

function renderWrap() {
    renderCame(); renderDid(); renderLines();
    $("ssSummary").value = st.wrap.summary;
    const n = st.group.players.filter(p => !st.wrap.missed.includes(p.clientUid)).length;
    $("ssSend").textContent = `Send summary to ${n} ${n === 1 ? "player" : "players"}`;
    $("ssSend").disabled = !canWrap(DATE, today);
    $("ssWrapNote").textContent = canWrap(DATE, today) ? "It takes about a minute, and it starts from your plan." : "You can wrap this up on the day of the session.";
    $("ssSentNote").hidden = !st.sentAt;
    if (st.sentAt) $("ssSentNote").textContent = "Sent. Sending again updates what players see in the app.";
}

const readWrap = () => cleanWrap({ ...st.wrap, summary: $("ssSummary").value }, st.group.players);

async function sendWrap() {
    const wrap = readWrap();
    const players = st.group.players;
    const came = players.filter(p => !wrap.missed.includes(p.clientUid));
    if (!came.length) { toast("Mark at least one player as coming.", { type: "error" }); return; }
    if (!hasWords(wrap) && !await sbConfirm("There are no words in this summary yet. Send just the attendance and the drills?", { confirmLabel: "Send anyway" })) return;
    let email = true;
    if (st.sentAt) {
        const pick = await sbChoose("Players already got this once. Email them the update too?", { title: "Send again", choices: [{ value: "yes", label: "Update the app and email them", primary: true }, { value: "no", label: "Update the app only" }] });
        if (!pick) return;
        email = pick === "yes";
    }
    const button = $("ssSend");
    button.disabled = true;
    try {
        const focus = $("ssFocus").value.trim() || st.existing?.focus || "";
        const results = await Promise.allSettled(logsFor({ group: st.group, wrap, focus }).map(log => saveSessionLog(log)));
        const failed = results.filter(r => r.status === "rejected");
        await saveWrap(KEY, DATE, wrap, { sent: failed.length < results.length }).catch(e => console.warn("Southbound: wrap-up copy not saved.", e));
        const sentOk = results.map((r, i) => (r.status === "fulfilled" ? players[i] : null)).filter(Boolean);
        if (email) {
            const me = await getMyProfile().catch(() => null);
            for (const p of sentOk.filter(p => !wrap.missed.includes(p.clientUid))) {
                const link = st.links.get(p.clientUid);
                sendSessionSummaryEmail({ clientEmail: link?.clientEmail || "", clientName: first(p.name), coachName: me?.displayName || "", dateLabel: dateLong(DATE), text: emailText(wrap, p.clientUid, focus) });
            }
        }
        // Keep any parent link for these players current (quietly).
        Promise.all([listRequestsForMyClients(), listHomeworkIAssigned()]).then(([requests, homework]) => import("./auth.js").then(a => a.waitForUser()).then(u => u && refreshParentLinks({
            coachUid: u.uid, coachName: u.displayName || "", uids: sentOk.map(p => p.clientUid), names: new Map(sentOk.map(p => [p.clientUid, p.name])), requests, homework
        }))).catch(() => {});
        st.wrap = wrap; st.sentAt = failed.length < results.length ? Date.now() : st.sentAt; st.wrapDirty = false;
        renderWrap();
        if (failed.length) { console.error(failed[0].reason); toast(`Sent to ${sentOk.length}. ${failed.length} didn't save, try again.`, { type: "error" }); }
        else toast(`Sent to ${came.length} ${came.length === 1 ? "player" : "players"}`);
    } catch (error) {
        console.error(error);
        toast(friendlyError(error, "send the summary"), { type: "error" });
    } finally { button.disabled = !canWrap(DATE, today); }
}

async function saveDraft() {
    try { st.wrap = readWrap(); await saveWrap(KEY, DATE, st.wrap); st.wrapDirty = false; toast("Saved for later"); }
    catch (error) { toast(friendlyError(error, "save that"), { type: "error" }); }
}

function wireWrap() {
    $("ssCame").addEventListener("click", e => {
        const b = e.target.closest("[data-came]");
        if (!b) return;
        const uid = b.dataset.came, i = st.wrap.missed.indexOf(uid);
        i >= 0 ? st.wrap.missed.splice(i, 1) : st.wrap.missed.push(uid);
        st.wrapDirty = true; renderWrap();
    });
    $("ssDid").addEventListener("click", e => {
        const row = e.target.closest(".ss-did"), b = e.target.closest("[data-st]");
        if (!row || !b) return;
        st.wrap.parts[Number(row.dataset.i)].status = b.dataset.st;
        st.wrapDirty = true; renderDid();
    });
    $("ssDid").addEventListener("input", e => {
        const row = e.target.closest(".ss-did");
        if (row && e.target.matches("[data-how]")) { st.wrap.parts[Number(row.dataset.i)].how = e.target.value; st.wrapDirty = true; }
    });
    $("ssLines").addEventListener("input", e => { const u = e.target.dataset.line; if (u) { st.wrap.lines[u] = e.target.value; st.wrapDirty = true; } });
    $("ssLines").addEventListener("click", e => {
        const b = e.target.closest("[data-carry]");
        if (!b) return;
        const u = b.dataset.carry, i = st.wrap.carry.indexOf(u);
        if (i < 0 && !String(st.wrap.lines[u] || "").trim()) { toast("Write a line for them first.", { type: "error" }); return; }
        i >= 0 ? st.wrap.carry.splice(i, 1) : st.wrap.carry.push(u);
        st.wrapDirty = true; renderLines();
    });
    $("ssSummary").addEventListener("input", () => { st.wrapDirty = true; });
    $("ssDidAdd").addEventListener("click", async () => {
        const name = await sbPromptName();
        if (!name) return;
        st.wrap.parts.push({ name: name.slice(0, 60), kind: "Other", mins: 0, status: "done", how: "" });
        st.wrapDirty = true; renderDid();
    });
    $("ssSend").addEventListener("click", sendWrap);
    $("ssWrapSave").addEventListener("click", saveDraft);
    window.addEventListener("beforeunload", e => { if (st.wrapDirty) e.preventDefault(); });
}

async function sbPromptName() { const { sbPrompt } = await import("./ui.js"); return (await sbPrompt("What did you do?", { title: "Add something we did", placeholder: "Rondo 4v1" }) || "").trim(); }

function showTab(name) {
    const wrap = name === "wrap";
    $("ssPlanPane").hidden = wrap; $("ssWrapPane").hidden = !wrap;
    document.querySelectorAll(".ss-tab[data-tab]").forEach(b => { const on = b.dataset.tab === name; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    if (wrap) {
        // Parts follow the plan as it is saved now, keeping earlier answers.
        const planned = st.existing?.lines?.length ? partsFromLines(st.existing.lines, []) : [];
        if (planned.length) st.wrap.parts = wrapParts(planned, st.wrap.parts);
        renderWrap();
    }
    history.replaceState(null, "", `${location.pathname}?key=${encodeURIComponent(KEY)}&date=${encodeURIComponent(DATE)}${wrap ? "&tab=wrap" : ""}`);
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
        const [wrapDoc, links] = await Promise.all([getWrap(KEY, DATE).catch(() => null), listMyClients().catch(() => [])]);
        st.links = new Map(links.map(l => [l.clientUid, l]));
        if (wrapDoc) { st.wrap = cleanWrap({ ...wrapDoc, parts: wrapDoc.parts || [] }, g.players); st.sentAt = wrapDoc.sentAt ? Date.now() : null; }
        wireWrap();
        // Lines carried from a group session into this one (only before the session itself).
        if (DATE >= today) listWraps().then(w => { st.carry = carryNotes(w, g.players.map(p => p.clientUid), DATE); renderCarry(); }).catch(() => {});
        document.querySelectorAll(".ss-tab[data-tab]").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
        if (params.get("tab") === "wrap") showTab("wrap");
        $("ssLoading").hidden = true;
        $("ssBody").hidden = false;
    } catch (error) {
        console.warn("Southbound: couldn't load the session.", error);
        fail(`<p>${esc(friendlyError(error, "open this session"))}</p><button type="button" class="clients-btn-primary" onclick="location.reload()">Try again</button>`);
    }
});
