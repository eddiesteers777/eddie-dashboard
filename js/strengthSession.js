/* ==========================================
   Southbound — one coach strength session
   (workout.html?program=...&date=...&kind=strength)

   The client's view of the coach's strength prescription (day.strength,
   js/strengthWorkout.js):
     - the session: title, minutes, goal, coach notes, every exercise
       numbered 1, 2, 3A/3B (supersets), sets x reps @ weight, RPE /
       reps in reserve, rest, the coach's note, a Demo link
     - Start session: full screen, set by set. Each set shows the target
       with weight and reps filled in to adjust; "Done set" starts the
       rest timer. Supersets alternate. At the end the log opens.
     - Log it: done / skipped, every set (weight x reps), effort 1-10,
       pain, a note. Saved to workoutResults (kind "strength",
       js/workoutResults.js); the coach sees planned vs actual and can
       reply on it.
     - their log, planned vs actual, and the coach's reply
   Started by js/workoutPage.js, which finds the day.
========================================== */

import {
    sessionSteps, exerciseLabels, exerciseGroups, setsText, targetText, restText, blankActual,
    compareStrength, repsNumber
} from "./strengthWorkout.js";
import { listMyResults, saveMyResult, deleteMyResult, isStrengthResult } from "./workoutResults.js";
import { shortDay } from "./coachingPlanModel.js";
import { parseDuration, formatDuration } from "./runWorkout.js";
import { toast, sbConfirm, friendlyError } from "./ui.js";
import { toMillis } from "./clientSummary.js";
import { icon } from "./icons.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const RPE_WORDS = { 1: "Very easy", 2: "Easy", 3: "Easy", 4: "Comfortable", 5: "Steady", 6: "Moderate", 7: "Hard", 8: "Very hard", 9: "Near max", 10: "All out" };

const state = { program: null, day: null, week: null, weekIndex: 0, lift: null, result: null, user: null, date: "" };

const coachName = () => state.program.coachName || "your coach";
const hydrate = () => import("./icons.js").then(m => m.hydrate());

// ---------- Page ----------

function demoLink(ex) {
    return ex.video ? `<a class="wo-demo" href="${esc(ex.video)}" target="_blank" rel="noopener noreferrer">${icon("play")} Demo</a>` : "";
}

function exercisesHtml(lift) {
    const labels = exerciseLabels(lift.exercises);
    return exerciseGroups(lift.exercises).map(group => `
        <div class="st-group${group.length > 1 ? " is-superset" : ""}">
            ${group.length > 1 ? `<span class="st-group-tag">Superset · alternate sets</span>` : ""}
            ${group.map((i, k) => {
                const ex = k < group.length - 1 ? { ...lift.exercises[i], restSec: 0 } : lift.exercises[i];
                return `
                <div class="st-ex">
                    <span class="st-ex-num">${esc(labels[i])}</span>
                    <div class="st-ex-body">
                        <div class="st-ex-top"><strong>${esc(ex.name)}</strong>${demoLink(ex)}</div>
                        <span class="st-ex-rx">${esc(setsText(ex))}</span>
                        ${targetText(ex) ? `<span class="st-ex-target">${esc(targetText(ex))}${group.length > 1 && k === group.length - 1 ? " after each round" : ""}</span>` : ""}
                        ${ex.note ? `<p class="st-ex-note">${esc(ex.note)}</p>` : ""}
                    </div>
                </div>`;
            }).join("")}
        </div>`).join("");
}

