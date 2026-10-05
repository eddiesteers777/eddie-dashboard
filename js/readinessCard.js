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

import { computeReadiness, adviceFor, sleepCoach, insights, checkinsUntilInsights, kindOfDay, TAGS, hm, colorOf, missingReason } from "./readiness.js";
import { refreshHealth, healthRefreshing, lastHealthError, inputs, loadCheckins, saveCheckin, loadSettings, saveSettings, isoDate, load, recompute, pushCloud } from "./readinessData.js";
import { READINESS_KEY } from "./readiness.js";
import { isCorosConnected } from "./corosClient.js";
import { cachedRole } from "./role.js";
import { icon } from "./icons.js";
import { toast, sbPrompt } from "./ui.js";
import { readinessV2 } from "./readinessV2.js";
import { athleteInputs, resetAthleteInputs } from "./readinessV2Data.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLOR_WORD = { green: "Green", yellow: "Yellow", red: "Red", none: "" };

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

function scale(name, label, left, right, value) {
    return `<fieldset class="rd-scale"><legend>${esc(label)}</legend>
        <div class="rd-scale-row">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="${name}" value="${n}" ${value === n ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>
        <div class="rd-scale-ends"><span>${esc(left)}</span><span>${esc(right)}</span></div></fieldset>`;
}

