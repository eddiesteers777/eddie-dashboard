// Unit tests for the Readiness card's reasons and 4-week trends (js/readinessRead.js, js/readinessLedger.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { wordOf, weekAverages, trendPanel, watchRows, saidRow, logRead, milesByDate, dailySeries, TREND_DAYS } from "../js/readinessRead.js";
import { ledgerHtml, trendHtml } from "../js/readinessLedger.js";

const TODAY = "2026-11-12";
const day = n => { const t = new Date(2026, 10, 12 + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const MILE = 1609.344;
const run = (offset, miles, extra = {}) => ({ date: day(offset), distance: miles * MILE, ...extra });

// 28 mornings of watch data, ending today.
const health = {};
for (let i = 0; i < TREND_DAYS; i++) health[day(-i)] = { hrv: { avg: 55 + (i % 3), baseline: 56, low: 50, high: 62 }, rhr: 47 + (i % 2), sleep: { asleepMin: 400 + (i % 5) * 10 } };

test("the three words replace Green / Yellow / Red", () => {
    assert.equal(wordOf("green"), "Ready");
    assert.equal(wordOf("yellow"), "Steady");
    assert.equal(wordOf("red"), "Easy day");
    assert.equal(wordOf("none"), "");
});

test("28 days become four weekly averages, oldest first, null under 2 days", () => {
    const values = Array.from({ length: 28 }, (_, i) => (i < 7 ? null : 10 + Math.floor(i / 7)));
    const weeks = weekAverages(values);
    assert.deepEqual(weeks.map(w => w.label), ["3 wks ago", "2 wks ago", "Last week", "This week"]);
    assert.equal(weeks[0].v, null);
    assert.equal(weeks[3].v, 13);
    assert.equal(dailySeries(TODAY, 3, d => d).at(-1).date, TODAY);
});

test("HRV: a band from the person's own nights, and a plain sentence", () => {
    const p = trendPanel("hrv", { health, date: TODAY });
    assert.equal(p.building, false);
    assert.equal(p.kind, "line");
    assert.equal(p.values.length, 28);
    assert.ok(p.band[0] < p.band[1]);
    assert.match(p.says, /inside your normal range/);
    // a low week
    const low = { ...health };
    for (let i = 0; i < 7; i++) low[day(-i)] = { ...health[day(-i)], hrv: { avg: 30 } };
    assert.match(trendPanel("hrv", { health: low, date: TODAY }).says, /below your normal range/);
});

test("sleep: counts nights under the need and shows the need line", () => {
    const p = trendPanel("sleep", { health, date: TODAY, needMin: 450 });
    assert.equal(p.kind, "bars");
    assert.equal(p.need, 450);
    assert.match(p.says, /^Under your 7h 30m on \d+ of 28 nights\. Average /);
});

test("resting HR: says up or down against the 3 weeks before", () => {
    const up = { ...health };
    for (let i = 0; i < 7; i++) up[day(-i)] = { ...health[day(-i)], rhr: 55 };
    assert.match(trendPanel("rhr", { health: up, date: TODAY }).says, /^Up \d+ bpm on your 3 weeks before\.$/);
});

test("under 14 nights it does not draw a thin chart, it says how far along it is", () => {
    const few = Object.fromEntries(Object.entries(health).slice(0, 9));
    const p = trendPanel("hrv", { health: few, date: TODAY });
    assert.equal(p.building, true);
    assert.equal(p.buildingText, "Building: 9 of 28 nights");
    assert.match(trendHtml(p, []), /Building: 9 of 28 nights\./);
});

test("training: weekly miles, this week against the 3 before", () => {
    const sessions = [run(-24, 14), run(-17, 18), run(-10, 19), run(-3, 21), run(-1, 3)];
    const p = trendPanel("miles", { sessions, date: TODAY });
    assert.equal(p.building, false);
    assert.deepEqual(p.weekValues.map(Math.round), [14, 18, 19, 24]);
    assert.match(p.says, /^Up 7 mi on your average of the 3 weeks before \(17 mi\)/);
    assert.match(p.says, /The most in 4 weeks\./);
    assert.equal(trendPanel("miles", { sessions: [run(-1, 3)], date: TODAY }).building, true);
    assert.equal(Object.keys(milesByDate(sessions)).length, 5);
});

test("what you said: soreness over 4 weeks", () => {
    const checkins = {};
    for (let i = 0; i < 12; i++) checkins[day(-i)] = { soreness: i < 4 ? 4 : 2, energy: 3 };
    const p = trendPanel("said", { checkins, date: TODAY });
    assert.equal(p.building, false);
    assert.match(p.says, /^Soreness averaged 3.1 this week, 2 before\. Checked in 12 of 28 days\.$/);
    assert.equal(trendPanel("said", { checkins: { [TODAY]: { soreness: 2 } }, date: TODAY }).building, true);
});

test("the watch's rows only say what the watch reported, with a dot for how each reads", () => {
    const rows = watchRows({ health, date: TODAY, needMin: 450 });
    assert.deepEqual(rows.map(r => r.key), ["sleep", "hrv", "rhr"]);
    assert.ok(rows.every(r => r.trend));
    assert.deepEqual(watchRows({ health: {}, date: TODAY }), []);
    const short = watchRows({ health: { [TODAY]: { sleep: { asleepMin: 300 } } }, date: TODAY, needMin: 450 });
    assert.equal(short[0].tone, "low");
});

test("'You said' is a ghost row with a Check in button until today's check-in", () => {
    const ghost = saidRow({}, TODAY);
    assert.equal(ghost.ghost, true);
    assert.equal(ghost.action.act, "checkin");
    const done = saidRow({ [TODAY]: { energy: 4, soreness: 2 } }, TODAY);
    assert.equal(done.ghost, undefined);
    assert.equal(done.value, "Energy good · sore: a little");
    assert.equal(saidRow({ [TODAY]: { energy: 4, soreness: 5 } }, TODAY).tone, "low");
});

test("no watch: nothing logged yet means no word, a progress count and ghost rows", () => {
    const r = logRead({ date: TODAY, sessions: [], checkins: { [day(-1)]: { energy: 4, soreness: 2 } } });
    assert.equal(r.ready, false);
    assert.equal(r.word, "");
    assert.deepEqual(r.progress, { have: 1, need: 5 });
    assert.equal(r.rows.find(x => x.key === "miles").ghost, true);
    assert.equal(r.rows.find(x => x.key === "watch").action.act, "connect");
});

test("no watch: a few check-ins or runs start the read; it never claims sleep, HRV or heart rate", () => {
    const checkins = { [TODAY]: { energy: 4, soreness: 1 }, [day(-1)]: { energy: 4, soreness: 2 }, [day(-2)]: { energy: 3, soreness: 2 } };
    const r = logRead({ date: TODAY, sessions: [], checkins });
    assert.equal(r.ready, true);
    assert.equal(r.word, "Ready");
    const text = JSON.stringify(r.rows);
    assert.ok(!/\bHRV: \d|bpm|asleep/i.test(text), "no watch numbers are invented");
    assert.equal(r.rows.at(-1).value, "Not connected");
});

test("no watch: a jump in miles, hard days and a sore body move Ready toward Steady and Easy day", () => {
    const base = [run(-24, 15), run(-17, 15), run(-10, 15)];
    const checkins = { [TODAY]: { energy: 4, soreness: 1 }, [day(-1)]: { energy: 4 }, [day(-2)]: { energy: 4 } };
    assert.equal(logRead({ date: TODAY, sessions: [...base, run(-3, 15), run(-5, 3)], checkins }).word, "Ready");
    const spike = [...base, run(-1, 12, { rpe: 7 }), run(-2, 10), run(-3, 6, { rpe: 6 }), run(-5, 6)];
    const mid = logRead({ date: TODAY, sessions: spike, checkins });
    assert.equal(mid.word, "Steady");
    assert.equal(mid.hard.count, 3);
    const sore = logRead({ date: TODAY, sessions: spike, checkins: { ...checkins, [TODAY]: { energy: 2, soreness: 4 } } });
    assert.equal(sore.word, "Easy day");
});

test("no watch: sick is Easy day, pain is at most Steady", () => {
    const sessions = [run(-1, 4), run(-2, 4), run(-3, 4), run(-5, 4)];
    assert.equal(logRead({ date: TODAY, sessions, checkins: { [TODAY]: { energy: 4, soreness: 1, sick: true } } }).word, "Easy day");
    const pain = logRead({ date: TODAY, sessions, checkins: { [TODAY]: { energy: 4, soreness: 1, pain: "left Achilles" } } });
    assert.equal(pain.word, "Steady");
    assert.equal(pain.flags[0].text, "Pain: left Achilles");
});

test("the ledger draws a button per trend row, opens one panel, and escapes text", () => {
    const rows = [
        { key: "hrv", label: "HRV", value: "54 ms", note: "normal for you", tone: "ok", trend: true },
        { key: "said", label: "You said", value: "<b>x</b>", ghost: true, action: { act: "checkin", label: "Check in" } },
        { key: "watch", label: "Sleep, HRV", value: "Not connected", ghost: true, action: { act: "connect", label: "Connect" } }
    ];
    const closed = ledgerHtml(rows);
    assert.match(closed, /data-trend="hrv"[^>]*aria-expanded="false"/);
    assert.match(closed, /data-act="checkin"/);
    assert.ok(!closed.includes("<b>x</b>"));
    const p = trendPanel("hrv", { health, date: TODAY });
    const open = ledgerHtml(rows, { open: "hrv", panels: { hrv: trendHtml(p, dailySeries(TODAY, 28, d => d).map(x => x.date)) } });
    assert.match(open, /aria-expanded="true"/);
    assert.match(open, /id="rd-tr-hrv"/);
    assert.match(open, /data-tips=/);
    assert.match(open, /inside your normal range/);
});
