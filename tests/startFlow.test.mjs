import test from "node:test";
import assert from "node:assert/strict";
import { cleanStart, stepsFor, exampleWeek, recordFromStart, mergedRecord, GOALS, NOW, SPORTS } from "../js/startFlow.js";
import { FIELD_KEYS, EVENT_TYPES, RUN_START, SOCCER_LEVELS, STRENGTH_LEVELS } from "../js/clientRecordSchema.js";

const full = { sport: "running", goal: "half", now: "run20", days: ["thu", "tue", "sun", "sat"], name: "  Sam  ", mark: "ball" };

test("cleanStart drops unknown values and orders days", () => {
    const c = cleanStart({ ...full, sport: "x", days: ["sun", "nope", "mon"] });
    assert.equal(c.sport, ""); assert.equal(c.goal, ""); assert.deepEqual(c.days, ["mon", "sun"]);
    assert.equal(cleanStart(full).name, "Sam");
    assert.deepEqual(cleanStart(full).days, ["tue", "thu", "sat", "sun"]);
    assert.deepEqual(cleanStart(null), { sport: "", goal: "", now: "", days: [], name: "", mark: "" });
});

test("every choice maps to a value the profile accepts", () => {
    for (const g of Object.values(GOALS).flat()) {
        if (g.eventType) assert.ok(EVENT_TYPES.some(e => e.value === g.eventType), g.value);
        assert.ok(g.eventType || g.goalText, g.value);
    }
    const lists = { runStart: RUN_START, strengthExperience: STRENGTH_LEVELS, soccerLevel: SOCCER_LEVELS };
    for (const n of Object.values(NOW)) {
        assert.ok(FIELD_KEYS.includes(n.field));
        for (const o of n.options) assert.ok(lists[n.field].some(x => x.value === o.value), o.value);
    }
    for (const s of SPORTS) assert.ok(GOALS[s.value]?.length);
});

test("steps skip 'now' for general fitness", () => {
    assert.deepEqual(stepsFor({ sport: "running" }), ["train", "you", "goal", "now", "days"]);
    assert.deepEqual(stepsFor({ sport: "general" }), ["train", "you", "goal", "days"]);
    assert.equal(stepsFor({}).length, 5);
});

test("example week comes from the picked days", () => {
    const w = exampleWeek(full);
    assert.equal(w.sessions, 4);
    assert.deepEqual(w.plan.map(p => p.day), ["tue", "thu", "sat", "sun"]);
    assert.equal(w.minutes, w.plan.reduce((n, p) => n + p.minutes, 0));
    assert.equal(w.longest, Math.max(...w.plan.map(p => p.minutes)));
    assert.equal(exampleWeek({}).sessions, 0);
});

test("record fields fill only empty answers", () => {
    const add = recordFromStart(full, {});
    assert.deepEqual(add, { primarySport: "running", preferredName: "Sam", eventType: "half", availabilityDays: ["tue", "thu", "sat", "sun"], runStart: "run20" });
    const kept = recordFromStart(full, { preferredName: "Samuel", primarySport: "soccer", eventType: "5k" });
    assert.equal(kept.preferredName, undefined); assert.equal(kept.primarySport, undefined); assert.equal(kept.eventType, undefined);
    assert.equal(kept.runStart, "run20");
});

test("non-event goals go to primaryGoal; nothing to save returns null", () => {
    assert.equal(recordFromStart({ sport: "strength", goal: "stronger" }, {}).primaryGoal, "Get stronger");
    assert.equal(mergedRecord({}, null), null);
    const m = mergedRecord(full, { phone: "555", primaryGoal: "Keep" });
    assert.equal(m.phone, "555"); assert.equal(m.primaryGoal, "Keep"); assert.equal(m.eventType, "half");
});

test("leave summary names what would be lost", async () => {
    const { leaveSummary } = await import("../js/startFlow.js");
    const s = leaveSummary(full);
    assert.equal(s.name, "Sam");
    assert.deepEqual(s.items.map(i => i.tag), ["Goal", "4 days", "Example", "Profile"]);
    assert.equal(s.items[1].label, "Tue, Thu, Sat, Sun");
    assert.equal(leaveSummary({}).any, false);
    assert.deepEqual(leaveSummary({ sport: "strength" }).items, [{ label: "Strength", tag: "Sport" }]);
});

test("each sport has its own muted tint and ice blue is the default", async () => {
    const { accentFor, ACCENTS } = await import("../js/startFlow.js");
    assert.equal(accentFor({}).ac, "#C7D6E4");
    assert.notEqual(accentFor({ sport: "soccer" }).ac, accentFor({ sport: "running" }).ac);
    for (const s of SPORTS) assert.ok(ACCENTS[s.value], s.value);
    assert.equal(accentFor({ sport: "nope" }).ac, "#C7D6E4");
});

test("invite links: read, clean and build", async () => {
    const { parseInvite, inviteLink, inviteMessage, inviteSteps, cleanInviteName } = await import("../js/startFlow.js");
    assert.equal(parseInvite(""), null);
    assert.equal(parseInvite("?x=1"), null);
    assert.deepEqual(parseInvite("?for=Jake&sport=soccer"), { sport: "soccer", name: "Jake" });
    assert.deepEqual(parseInvite("?sport=Lifting"), { sport: "strength", name: "" });
    assert.deepEqual(parseInvite("?for=Jake&sport=golf"), { bad: true });
    assert.deepEqual(parseInvite("?for=Jake"), { bad: true });
    assert.equal(cleanInviteName("<b>Mary-Ann</b> O'Neil 123"), "bMary-Annb O'Neil");
    assert.ok(!/[<>0-9]/.test(cleanInviteName("<script>1</script>")));
    assert.equal(cleanInviteName("x".repeat(100)).length, 40);
    // round trip
    const url = new URL(inviteLink("José María", "running"));
    assert.deepEqual(parseInvite(url.search), { sport: "running", name: "José María" });
    assert.equal(inviteLink("Jake", "golf"), "");
    assert.match(inviteMessage("Jake", "strength"), /^Hey Jake, it's Eddie\. I set up a lifting page/);
    assert.deepEqual(inviteSteps({ sport: "soccer" }), ["welcome", "goal", "now", "days"]);
    assert.deepEqual(inviteSteps({ sport: "general" }), ["welcome", "goal", "days"]);
});
