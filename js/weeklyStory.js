/* ==========================================
   Southbound — the Weekly Review story (audit Phase D)

   Draws sections 1, 2, 4, 5, 6 and 8 of weekly-review.html from the
   pure story (js/weekStory.js): the week in a sentence, the week at a
   glance (planned vs done by day), how the runs landed, recovery as
   changes from your usual, the one reading, and the next 7 days with
   the decision's changes inline. The decision and its evidence come
   from js/thisWeekCard.js (sb:week-decision), so Weekly Review and
   Today show the same decision; the glance is drawn first from the plan
   and the run list alone. Coach only (Weekly Review is a coach page).
========================================== */

import { weekGlance, weekSentence, modelReading, responseWeek, nextWeek, recoveryWeek } from "./weekStory.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); return addDays(date, -((new Date(y, m - 1, d).getDay() + 6) % 7)); };
const short = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const hm = min => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;
const mi = n => (Math.round(n * 10) / 10).toString();
const STATE_WORDS = { done: "Done", partial: "Part", missed: "Missed", today: "Today", upcoming: "", rest: "Rest", extra: "Extra" };

const state = { today: isoToday(), glance: null, weekNumber: null, decision: null, data: null, runs: [] };

function show(id, html) {
    const el = $(id);
    if (!el) return;
    const body = el.querySelector(".wr-story-body") || el;
    body.innerHTML = html;
    el.hidden = !html;
}

// ---------- 1. the sentence ----------

async function readingOf(data) {
    if (!data?.response) return null;
    const tr = await import("./trainingResponse.js");
    return tr.reading(tr.efficiencySignal(data.response.effRuns || [], state.today), tr.effortSignal(data.response.effortRows || [], state.today));
}

async function renderSentence() {
    const el = $("wrSentence");
    if (!el) return;
    const reading = await readingOf(state.data);
    el.innerHTML = `<p class="wr-sentence">${esc(weekSentence({ weekNumber: state.weekNumber, glance: state.glance, reading, decision: state.decision }))}</p>`;
    return reading;
}

// ---------- 2. the glance ----------

function renderGlance() {
    const g = state.glance;
    const el = $("wrGlance")?.querySelector(".wr-glance-body");
    if (!el || !g) return;
    if (!g.days.length) { el.innerHTML = `<p class="wr-empty">No plan days this week. Runs still count in the training stimulus below.</p>`; return; }
    el.innerHTML = `
        <ul class="wr-days">${g.days.map(d => `<li class="wr-day is-${d.state}${d.key ? " is-key" : ""}">
            <span class="wr-day-name">${esc(d.dayName)}</span>
            <span class="wr-day-plan">${d.planned ? `${mi(d.planned)} mi` : "—"}${d.key ? ` <b class="wr-key">${esc(d.kind === "long" ? "Long" : d.kind === "race" ? "Race" : "Key")}</b>` : ""}<small>${esc(d.title)}</small></span>
            <span class="wr-day-done">${d.done ? `${mi(d.done)} mi` : d.state === "upcoming" ? "" : "—"}</span>
            <span class="wr-day-state">${esc(STATE_WORDS[d.state])}</span>
        </li>`).join("")}</ul>
        <p class="wr-glance-total"><strong>${mi(g.doneMiles)} of ${mi(g.plannedMiles)} mi</strong> planned for the week (${mi(g.plannedToDate)} through today) · ${g.runs} ${g.runs === 1 ? "run" : "runs"} · ${g.keyToDate ? `key workouts ${g.keyDone} of ${g.keyToDate} done so far (${g.keyPlanned} this week)` : g.keyPlanned ? `${g.keyPlanned} key ${g.keyPlanned === 1 ? "workout" : "workouts"} this week, none due yet` : "no key workouts this week"}</p>`;
}

// ---------- 4. response, 5. recovery, 6. reading, 8. next ----------

function renderResponse() {
    if (!state.data?.response) return show("wrResponse", "");
    const from = mondayOf(state.today);
    const r = responseWeek({ effortRows: state.data.response.effortRows || [], execution: state.data.execution || [], runs: state.runs, from, to: state.today });
    const dom = state.decision?.domains?.find(d => d.key === "response");
    const lines = [
        dom ? `<li><strong>${esc(dom.label)}${dom.severity ? ` · ${esc(dom.word)}` : ""}</strong>: ${esc(dom.text)}.</li>` : "",
        `<li>Effort answered on <strong>${r.rated} of ${r.of}</strong> runs this week${r.mean != null ? `; on average they felt <strong>${Math.abs(r.mean)} ${r.mean > 0 ? "harder" : r.mean < 0 ? "easier" : "as hard"}</strong>${r.mean ? " than they usually cost you" : " as usual"}` : ""}.${r.rated < r.of ? ` <a href="#wrRate">Rate the rest below</a>.` : ""}</li>`,
        ...r.stoodOut.map(s => `<li>${esc(short(s.date))}: ${esc(s.text)}.</li>`),
        ...r.execution.map(e => `<li>${esc(short(e.date))} ${esc(e.title)}: <strong>${e.onTarget} of ${e.work}</strong> work reps on target${e.fast ? `, ${e.fast} too fast` : ""}${e.slow ? `, ${e.slow} too slow` : ""}.</li>`)
    ].filter(Boolean);
    show("wrResponse", `<ul class="wr-points">${lines.join("")}</ul>`);
}

