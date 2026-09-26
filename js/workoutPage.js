/* ==========================================
   Southbound — one workout (workout.html?program=...&date=...)

   The client's view of a planned run:
     - what to do: title, distance, why this workout, the coach's cue,
       and every step (warm-up, main set, recovery, cool-down)
     - Start workout: a full-screen, step-by-step workout mode with a
       timer per step (counts down for timed steps) that keeps the
       screen awake where the phone allows it
     - Log this run (coach plans): done or skipped, distance, time ->
       pace, effort 1-10, pain / discomfort, a note to the coach. Saved
       to workoutResults (js/workoutResults.js); the coach sees planned
       vs. actual and can reply on it.
     - their result, planned vs. actual, and the coach's reply
   Plans the client made themselves have no coach to log to: they get
   Mark done instead. A coach's strength session on the day
   (&kind=strength) is handed to js/strengthSession.js.
========================================== */

import { listenForAuth } from "./auth.js";
import { getActiveRunningPrograms } from "./activeProgramSources.js";
import { buildDay } from "./weekModel.js";
import { weekInputs, toggleDone, fuelContext } from "./weekData.js";
import { fuelForRun, gelCues } from "./workoutFuel.js";
import { formatClock } from "./fuelSchedule.js";
import { shortDay, typeLabel, isoDate } from "./coachingPlanModel.js";
import {
    executionSteps, amountText, targetText, compareRun, parseDuration, formatDuration, formatPace
} from "./runWorkout.js";
import { listMyResults, saveMyResult, deleteMyResult, isStrengthResult } from "./workoutResults.js";
import { toast, sbConfirm, sbAlert, friendlyError, emptyHtml } from "./ui.js";
import { toMillis } from "./clientSummary.js";
import { icon } from "./icons.js";
import { isCorosConnected, entryFor, sendState, sendToCoros, sendSummary } from "./corosSend.js";
import { sendableDate } from "./corosWorkout.js";
import { renderEmojiText } from "./emoji.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const params = new URLSearchParams(location.search);
const programId = params.get("program");
const date = params.get("date");
const strengthMode = params.get("kind") === "strength";

const RPE_WORDS = { 1: "Very easy", 2: "Easy", 3: "Easy", 4: "Comfortable", 5: "Steady", 6: "Moderate", 7: "Hard", 8: "Very hard", 9: "Near max", 10: "All out" };
const RUN_TITLES = { easy: "Easy run", recovery: "Recovery run", long: "Long run", workout: "Workout", tempo: "Tempo run", race: "Race" };

const state = { program: null, day: null, week: null, weekIndex: 0, result: null, user: null };

function findDay() {
    const program = getActiveRunningPrograms().find(p => p.id === programId);
    if (!program) return null;
    const weeks = program.generatedPlan?.weeks || [];
    for (let i = 0; i < weeks.length; i++) {
        const day = (weeks[i].days || []).find(d => d.date === date);
        if (day) return { program, day, week: weeks[i], weekIndex: i };
    }
    return null;
}

const isCoachPlan = () => state.program?.source === "coach" && state.program.coachPlanId;
const title = () => RUN_TITLES[state.day.type] || typeLabel(state.day.type);

// ---------- Page ----------

function stepsHtml(workout) {
    const rows = [];
    if (workout.warmup) rows.push(["Warm up", amountText(workout.warmup), workout.warmup.note || "easy"]);
    (workout.sets || []).forEach((set, i) => {
        const reps = set.repeat > 1 ? `${set.repeat} × ${amountText(set)}` : amountText(set);
        const rec = set.recovery ? `${amountText(set.recovery)} ${set.recovery.note || "recovery"} between` : "";
        rows.push([workout.sets.length > 1 ? `Set ${i + 1}` : "Main set", reps, [targetText(set), rec].filter(Boolean).join(" · ")]);
    });
    if (workout.cooldown) rows.push(["Cool down", amountText(workout.cooldown), workout.cooldown.note || "easy"]);
    return `<ol class="wo-steps">${rows.map(([label, amount, detail]) => `
        <li><span class="wo-step-label">${esc(label)}</span><strong>${esc(amount)}</strong><span>${esc(detail)}</span></li>`).join("")}</ol>`;
}

