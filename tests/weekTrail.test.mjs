// Unit tests for the week trail on Today (js/weekTrail.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekTrailHtml } from "../js/weekTrail.js";

const run = (miles, title = "Easy run", extra = {}) => ({ kind: "run", title, miles, source: { type: "plan" }, ...extra });
const day = (date, items, status, isToday = false) => ({ date, items, status, isToday });
// Monday 12 Oct 2026; today is Thursday the 15th. Tuesday's lift was missed.
const week = {
    days: [
        day("2026-10-12", [run(4)], "done"),
        day("2026-10-13", [{ kind: "strength", title: "Full Body A", miles: 0, source: { type: "plan" } }], "missed"),
        day("2026-10-14", [run(4)], "done"),
        day("2026-10-15", [run(6, "Tempo run")], "today", true),
        day("2026-10-16", [], "rest"),
        day("2026-10-17", [run(10, "Long run")], "upcoming"),
        day("2026-10-18", [{ kind: "cross", title: "Zone 2 Bike Ride", miles: 0, source: { type: "plan" } }], "upcoming"),
    ],
};
const items = html => [...html.matchAll(/<li class="([^"]*)">([\s\S]*?)<\/li>/g)].map(m => ({ cls: m[1].split(" "), html: m[2] }));

test("seven days, each with its day, its date number and a node", () => {
    const html = weekTrailHtml(week);
    const lis = items(html);
    assert.equal(lis.length, 7);
    assert.match(html, /<b>Mon<\/b><span class="trail-date" aria-hidden="true">12<\/span>/);
    assert.match(html, /<b>Sun<\/b><span class="trail-date" aria-hidden="true">18<\/span>/);
});

test("a done day shows a check, a run still to do shows its miles, a lift shows a dumbbell, rest shows nothing", () => {
    const lis = items(weekTrailHtml(week));
    assert.ok(lis[0].cls.includes("done") && lis[0].html.includes("polyline"), "done is a check");
    assert.match(lis[3].html, /<span class="node" aria-hidden="true">6<\/span>/, "today's run shows 6");
    assert.match(lis[5].html, /<span class="node" aria-hidden="true">10<\/span>/);
    assert.ok(lis[1].html.includes("m6.5 6.5 11 11"), "a missed lift still shows the dumbbell");
    assert.ok(lis[4].cls.includes("rest") && /<span class="node" aria-hidden="true"><\/span>/.test(lis[4].html), "rest is an empty node");
});

test("today wears the ring and a missed day is marked, not hidden", () => {
    const lis = items(weekTrailHtml(week));
    assert.ok(lis[3].cls.includes("today"));
    assert.ok(lis.filter(l => l.cls.includes("today")).length === 1);
    assert.ok(lis[1].cls.includes("missed"));
});

test("a day with one workout she can tick off is a button: the same data-toggle the Plan list uses", () => {
    const withIds = {
        days: week.days.map((d, i) => ({ ...d, items: d.items.map((it, j) => ({ ...it, id: `w${i}${j}`, done: d.status === "done" })) })),
    };
    const tickable = it => it.source?.type === "plan" && it.kind !== "cross";
    const html = weekTrailHtml(withIds, { canToggle: tickable });
    assert.match(html, /<button type="button" class="node" data-toggle="w00" aria-pressed="true" aria-label="Mark Mon 12, 4 mi easy run, not done">/);
    assert.match(html, /<button type="button" class="node" data-toggle="w30" aria-pressed="false" aria-label="Mark Thu 15, 6 mi tempo run, done">6<\/button>/);
    assert.ok(!/data-toggle="w60"/.test(html), "a workout she can't tick (cross-training here) stays a plain node");
    assert.equal((html.match(/<button /g) || []).length, 5, "Mon, Tue, Wed, Thu, Sat: not the rest day, not the cross-training day");
    assert.ok(!html.includes("Mon 12: 4 mi easy run, done"), "a button speaks through its own label, not a second line");
});

test("a day with two workouts, or none she can tick, stays a plain node", () => {
    const two = { days: [day("2026-10-12", [{ id: "a", ...run(4) }, { id: "b", kind: "strength", title: "Lift", miles: 0, source: { type: "plan" } }], "upcoming")] };
    assert.ok(!weekTrailHtml(two, { canToggle: () => true }).includes("<button"), "which one would the tap mean?");
    assert.ok(!weekTrailHtml(week).includes("<button"), "no rule given: nothing is tappable");
});

test("each day is spoken in full for a screen reader, with its status", () => {
    const html = weekTrailHtml(week);
    assert.match(html, /<span class="sr-only">Mon 12: 4 mi easy run, done<\/span>/);
    assert.match(html, /<span class="sr-only">Tue 13: full body a, not done<\/span>/);
    assert.match(html, /<span class="sr-only">Thu 15: 6 mi tempo run, today<\/span>/);
    assert.match(html, /<span class="sr-only">Fri 16: Rest day, rest day<\/span>/);
    assert.match(html, /<span class="sr-only">Sat 17: 10 mi long run, coming up<\/span>/);
});
