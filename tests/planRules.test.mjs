// Plan rules (js/planRules.js): ported from the sandbox's 19 tests, plus the
// taper-wins, skipped-counts, taper pace ban and approval-gate cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    pacesFromGoal, midpointSeconds, evaluatePaceHistory, proposePaceChange, handleMissed,
    notFeeling100, proposeRealignment, approve, missedCount
} from "../js/planRules.js";

const S = (day, kind, status = "planned") => ({ day, kind, status });
const week = (...s) => ({ sessions: s });

test("paces come from the app's one pace table (3:05 marathon)", () => {
    const p = pacesFromGoal("3:05:00", "MARATHON");
    assert.ok(Math.abs(p.marathon - 423) <= 2);       // 7:03/mi
    assert.equal(p.tempo, 407);                          // 6:42-6:52 middle = 6:47
    assert.ok(p.tempo < p.marathon);
    assert.equal(pacesFromGoal("", "MARATHON"), null);
    assert.equal(midpointSeconds("6:58-7:08"), 423);
});

test("pace history: one session holds", () => assert.equal(evaluatePaceHistory([400], 420), "hold"));
test("pace history: repeated beat tightens, outlier ignored", () => assert.equal(evaluatePaceHistory([405, 402, 330], 420), "tighten"));
test("pace history: repeated miss eases", () => assert.equal(evaluatePaceHistory([435, 438], 420), "ease"));
test("pace history: mixed holds", () => assert.equal(evaluatePaceHistory([405, 435], 420), "hold"));
test("pace proposal is not approved", () => {
    const p = proposePaceChange(420, "tighten");
    assert.equal(p.approved, false);
    assert.equal(p.to, 415);
});
test("no pace tightening in a taper, easing still allowed", () => {
    const t = proposePaceChange(420, "tighten", { weeksToRace: 1.1 });
    assert.equal(t.proposal, "hold");
    assert.equal(t.to, 420);
    assert.equal(proposePaceChange(420, "tighten", { weeksToRace: 3 }).proposal, "tighten");
    assert.equal(proposePaceChange(420, "ease", { weeksToRace: 1.1 }).proposal, "ease");
});

test("one missed: drag or skip, no make-up session", () => {
    const r = handleMissed(week(S("Tue", "interval", "missed"), S("Sat", "long")));
    assert.equal(r.action, "DRAG_OR_SKIP");
    assert.equal(r.compensatory_session, "none");
    assert.match(r.note, /Do not add a make-up session/);
});
test("two missed: still no rebuild", () => {
    const r = handleMissed(week(S("Tue", "interval", "missed"), S("Thu", "tempo", "missed"), S("Sat", "long")));
    assert.equal(r.action, "DRAG_OR_SKIP");
    assert.equal(r.compensatory_session, "none");
});
test("three missed prompts the coach", () => {
    const r = handleMissed(week(S("Tue", "interval", "missed"), S("Thu", "tempo", "missed"), S("Sat", "long", "missed")));
    assert.equal(r.action, "PROMPT_COACH_TO_REALIGN");
    assert.equal(r.approved, false);
});
test("skipped sessions count like missed ones", () => {
    const w = week(S("Tue", "interval", "skipped"), S("Thu", "tempo", "skipped"), S("Sat", "long", "missed"));
    assert.equal(missedCount(w), 3);
    assert.equal(handleMissed(w).action, "PROMPT_COACH_TO_REALIGN");
});
test("in a taper the only option offered is protecting it", () => {
    const w = week(S("Tue", "interval", "missed"), S("Thu", "tempo", "missed"), S("Sat", "long", "missed"));
    assert.deepEqual(handleMissed(w, { weeksToRace: 1.1 }).options, ["protect_taper"]);
});
test("nothing missed: no action", () => assert.equal(handleMissed(week(S("Tue", "easy"))).action, "NO_ACTION"));

test("not feeling 100%: hard sessions dialled back, easy kept", () => {
    const r = notFeeling100(week(S("Tue", "interval"), S("Thu", "tempo"), S("Sat", "easy")));
    assert.deepEqual(r.sessions_dialled_back, ["Tue", "Thu"]);
    assert.match(r.return_week, /held paces/);
    assert.match(r.return_week, /first hard session only after a coach check/);
    assert.equal(r.approved, false);
});

