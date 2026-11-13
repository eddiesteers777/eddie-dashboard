/* ==========================================
   Southbound — the Readiness card on Today (js/readiness.js)

   For anyone who trains: today's score (green / yellow / red), each
   part in plain words, advice for today's workout, the sleep coach, the
   morning check-in (with "Yesterday, did you…") and, after enough
   check-ins, what's helping and what's hurting. The coach's own plan
   can move a hard day to the next easy day in one tap (with Undo);
   a client is pointed to their coach instead (My Plan → Need a change?).
   Without COROS: the check-in still works, with a note to connect COROS
   for the score. Data: js/readinessData.js.
   Readiness v2 (js/readinessV2.js, athlete model step 5): the coach can
   switch the card between Classic (v1, the default) and New (v2: HRV and
   resting HR, sleep and feel against his own baselines; training
   response and load shown beside it, not in it) until the readiness
   check on Analytics says which predicts bad training days better.
   Clients stay on v1.
========================================== */

import { computeReadiness, adviceFor, sleepCoach, insights, checkinsUntilInsights, kindOfDay, TAGS, hm, colorOf, missingReason, DEFAULT_SLEEP_NEED } from "./readiness.js";
import { refreshHealth, healthRefreshing, lastHealthError, inputs, loadCheckins, saveCheckin, loadSettings, saveSettings, isoDate, load, recompute, pushCloud } from "./readinessData.js";
import { READINESS_KEY } from "./readiness.js";
import { isCorosConnected } from "./corosClient.js";
import { cachedRole } from "./role.js";
import { icon } from "./icons.js";
import { toast, sbPrompt } from "./ui.js";
import { readinessV2 } from "./readinessV2.js";
import { showHealthStats } from "./bodyModel.js";
import { ringHtml } from "./bodyView.js";
import { wordOf, trendPanel, panelTabs, todayStrip, logRead, TREND_DAYS } from "./readinessRead.js";
import { lensHtml, trendHtml, stripHtml } from "./readinessLedger.js";
import "./chartTips.js";
import { athleteInputs, resetAthleteInputs } from "./readinessV2Data.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// "Go as planned: you're ready for Tempo run." -> the lead in bold.
const adviceHtml = text => { const i = String(text).indexOf(": "); return i > 0 && i < 40 ? `<b>${esc(text.slice(0, i + 1))}</b> ${esc(text.slice(i + 2))}` : esc(text); };

// ---------- today's workout ----------

async function coachWorkout(today) {
    const md = await import("./marathonData.js");
    const { planDayFromMarathon } = await import("./marathonCoros.js");
    for (let w = 1; w <= md.WEEKS.length; w++) {
        const start = md.weekStart(w);
        for (let i = 0; i < 7; i++) {
            const d = new Date(start); d.setDate(d.getDate() + i);
            if (isoDate(d) !== today) continue;
            const day = md.getAdjustedWeekDays(w)[i];
            const kind = kindOfDay(day, planDayFromMarathon(day, md.PACES));
            return { kind, title: day.session || "today's run", week: w, index: i };
        }
    }
    return { kind: "none" };
}

async function clientWorkout(today) {
    try {
        const { weekInputs } = await import("./weekData.js");
        const { buildDay } = await import("./weekModel.js");
        const run = buildDay(today, weekInputs(), today).items.find(i => i.kind === "run" && i.source?.type === "plan");
        if (!run) return { kind: "rest" };
        const t = String(run.dayType || "").toLowerCase();
        const kind = t === "race" ? "race" : t === "long" ? "long" : t === "easy" || t === "recovery" ? "easy" : "quality";
        return { kind, title: run.title || "today's run" };
    } catch { return { kind: "none" }; }
}

// ---------- swap (the coach's own plan) ----------

async function nextEasyDay(from) {
    const md = await import("./marathonData.js");
    const { planDayFromMarathon } = await import("./marathonCoros.js");
    const start = { w: from.week, i: from.index };
    for (let step = 1; step <= 6; step++) {
        let w = start.w, i = start.i + step;
        while (i > 6) { i -= 7; w++; }
        if (w > md.WEEKS.length) return null;
        const day = md.getAdjustedWeekDays(w)[i];
        if (kindOfDay(day, planDayFromMarathon(day, md.PACES)) === "easy") {
            const d = new Date(md.weekStart(w)); d.setDate(d.getDate() + i);
            return { week: w, index: i, name: d.toLocaleDateString("en-US", { weekday: "long" }) };
        }
    }
    return null;
}

