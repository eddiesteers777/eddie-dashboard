// Unit tests for the Planning Context and Brief (weekly planning P2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planWindow, defaultMode, candidatePriorities, planningContext, factLines } from "../js/planningContext.js";
import { planningBrief, briefSections, chatbotPrompt } from "../js/planningBrief.js";
import { athleteState } from "../js/athleteState.js";
import { clientInputs } from "../js/clientModel.js";
import { encodeShare, decodeShare } from "../js/athleteShare.js";
import { parseReply, dayLine } from "../js/planPrompt.js";
import { addDays } from "../js/athleteLedger.js";

const TODAY = "2026-10-04";   // a Sunday
const MILE = 1609.344;

test("the week being planned: next 7 days early in the week, next Mon–Sun from Friday", () => {
    assert.equal(defaultMode("2026-10-05"), "next7");     // Monday
    assert.equal(defaultMode("2026-10-08"), "next7");     // Thursday
    assert.equal(defaultMode("2026-10-09"), "nextWeek");  // Friday
    assert.equal(defaultMode(TODAY), "nextWeek");         // Sunday
    assert.deepEqual([planWindow("2026-10-07", "next7").from, planWindow("2026-10-07", "next7").to], ["2026-10-08", "2026-10-14"]);
    assert.deepEqual([planWindow("2026-10-09", "nextWeek").from, planWindow("2026-10-09", "nextWeek").to], ["2026-10-12", "2026-10-18"]);
    assert.deepEqual([planWindow("2026-10-05", "nextWeek").from, planWindow("2026-10-05", "nextWeek").to], ["2026-10-12", "2026-10-18"], "on a Monday: the Monday after");
    assert.equal(planWindow(TODAY, "nextWeek").from, "2026-10-05");
});

// A hand-made state: only what candidatePriorities reads.
const sig = value => ({ value, kind: "derived", confidence: "high", evidence: [], source: "", missing: null });
function fake({ race = null, days = null, decision = null, pain = [], prep = null, reading = null, effort = true, who = "self" } = {}) {
    return {
        identity: { who, firstName: who === "self" ? null : "Sam" },
        goals: { targetRace: sig(race), daysToRace: sig(days), phase: sig({ phase: "Peak & Race Simulation", week: 13, totalWeeks: 16 }) },
        decision: { weekly: sig(decision) },
        constraints: { painOrSick: sig(pain.length ? pain : null) },
        preparation: { block: sig(prep) },
        response: { reading: sig(reading), effort: sig(effort ? { verdict: "usual" } : null), efficiency: sig(effort ? { verdict: "none" } : null) }
    };
}
const MARATHON = { name: "Indianapolis", meters: 42195, distance: "Marathon" };
const THIN = { kind: "marathon", readinessPct: 78, basis: "yours", blocks: 3, weeklyMiles: { value: 48, target: 55 }, longRuns: { value: 4, target: 6, over: 18 }, longest: { value: 19, target: 20 } };

test("priorities: a marathon 5 weeks out with a thin block → durability, then race-specific marathon work", () => {
    const p = candidatePriorities(fake({ race: MARATHON, days: 35, prep: THIN, decision: { level: "proceed", label: "Proceed" } }));
    assert.deepEqual(p.map(x => x.key).slice(0, 2), ["durability", "specific"]);
    assert.match(p[0].text, /78% of the usual block/);
    assert.match(p[1].title, /marathon-pace work inside the long runs/);
    assert.ok(p[1].evidence.some(e => /Plan: Peak & Race Simulation, week 13 of 16/.test(e)), "the plan's own phase is quoted, never invented");
});

test("priorities: a 5K 6 weeks out is planned differently from a marathon", () => {
    const p = candidatePriorities(fake({ race: { name: "Turkey Trot", meters: 5000, distance: "5K" }, days: 42, prep: null }));
    assert.equal(p[0].key, "specific");
    assert.match(p[0].title, /VO₂max and race-pace/);
    assert.ok(!p.some(x => x.key === "durability"), "no durability for a 5K");
});