test("realignment: taper protects, reversible, unapproved", () => {
    const r = proposeRealignment(1.1, 1, "busy");
    assert.equal(r.recommendation, "PROTECT_TAPER");
    assert.equal(r.approved, false);
    assert.equal(r.reversible, true);
});
test("realignment: illness in taper is a race call, no recovery week", () => {
    const r = proposeRealignment(1.1, 1, "illness");
    assert.equal(r.recommendation, "PROTECT_TAPER_COACH_RACE_CALL");
    assert.doesNotMatch(r.detail, /recovery easy week first/);
});
test("realignment: taper wins over 2-4 missed weeks and over 5+", () => {
    assert.equal(proposeRealignment(1.1, 2).recommendation, "PROTECT_TAPER_COACH_RACE_CALL");
    assert.equal(proposeRealignment(2.5, 3, "illness").recommendation, "PROTECT_TAPER_COACH_RACE_CALL");
    assert.equal(proposeRealignment(1.1, 6).recommendation, "PROTECT_TAPER_COACH_RACE_CALL");
    assert.doesNotMatch(proposeRealignment(1.1, 6).detail, /restart a new|Rebuild to the same/i);
});
test("realignment: peak, base, 2 weeks, 5 weeks", () => {
    assert.equal(proposeRealignment(4, 1).recommendation, "REBUILD_TO_RACE_DATE");
    assert.equal(proposeRealignment(10, 1).recommendation, "REPEAT_OR_EXTEND");
    assert.equal(proposeRealignment(8, 2).recommendation, "REBUILD_REDUCED");
    assert.equal(proposeRealignment(12, 5).recommendation, "RESTART_PLAN");
});
test("realignment: illness outside taper adds recovery first, not on a restart", () => {
    assert.equal(proposeRealignment(10, 1, "injury").recommendation, "REPEAT_OR_EXTEND_AFTER_RECOVERY");
    assert.equal(proposeRealignment(12, 5, "illness").recommendation, "RESTART_PLAN");
});
test("realignment: zero missed weeks recommends nothing", () => {
    assert.equal(proposeRealignment(10, 0).recommendation, "NO_REALIGNMENT");
});

test("only a coach can approve; the proposal is not mutated", () => {
    const p = proposeRealignment(4, 1);
    assert.throws(() => approve(p), /Only a coach/);
    assert.throws(() => approve(p, { isCoach: false }));
    const a = approve(p, { isCoach: true });
    assert.equal(a.approved, true);
    assert.equal(p.approved, false);
});

// ---- Pace v2 ----
import { proposePaceV2, sessionExclusion, fadeSeconds, PACE_V2_STEP_SEC } from "../js/planRules.js";
const T = (avgSec, extra = {}) => ({ kind: "tempo", avgSec, ...extra });
const P = 403;

