import test from "node:test";
import assert from "node:assert/strict";
import { addStep, recentBounces } from "../js/signInTrail.js";

test("the trail keeps the last 40 steps and clips long detail", () => {
    let list = [];
    for (let i = 0; i < 50; i++) list = addStep(list, "s" + i, "x".repeat(200), "home.html", i);
    assert.equal(list.length, 40);
    assert.equal(list[0][2], "s10");
    assert.equal(list[39][3].length, 80);
});
test("bounces only count inside the window", () => {
    let list = [];
    list = addStep(list, "bounce", "", "index.html", 1000);
    list = addStep(list, "login-ok", "", "home.html", 2000);
    list = addStep(list, "bounce", "", "index.html", 100000);
    assert.equal(recentBounces(list, 101000, 120000), 2);
    assert.equal(recentBounces(list, 300000, 120000), 0);
    assert.equal(recentBounces(null, 1), 0);
});
