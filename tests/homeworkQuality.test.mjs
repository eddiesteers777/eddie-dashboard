import { test } from "node:test";
import assert from "node:assert/strict";
import { qualityFlags, flagCount } from "../js/homeworkQuality.js";

const D = 864e5;
const NOW = Date.parse("2026-12-10T12:00:00Z");
const log = (daysAgo, extra = {}) => ({ date: "x", at: NOW - daysAgo * D, feel: "okay", count: 5, ...extra });
const hw = (o = {}) => ({ status: "active", cadence: "weekly", logs: [], createdMs: NOW - 2 * D, ...o });

test("a normal week raises nothing", () => {
    assert.deepEqual(qualityFlags(hw({ logs: [log(3), log(2), log(1)] }), NOW), []);
});

test("goal practice with no count is flagged, other cadences are not", () => {
    assert.equal(qualityFlags(hw({ cadence: "goal", logs: [log(1, { count: null })] }), NOW)[0].kind, "no-count");
    assert.deepEqual(qualityFlags(hw({ logs: [log(1, { count: null })] }), NOW), []);
});

test("three practices on one day looks like catching up", () => {
    const logs = [log(0.1), log(0.2), log(0.3)];
    assert.ok(qualityFlags(hw({ logs }), NOW).some(f => f.kind === "catch-up"));
});

test("three Hard in a row is flagged; one Okay in between is not", () => {
    const hard = [1, 2, 3].map(d => log(d, { feel: "hard" }));
    assert.ok(qualityFlags(hw({ logs: hard }), NOW).some(f => f.kind === "hard"));
    const mixed = [log(3, { feel: "hard" }), log(2), log(1, { feel: "hard" })];
    assert.ok(!qualityFlags(hw({ logs: mixed }), NOW).some(f => f.kind === "hard"));
});

test("quiet after 7 days, never for a one-time assignment", () => {
    assert.ok(qualityFlags(hw({ logs: [log(8)], createdMs: NOW - 20 * D }), NOW).some(f => f.kind === "quiet"));
    assert.ok(!qualityFlags(hw({ cadence: "once", logs: [], createdMs: NOW - 20 * D }), NOW).some(f => f.kind === "quiet"));
});

test("Looks good clears flags from earlier practices only", () => {
    const logs = [log(0.1), log(0.2), log(0.3)];
    assert.equal(qualityFlags(hw({ logs, reviewedMs: NOW }), NOW).length, 0);
    const later = [...logs, log(0.05), log(0.04), log(0.03)].map(l => ({ ...l, at: l.at + 1 }));
    assert.ok(qualityFlags(hw({ logs: later, reviewedMs: NOW - 0.2 * D }), NOW).length > 0);
});

test("closed assignments and empty input are quiet; counts add up", () => {
    assert.deepEqual(qualityFlags(hw({ status: "archived", logs: [log(30)] }), NOW), []);
    assert.deepEqual(qualityFlags(null, NOW), []);
    assert.equal(flagCount([hw({ logs: [log(9)], createdMs: NOW - 30 * D }), hw()], NOW), 1);
});