async function swapDays(a, b) {
    const md = await import("./marathonData.js");
    const before = localStorage.getItem("training-overrides");
    const overrides = md.loadOverrides();
    const dayA = md.getAdjustedWeekDays(a.week)[a.index], dayB = md.getAdjustedWeekDays(b.week)[b.index];
    const pick = d => ({ session: d.session, miles: d.miles, pace: d.pace });
    const set = (w, i, fields) => {
        const key = md.DAYS[i];
        overrides[w] = overrides[w] || {};
        overrides[w][key] = { ...(overrides[w][key] || {}), ...fields };
    };
    set(a.week, a.index, pick(dayB));
    set(b.week, b.index, pick(dayA));
    md.saveOverrides(overrides);
    pushCloud();
    return () => { if (before == null) localStorage.removeItem("training-overrides"); else localStorage.setItem("training-overrides", before); pushCloud(); };
}

// ---------- check-in ----------

// Each 1-5 answer in words, so a tap reads back as something (2026-10-10 redesign).
const SCALES = [
    { name: "energy", label: "Energy", words: ["Drained", "Low", "Okay", "Good", "Great"] },
    { name: "soreness", label: "Soreness", words: ["None", "A little", "Some", "Sore", "Very sore"] },
    { name: "mood", label: "Mood", words: ["Low", "Flat", "Okay", "Good", "Great"] }
];
// Yesterday's amounts, each a stepper with quick picks, kept in step with that day's Nutrition log.
const AMOUNT_INPUTS = [
    { id: "water", field: "waterOz", nutrition: "water", title: "Water yesterday", unit: "oz", step: 8, start: 64, presets: [64, 80, 100, 120], fallbackGoal: 100 },
    { id: "protein", field: "proteinG", nutrition: "protein", title: "Protein yesterday", unit: "g", step: 10, start: 120, presets: [100, 140, 180, 220], fallbackGoal: 150 }
];

