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