test("v2: clean repeated beat tightens by 3 s, unapproved, easy untouched", () => {
    const r = proposePaceV2([T(388), T(385)], P);
    assert.equal(r.proposal, "tighten");
    assert.equal(r.to, P - PACE_V2_STEP_SEC);
    assert.equal(r.approved, false);
    assert.equal(r.easyPace, "unchanged");
});
test("v2: earlier beats, latest on target = monitoring, trend shown", () => {
    const r = proposePaceV2([T(388), T(385), T(403)], P);
    assert.equal(r.proposal, "hold");
    assert.equal(r.status, "MONITORING");
    assert.match(r.reason, /2 of 3 counted sessions beat the pace/);
});
test("v2: gradual drift holds but is surfaced", () => {
    const r = proposePaceV2([T(P - 8), T(P - 11), T(P - 14)], P);
    assert.equal(r.proposal, "hold");
    assert.equal(r.trend.drift, "faster");
    assert.match(r.reason, /Drifting faster/);
});
test("v2: wild reps are excluded, not averaged in", () => {
    const wild = T(P - 15, { repsSec: [P - 75, P + 45, P - 20] });
    assert.match(sessionExclusion(wild, P), /Reps varied/);
    assert.equal(proposePaceV2([wild, T(P - 15)], P).proposal, "hold");
});
test("v2: Eddie's real sets (spreads 14-20 s/mi) count as intervals; 30 s/mi still doesn't", () => {
    const set = (reps, kind = "interval") => ({ kind, avgSec: Math.round(reps.reduce((t, x) => t + x, 0) / reps.length), repsSec: reps });
    for (const reps of [[399, 418, 415, 413], [375, 387, 391, 395, 385, 387, 383, 384, 377], [371, 370, 378, 375, 383, 380, 388]]) {
        assert.equal(sessionExclusion(set(reps), set(reps).avgSec), null);
    }
    assert.match(sessionExclusion(set([360, 392, 380]), 380), /Reps varied by more than 25/);
});
test("v2: a set that faded says so (Sep 29: +11 s/mi), a flat one doesn't", () => {
    assert.equal(fadeSeconds([371, 370, 378, 375, 383, 380, 388]), 11);
    assert.equal(fadeSeconds([399, 418]), null);
    const r = proposePaceV2([{ kind: "interval", avgSec: 380, repsSec: [371, 370, 378, 375, 383, 380, 388] }, { kind: "interval", avgSec: 380, repsSec: [379, 380, 381, 380] }], 380);
    assert.ok(r.notes.some(n => /faded 11 s\/mi/.test(n)));
    assert.equal(r.notes.length, 1);
});
test("v2: a slow session in heat does not count toward easing; a beat in heat does", () => {
    const slowHot = T(P + 15, { context: { heat: true } });
    assert.equal(proposePaceV2([slowHot, slowHot], P).proposal, "hold");
    assert.equal(proposePaceV2([T(P + 15), T(P + 14)], P).proposal, "ease");
    const r = proposePaceV2([T(P - 12, { context: { heat: true } }), T(P - 13)], P);
    assert.equal(r.proposal, "tighten");
    assert.match(r.notes[0], /despite heat/);
});
test("v2: ineligible sessions are excluded (GPS, unplanned, incomplete, easy run)", () => {
    for (const bad of [T(P - 15, { gpsOk: false }), T(P - 15, { inPlan: false }), T(P - 15, { complete: false }), { kind: "easy", avgSec: P - 15 }]) {
        assert.ok(sessionExclusion(bad, P));
        assert.equal(proposePaceV2([bad, T(P - 15)], P).proposal, "hold");
    }
});
test("v2: outlier beyond 30 s is ignored", () => {
    assert.equal(proposePaceV2([T(P - 15), T(P - 18), T(P - 90)], P).proposal, "tighten");
});
test("v2: two changes in a row stops for the coach", () => {
    const r = proposePaceV2([T(P - 15), T(P - 15)], P, { consecutiveChanges: 2 });
    assert.equal(r.proposal, "hold");
    assert.equal(r.status, "COACH_REEVALUATE");
    assert.equal(proposePaceV2([T(P - 15), T(P - 15)], P, { consecutiveChanges: 1 }).proposal, "tighten");
});
test("v2: no tightening in a taper, easing still allowed", () => {
    const r = proposePaceV2([T(P - 15), T(P - 15)], P, { weeksToRace: 1.1 });
    assert.equal(r.status, "TAPER_HOLD");
    assert.equal(proposePaceV2([T(P + 15), T(P + 15)], P, { weeksToRace: 1.1 }).proposal, "ease");
});
test("v2: one time trial asks for a coach look and changes nothing", () => {
    const r = proposePaceV2([{ kind: "time_trial", avgSec: P - 20 }], P);
    assert.equal(r.proposal, "coach_review");
    assert.equal(r.to, P);
});
test("v2: one session or nothing holds", () => {
    assert.equal(proposePaceV2([T(P - 15)], P).proposal, "hold");
    assert.equal(proposePaceV2([], P).status, "MONITORING");
});

// ---- Heat v2 ----
import { proposeHeatAdjustment, heatBaseSeconds, heatDurationFactor, heatAdjustmentStale } from "../js/planRules.js";
const hot = (feelsLikeF, extra = {}) => ({ feelsLikeF, source: "forecast", ...extra });
const tempo60 = { kind: "tempo", minutes: 45, paceSec: 403 };

