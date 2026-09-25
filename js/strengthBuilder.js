/* ==========================================
   Southbound — the coach's strength session builder

   The "Strength" panel under a day in the plan editor
   (js/planWorkspace.js): title, minutes, goal, coach notes, then the
   exercises (name, sets x reps, weight, RPE / reps in reserve, rest,
   superset with the one above, a note, a demo video link). "Start from"
   fills it from a Southbound library workout. The raw form values are
   read back with readStrengthBuilder() and cleaned by sanitizeStrength()
   (js/strengthWorkout.js).

   Demo links the coach adds are remembered by exercise name
   (coach-exercise-videos, cloud-synced) and filled in next time.
========================================== */

import { BUILT_IN_WORKOUTS } from "./strengthLibraryData.js";
import { sanitizeStrength, exerciseLabels, strengthSummary, MAX_EXERCISES } from "./strengthWorkout.js";
import { icon } from "./icons.js";

const VIDEOS_KEY = "coach-exercise-videos";
const REST_CHOICES = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const restLabel = s => (!s ? "No rest" : s < 60 ? `${s} sec` : s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s / 60} min`);

export const EXERCISE_NAMES = [...new Set(BUILT_IN_WORKOUTS.flatMap(w => (w.exercises || []).map(e => e.name)))].sort();

export function blankExercise() {
    return { name: "", sets: 3, reps: "8", weight: "", rpe: "", rir: "", restSec: 90, superset: false, note: "", video: "" };
}

export function startingStrength(day) {
    if (day?.strength) return JSON.parse(JSON.stringify(day.strength));
    return { title: day?.session && day.type === "strength" ? day.session : "Strength", minutes: "", goal: "", notes: "", exercises: [blankExercise()] };
}

// A Southbound library workout as a starting point.
export function fromTemplate(id, current) {
    const w = BUILT_IN_WORKOUTS.find(x => x.id === id);
    if (!w) return current;
    return {
        title: w.name,
        minutes: w.minutes || "",
        goal: w.goal || current.goal || "",
        notes: current.notes || "",
        exercises: (w.exercises || []).slice(0, MAX_EXERCISES).map(e => ({
            ...blankExercise(),
            name: e.name, sets: e.sets || 3, reps: String(e.reps ?? (e.duration ? `${e.duration} sec` : 8)),
            restSec: e.restSeconds ?? 90, video: rememberedVideo(e.name)
        }))
    };
}

function loadVideos() {
    try { return JSON.parse(localStorage.getItem(VIDEOS_KEY) || "{}") || {}; } catch { return {}; }
}

export function rememberedVideo(name) {
    return loadVideos()[String(name || "").trim().toLowerCase()] || "";
}

// Keep the demo links from a cleaned session for next time.
export function rememberVideos(clean) {
    const videos = loadVideos();
    let changed = false;
    for (const ex of clean?.exercises || []) {
        const key = ex.name.toLowerCase();
        if (ex.video && videos[key] !== ex.video) { videos[key] = ex.video; changed = true; }
    }
    if (!changed) return;
    try {
        localStorage.setItem(VIDEOS_KEY, JSON.stringify(videos));
        import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
    } catch {}
}

function exerciseHtml(ex, i, count, label) {
    const rest = Number(ex.restSec ?? 90);
    const rests = REST_CHOICES.includes(rest) ? REST_CHOICES : [...REST_CHOICES, rest].sort((a, b) => a - b);
    return `
        <div class="sb-ex${ex.superset && i > 0 ? " is-paired" : ""}" data-sb-ex="${i}">
            <div class="sb-ex-row">
                <span class="sb-ex-num">${esc(label || i + 1)}</span>
                <input data-sb="exercises.${i}.name" type="text" maxlength="80" list="sbExerciseNames" value="${esc(ex.name)}" placeholder="Exercise (e.g. Trap Bar Deadlift)" aria-label="Exercise ${i + 1} name" class="sb-ex-name">
                ${i > 0 ? `<button type="button" class="sb-btn sb-btn-icon" data-act="sb-move-up" data-ex="${i}" aria-label="Move exercise ${i + 1} up">${icon("chevronUp")}</button>` : ""}
                ${count > 1 ? `<button type="button" class="sb-btn sb-btn-icon" data-act="sb-remove-ex" data-ex="${i}" aria-label="Remove exercise ${i + 1}">${icon("trash")}</button>` : ""}
            </div>
            <div class="sb-ex-row sb-ex-rx">
                <label>Sets<input data-sb="exercises.${i}.sets" type="number" min="1" max="20" value="${esc(ex.sets)}"></label>
                <label>Reps<input data-sb="exercises.${i}.reps" type="text" maxlength="12" value="${esc(ex.reps)}" placeholder="8, 8/leg, 30 sec"></label>
                <label>Weight (lb)<input data-sb="exercises.${i}.weight" type="number" inputmode="decimal" min="0" max="2000" step="2.5" value="${esc(ex.weight ?? "")}" placeholder="—"></label>
                <label>RPE<input data-sb="exercises.${i}.rpe" type="number" inputmode="decimal" min="1" max="10" step="0.5" value="${esc(ex.rpe ?? "")}" placeholder="—"></label>
                <label>In reserve<input data-sb="exercises.${i}.rir" type="number" min="0" max="10" value="${esc(ex.rir ?? "")}" placeholder="—"></label>
                <label>Rest<select data-sb="exercises.${i}.restSec">${rests.map(s => `<option value="${s}"${s === rest ? " selected" : ""}>${restLabel(s)}</option>`).join("")}</select></label>
            </div>
            <div class="sb-ex-row sb-ex-extra">
                ${i > 0 ? `<label class="sb-ex-pair"><input data-sb="exercises.${i}.superset" type="checkbox"${ex.superset ? " checked" : ""}> Superset with the one above</label>` : ""}
                <input data-sb="exercises.${i}.note" type="text" maxlength="200" value="${esc(ex.note)}" placeholder="Coach note (e.g. leave 3 reps in the tank)" aria-label="Exercise ${i + 1} note">
                <input data-sb="exercises.${i}.video" type="url" maxlength="300" value="${esc(ex.video)}" placeholder="Demo video link (https://...)" aria-label="Exercise ${i + 1} demo video link">
            </div>
        </div>`;
}

export function strengthBuilderHtml(raw) {
    const clean = sanitizeStrength(raw);
    const exercises = raw.exercises || [];
    const labels = exerciseLabels(exercises.map((e, i) => ({ superset: Boolean(e.superset) && i > 0 })));
    return `
        <div class="pw-sbuilder">
            <label class="wb-field sb-template">Start from a Southbound workout
                <select data-sb-template aria-label="Start from a Southbound workout">
                    <option value="">Choose one to fill this in…</option>
                    ${BUILT_IN_WORKOUTS.map(w => `<option value="${esc(w.id)}">${esc(w.name)} · ${esc(w.minutes || "")} min</option>`).join("")}
                </select>
            </label>
            <div class="sb-head">
                <label class="wb-field">Session name<input data-sb="title" type="text" maxlength="80" value="${esc(raw.title)}" placeholder="Lower Strength"></label>
                <label class="wb-field sb-minutes">Minutes<input data-sb="minutes" type="number" min="0" max="240" value="${esc(raw.minutes ?? "")}" placeholder="45"></label>
            </div>
            <label class="wb-field">Goal<input data-sb="goal" type="text" maxlength="120" value="${esc(raw.goal)}" placeholder="Strength + running support"></label>
            <label class="wb-field">Coach notes<textarea data-sb="notes" rows="2" maxlength="400" placeholder="Leave reps in the tank. Don't chase a max today.">${esc(raw.notes)}</textarea></label>
            ${exercises.map((ex, i) => exerciseHtml(ex, i, exercises.length, labels[i])).join("")}
            ${exercises.length < MAX_EXERCISES ? `<button type="button" class="sb-btn sb-btn-tertiary wb-add" data-act="sb-add-ex">${icon("plus")} Add an exercise</button>` : ""}
            <div class="wb-summary" data-sb-summary>${strengthSummaryHtml(clean)}</div>
            <button type="button" class="sb-btn sb-btn-tertiary wb-clear" data-act="sb-clear">Remove strength session</button>
            <datalist id="sbExerciseNames">${EXERCISE_NAMES.map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        </div>`;
}

export function strengthSummaryHtml(clean) {
    if (!clean) return `<span class="wb-hint">Add at least one exercise. Weight is in pounds; leave it blank for bodyweight.</span>`;
    return `<strong>${esc(strengthSummary(clean))}</strong>`;
}

// The form's current values as a raw session.
export function readStrengthBuilder(root) {
    const raw = { title: "", minutes: "", goal: "", notes: "", exercises: [] };
    root.querySelectorAll("[data-sb]").forEach(el => {
        const path = el.dataset.sb.split(".");
        const value = el.type === "checkbox" ? el.checked : el.value;
        if (path.length === 1) { raw[path[0]] = value; return; }
        const i = Number(path[1]);
        raw.exercises[i] = raw.exercises[i] || blankExercise();
        raw.exercises[i][path[2]] = value;
    });
    raw.exercises = raw.exercises.filter(Boolean);
    return raw;
}