test("priorities: pain comes first; race week; Ease from the weekly check; no race = base; gaps last", () => {
    const pain = candidatePriorities(fake({ race: MARATHON, days: 35, pain: [{ date: "2026-10-03", kind: "pain", from: "morning check-in" }], decision: { level: "checkin", label: "Check in", reason: "pain reported (2026-10-03)" } }));
    assert.equal(pain[0].key, "checkin");
    assert.match(pain[0].text, /doesn't diagnose/);
    assert.equal(candidatePriorities(fake({ race: MARATHON, days: 6 }))[0].key, "taper");
    assert.match(candidatePriorities(fake({ race: MARATHON, days: 6 }))[0].title, /Race week/);
    const ease = candidatePriorities(fake({ race: MARATHON, days: 60, decision: { level: "ease", label: "Ease", votes: 3, summary: "Three signals agree." } }));
    assert.equal(ease[0].key, "absorb");
    const base = candidatePriorities(fake({ effort: false }));
    assert.deepEqual(base.map(x => x.key), ["base", "data"]);
    assert.ok(candidatePriorities(fake({ race: MARATHON, days: 200 })).some(x => x.key === "base"), "a race far off: build first");
    assert.ok(candidatePriorities(fake({ race: MARATHON, days: 35, prep: THIN, decision: { level: "proceed" } })).length <= 4);
});

// A real state, for the context, the brief and the prompt.
const wobble = i => [0, 3, -2, 1, -3, 2, -1][i % 7];
function clientState() {
    const sessions = [];
    for (let i = 300; i >= 1; i--) {
        const date = addDays(TODAY, -i);
        if (i % 7 === 3) continue;
        const long = i % 7 === 6, miles = long ? 11 : 5;
        sessions.push({ id: `c:${100 + i}`, aliases: [], sources: ["coros"], date, start: `${date}T11:00:00.000Z`, name: "Run", distance: miles * MILE, movingSec: miles * (long ? 560 : 540), avgHr: 146 + wobble(i), maxHr: 178, climb: 15, rpe: long ? 4 : 2, rpeAnswered: true });
    }
    const health = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [addDays(TODAY, -i), { hrv: { avg: 60 + wobble(i) }, rhr: 52, sleep: { asleepMin: 440 } }]));
    const shared = decodeShare(encodeShare({ sessions, health, checkins: {} }, TODAY));
    const record = { preferredName: "Sam", birthYear: 1991, phone: "555-0100", emergencyName: "Pat Rivera", healthNote: "murmur secret", eventType: "10k", targetEvent: "Turkey Trot 10K", targetDate: "2026-11-26", primaryGoal: "Break 45", availabilityDays: ["TUE", "THU", "SAT", "SUN"], injuries: "Tight hamstring" };
    return athleteState(clientInputs({ shared, results: [], record, today: TODAY, extra: { firstName: "Sam", weeklyCheckins: [{ weekOf: "2026-09-28", energy: 3, recovery: 3, motivation: 4, pain: false, notes: "notes secret" }] } }));
}
const PLAN = {
    weeks: [{ days: [
        { date: "2026-10-05", day: "MON", type: "rest", miles: 0, session: "Rest" },
        { date: "2026-10-06", day: "TUE", type: "workout", miles: 7, session: "Cruise intervals: 1.5mi WU; 4x8min @ threshold; 90s jog; 1.5mi CD" },
        { date: "2026-10-07", day: "WED", type: "rest", miles: 0, session: "Rest" },
        { date: "2026-10-08", day: "THU", type: "easy", miles: 5, session: "Easy" },
        { date: "2026-10-09", day: "FRI", type: "rest", miles: 0, session: "Rest" },
        { date: "2026-10-10", day: "SAT", type: "long", miles: 11, session: "Long run" },
        { date: "2026-10-11", day: "SUN", type: "easy", miles: 4, session: "Easy" }
    ] }]
};

test("the context: the state's facts in the panel's words, with kind and confidence; nothing private", () => {
    const state = clientState();
    const ctx = planningContext(state, { from: "2026-10-05", to: "2026-10-11", notes: "Travels Thu.", planLines: PLAN.weeks[0].days.map(dayLine) });
    const keys = ctx.sections.map(s => s.key);
    assert.ok(["goals", "fitness", "load", "response", "constraints"].every(k => keys.includes(k)), keys.join(","));
    const all = ctx.sections.flatMap(s => s.facts);
    assert.ok(all.every(f => f.value && f.kind && f.confidence && Array.isArray(f.basis)));
    const race = all.find(f => f.path === "fitness.raceTime");
    assert.equal(race.confidence, state.fitness.raceTime.confidence);
    assert.match(race.value, /^10K \d+:\d\d/);
    assert.equal(ctx.athlete.firstName, "Sam");
    assert.equal(ctx.athlete.ageBand, "30s");
    const text = JSON.stringify(ctx) + planningBrief(ctx) + chatbotPrompt(ctx);
    for (const leak of ["555-01", "Pat Rivera", "murmur", "secret", "1991"]) assert.ok(!text.includes(leak), `"${leak}" must not reach the context, brief or prompt`);
    assert.ok(factLines(ctx).some(l => /^- Recent load in their year: .+\[Modeled, \w+ confidence\]/.test(l)), factLines(ctx).join("\n"));
});