test("heat v2: nothing at or below 68F feels-like", () => {
    assert.equal(proposeHeatAdjustment(tempo60, hot(68)).proposal, "none");
    assert.equal(proposeHeatAdjustment(tempo60, hot(50)).proposal, "none");
    assert.equal(proposeHeatAdjustment(tempo60, { feelsLikeF: NaN }).proposal, "none");
});
test("heat v2: graduated, no cliff at 79 to 80 or 89 to 90", () => {
    assert.ok(heatBaseSeconds(72) > 0 && heatBaseSeconds(72) < heatBaseSeconds(75));
    assert.ok(Math.abs(heatBaseSeconds(80) - heatBaseSeconds(79)) <= 1.5);
    assert.ok(Math.abs(heatBaseSeconds(90) - heatBaseSeconds(89)) <= 1.5);
    assert.equal(heatBaseSeconds(120), heatBaseSeconds(105));
});
test("heat v2: a short tempo and a long run at the same heat differ", () => {
    const tempo = proposeHeatAdjustment({ kind: "tempo", minutes: 30, paceSec: 403 }, hot(85));
    const long = proposeHeatAdjustment({ kind: "long", minutes: 150, paceSec: 453 }, hot(85));
    assert.ok(long.adjustmentSec > tempo.adjustmentSec);
    assert.equal(heatDurationFactor(30), 1);
    assert.equal(heatDurationFactor(90), 1.25);
    assert.equal(heatDurationFactor(200), 1.5);
});
test("heat v2: intervals scale less than a tempo of the same length", () => {
    const i = proposeHeatAdjustment({ kind: "interval", minutes: 50, paceSec: 388 }, hot(85));
    const t = proposeHeatAdjustment({ kind: "tempo", minutes: 50, paceSec: 403 }, hot(85));
    assert.ok(i.adjustmentSec < t.adjustmentSec);
    assert.ok(i.notes.some(n => /longer rests/.test(n)));
});
test("heat v2: easy runs go by effort, long runs get a fluid plan", () => {
    assert.match(proposeHeatAdjustment({ kind: "easy", minutes: 40, paceSec: 468 }, hot(80)).notes[0], /by effort/);
    const long = proposeHeatAdjustment({ kind: "long", minutes: 100, paceSec: 453 }, hot(80));
    assert.ok(long.options.includes("shift_time"));
    assert.ok(long.notes.some(n => /sodium/.test(n)));
});
test("heat v2: RPE is always an option; 95F+ offers move, shorten, skip first", () => {
    const warm = proposeHeatAdjustment(tempo60, hot(80));
    assert.ok(warm.options.includes("rpe"));
    assert.ok(!warm.options.includes("skip"));
    const extreme = proposeHeatAdjustment(tempo60, hot(98));
    assert.equal(extreme.proposal, "options_first");
    for (const o of ["rpe", "move", "shorten", "skip"]) assert.ok(extreme.options.includes(o));
});
test("heat v2: acclimation reduces only when the coach confirms and 14+ days", () => {
    const full = proposeHeatAdjustment(tempo60, hot(90), { heatDays: 20 });
    const unconfirmed = proposeHeatAdjustment(tempo60, hot(90), { heatDays: 20, coachConfirmedAcclimated: false });
    const reduced = proposeHeatAdjustment(tempo60, hot(90), { heatDays: 20, coachConfirmedAcclimated: true });
    const early = proposeHeatAdjustment(tempo60, hot(90), { heatDays: 5, coachConfirmedAcclimated: true });
    assert.equal(full.adjustmentSec, unconfirmed.adjustmentSec);
    assert.ok(reduced.adjustmentSec < full.adjustmentSec);
    assert.equal(early.adjustmentSec, full.adjustmentSec);
});
test("heat v2: forecast labelled, unapproved, hands heat context to pace, no same-benefit claim", () => {
    const r = proposeHeatAdjustment(tempo60, hot(88, { at: "6 am" }));
    assert.equal(r.approved, false);
    assert.match(r.basis, /forecast, not a body measurement/i);
    assert.deepEqual(r.paceContext, { heat: true });
    assert.doesNotMatch(JSON.stringify(r), /same (training )?benefit/i);
    assert.equal(r.paceTo, 403 + r.adjustmentSec);
});
test("heat v2: stale when forecast moves 5F, the session moves or settings change", () => {
    const acc = { feelsLikeF: 85, sessionAt: "2026-11-03T06:00", settingsKey: "a" };
    assert.equal(heatAdjustmentStale(acc, { ...acc, feelsLikeF: 88 }), false);
    assert.equal(heatAdjustmentStale(acc, { ...acc, feelsLikeF: 90 }), true);
    assert.equal(heatAdjustmentStale(acc, { ...acc, sessionAt: "2026-11-03T17:00" }), true);
    assert.equal(heatAdjustmentStale(acc, { ...acc, settingsKey: "b" }), true);
    assert.equal(heatAdjustmentStale(null, acc), false);
});