function scale({ name, label, words }, value) {
    return `<fieldset class="rd-scale" data-scale="${name}"><legend>${esc(label)}<span class="rd-scale-word">${value ? esc(words[value - 1]) : ""}</span></legend>
        <div class="rd-scale-row">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="${name}" value="${n}" ${value === n ? "checked" : ""}><span aria-label="${n}: ${esc(words[n - 1])}">${n}</span></label>`).join("")}</div>
        <div class="rd-scale-ends"><span>${esc(words[0])}</span><span>${esc(words[4])}</span></div></fieldset>`;
}

const tagChips = (when, c) => TAGS.filter(t => t.when === when && (!t.retired || (c.tags || []).includes(t.id)))
    .map(t => `<label class="rd-tag"><input type="checkbox" name="tags" value="${t.id}" ${(c.tags || []).includes(t.id) ? "checked" : ""}><span>${icon("check")}${esc(t.label)}</span></label>`).join("");

function nutritionAmount(day, key) {
    try { const n = JSON.parse(localStorage.getItem(`nutrition-${day}`) || "null"); return Number(n?.[key]) || null; } catch { return null; }
}

async function nutritionGoals() {
    try {
        const { resolveGoals } = await import("./nutritionGoals.js");
        return resolveGoals(load("nutrition-goals", null), { isCoach: cachedRole() === "coach" }).goals || {};
    } catch { return {}; }
}

// The check-in's amounts are yesterday's: they go into that day's Nutrition log too, so both agree.
function saveNutritionAmount(day, key, value) {
    let entry = null;
    try { entry = JSON.parse(localStorage.getItem(`nutrition-${day}`) || "null"); } catch {}
    if (!entry) {
        entry = { breakfast: "", lunch: "", dinner: "", snacks: "", workoutTitle: "Rest Day", workoutDescription: "No workout scheduled.",
            foodLog: { breakfast: [], lunch: [], dinner: [], snacks: [] }, calories: 0, protein: 0, carbs: 0, fat: 0, water: 0, sodium: 0 };
    }
    entry[key] = value;
    localStorage.setItem(`nutrition-${day}`, JSON.stringify(entry));
}

export async function openCheckin(date, onSaved) {
    const c = loadCheckins()[date] || {};
    const yesterday = (() => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() - 1); return isoDate(d); })();
    const goals = await nutritionGoals();
    const amounts = Object.fromEntries(AMOUNT_INPUTS.map(a => [a.id, c[a.field] ?? nutritionAmount(yesterday, a.nutrition)]));
    const goalOf = a => Number(goals[a.nutrition]) || a.fallbackGoal;
    const when = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const dialog = document.createElement("dialog");
    dialog.className = "sb-dialog rd-dialog";
    dialog.innerHTML = `<form method="dialog" class="sb-dialog-form rd-form">
        <header class="rd-form-head">
            <div class="sb-eyebrow">${esc(when)}</div>
            <h2 class="sb-dialog-title">Morning check-in</h2>
            <button type="button" class="rd-x" value="cancel" aria-label="Close">${icon("close")}</button>
        </header>
        <div class="rd-form-body">
            <section class="rd-sec"><h3>How you feel</h3>
                ${SCALES.map(sc => scale(sc, c[sc.name])).join("")}
                <div class="rd-flags">
                    <label class="rd-tag rd-tag-warn"><input type="checkbox" name="sick" ${c.sick ? "checked" : ""}><span>${icon("check")}Feeling sick</span></label>
                    <label class="rd-tag rd-tag-warn"><input type="checkbox" name="hurts" ${c.pain ? "checked" : ""}><span>${icon("check")}Something hurts</span></label>
                </div>
                <label class="rd-field rd-pain"${c.pain ? "" : " hidden"}>Where? <input type="text" name="pain" maxlength="80" placeholder="e.g. left Achilles" value="${esc(c.pain || "")}"></label>
            </section>
            <section class="rd-sec"><h3>Last night</h3>
                <div class="rd-tags">${tagChips("night", c)}</div>
            </section>
            ${AMOUNT_INPUTS.map(a => `<section class="rd-sec rd-amount" data-amount="${a.id}"><h3>${a.title}</h3>
                <div class="rd-water">
                    <button type="button" class="rd-wbtn" data-w="-" aria-label="${a.step} ${a.unit} less">−</button>
                    <div class="rd-wval"><strong data-wv>–</strong><span>${a.unit}</span></div>
                    <button type="button" class="rd-wbtn" data-w="+" aria-label="${a.step} ${a.unit} more">+</button>
                </div>
                <div class="rd-wbar" aria-hidden="true"><i data-wbar></i></div>
                <p class="rd-wgoal" data-wgoal></p>
                <div class="rd-wpresets">${a.presets.map(v => `<button type="button" class="rd-wpreset" data-wset="${v}">${v}</button>`).join("")}<button type="button" class="rd-wpreset rd-wclear" data-wset="">Not sure</button></div>
            </section>`).join("")}
            <section class="rd-sec"><h3>Yesterday</h3>
                <div class="rd-tags">${tagChips("day", c)}</div>
            </section>
            <section class="rd-sec"><label class="rd-field">Note <textarea name="note" rows="2" maxlength="500" placeholder="Anything else worth remembering">${esc(c.note || "")}</textarea></label></section>
        </div>
        <footer class="rd-form-foot"><button type="submit" class="sb-btn sb-btn-primary" value="save">Save check-in</button></footer>
    </form>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector("form");
    const drawAmount = a => {
        const box = dialog.querySelector(`[data-amount="${a.id}"]`);
        const v = amounts[a.id], goal = goalOf(a);
        box.querySelector("[data-wv]").textContent = v ?? "–";
        box.querySelector("[data-wbar]").style.width = `${Math.min(100, ((v || 0) / goal) * 100)}%`;
        box.querySelector("[data-wgoal]").textContent = v == null ? `Your goal is ${goal} ${a.unit}. Tap + or a number.`
            : v >= goal ? `Goal reached (${goal} ${a.unit}).` : `${goal - v} ${a.unit} short of your ${goal} ${a.unit} goal.`;
        box.querySelectorAll("[data-wset]").forEach(b => b.classList.toggle("is-on", String(v ?? "") === b.dataset.wset));
    };
    AMOUNT_INPUTS.forEach(drawAmount);
    dialog.addEventListener("click", event => {
        const t = event.target.closest("button");
        if (!t) return;
        if (t.value === "cancel") dialog.close();
        const a = AMOUNT_INPUTS.find(x => x.id === t.closest("[data-amount]")?.dataset.amount);
        if (!a) return;
        const v = amounts[a.id];
        if (t.dataset.w) amounts[a.id] = Math.max(0, Math.min(a.unit === "oz" ? 400 : 600, (v ?? (t.dataset.w === "+" ? a.start - a.step : a.step)) + (t.dataset.w === "+" ? a.step : -a.step)));
        if ("wset" in t.dataset) amounts[a.id] = t.dataset.wset === "" ? null : Number(t.dataset.wset);
        drawAmount(a);
    });
    form.addEventListener("change", event => {
        const fs = event.target.closest("[data-scale]");
        if (fs) {
            const sc = SCALES.find(x => x.name === fs.dataset.scale);
            fs.querySelector(".rd-scale-word").textContent = sc.words[Number(event.target.value) - 1];
        }
        if (event.target.name === "hurts") {
            const box = dialog.querySelector(".rd-pain");
            box.hidden = !event.target.checked;
            if (event.target.checked) box.querySelector("input").focus();
        }
    });
    form.addEventListener("submit", event => {
        event.preventDefault();
        const f = new FormData(form);
        const n = k => (f.get(k) ? Number(f.get(k)) : null);
        const pain = f.get("hurts") === "on" ? (String(f.get("pain") || "").trim() || "yes") : "";
        saveCheckin(date, {
            soreness: n("soreness"), energy: n("energy"), mood: n("mood"),
            sick: f.get("sick") === "on", pain,
            tags: f.getAll("tags"), ...Object.fromEntries(AMOUNT_INPUTS.map(a => [a.field, amounts[a.id]])), note: String(f.get("note") || "").trim()
        });
        for (const a of AMOUNT_INPUTS) if (amounts[a.id] != null) saveNutritionAmount(yesterday, a.nutrition, amounts[a.id]);
        dialog.close();
        toast("Check-in saved.");
        onSaved?.();
    });
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
    import("./icons.js").then(m => m.hydrate?.()).catch(() => {});
}

