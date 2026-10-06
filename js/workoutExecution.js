/* ==========================================
   Southbound — workout execution: planned steps vs COROS laps (pure)

   docs/WORKOUT_EXECUTION_PLAN.md. One structured workout (the
   js/runWorkout.js shape: warmup, sets with repeat / amount / unit /
   pace / effort / recovery / parts, cooldown; Eddie's marathon days read
   into it by js/marathonCoros.js, clients' coach-plan days already in it)
   + one activity's laps (the coros-laps store: { laps: [{ i, m, s, hr }],
   kind }) -> one reconstruction, which every view reads.

   plannedSteps(workout)
     the workout as the watch runs it, one step per lap it should make:
     warm-up, each rep, each recovery (the recovery after the last rep is
     `optional`: COROS's interval group has one, Southbound's plan
     doesn't count it), cool-down. Ids are stable ("wu", "s1.r3",
     "s1.r3.rec", "s2.r1.p2", "cd").
   inferLapKind(entry)
     "laps" (the watch's workout steps / the lap button), "auto" (every
     mile or km) or null; old saved entries have no kind, so it's read
     from their shape.
   reconstructWorkout(workout, lapEntry, { plannedWorkoutId, activityId })
     -> WorkoutExecution { version, plannedWorkoutId, activityId, source,
        matchConfidence, overallStatus, completion, targetCompliance,
        steps[], sets[], read[] }

   Matching: an alignment of the steps against the laps in order (each
   step takes 0, 1 or a few consecutive laps; a lap may be left over),
   scored by how well each lap's distance or time fits the step and how
   its pace fits the step's target. No lap is assumed to be a step by
   its number. With "auto" laps a step can only be matched when its
   boundaries fall on lap boundaries (a 2 mi warm-up, a last-3-miles
   finish); short reps can't be seen and are "unobserved", not missed.
   Confidence: exact (workout laps, every step within 3% of its distance
   or time, nothing missing or merged), approximate (GPS or lap-button
   drift, merged or extra laps, a missed or cut-short step), low (auto
   laps, or a poor fit), unmatched (no laps, or no work step found).

   Comparison math: never subtracts rounded paces. A distance step's
   time is normalized to the planned distance from the lap's own
   seconds and meters (s × planned m ÷ lap m), then compared with the
   target time (the rep time as written, "8x800 @ 2:55", else the pace
   range × the distance). A range is a range: inside it the difference
   is 0; outside it's measured from the nearer end, no made-up middle.
   Negative = faster. Within target = within 5 s/mi of the target (or
   range) on pace. Timed steps compare pace. Completion (was it done)
   and execution (was it on target) are kept apart: faster than the
   target is off target, not better.

   Nothing is stored: it's worked out from the plan and the saved laps
   whenever it's shown, and COROS's laps are never changed.
   Unit-tested in tests/workoutExecution.test.mjs.
========================================== */

import { parsePaceRange, amountText, targetText } from "./runWorkout.js";

export const EXECUTION_VERSION = "0.1.0";
const MILE = 1609.344;
const METERS = { mi: MILE, km: 1000, m: 1 };

/** How close counts. pace: s/mi either side of the target; exact / gps: share of a step's distance or time. */
export const TOLERANCE = Object.freeze({ paceSecPerMile: 5, exact: 0.03, gps: 0.10, partial: 0.9, long: 1.1 });

