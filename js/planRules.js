/* ==========================================
   Southbound — plan rules (pure)

   Southbound's own rules for what to suggest when a week goes sideways.
   Modelled on what other apps do in public (missed workouts, pace trends,
   feeling off), written from scratch with every number stated here.
   Not any other app's formula, and none of it is a measurement.

   Every function returns a PROPOSAL with approved: false. Nothing here
   writes a plan. A proposal only counts once a coach approves it
   (approve()), and the coach publishes the change as a new plan version.

   Taper rule (Eddie, 2026-10-31): under 3 weeks to race, nothing is added
   and no pace is tightened. Missed weeks in a taper mean "protect the
   taper" plus a coach race call, never a rebuild or a restart.

   Paces: this file does not keep its own pace table. pacesFromGoal()
   reads js/coachPlanGenerator.js pacesFor(), the one table in the app.

   Unit-tested in tests/planRules.test.mjs.
========================================== */

import { pacesFor, goalSeconds } from "./coachPlanGenerator.js";

export const TAPER_WEEKS = 3;
export const PEAK_WEEKS = 6;
export const PACE_STEP_SEC = 5;      // test assumption, one step per proposal
export const PACE_MIN_GAP_SEC = 10;  // a session counts when it is this far off plan
export const PACE_OUTLIER_SEC = 30;  // further off than this is ignored

const RUN_KINDS = ["easy", "tempo", "interval", "long"];
const HARD_KINDS = ["tempo", "interval", "long"];
const isTaper = weeksToRace => Number.isFinite(weeksToRace) && weeksToRace < TAPER_WEEKS;

/** "6:58-7:08" -> 423 (the middle, in seconds per mile). */
export function midpointSeconds(range) {
    const parts = String(range || "").split("-").map(t => {
        const [m, s] = t.split(":").map(Number);
        return m * 60 + s;
    });
    return parts.length === 2 && parts.every(Number.isFinite) ? (parts[0] + parts[1]) / 2 : null;
}

/** Pace targets (seconds per mile) from a goal race time, from the app's one pace table. */
export function pacesFromGoal(goalTime, raceType) {
    const table = pacesFor({ mode: "race", goalTime, raceType });
    if (!table) return null;
    const out = {};
    for (const key of ["marathon", "tempo", "threshold", "10K", "5K"]) {
        const v = midpointSeconds(table[key]);
        if (v) out[key] = v;
    }
    return { ...out, goalSeconds: goalSeconds(goalTime, raceType) };
}

export function mmss(seconds) {
    let m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
    if (s === 60) { m += 1; s = 0; }
    return `${m}:${String(s).padStart(2, "0")}/mi`;
}

/**
 * Pace pattern from past sessions of one type (actual seconds per mile, most
 * recent last). Outliers are ignored. Needs 2+ left, all on the same side by
 * 10 s or more. One session, or mixed results, holds.
 * Returns "tighten" | "ease" | "hold".
 */
export function evaluatePaceHistory(history, plannedSec) {
    const kept = (history || []).filter(p => Number.isFinite(p) && Math.abs(p - plannedSec) <= PACE_OUTLIER_SEC);
    if (kept.length < 2) return "hold";
    const diffs = kept.map(p => p - plannedSec);
    if (diffs.every(d => d <= -PACE_MIN_GAP_SEC)) return "tighten";
    if (diffs.every(d => d >= PACE_MIN_GAP_SEC)) return "ease";
    return "hold";
}

/** A pace proposal. Never applied here. Tightening in a taper is held. */
export function proposePaceChange(currentSec, decision, { step = PACE_STEP_SEC, weeksToRace = null } = {}) {
    if (decision === "tighten" && isTaper(weeksToRace)) {
        return { proposal: "hold", from: currentSec, to: currentSec, approved: false,
            reason: "Under 3 weeks to race: no pace is tightened. A change now adds risk and can't build fitness. Only a coach race call changes this." };
    }
    if (decision === "tighten") {
        return { proposal: "tighten", from: currentSec, to: currentSec - step, approved: false,
            reason: "Repeated pattern: beating the pace by 10 s or more on 2+ sessions, outliers ignored." };
    }
    if (decision === "ease") {
        return { proposal: "ease", from: currentSec, to: currentSec + step, approved: false,
            reason: "Repeated pattern: missing the pace by 10 s or more on 2+ sessions, outliers ignored." };
    }
    return { proposal: "hold", from: currentSec, to: currentSec, approved: false,
        reason: "No repeated pattern, or an outlier or mixed results. Pace stays." };
}

