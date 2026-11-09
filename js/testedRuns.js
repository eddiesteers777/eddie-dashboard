/* ==========================================
   Southbound — tested fueling runs (pure)

   A tested run is a long run or race with what the athlete actually took
   and how it went. Step 1 of adaptive fueling (2026-11-08): the log only;
   no plan reads it yet. One synced list under "fueling-tested-runs"
   (the "fueling-" prefix already syncs and clears on sign-out; the list
   merges by id in js/syncMerge.js, so a delete on one phone sticks).

     run { id, name, date "YYYY-MM-DD", kind "long" | "race", miles,
           minutes, tempF, taken { carbs, sodium, fluid, caffeine }
           (per hour; caffeine mg in total), planned { carbs, sodium,
           fluid } | null, setup (text), planId, stomach, energy, took,
           tweaks [], note, rating, updatedAt }

   Unit-tested in tests/testedRuns.test.mjs.
========================================== */

export const TESTED_KEY = "fueling-tested-runs";

export const STOMACH = { fine: "Fine", off: "A bit off", bad: "Bad" };
export const ENERGY = { strong: "Strong", okay: "Okay", faded: "Faded" };
export const TOOK = { all: "All", most: "Most", half: "About half" };
export const TWEAKS = {
    sweet: "Too sweet", bottles: "Bottles awkward", salt: "Wanted more salt",
    water: "Needed water", heavy: "Felt heavy", more: "Could have taken more"
};
export const RATING_WORDS = { worked: "Worked", mostly: "Mostly", didnt: "Didn't" };

const pick = (value, table) => (Object.prototype.hasOwnProperty.call(table, value) ? value : null);
const num = (v, min, max) => {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : NaN;
};

/** Worked = a rate worth building on. Only this raises a tested rate (step 2). */
export function rateRun({ stomach, energy, took } = {}) {
    if (!pick(stomach, STOMACH) || !pick(energy, ENERGY) || !pick(took, TOOK)) return null;
    if (stomach === "bad") return "didnt";
    if (stomach === "off" || energy === "faded" || took === "half") return "mostly";
    return "worked";
}

export function newRunId(now = Date.now(), rand = Math.random) {
    return `t${now.toString(36)}${Math.floor(rand() * 36 ** 3).toString(36).padStart(3, "0")}`;
}

/** Checks what the form hands over. Returns { ok, run } or { ok: false, problem }. */
export function buildRun(input = {}, { now = Date.now(), id = null } = {}) {
    const name = String(input.name ?? "").trim().slice(0, 80);
    if (!name) return { ok: false, problem: "Give the run a name, like “Rome 21-miler”." };
    const date = String(input.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { ok: false, problem: "Pick the date of the run." };
    const miles = num(input.miles, 1, 200), minutes = num(input.minutes, 20, 3000);
    if (!(miles > 0)) return { ok: false, problem: "Add the distance in miles." };
    if (!(minutes > 0)) return { ok: false, problem: "Add the time in minutes." };
    const carbs = num(input.carbs, 0, 150), sodium = num(input.sodium, 0, 3000), fluid = num(input.fluid, 0, 80), caffeine = num(input.caffeine, 0, 1500), tempF = num(input.tempF, -20, 120);
    if (!(carbs >= 0) || carbs === null) return { ok: false, problem: "How many grams of carbs an hour did you take? Use 0 if none." };
    if ([sodium, fluid, caffeine, tempF].some(Number.isNaN)) return { ok: false, problem: "One of the numbers is out of range. Check sodium, fluid, caffeine and temperature." };
    const stomach = pick(input.stomach, STOMACH), energy = pick(input.energy, ENERGY), took = pick(input.took, TOOK);
    if (!stomach || !energy || !took) return { ok: false, problem: "Answer the three questions: stomach, energy late, and how much you took." };
    const planned = input.planned && typeof input.planned === "object"
        ? { carbs: num(input.planned.carbs, 0, 150) ?? null, sodium: num(input.planned.sodium, 0, 3000) ?? null, fluid: num(input.planned.fluid, 0, 80) ?? null }
        : null;
    const run = {
        id: id || input.id || newRunId(now),
        name, date,
        kind: input.kind === "race" ? "race" : "long",
        miles, minutes,
        tempF: tempF ?? null,
        taken: { carbs, sodium: sodium ?? null, fluid: fluid ?? null, caffeine: caffeine ?? null },
        planned: planned && planned.carbs != null ? planned : null,
        setup: String(input.setup ?? "").trim().slice(0, 300),
        planId: input.planId ?? null,
        stomach, energy, took,
        tweaks: [...new Set((Array.isArray(input.tweaks) ? input.tweaks : []).filter(t => pick(t, TWEAKS)))],
        note: String(input.note ?? "").trim().slice(0, 300),
        updatedAt: now
    };
    run.rating = rateRun(run);
    return { ok: true, run };
}

/** Starting numbers for the form from a saved plan: edit them to what really happened. */
export function prefillFromPlan(plan = {}) {
    const s = plan.session || {};
    const hours = (Number(plan.duration) || 0) / 60;
    const miles = Number(s.distance) > 0 ? Number(s.distance) : "";
    const planned = { carbs: Number(plan.carbsPerHour) || 0, sodium: Number(plan.sodiumPerHour) || 0, fluid: Number(plan.fluidPerHour) || 0 };
    return {
        name: String(plan.name || "").replace(/^Untitled Plan$/, ""),
        date: String(plan.date || "").slice(0, 10),
        kind: plan.mode === "race" ? "race" : "long",
        miles, minutes: hours ? Math.round(hours * 60) : "",
        tempF: Number(s.temperature) > 0 ? Number(s.temperature) : "",
        carbs: planned.carbs || "", sodium: planned.sodium || "", fluid: planned.fluid || "",
        planned: planned.carbs ? planned : null,
        planId: plan.id ?? null
    };
}

export function upsertRun(list, run) {
    const rest = (Array.isArray(list) ? list : []).filter(r => String(r.id) !== String(run.id));
    return sortRuns([...rest, run]);
}
export const removeRun = (list, id) => (Array.isArray(list) ? list : []).filter(r => String(r.id) !== String(id));
export const sortRuns = list => [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.updatedAt || 0) - (a.updatedAt || 0));

