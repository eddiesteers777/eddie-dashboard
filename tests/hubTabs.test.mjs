import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("client.html");

// Every tab button in the hub, in the main row or under More.
const tabs = [...html.matchAll(/<button[^>]*class="clients-tab[^"]*"[^>]*data-tab="([a-z]+)"/g)].map(m => m[1]);
const mainRow = html.slice(html.indexOf('<nav class="clients-tabs hub-tabs"'), html.indexOf("</nav>", html.indexOf('<nav class="clients-tabs hub-tabs"')));
const moreMenu = html.slice(html.indexOf('id="hubMoreMenu"'), html.indexOf("</div>", html.indexOf('id="hubMoreMenu"')));
const idsIn = block => [...block.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]);

test("the hub has all twelve tabs, once each: four in the main row, eight under More", () => {
    assert.equal(tabs.length, 12);
    assert.equal(new Set(tabs).size, 12, "no tab appears twice");
    assert.deepEqual(idsIn(mainRow), ["overview", "messages", "workouts", "plan"]);
    assert.deepEqual(idsIn(moreMenu), ["checkins", "sessions", "progress", "planning", "model", "profile", "notes", "history"]);
    assert.equal(html.match(/data-panel="[a-z]+"/g).filter(Boolean).length >= 12, true);
    for (const id of tabs) assert.match(html, new RegExp(`data-panel="${id}"`), `${id} has a panel`);
});

test("every badge the hub's code fills in still exists, in the right place", () => {
    for (const id of ["hubMessageBadge", "hubWorkoutBadge"]) assert.ok(mainRow.includes(`id="${id}"`), `${id} is in the main row`);
    for (const id of ["hubCheckinBadge", "hubSessionBadge"]) assert.ok(moreMenu.includes(`id="${id}"`), `${id} is in the More menu`);
    for (const id of ["hubMoreBtn", "hubMoreLabel", "hubMoreBadge", "hubMoreMenu"]) assert.match(html, new RegExp(`id="${id}"`));
    const js = read("js/clientHub.js");
    for (const id of ["hubMessageBadge", "hubWorkoutBadge", "hubCheckinBadge", "hubSessionBadge"]) assert.ok(js.includes(`"${id}"`), `${id} is still used`);
});

test("the More menu is a real menu: labelled, closed to start, items are menuitems", () => {
    assert.match(html, /id="hubMoreBtn"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="hubMoreMenu"/);
    assert.match(html, /id="hubMoreMenu" role="menu"[^>]*hidden/);
    assert.equal((moreMenu.match(/role="menuitem"/g) || []).length, 8);
    assert.ok(!/role="tablist"|role="tab"/.test(html.slice(html.indexOf('<div class="hub-tabs-wrap">'), html.indexOf("</div>", html.indexOf('id="hubMoreMenu"') + 600))), "the half-built tab roles are gone");
});

test("every link or button anywhere that names a hub tab names one that exists", () => {
    const named = new Set();
    const files = ["client.html", ...readdirSync(new URL("../js/", import.meta.url)).filter(f => f.endsWith(".js")).map(f => `js/${f}`)];
    for (const file of files) {
        const src = read(file);
        for (const m of src.matchAll(/data-go-tab="([a-z]+)"/g)) named.add(m[1]);
        for (const m of src.matchAll(/client\.html\?[^"'`\s]*?tab=([a-z]+)/g)) named.add(m[1]);
    }
    for (const file of ["js/clientSummary.js", "js/clientTimeline.js", "js/feedbackModel.js", "js/coachToday.js", "js/clientPackageModel.js"]) {
        for (const m of read(file).matchAll(/\btab: *"([a-z]+)"/g)) named.add(m[1]);
    }
    assert.ok(named.size >= 8, `found the links (${[...named].join(", ")})`);
    for (const name of named) assert.ok(tabs.includes(name), `a link points at the "${name}" tab, which doesn't exist`);
});

test("selecting a tab works for the menu's tabs too (one place knows them all)", () => {
    const js = read("js/clientHub.js");
    assert.match(js, /const HUB_TAB = "\.hub-tabs-wrap \.clients-tab\[data-tab\]"/);
    assert.ok(!/\.hub-tabs \.clients-tab"/.test(js), "no selector still looks only in the main row");
    assert.match(js, /aria-current/);
});