const runs = week => (week?.sessions || []).filter(s => RUN_KINDS.includes(s.kind));
// "skipped" counts the same as "missed": ticking it off doesn't hide it from the coach.
const wasMissed = s => s.status === "missed" || s.status === "skipped";
export const missedCount = week => (week?.sessions || []).filter(wasMissed).length;
export const missedWeek = week => runs(week).length > 0 && runs(week).every(wasMissed);

/**
 * Missed sessions in one week. 1-2: drag or skip, never a catch-up session.
 * 3+, or every run missed: ask the coach to realign.
 */
export function handleMissed(week, { weeksToRace = null } = {}) {
    const n = missedCount(week);
    if (missedWeek(week) || n >= 3) {
        return { action: "PROMPT_COACH_TO_REALIGN", missed: n, approved: false,
            options: isTaper(weeksToRace) ? ["protect_taper"] : ["compress_to_race_date", "repeat_week", "extend_plan"],
            compensatory_session: "none",
            note: "Do not rebuild the plan silently. The coach chooses." };
    }
    if (n >= 1) {
        return { action: "DRAG_OR_SKIP", missed: n, compensatory_session: "none",
            note: n === 1
                ? "One missed session. The week stays as it is. Do not add a make-up session, especially a missed long run on the next day."
                : "Two missed sessions. No rebuild; watch next week. Do not add make-up sessions." };
    }
    return { action: "NO_ACTION", missed: 0, compensatory_session: "none" };
}

/** Not feeling 100%: hard days go easy or rest, and the return is held until a coach checks. */
export function notFeeling100(week) {
    const days = (week?.sessions || [])
        .filter(s => HARD_KINDS.includes(s.kind) && (s.status || "planned") === "planned").map(s => s.day);
    return { action: "DIAL_BACK", sessions_dialled_back: days, approved: false,
        replacement: "Easy or rest only, on the affected days.",
        return_week: "Return at held paces (no tightened pace carried over); first hard session only after a coach check. Don't resume full hard volume at once." };
}

/**
 * Phase-aware realignment. reason: "busy" | "illness" | "injury".
 * Taper is checked first and always wins (Eddie, 2026-10-31).
 */
export function proposeRealignment(weeksToRace, missedWeeks, reason = "busy") {
    const sick = reason === "illness" || reason === "injury";
    const base = { approved: false, reversible: true,
        note: "Draft only. The coach approves, edits or rejects it. Reversible until approved." };
    if (!(missedWeeks >= 1)) {
        return { ...base, recommendation: "NO_REALIGNMENT", detail: "Nothing missed that needs realigning." };
    }
    let rec, detail;
    if (isTaper(weeksToRace)) {
        rec = "PROTECT_TAPER";
        detail = "Under 3 weeks to race. Drop the missed sessions. No catch-up long run, no added volume, no repeat of a peak week. Keep short tempo, strides and easy running. The race date is fixed, so extending, rebuilding and restarting are not options.";
        if (sick || missedWeeks >= 2) {
            rec += "_COACH_RACE_CALL";
            detail += sick
                ? " Illness or injury this close to the race leaves no time for a recovery week. It becomes a race-readiness call. Don't force sharpening sessions while ill."
                : " Two or more weeks missed this close to the race: the coach and athlete decide what the race looks like now. Nothing is rebuilt.";
        }
        return { ...base, recommendation: rec, detail };
    }
    if (missedWeeks >= 5) {
        rec = "RESTART_PLAN";
        detail = "More than a month away. Don't resume where the plan left off. Start with an easy test week, then build a new plan.";
    } else if (missedWeeks >= 2) {
        rec = "REBUILD_REDUCED";
        detail = "2 to 4 weeks away. Rebuild to the same race date at lower volume: step back 1 to 2 weeks, start with an easy week, check fitness again. Don't stack missed volume onto the next week.";
    } else if (weeksToRace <= PEAK_WEEKS) {
        rec = "REBUILD_TO_RACE_DATE";
        detail = "3 to 6 weeks to race. Rebuild to the same race date. Drop the lowest-value sessions (duplicate easy runs), keep the key ones, and don't add the missed long run to next week.";
    } else {
        rec = "REPEAT_OR_EXTEND";
        detail = "More than 6 weeks to race. Repeat the missed week or extend the plan by a week; the coach chooses. Keep the ramp to about 10% over the last full week.";
    }
    if (sick && rec !== "RESTART_PLAN") {
        rec += "_AFTER_RECOVERY";
        detail += " Illness or injury: an easy recovery week first, and a coach check before any hard session.";
    }
    return { ...base, recommendation: rec, detail };
}

/** Only a coach can approve. Returns a copy; the input is never changed. */
export function approve(proposal, { isCoach = false } = {}) {
    if (!isCoach) throw new Error("Only a coach can approve a plan change.");
    return { ...proposal, approved: true };
}