const r1 = x => Math.round(x * 10) / 10;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** 147.3 -> "2:27", { tenths: true } -> "2:27.3"; 3725 -> "1:02:05". */
export function clockText(sec, { tenths = false } = {}) {
    if (!Number.isFinite(sec)) return "";
    const t = tenths ? Math.round(Math.abs(sec) * 10) / 10 : Math.round(Math.abs(sec));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const ss = tenths ? s.toFixed(1).padStart(4, "0") : String(Math.round(s)).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** A short span: "5 s", "4.6 s", "1:05". */
export function spanText(sec) {
    if (!Number.isFinite(sec)) return "";
    const a = Math.abs(sec);
    return a < 60 ? `${Math.round(a * 10) / 10} s` : clockText(a);
}

/** A signed difference in seconds -> "0:04 fast" / "0:02 slow" / "on target". */
export function deltaText(sec) {
    if (sec == null) return "";
    if (Math.round(Math.abs(sec)) === 0) return "on target";
    return `${clockText(sec)} ${sec < 0 ? "fast" : "slow"}`;
}

const isEasyWord = w => /^(easy|recovery|jog|walk|float|easy \+ strides)$/i.test(String(w || "").trim());

// ---------- the planned steps ----------

function stepOf(step) {
    if (step.unit === "min") return { distanceM: null, durationSec: Math.round(step.amount * 600) / 10 };
    return { distanceM: step.amount * (METERS[step.unit] || MILE), durationSec: null };
}

function targetOf(step) {
    const pace = parsePaceRange(step.pace);
    const rep = parsePaceRange(step.repTime);           // "2:27" written as the rep's time
    return { target: pace, repTime: rep };
}

/** The workout as one step per expected lap. */
export function plannedSteps(workout) {
    if (!workout) return [];
    const out = [];
    const push = (step, extra) => out.push({ ...stepOf(step), amount: amountText(step), ...targetOf(step), optional: false, ...extra });
    if (workout.warmup) push(workout.warmup, { id: "wu", kind: "warmup", label: "Warm-up", effort: workout.warmup.note || "easy" });
    (workout.sets || []).forEach((set, si) => {
        const n = Math.max(1, set.repeat || 1);
        const members = set.parts?.length ? set.parts : [set];
        for (let r = 1; r <= n; r++) {
            members.forEach((p, pi) => {
                const id = `s${si + 1}.r${r}${members.length > 1 ? `.p${pi + 1}` : ""}`;
                const recovery = p.recovery === true;
                const easy = !recovery && !p.pace && isEasyWord(p.effort);
                const kind = recovery ? "recovery" : easy ? "easy" : "work";
                const label = recovery ? "Recovery"
                    : n > 1 ? `Rep ${r} of ${n}${members.length > 1 ? ` · ${amountText(p)}` : ""}`
                    : `${amountText(p)}${targetText(p) ? ` @ ${targetText(p)}` : ""}`;
                push(p, { id, kind, set: si + 1, rep: r, of: n, ...(members.length > 1 ? { part: pi + 1 } : {}), label, effort: recovery ? p.note || "jog" : p.effort || "" });
            });
            if (!set.parts?.length && set.recovery) {
                // Southbound counts recoveries between reps; the watch also runs one after the last.
                push(set.recovery, { id: `s${si + 1}.r${r}.rec`, kind: "recovery", set: si + 1, rep: r, of: n, label: "Recovery", effort: set.recovery.note || "jog", optional: r === n });
            }
        }
    });
    if (workout.cooldown) push(workout.cooldown, { id: "cd", kind: "cooldown", label: "Cool-down", effort: workout.cooldown.note || "easy" });
    return out;
}

// ---------- laps ----------

/** "laps" | "auto" | null, from the saved kind or the laps' shape (every lap but the last about a mile or a km). */
export function inferLapKind(entry) {
    if (entry?.kind) return entry.kind;
    const laps = (Array.isArray(entry) ? entry : entry?.laps) || [];
    if (!laps.length) return null;
    const body = laps.length > 1 ? laps.slice(0, -1) : laps;
    const every = len => body.every(l => Math.abs(l.m - len) / len < 0.02);
    return body.length >= 2 && (every(MILE) || every(1000)) ? "auto" : "laps";
}

const lapPace = (m, s) => (m > 0 ? s / (m / MILE) : null);
// A lap about a mile or a km long: a split, not a step of its own.
const splitLap = l => Math.abs(l.m - MILE) / MILE < 0.03 || Math.abs(l.m - 1000) / 1000 < 0.03;

// ---------- matching ----------

// Each recovery step knows the work pace before it (a recovery lap faster than that is probably a rep).
function workPaceBefore(steps) {
    let last = null;
    return steps.map(s => {
        if (s.kind === "work") {
            const t = s.target || (s.repTime && s.distanceM ? { lo: s.repTime.lo / (s.distanceM / MILE), hi: s.repTime.hi / (s.distanceM / MILE) } : null);
            if (t) last = t.lo;
        }
        return s.kind === "recovery" ? last : null;
    });
}

function fitRatio(step, m, s) {
    return step.distanceM ? m / step.distanceM : s / step.durationSec;
}

function matchCost(step, laps, kind, workBefore) {
    const m = laps.reduce((t, l) => t + l.m, 0), s = laps.reduce((t, l) => t + l.s, 0);
    const ratio = fitRatio(step, m, s);
    if (!(ratio > 0)) return Infinity;
    let c = Math.abs(Math.log(ratio)) * 4;
    // Joining laps: free for COROS's mile laps; nearly free for laps pressed every mile or km
    // (a long block run with the lap button); otherwise an extra lap press costs a little.
    if (laps.length > 1 && kind !== "auto") c += laps.slice(1).reduce((t, l) => t + (splitLap(l) ? 0.1 : 0.6), 0);
    const pace = lapPace(m, s);
    const t = step.target || (step.repTime && step.distanceM ? { lo: step.repTime.lo / (step.distanceM / MILE), hi: step.repTime.hi / (step.distanceM / MILE) } : null);
    const offBy = p => (p < t.lo ? Math.log(t.lo / p) : p > t.hi ? Math.log(p / t.hi) : 0);
    if (t && pace) {
        // Mile laps joined into one step: each lap has to fit, so an easy mile can't hide in an average.
        if (laps.length > 1 && (kind === "auto" || laps.every(splitLap))) c += laps.reduce((sum, l) => sum + Math.max(0, offBy(lapPace(l.m, l.s)) - 0.03) * 8, 0);
        else c += Math.max(0, offBy(pace) - 0.06) * 8;
    }
    if (step.kind === "recovery" && workBefore && pace && pace < workBefore * 1.05) c += 1;
    return c;
}

const SKIP = { laps: { work: 2, other: 1.5, optional: 0 }, auto: { work: 0.3, other: 0.3, optional: 0 } };
const tinyLap = l => l.m < 100 || l.s < 20;

/** The best order-keeping assignment of laps to steps. -> [lap indexes] per step. */
function align(steps, laps, kind) {
    const n = steps.length, m = laps.length;
    const K = 40;
    const skip = SKIP[kind === "auto" ? "auto" : "laps"];
    const extra = l => (kind === "auto" ? 0.3 : tinyLap(l) ? 0.1 : 1.5);
    const before = workPaceBefore(steps);
    // Mile laps all look alike: where a step should sit in the run (its planned
    // start, timed steps at their target pace or 8:00/mi) decides between them.
    const stepStart = [];
    let at = 0;
    for (const st of steps) {
        stepStart.push(at);
        const pace = st.target ? (st.target.lo + st.target.hi) / 2 : 480;
        at += st.distanceM ?? (st.durationSec / pace) * MILE;
    }
    const lapStart = [];
    let lm = 0;
    for (const l of laps) { lapStart.push(lm); lm += l.m; }
    const place = (i, j) => (kind === "auto" ? (Math.abs(lapStart[j] - stepStart[i]) / MILE) * 1.5 : 0);
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
    const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
    dp[0][0] = 0;
    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= m; j++) {
            const base = dp[i][j];
            if (base === Infinity) continue;
            if (i < n) {
                const st = steps[i];
                const c = base + (st.optional ? skip.optional : st.kind === "work" ? skip.work : skip.other);
                if (c < dp[i + 1][j]) { dp[i + 1][j] = c; back[i + 1][j] = { i, j, k: 0 }; }
                for (let k = 1; k <= K && j + k <= m; k++) {
                    const mc = matchCost(st, laps.slice(j, j + k), kind, before[i]) + place(i, j);
                    if (mc === Infinity) continue;
                    if (base + mc < dp[i + 1][j + k]) { dp[i + 1][j + k] = base + mc; back[i + 1][j + k] = { i, j, k }; }
                }
            }
            if (j < m) {
                const c = base + extra(laps[j]);
                if (c < dp[i][j + 1]) { dp[i][j + 1] = c; back[i][j + 1] = { i, j, k: -1 }; }
            }
        }
    }
    const assign = steps.map(() => []);
    const extras = [];
    for (let i = n, j = m; i > 0 || j > 0;) {
        const b = back[i][j];
        if (!b) break;
        if (b.k === -1) extras.unshift(b.j);
        else if (b.k > 0) assign[b.i] = Array.from({ length: b.k }, (_, x) => b.j + x);
        i = b.i; j = b.j;
    }
    return { assign, extras, cost: dp[n][m] };
}