function renderRecovery() {
    const data = state.data || {};
    const r = recoveryWeek({ health: data.health || {}, checkins: data.checkins || {}, today: state.today, needMin: data.settings?.sleepNeedMin || 450 });
    const change = (p, unit, better) => {
        if (p.week == null) return "no nights this week";
        if (p.usual == null) return `${p.week} ${unit} (not enough nights before it to compare)`;
        const diff = Math.round((p.week - p.usual) * 10) / 10;
        const word = Math.abs(diff) < 1 ? "about your usual" : `${Math.abs(diff)} ${unit} ${diff > 0 ? "above" : "below"} your usual`;
        const tone = Math.abs(diff) < 1 ? "" : (diff > 0) === better ? " is-good" : " is-watch";
        return `<span class="wr-chg${tone}">${p.week} ${unit}, ${word} (${p.usual})</span>`;
    };
    let coros = "";
    try {
        const days = JSON.parse(localStorage.getItem("coros-fitness-history") || "{}") || {};
        const day = Object.keys(days).filter(d => days[d]?.recovery?.percent != null && d > addDays(state.today, -3)).sort().at(-1);
        if (day) coros = `<li>COROS recovery ${Math.round(days[day].recovery.percent)}% (COROS's own number, shown, not counted).</li>`;
    } catch { coros = ""; }
    const doms = (state.decision?.domains || []).filter(d => ["autonomic", "sleep", "subjective"].includes(d.key));
    const lines = [
        ...doms.map(d => `<li><strong>${esc(d.label)}${d.severity ? ` · ${esc(d.word)}` : ""}</strong>: ${esc(d.text)}.</li>`),
        `<li>HRV: ${change(r.hrv, "ms", true)} · resting HR: ${change(r.rhr, "bpm", false)} <small>(last 7 nights against the 4 weeks before)</small></li>`,
        r.sleep.avgMin != null ? `<li>Sleep: <span class="wr-chg${r.sleep.avgMin < r.sleep.needMin - 20 ? " is-watch" : ""}">${hm(r.sleep.avgMin)} a night</span> against your ${hm(r.sleep.needMin)} need (${r.sleep.n} nights).</li>` : `<li>Sleep: no nights from COROS this week.</li>`,
        `<li>Morning check-ins: <strong>${r.checkins}</strong> this week.${r.checkins < 3 ? ` <a href="index.html">Do it on Today</a>: 10 seconds.` : ""}</li>`,
        coros
    ].filter(Boolean);
    show("wrRecovery", `<ul class="wr-points">${lines.join("")}</ul>`);
}

function renderReading(reading) {
    const m = modelReading({ reading, decision: state.decision });
    show("wrReading", `<div class="wr-reading is-${esc(m.key)}"><strong>${esc(m.title)}</strong>${m.text ? `<p>${esc(m.text)}</p>` : ""}</div>`);
}

async function renderNext() {
    const { planDaysFrom } = await import("./weeklyDecisionData.js");
    const days = await planDaysFrom(addDays(state.today, 1), 7);
    const n = nextWeek({ planDays: days, decision: state.decision });
    if (!n.days.length) return show("wrNext", "");
    show("wrNext", `
        <ul class="wr-next">${n.days.map(d => `<li class="${d.change ? "is-changed" : ""}${d.key ? " is-key" : ""}">
            <span class="wr-day-name">${esc(short(d.date))}</span>
            <span>${d.miles ? `${mi(d.miles)} mi · ` : ""}${esc(d.title)}</span>
            ${d.change ? `<b class="wr-change">${esc(d.change)}</b>` : ""}
        </li>`).join("")}</ul>
        <p class="wr-next-total">${mi(n.miles)} mi planned${n.changed ? ` · ${n.changed} ${n.changed === 1 ? "day" : "days"} with a suggested change (Apply above to put ${n.changed === 1 ? "it" : "them"} in your plan)` : ""}.</p>
        ${n.watch ? `<p class="wr-watch"><strong>One thing to watch.</strong> ${esc(n.watch)}</p>` : ""}
        <p class="wr-next-total"><a href="planning.html">Plan it in Weekly Planning →</a></p>`);
}

// ---------- wiring ----------

async function loadGlance() {
    state.today = isoToday();
    const monday = mondayOf(state.today);
    const [{ planDaysFrom }, { loadLedger }] = await Promise.all([import("./weeklyDecisionData.js"), import("./athleteData.js")]);
    const [plan, sessions] = await Promise.all([planDaysFrom(monday, 7), loadLedger(state.today)]);
    state.runs = sessions.filter(s => s.date >= monday && s.date <= state.today);
    state.weekNumber = plan[0]?.week || null;
    state.glance = weekGlance({ planDays: plan, runs: state.runs, today: state.today });
    renderGlance();
    await renderSentence();
}

async function onDecision(detail) {
    state.decision = detail?.decision || null;
    state.data = detail?.data || null;
    const reading = await renderSentence();
    renderResponse();
    renderRecovery();
    renderReading(reading);
    await renderNext();
}

function mount() {
    if (!$("wrSentence")) return;
    window.addEventListener("sb:week-decision", e => onDecision(e.detail).catch(error => console.error("Southbound: the week's story couldn't draw.", error)));
    let timer = null;
    const again = () => { clearTimeout(timer); timer = setTimeout(() => loadGlance().catch(() => {}), 300); };
    for (const name of ["eddieos:coros-history-updated", "sb:strava-updated", "sb:athlete-answers"]) window.addEventListener(name, again);
    loadGlance().catch(error => console.error("Southbound: the week at a glance couldn't draw.", error));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
