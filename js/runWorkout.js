/* ==========================================
   Southbound — structured run workouts (pure)

   A coach can prescribe more than "6 mi, tempo". A plan day may carry
   `workout`:
     {
       warmup:   { amount, unit, note }            e.g. 1.5 mi, "easy"
       sets:     [{ repeat, amount, unit, pace, effort,
                    recovery: { amount, unit, note } }]
                                                    e.g. 3 x 1 mi @ 8:05-8:15,
                                                         2 min easy jog
       cooldown: { amount, unit, note }
       why, cue                                     "why this workout", coach cue
       fuel                                         the coach's fueling note
     }
   units: "mi" | "km" | "m" | "min". Paces are per mile ("8:05" or
   "8:05-8:15").

   The day's `session` text and `miles` are derived from it (so every
   existing screen, and the publish change list, show it), and the
   client's workout page / workout mode walk through executionSteps().
   Also: pace/time parsing and planned-vs-actual. No DOM or storage.
   Unit-tested in tests/runWorkout.test.mjs.
========================================== */

export const UNITS = ["mi", "km", "m", "min"];
const MILES_PER = { mi: 1, km: 0.621371, m: 1 / 1609.344 };
const MAX_AMOUNT = { mi: 100, km: 160, m: 50000, min: 600 };

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = n => Math.round(num(n) * 10) / 10;
const str = (v, max) => String(v ?? "").trim().slice(0, max);

// ---------- Time and pace ----------

