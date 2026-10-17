// Unit tests for the coach's marathon week on Today (js/marathonWeek.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { marathonWeekModel, isoOf } from "../js/marathonWeek.js";
import { weekTrailHtml } from "../js/weekTrail.js";

// Plan week 13 as the marathon plan has it: Monday 12 Oct 2026, today is Thursday the 15th.
const KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS = [
    { session: "Recovery jog", miles: 5, pace: "Recovery" },
    { session: "Progression tempo - steady into threshold", miles: 8, pace: "Threshold" },
    { session: "Easy aerobic", miles: 3, pace: "Easy" },
    { session: "6mi @ Marathon Pace", miles: 10, pace: "MP" },
    { session: "", miles: 0, pace: "" },
    { session: "Broken MP long run: 3x3mi @ MP", miles: 17, pace: "MP" },
    { session: "Recovery jog", miles: 1, pace: "Recovery" },
];
const model = (progress = { 13: { Mon: true } }, extra = {}) =>
    marathonWeekModel({ week: 13, monday: new Date(2026, 9, 12), days: DAYS, keys: KEYS, progress, today: "2026-10-15", ...extra });

test("seven days from Monday, a day with miles is one run, a day without is rest", () => {
    const m = model();
    assert.deepEqual(m.days.map(d => d.date), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    assert.deepEqual(m.days.map(d => d.items.length), [1, 1, 1, 1, 0, 1, 1]);
    assert.equal(m.days[3].items[0].miles, 10);
    assert.equal(m.days[3].items[0].kind, "run");
    assert.equal(m.monday, "2026-10-12");
});

test("done comes from the plan's progress record; a past day not done is missed; today and the days after are marked", () => {
    const m = model({ 13: { Mon: true, Wed: true } });
    assert.deepEqual(m.days.map(d => d.status), ["done", "missed", "done", "today", "rest", "upcoming", "upcoming"]);
    assert.equal(m.days[3].isToday, true);
    assert.equal(model({}).days[0].status, "missed", "no record at all: Monday not done");
    assert.equal(model({ 12: { Mon: true } }).days[0].status, "missed", "another week's record is not this week's");
});

test("each run carries what the tap and the card need: the week, the day key, its steps and its name", () => {
    const steps = { warmup: { amount: 1, unit: "mi" } };
    const m = model({}, { titleOf: d => d.session.split(" ")[0], workoutOf: d => (d.miles === 10 ? steps : null) });
    const thu = m.days[3].items[0];
    assert.equal(thu.id, "m-13-Thu");
    assert.equal(thu.week, 13);
    assert.equal(thu.dayKey, "Thu");
    assert.equal(thu.title, "6mi");
    assert.equal(thu.workout, steps);
    assert.equal(m.days[0].items[0].workout, null);
    assert.equal(thu.source.type, "marathon", "so a client's tick rules never apply to it");
});

test("the week's numbers: runs done, miles done of planned", () => {
    const s = model({ 13: { Mon: true, Wed: true } }).summary;
    assert.equal(s.planned, 6);
    assert.equal(s.done, 2);
    assert.equal(s.miles, 44);
    assert.equal(s.milesDone, 8);
    assert.deepEqual(s.strength, { planned: 0, done: 0 });
    assert.equal(s.sessions, 0);
});

test("the same trail draws it: a node ticks through the plan's own attributes, never the client's", () => {
    const html = weekTrailHtml(model({ 13: { Mon: true } }), {
        canToggle: item => item.source.type === "marathon",
        toggleAttrs: item => `data-complete-week="${item.week}" data-complete-day="${item.dayKey}"`
    });
    assert.match(html, /<button type="button" class="bar" style="height:\d+px" data-complete-week="13" data-complete-day="Thu" aria-pressed="false" aria-label="Mark Thu 15, 10 mi 6mi @ marathon pace, done">/);
    assert.match(html, /data-complete-week="13" data-complete-day="Mon" aria-pressed="true"/);
    assert.ok(!html.includes("data-toggle"), "no client tick attribute");
    assert.equal((html.match(/<button /g) || []).length, 6, "six runs; the rest day is a plain bar");
});

test("dates are local days", () => {
    assert.equal(isoOf(new Date(2026, 9, 5)), "2026-10-05");
});

// Analytics audit (2026-10-17): weeks are calendar weeks, so the Nov 1 clock change can't
// start race week at 11 pm on Sunday, and race day in the plan is the real race date.
test("every plan week starts on a Monday at midnight, and race day is RACE_DATE", async () => {
    const md = await import("../js/marathonData.js");
    for (let w = 1; w <= md.WEEKS.length; w++) {
        const s = md.weekStart(w);
        assert.equal(s.getDay(), 1, `week ${w} starts on a Monday`);
        assert.equal(s.getHours(), 0, `week ${w} starts at midnight`);
        assert.equal(md.weekEnd(w).getTime() + 1, md.weekStart(w + 1).getTime());
    }
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const last = md.WEEKS.length;
    const raceIndex = md.getAdjustedWeekDays(last).findIndex(d => d.race);
    const raceDay = new Date(md.weekStart(last)); raceDay.setDate(raceDay.getDate() + raceIndex);
    assert.equal(iso(raceDay), iso(md.RACE_DATE));
    for (const tz of ["America/Indiana/Indianapolis", "UTC"]) {
        const { execFileSync } = await import("node:child_process");
        const out = execFileSync(process.execPath, ["--input-type=module", "-e",
            `const m = await import(${JSON.stringify(new URL("../js/marathonData.js", import.meta.url).href)}); const s = m.weekStart(m.WEEKS.length); console.log(s.getDay(), s.getHours());`],
            { env: { ...process.env, TZ: tz } }).toString().trim();
        assert.equal(out, "1 0", `race week starts Monday midnight in ${tz}`);
    }
});