// ---------- the card ----------

function v2Html(r, extra) {
    const rows = r.domains.map(d => ({ label: d.label, value: String(d.score), note: d.note, score: d.score }));
    return `${rows.length ? `<ul class="rd-parts">${partsHtml(rows)}</ul>` : ""}
        ${r.positives.length || r.concern ? `<div class="rd-why">
            ${r.positives.length ? `<p><strong>Going well:</strong> ${esc(r.positives.join(" · "))}</p>` : ""}
            ${r.concern ? `<p><strong>Watch:</strong> ${esc(r.concern)}</p>` : ""}
        </div>` : ""}
        ${corosHtml(r)}
        ${(r.context || []).length ? `<div class="rd-context"><p class="rd-context-h">Beside the score, not in it</p><ul>${r.context.map(d => `<li><strong>${esc(d.label)}</strong> ${esc(d.note)}</li>`).join("")}</ul></div>` : ""}
        ${extra ? "" : `<p class="rd-coros"><small>Training response and load can't be shown: the run history couldn't be read.</small></p>`}`;
}

const corosHtml = r => (r.coros ? `<p class="rd-coros">COROS recovery ${r.coros.percent}%${r.coros.status ? ` · ${esc(r.coros.status)}` : ""} <small>(COROS's own number, shown, not in the score)</small></p>` : "");

function partsHtml(parts) {
    return parts.map(p => `<li class="rd-part">
        <div class="rd-part-top"><span>${esc(p.label)}</span><strong>${esc(p.value)}</strong></div>
        <small>${esc(p.note)}</small>
        ${p.score != null ? `<span class="rd-bar ${colorOf(p.score)}" style="--v:${p.score}%" aria-hidden="true"></span>` : ""}
    </li>`).join("");
}