function resultHtml(result) {
    const planned = { miles: state.day.miles, workout: state.day.workout };
    if (result.status === "skipped") {
        return `
            <section class="clients-card wo-result is-skipped">
                <h2>${icon("info")} Skipped</h2>
                ${result.note ? `<p class="wo-note">"${renderEmojiText(esc(result.note))}"</p>` : ""}
                ${coachReplyHtml(result)}
                <div class="wo-actions"><button type="button" class="sb-btn sb-btn-secondary" data-act="log">Edit</button></div>
            </section>`;
    }
    const cmp = compareRun(planned, { distance: result.distance, durationSec: result.durationSec });
    const vs = { on: "On target pace", faster: "Faster than target", slower: "Slower than target" }[cmp.paceVsTarget] || "";
    return `
        <section class="clients-card wo-result">
            <h2>${icon("checkCircle")} Done</h2>
            <div class="wo-compare">
                <div><span>Planned</span><strong>${state.day.miles ? `${state.day.miles} mi` : "—"}</strong></div>
                <div><span>You ran</span><strong>${result.distance ? `${result.distance} mi` : "—"}</strong>${cmp.distancePct ? `<small>${cmp.distancePct}% of plan</small>` : ""}</div>
                <div><span>Time</span><strong>${result.durationSec ? formatDuration(result.durationSec) : "—"}</strong></div>
                <div><span>Pace</span><strong>${cmp.pace || "—"}</strong>${vs ? `<small>${esc(vs)}${cmp.target ? ` (${esc(cmp.target)})` : ""}</small>` : ""}</div>
                <div><span>Effort</span><strong>${result.rpe ? `${result.rpe}/10` : "—"}</strong>${result.rpe ? `<small>${esc(RPE_WORDS[result.rpe])}</small>` : ""}</div>
            </div>
            ${result.pain ? `<p class="wo-pain">${icon("alertTriangle")} Pain or discomfort${result.painNote ? `: ${esc(result.painNote)}` : ""}</p>` : ""}
            ${result.note ? `<p class="wo-note">"${renderEmojiText(esc(result.note))}"</p>` : ""}
            ${coachReplyHtml(result)}
            <div class="wo-actions"><button type="button" class="sb-btn sb-btn-secondary" data-act="log">Edit</button></div>
        </section>`;
}

