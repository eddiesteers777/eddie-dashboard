// Pace suggestions from shared laps (js/paceSuggestions.js) -> Pace v2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planDayFromMarathon } from "../js/marathonCoros.js";
import { PACES } from "../js/marathonData.js";
import { reconstructWorkout } from "../js/workoutExecution.js";
import { paceSuggestions, speedSessionFrom, contextFrom } from "../js/paceSuggestions.js";

const TEMPO = planDayFromMarathon({ session: "2mi WU; 3mi @ 6:43; 1mi CD", miles: 6, pace: "Threshold" }, PACES).workout;
let n = 0;
const lap = (m, s, hr = 150) => ({ i: ++n, m, s, hr });
// 3 mi at `pace` s/mi: warm-up, tempo, cool-down.
const tempoLaps = pace => { n = 0; return { kind: "laps", laps: [lap(3219, 900, 135), lap(4828, Math.round(pace * 3 * 4828 / 4828), 165), lap(1609, 480, 140)] }; };
const key = (date, pace) => ({ id: `plan|${date}`, date, title: "Tempo", kind: "quality", workout: TEMPO, run: { labelId: date }, _laps: tempoLaps(pace) });
const run = (items, extra = {}) => paceSuggestions({
    keyWork: items, laps: Object.fromEntries(items.map(w => [w.run.labelId, w._laps])), monday: "2026-11-02", ...extra
});

test("a rebuilt tempo becomes a speed session with the plan's pace, clean laps", () => {
    const x = reconstructWorkout(TEMPO, tempoLaps(388));
    const s = speedSessionFrom(x, { date: "2026-10-20" });
    assert.equal(s.kind, "tempo");
    assert.equal(s.plannedSec, 403);
    assert.ok(Math.abs(s.avgSec - 388) <= 1);
    assert.equal(s.complete, true);
    assert.equal(s.gpsOk, true);
});
test("two clean tempos that beat the pace give a tighten suggestion by 3 s", () => {
    const out = run([key("2026-10-20", 388), key("2026-10-27", 386)]);
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, "pace");
    assert.equal(out[0].proposal, "tighten");
    assert.match(out[0].title, /Tighten tempo pace by 3 s/);
    assert.match(out[0].text, /6:43 → 6:40/);
    assert.match(out[0].detail, /Easy pace stays by effort/);
});
test("one session, or on-pace sessions: nothing shows", () => {
    assert.deepEqual(run([key("2026-10-20", 388)]), []);
    assert.deepEqual(run([key("2026-10-20", 403), key("2026-10-27", 404)]), []);
});
test("a slow tempo the client tagged hot does not count toward easing", () => {
    const results = [{ date: "2026-10-20", conditions: ["hot"] }, { date: "2026-10-27", conditions: ["humid"] }];
    assert.deepEqual(run([key("2026-10-20", 420), key("2026-10-27", 421)], { results }), []);
    assert.equal(run([key("2026-10-20", 420), key("2026-10-27", 421)])[0].proposal, "ease");
});
test("in a taper a tighten becomes a hold", () => {
    const out = run([key("2026-10-20", 388), key("2026-10-27", 386)], { weeksToRace: 1.1 });
    assert.equal(out[0].status, "TAPER_HOLD");
    assert.match(out[0].title, /held \(taper\)/);
});
test("heat and weather tags map to context", () => {
    assert.deepEqual(contextFrom(["hot", "windy"]), { heat: true, weather: true });
    assert.deepEqual(contextFrom([]), { heat: false, weather: false });
});
