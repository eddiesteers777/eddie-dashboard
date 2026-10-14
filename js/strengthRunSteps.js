/* ==========================================
   Southbound — a Strength page workout as set-by-set steps (pure)

   The Strength page's Start runs the same set-by-set screen a client
   gets for the coach's session (js/setRunner.js). This turns one
   strength-plan day (the builder's shape: exercises with sets
   { id, weight (lb), reps, repsMax?, duration, type, rpe, done },
   mode "time", rest, groupId / groupType) into that screen's steps:

     planRunSteps(day)          -> [{ exId, setId, setIndex, label, name,
                                     setNo, of, type, time, bw, weight, reps,
                                     repsMax, duration, rpe, note, restAfter, done }]
                                   in the order they're done: a superset /
                                   circuit / warm-up block goes round by round
                                   (1A set 1, 1B set 1, 1A set 2 ...), rest
                                   after each round (none between members,
                                   none before a drop set, none after the
                                   last set), the builder's own rest otherwise.
     runnerStep(step, opts)     -> what the screen shows: phase, target,
                                   inputs (in the Strength unit, lb / kg),
                                   the "Last time" line.
     lastTimeLine(lift, unit)   -> "Last time · Oct 9: 82.5 kg × 5 (3 sets)"

   Weights stay stored in pounds (js/strengthUnits.js). Unit-tested in
   tests/strengthRunSteps.test.mjs.
========================================== */

import { restAfterSet, setType, SET_TYPE_WORDS, repsMaxValue } from "./strengthBuilderModel.js";
import { toDisplay, unitLabel, isBodyweight, loadText, effortText } from "./strengthUnits.js";
import { lastLiftWords } from "./strengthProgress.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Exercises in runs: a single one, or a group sharing a groupId next to each other.
function blocks(exercises) {
    const out = [];
    for (let i = 0; i < exercises.length;) {
        const gid = exercises[i]?.groupId;
        const run = [i++];
        if (gid) while (i < exercises.length && exercises[i]?.groupId === gid) run.push(i++);
        out.push(run);
    }
    return out;
}

/** One strength-plan day -> the steps, in order. */
export function planRunSteps(day) {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    const steps = [];
    let n = 0;
    for (const block of blocks(exercises)) {
        n++;
        const grouped = block.length > 1;
        const label = k => (grouped ? `${n}${LETTERS[k] || k + 1}` : String(n));
        const rounds = Math.max(0, ...block.map(i => (exercises[i].sets || []).length));
        for (let r = 0; r < rounds; r++) {
            const inRound = block.filter(i => (exercises[i].sets || [])[r]);
            inRound.forEach((i, k) => {
                const ex = exercises[i];
                const set = ex.sets[r];
                const last = k === inRound.length - 1;
                steps.push({
                    exId: ex.id, setId: set.id, setIndex: r,
                    label: label(block.indexOf(i)),
                    name: ex.name || "Exercise",
                    setNo: r + 1, of: ex.sets.length,
                    type: setType(set),
                    time: ex.mode === "time",
                    bw: isBodyweight(ex),
                    weight: Number(set.weight) || 0,
                    reps: Number(set.reps) || 0,
                    repsMax: repsMaxValue(set.reps, set.repsMax),
                    duration: Number(set.duration) || 0,
                    rpe: Number(set.rpe) || null,
                    note: String(ex.notes || ex.note || "").trim(),
                    muscles: { primary: ex.primaryMuscles || [], secondary: ex.secondaryMuscles || [] },
                    restAfter: last ? restAfterSet(ex, r) : 0,
                    done: Boolean(set.done)
                });
            });
        }
    }
    if (steps.length) steps[steps.length - 1].restAfter = 0;
    return steps;
}

/** "Last time · Oct 9: 82.5 kg × 5 (3 sets)" from lastLifts()' entry, or "". */
export function lastTimeLine(lift, unit = "lb") {
    const w = lastLiftWords(lift);
    if (!w) return "";
    let what = w.what;
    if (unit === "kg" && lift?.mode !== "time" && Number(lift?.top?.weight)) what = `${toDisplay(lift.top.weight, "kg")} kg × ${lift.top.reps}`;
    return `Last time${w.when ? ` · ${w.when}` : ""}: ${what}${w.sets > 1 ? ` (${w.sets} sets)` : ""}`;
}

/** What the set-by-set screen shows for a step. */
export function runnerStep(step, { unit = "lb", effort = "rpe", last = null } = {}) {
    const reps = step.repsMax ? `${step.reps}–${step.repsMax}` : String(step.reps || "");
    const load = step.weight ? ` @ ${loadText(step.weight, unit, step.bw)}` : step.bw ? " · bodyweight" : "";
    const target = step.time
        ? `${step.duration || "—"} sec`
        : `${reps || "—"} reps${load}${step.rpe ? ` · ${effortText(step.rpe, effort)}` : ""}`;
    const inputs = step.time
        ? [{ key: "duration", label: "Seconds", value: step.duration || "", inputmode: "numeric", step: "1", min: 0, max: 3600 }]
        : [
            {
                key: "weight",
                label: `${step.bw ? "Added" : "Weight"} (${unitLabel(unit)})`,
                value: step.weight ? toDisplay(step.weight, unit) : "",
                placeholder: step.bw ? "BW" : "—",
                inputmode: "decimal", step: "any", min: 0, max: unit === "kg" ? 1000 : 2000
            },
            { key: "reps", label: "Reps", value: step.reps || "", inputmode: "numeric", step: "1", min: 0, max: 1000 }
        ];
    return {
        ...step,
        phase: `${step.label} · Set ${step.setNo} of ${step.of}${step.type !== "working" ? ` · ${SET_TYPE_WORDS[step.type]}` : ""}`,
        target,
        targetShort: step.time ? `${step.duration || "—"} sec` : `${reps || "—"}${step.weight ? ` @ ${loadText(step.weight, unit, step.bw)}` : ""}`,
        last: lastTimeLine(last, unit),
        inputs,
        carry: step.time ? "" : step.exId,
        plates: !step.time && !step.bw
    };
}