function coachReplyHtml(result) {
    if (!result.coachComment) return `<p class="clients-card-note">Your coach sees this${result.pain ? " and was told about the pain" : ""}.</p>`;
    const when = toMillis(result.coachCommentAt);
    return `<div class="wo-reply"><span>${icon("send")} ${esc(state.program.coachName || "Your coach")}${when ? ` · ${new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span><p>${renderEmojiText(esc(result.coachComment))}</p></div>`;
}

// ---------- Fuel (js/workoutFuel.js) ----------

function currentFuel() {
    const miles = Number(state.day.miles) || 0;
    if (!miles) return null;
    const ctx = fuelContext();
    state.fuelContext = ctx;
    return fuelForRun({ type: state.day.type, miles, coachNote: state.day.workout?.fuel || "" }, ctx);
}

function fuelHtml() {
    const fuel = state.fuel;
    if (!fuel || (fuel.level === "none" && !fuel.coachNote && !["workout", "tempo"].includes(state.day.type))) return "";
    const coach = state.program.coachName || "your coach";
    const typeParam = { tempo: "workout" }[state.day.type] || state.day.type;
    return `
        <section class="clients-card wo-fuel">
            <h2>${icon("fuel")} Fuel</h2>
            ${fuel.coachNote ? `<div class="wo-reply wo-fuel-note"><span>${icon("send")} From ${esc(coach)}</span><p>${esc(fuel.coachNote)}</p></div>` : ""}
            <div class="wo-fuel-cols">
                <div>
                    <h3>Before</h3>
                    <ul>${fuel.before.map(b => `<li><b>${esc(b.when)}</b> ${esc(b.text)}</li>`).join("")}</ul>
                </div>
                <div>
                    <h3>During</h3>
                    <ul>${fuel.during.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
                    ${fuel.gels.length ? `
                    <ol class="wo-gels">
                        ${fuel.gels.map(g => `<li><strong>${esc(g.clock)}</strong><span>${g.mile ? `mile ${g.mile}` : ""}</span><span>${esc(g.name)}${g.caffeine ? " (caffeine)" : ""}</span></li>`).join("")}
                    </ol>` : ""}
                </div>
                <div>
                    <h3>After</h3>
                    <ul>${fuel.after.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
                </div>
            </div>
            <p class="clients-card-note">About ${fuel.durationMin} min, estimated from the distance. ${state.fuelContext?.hasProfile ? "Targets use your last fueling plan's details." : "Save a plan in Fueling (your weight, sweat rate, stomach) and these fit you better."}
                <a href="fueling.html?type=${encodeURIComponent(typeParam)}&miles=${encodeURIComponent(fuel.miles)}&duration=${fuel.durationMin}">Fine-tune in Fueling →</a></p>
        </section>`;
}

function render() {
    const { day, week, program } = state;
    const workout = day.workout;
    const miles = Number(day.miles) || 0;
    const item = buildDay(date, weekInputs(), isoDate(new Date())).items.find(i => i.source?.programId === program.id && i.kind === "run");
    const done = state.result ? state.result.status === "completed" : Boolean(day.completed);

    $("woBody").innerHTML = `
        <section class="wo-head">
            <span class="wo-eyebrow">${esc(shortDay(date))} · Week ${week.week ?? state.weekIndex + 1}${week.phase ? ` · ${esc(week.phase)}` : ""}</span>
            <div class="wo-title">
                <h1>${esc(title())}</h1>
                ${miles ? `<span class="wk-big">${miles}<small> mi</small></span>` : ""}
            </div>
            <span class="wo-meta">${program.source === "coach" ? `From ${esc(program.coachName || "your coach")} · ` : ""}${esc(program.name || "")}</span>
        </section>

        ${state.result ? resultHtml(state.result) : ""}

        ${workout?.why ? `<section class="clients-card wo-why"><h2>Why this workout</h2><p>${esc(workout.why)}</p></section>` : ""}
        ${workout?.cue ? `<section class="wo-cue">${icon("send")}<div><span>Coach cue</span><p>${esc(workout.cue)}</p></div></section>` : ""}

        <section class="clients-card">
            <h2>The workout</h2>
            ${workout && (workout.sets?.length || workout.warmup || workout.cooldown) ? stepsHtml(workout) : `<p class="wo-plain">${esc(day.session && day.session.toLowerCase() !== String(day.type).toLowerCase() ? day.session : `${miles ? `${miles} mi ` : ""}${title().toLowerCase()} at a comfortable effort`)}</p>`}
        </section>

        ${fuelHtml()}

        ${state.result ? "" : `
        <div class="wo-actions wo-main-actions">
            ${workout && executionSteps(workout).length ? `<button type="button" class="sb-btn sb-btn-primary" data-act="start">${icon("play")} Start workout</button>` : ""}
            ${isCoachPlan()
                ? `<button type="button" class="sb-btn ${workout ? "sb-btn-secondary" : "sb-btn-primary"}" data-act="log">${icon("edit")} Log this run</button>`
                : item ? `<button type="button" class="sb-btn ${workout ? "sb-btn-secondary" : "sb-btn-primary"}" data-act="toggle">${icon(done ? "checkCircle" : "check")} ${done ? "Done" : "Mark done"}</button>` : ""}
        </div>`}
        ${isCoachPlan() && !state.result ? `<p class="clients-card-note wo-hint">Logging tells your coach how it went, including anything that hurt.</p>` : ""}
        ${isCoachPlan() && !state.result && date >= isoDate(new Date()) ? `<button type="button" class="sb-btn sb-btn-tertiary wo-change" data-act="change">${icon("messageSquare")} Can't do this one? Ask for a change</button>` : ""}
        ${item && !state.result && date >= isoDate(new Date()) ? `<button type="button" class="sb-btn sb-btn-tertiary wo-change" data-act="calendar">${icon("calendar")} Add to calendar</button>` : ""}
        ${state.result ? "" : corosHtml()}`;
}

$("woBody").addEventListener("click", async event => {
    if (strengthMode) return;
    const btn = event.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "start") return startWorkoutMode();
    if (act === "log") return openLogForm();
    if (act === "change") {
        const { openChangeRequestDialog } = await import("./changeRequestDialog.js");
        return openChangeRequestDialog({ coach: { coachUid: state.program.coachUid, coachName: state.program.coachName }, planId: state.program.coachPlanId, date, dates: [date] });
    }
    if (act === "coros") return sendThisToCoros(btn);
    if (act === "calendar") {
        const day = buildDay(date, weekInputs(), isoDate(new Date()));
        const items = day.items.filter(i => i.source?.programId === programId && i.kind === "run");
        if (!items.length) return;
        const { downloadCalendar } = await import("./calendarButton.js");
        return downloadCalendar([{ days: [{ ...day, items }] }], { filename: `southbound-${date}.ics` });
    }
    if (act === "toggle") {
        const item = buildDay(date, weekInputs(), isoDate(new Date())).items.find(i => i.source?.programId === programId && i.kind === "run");
        if (!item) return;
        const nowDone = await toggleDone(item);
        refresh();
        if (nowDone) toast(`${title()} done. Nice work.`);
    }
});

// ---------- Send to COROS (js/corosSend.js) ----------

function corosHtml() {
    if (!isCorosConnected() || !sendableDate(date, isoDate(new Date()))) return "";
    const entry = entryFor(state.program, date);
    const st = sendState(entry);
    if (st === "sent") return `<p class="wo-coros is-sent">${icon("checkCircle")} On your COROS schedule. Your watch picks it up when it syncs.</p>`;
    if (st === "changed") return `<div class="wo-coros"><p>Your coach changed this since you sent it to COROS.</p><button type="button" class="sb-btn sb-btn-secondary" data-act="coros">${icon("send")} Update on COROS</button></div>`;
    if (st === "none") return `<button type="button" class="sb-btn sb-btn-tertiary wo-change" data-act="coros">${icon("send")} Send to COROS</button>`;
    return "";
}

async function sendThisToCoros(btn) {
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.textContent = "Sending to COROS…";
    try {
        const r = await sendToCoros([entryFor(state.program, date)], { today: isoDate(new Date()) });
        if (r.notes.length) await sbAlert(r.notes.join("\n\n"), { title: "COROS" });
        else toast(sendSummary(r));
        refresh();
    } catch (error) {
        toast(friendlyError(error, "send that to COROS"), { type: "error" });
        btn.disabled = false;
        btn.innerHTML = label;
    }
}

function refresh() {
    const found = findDay();
    if (found) Object.assign(state, found);
    render();
}

// ---------- Workout mode ----------

let wakeLock = null;

// "Gel now" for two minutes after each gel's time, otherwise when the next one is.
function gelCueHtml(elapsedSec) {
    const cues = gelCues(state.fuel);
    if (!cues.length) return "";
    const now = cues.find(c => elapsedSec >= c.min * 60 && elapsedSec < c.min * 60 + 120);
    if (now) return `<p class="wo-mode-gel is-now">${icon("fuel")} Gel now: ${esc(now.name)}${now.caffeine ? " (caffeine)" : ""}</p>`;
    const next = cues.find(c => c.min * 60 > elapsedSec);
    return next ? `<p class="wo-mode-gel">${icon("fuel")} Next gel at ${formatClock(next.min)}</p>` : "";
}

async function startWorkoutMode() {
    const steps = executionSteps(state.day.workout);
    if (!steps.length) return;
    let index = 0;
    let stepStart = Date.now();
    const started = Date.now();
    let timer = null;

    const overlay = document.createElement("div");
    overlay.className = "wo-mode";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Workout mode");
    document.body.appendChild(overlay);
    document.body.classList.add("wo-mode-open");
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }

    const paint = () => {
        const step = steps[index];
        const elapsed = Math.floor((Date.now() - stepStart) / 1000);
        const remaining = step.seconds ? step.seconds - elapsed : null;
        const clock = remaining !== null ? (remaining > 0 ? formatDuration(remaining) || "0:00" : "Time!") : formatDuration(elapsed) || "0:00";
        overlay.innerHTML = `
            <div class="wo-mode-top">
                <span>Step ${index + 1} of ${steps.length}</span>
                <span>${formatDuration(Math.floor((Date.now() - started) / 1000)) || "0:00"} total</span>
                <button type="button" class="wo-mode-close" data-mode="end" aria-label="End workout">${icon("close")}</button>
            </div>
            <div class="wo-mode-progress"><span style="width:${Math.round((index / steps.length) * 100)}%"></span></div>
            <div class="wo-mode-main phase-${step.phase}">
                <span class="wo-mode-phase">${esc({ warmup: "Warm up", work: "Main set", recovery: "Recovery", cooldown: "Cool down" }[step.phase])}</span>
                <h2>${esc(step.title)}</h2>
                <strong class="wo-mode-amount">${esc(step.amount)}</strong>
                ${step.target ? `<span class="wo-mode-target">${esc(step.target)}</span>` : ""}
                <span class="wo-mode-clock${remaining !== null && remaining <= 0 ? " is-over" : ""}" aria-live="off">${clock}</span>
                <span class="wo-mode-clock-label">${remaining !== null ? "left in this step" : "on this step"}</span>
            </div>
            ${gelCueHtml(Math.floor((Date.now() - started) / 1000))}
            ${steps[index + 1] ? `<p class="wo-mode-next">Next: ${esc(steps[index + 1].title)} · ${esc(steps[index + 1].amount)}${steps[index + 1].target ? ` · ${esc(steps[index + 1].target)}` : ""}</p>` : `<p class="wo-mode-next">Last step</p>`}
            <div class="wo-mode-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-mode="back"${index === 0 ? " disabled" : ""}>${icon("chevronLeft")} Back</button>
                <button type="button" class="sb-btn sb-btn-primary" data-mode="next">${index === steps.length - 1 ? `${icon("check")} Finish` : `Next step ${icon("chevronRight")}`}</button>
            </div>`;
        if (remaining === 0 && navigator.vibrate) navigator.vibrate([200, 100, 200]);
        const elapsedNow = Math.floor((Date.now() - started) / 1000);
        if (gelCues(state.fuel).some(c => c.min * 60 === elapsedNow) && navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    };

    const close = () => {
        clearInterval(timer);
        overlay.remove();
        document.body.classList.remove("wo-mode-open");
        wakeLock?.release?.().catch(() => {});
        wakeLock = null;
    };

    overlay.addEventListener("click", async event => {
        const btn = event.target.closest("[data-mode]");
        if (!btn) return;
        const what = btn.dataset.mode;
        if (what === "next") {
            if (index === steps.length - 1) {
                const total = Math.floor((Date.now() - started) / 1000);
                close();
                if (isCoachPlan()) openLogForm({ durationSec: total });
                else toast("Workout finished. Nice work.");
                return;
            }
            index++;
            stepStart = Date.now();
        } else if (what === "back" && index > 0) {
            index--;
            stepStart = Date.now();
        } else if (what === "end") {
            if (!(await sbConfirm("You can log it afterwards.", { title: "End the workout?", confirmLabel: "End workout", cancelLabel: "Keep going" }))) return;
            close();
            return;
        }
        paint();
    });

    paint();
    timer = setInterval(paint, 1000);
}

// ---------- Log this run ----------

function openLogForm(prefill = {}) {
    const r = state.result || {};
    const planned = Number(state.day.miles) || 0;
    const status = r.status || "completed";
    const d = document.createElement("dialog");
    d.className = "sb-dialog wo-log";
    d.innerHTML = `
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">How did it go?</h2>
            <div class="wo-seg" role="radiogroup" aria-label="Did you do it?">
                <label><input type="radio" name="status" value="completed"${status === "completed" ? " checked" : ""}><span>${icon("check")} Done</span></label>
                <label><input type="radio" name="status" value="skipped"${status === "skipped" ? " checked" : ""}><span>Skipped</span></label>
            </div>
            <div class="wo-done-fields"${status === "skipped" ? " hidden" : ""}>
                <div class="wo-two">
                    <label class="pw-label">Distance (mi)<input class="sb-dialog-input" name="distance" type="number" inputmode="decimal" min="0" max="200" step="0.01" value="${esc(r.distance ?? (planned || ""))}"></label>
                    <label class="pw-label">Time<input class="sb-dialog-input" name="time" type="text" inputmode="numeric" placeholder="45:30" value="${esc(r.durationSec ? formatDuration(r.durationSec) : prefill.durationSec ? formatDuration(prefill.durationSec) : "")}"></label>
                </div>
                <p class="wo-pace" data-pace></p>
                <span class="pw-label">How hard did it feel?</span>
                <div class="wo-rpe" role="radiogroup" aria-label="Effort, 1 to 10">
                    ${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<label title="${RPE_WORDS[n]}"><input type="radio" name="rpe" value="${n}"${Number(r.rpe) === n ? " checked" : ""}><span>${n}</span></label>`).join("")}
                </div>
                <p class="wo-rpe-word" data-rpe-word>${r.rpe ? RPE_WORDS[r.rpe] : "1 = very easy, 10 = all out"}</p>
            </div>
            <span class="pw-label">Any pain or discomfort?</span>
            <div class="wo-seg" role="radiogroup" aria-label="Any pain or discomfort?">
                <label><input type="radio" name="pain" value="no"${!r.pain ? " checked" : ""}><span>No</span></label>
                <label><input type="radio" name="pain" value="yes"${r.pain ? " checked" : ""}><span>Yes</span></label>
            </div>
            <label class="pw-label wo-pain-field"${r.pain ? "" : " hidden"}>Where, and how bad?<textarea class="sb-dialog-input" name="painNote" rows="2" maxlength="300" placeholder="Left Achilles, sore after the last rep">${esc(r.painNote || "")}</textarea></label>
            <label class="pw-label">Anything to tell your coach? (optional)<textarea class="sb-dialog-input" name="note" data-emoji rows="3" maxlength="1000" placeholder="Felt good until the last rep.">${esc(r.note || "")}</textarea></label>
            <p class="clients-msg clients-msg-error" data-error hidden></p>
            <div class="sb-dialog-actions">
                ${state.result ? `<button type="button" class="sb-btn sb-btn-tertiary" data-remove>Remove log</button>` : ""}
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">Save</button>
            </div>
        </form>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    const form = d.querySelector("form");
    const paceEl = d.querySelector("[data-pace]");
    const updatePace = () => {
        const dist = Number(form.distance.value);
        const secs = parseDuration(form.time.value);
        paceEl.textContent = dist > 0 && secs ? `${formatPace(secs / dist)}/mi average` : "";
    };
    form.addEventListener("input", event => {
        if (event.target.name === "status") d.querySelector(".wo-done-fields").hidden = event.target.value === "skipped";
        if (event.target.name === "pain") d.querySelector(".wo-pain-field").hidden = event.target.value !== "yes";
        if (event.target.name === "rpe") d.querySelector("[data-rpe-word]").textContent = RPE_WORDS[event.target.value];
        updatePace();
    });
    updatePace();
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.querySelector("[data-remove]")?.addEventListener("click", async () => {
        if (!(await sbConfirm("Your coach won't see it any more.", { title: "Remove this log?", confirmLabel: "Remove", danger: true }))) return;
        try {
            await deleteMyResult(state.result);
            state.result = null;
            d.close();
            refresh();
            toast("Log removed");
        } catch (error) {
            console.error(error);
            toast(friendlyError(error, "remove that"), { type: "error" });
        }
    });
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const errorEl = d.querySelector("[data-error]");
        const fd = new FormData(form);
        const skipped = fd.get("status") === "skipped";
        const timeText = String(fd.get("time") || "").trim();
        const durationSec = timeText ? parseDuration(timeText) : null;
        if (!skipped && timeText && durationSec === null) {
            errorEl.textContent = "Enter the time like 45:30 or 1:05:00.";
            errorEl.hidden = false;
            form.time.focus();
            return;
        }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            state.result = await saveMyResult({
                planId: state.program.coachPlanId,
                coachUid: state.program.coachUid,
                date,
                clientName: state.user?.displayName,
                planVersion: state.program.coachVersion,
                title: title(),
                plannedMiles: Number(state.day.miles) || 0,
                status: skipped ? "skipped" : "completed",
                distance: skipped ? null : fd.get("distance"),
                durationSec,
                rpe: skipped ? null : fd.get("rpe"),
                pain: fd.get("pain") === "yes",
                painNote: fd.get("painNote"),
                note: fd.get("note")
            }, state.result);
            d.close();
            refresh();
            toast(skipped ? "Saved. Your coach will see you skipped it." : `${title()} logged. Nice work.`);
        } catch (error) {
            console.error("Saving the run failed:", error);
            errorEl.textContent = friendlyError(error, "save that");
            errorEl.hidden = false;
            btn.disabled = false;
        }
    });
    d.showModal();
}

// ---------- Load ----------

let started = false;

listenForAuth(async user => {
    if (!user || started) return;
    started = true;
    state.user = user;
    const found = programId && date ? findDay() : null;
    $("woLoading").hidden = true;
    if (strengthMode && found?.day?.strength?.exercises?.length) {
        const { mountStrengthSession } = await import("./strengthSession.js");
        return mountStrengthSession({ found, date, user, openLog: params.get("log") === "1" });
    }
    if (strengthMode || !found || !found.day.type || found.day.type === "rest") {
        $("woBody").innerHTML = `<div class="clients-card">${emptyHtml({ iconName: "calendar", title: "Nothing planned here", text: "This workout isn't on your plan any more. Your coach may have moved it.", actionHref: "plan.html", actionLabel: "See your week" })}</div>`;
        return;
    }
    Object.assign(state, found);
    state.fuel = currentFuel();
    document.title = `${title()} | Southbound`;
    render();
    import("./icons.js").then(m => m.hydrate());
    if (isCoachPlan()) {
        try {
            const results = await listMyResults(state.program.coachPlanId);
            state.result = results.find(r => r.date === date && !isStrengthResult(r)) || null;
        } catch (error) {
            console.warn("Southbound: workout results unavailable.", error?.code || error);
        }
        render();
        if (params.get("log") === "1" && !state.result) openLogForm();
    }
});
