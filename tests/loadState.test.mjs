// Unit tests for the load state (js/loadState.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadState, dailyDoses, weeklyTotals, recentWords, TAU, LOAD_VERSION } from "../js/loadState.js";
import { addDays } from "../js/athleteLedger.js";

const dose = (date, value, extra = {}) => ({ date, dose: value, domains: { easy: value, threshold: 0, hard: 0, ...(extra.domains || {}) }, miles: extra.miles ?? 6, long: Boolean(extra.long) });
const steady = (from, days, value) => Array.from({ length: days }, (_, i) => dose(addDays(from, i), value));

test("a steady 60 a day: base and recent both settle at 60, balance 0", () => {
    const s = loadState(steady("2026-01-01", 200, 60), "2026-07-19");
    assert.equal(s.version, LOAD_VERSION);
    assert.equal(s.today.base, 60);
    assert.equal(s.today.recent, 60);
    assert.equal(s.today.balance, 0);
});

test("the EWMA step: one big day moves recent by 1 − e^(−1/7) and base by 1 − e^(−1/42)", () => {
    const doses = [...steady("2026-01-01", 100, 50), dose("2026-04-11", 50 + 140)];
    const s = loadState(doses, "2026-04-11");
    assert.ok(Math.abs(s.today.recent - (50 + 140 * (1 - Math.exp(-1 / TAU.recent)))) < 0.06);
    assert.ok(Math.abs(s.today.base - (50 + 140 * (1 - Math.exp(-1 / TAU.base)))) < 0.06);
    assert.ok(s.today.balance < 0, "recent above base = negative balance");
});

test("rest days count as zero and pull recent down faster than base", () => {
    const doses = steady("2026-01-01", 120, 70);
    const s = loadState(doses, addDays("2026-01-01", 129));   // 10 days off at the end
    assert.ok(s.today.recent < s.today.base);
    assert.ok(s.today.balance > 0);
    assert.equal(dailyDoses(doses, addDays("2026-01-01", 129)).length, 130);
});

test("percentile vs the athlete's own year, and observational words (never 'safe')", () => {
    const doses = [...steady("2025-06-01", 400, 50), ...steady("2026-07-06", 14, 120)];
    const s = loadState(doses, "2026-07-19");
    assert.ok(s.today.percentile >= 95, String(s.today.percentile));
    assert.match(recentWords(s.today.percentile), /top 5%/);
    assert.match(recentWords(50), /usual/);
    assert.match(recentWords(10), /lowest 20%/);
    for (const p of [0, 15, 30, 50, 70, 90, 99]) assert.doesNotMatch(recentWords(p), /safe|risk|danger/i);
    assert.equal(loadState(steady("2026-07-01", 10, 50), "2026-07-10").today.percentile, null, "under 4 weeks of history says nothing");
});

test("domain bases follow the domain doses", () => {
    const doses = Array.from({ length: 120 }, (_, i) => dose(addDays("2026-01-01", i), 80, { domains: { easy: 50, threshold: 20, hard: 10 } }));
    const s = loadState(doses, addDays("2026-01-01", 119));
    assert.ok(Math.abs(s.today.domains.easy - 50) < 0.5 && Math.abs(s.today.domains.threshold - 20) < 0.5 && Math.abs(s.today.domains.hard - 10) < 0.5);
});

test("weeks: Monday to Sunday totals, monotony and strain; a partial current week has none", () => {
    const doses = [];
    for (let i = 0; i < 28; i++) { const d = addDays("2026-09-07", i); const dow = i % 7; if (dow !== 0) doses.push(dose(d, dow === 6 ? 150 : 60, { miles: dow === 6 ? 16 : 6, long: dow === 6 })); }
    const s = loadState(doses, "2026-10-01");
    const w = s.weeks.at(-1);
    assert.equal(w.start, "2026-09-28");
    assert.ok(w.current && w.daysIn === 4 && w.monotony === null);
    const full = s.weeks.find(x => x.start === "2026-09-21");
    assert.equal(full.total, 60 * 5 + 150);
    assert.equal(full.miles, 46);
    assert.ok(full.monotony > 0 && full.strain === Math.round(full.total * full.monotony));
    assert.equal(s.longRuns.count, 3);
    assert.equal(s.longRuns.longest, 16);
    assert.equal(weeklyTotals([], "2026-10-01").length, 16);
});

