// Unit tests for the client's Today by service (js/todayLayout.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLIENT_TODAY, clientTodaySections, clientHeroLine } from "../js/todayLayout.js";
import { accessFromProfile, fallbackAccess } from "../js/navAccess.js";

const who = (services, status = "active", hasCoachPlan = false) => accessFromProfile({ status, services }, { hasCoachPlan });
const shown = access => clientTodaySections(access).filter(s => s.on).map(s => s.id);

test("running client: everything training, no booking stat on its own", () => {
    assert.deepEqual(shown(who(["running"])), ["todayCard", "readinessCard", "weekSection", "profileCheck", "coachCardSection", "clientPackageSection", "todayStats", "nutritionSnap", "todayTools"]);
});

test("soccer client: sessions first, no readiness, no nutrition", () => {
    assert.deepEqual(shown(who(["soccer_1on1"])), ["todayCard", "weekSection", "profileCheck", "coachCardSection", "clientPackageSection", "todayStats", "todayTools"]);
    assert.deepEqual(shown(who(["soccer_group"], "active", true)), shown(who(["soccer_1on1"])), "a coach plan doesn't add nutrition or readiness");
});

test("pending: just the waiting card (with the profile link) and the tools", () => {
    assert.deepEqual(shown(who([], "pending")), ["profileCheck", "coachCardSection", "todayTools"]);
});

test("fail-open shows every client section", () => {
    assert.deepEqual(shown(fallbackAccess()), CLIENT_TODAY.map(s => s.id));
});

test("the hero line says what's here", () => {
    assert.match(clientHeroLine(who([], "pending")), /waiting for your coach's approval/);
    assert.match(clientHeroLine(who(["running"], "archived")), /isn't active right now/);
    assert.deepEqual(shown(who(["running"], "archived")), ["todayTools"], "an archived account sees only the tiles left (Settings)");
    assert.equal(clientHeroLine(who(["running"]), ["Half Marathon"]), "Training: Half Marathon");
    assert.equal(clientHeroLine(who(["soccer_1on1"]), ["Ball mastery"]), "Here's your day. Your sessions and notes from your coach live here.", "no plan line without the plan capability");
    assert.equal(clientHeroLine(who(["running", "soccer_1on1"])), "Here's your day. Your plan, sessions and check-ins all live here.");
    assert.equal(clientHeroLine(who(["strength"])), "Here's your day. Your plan and check-ins all live here.");
});

test("every section id exists on Today", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    for (const { id } of CLIENT_TODAY) assert.match(html, new RegExp(`id="${id}"`), id);
});