function coachReplyHtml(result) {
    if (!result.coachComment) return `<p class="clients-card-note">Your coach sees this${result.pain ? " and was told about the pain" : ""}.</p>`;
    const when = toMillis(result.coachCommentAt);
    return `<div class="wo-reply"><span>${icon("send")} ${esc(coachName())}${when ? ` · ${new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span><p>${esc(result.coachComment)}</p></div>`;
}

function resultHtml(result) {
    if (result.status === "skipped") {
        return `
            <section class="clients-card wo-result is-skipped">
                <h2>${icon("info")} Skipped</h2>
                ${result.note ? `<p class="wo-note">"${esc(result.note)}"</p>` : ""}
                ${coachReplyHtml(result)}
                <div class="wo-actions"><button type="button" class="sb-btn sb-btn-secondary" data-act="log">Edit</button></div>
            </section>`;
    }
    const cmp = compareStrength(state.lift, result.exercises);
    return `
        <section class="clients-card wo-result">
            <h2>${icon("checkCircle")} Done</h2>
            <div class="wo-compare">
                <div><span>Sets</span><strong>${cmp.doneSets}/${cmp.plannedSets}</strong><small>${cmp.pct}% of plan</small></div>
                <div><span>Time</span><strong>${result.durationSec ? formatDuration(result.durationSec) : "—"}</strong></div>
                <div><span>Effort</span><strong>${result.rpe ? `${result.rpe}/10` : "—"}</strong>${result.rpe ? `<small>${esc(RPE_WORDS[result.rpe])}</small>` : ""}</div>
            </div>
            ${strengthTableHtml(cmp)}
            ${result.pain ? `<p class="wo-pain">${icon("alertTriangle")} Pain or discomfort${result.painNote ? `: ${esc(result.painNote)}` : ""}</p>` : ""}
            ${result.note ? `<p class="wo-note">"${esc(result.note)}"</p>` : ""}
            ${coachReplyHtml(result)}
            <div class="wo-actions"><button type="button" class="sb-btn sb-btn-secondary" data-act="log">Edit</button></div>
        </section>`;
}

// Planned vs actual, one row per exercise. Shared with the coach's hub.
export function strengthTableHtml(cmp) {
    return `
        <div class="st-table" role="table" aria-label="Planned and actual sets">
            <div class="st-row st-row-head" role="row"><span role="columnheader">Exercise</span><span role="columnheader">Planned</span><span role="columnheader">Done</span></div>
            ${cmp.rows.map(r => `
            <div class="st-row${r.change ? ` is-${r.change}` : ""}${r.setsPlanned && !r.setsDone ? " is-missed" : ""}" role="row">
                <span role="cell"><b>${esc(r.label)}</b> ${esc(r.name)}</span>
                <span role="cell">${esc(r.planned)}</span>
                <span role="cell">${esc(r.actual)}</span>
            </div>`).join("")}
        </div>`;
}

function render() {
    const { lift, week, program } = state;
    $("woBody").innerHTML = `
        <section class="wo-head">
            <span class="wo-eyebrow">${esc(shortDay(state.date))} · Week ${week.week ?? state.weekIndex + 1}${week.phase ? ` · ${esc(week.phase)}` : ""}</span>
            <div class="wo-title">
                <h1>${esc(lift.title)}</h1>
                ${lift.minutes ? `<span class="wk-big">${lift.minutes}<small> min</small></span>` : ""}
            </div>
            <span class="wo-meta">From ${esc(coachName())} · ${esc(program.name || "")}${lift.goal ? ` · ${esc(lift.goal)}` : ""}</span>
        </section>

        ${state.result ? resultHtml(state.result) : ""}

        ${lift.notes ? `<section class="wo-cue">${icon("send")}<div><span>From ${esc(coachName())}</span><p>${esc(lift.notes)}</p></div></section>` : ""}

        <section class="clients-card">
            <h2>The session</h2>
            ${exercisesHtml(lift)}
        </section>

        ${state.result ? "" : `
        <div class="wo-actions wo-main-actions">
            <button type="button" class="sb-btn sb-btn-primary" data-act="start">${icon("play")} Start session</button>
            <button type="button" class="sb-btn sb-btn-secondary" data-act="log">${icon("edit")} Log it</button>
        </div>
        <p class="clients-card-note wo-hint">Start session walks you through every set with a rest timer. Already done it? Log it instead.</p>
        ${state.date >= new Date().toLocaleDateString("en-CA") ? `<button type="button" class="sb-btn sb-btn-tertiary wo-change" data-act="change">${icon("messageSquare")} Can't do this one? Ask for a change</button>` : ""}`}`;
    hydrate();
}

// ---------- Session mode ----------

let wakeLock = null;

async function startSession() {
    const steps = sessionSteps(state.lift);
    if (!steps.length) return;
    const actual = blankActual(state.lift);
    const labels = exerciseLabels(state.lift.exercises);
    const started = Date.now();
    let index = 0;
    let resting = null;   // { until, next }
    let timer = null;

    const overlay = document.createElement("div");
    overlay.className = "wo-mode st-mode";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Strength session");
    document.body.appendChild(overlay);
    document.body.classList.add("wo-mode-open");
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }

    const doneCount = () => actual.reduce((n, ex) => n + ex.sets.filter(s => s.done).length, 0);
    const top = () => `
        <div class="wo-mode-top">
            <span>Set ${index + 1} of ${steps.length}</span>
            <span>${formatDuration(Math.floor((Date.now() - started) / 1000)) || "0:00"} total</span>
            <button type="button" class="wo-mode-close" data-mode="end" aria-label="End session">${icon("close")}</button>
        </div>
        <div class="wo-mode-progress"><span style="width:${Math.round((doneCount() / steps.length) * 100)}%"></span></div>`;

    const stepHtml = () => {
        const step = steps[index];
        const ex = state.lift.exercises[step.ex];
        const set = actual[step.ex].sets[step.set - 1];
        const next = steps[index + 1];
        return `
            ${top()}
            <div class="wo-mode-main phase-work st-mode-main">
                <span class="wo-mode-phase">${esc(labels[step.ex])} · Set ${step.set} of ${step.of}</span>
                <h2>${esc(ex.name)}</h2>
                <span class="wo-mode-target">${esc(ex.reps)}${ex.weight ? ` @ ${ex.weight} lb` : ""}${ex.rpe ? ` · RPE ${ex.rpe}` : ""}${Number.isInteger(ex.rir) ? ` · ${ex.rir} in reserve` : ""}</span>
                ${ex.note ? `<p class="st-mode-note">${esc(ex.note)}</p>` : ""}
                <div class="st-mode-inputs">
                    <label>Weight (lb)<input class="st-big-input" type="number" inputmode="decimal" min="0" max="2000" step="2.5" data-in="weight" value="${esc(set.weight ?? "")}" placeholder="—"></label>
                    <label>Reps<input class="st-big-input" type="number" inputmode="numeric" min="0" max="1000" data-in="reps" value="${esc(set.reps ?? "")}"></label>
                </div>
                ${demoLink(ex)}
            </div>
            <p class="wo-mode-next">${next ? `Next: ${esc(state.lift.exercises[next.ex].name)} · set ${next.set}${step.restAfter ? ` after ${restText(step.restAfter)} rest` : ""}` : "Last set"}</p>
            <div class="wo-mode-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-mode="skip">Skip set</button>
                <button type="button" class="sb-btn sb-btn-primary" data-mode="done">${icon("check")} ${next ? "Done set" : "Finish"}</button>
            </div>`;
    };

    const restHtml = () => {
        const left = Math.ceil((resting.until - Date.now()) / 1000);
        const next = steps[index];
        const ex = state.lift.exercises[next.ex];
        return `
            ${top()}
            <div class="wo-mode-main phase-recovery">
                <span class="wo-mode-phase">Rest</span>
                <span class="wo-mode-clock${left <= 0 ? " is-over" : ""}" aria-live="off">${left > 0 ? formatDuration(left) || "0:00" : "Go!"}</span>
                <span class="wo-mode-clock-label">${left > 0 ? "until your next set" : "rest is up"}</span>
            </div>
            <p class="wo-mode-next">Next: ${esc(labels[next.ex])} ${esc(ex.name)} · set ${next.set} of ${next.of} · ${esc(ex.reps)}${ex.weight ? ` @ ${ex.weight} lb` : ""}</p>
            <div class="wo-mode-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-mode="more">+30 sec</button>
                <button type="button" class="sb-btn sb-btn-primary" data-mode="go">Next set ${icon("chevronRight")}</button>
            </div>`;
    };

    let buzzed = false;
    const paint = () => {
        if (resting && !buzzed && Date.now() >= resting.until) {
            buzzed = true;
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        // Don't rebuild the inputs under the athlete's thumb every second.
        if (!resting && overlay.querySelector("[data-in]")) {
            const clock = overlay.querySelector(".wo-mode-top span:nth-child(2)");
            if (clock) clock.textContent = `${formatDuration(Math.floor((Date.now() - started) / 1000)) || "0:00"} total`;
            return;
        }
        overlay.innerHTML = resting ? restHtml() : stepHtml();
    };

    const close = () => {
        clearInterval(timer);
        overlay.remove();
        document.body.classList.remove("wo-mode-open");
        wakeLock?.release?.().catch(() => {});
        wakeLock = null;
    };

    const finish = () => {
        const total = Math.floor((Date.now() - started) / 1000);
        close();
        openLogForm({ actual, durationSec: total });
    };

    const advance = () => {
        const step = steps[index];
        index++;
        if (index >= steps.length) return finish();
        if (step.restAfter) { resting = { until: Date.now() + step.restAfter * 1000 }; buzzed = false; }
        overlay.innerHTML = resting ? restHtml() : stepHtml();
    };

    overlay.addEventListener("click", async event => {
        const btn = event.target.closest("[data-mode]");
        if (!btn) return;
        const what = btn.dataset.mode;
        if (what === "done" || what === "skip") {
            const step = steps[index];
            const set = actual[step.ex].sets[step.set - 1];
            if (what === "done") {
                const w = overlay.querySelector('[data-in="weight"]').value;
                const r = overlay.querySelector('[data-in="reps"]').value;
                set.weight = w === "" ? null : Number(w);
                set.reps = r === "" ? repsNumber(state.lift.exercises[step.ex].reps) : Number(r);
                set.done = true;
                // The next set of this exercise starts from what they just lifted.
                const later = actual[step.ex].sets[step.set];
                if (later && !later.done && set.weight) later.weight = set.weight;
            } else {
                set.done = false;
            }
            return advance();
        }
        if (what === "more" && resting) { resting.until += 30000; buzzed = false; return paint(); }
        if (what === "go") { resting = null; overlay.innerHTML = stepHtml(); return; }
        if (what === "end") {
            if (!(await sbConfirm(doneCount() ? "What you've done so far goes into the log." : "You can log it afterwards.", { title: "End the session?", confirmLabel: "End session", cancelLabel: "Keep going" }))) return;
            if (doneCount()) return finish();
            close();
        }
    });

    overlay.innerHTML = stepHtml();
    timer = setInterval(() => { if (resting) overlay.innerHTML = restHtml(); else paint(); }, 1000);
}

// ---------- Log it ----------

// A saved log back in plan order, with not-done sets filled in.
function actualFromResult(result) {
    const base = blankActual(state.lift);
    if (!result?.exercises?.length) return base;
    const used = new Set();
    return base.map((ex, i) => {
        let j = result.exercises[i]?.name === ex.name ? i : result.exercises.findIndex((x, k) => !used.has(k) && x.name === ex.name);
        if (j < 0 || used.has(j)) return { ...ex, sets: ex.sets.map(s => ({ ...s, done: false })) };
        used.add(j);
        const logged = result.exercises[j].sets || [];
        const sets = ex.sets.map((s, k) => (logged[k] ? { weight: logged[k].weight, reps: logged[k].reps, done: true } : { ...s, done: false }));
        for (let k = ex.sets.length; k < logged.length; k++) sets.push({ weight: logged[k].weight, reps: logged[k].reps, done: true });
        return { ...ex, sets };
    });
}

function openLogForm({ actual = null, durationSec = null } = {}) {
    const r = state.result || {};
    const work = actual || actualFromResult(state.result);
    const status = actual ? "completed" : r.status || "completed";
    const labels = exerciseLabels(state.lift.exercises);
    const d = document.createElement("dialog");
    d.className = "sb-dialog wo-log st-log";
    d.innerHTML = `
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">How did it go?</h2>
            <div class="wo-seg" role="radiogroup" aria-label="Did you do it?">
                <label><input type="radio" name="status" value="completed"${status === "completed" ? " checked" : ""}><span>${icon("check")} Done</span></label>
                <label><input type="radio" name="status" value="skipped"${status === "skipped" ? " checked" : ""}><span>Skipped</span></label>
            </div>
            <div class="wo-done-fields"${status === "skipped" ? " hidden" : ""}>
                <span class="pw-label">What you lifted</span>
                <div class="st-log-list">
                    ${work.map((ex, i) => `
                    <fieldset class="st-log-ex">
                        <legend><b>${esc(labels[i] || "+")}</b> ${esc(ex.name)} <small>${esc(state.lift.exercises[i] ? setsText(state.lift.exercises[i]) : "")}</small></legend>
                        ${ex.sets.map((s, k) => `
                        <div class="st-log-set">
                            <label class="st-log-check"><input type="checkbox" data-done="${i}.${k}"${s.done ? " checked" : ""} aria-label="${esc(ex.name)} set ${k + 1} done"> Set ${k + 1}</label>
                            <input type="number" inputmode="decimal" min="0" max="2000" step="2.5" data-weight="${i}.${k}" value="${esc(s.weight ?? "")}" placeholder="lb" aria-label="${esc(ex.name)} set ${k + 1} weight">
                            <span class="st-log-x">×</span>
                            <input type="number" inputmode="numeric" min="0" max="1000" data-reps="${i}.${k}" value="${esc(s.reps ?? "")}" placeholder="reps" aria-label="${esc(ex.name)} set ${k + 1} reps">
                        </div>`).join("")}
                    </fieldset>`).join("")}
                </div>
                <p class="clients-card-note">Tick the sets you did. Leave weight blank for bodyweight.</p>
                <label class="pw-label">Time (optional)<input class="sb-dialog-input" name="time" type="text" inputmode="numeric" placeholder="45:00" value="${esc(r.durationSec ? formatDuration(r.durationSec) : durationSec ? formatDuration(durationSec) : "")}"></label>
                <span class="pw-label">How hard did the session feel?</span>
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
            <label class="pw-label wo-pain-field"${r.pain ? "" : " hidden"}>Where, and how bad?<textarea class="sb-dialog-input" name="painNote" rows="2" maxlength="300" placeholder="Right knee, sore on the split squats">${esc(r.painNote || "")}</textarea></label>
            <label class="pw-label">Anything to tell your coach? (optional)<textarea class="sb-dialog-input" name="note" rows="3" maxlength="1000" placeholder="Deadlifts felt strong.">${esc(r.note || "")}</textarea></label>
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
    form.addEventListener("input", event => {
        const t = event.target;
        if (t.name === "status") d.querySelector(".wo-done-fields").hidden = t.value === "skipped";
        if (t.name === "pain") d.querySelector(".wo-pain-field").hidden = t.value !== "yes";
        if (t.name === "rpe") d.querySelector("[data-rpe-word]").textContent = RPE_WORDS[t.value];
        // Typing a number into a set means it was done.
        const key = t.dataset.weight || t.dataset.reps;
        if (key && t.value !== "") { const box = d.querySelector(`[data-done="${key}"]`); if (box) box.checked = true; }
    });
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.querySelector("[data-remove]")?.addEventListener("click", async () => {
        if (!(await sbConfirm("Your coach won't see it any more.", { title: "Remove this log?", confirmLabel: "Remove", danger: true }))) return;
        try {
            await deleteMyResult(state.result);
            state.result = null;
            d.close();
            render();
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
        const minutes = /^\d{1,3}$/.test(timeText) ? Number(timeText) * 60 : null;
        const durationSecValue = timeText ? (minutes ?? parseDuration(timeText)) : null;
        if (!skipped && timeText && durationSecValue === null) {
            errorEl.textContent = "Enter the time like 45:00, or just minutes.";
            errorEl.hidden = false;
            return;
        }
        const exercises = work.map((ex, i) => ({
            name: ex.name,
            sets: ex.sets.map((s, k) => ({
                weight: d.querySelector(`[data-weight="${i}.${k}"]`).value,
                reps: d.querySelector(`[data-reps="${i}.${k}"]`).value,
                done: d.querySelector(`[data-done="${i}.${k}"]`).checked
            }))
        }));
        if (!skipped && !exercises.some(ex => ex.sets.some(s => s.done))) {
            errorEl.textContent = "Tick at least one set you did, or choose Skipped.";
            errorEl.hidden = false;
            return;
        }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            state.result = await saveMyResult({
                kind: "strength",
                planId: state.program.coachPlanId,
                coachUid: state.program.coachUid,
                date: state.date,
                clientName: state.user?.displayName,
                planVersion: state.program.coachVersion,
                title: state.lift.title,
                plannedMiles: 0,
                status: skipped ? "skipped" : "completed",
                durationSec: skipped ? null : durationSecValue,
                rpe: skipped ? null : fd.get("rpe"),
                pain: fd.get("pain") === "yes",
                painNote: fd.get("painNote"),
                note: fd.get("note"),
                exercises
            }, state.result);
            d.close();
            render();
            toast(skipped ? "Saved. Your coach will see you skipped it." : `${state.lift.title} logged. Nice work.`);
        } catch (error) {
            console.error("Saving the session failed:", error);
            errorEl.textContent = friendlyError(error, "save that");
            errorEl.hidden = false;
            btn.disabled = false;
        }
    });
    d.showModal();
}

// ---------- Start ----------

export async function mountStrengthSession({ found, date, user, openLog }) {
    Object.assign(state, found, { lift: found.day.strength, date, user });
    document.title = `${state.lift.title} | Southbound`;
    $("woBody").addEventListener("click", event => {
        const btn = event.target.closest("[data-act]");
        if (!btn) return;
        if (btn.dataset.act === "start") startSession();
        if (btn.dataset.act === "log") openLogForm();
        if (btn.dataset.act === "change") {
            import("./changeRequestDialog.js").then(({ openChangeRequestDialog }) => openChangeRequestDialog({
                coach: { coachUid: state.program.coachUid, coachName: state.program.coachName },
                planId: state.program.coachPlanId, date: state.date, dates: [state.date]
            }));
        }
    });
    render();
    try {
        const results = await listMyResults(state.program.coachPlanId);
        state.result = results.find(r => r.date === date && isStrengthResult(r)) || null;
    } catch (error) {
        console.warn("Southbound: workout results unavailable.", error?.code || error);
    }
    render();
    if (openLog && !state.result) openLogForm();
}
