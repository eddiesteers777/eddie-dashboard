/* ==========================================
   Southbound — log, finish and edit completed sessions

   openCrossLog({ workoutId })   log a cross-training session: from a
                                 library workout (tick the blocks done)
                                 or a plain activity; then a short
                                 "Session logged" summary with an
                                 optional Share workout.
   openSessionEdit(session)      edit a stored strength or cross-training
                                 session (words, time, sets / blocks) or
                                 delete it. The id and when it was done
                                 never change; strength-history follows.
   Both are <dialog>s in Southbound's own style (css/train.css).
========================================== */

import {
    crossSession, editSession, localDay, CROSS_ACTIVITIES, INTENSITIES, sessionLine, strengthTotals
} from "./completedSessions.js";
import { saveSession, deleteSession, getSession } from "./sessionStore.js";
import { toast, sbConfirm } from "./ui.js";
import { toDisplay, fromDisplay, unitLabel, cleanSettings, SETTINGS_KEY, volumeText } from "./strengthUnits.js";

const LIBRARY_KEY = "cross-training-library";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const capital = w => (w ? w[0].toUpperCase() + w.slice(1) : "");

function library() {
    try { const l = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]"); return Array.isArray(l) ? l : []; }
    catch { return []; }
}
function unit() {
    try { return cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")).unit; }
    catch { return "lb"; }
}
const volume = lb => volumeText(lb, unit());

// The dialogs' look lives in css/train.css; load it on pages that don't already.
function ensureStyles() {
    if (document.querySelector('link[href$="css/train.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/train.css";
    document.head.appendChild(link);
}

function makeDialog(className, html) {
    ensureStyles();
    const dialog = document.createElement("dialog");
    dialog.className = `sb-dialog tr-dialog ${className}`;
    dialog.innerHTML = `<form class="sb-dialog-form" method="dialog" novalidate>${html}</form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
    try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
    return dialog;
}

const chips = (name, options, selected) => `<div class="tr-chips" role="radiogroup">${options.map(([value, label]) =>
    `<label class="tr-chip"><input type="radio" name="${name}" value="${esc(value)}"${value === selected ? " checked" : ""}><span>${esc(label)}</span></label>`).join("")}</div>`;

/* ---------- the "done" summary with Share ---------- */

function finished(dialog, session, heading) {
    const form = dialog.querySelector("form");
    form.innerHTML = `
        <h2 class="sb-dialog-title">${esc(heading)}</h2>
        <div class="tr-done">
            <span class="tr-done-mark" aria-hidden="true">✓</span>
            <div><strong>${esc(session.title)}</strong><span>${esc(sessionLine(session, { volume }))}</span></div>
        </div>
        <p class="tr-note">It's in Recent Workouts on the Train page. Sharing is optional.</p>
        <div class="sb-dialog-actions">
            <button type="button" class="sb-btn sb-btn-secondary" data-done>Done</button>
            <button type="button" class="sb-btn sb-btn-primary" data-share>Share workout</button>
        </div>`;
    form.querySelector("[data-done]").addEventListener("click", () => dialog.close());
    form.querySelector("[data-share]").addEventListener("click", () => {
        dialog.close();
        import("./sessionShare.js").then(m => m.shareSession(getSession(session.id) || session))
            .catch(() => toast("Couldn't open the share card. Check your connection and try again.", { type: "error" }));
    });
}

/* ---------- cross-training: log ---------- */

/** Log a cross-training session. Resolves with the saved session, or null. */
export function openCrossLog({ workoutId = "", date = localDay() } = {}) {
    const lib = library();
    let current = lib.find(w => w.id === workoutId) || null;
    return new Promise(resolve => {
        let saved = null;
        const dialog = makeDialog("tr-log-dialog", `
            <h2 class="sb-dialog-title">Log cross-training</h2>
            <label class="tr-field"><span>Workout</span>
                <select name="workout">
                    <option value="">Just an activity (no library workout)</option>
                    ${lib.map(w => `<option value="${esc(w.id)}"${w.id === current?.id ? " selected" : ""}>${esc(w.name)}</option>`).join("")}
                </select>
            </label>
            <div class="tr-field" data-activity><span>Activity</span>${chips("activity", Object.entries(CROSS_ACTIVITIES), current?.category || "cycling")}</div>
            <div class="tr-field" data-blocks></div>
            <div class="tr-row">
                <label class="tr-field"><span>Date</span><input type="date" name="date" value="${esc(date)}" max="${esc(localDay())}" required></label>
                <label class="tr-field"><span>Minutes</span><input type="number" name="minutes" inputmode="numeric" min="1" max="600" step="1" placeholder="—"></label>
            </div>
            <div class="tr-field"><span>How hard</span>${chips("intensity", [["", "Not set"], ...INTENSITIES.map(i => [i, capital(i)])], "")}</div>
            <label class="tr-field"><span>Note (optional)</span><textarea name="note" rows="2" maxlength="500" placeholder="How it went"></textarea></label>
            <p class="tr-error" role="alert" hidden></p>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">Save session</button>
            </div>`);
        dialog.addEventListener("close", () => resolve(saved));
        const form = dialog.querySelector("form");
        const err = form.querySelector(".tr-error");
        let minutesTouched = false;

        const blockMinutes = () => [...form.querySelectorAll("[data-block]:checked")]
            .reduce((t, el) => t + (Number(el.dataset.min) || 0), 0);
        const fillMinutes = () => { if (!minutesTouched) form.elements.minutes.value = blockMinutes() || ""; };
        const drawWorkout = () => {
            current = lib.find(w => w.id === form.elements.workout.value) || null;
            form.querySelector("[data-activity]").hidden = Boolean(current);
            const host = form.querySelector("[data-blocks]");
            host.hidden = !current?.blocks?.length;
            host.innerHTML = current?.blocks?.length ? `<span>Blocks done</span><div class="tr-blocks">${current.blocks.map(b => `
                <label class="tr-block"><input type="checkbox" data-block value="${esc(b.id)}" data-min="${Number(b.duration) || 0}" checked>
                    <span><strong>${esc(b.label || "Block")}</strong><small>${[Number(b.duration) ? `${Number(b.duration)} min` : "", capital(b.intensity)].filter(Boolean).join(" · ")}</small></span></label>`).join("")}</div>` : "";
            minutesTouched = false;
            fillMinutes();
        };
        drawWorkout();
        form.elements.workout.addEventListener("change", drawWorkout);
        form.addEventListener("change", e => { if (e.target.matches("[data-block]")) fillMinutes(); });
        form.elements.minutes.addEventListener("input", () => { minutesTouched = true; });
        form.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
        form.addEventListener("submit", e => {
            e.preventDefault();
            err.hidden = true;
            const day = form.elements.date.value;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > localDay()) { err.textContent = "Pick the day you did it (today or earlier)."; err.hidden = false; return; }
            const minutes = Number(form.elements.minutes.value);
            const done = current ? [...form.querySelectorAll("[data-block]:checked")].map(el => el.value) : null;
            if (current && !done.length && !(minutes > 0)) { err.textContent = "Tick the blocks you did, or type how many minutes it took."; err.hidden = false; return; }
            if (!current && !(minutes > 0)) { err.textContent = "How many minutes was it?"; err.hidden = false; return; }
            const session = crossSession(current, {
                date: day, minutes: minutes > 0 ? minutes : null, done,
                intensity: form.elements.intensity.value || null,
                activity: current ? null : form.elements.activity.value,
                note: form.elements.note.value,
                // A session for an earlier day counts as done that day.
                completedAt: day === localDay() ? Date.now() : Date.parse(`${day}T12:00:00`),
                now: Date.now()
            });
            if (!session) { err.textContent = "Nothing to save yet."; err.hidden = false; return; }
            try { saved = saveSession(session); }
            catch { err.textContent = "Couldn't save: your phone's storage may be full."; err.hidden = false; return; }
            finished(dialog, saved, "Session logged");
        });
    });
}

/* ---------- edit a stored session ---------- */

function strengthRows(session) {
    const u = unit();
    return (session.strength?.exercises || []).map((ex, ei) => `
        <fieldset class="tr-ex" data-ex="${ei}">
            <legend>${esc(ex.name)}${ex.bw ? " <small>(bodyweight)</small>" : ""}</legend>
            ${ex.sets.map((st, si) => `
                <div class="tr-set" data-set="${si}">
                    <span class="tr-set-n">${st.t === "warmup" ? "W" : st.t === "drop" ? "D" : st.t === "failure" ? "F" : si + 1}</span>
                    ${ex.mode === "time"
                        ? `<label><input type="number" inputmode="numeric" min="0" max="7200" data-f="d" value="${st.d || ""}" aria-label="Seconds"><span>sec</span></label>`
                        : `<label><input type="number" inputmode="decimal" min="0" max="2000" step="any" data-f="w" value="${st.w ? toDisplay(st.w, u) : ""}" aria-label="${ex.bw ? "Added weight" : "Weight"}" placeholder="${ex.bw ? "BW" : "0"}"><span>${ex.bw ? "+" : ""}${unitLabel(u)}</span></label>
                           <label><input type="number" inputmode="numeric" min="0" max="500" data-f="r" value="${st.r || ""}" aria-label="Reps"><span>reps</span></label>`}
                    <button type="button" class="tr-set-remove" data-remove-set aria-label="Remove this set">×</button>
                </div>`).join("")}
        </fieldset>`).join("");
}

function readStrength(form, session) {
    const u = unit();
    return (session.strength?.exercises || []).map((ex, ei) => {
        const box = form.querySelector(`[data-ex="${ei}"]`);
        const sets = [...(box?.querySelectorAll("[data-set]") || [])].map(row => {
            const orig = ex.sets[Number(row.dataset.set)] || {};
            const val = f => Number(row.querySelector(`[data-f="${f}"]`)?.value) || 0;
            return ex.mode === "time" ? { ...orig, d: val("d") } : { ...orig, w: val("w") ? fromDisplay(val("w"), u) : 0, r: val("r") };
        });
        return { ...ex, sets };
    });
}

/** Edit or delete a stored session. Resolves with "saved" | "deleted" | null. */
export function openSessionEdit(session) {
    if (!session || !["strength", "cross"].includes(session.type)) return Promise.resolve(null);
    return new Promise(resolve => {
        let outcome = null;
        const minutes = session.durationSec ? Math.round(session.durationSec / 60) : "";
        const dialog = makeDialog("tr-edit-dialog", `
            <h2 class="sb-dialog-title">Edit ${session.type === "strength" ? "workout" : "session"}</h2>
            <label class="tr-field"><span>Name</span><input type="text" name="title" maxlength="80" value="${esc(session.title)}"></label>
            <div class="tr-row">
                <label class="tr-field"><span>Date</span><input type="date" name="date" value="${esc(session.date)}" max="${esc(localDay())}"></label>
                <label class="tr-field"><span>Minutes</span><input type="number" name="minutes" inputmode="numeric" min="1" max="1440" value="${minutes}" placeholder="—"></label>
            </div>
            ${session.type === "cross" ? `
                <div class="tr-field"><span>How hard</span>${chips("intensity", [["", "Not set"], ...INTENSITIES.map(i => [i, capital(i)])], session.cross?.intensity || "")}</div>
                ${session.cross?.blocks?.length ? `<div class="tr-field"><span>Blocks done</span><div class="tr-blocks">${session.cross.blocks.map((b, i) => `
                    <label class="tr-block"><input type="checkbox" data-block value="${i}"${b.done ? " checked" : ""}><span><strong>${esc(b.label)}</strong><small>${[b.min ? `${b.min} min` : "", capital(b.intensity)].filter(Boolean).join(" · ")}</small></span></label>`).join("")}</div></div>` : ""}`
                : `<div class="tr-field"><span>Sets</span>${strengthRows(session)}</div>`}
            <label class="tr-field"><span>Note</span><textarea name="note" rows="2" maxlength="500">${esc(session.note)}</textarea></label>
            <p class="tr-note">Changes here only change this ${session.type === "strength" ? "workout" : "session"}; your templates and schedule stay as they are.</p>
            <p class="tr-error" role="alert" hidden></p>
            <div class="sb-dialog-actions tr-edit-actions">
                <button type="button" class="sb-btn sb-btn-danger" data-delete>Delete</button>
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">Save</button>
            </div>`);
        dialog.addEventListener("close", () => resolve(outcome));
        const form = dialog.querySelector("form");
        const err = form.querySelector(".tr-error");
        form.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
        form.addEventListener("click", e => {
            const rm = e.target.closest("[data-remove-set]");
            if (!rm) return;
            const box = rm.closest("fieldset");
            if (box.querySelectorAll("[data-set]").length <= 1 && form.querySelectorAll("[data-set]").length <= 1) {
                err.textContent = "A workout needs at least one set. Delete the workout instead."; err.hidden = false; return;
            }
            rm.closest("[data-set]").remove();
        });
        form.querySelector("[data-delete]").addEventListener("click", async () => {
            const ok = await sbConfirm(`Delete “${session.title}” from your workouts? This can't be undone.`, { title: "Delete this workout?", confirmLabel: "Delete", danger: true });
            if (!ok) return;
            try {
                deleteSession(session.id);
                if (session.type === "strength") (await import("./strengthHistory.js")).removeSessionHistory(session.id);
                outcome = "deleted";
                toast("Workout deleted.");
                dialog.close();
            } catch { err.textContent = "Couldn't delete it here: your phone's storage may be full."; err.hidden = false; }
        });
        form.addEventListener("submit", async e => {
            e.preventDefault();
            err.hidden = true;
            const changes = {
                title: form.elements.title.value,
                note: form.elements.note.value,
                durationSec: Number(form.elements.minutes.value) > 0 ? Number(form.elements.minutes.value) * 60 : null,
                date: form.elements.date.value && form.elements.date.value <= localDay() ? form.elements.date.value : session.date
            };
            if (session.type === "cross") {
                changes.intensity = form.elements.intensity.value || null;
                changes.blocksDone = [...form.querySelectorAll("[data-block]:checked")].map(el => Number(el.value));
            } else {
                changes.exercises = readStrength(form, session);
                const left = changes.exercises.filter(ex => ex.sets.some(st => ex.mode === "time" ? st.d > 0 : st.w > 0 || st.r > 0));
                if (!left.length) { err.textContent = "Every set is empty. Fill one in, or delete the workout."; err.hidden = false; return; }
            }
            const next = editSession(session, changes);
            try {
                const saved = saveSession(next);
                if (saved.type === "strength") (await import("./strengthHistory.js")).logSession(saved);
                outcome = "saved";
                toast("Saved.");
                dialog.close();
            } catch { err.textContent = "Couldn't save: your phone's storage may be full."; err.hidden = false; }
        });
    });
}

export { strengthTotals };