// ---------- comparing one step ----------

function compare(step, laps, kind, tol) {
    const m = laps.reduce((t, l) => t + l.m, 0), s = r1(laps.reduce((t, l) => t + l.s, 0));
    const hrLaps = laps.filter(l => l.hr);
    const hr = hrLaps.length ? Math.round(hrLaps.reduce((t, l) => t + l.hr * l.s, 0) / hrLaps.reduce((t, l) => t + l.s, 0)) : null;
    const paceSec = lapPace(m, s);
    const ratio = fitRatio(step, m, s);
    const notes = [];
    const out = { lapIndexes: laps.map(l => l.i), actual: { meters: m, seconds: s, hr, paceSec: paceSec == null ? null : r1(paceSec) }, ratio: Math.round(ratio * 1000) / 1000 };
    out.status = ratio < tol.partial ? "partial" : "done";
    if (out.status === "partial") notes.push(step.distanceM ? `stopped at ${Math.round(m)} of ${Math.round(step.distanceM)} m` : `stopped at ${clockText(s)} of ${clockText(step.durationSec)}`);
    else if (ratio > tol.long) notes.push(step.distanceM ? `ran ${Math.round(m)} m` : `ran ${clockText(s)}`);
    const drift = Math.abs(ratio - 1);
    let confidence = kind === "laps" && drift <= tol.exact && laps.length === 1 ? "exact"
        : drift <= tol.gps || out.status === "partial" ? "approximate" : "low";
    if (kind === "auto" && confidence === "exact") confidence = "approximate";
    if (kind === "laps" && step.distanceM && out.status === "done" && drift > tol.exact && drift <= tol.gps) notes.push(`lap read ${Math.round(m)} m (GPS)`);
    if (laps.length > 1) notes.push(`${laps.length} laps joined`);
    out.matchConfidence = confidence;

    // Target vs actual, from seconds and meters (never from rounded paces).
    const rangePace = step.target;
    const rangeTime = step.repTime && step.distanceM ? step.repTime : null;
    // Only work is judged on pace: warm-ups, cool-downs and recoveries show their pace, nothing more.
    if (step.kind === "work" && (rangePace || rangeTime) && paceSec && out.status === "done") {
        if (step.distanceM) {
            const miles = step.distanceM / MILE;
            const norm = s * step.distanceM / m;                     // the lap's time at the planned distance
            const t = rangeTime || { lo: rangePace.lo * miles, hi: rangePace.hi * miles };
            const deltaSec = norm < t.lo ? norm - t.lo : norm > t.hi ? norm - t.hi : 0;
            out.targetSec = { lo: r1(t.lo), hi: r1(t.hi), kind: rangeTime ? "time" : "pace" };
            out.normalizedSec = r1(norm);
            out.deltaSec = r1(deltaSec);
            out.deltaPace = r1(deltaSec / miles);
        } else {
            const deltaPace = paceSec < rangePace.lo ? paceSec - rangePace.lo : paceSec > rangePace.hi ? paceSec - rangePace.hi : 0;
            out.targetSec = null;   // a timed step is judged on pace (step.target)
            out.deltaSec = null;
            out.deltaPace = r1(deltaPace);
        }
        out.verdict = Math.abs(out.deltaPace) <= tol.paceSecPerMile ? "within" : out.deltaPace < 0 ? "fast" : "slow";
    } else out.verdict = null;
    out.notes = notes;
    return out;
}

