// The phone tab bar and the More page for each kind of account (redesign
// step 3, Eddie 2026-10-14): five tabs at most, Habits a tab only without
// Fuel, and More never repeats a tab. Reads js/loadHeader.js and more.html.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { accessFromProfile, meets } from "../js/navAccess.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const src = read("js/loadHeader.js");
const start = src.indexOf("const BOTTOM_TABS = [");
const TABS = new Function(`return ${src.slice(src.indexOf("[", start), src.indexOf("];", start) + 1)}`)();

const client = (services, extra = {}) => accessFromProfile({ status: "active", services, isCoachApproved: false }, extra);
const people = {
    coach: accessFromProfile({ status: "active", services: [], isCoachApproved: true, role: "coach" }),
    running: client(["running"]),
    online: client(["online_coaching", "running", "strength"]),
    soccer: client(["soccer_1on1"]),
    soccerWithPlan: client(["soccer_group"], { hasCoachPlan: true }),
    hybrid: client(["running", "soccer_1on1"]),
    pending: accessFromProfile({ status: "pending", services: [] })
};
const tabsFor = who => TABS.filter(t => meets(t.requires || "", people[who])).map(t => t.label);

test("each account's tab bar", () => {
    assert.deepEqual(tabsFor("coach"), ["Today", "Coach", "Train", "Fuel", "More"]);
    assert.deepEqual(tabsFor("running"), ["Today", "Plan", "Train", "Fuel", "More"]);
    assert.deepEqual(tabsFor("online"), ["Today", "Plan", "Train", "Fuel", "More"]);
    assert.deepEqual(tabsFor("hybrid"), ["Today", "Plan", "Train", "Fuel", "More"]);
    assert.deepEqual(tabsFor("soccer"), ["Today", "Soccer", "Habits", "More"]);
    assert.deepEqual(tabsFor("soccerWithPlan"), ["Today", "Plan", "Soccer", "Habits", "More"]);
    assert.deepEqual(tabsFor("pending"), ["Today", "More"]);
    for (const who of Object.keys(people)) assert.ok(tabsFor(who).length <= 5, `${who}: five tabs at most`);
});

const html = read("more.html");
const rows = [...html.matchAll(/<a href="([^"]+)" class="more-row"[^>]*?(?:data-requires="([^"]*)")?>/g)].map(m => ({ href: m[1].split("?")[0], requires: m[2] || "" }));

test("More never repeats a tab, and every page with a tab or a row is reachable once", () => {
    assert.ok(rows.length > 10, "the rows were read");
    for (const who of Object.keys(people)) {
        const access = people[who];
        const tabHrefs = TABS.filter(t => meets(t.requires || "", access)).flatMap(t => [t.href, ...(t.pages || [])]);
        const moreHrefs = rows.filter(r => meets(r.requires, access)).map(r => r.href);
        for (const href of moreHrefs) assert.ok(!tabHrefs.includes(href), `${who}: ${href} is a tab and a More row`);
        if (meets("habits", access)) assert.ok([...tabHrefs, ...moreHrefs].includes("habits.html"), `${who}: Habits is reachable`);
    }
});

test("More's rows sit in titled groups that hide when empty", () => {
    const groups = html.match(/data-nav-group/g) || [];
    assert.ok(groups.length >= 4);
    assert.match(read("js/navAccess.js"), /\[data-nav-group\]/);
});