/** Drops anything on the list that isn't a usable run (a half-synced or hand-edited entry). */
export function readRuns(value) {
    return sortRuns((Array.isArray(value) ? value : []).filter(r => r && r.id != null && r.name && r.taken && Number.isFinite(Number(r.taken.carbs))));
}

/** One line for the list: "Nov 7 · 26.2 mi · 68 g/hr taken (plan: 95)". */
export function runLine(run) {
    const d = new Date(`${run.date}T12:00:00Z`);
    const when = Number.isNaN(d.getTime()) ? run.date : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const plan = run.planned && Math.round(run.planned.carbs) !== Math.round(run.taken.carbs) ? ` (plan: ${Math.round(run.planned.carbs)})` : "";
    return `${when} · ${run.miles} mi · ${Math.round(run.taken.carbs)} g/hr${plan}`;
}

/* ---- Step 2: Tested vs Calculator (2026-11-09) ---- */
export const USE_TESTED_KEY = "fueling-use-tested";          // "1" when the athlete turned adaptive on (synced, off by default)
export const MIN_TESTED_MINUTES = 60;                          // a short run says little about a long one
export const WARN_GAP = 10;                                    // g/hr above tested before the plan says "untested"

/** The highest carb rate that worked on a run long enough to count. */
export function testedRate(runs) {
    let best = null;
    for (const r of readRuns(runs)) {
        if (r.rating !== "worked" || !(r.minutes >= MIN_TESTED_MINUTES)) continue;
        if (!best || r.taken.carbs > best.carbs || (r.taken.carbs === best.carbs && r.date > best.date)) best = { carbs: Math.round(r.taken.carbs), name: r.name, date: r.date, id: r.id };
    }
    return best && best.carbs > 0 ? best : null;
}

export const STEP_UP = 10;                                     // g/hr a run that worked earns for the next long run

/** Worked rates, lowest to highest, one per distinct rate (newest run keeps the label), for the ladder. */
export function workedLadder(runs, limit = 3) {
    const seen = new Map();
    for (const r of readRuns(runs).slice().reverse()) {          // oldest first, so a later run at the same rate wins
        if (r.rating === "worked" && r.minutes >= MIN_TESTED_MINUTES && r.taken.carbs > 0) seen.set(Math.round(r.taken.carbs), r.name);
    }
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).slice(-limit).map(([carbs, name]) => ({ carbs, name }));
}

/**
 * What the Tested vs Calculator card shows, or null when it shouldn't
 * (adaptive off, nothing tested yet, or no calculated plan).
 * current = the carbs box now; applied says which number the plan is using.
 * Step 3: after the newest long run worked, the next step is tested + 10
 * (never past the calculator); a run that went only so-so or badly holds.
 */
export function compareModel({ on, runs, calcCarbs, current, race = false } = {}) {
    if (!on || !(Number(calcCarbs) > 0)) return null;
    const tested = testedRate(runs);
    if (!tested) return null;
    const calc = Math.round(Number(calcCarbs)), now = Math.round(Number(current));
    const gap = calc - tested.carbs;
    const latest = readRuns(runs).find(r => r.minutes >= MIN_TESTED_MINUTES && r.rating);
    let next = null, hold = "";
    if (latest?.rating === "worked" && latest.taken.carbs >= tested.carbs) {
        const n = Math.min(tested.carbs + STEP_UP, 120);
        if (n < calc) next = { carbs: n };
    } else if (latest?.rating === "mostly") {
        hold = `${latest.name} went only so-so. Hold at ${tested.carbs} g/hr until a long run goes cleanly.`;
    } else if (latest?.rating === "didnt") {
        hold = `${latest.name} didn't go well. Stay at ${tested.carbs} g/hr or lower, and look at what to change.`;
    }
    const applied = now === tested.carbs ? "tested" : next && now === next.carbs ? "next" : now === calc ? "calc" : "custom";
    return {
        tested, calc, gap, next, hold, applied,
        ladder: [...workedLadder(runs).map(r => ({ kind: "done", ...r })), ...(next ? [{ kind: "next", carbs: next.carbs }] : []), { kind: "calc", carbs: calc }],
        warn: gap > WARN_GAP
            ? (race ? `The calculator's number is ${gap} g/hr above anything you've tested. Race day is not the day to try it.`
                    : `The calculator's number is ${gap} g/hr above anything you've tested. Try it in a long run first.`)
            : ""
    };
}