// ---------- the reconstruction ----------

/** Per set: "5/6 reps completed, 1 cut short · 1 mi done". */
export function completionText(work) {
    const sets = [...new Set(work.map(s => s.set))];
    return sets.map(n => {
        const reps = work.filter(s => s.set === n);
        const first = reps[0];
        const c = st => reps.filter(s => s.status === st).length;
        if (c("unobserved") === reps.length) return `${first.of > 1 ? `${reps.length} reps` : first.amount}: can't tell from the laps`;
        if (first.of > 1) {
            const extra = [c("partial") ? `${c("partial")} cut short` : "", c("unobserved") ? `${c("unobserved")} not in the laps` : ""].filter(Boolean).join(", ");
            return `${c("done")}/${reps.length} ${reps.length === first.of ? "reps" : "steps"} completed${extra ? `, ${extra}` : ""}`;
        }
        const st = reps.every(s => s.status === "done") ? "done" : c("partial") ? "cut short" : c("missed") ? "missed" : "not in the laps";
        return `${first.amount} ${st}`;
    }).join(" · ");
}

function setSummary(steps, setNo) {
    const work = steps.filter(s => s.kind === "work" && s.set === setNo);
    if (!work.length) return null;
    const first = work[0];
    const done = work.filter(s => s.status === "done");
    const timed = done.filter(s => s.normalizedSec != null);
    const judged = done.filter(s => s.verdict);
    const byTime = [...timed].sort((a, b) => a.normalizedSec - b.normalizedSec);
    const half = Math.floor(timed.length / 2);
    const fade = timed.length >= 4 ? r1(mean(timed.slice(-half).map(s => s.normalizedSec)) - mean(timed.slice(0, half).map(s => s.normalizedSec))) : null;
    const hrs = done.map(s => s.actual.hr).filter(Boolean);
    const paces = done.map(s => s.actual.paceSec).filter(Boolean);
    const deltas = judged.map(s => s.deltaSec ?? s.deltaPace);
    return {
        set: setNo, label: first.of > 1 ? `${first.of} × ${first.amount}` : first.amount,
        target: first.repTime ? `${clockText(first.repTime.lo)}${first.repTime.hi !== first.repTime.lo ? `–${clockText(first.repTime.hi)}` : ""}` : targetText({ pace: first.target ? `${clockText(first.target.lo)}-${clockText(first.target.hi)}` : "", effort: first.effort }),
        planned: work.length, done: done.length,
        partial: work.filter(s => s.status === "partial").length,
        missed: work.filter(s => s.status === "missed").length,
        unobserved: work.filter(s => s.status === "unobserved").length,
        judged: judged.length, within: judged.filter(s => s.verdict === "within").length,
        fast: judged.filter(s => s.verdict === "fast").length, slow: judged.filter(s => s.verdict === "slow").length,
        avgSec: timed.length ? r1(mean(timed.map(s => s.normalizedSec))) : null,
        avgPace: paces.length ? r1(mean(paces)) : null,
        avgDelta: deltas.length ? r1(mean(deltas)) : null,
        deltaUnit: judged.length && judged.every(s => s.deltaSec != null) ? "sec" : "secPerMile",
        spreadSec: timed.length >= 2 ? r1(byTime.at(-1).normalizedSec - byTime[0].normalizedSec) : null,
        fastest: byTime[0] ? { rep: byTime[0].rep, sec: byTime[0].normalizedSec } : null,
        slowest: byTime.length > 1 ? { rep: byTime.at(-1).rep, sec: byTime.at(-1).normalizedSec } : null,
        fadeSec: fade,
        avgHr: hrs.length ? Math.round(mean(hrs)) : null
    };
}

