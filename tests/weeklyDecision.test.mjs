// Unit tests for the weekly decision (js/weeklyDecision.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { concernDomains, decideLevel, groupVotes, suggestChanges, weekDecision, outcomeOf, replayDecisions, DEFAULT_POLICY, DECISION_VERSION } from "../js/weeklyDecision.js";
import { addDays } from "../js/athleteLedger.js";

const TODAY = "2026-10-04";
const dom = (key, severity) => ({ key, label: key, severity, text: key });
const wobble = i => [0, 3, -2, 1, -3, 2, -1][i % 7];
function health(override = () => ({})) {
    const h = {};
    for (let i = 0; i < 90; i++) h[addDays(TODAY, -i)] = { hrv: { avg: 60 + wobble(i) }, rhr: 48 + (i % 3) - 1, sleep: { asleepMin: 450 }, ...override(i) };
    return h;
}
const week = [
    { date: "2026-10-05", week: 12, index: 0, dayName: "Mon", session: "Recovery jog", miles: 5, pace: "Recovery", kind: "easy", phase: "peak" },
    { date: "2026-10-06", week: 12, index: 1, dayName: "Tue", session: "6x1mi @ Threshold", miles: 10, pace: "Threshold", kind: "quality", phase: "peak" },
    { date: "2026-10-07", week: 12, index: 2, dayName: "Wed", session: "Easy aerobic", miles: 8, pace: "Easy", kind: "easy", phase: "peak" },
    { date: "2026-10-08", week: 12, index: 3, dayName: "Thu", session: "8mi @ MP", miles: 12, pace: "MP", kind: "quality", phase: "peak" },
    { date: "2026-10-09", week: 12, index: 4, dayName: "Fri", session: "Rest", miles: 0, pace: "", kind: "rest", phase: "peak" },
    { date: "2026-10-10", week: 12, index: 5, dayName: "Sat", session: "Long run", miles: 20, pace: "Long run", kind: "long", phase: "peak" },
    { date: "2026-10-11", week: 12, index: 6, dayName: "Sun", session: "Easy", miles: 6, pace: "Easy", kind: "easy", phase: "peak" }
];

test("the level counts agreeing domains: one noisy signal never moves the plan", () => {
    const lv = (domains, extra = {}) => decideLevel({ domains, flags: [], effort: null, ...extra }).level;
    assert.equal(lv([]), "proceed");
    assert.equal(lv([dom("sleep", 1)]), "proceed");
    assert.equal(lv([dom("sleep", 2)]), "absorb");
    assert.equal(lv([dom("sleep", 1), dom("load", 1)]), "absorb");
    assert.equal(lv([dom("sleep", 1), dom("load", 1), dom("autonomic", 1)]), "ease");
    assert.equal(lv([dom("sleep", 2), dom("load", 2)]), "ease");
    assert.equal(lv([], { effort: { verdict: "costlier", mean: 1.6, n: 3 } }), "proceed", "B6: no separate effort shortcut (it's the response vote)");
    assert.equal(lv([dom("response", 3)]), "absorb", "a strong response alone is one moderate vote");
    assert.equal(lv([dom("sleep", 1), dom("load", 1), dom("autonomic", 1), dom("response", 1)]), "recover", "every group: load, response and two of recovery");
    assert.equal(decideLevel({ domains: [dom("sleep", 2), dom("load", 2)], flags: [] }, { previous: "ease" }).level, "recover", "a second Ease week");
    assert.equal(lv([dom("sleep", 1)], { flags: [{ key: "pain", text: "Pain: knee" }] }), "checkin");
    assert.equal(lv([dom("autonomic", 3), dom("subjective", 3), dom("response", 3)]), "checkin");
});