function weekDots(today, history = load(READINESS_KEY, {})) {
    const cells = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - i);
        const r = history[isoDate(d)];
        cells.push(`<span class="rd-dot ${r ? r.color : "none"}" title="${d.toLocaleDateString("en-US", { weekday: "short" })}${r ? `: ${r.score}` : ""}"><b>${r ? r.score : "–"}</b><i>${d.toLocaleDateString("en-US", { weekday: "narrow" })}</i></span>`);
    }
    return `<div class="rd-week" aria-label="Readiness, last 7 days">${cells.join("")}</div>`;
}

function insightsHtml(today) {
    const checkins = loadCheckins();
    const left = checkinsUntilInsights(checkins);
    const list = insights(checkins, load(READINESS_KEY, {}), today);
    const body = list.length
        ? `<ul class="rd-insights-list">${list.map(o => `<li class="${o.effect}"><strong>${esc(o.label)}</strong> ${o.effect === "none" ? "no clear effect" : `readiness ${Math.abs(o.diff)} ${o.diff > 0 ? "higher" : "lower"} the next morning`} <small>(${o.times} ${o.times === 1 ? "time" : "times"})</small></li>`).join("")}</ul>`
        : `<p>${left ? `Check in for ${left} more ${left === 1 ? "morning" : "mornings"}, ticking what you did the day before, and this starts showing what helps and what hurts your readiness.` : "Keep ticking what you did the day before: each answer needs 4 mornings with it and 4 without before it shows here."}</p>`;
    const recap = cachedRole() === "coach" ? `<p><a class="rd-link" href="analytics.html#habitsPanel">Your monthly recap and every habit's numbers →</a></p>` : "";
    return `<details class="rd-insights"><summary>${icon("activity")} What's helping, what's hurting</summary>${body}${recap}</details>`;
}

// ---------- the card (option C, 2026-11-12): a word, one line, a ledger of why, 4 weeks under any row ----------

let activeTab = null;   // which tab of the inner card is showing (null = the first)
let moreOpen = false;   // "Your week" fold
let model = null;       // the last thing computed, so opening a row redraws without recomputing

function connectSheet() {
    const dialog = document.createElement("dialog");
    dialog.className = "rd-sheet";
    dialog.setAttribute("aria-label", "Connect COROS");
    dialog.innerHTML = `<div class="rd-grab" aria-hidden="true"></div>
        <h3>Connect COROS</h3>
        <p>Southbound reads your sleep, HRV, resting heart rate and runs from your COROS watch.</p>
        <ul><li>Today's readiness uses last night's sleep and HRV</li><li>Your runs fill in your week</li><li>Workouts only go to your watch if you have a plan, and you can turn that off in Settings</li></ul>
        <button type="button" class="sb-btn sb-btn-primary" data-go>Continue to COROS</button>
        <button type="button" class="sb-btn sb-btn-tertiary" data-close>Not now</button>
        <p class="rd-sheet-foot">No COROS watch? Keep logging runs and checking in. This card reads those.</p>`;
    dialog.addEventListener("click", event => {
        if (event.target === dialog || event.target.closest("[data-close]")) dialog.close();
        if (event.target.closest("[data-go]")) {
            // COROS only brings people back to the pages it knows (settings.html, analytics.html): sign in there, then return here.
            try { sessionStorage.setItem("sb-coros-return", "index.html"); } catch { /* the sign-in still works */ }
            window.location.assign("settings.html?connect=coros#coros");
        }
    });
    dialog.addEventListener("close", () => dialog.remove());
    document.body.appendChild(dialog);
    dialog.showModal();
}