const CONF_ORDER = ["exact", "approximate", "low", "unmatched"];
const worse = (a, b) => (CONF_ORDER.indexOf(a) >= CONF_ORDER.indexOf(b) ? a : b);

/**
 * workout: the structured workout; lapEntry: { laps, kind } (coros-laps) or a laps array.
 * -> the WorkoutExecution (see the header).
 */
export function reconstructWorkout(workout, lapEntry, { plannedWorkoutId = null, activityId = null, tolerance = {} } = {}) {
    const tol = { ...TOLERANCE, ...tolerance };
    const planned = plannedSteps(workout);
    const laps = ((Array.isArray(lapEntry) ? lapEntry : lapEntry?.laps) || []).filter(l => l && l.m > 0 && l.s > 0);
    const kind = laps.length ? inferLapKind(Array.isArray(lapEntry) ? { laps } : { ...lapEntry, laps }) : null;
    const source = { laps: laps.length, kind };
    const base = { version: EXECUTION_VERSION, plannedWorkoutId, activityId, source };

    if (!planned.length) return { ...base, matchConfidence: "unmatched", overallStatus: "unknown", completion: null, targetCompliance: null, steps: [], sets: [], extras: [], read: ["No structured workout to compare with."] };

    const { assign, extras, cost } = laps.length ? align(planned, laps, kind) : { assign: planned.map(() => []), extras: [], cost: 0 };
    const steps = planned.map((st, idx) => {
        const own = assign[idx].map(x => laps[x]);
        if (!own.length) return { ...st, lapIndexes: [], actual: null, status: kind === "laps" && !st.optional ? "missed" : st.optional ? "skipped" : "unobserved", verdict: null, matchConfidence: "unmatched", notes: [] };
        return { ...st, ...compare(st, own, kind, tol) };
    });

    const work = steps.filter(s => s.kind === "work");
    const count = st => work.filter(s => s.status === st).length;
    const done = count("done"), partial = count("partial"), missed = count("missed"), unobserved = count("unobserved");
    const credit = work.reduce((t, s) => t + (s.status === "done" ? 1 : s.status === "partial" ? Math.min(1, s.ratio) : 0), 0);
    const completion = work.length ? {
        planned: work.length, done, partial, missed, unobserved,
        pct: unobserved === work.length ? null : Math.round((credit / work.length) * 100),
        text: completionText(work)
    } : null;
    const judged = work.filter(s => s.verdict);
    const targetCompliance = judged.length ? {
        judged: judged.length, within: judged.filter(s => s.verdict === "within").length,
        fast: judged.filter(s => s.verdict === "fast").length, slow: judged.filter(s => s.verdict === "slow").length,
        pct: Math.round((judged.filter(s => s.verdict === "within").length / judged.length) * 100)
    } : null;

    // How sure the matching is.
    const seen = steps.filter(s => s.lapIndexes.length);
    let matchConfidence;
    if (!laps.length || !seen.length || (kind !== "auto" && !work.some(s => s.lapIndexes.length))) matchConfidence = "unmatched";
    else if (kind === "auto") matchConfidence = "low";
    else {
        matchConfidence = seen.reduce((c, s) => worse(c, s.matchConfidence), "exact");
        const realExtras = extras.filter(x => !tinyLap(laps[x]));
        if (matchConfidence === "exact" && (missed || partial || realExtras.length || steps.some(s => !s.optional && !s.lapIndexes.length))) matchConfidence = "approximate";
        if (seen.length && cost / seen.length > 1.2) matchConfidence = worse(matchConfidence, "low");
    }

    const overallStatus = !completion || completion.pct == null ? "unknown"
        : done === work.length ? "completed" : done + partial === 0 ? "missed" : "partial";
    const sets = [...new Set(work.map(s => s.set))].map(n => setSummary(steps, n)).filter(Boolean);
    const out = { ...base, matchConfidence, overallStatus, completion, targetCompliance, steps, sets, extras: extras.map(x => laps[x].i) };
    out.read = executionRead(out);
    return out;
}