test("grouped votes (audit B6): HRV, sleep and feel count at most twice; load and response once each", () => {
    assert.deepEqual(groupVotes([dom("sleep", 1)]), { stimulus: 0, response: 0, recovery: 1 });
    assert.deepEqual(groupVotes([dom("sleep", 3), dom("autonomic", 3), dom("subjective", 3)]), { stimulus: 0, response: 0, recovery: 2 });
    const lv = domains => decideLevel({ domains, flags: [] });
    // The old count would have been 4 (Recover); the related signals now stay at two votes.
    const four = lv([dom("sleep", 1), dom("load", 1), dom("autonomic", 1), dom("subjective", 1)]);
    assert.deepEqual([four.level, four.count], ["ease", 3]);
    const recov = lv([dom("sleep", 3), dom("autonomic", 3), dom("subjective", 2)]);
    assert.deepEqual([recov.level, recov.count, recov.moderate], ["ease", 2, 2], "all three recovery signals strong: Ease, not Recover");
    assert.equal(DECISION_VERSION, "0.2.0");
    const d = weekDecision(TODAY, { health: health(i => (i < 7 ? { hrv: { avg: 44 }, rhr: 56, sleep: { asleepMin: 300 } } : {})), checkins: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [addDays(TODAY, -i), i < 7 ? { soreness: 5, energy: 1, mood: 1 } : { soreness: 1, energy: 5, mood: 5 }])) }, week);
    assert.ok(d.domains.filter(x => x.severity >= 1).length === 3 && d.count === 2, JSON.stringify(d.domains.map(x => [x.key, x.severity])));
    assert.match(d.summary, /^Two signals agree: .+ HRV, sleep and how you feel are related, so together they count as two signals, not three\./);
});

test("Absorb: easy runs to 90%, quality at the slow end, long run untouched", () => {
    const { changes } = suggestChanges("absorb", week);
    const by = n => changes.find(c => c.dayName === n);
    assert.equal(by("Wed").after.miles, 7);
    assert.equal(by("Mon").after.miles, 4.5);
    assert.match(by("Tue").after.session, /slower end of the pace range/);
    assert.equal(by("Sat"), undefined);
    assert.ok(changes.every(c => c.after.miles <= c.before.miles));
});

test("Ease: easy 80%, long 85%, one quality session loses a quarter of its reps at the same pace", () => {
    const { changes, notes } = suggestChanges("ease", week);
    const by = n => changes.find(c => c.dayName === n);
    assert.equal(by("Wed").after.miles, 6.5);
    assert.equal(by("Sat").after.miles, 17);
    assert.equal(by("Tue").after.session, "4x1mi @ Threshold");
    assert.equal(by("Tue").after.pace, "Threshold");
    assert.equal(by("Thu"), undefined, "only one quality session is cut");
    assert.match(notes.join(" "), /one set fewer/);
});