test("nothing logged: an empty state, not an error", () => {
    const s = loadState([{ date: "2026-10-01", dose: null, domains: {} }], "2026-10-04");
    assert.equal(s.today, null);
    assert.deepEqual(s.series, []);
});

test("loadTotals: this week's days, weeks with effort load and strain, months across a year boundary", async () => {
    const { loadTotals } = await import("../js/loadState.js");
    const today = "2026-01-14";   // a Wednesday
    const doses = [];
    for (let i = 120; i >= 0; i--) {
        const date = addDays(today, -i);
        if (i % 7 === 3) continue;
        doses.push({ date, dose: 60 + (i % 7) * 5, domains: { easy: 50, threshold: 10 + (i % 7) * 5, hard: 0 }, miles: 6, minutes: 50, rpe: i % 2 ? 4 : null, source: "blend" });
    }
    const t = loadTotals(doses, today);
    assert.equal(t.days.length, 7);
    assert.equal(t.days[0].date, "2026-01-12");
    assert.equal(t.days[3].future, true);
    assert.equal(t.days[0].runs + t.days[1].runs + t.days[2].runs, t.thisWeek.runs);
    assert.equal(t.weeks.length, 16);
    assert.ok(t.weeks.at(-2).strain > 0 && t.weeks.at(-2).monotony > 0);
    assert.equal(t.weeks.at(-1).strain, null, "not until the week is over");
    const w = t.weeks.at(-2);
    assert.equal(w.effortLoad, w.rated * 50 * 4);
    assert.equal(w.rated + w.unrated, w.runs);
    assert.ok(t.usualWeek && t.usualWeek.n === 4 && t.usualWeek.load > 0);
    assert.ok(t.strainUsual > 0);
    assert.equal(t.months.length, 12);
    assert.equal(t.months.at(-1).label, "Jan 2026");
    assert.equal(t.months.at(-2).label, "Dec 2025");
    assert.equal(t.months[0].label, "Feb 2025");
    assert.ok(t.months.at(-2).runs >= 26);
});

