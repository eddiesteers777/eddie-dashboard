import { test } from "node:test";
import assert from "node:assert/strict";
import { planDayFromMarathon } from "../js/marathonCoros.js";
import { PACES } from "../js/marathonData.js";
import { heatCardModel, heatSession } from "../js/heatCard.js";

const workout = planDayFromMarathon({ session: "2mi WU; 3mi @ 6:43; 1mi CD", miles: 6, pace: "Threshold" }, PACES).workout;
const tempo = { type: "tempo", workout };

test("the session reads from the plan: kind, minutes, pace", () => {
    assert.deepEqual(heatSession(tempo, 45), { kind: "tempo", minutes: 45, paceSec: 403 });
    assert.equal(heatSession({ type: "long" }, 100).kind, "long");
    assert.equal(heatSession({ type: "easy" }, 40).paceSec, null);
});
test("nothing typed: empty prompt, no card", () => {
    const m = heatCardModel({ day: tempo, feelsLikeF: "" });
    assert.equal(m.empty, true);
    assert.equal(m.show, false);
});
test("at or below 68F: says no change", () => {
    const m = heatCardModel({ day: tempo, feelsLikeF: 60, minutes: 45 });
    assert.equal(m.show, false);
    assert.equal(m.headline, "No heat change");
});
test("88F tempo: 6:43 to 7:01, RPE line, forecast wording in the message", () => {
    const m = heatCardModel({ day: tempo, feelsLikeF: 88, minutes: 45, dateText: "Tue" });
    assert.equal(m.show, true);
    assert.equal(m.headline, "6:43 → 7:01 per mile");
    assert.ok(m.lines.some(l => /by effort \(RPE\)/.test(l)));
    assert.match(m.message, /feels-like of 88°F/);
    assert.match(m.message, /not a measurement/);
});
test("98F: move, shorten, skip come first, the slower pace is last", () => {
    const m = heatCardModel({ day: tempo, feelsLikeF: 98, minutes: 45 });
    assert.equal(m.extreme, true);
    assert.deepEqual(m.options.slice(0, 3), ["Move it to a cooler time of day", "Shorten it", "Skip it"]);
    assert.match(m.options[3], /last choice/);
});
test("an easy run with no pace still gets a plain suggestion", () => {
    const m = heatCardModel({ day: { type: "easy" }, feelsLikeF: 85, minutes: 40 });
    assert.equal(m.show, true);
    assert.match(m.headline, /s a mile slower/);
    assert.ok(m.lines.some(l => /by effort/.test(l)));
});