test("Recover: 3 days easy at 65% (quality becomes easy), then the plan", () => {
    const { changes } = suggestChanges("recover", week);
    assert.deepEqual(changes.map(c => c.dayName), ["Mon", "Tue", "Wed"]);
    assert.equal(changes[1].after.pace, "Easy");
    assert.match(changes[1].after.session, /Easy run \(was: 6x1mi/);
    assert.equal(changes[1].after.miles, 6.5);
});

test("race week and taper protection; the athlete's own percentages; never above the plan", () => {
    const race = week.map((d, i) => (i === 6 ? { ...d, kind: "race", race: true } : d));
    const r = suggestChanges("ease", race);
    assert.equal(r.changes.length, 0);
    assert.match(r.notes[0], /Race week/);
    const taper = week.map(d => ({ ...d, phase: "taper" }));
    const t = suggestChanges("ease", taper);
    assert.ok(t.changes.every(c => c.after.miles === c.before.miles));
    assert.ok(t.changes.some(c => /slower end/.test(c.after.session)));
    const mine = suggestChanges("absorb", week, { ...DEFAULT_POLICY, absorbEasy: 0.5 });
    assert.equal(mine.changes.find(c => c.dayName === "Wed").after.miles, 4);
    const silly = suggestChanges("absorb", week, { absorbEasy: 1.4 });
    assert.ok(silly.changes.every(c => c.after.miles <= c.before.miles));
    assert.deepEqual(suggestChanges("checkin", week).changes, []);
});

test("concern domains from real inputs: low HRV and a sleep debt; pain flags a check-in", () => {
    const h = health(i => (i < 7 ? { hrv: { avg: 50 }, sleep: { asleepMin: 360 } } : {}));
    const c = concernDomains(TODAY, { health: h, checkins: {} });
    const by = k => c.domains.find(d => d.key === k);
    assert.ok(by("autonomic").severity >= 2, JSON.stringify(by("autonomic")));
    assert.equal(by("sleep").severity, 3);
    assert.match(by("sleep").text, /10h 30m short/);
    const d = weekDecision(TODAY, { health: h, checkins: {} }, week);
    assert.equal(d.version, DECISION_VERSION);
    assert.equal(d.level, "ease");
    assert.match(d.summary, /^Two signals agree: /);
    assert.ok(d.changes.length >= 4);
    const p = weekDecision(TODAY, { health: health(), checkins: { [TODAY]: { pain: "left Achilles" } } }, week);
    assert.equal(p.level, "checkin");
    assert.equal(p.changes.length, 0);
    assert.match(p.summary, /left Achilles/);
    assert.match(weekDecision(TODAY, { health: health() }, week).summary, /^Nothing's off/);
});

test("what happened next, and the replay's hit / false-alarm / miss rates (judged on missed sessions and new pain)", () => {
    const decision = { asOf: "2026-09-12" };
    const planDays = Array.from({ length: 7 }, (_, i) => ({ date: addDays("2026-09-13", i), miles: 6 }));
    const doses = [{ date: "2026-09-13", miles: 6 }, { date: "2026-09-14", miles: 8 }, { date: "2026-09-17", miles: 6 }, { date: "2026-09-18", miles: 6 }, { date: "2026-09-19", miles: 6 }];
    const o = outcomeOf(decision, { planDays, doses, checkins: {} }, TODAY);
    assert.equal(o.missed, 2, "Sep 15 and 16 skipped");
    assert.equal(o.trouble, true);
    assert.equal(o.miles, 32);
    assert.equal(outcomeOf({ asOf: "2026-10-01" }, { planDays, doses }, TODAY).pending, true);
    const fresh = outcomeOf(decision, { planDays, doses: planDays, checkins: { "2026-09-15": { pain: "knee" } } }, TODAY);
    assert.deepEqual([fresh.missed, fresh.flags, fresh.trouble], [0, 1, true]);
    const ongoing = outcomeOf(decision, { planDays, doses: planDays, checkins: { "2026-09-10": { pain: "knee" }, "2026-09-15": { pain: "knee" } } }, TODAY);
    assert.equal(ongoing.trouble, false, "pain that was already there isn't new trouble");

    // 30 weeks of a plan; every 4th week runs get skipped, and HRV and sleep sink the week before.
    const n = date => Math.round((new Date(`${TODAY}T12:00:00`) - new Date(`${date}T12:00:00`)) / 864e5);
    const bad = date => n(date) % 28 >= 14 && n(date) % 28 < 21;
    const before = date => n(date) % 28 >= 21;
    const h = {}, plan = [], done = [];
    for (let i = 0; i < 230; i++) {
        const d = addDays(TODAY, -i);
        h[d] = { hrv: { avg: before(d) ? 45 : 60 + wobble(i) }, rhr: 48, sleep: { asleepMin: before(d) ? 330 : 450 } };
        plan.push({ date: d, miles: 6 });
        if (!(bad(d) && i % 2)) done.push({ date: d, miles: 6 });
    }
    const r = replayDecisions({ health: h, checkins: {}, planDays: plan, doses: done }, TODAY, { weeks: 20 });
    const def = r.settings.find(s => s.key === "default");
    assert.equal(r.settings.length, 4);
    assert.ok(def.troubleWeeks > 0 && def.flagged > 0 && def.hitRate >= 50, JSON.stringify(def));
    assert.ok(r.settings[0].flagged >= def.flagged && def.flagged >= r.settings[2].flagged, "sensitive flags most, cautious least");
    assert.ok(r.settings.find(s => s.key === "simple"), "the simple way to beat is there");

    // Not circular: runs that felt much harder than usual aren't "trouble" on their own (they're the response domain).
    const effortRows = Array.from({ length: 200 }, (_, i) => { const d = addDays(TODAY, -i); return { date: d, residual: bad(d) ? 2.5 : 0.1 * (i % 3) - 0.1 }; });
    const felt = replayDecisions({ health: h, checkins: {}, planDays: plan, doses: plan, response: { effortRows, effRuns: [] } }, TODAY, { weeks: 20 });
    assert.equal(felt.settings.find(s => s.key === "default").troubleWeeks, 0);
});

test("no double count (audit A3): the same runs felt harder move 'response', not 'load'", async () => {
    const { sessionDoses } = await import("../js/sessionDose.js");
    const { loadState } = await import("../js/loadState.js");
    const { efficiency, effortResponse } = await import("../js/trainingResponse.js");
    const { addDays } = await import("../js/athleteLedger.js");
    const M = 1609.344, TODAY = "2026-10-11";
    const build = tired => {
        let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
        const out = [];
        for (let i = 365; i >= 1; i--) {
            const date = addDays(TODAY, -i), dow = new Date(`${date}T12:00:00`).getDay();
            if (dow === 1) continue;
            const kind = dow === 2 ? "tempo" : dow === 6 ? "long" : "easy";
            const miles = kind === "long" ? 16 : kind === "tempo" ? 8 : 7, spm = kind === "tempo" ? 410 : kind === "long" ? 500 : 510;
            const t = tired && i <= 7;
            out.push({ id: `c:${i}`, aliases: [], sources: ["coros"], date, start: `${date}T11:00:00Z`, distance: miles * M, movingSec: miles * spm, elapsedSec: miles * spm,
                avgHr: (kind === "tempo" ? 165 : kind === "long" ? 148 : 142) + (rnd() - 0.5) * 6 + (t ? 6 : 0), maxHr: 182, climb: 20,
                rpe: Math.round((kind === "tempo" ? 7 : kind === "long" ? 5 : 3) + (rnd() - 0.5) + (t ? 2 : 0)), rpeAnswered: true, best: null, race: null });
        }
        out.push({ id: "c:race", aliases: [], sources: ["coros"], date: "2026-06-06", distance: 10050, movingSec: 2400, elapsedSec: 2400, avgHr: 172, maxHr: 186, rpe: 9, rpeAnswered: true, race: { status: "race", meters: 10000, timeSec: 2400, allOut: true } });
        return out.sort((a, b) => a.date.localeCompare(b.date));
    };
    const read = tired => {
        const s = build(tired), dr = sessionDoses(s, TODAY), st = loadState(dr.doses, TODAY);
        const cd = concernDomains(TODAY, { loadSeries: st.series, response: { effRuns: efficiency(s, dr.doses, TODAY).runs, effortRows: effortResponse(s, dr.doses, TODAY).rows }, health: {}, checkins: {} });
        return { pct: st.today.percentile, load: cd.domains.find(d => d.key === "load")?.severity, response: cd.domains.find(d => d.key === "response")?.severity };
    };
    const normal = read(false), tired = read(true);
    assert.equal(tired.pct, normal.pct, "recent load's place in the year doesn't move");
    assert.equal(tired.load, normal.load, "the load domain doesn't move");
    assert.ok(tired.response > normal.response, `response picks it up: ${normal.response} -> ${tired.response}`);
});