// "8:05" -> 485 seconds; "" / junk -> null
export function paceToSeconds(text) {
    const m = String(text || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatPace(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    const s = Math.round(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// "8:05-8:15" / "8:05–8:15" / "8:10" -> { lo, hi } seconds, or null
export function parsePaceRange(text) {
    const parts = String(text || "").split(/\s*[-–]\s*/).map(paceToSeconds);
    if (!parts.length || parts.some(p => p === null) || parts.length > 2) return null;
    const [a, b = a] = parts;
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

export function paceRangeText(text) {
    const r = parsePaceRange(text);
    if (!r) return "";
    return r.lo === r.hi ? `${formatPace(r.lo)}/mi` : `${formatPace(r.lo)}–${formatPace(r.hi)}/mi`;
}

// "45:30" -> 2730, "1:05:00" -> 3900, "50" (minutes) -> 3000; junk -> null
export function parseDuration(text) {
    const t = String(text || "").trim();
    if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 60);
    const parts = t.split(":");
    if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return null;
    const n = parts.map(Number);
    if (n.slice(1).some(x => x > 59)) return null;
    return parts.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
}

export function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "";
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

// ---------- The workout ----------

function cleanStep(step, { note = true } = {}) {
    if (!step) return null;
    const unit = UNITS.includes(step.unit) ? step.unit : "mi";
    const amount = Math.min(MAX_AMOUNT[unit], Math.max(0, num(step.amount)));
    if (!amount) return null;
    const out = { amount: unit === "m" ? Math.round(amount) : round1(amount) || amount, unit };
    if (note) out.note = str(step.note, 60);
    return out;
}

// What gets stored on the plan day, or null when there's nothing in it.
export function sanitizeWorkout(input) {
    if (!input || typeof input !== "object") return null;
    const sets = (Array.isArray(input.sets) ? input.sets : []).slice(0, 8).map(set => {
        const step = cleanStep(set, { note: false });
        if (!step) return null;
        const pace = parsePaceRange(set.pace) ? str(set.pace, 20).replace(/\s*[-–]\s*/, "-") : "";
        return {
            repeat: Math.max(1, Math.min(50, Math.round(num(set.repeat) || 1))),
            ...step,
            pace,
            effort: str(set.effort, 40),
            recovery: cleanStep(set.recovery)
        };
    }).filter(Boolean);
    const out = {
        warmup: cleanStep(input.warmup),
        sets,
        cooldown: cleanStep(input.cooldown),
        why: str(input.why, 300),
        cue: str(input.cue, 200),
        fuel: str(input.fuel, 200)
    };
    const empty = !out.warmup && !out.sets.length && !out.cooldown && !out.why && !out.cue && !out.fuel;
    return empty ? null : out;
}

export function amountText(step) {
    if (!step) return "";
    if (step.unit === "min") {
        const secs = Math.round(step.amount * 60);
        return secs % 60 ? `${formatDuration(secs)}` : `${step.amount} min`;
    }
    return `${step.unit === "m" ? Math.round(step.amount) : step.amount} ${step.unit}`;
}

export function targetText(set) {
    if (!set) return "";
    const pace = paceRangeText(set.pace);
    return pace || (set.effort ? `${set.effort} effort` : "");
}

export function setText(set) {
    const reps = set.repeat > 1 ? `${set.repeat} × ` : "";
    const target = targetText(set);
    const rec = set.recovery ? ` (${amountText(set.recovery)}${set.recovery.note ? ` ${set.recovery.note}` : " recovery"})` : "";
    return `${reps}${amountText(set)}${target ? ` @ ${target}` : ""}${rec}`;
}

// "1.5 mi warm-up · 3 × 1 mi @ 8:05–8:15/mi (2 min easy jog) · 1.5 mi cool-down"
export function workoutSummary(workout) {
    if (!workout) return "";
    return [
        workout.warmup ? `${amountText(workout.warmup)} warm-up` : "",
        ...(workout.sets || []).map(setText),
        workout.cooldown ? `${amountText(workout.cooldown)} cool-down` : ""
    ].filter(Boolean).join(" · ");
}

// Total distance in miles from the parts that are distances. `exact` is
// false when some part is timed (its distance isn't known up front).
export function plannedMiles(workout) {
    if (!workout) return { miles: 0, exact: false };
    let miles = 0;
    let exact = true;
    const add = (step, times = 1) => {
        if (!step) return;
        if (step.unit === "min") { exact = false; return; }
        miles += step.amount * MILES_PER[step.unit] * times;
    };
    add(workout.warmup);
    for (const set of workout.sets || []) {
        add(set, set.repeat);
        // Recovery comes between reps (not after the last one).
        add(set.recovery, Math.max(0, set.repeat - 1));
    }
    add(workout.cooldown);
    return { miles: round1(miles), exact };
}

// The steps workout mode walks through, in order.
export function executionSteps(workout) {
    if (!workout) return [];
    const steps = [];
    const seconds = step => (step?.unit === "min" ? Math.round(step.amount * 60) : null);
    if (workout.warmup) {
        steps.push({ phase: "warmup", title: "Warm up", amount: amountText(workout.warmup), target: workout.warmup.note || "Easy", seconds: seconds(workout.warmup) });
    }
    (workout.sets || []).forEach((set, si) => {
        for (let rep = 1; rep <= set.repeat; rep++) {
            steps.push({
                phase: "work",
                title: set.repeat > 1 ? `Rep ${rep} of ${set.repeat}` : "Main set",
                set: si + 1,
                amount: amountText(set),
                target: targetText(set),
                seconds: seconds(set)
            });
            if (set.recovery && rep < set.repeat) {
                steps.push({ phase: "recovery", title: "Recover", amount: amountText(set.recovery), target: set.recovery.note || "Easy", seconds: seconds(set.recovery) });
            }
        }
    });
    if (workout.cooldown) {
        steps.push({ phase: "cooldown", title: "Cool down", amount: amountText(workout.cooldown), target: workout.cooldown.note || "Easy", seconds: seconds(workout.cooldown) });
    }
    return steps;
}

// ---------- Planned vs. actual ----------

/**
 * planned: { miles, workout? }; actual: { distance (mi), durationSec }
 * -> { distancePct, pace, paceSec, target, paceVsTarget: "on" | "faster" | "slower" | null }
 * paceVsTarget compares the average pace with the main set's target when
 * the whole run was at that target (no warm-up/cool-down), else null.
 */
export function compareRun(planned, actual) {
    const distance = num(actual?.distance);
    const duration = num(actual?.durationSec);
    const paceSec = distance > 0 && duration > 0 ? duration / distance : null;
    const plannedMilesValue = num(planned?.miles);
    const out = {
        distancePct: plannedMilesValue && distance ? Math.round((distance / plannedMilesValue) * 100) : null,
        paceSec,
        pace: paceSec ? `${formatPace(paceSec)}/mi` : "",
        target: "",
        paceVsTarget: null
    };
    const w = planned?.workout;
    const single = w && !w.warmup && !w.cooldown && (w.sets || []).length === 1 ? w.sets[0] : null;
    const range = single ? parsePaceRange(single.pace) : null;
    if (range && paceSec) {
        out.target = paceRangeText(single.pace);
        out.paceVsTarget = paceSec < range.lo - 5 ? "faster" : paceSec > range.hi + 5 ? "slower" : "on";
    }
    return out;
}
