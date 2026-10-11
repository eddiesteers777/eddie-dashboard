/* ==========================================
   Southbound — the set-by-set strength screen

   One full-screen view for doing a strength workout set by set, the same
   for a client on the coach's session (js/strengthSession.js) and for
   anyone starting a workout on the Strength page
   (js/strengthWorkoutMode.js): the exercise, the target, "Last time",
   the coach's note, big weight / reps (or seconds) boxes to adjust,
   Done set / Skip set, then a rest timer (+30 sec, Next set) with what's
   next; the total time and progress on top; End asks first. The next
   set of the same exercise starts from the weight just lifted.

   runSets({
     steps,          [{ phase, name, target, targetShort, label, setNo, of,
                        last, note, extra (html), inputs: [{ key, label, value,
                        placeholder, inputmode, step, min, max }],
                        restAfter (sec), carry (key), plates, done }]
     startIndex, startedAt,
     onDone(step, values, index), onSkip(step, index),
     onFinish({ durationSec, done }),   the last set, or End after some sets
     onClose({ done }),                 End with nothing done
     platesHtml(step, values)           optional: a Plates button for steps with plates
   })
   Its look is css/workout.css (.wo-mode / .st-mode), loaded here so it
   works on any page.
========================================== */

import { icon } from "./icons.js";
import { sbConfirm } from "./ui.js";
import { formatDuration } from "./runWorkout.js";
import { restText } from "./strengthWorkout.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function ensureStyles() {
    if (typeof document === "undefined") return;
    if ([...document.styleSheets].some(s => /css\/workout\.css/.test(s.href || "")) || document.querySelector('link[href$="css/workout.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/workout.css";
    document.head.appendChild(link);
}

let wakeLock = null;

export async function runSets({
    steps, startIndex = 0, startedAt = Date.now(), ariaLabel = "Strength session",
    onDone = () => {}, onSkip = () => {}, onFinish = () => {}, onClose = () => {}, platesHtml = null
} = {}) {
    if (!steps?.length) return null;
    ensureStyles();
    const started = startedAt;
    let index = Math.min(Math.max(0, startIndex), steps.length - 1);
    let resting = null;   // { until }
    let timer = null;
    let platesOpen = false;
    let buzzed = false;

    const overlay = document.createElement("div");
    overlay.className = "wo-mode st-mode";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", ariaLabel);
    document.body.appendChild(overlay);
    document.body.classList.add("wo-mode-open");
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }

    const doneCount = () => steps.filter(s => s.done).length;
    const total = () => `${formatDuration(Math.floor((Date.now() - started) / 1000)) || "0:00"} total`;
    const top = () => `
        <div class="wo-mode-top">
            <span>Set ${index + 1} of ${steps.length}</span>
            <span>${total()}</span>
            <button type="button" class="wo-mode-close" data-mode="end" aria-label="End session">${icon("close")}</button>
        </div>
        <div class="wo-mode-progress"><span style="width:${Math.round((doneCount() / steps.length) * 100)}%"></span></div>`;

    const values = () => Object.fromEntries([...overlay.querySelectorAll("[data-in]")].map(i => [i.dataset.in, i.value]));

    const stepHtml = () => {
        const step = steps[index];
        const next = steps[index + 1];
        return `
            ${top()}
            <div class="wo-mode-main phase-work st-mode-main">
                <span class="wo-mode-phase">${esc(step.phase)}</span>
                <h2>${esc(step.name)}</h2>
                <span class="wo-mode-target">${esc(step.target)}</span>
                ${step.last ? `<p class="st-mode-last">${esc(step.last)}</p>` : ""}
                ${step.note ? `<p class="st-mode-note">${esc(step.note)}</p>` : ""}
                <div class="st-mode-inputs${step.inputs.length === 1 ? " is-one" : ""}">
                    ${step.inputs.map(i => `<label>${esc(i.label)}<input class="st-big-input" type="number" inputmode="${i.inputmode || "decimal"}" min="${i.min ?? 0}" max="${i.max ?? 2000}" step="${i.step || "any"}" data-in="${esc(i.key)}" value="${esc(i.value ?? "")}"${i.placeholder ? ` placeholder="${esc(i.placeholder)}"` : ""}></label>`).join("")}
                </div>
                ${platesHtml && step.plates ? `<button type="button" class="sb-btn sb-btn-tertiary st-mode-tool" data-mode="plates" aria-expanded="${platesOpen}">${icon("dumbbell")} Plates</button>
                    <div class="st-mode-plates"${platesOpen ? "" : " hidden"}>${platesOpen ? platesHtml(step, values()) : ""}</div>` : ""}
                ${step.extra || ""}
            </div>
            <p class="wo-mode-next">${next ? `Next: ${esc(next.name)} · set ${next.setNo}${step.restAfter ? ` after ${restText(step.restAfter)} rest` : ""}` : "Last set"}</p>
            <div class="wo-mode-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-mode="skip">Skip set</button>
                <button type="button" class="sb-btn sb-btn-primary" data-mode="done">${icon("check")} ${next ? "Done set" : "Finish"}</button>
            </div>`;
    };

    const restHtml = () => {
        const left = Math.ceil((resting.until - Date.now()) / 1000);
        const next = steps[index];
        return `
            ${top()}
            <div class="wo-mode-main phase-recovery">
                <span class="wo-mode-phase">Rest</span>
                <span class="wo-mode-clock${left <= 0 ? " is-over" : ""}" aria-live="off">${left > 0 ? formatDuration(left) || "0:00" : "Go!"}</span>
                <span class="wo-mode-clock-label">${left > 0 ? "until your next set" : "rest is up"}</span>
            </div>
            <p class="wo-mode-next">Next: ${esc(next.label)} ${esc(next.name)} · set ${next.setNo} of ${next.of} · ${esc(next.targetShort ?? next.target)}</p>
            <div class="wo-mode-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-mode="more">+30 sec</button>
                <button type="button" class="sb-btn sb-btn-primary" data-mode="go">Next set ${icon("chevronRight")}</button>
            </div>`;
    };

    const draw = () => { overlay.innerHTML = resting ? restHtml() : stepHtml(); };
    const paint = () => {
        if (resting && !buzzed && Date.now() >= resting.until) {
            buzzed = true;
            try { navigator.vibrate?.([200, 100, 200]); } catch { /* no vibration */ }
        }
        // Don't rebuild the boxes under the thumb every second: only the clock moves.
        if (!resting && overlay.querySelector("[data-in]")) {
            const clock = overlay.querySelector(".wo-mode-top span:nth-child(2)");
            if (clock) clock.textContent = total();
            return;
        }
        draw();
    };

    const close = () => {
        clearInterval(timer);
        overlay.remove();
        document.body.classList.remove("wo-mode-open");
        wakeLock?.release?.().catch(() => {});
        wakeLock = null;
    };
    const finish = () => {
        const durationSec = Math.floor((Date.now() - started) / 1000);
        close();
        return onFinish({ durationSec, done: doneCount() });
    };
    const advance = () => {
        const step = steps[index];
        index++;
        platesOpen = false;
        if (index >= steps.length) return finish();
        if (step.restAfter) { resting = { until: Date.now() + step.restAfter * 1000 }; buzzed = false; }
        draw();
    };

    overlay.addEventListener("input", event => {
        if (platesOpen && event.target.closest?.('[data-in="weight"]')) {
            const box = overlay.querySelector(".st-mode-plates");
            if (box) box.innerHTML = platesHtml(steps[index], values());
        }
    });

    overlay.addEventListener("click", async event => {
        const btn = event.target.closest("[data-mode]");
        if (!btn) return;
        const what = btn.dataset.mode;
        if (what === "done" || what === "skip") {
            const step = steps[index];
            if (what === "done") {
                const got = values();
                step.done = true;
                await onDone(step, got, index);
                // The next set of this exercise starts from what was just lifted.
                if (step.carry && got.weight !== undefined && got.weight !== "") {
                    const later = steps.slice(index + 1).find(s => s.carry === step.carry && !s.done);
                    const box = later?.inputs?.find(i => i.key === "weight");
                    if (box) box.value = got.weight;
                }
            } else {
                step.done = false;
                await onSkip(step, index);
            }
            return advance();
        }
        if (what === "plates") { platesOpen = !platesOpen; const keep = values(); draw(); restore(keep); return; }
        if (what === "more" && resting) { resting.until += 30000; buzzed = false; return draw(); }
        if (what === "go") { resting = null; return draw(); }
        if (what === "end") {
            if (!(await sbConfirm(doneCount() ? "What you've done so far goes into the log." : "You can log it afterwards.", { title: "End the session?", confirmLabel: "End session", cancelLabel: "Keep going" }))) return;
            if (doneCount()) return finish();
            close();
            onClose({ done: 0 });
        }
    });

    // Keep what was typed when the screen redraws (opening Plates).
    const restore = keep => Object.entries(keep).forEach(([k, v]) => {
        const input = overlay.querySelector(`[data-in="${k}"]`);
        if (input) input.value = v;
    });

    draw();
    timer = setInterval(() => { if (resting) draw(); else paint(); }, 1000);
    return { overlay, close };
}