async function compute() {
    const today = isoDate(new Date());
    const role = cachedRole();
    const data = inputs();
    const connected = isCorosConnected();
    const history = load(READINESS_KEY, {});
    const hasWatchData = connected || Object.keys(history).length > 0 || Object.keys(data.health || {}).length > 0;
    const useV2 = role === "coach" && data.settings.version === "v2" && hasWatchData;
    const extra = useV2 ? await athleteInputs(today) : null;
    const v2data = useV2 ? { ...data, ...(extra || {}) } : null;
    const needMin = data.settings.sleepNeedMin || DEFAULT_SLEEP_NEED;
    const workout = role === "coach" ? await coachWorkout(today) : await clientWorkout(today);
    const checkin = data.checkins[today];
    const m = { today, role, data, connected, useV2, extra, workout, checkin, needMin, watch: hasWatchData };

    if (hasWatchData) {
        const r = useV2 ? readinessV2(today, v2data) : computeReadiness(today, data);
        const shownHistory = useV2 ? Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - i); const k = isoDate(d); const x = readinessV2(k, v2data); return [k, x.score == null ? null : { score: x.score, color: x.color }]; }).filter(([, v]) => v)) : history;
        const before = [1, 2].map(i => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - i); return shownHistory[isoDate(d)]?.color; }).filter(Boolean);
        const advice = adviceFor(r, workout, before);
        const flagged = r.flags.some(f => f.key === "sick" || f.key === "pain");
        const missing = r.score == null ? missingReason({ connected, refreshing: healthRefreshing(), error: lastHealthError(), health: data.health, history, today }) : null;
        Object.assign(m, {
            r, shownHistory, advice, missing,
            flags: r.flags.filter(f => f.key !== "pain" && f.key !== "sick"),
            adviceText: missing && !flagged ? missing.text : advice.text,
            color: r.color, word: wordOf(r.color),
            sessions: [],
            coach: sleepCoach(data.health, today, data.settings.sleepNeedMin)
        });
    } else {
        let sessions = [];
        try { sessions = await (await import("./athleteData.js")).loadLedger(today, { plan: false }); } catch { sessions = []; }
        const read = logRead({ date: today, sessions, checkins: data.checkins });
        const advice = read.ready ? adviceFor({ score: 1, color: read.color, flags: read.flags }, workout, []) : { text: "", swap: false };
        Object.assign(m, {
            read, sessions, advice, missing: null, flags: [], shownHistory: history,
            color: read.color, word: read.word,
            adviceText: read.ready ? advice.text : `Check in each morning. After ${read.progress.need} mornings, or a few logged runs, Southbound can say how you're carrying your training.`
        });
    }
    return m;
}

