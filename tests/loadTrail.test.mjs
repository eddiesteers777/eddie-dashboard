import test from "node:test";
import assert from "node:assert/strict";
import { slowest, loadLines } from "../js/loadTrail.js";

test("the slowest files come first and carry short names", () => {
    const rows = slowest([{ name: "https://x.com/js/a.js", duration: 50 }, { name: "https://x.com/js/b.js", duration: 900, workerStart: 1 }], 1);
    assert.deepEqual(rows.map(r => r.name), ["js/b.js"]);
    assert.equal(rows[0].fromWorker, true);
});
test("a milestone that never happened says so, with how long the page has waited", () => {
    const lines = loadLines({ milestones: { header: 3300 }, now: 20000, resources: [] });
    assert.ok(lines.some(l => l.startsWith("top bar") && l.endsWith("3.3s")));
    assert.ok(lines.some(l => l.startsWith("greeting") && l.includes("not yet (20.0s in)")));
});
test("counts files served from the phone's saved copy", () => {
    const lines = loadLines({ resources: [{ name: "a", workerStart: 5, transferSize: 0 }, { name: "b", workerStart: 0, transferSize: 2048 }] });
    assert.ok(lines.some(l => l.startsWith("2 files, 1 from")));
});