// ---------- the Southbound Read ----------

function setLine(st, steps) {
    const reps = steps.filter(s => s.kind === "work" && s.set === st.set);
    const single = st.planned === 1;
    const head = single ? `${st.label}${st.target ? ` (target ${st.target})` : ""}` : `${st.label}${st.target ? ` (target ${st.target})` : ""}`;
    if (!st.done && !st.partial) return st.unobserved ? "" : `${head}: not done.`;
    const bits = [];
    if (single) {
        const s = reps.find(x => x.status === "done" || x.status === "partial");
        const long = s.distanceM > MILE * 1.05;
        const time = s.normalizedSec != null ? `${clockText(s.normalizedSec, { tenths: s.distanceM < 1000 })}${long ? ` (${clockText(s.actual.paceSec)}/mi)` : ""}` : s.actual.paceSec ? `${clockText(s.actual.paceSec)}/mi` : clockText(s.actual.seconds);
        bits.push(`${time}${s.verdict ? `, ${s.verdict === "within" ? "within target" : deltaText(s.deltaSec ?? s.deltaPace) + (s.deltaSec == null ? " per mile" : "")}` : ""}${s.status === "partial" ? ` (${s.notes[0]})` : ""}`);
    } else {
        if (st.avgSec != null) bits.push(`averaged ${clockText(st.avgSec, { tenths: st.avgSec < 600 })}`);
        else if (st.avgPace) bits.push(`averaged ${clockText(st.avgPace)}/mi`);
        if (st.judged) {
            const off = [st.fast ? `${st.fast} fast` : "", st.slow ? `${st.slow} slow` : ""].filter(Boolean).join(", ");
            bits.push(`${st.within} of ${st.judged} within target${off ? ` (${off})` : ""}`);
        }
        if (st.spreadSec != null && st.done >= 3) {
            const trend = st.fadeSec == null || Math.abs(st.fadeSec) < 1.5 ? "even through the set" : st.fadeSec > 0 ? `slowing about ${spanText(st.fadeSec)} from the first reps to the last` : `getting about ${spanText(st.fadeSec)} faster from the first reps to the last`;
            bits.push(`${spanText(st.spreadSec)} from fastest to slowest, ${trend}`);
        }
    }
    return `${head}: ${bits.join("; ")}.`;
}