test("the brief: eight numbered questions, plain, no safety or injury claims", () => {
    const ctx = planningContext(clientState(), { from: "2026-10-05", to: "2026-10-11" });
    const brief = planningBrief(ctx);
    assert.match(brief, /^WEEKLY PLANNING BRIEF · Sam · Mon, Oct 5 – Sun, Oct 11/);
    for (let n = 1; n <= 8; n++) assert.match(brief, new RegExp(`^${n}\\. `, "m"));
    assert.equal(briefSections(ctx).length, 8);
    assert.ok(!/\bunsafe\b|\bsafe range\b|injury risk|risk of injury/i.test(brief), brief);
    assert.match(brief, /Turkey Trot 10K/);
    assert.ok(brief.split("\n").length < 30, "about one screen");
    // Eddie's own: "you".
    const self = planningContext({ ...clientState(), identity: { ...clientState().identity, who: "self", firstName: null } }, { from: "2026-10-05", to: "2026-10-11" });
    assert.match(planningBrief(self), /1\. Where you are now/);
    assert.match(planningBrief(self), /· Me ·/);
});

test("the prompt: brief, facts, notes, the plan lines and the answer format; its own lines read back unchanged", () => {
    const lines = PLAN.weeks[0].days.map(dayLine);
    const ctx = planningContext(clientState(), { from: "2026-10-05", to: "2026-10-11", notes: "Travels Thu–Fri: no run Friday.", planLines: lines });
    const prompt = chatbotPrompt(ctx, { paces: "Easy 9:00–9:40 · Threshold 7:40–7:50" });
    for (const part of ["## Planning brief", "## Southbound's facts", "Travels Thu–Fri", "Paces in this plan: Easy 9:00", "DATE | TYPE | MILES | WORKOUT | STRENGTH | NOTE", "don't recompute paces", "No \"safe\" or \"unsafe\" claims"]) assert.ok(prompt.includes(part), part);
    for (const l of lines) assert.ok(prompt.includes(l), l);
    // A chatbot that copies the week back unchanged changes nothing; one changed day reads as one.
    const back = parseReply(["```", ...lines.map(l => l.replace("Easy | none | ", "Easy | none | ")), "```"].join("\n"), { plan: PLAN, from: "2026-10-05", to: "2026-10-11", scope: "runs" });
    assert.equal(back.days.length, 0);
    assert.equal(back.same, 7);
    const changed = parseReply(lines.map(l => (l.startsWith("2026-10-06") ? "2026-10-06 Tue | workout | 6 | 1.5mi WU; 3x8min @ threshold; 90s jog; 1.5mi CD | none | Slightly less this week." : l)).join("\n"), { plan: PLAN, from: "2026-10-05", to: "2026-10-11", scope: "runs" });
    assert.equal(changed.days.length, 1);
    assert.equal(changed.days[0].text, "1.5mi WU; 3x8min @ threshold; 90s jog; 1.5mi CD", "the raw workout text comes through (Eddie's plan keeps it as text)");
    assert.equal(changed.days[0].note, "Slightly less this week.");
    assert.ok(!chatbotPrompt(ctx, { runsOnly: true }).includes("My strength library"));
});

test("the chatbot's 'DATE: why' lines are its reasons, not unreadable plan lines", () => {
    const lines = PLAN.weeks[0].days.map(dayLine);
    const text = ["```", ...lines, "```", "", "2026-10-06: kept the workout, fewer reps because of the travel.", "- **2026-10-08 Thu** — moved the long run.", "Wednesday | easy | 5 | Easy | none |"].join("\n");
    const read = parseReply(text, { plan: PLAN, from: "2026-10-05", to: "2026-10-11", scope: "runs" });
    assert.equal(read.why["2026-10-06"], "kept the workout, fewer reps because of the travel.");
    assert.equal(read.why["2026-10-08"], "moved the long run.");
    assert.equal(read.unread.length, 1, "only the undated plan line can't be read");
    assert.equal(read.same, 7);
});

test("last planned week's lines (P4) go into the brief and the prompt; a client's in their words", () => {
    const previous = ["Last planned week (Oct 5 – Oct 11): 30 of 36 planned miles; 4 of 5 run days as planned, 1 missed; key sessions 1 of 2.", "Changed or missed: Thu workout missed.", "Days taken from the chatbot's answer: 2 of 2 done as planned."];
    const ctx = planningContext(clientState(), { from: "2026-10-12", to: "2026-10-18", previous });
    assert.deepEqual(ctx.previous, previous);
    assert.match(briefSections(ctx)[2].a, /^Last planned week \(Oct 5 – Oct 11\): 30 of 36 planned miles/);
    const prompt = chatbotPrompt(ctx);
    assert.ok(prompt.includes("## The last week planned this way: planned vs done\n- Last planned week"));
    assert.ok(!chatbotPrompt(planningContext(clientState(), { from: "2026-10-12", to: "2026-10-18" })).includes("planned vs done"), "nothing when there's no earlier week");
});