export function openCheckin(date, onSaved) {
    const c = loadCheckins()[date] || {};
    const dialog = document.createElement("dialog");
    dialog.className = "sb-dialog rd-dialog";
    dialog.innerHTML = `<form method="dialog" class="sb-dialog-form rd-form">
        <h2 class="sb-dialog-title">Morning check-in</h2>
        ${scale("soreness", "How sore are you?", "Not at all", "Very", c.soreness)}
        ${scale("energy", "Energy", "Drained", "Great", c.energy)}
        ${scale("mood", "Mood", "Low", "Great", c.mood)}
        <label class="rd-check"><input type="checkbox" name="sick" ${c.sick ? "checked" : ""}> Feeling sick</label>
        <label class="rd-field">Any pain? <input type="text" name="pain" maxlength="80" placeholder="e.g. left Achilles" value="${esc(c.pain || "")}"></label>
        <fieldset class="rd-tags"><legend>Yesterday, did you…</legend>
            ${TAGS.map(t => `<label class="rd-tag"><input type="checkbox" name="tags" value="${t.id}" ${(c.tags || []).includes(t.id) ? "checked" : ""}><span>${esc(t.label)}</span></label>`).join("")}
        </fieldset>
        <label class="rd-field">Note <textarea name="note" rows="2" maxlength="500">${esc(c.note || "")}</textarea></label>
        <div class="sb-dialog-actions">
            <button type="button" class="sb-btn sb-btn-tertiary" value="cancel">Cancel</button>
            <button type="submit" class="sb-btn sb-btn-primary" value="save">Save check-in</button>
        </div>
    </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector('[value="cancel"]').addEventListener("click", () => dialog.close());
    dialog.querySelector("form").addEventListener("submit", event => {
        event.preventDefault();
        const f = new FormData(event.target);
        const n = k => (f.get(k) ? Number(f.get(k)) : null);
        saveCheckin(date, {
            soreness: n("soreness"), energy: n("energy"), mood: n("mood"),
            sick: f.get("sick") === "on", pain: String(f.get("pain") || "").trim(),
            tags: f.getAll("tags"), note: String(f.get("note") || "").trim()
        });
        dialog.close();
        toast("Check-in saved.");
        onSaved?.();
    });
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
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
    return `<details class="rd-insights"><summary>${icon("activity")} What's helping, what's hurting</summary>${body}</details>`;
}

async function render() {
    const el = $("readinessCard");
    if (!el) return;
    const today = isoDate(new Date());
    const role = cachedRole();
    const data = inputs();
    const useV2 = role === "coach" && data.settings.version === "v2";
    const extra = useV2 ? await athleteInputs(today) : null;
    const v2data = useV2 ? { ...data, ...(extra || {}) } : null;
    const r = useV2 ? readinessV2(today, v2data) : computeReadiness(today, data);
    const history = load(READINESS_KEY, {});
    const shownHistory = useV2 ? Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - i); const k = isoDate(d); const x = readinessV2(k, v2data); return [k, x.score == null ? null : { score: x.score, color: x.color }]; }).filter(([, v]) => v)) : history;
    // A client sees it once there's something to show: COROS connected on
    // this device, or scores / health data synced from another one. Without
    // a watch it was a big card of dashes above their coach's news (Phase 8;
    // COROS is connected in Settings). The coach always sees his. A class,
    // not `hidden`: the page's data-requires pass unhides by capability.
    if (role !== "coach" && !isCorosConnected() && !Object.keys(history).length && !Object.keys(data.health || {}).length) {
        el.classList.add("rd-none");
        el.innerHTML = "";
        return;
    }
    const before = [1, 2].map(i => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - i); return shownHistory[isoDate(d)]?.color; }).filter(Boolean);
    const workout = role === "coach" ? await coachWorkout(today) : await clientWorkout(today);
    const advice = adviceFor(r, workout, before);
    const coach = sleepCoach(data.health, today, data.settings.sleepNeedMin);
    const connected = isCorosConnected();
    const easy = advice.swap && role === "coach" && workout.week ? await nextEasyDay(workout) : null;
    const checkin = data.checkins[today];
    const flagged = r.flags.some(f => f.key === "sick" || f.key === "pain");
    const missing = r.score == null ? missingReason({ connected, refreshing: healthRefreshing(), error: lastHealthError(), health: data.health, history, today }) : null;
    const adviceText = missing && !flagged ? missing.text : advice.text;
    const lastDay = d => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    el.hidden = false;
    el.className = `rd-card ${r.color}`;
    el.innerHTML = `
        <div class="rd-head">
            <div class="rd-ring" style="--pct:${r.score ?? 0}" role="img" aria-label="Readiness ${r.score ?? "not available"}">
                <strong>${r.score ?? "–"}</strong><span>Readiness</span>
            </div>
            <div class="rd-summary">
                <div class="sb-eyebrow rd-eyebrow">Readiness${r.score != null ? ` · ${COLOR_WORD[r.color]}` : ""}</div>
                <p class="rd-advice">${esc(adviceText)}</p>
                ${missing?.latest ? `<p class="rd-last">Last score: <strong class="${missing.latest.color}">${missing.latest.score}</strong> on ${lastDay(missing.latest.date)}</p>` : ""}
                ${missing?.canRefresh ? `<button type="button" class="sb-btn sb-btn-secondary rd-refresh" data-act="refresh">${icon("refresh")} Refresh from COROS</button>` : ""}
                ${easy ? `<button type="button" class="sb-btn sb-btn-secondary rd-swap" data-act="swap">${icon("refresh")} Move it to ${esc(easy.name)}, run easy today</button>` : ""}
                ${advice.swap && role !== "coach" ? `<a class="rd-link" href="plan.html">Ask your coach to move it →</a>` : ""}
                ${r.flags.filter(f => f.key !== "pain" && f.key !== "sick").map(f => `<p class="rd-flag">${icon("alertTriangle")} ${esc(f.text)}</p>`).join("")}
            </div>
        </div>
        ${useV2 ? v2Html(r, extra) : `${r.parts.length ? `<ul class="rd-parts">${partsHtml(r.parts)}</ul>` : ""}${corosHtml(r)}`}
        ${connected || missing ? "" : `<p class="rd-connect">${icon("watch")} Connect COROS in <a href="settings.html#coros">Settings</a> for your daily score from HRV, resting heart rate and sleep.</p>`}
        ${weekDots(today, shownHistory)}
        ${coach ? `<div class="rd-sleep">${icon("moon")}<div><p>${esc(coach.text)}</p><small>${coach.debtMin > 30 ? `Short ${hm(coach.debtMin)} of sleep over the last 7 nights. ` : ""}<button type="button" class="rd-link-btn" data-act="need">Sleep need: ${hm(coach.needMin)}</button></small></div></div>` : ""}
        <div class="rd-checkin-row">
            ${checkin
                ? `<span class="rd-done">${icon("checkCircle")} Checked in${checkin.tags?.length ? ` · ${checkin.tags.length} from yesterday` : ""}</span><button type="button" class="sb-btn sb-btn-tertiary" data-act="checkin">Edit</button>`
                : `<button type="button" class="sb-btn sb-btn-primary" data-act="checkin">${icon("edit")} Morning check-in</button><small>10 seconds: soreness, energy, mood, and what you did yesterday.</small>`}
        </div>
        ${insightsHtml(today)}
        ${role === "coach" ? `<div class="rd-version" role="group" aria-label="Which readiness score">
            <span>Score:</span>
            <button type="button" class="rd-ver${useV2 ? "" : " is-on"}" data-act="v1" aria-pressed="${!useV2}">Classic</button>
            <button type="button" class="rd-ver${useV2 ? " is-on" : ""}" data-act="v2" aria-pressed="${useV2}">New (testing)</button>
            <a class="rd-link" href="analytics.html#readinessCheckPanel">Which predicts better?</a>
        </div>` : ""}`;
    import("./icons.js").then(m => m.hydrate?.()).catch(() => {});

    el.onclick = async event => {
        const act = event.target.closest("[data-act]")?.dataset.act;
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