test("corosComparison (audit A6): week-to-week changes, not levels; a lag; where each puts today", async () => {
    const { corosComparison, corosWords, spearman } = await import("../js/loadState.js");
    const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    // A season's build (both rise through the year) plus each athlete's own 4-week blocks, under random days.
    const daily = (r, n = 300) => { const blocks = Array.from({ length: Math.ceil(n / 28) }, () => 0.7 + 0.6 * r()); return Array.from({ length: n }, (_, i) => (30 + 0.25 * i) * blocks[Math.floor(i / 28)] + 60 * r() + (i % 7 === 6 ? 50 * r() : 0)); };
    const START = "2025-12-01";
    const stateOf = loads => loadState(loads.map((v, i) => dose(addDays(START, i), v)), addDays(START, loads.length - 1));
    const fitnessFrom = (series, f) => Object.fromEntries(series.filter((_, i) => i > 30).map(x => [x.date, { load: f(x) }]));

    // COROS sees the same training (its own scale, a little noise): the changes agree.
    const mine = stateOf(daily(rng(1)));
    const n = rng(9);
    const same = corosComparison(mine.series, fitnessFrom(mine.series, x => ({ long: Math.round(x.base * 1.3 + 3 * n()), short: Math.round(x.recent * 0.9 + 3 * n()) })));
    assert.equal(same.base.words, "together", JSON.stringify(same.base));
    assert.equal(same.recent.words, "together", JSON.stringify(same.recent));
    assert.ok(same.base.n >= 30);
    assert.match(corosWords(same), /^Our base and COROS's Base Fitness move together week to week \(ρ 0\.\d+ over \d+ weeks\)/);

    // Unrelated days under both: the smoothed levels still look alike (audit E5), the changes don't.
    const levelR = [], changeRho = [];
    for (let k = 0; k < 9; k++) {
        const a = stateOf(daily(rng(100 + k))), b = stateOf(daily(rng(500 + k)));
        const bBy = new Map(b.series.map(x => [x.date, x]));
        const c = corosComparison(a.series, fitnessFrom(a.series, x => ({ long: Math.round(bBy.get(x.date).base), short: Math.round(bBy.get(x.date).recent) })));
        const pts = a.series.filter((_, i) => i > 30);
        levelR.push(Math.abs(spearman(pts.map(x => x.base), pts.map(x => bBy.get(x.date).base))));
        changeRho.push(Math.abs(c.recent.rho));
    }
    const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    assert.ok(med(levelR) > 0.6, `levels look alike: ${med(levelR)}`);
    assert.ok(med(changeRho) < 0.3, `changes don't: ${med(changeRho)}`);

    // COROS's number moves 3 days after ours: the scan finds it.
    const byDate = new Map(mine.series.map(x => [x.date, x]));
    const late = corosComparison(mine.series, fitnessFrom(mine.series, x => { const y = byDate.get(addDays(x.date, -3)); return y ? { long: Math.round(y.base), short: Math.round(y.recent * 10) / 10 } : {}; }));
    assert.equal(late.recent.lag, -3, JSON.stringify(late.recent));
    assert.match(corosWords(late), /ours moves about 3 days before COROS's/);

    // Where today sits in each one's last 90 days.
    const spike = stateOf([...daily(rng(1)).slice(0, 290), ...Array(10).fill(160)]);
    const flat = corosComparison(spike.series, fitnessFrom(spike.series, x => ({ long: 50, short: 40 + (x.date.endsWith("1") ? 1 : 0) })));
    assert.ok(flat.recent.standing.gap >= 1, JSON.stringify(flat.recent.standing));
    assert.match(corosWords(flat), /right now ours puts your recent load higher within your last 90 days than COROS does/i);

    // Too few weeks; nothing at all.
    const short = corosComparison(mine.series, fitnessFrom(mine.series.slice(-60), x => ({ long: x.base, short: x.recent })));
    assert.equal(short.base.rho, null);
    assert.match(corosWords(short), /Not enough weeks of COROS numbers yet/);
    assert.equal(corosComparison(mine.series, {}), null);
    assert.equal(corosWords(null), "");
});

test("week so far (audit A5): against the same day of the last 8 weeks, not a whole week", async () => {
    const { weekToDate } = await import("../js/loadState.js");
    const { addDays } = await import("../js/athleteLedger.js");
    // Rest Monday, quality Tuesday, long run Sunday, a cutback every 4th week; this week is Mon Oct 12.
    const MON = "2026-10-12";
    const pattern = [0, 9, 6, 7, 5, 6, 16];            // miles Mon..Sun
    const week = (start, f = 1, upTo = 6) => pattern.slice(0, upTo + 1).flatMap((m, i) => (m ? [{ date: addDays(start, i), miles: m * f, dose: m * f * 10 }] : []));
    const history = Array.from({ length: 12 }, (_, k) => week(addDays(MON, -7 * (12 - k)), k % 4 === 3 ? 0.75 : 1)).flat();
    const on = (date, extra) => weekToDate([...history, ...extra], date);
    // A normal week reads "about usual" on every day, where the old whole-week comparison said 9–64%.
    for (const [i, d] of [[1, "Tuesday"], [3, "Thursday"], [5, "Saturday"], [6, "Sunday"]]) {
        const r = on(addDays(MON, i), week(MON, 1, i));
        assert.equal(r.dayName, d);
        assert.equal(r.load.status, "usual", `${d}: ${JSON.stringify(r.load)}`);
        assert.equal(r.miles.status, "usual");
        assert.equal(r.load.usualWeek, 490, "a usual week (median of 8) is still shown");
    }
    const tue = on(addDays(MON, 1), week(MON, 1, 1));
    assert.deepEqual([tue.miles.now, tue.miles.usual], [9, 9]);
    // Clearly more or less than usual by Thursday.
    assert.equal(on(addDays(MON, 3), week(MON, 1.6, 3)).load.status, "ahead");
    const sick = on(addDays(MON, 3), week(MON, 1, 1));    // nothing since Tuesday; none yet on Thursday
    assert.equal(sick.dayName, "Wednesday");
    assert.equal(sick.load.status, "behind");
    assert.equal(sick.load.ratio, 0.6);
    // No run yet today: compared through yesterday. Monday with nothing done yet: nothing to say.
    const wedMorning = on(addDays(MON, 2), week(MON, 1, 1));
    assert.equal(wedMorning.dayName, "Tuesday");
    assert.equal(wedMorning.load.status, "usual");
    assert.equal(on(MON, []), null);
    // Under 4 of the last 8 weeks with runs: no comparison.
    assert.equal(weekToDate([...week(addDays(MON, -7)), ...week(addDays(MON, -14))], addDays(MON, 3)), null);
});
