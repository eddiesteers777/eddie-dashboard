// Unit tests for the open Apply form (js/applicationForm.js).
// Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    SERVICE_OPTIONS, WHO, AGE_RANGES, START_WHEN, COACHED_BEFORE, HEARD_FROM, CONTACT_BY, CONTACT_TIME, STEPS,
    screenProblem, applicationProblem, cleanApplication, matchApplication, unmatchedApplications,
    recordFromApplication, heardTally, applicationLines, applyGoalIdeas
} from "../js/applicationForm.js";

const FULL = {
    who: "child", name: "Pat Parent", athleteName: "Jamie", ageRange: "10-13", services: ["soccer_1on1"],
    goal: "Make the team", startWhen: "month", coachedBefore: "never", heardFrom: "friend", heardDetail: "Sam",
    email: "pat@example.com", phone: "555-0100", contactBy: ["text"], contactTime: ["evening"], message: ""
};

test("the choices match firestore.rules exactly", () => {
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    const block = rules.slice(rules.indexOf("function validApplication"), rules.indexOf("match /applications"));
    const list = field => {
        const m = block.match(new RegExp(`d\\.${field}(?: in|\\.hasOnly\\()\\s*\\[([^\\]]+)\\]`));
        return m[1].match(/"([^"]+)"/g).map(s => s.slice(1, -1));
    };
    assert.deepEqual(list("who"), WHO.map(o => o.value));
    assert.deepEqual(list("ageRange"), AGE_RANGES.map(o => o.value));
    assert.deepEqual(list("services"), SERVICE_OPTIONS.map(o => o.value));
    assert.deepEqual(list("startWhen"), START_WHEN.map(o => o.value));
    assert.deepEqual(list("coachedBefore"), COACHED_BEFORE.map(o => o.value));
    assert.deepEqual(list("heardFrom"), HEARD_FROM.map(o => o.value));
    assert.deepEqual(list("contactBy"), CONTACT_BY.map(o => o.value));
    assert.deepEqual(list("contactTime"), CONTACT_TIME.map(o => o.value));
    const saved = Object.keys({ ...cleanApplication(FULL), uid: "", status: "", createdAt: "" }).sort();
    const allowed = block.match(/hasOnly\(\[([^\]]+)\]\)/)[1].match(/"([^"]+)"/g).map(s => s.slice(1, -1)).sort();
    assert.deepEqual(saved, allowed, "what the form saves is exactly what the rules allow");
});

test("each screen says what's missing", () => {
    assert.equal(applicationProblem(FULL), "");
    assert.equal(screenProblem("who", { ...FULL, athleteName: "" }), "Add their first name.");
    assert.equal(screenProblem("who", { who: "self", name: "Sam" }), "");
    assert.equal(screenProblem("age", {}), "Pick an age range.");
    assert.equal(screenProblem("services", { services: [] }), "Pick at least one.");
    assert.equal(screenProblem("goal", { goal: "  " }), "Pick a goal or type your own.");
    assert.equal(screenProblem("contact", { email: "", phone: "" }), "Add an email or a phone number so I can reach you.");
    assert.equal(screenProblem("contact", { email: "nope" }), "That email address doesn't look right.");
    assert.equal(screenProblem("contact", { email: "a@b.co", contactBy: ["text"] }), "Add a phone number for texts or calls.");
    assert.equal(screenProblem("contact", { phone: "555", contactBy: ["email"] }), "Add an email address.");
    assert.equal(screenProblem("contact", { phone: "555" }), "", "no preference is fine");
    assert.equal(screenProblem("extra", {}), "", "anything else is optional");
    assert.equal(STEPS.length, 9);
});

test("cleaning keeps only the allowed choices and trims text", () => {
    const clean = cleanApplication({ ...FULL, name: "  Pat Parent ", services: ["soccer_1on1", "hacking"], contactBy: ["text", "fax"], ageRange: "99" });
    assert.equal(clean.name, "Pat Parent");
    assert.deepEqual(clean.services, ["soccer_1on1"]);
    assert.deepEqual(clean.contactBy, ["text"]);
    assert.equal(clean.ageRange, "");
    assert.equal(cleanApplication({ ...FULL, who: "self" }).athleteName, "", "no athlete name for yourself");
    assert.equal(cleanApplication({ ...FULL, heardFrom: "instagram" }).heardDetail, "", "no detail where none is asked");
    assert.equal(cleanApplication({ goal: "x".repeat(400) }).goal.length, 300);
});

test("goal ideas follow what they're interested in", () => {
    assert.ok(applyGoalIdeas(["soccer_group"]).includes("Make the team"));
    assert.ok(applyGoalIdeas(["running"]).includes("Run my first 5K"));
    assert.ok(applyGoalIdeas([]).length > 0);
});

test("an application finds its account: by uid first, else the newest unmatched one with the same email", () => {
    const apps = [
        { id: "old", email: "Sam@Example.com", createdAt: 1 },
        { id: "new", email: "sam@example.com ", createdAt: 5 },
        { id: "taken", email: "sam@example.com", createdAt: 9, matchedUid: "other" },
        { id: "mine", email: "x@y.z", uid: "u2", createdAt: 3 },
        { id: "matched", email: "q@q.q", matchedUid: "u3", createdAt: 2 }
    ];
    assert.equal(matchApplication({ uid: "u1", email: "SAM@example.com" }, apps).id, "new");
    assert.equal(matchApplication({ uid: "u2", email: "sam@example.com" }, apps).id, "mine", "their own uid wins");
    assert.equal(matchApplication({ uid: "u3", email: "" }, apps).id, "matched", "the coach's match");
    assert.equal(matchApplication({ uid: "u4", email: "nobody@example.com" }, apps), null);
    assert.deepEqual(unmatchedApplications(apps).map(a => a.id), ["new", "old"]);
});

test("the application starts their profile", () => {
    assert.deepEqual(recordFromApplication(FULL), {
        whoTrains: "child", preferredName: "", athleteName: "Jamie", phone: "555-0100", primarySport: "soccer", primaryGoal: "Make the team"
    });
    const self = recordFromApplication({ ...FULL, who: "self", athleteName: "", services: ["running"], goal: "Run my first 5K" });
    assert.equal(self.preferredName, "Pat");
    assert.equal(self.primarySport, "running");
    assert.deepEqual(recordFromApplication(null), {});
});

test("where people heard about you, most first", () => {
    const tally = heardTally([{ heardFrom: "instagram" }, { heardFrom: "friend" }, { heardFrom: "instagram" }, {}]);
    assert.deepEqual(tally.map(t => [t.value, t.count]), [["instagram", 2], ["friend", 1]]);
    assert.deepEqual(heardTally([]), []);
});

test("the coach's summary lines read naturally", () => {
    const lines = applicationLines(FULL);
    assert.deepEqual(lines, [
        "For their child, Jamie · age 10–13",
        "Interested in: 1-on-1 soccer",
        "Goal: Make the team",
        "Start: Within a month · Coached before: Never",
        "Heard about you: A friend or family member (Sam)",
        "Reach by text, best in the evening"
    ]);
});