function draw(m) {
    const el = $("readinessCard");
    if (!el || !m) return;
    const { today, role, data, connected, useV2, extra, workout, checkin, needMin } = m;
    const lastDay = d => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    morningStrip(!checkin, today);
    el.hidden = false;
    el.className = `rd-card ${m.color}`;

    const dates = Array.from({ length: TREND_DAYS }, (_, i) => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - (TREND_DAYS - 1 - i)); return isoDate(d); });
    const tabs = panelTabs({ watch: m.watch, health: data.health });
    if (!tabs.some(t => t.key === activeTab)) activeTab = tabs[0].key;
    const panelHtml = trendHtml(trendPanel(activeTab, { health: data.health, checkins: data.checkins, sessions: m.sessions, date: today, needMin }), dates);
    const strip = todayStrip({ watch: m.watch, health: data.health, date: today, checkins: data.checkins, read: m.read });

    const easy = m.easy;
    const swapBtn = easy ? `<button type="button" class="sb-btn sb-btn-secondary rd-swap" data-act="swap">${icon("refresh")} Move it to ${esc(easy.name)}, run easy today</button>` : "";
    const lines = [
        m.missing?.latest ? `<p class="rd-last">Last score: <strong class="${m.missing.latest.color}">${m.missing.latest.score}</strong> on ${lastDay(m.missing.latest.date)}</p>` : "",
        ...(m.read ? m.read.flags : []).map(f => `<p class="rd-flag">${icon("alertTriangle")} ${esc(f.text)}</p>`),
        ...m.flags.map(f => `<p class="rd-flag">${icon("alertTriangle")} ${esc(f.text)}</p>`),
        m.missing?.canRefresh ? `<button type="button" class="sb-btn sb-btn-secondary rd-refresh" data-act="refresh">${icon("refresh")} Refresh from COROS</button>` : "",
        swapBtn,
        m.advice.swap && role !== "coach" ? `<a class="rd-link" href="plan.html">Ask your coach to move it →</a>` : ""
    ].join("");

    const chip = m.watch ? (connected ? "COROS" : "Your watch") : "From your log";
    const hasScore = m.watch && m.r.score != null;
    const sub = !m.watch && m.read.ready ? `<p class="rd-estimate">An estimate from what you've logged. No watch data.</p>` : "";
    const wordHtml = m.word
        ? `<p class="rd-word2 tone-${m.color}">${esc(m.word)}</p>`
        : `<p class="rd-word2 rd-word-quiet">${m.watch ? "No score yet" : "Not yet"}</p>`;
    const dots = !m.watch && !m.read.ready
        ? `<div class="rd-progress"><span class="rd-dots" aria-hidden="true">${Array.from({ length: m.read.progress.need }, (_, i) => `<i${i < m.read.progress.have ? ' class="on"' : ""}></i>`).join("")}</span><span>${m.read.progress.have} of ${m.read.progress.need} mornings</span></div>`
        : "";
    const more = `
        ${weekDots(today, m.shownHistory)}
        ${m.watch && m.coach ? `<div class="rd-sleep">${icon("moon")}<div><p>${esc(m.coach.text)}</p><small>${m.coach.debtMin > 30 ? `Short ${hm(m.coach.debtMin)} of sleep over the last 7 nights. ` : ""}<button type="button" class="rd-link-btn" data-act="need">Sleep need: ${hm(m.coach.needMin)}</button></small></div></div>` : ""}
        ${m.watch && useV2 ? v2Html(m.r, extra) : m.watch ? corosHtml(m.r) : ""}
        ${insightsHtml(today)}
        ${role === "coach" && m.watch ? `<div class="rd-version" role="group" aria-label="Which readiness score">
            <span>Score:</span>
            <button type="button" class="rd-ver${useV2 ? "" : " is-on"}" data-act="v1" aria-pressed="${!useV2}">Classic</button>
            <button type="button" class="rd-ver${useV2 ? " is-on" : ""}" data-act="v2" aria-pressed="${useV2}">New (testing)</button>
            <a class="rd-link" href="analytics.html#readinessCheckPanel">Which predicts better?</a>
        </div>` : ""}`;

    el.innerHTML = `
        <div class="eos-today-card-header"><h2>Readiness</h2><span class="rd-chip">${esc(chip)}</span></div>
        <div class="rd-body tone-${m.color}">
            <div class="rd-body-top">
                ${hasScore ? ringHtml(m.r.score, m.r.color) : ""}
                <div class="rd-say">${wordHtml}${sub}<p class="rd-line">${adviceHtml(m.adviceText)}</p></div>
            </div>
            ${lines.trim() ? `<div class="rd-extras">${lines}</div>` : ""}
            ${lensHtml(tabs, activeTab, panelHtml)}
            ${stripHtml(strip, activeTab)}
            ${dots}
            <div class="rd-body-foot">
                <div class="rd-checkin-row">
                    ${checkin
                        ? `<span class="rd-done">${icon("checkCircle")} Checked in</span><button type="button" class="sb-btn sb-btn-tertiary" data-act="checkin">Edit</button>`
                        : `<button type="button" class="sb-btn ${!m.watch && !m.read.ready ? "sb-btn-primary" : "sb-btn-secondary"}" data-act="checkin">${icon("edit")} ${!m.watch && !m.read.ready ? "Check in now" : "Morning check-in"}</button>`}
                </div>
                <button type="button" class="sb-btn sb-btn-tertiary rd-morebtn" data-act="more" aria-expanded="${moreOpen}">Your week <span aria-hidden="true">›</span></button>
            </div>
            ${moreOpen ? `<div class="rd-more2">${more}</div>` : ""}
            ${m.watch ? "" : `<div class="rd-connectbar"><p><b>Add COROS</b> for sleep, HRV and more</p><button type="button" class="sb-btn sb-btn-primary" data-act="connect">Connect</button></div>`}
        </div>`;
    import("./icons.js").then(m2 => m2.hydrate?.()).catch(() => {});

    bindSwipe(el);
    el.onclick = async event => {
        const tab = event.target.closest("[data-tab]")?.dataset.tab;
        if (tab) { selectTab(tab); return; }
        const act = event.target.closest("[data-act]")?.dataset.act;
        if (act === "more") { moreOpen = !moreOpen; draw(model); }
        if (act === "connect") connectSheet();
        if (act === "checkin") openCheckin(today, render);
        if (act === "v1" || act === "v2") { saveSettings({ ...loadSettings(), version: act }); render(); }
        if (act === "refresh") { const done = refreshHealth({ force: true }); render(); await done; render(); }
        if (act === "need") {
            const value = await sbPrompt("How many hours of sleep do you need a night?", { title: "Sleep need", defaultValue: String(loadSettings().sleepNeedMin / 60), placeholder: "7.5" });
            const hours = parseFloat(String(value ?? "").replace(",", "."));
            if (Number.isFinite(hours) && hours >= 5 && hours <= 11) { saveSettings({ ...loadSettings(), sleepNeedMin: Math.round(hours * 60) }); render(); }
        }
        if (act === "swap" && easy) {
            const undo = await swapDays(workout, easy);
            toast(`Moved to ${easy.name}. Today is easy now.`, { action: { label: "Undo", onClick: () => { undo(); render(); } } });
            render();
        }
    };
}

