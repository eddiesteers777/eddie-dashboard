/* ==========================================
   Southbound — Prayer map and Bible week sheets (2026-11-14)

   Tapping the Prayer or Bible habit on Today (or the Habits page) opens one of
   these instead of ticking it. The habit ticks itself when everything on the
   sheet is checked (every prayer item; every chapter of the day's reading) and
   the habit's own scene plays (candle, ribbon). Un-checking un-ticks it.
   Prayer = option A (the map), Bible = option B (week strip + today's reading),
   picked by Eddie. Data and rules: js/prayerModel.js, js/biblePlan.js.
   Mock-ups: project files prayer-bible-habits/.
========================================== */

import { habitList, dayKey, doneOn } from "./habitDefaults.js";
import { showsPersonalPlan } from "./role.js";
import { habitStreak, dayComplete } from "./todayCues.js";
import * as P from "./prayerModel.js";
import * as B from "./biblePlan.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const sync = () => import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});

const CK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`;
const FLAME = `<svg viewBox="0 0 34 56" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M17 2C24 16 32 26 32 38a15 15 0 0 1-30 0C2 26 10 18 17 2z"/></svg>`;
const BOOK = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/></svg>`;

/** The Prayer / Bible habit on a list: the drawn icon, or the word in the name. */
export function findPrayerHabit(habits) {
    return (habits || []).find(h => h?.icon === "hb:pray") || (habits || []).find(h => /prayer|pray\b/i.test(String(h?.name || ""))) || null;
}
export function findBibleHabit(habits) {
    return (habits || []).find(h => h?.icon === "hb:bible") || (habits || []).find(h => /bible/i.test(String(h?.name || ""))) || null;
}
/** "prayer" | "bible" | null for the habit the person tapped. */
export function faithKind(habits, habitId) {
    const p = findPrayerHabit(habits), b = findBibleHabit(habits);
    if (p && p.id === habitId) return "prayer";
    if (b && b.id === habitId) return "bible";
    return null;
}

// ---- the habit's tick, shared by both sheets
function setTick(habit, day, on) {
    const entries = read("entries", {}) || {};
    const d = { ...(entries[day] || {}) };
    const was = Boolean(d[habit.id]);
    if (on) d[habit.id] = true; else delete d[habit.id];
    if (Object.keys(d).length) entries[day] = d; else delete entries[day];
    write("entries", entries);
    return was;
}

async function celebrate(habit, day) {
    const habits = habitList(read("habits", null), showsPersonalPlan());
    const entries = read("entries", {}) || {};
    const done = doneOn(entries, day, habits), allDone = done === habits.length;
    try {
        const c = await import("./celebrate.js");
        await c.celebrateHabit(habit, { allDone, count: habits.length, done, streak: allDone ? habitStreak(entries, habits, day) : 0, days: allDone ? c.weekDots(day, k => dayComplete(entries, k, habits)) : null });
    } catch { /* the tick already saved */ }
}

function shell(label, icon, title) {
    const dlg = document.createElement("dialog");
    dlg.className = "fs-sheet";
    dlg.setAttribute("aria-label", label);
    dlg.innerHTML = `<div class="fs-grab" aria-hidden="true"></div>
        <div class="fs-hd"><span class="fs-ic" aria-hidden="true">${icon}</span><div class="fs-ht"><h2>${esc(title)}</h2><p class="fs-sub" aria-live="polite"></p></div><button type="button" class="fs-x" data-close aria-label="Close">&#10005;</button></div>
        <div class="fs-body"></div><div class="fs-foot"></div>`;
    document.body.appendChild(dlg);
    return dlg;
}

function run(dlg, onClick) {
    const opener = document.activeElement;
    return new Promise(resolve => {
        dlg.addEventListener("click", e => {
            if (e.target === dlg || e.target.closest("[data-close]")) { dlg.close(); return; }
            onClick(e);
        });
        dlg.addEventListener("close", () => { dlg.remove(); try { opener?.focus?.(); } catch {} resolve(); }, { once: true });
        dlg.showModal();
    });
}

// ============ Prayer (option A: the map) ============
export async function openPrayerSheet({ habit = null, onChange = null } = {}) {
    const day = dayKey();
    const { sbPrompt, sbConfirm } = await import("./ui.js");
    let list = P.cleanList(read(P.PRAYER_LIST_KEY, null));
    let checks = P.pruneChecks(read(P.PRAYER_CHECKS_KEY, {}) || {}, list || { steps: [] }, day);
    let editing = false, openStep = null, finished = false;
    const dlg = shell("Prayer", FLAME, "Prayer");
    const $ = s => dlg.querySelector(s);
    const saveList = () => { write(P.PRAYER_LIST_KEY, list); sync(); };
    const saveChecks = () => { write(P.PRAYER_CHECKS_KEY, checks); };

    function draw() {
        const sub = $(".fs-sub"), body = $(".fs-body"), foot = $(".fs-foot");
        if (!list) {
            sub.textContent = "Nothing on your list yet";
            body.innerHTML = `<div class="fs-empty">
                <svg viewBox="0 0 120 80" width="120" height="80" fill="none" aria-hidden="true"><path d="M10 66C34 66 28 40 52 40S74 14 108 14" stroke="rgba(214,228,240,.35)" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/><circle cx="10" cy="66" r="6" fill="#C7D6E4"/><circle cx="52" cy="40" r="6" stroke="#C7D6E4" stroke-width="2"/><circle cx="108" cy="14" r="8" stroke="#D2AD62" stroke-width="2"/></svg>
                <p>Build your prayer map. Pick the steps you pray through, then add what you pray for under each one. The habit checks off when every item is done.</p></div>
                <button type="button" class="fs-btn fs-b1" data-starter>Use the starter steps</button>
                <button type="button" class="fs-btn fs-b2" data-own>Make my own steps</button>`;
            foot.innerHTML = "";
            return;
        }
        const { done, total } = P.progress(list, checks, day);
        sub.textContent = editing ? "Editing your map" : total ? (done === total ? "All prayed" : `${done} of ${total} prayed`) : "Add something to pray for";
        const cur = openStep || P.currentStepId(list, checks, day);
        const on = checks[day] || {};
        const steps = list.steps.map((s, i) => {
            const k = s.items.filter(it => on[it.id]).length, complete = s.items.length > 0 && k === s.items.length;
            const state = editing ? "now" : s.id === cur ? "now" : complete ? "done" : "later";
            const rows = s.items.map(it => `<div class="fs-row${on[it.id] ? " is-on" : ""}">
                <button type="button" class="fs-item" data-item="${esc(it.id)}" aria-pressed="${Boolean(on[it.id])}"${editing ? " data-edit-item" : ""}><span class="fs-ck" aria-hidden="true">${on[it.id] ? CK : ""}</span><span class="fs-t">${esc(it.text)}</span></button>
                ${editing ? `<button type="button" class="fs-del" data-del-item="${esc(it.id)}" aria-label="Remove ${esc(it.text)}">&#10005;</button>` : ""}</div>`).join("");
            return `<div class="fs-st is-${state}" data-step="${esc(s.id)}">
                <span class="fs-node" aria-hidden="true">${complete && !editing ? CK : i + 1}</span>
                <button type="button" class="fs-sth" data-open-step="${esc(s.id)}" aria-expanded="${state === "now"}"><span class="fs-stn">${esc(s.name)}</span><span class="fs-tag">${editing ? "" : complete ? "done" : s.items.length ? `${k} of ${s.items.length}` : ""}</span></button>
                ${editing ? `<button type="button" class="fs-link" data-rename-step="${esc(s.id)}">Rename</button>` : ""}
                <div class="fs-sb">${s.prompt && !editing ? `<p class="fs-pr">${esc(s.prompt)}</p>` : ""}<div class="fs-its">${rows}${editing ? `<button type="button" class="fs-add" data-add="${esc(s.id)}">+ Add a prayer</button>${list.steps.length > 1 ? `<button type="button" class="fs-link fs-warn" data-del-step="${esc(s.id)}">Remove this step</button>` : ""}` : ""}</div></div></div>`;
        }).join("");
        const idx = Math.max(0, list.steps.findIndex(s => s.id === cur));
        const pct = list.steps.length > 1 ? Math.round(idx / (list.steps.length - 1) * 100) : 100;
        body.innerHTML = `<div class="fs-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
            <div class="fs-map"><i class="fs-fill" style="height:calc((100% - 52px) * ${pct / 100})"></i>${steps}${editing ? `<button type="button" class="fs-add fs-addstep" data-add-step>+ Add a step</button>` : ""}</div>`;
        foot.innerHTML = `<button type="button" class="fs-btn fs-b2" data-edit>${editing ? "Done editing" : "Edit my prayer map"}</button>`;
    }

    async function afterToggle() {
        saveChecks();
        const complete = P.isComplete(list, checks, day);
        if (habit) {
            const had = setTick(habit, day, complete);
            sync();
            onChange?.();
            if (complete && !had && !finished) {
                finished = true;
                draw();
                setTimeout(() => { dlg.close(); celebrate(habit, day); }, 450);
                return;
            }
            if (!complete) finished = false;
        }
        draw();
    }

    draw();
    await run(dlg, async e => {
        const t = e.target;
        if (t.closest("[data-starter]")) { list = P.starterList(); saveList(); draw(); return; }
        if (t.closest("[data-own]")) {
            const name = await sbPrompt("Name your first step.", { title: "First step", placeholder: "For example: Thank", confirmLabel: "Add" });
            if (name?.trim()) { list = P.addStep({ steps: [] }, name); saveList(); editing = true; draw(); }
            return;
        }
        if (!list) return;
        if (t.closest("[data-edit]")) { editing = !editing; draw(); return; }
        const open = t.closest("[data-open-step]");
        if (open && !editing) { openStep = open.dataset.openStep; draw(); return; }
        const del = t.closest("[data-del-item]");
        if (del) { list = P.removeItem(list, del.dataset.delItem); saveList(); await afterToggle(); return; }
        const addBtn = t.closest("[data-add]");
        if (addBtn) {
            const text = await sbPrompt("What do you pray for here?", { title: "Add a prayer", placeholder: "For example: Wife and family", confirmLabel: "Add", maxLength: 80 });
            if (text?.trim()) { list = P.addItem(list, addBtn.dataset.add, text); saveList(); await afterToggle(); }
            return;
        }
        if (t.closest("[data-add-step]")) {
            const name = await sbPrompt("Name the new step.", { title: "Add a step", placeholder: "For example: Praise", confirmLabel: "Add", maxLength: 40 });
            if (name?.trim()) { list = P.addStep(list, name); saveList(); draw(); }
            return;
        }
        const ren = t.closest("[data-rename-step]");
        if (ren) {
            const cur = list.steps.find(s => s.id === ren.dataset.renameStep);
            const name = await sbPrompt("Rename this step.", { title: "Rename step", defaultValue: cur?.name || "", confirmLabel: "Save", maxLength: 40 });
            if (name?.trim()) { list = P.renameStep(list, cur.id, name); saveList(); draw(); }
            return;
        }
        const delStep = t.closest("[data-del-step]");
        if (delStep) {
            if (await sbConfirm("Its prayers go with it.", { title: "Remove this step?", confirmLabel: "Remove", danger: true })) { list = P.removeStep(list, delStep.dataset.delStep); saveList(); await afterToggle(); }
            return;
        }
        const item = t.closest("[data-item]");
        if (item) {
            if (editing) {
                const cur = P.allItems(list).find(i => i.id === item.dataset.item);
                const text = await sbPrompt("Change this prayer.", { title: "Edit prayer", defaultValue: cur?.text || "", confirmLabel: "Save", maxLength: 80 });
                if (text?.trim()) { list = P.renameItem(list, cur.id, text); saveList(); draw(); }
                return;
            }
            checks = P.toggleCheck(checks, day, item.dataset.item);
            openStep = null;
            await afterToggle();
        }
    });
}

// ============ Bible (option B: week strip + today's reading) ============
export async function openBibleSheet({ habit = null, onChange = null } = {}) {
    const day = dayKey();
    let plan = B.cleanPlan(read(B.BIBLE_PLAN_KEY, null));
    if (plan) { plan = B.withLock(plan, day); }
    const dlg = shell("Bible", BOOK, "Bible");
    const $ = s => dlg.querySelector(s);
    let finished = false;
    const savePlan = () => { write(B.BIBLE_PLAN_KEY, plan); sync(); };

    function draw() {
        const sub = $(".fs-sub"), body = $(".fs-body"), foot = $(".fs-foot");
        if (!plan) {
            sub.textContent = "No plan chosen yet";
            body.innerHTML = `<div class="fs-empty"><p>Pick a plan and your reading shows up here each day. If you miss a day, it carries over.</p></div>
                ${Object.values(B.PLANS).map(pl => `<button type="button" class="fs-opt" data-pick="${pl.id}"><b>${esc(pl.name)}</b><span>${esc(pl.blurb)}</span></button>`).join("")}
                <button type="button" class="fs-opt" data-log><b>Just log that I read</b><span>No plan. One tap for today only.</span></button>
                ${habit && (read("entries", {}) || {})[day]?.[habit.id] ? `<button type="button" class="fs-btn fs-b2" data-unlog>Undo today's tick</button>` : ""}`;
            foot.innerHTML = "";
            return;
        }
        const d = plan.lock.day, ch = B.chaptersOn(plan, d), got = new Set(plan.read[d] || []);
        const behind = B.daysBehind(plan, day, d), over = d >= B.PLAN_DAYS || ch.length === 0;
        sub.textContent = over ? `${B.planName(plan.id)} · complete` : `${B.planName(plan.id)} · Day ${d + 1} of ${B.PLAN_DAYS}`;
        const strip = B.weekStrip(plan, day).map(w => `<div class="fs-wd is-${w.state}"><span>${w.label}</span><b>${w.done ? CK : w.date}</b></div>`).join("");
        const note = over ? "You finished the year." : behind > 0
            ? `You are ${behind} day${behind > 1 ? "s" : ""} behind. Nothing is lost. Pick up here.`
            : "You are on track.";
        const next = ch.length ? `Next up: ${esc(B.chaptersOn(plan, d + 1)[0] || "the end")}.` : "";
        body.innerHTML = `<div class="fs-week" aria-label="This week">${strip}</div>
            <div class="fs-card${behind > 0 ? "" : " is-ok"}"><span class="fs-ic" aria-hidden="true">${BOOK}</span><div><b>${esc(note)}</b><small>${over ? "" : `${B.PLAN_DAYS - d - 1} days left. ${next}`}</small></div></div>
            <p class="fs-h3"><span>Today's reading</span><span>${got.size} of ${ch.length}</span></p>
            <div class="fs-its">${ch.map((c, i) => `<div class="fs-row${got.has(i) ? " is-on" : ""}"><button type="button" class="fs-item" data-ch="${i}" aria-pressed="${got.has(i)}"><span class="fs-ck" aria-hidden="true">${got.has(i) ? CK : ""}</span><span class="fs-t">${esc(c)}</span></button></div>`).join("")}</div>`;
        foot.innerHTML = `<button type="button" class="fs-btn fs-b2" data-stop>Stop this plan</button>`;
    }

    async function afterToggle() {
        savePlan();
        const complete = B.dayDone(plan, plan.lock.day);
        if (habit) {
            const had = setTick(habit, day, complete);
            sync();
            onChange?.();
            if (complete && !had && !finished) {
                finished = true;
                draw();
                setTimeout(() => { dlg.close(); celebrate(habit, day); }, 450);
                return;
            }
            if (!complete) finished = false;
        }
        draw();
    }

    draw();
    await run(dlg, async e => {
        const t = e.target;
        const pick = t.closest("[data-pick]");
        if (pick) { plan = B.withLock(B.startPlan(day, pick.dataset.pick), day); savePlan(); draw(); return; }
        if (t.closest("[data-log]")) {
            dlg.close();
            if (habit) { const had = setTick(habit, day, true); sync(); onChange?.(); if (!had) celebrate(habit, day); }
            return;
        }
        if (t.closest("[data-unlog]")) { if (habit) { setTick(habit, day, false); sync(); onChange?.(); } dlg.close(); return; }
        if (t.closest("[data-stop]")) {
            const { sbConfirm } = await import("./ui.js");
            if (await sbConfirm("Your progress in this plan is removed. Today's habit stays as it is.", { title: "Stop this plan?", confirmLabel: "Stop plan", danger: true })) { plan = null; try { localStorage.removeItem(B.BIBLE_PLAN_KEY); } catch {} sync(); draw(); }
            return;
        }
        const chBtn = t.closest("[data-ch]");
        if (chBtn && plan) { plan = B.toggleChapter(plan, day, plan.lock.day, Number(chBtn.dataset.ch)); await afterToggle(); }
    });
}