/** Plain, factual lines: what was done, how it compared, how sure the matching is. */
export function executionRead(x) {
    const lines = [];
    const c = x.completion;
    if (!x.source.laps) return ["No laps for this run yet, so it can't be compared rep by rep."];
    if (x.source.kind === "auto" && (!c || c.pct == null)) {
        lines.push("COROS has only mile laps for this run, so the reps can't be told apart. Send the workout to the watch and run it as a workout to see each rep.");
        return lines;
    }
    if (c) {
        const work = x.steps.filter(s => s.kind === "work");
        const issues = work.filter(s => s.status !== "done" && s.status !== "unobserved")
            .map(s => `${s.of > 1 ? `rep ${s.rep}` : s.amount} ${s.status === "partial" ? s.notes[0] : "missed"}`);
        const reps = work.some(s => s.of > 1), blocks = work.some(s => s.of === 1);
        lines.push(c.done === c.planned ? (reps && blocks ? "Every rep and block done." : reps ? "Every rep done." : "The work was done in full.") : `${c.text}${issues.length ? ` (${issues.slice(0, 3).join(", ")})` : ""}.`);
    }
    for (const st of x.sets) { const l = setLine(st, x.steps); if (l) lines.push(l); }
    if (x.targetCompliance && x.targetCompliance.within < x.targetCompliance.judged && x.targetCompliance.fast > x.targetCompliance.slow) {
        lines.push("Faster than the target isn't better here: the session asks for that pace.");
    }
    if (x.matchConfidence === "approximate") lines.push("Laps matched approximately (an extra lap press, GPS drift or a step not run as planned).");
    if (x.matchConfidence === "low") lines.push(x.source.kind === "auto"
        ? "COROS has only mile laps for this run, so only the parts that start and end on a mile are measured; treat them as rough."
        : "The laps don't line up well with the plan, so treat these numbers as rough.");
    return lines;
}