function selectTab(key) {
    if (!key || key === activeTab) return;
    activeTab = key;
    draw(model);
    $("readinessCard")?.querySelector(".rd-tab.on")?.scrollIntoView({ inline: "nearest", block: "nearest" });
}

// Swipe the inner card sideways to change tab. A finger sliding across the chart reads its days instead (js/chartTips.js).
function bindSwipe(el) {
    if (el.dataset.swipe) return;
    el.dataset.swipe = "1";
    let start = null;
    el.addEventListener("touchstart", event => {
        start = event.target.closest(".rd-panel") && !event.target.closest(".sb-chart") && event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    el.addEventListener("touchend", event => {
        if (!start || !model) return;
        const t = event.changedTouches[0], dx = t.clientX - start.x, dy = t.clientY - start.y;
        start = null;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const keys = panelTabs({ watch: model.watch, health: model.data.health }).map(x => x.key);
        const next = keys[keys.indexOf(activeTab) + (dx < 0 ? 1 : -1)];
        if (next) selectTab(next);
    }, { passive: true });
    el.addEventListener("keydown", event => {
        if (!event.target.closest?.('[role="tab"]') || !["ArrowLeft", "ArrowRight"].includes(event.key) || !model) return;
        const keys = panelTabs({ watch: model.watch, health: model.data.health }).map(x => x.key);
        const next = keys[keys.indexOf(activeTab) + (event.key === "ArrowRight" ? 1 : -1)];
        if (next) { selectTab(next); $("readinessCard")?.querySelector(".rd-tab.on")?.focus(); }
    });
}

async function render() {
    const el = $("readinessCard");
    if (!el) return;
    const settings = loadSettings();
    // Only the person's own switch (Settings: health stats on Today) hides it. A class, not `hidden`: the page's
    // data-requires pass unhides by capability.
    if (!showHealthStats({ settings })) {
        el.classList.add("rd-none");
        el.innerHTML = "";
        morningStrip(false);
        return;
    }
    const m = await compute();
    m.easy = m.advice.swap && m.role === "coach" && m.workout.week ? await nextEasyDay(m.workout) : null;
    model = m;
    draw(m);
}

// The morning check-in as a strip in the page header (the same row the after-run strip uses), until today's is done.
function morningStrip(show, today) {
    const strip = $("morningStrip");
    if (!strip) return;
    if (!show) { strip.hidden = true; strip.innerHTML = ""; return; }
    strip.innerHTML = `
        <span class="ci-strip-text"><span class="ci-strip-label">Morning check-in</span> <span class="ci-strip-ask">How are you feeling today?</span></span>
        <button type="button" class="sb-btn sb-btn-primary ci-strip-btn" data-morning>Check in</button>`;
    strip.hidden = false;
    if (!strip.dataset.bound) {
        strip.dataset.bound = "1";
        strip.addEventListener("click", event => { if (event.target.closest("[data-morning]")) openCheckin(strip.dataset.date, render); });
    }
    strip.dataset.date = today;
}

async function init() {
    const el = $("readinessCard");
    if (!el) return;
    recompute();
    const fetching = refreshHealth();                  // marks itself running first, so the card can say so
    await render();
    window.addEventListener("sb:readiness-updated", render);
    window.addEventListener("sb:athlete-answers", () => { resetAthleteInputs(); render(); });
    await fetching;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
