// Unit tests for what each account sees (js/navAccess.js, Phase 11 step 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { accessFromProfile, fallbackAccess, meets, pageAllowed, PAGE_REQUIRES } from "../js/navAccess.js";
import { CAPABILITIES } from "../js/services.js";

const client = (services, extra = {}) => accessFromProfile({ status: "active", services, isCoachApproved: false, ...extra }, extra);
const people = {
    coach: accessFromProfile({ status: "active", services: [], isCoachApproved: true, role: "coach" }),
    running: client(["running"]),
    strength: client(["strength"]),
    online: client(["online_coaching"]),
    soccer: client(["soccer_1on1"]),
    soccerWithPlan: accessFromProfile({ status: "active", services: ["soccer_group"] }, { hasCoachPlan: true }),
    hybrid: client(["running", "soccer_1on1"]),
    noServices: client([]),
    pending: accessFromProfile({ status: "pending", services: [] }),
    archived: accessFromProfile({ status: "archived", services: ["running"] }),
    signedOut: accessFromProfile(null)
};
const allowed = who => Object.keys(PAGE_REQUIRES).filter(p => pageAllowed(p, people[who])).sort();

test("requirements: any of a,b; all of a+b; client = not the coach", () => {
    const a = { isCoach: false, caps: ["running", "sessions"] };
    assert.equal(meets("", a), true);
    assert.equal(meets("strength,running", a), true);
    assert.equal(meets("strength", a), false);
    assert.equal(meets("client+sessions", a), true);
    assert.equal(meets("client+sessions", { isCoach: true, caps: [...CAPABILITIES] }), false, "the coach reaches Schedule through the Coach section");
    assert.equal(meets("running+sessions,coach", a), true);
    assert.equal(meets("coach", a), false);
    // "!" = not (Phase 8: the Sessions tab is for clients who book and have no plan).
    assert.equal(meets("client+sessions+!plan", a), true);
    assert.equal(meets("client+sessions+!plan", { isCoach: false, caps: ["sessions", "plan"] }), false);
    assert.equal(meets("!client", a), false);
});

test("the Sessions tab: soccer clients without a plan, nobody else", () => {
    const sessionsTab = "client+sessions+!plan";
    const gets = Object.keys(people).filter(who => meets(sessionsTab, people[who])).sort();
    assert.deepEqual(gets, ["soccer"], "with a coach plan, sessions live in the Plan tab's week; the coach has the Coach tab");
});

test("training clients: the training pages, no Schedule, no coach pages", () => {
    for (const who of ["running", "strength", "online"]) {
        assert.deepEqual(allowed(who), ["checkin.html", "clients.html", "cross-training.html", "fueling.html", "habits.html",
            "nutrition.html", "pace-calculator.html", "plan.html", "profile.html", "programs.html", "progress.html", "running.html",
            "strength.html", "train.html", "updates.html", "workout.html"], who);
    }
});

test("soccer clients: Schedule and Habits; Plan + check-in only with a coach plan; no fueling or nutrition", () => {
    assert.deepEqual(allowed("soccer"), ["clients.html", "habits.html", "profile.html", "progress.html", "schedule.html", "updates.html"]);
    assert.deepEqual(allowed("soccerWithPlan"), ["checkin.html", "clients.html", "habits.html", "plan.html", "profile.html", "progress.html", "schedule.html", "updates.html", "workout.html"]);
    assert.ok(!pageAllowed("fueling.html", people.soccerWithPlan) && !pageAllowed("nutrition.html", people.soccerWithPlan));
    assert.ok(pageAllowed("schedule.html", people.hybrid) && pageAllowed("running.html", people.hybrid));
});

test("pending, archived, no services, signed out", () => {
    assert.deepEqual(allowed("pending"), ["profile.html"]);
    assert.deepEqual(allowed("archived"), []);
    assert.deepEqual(allowed("noServices"), ["clients.html", "profile.html", "updates.html"]);
    assert.deepEqual(allowed("signedOut"), []);
    for (const who of Object.keys(people)) assert.ok(pageAllowed("index.html", people[who]) && pageAllowed("settings.html", people[who]) && pageAllowed("more.html", people[who]), who);
});

test("the coach opens everything; clients never open the coach's pages", () => {
    assert.deepEqual(allowed("coach"), Object.keys(PAGE_REQUIRES).sort());
    for (const page of ["coach.html", "client.html", "marathon.html", "75day.html", "planner.html", "analytics.html", "weekly-review.html", "planning.html", "gear.html"]) {
        for (const who of Object.keys(people).filter(w => w !== "coach")) assert.ok(!pageAllowed(page, people[who]), `${who} ${page}`);
    }
    // A role on the profile grants nothing; only isCoachApproved === true.
    assert.equal(accessFromProfile({ status: "active", role: "coach", isCoachApproved: "yes", services: [] }).isCoach, false);
});

test("failing open shows the client app, never the coach's, and sends no one away", () => {
    const open = fallbackAccess();
    assert.equal(open.isCoach, false);
    assert.ok(!open.caps.includes("coach") && open.caps.includes("running") && open.caps.includes("sessions"));
    assert.ok(pageAllowed("marathon.html", open), "a fallback never redirects");
    assert.equal(meets("coach", open), false);
});

test("every data-requires and tab/search requirement names a real capability", () => {
    const known = new Set([...CAPABILITIES, "client"]);
    const root = new URL("../", import.meta.url);
    const files = [
        ...readdirSync(root).filter(f => f.endsWith(".html")),
        "components/header.html",
        ...readdirSync(new URL("js/", root)).filter(f => f.endsWith(".js")).map(f => "js/" + f)
    ];
    const bad = [];
    for (const f of files) {
        const src = readFileSync(new URL(f, root), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        for (const m of src.matchAll(/data-requires="([^"]*)"|requires: "([^"]*)"/g)) {
            for (const part of (m[1] ?? m[2]).split(/[,+]/).map(s => s.trim().replace(/^!/, "")).filter(Boolean)) if (!known.has(part)) bad.push(`${f}: ${part}`);
        }
    }
    assert.deepEqual(bad, []);
    for (const page of Object.keys(PAGE_REQUIRES)) assert.ok(existsSync(new URL(page, root)), page);
});
