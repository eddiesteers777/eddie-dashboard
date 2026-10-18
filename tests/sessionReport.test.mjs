import test from "node:test";
import assert from "node:assert/strict";
import { parseDrills, drillsText, cleanDrills, cleanSkills, skillChange, hasReport, reportHtml } from "../js/sessionReport.js";

test("drills: one per line, an optional result after a bar, capped", () => {
    assert.deepEqual(parseDrills("Rondo 4v1 | 12 min\n\n  Cut inside | 18 / 25 \nJuggling"), [
        { name: "Rondo 4v1", result: "12 min" }, { name: "Cut inside", result: "18 / 25" }, { name: "Juggling", result: "" }]);
    assert.equal(parseDrills(Array.from({ length: 20 }, (_, i) => `d${i}`).join("\n")).length, 12);
    assert.equal(parseDrills("x".repeat(100))[0].name.length, 60);
    assert.equal(drillsText(parseDrills("A | 1\nB")), "A | 1\nB");
    assert.deepEqual(cleanDrills([{ name: "" }, null, { name: "ok", result: 5 }]), [{ name: "ok", result: "5" }]);
});

test("skills: 1 to 5 only, each once", () => {
    assert.deepEqual(cleanSkills([{ skill: "Weak foot", level: 3 }, { skill: "Weak foot", level: 4 }, { skill: "Scanning", level: 9 }, { skill: "", level: 2 }, { skill: "Passing", level: "2" }]),
        [{ skill: "Weak foot", level: 3 }, { skill: "Passing", level: 2 }]);
    assert.deepEqual(cleanSkills("nope"), []);
});

test("skill change compares with the newest earlier report that rated it", () => {
    const earlier = [{ skills: [{ skill: "Finishing", level: 3 }] }, { skills: [{ skill: "Weak foot", level: 1 }, { skill: "Finishing", level: 1 }] }];
    assert.equal(skillChange("Finishing", 4, earlier), 1);
    assert.equal(skillChange("Weak foot", 1, earlier), 0);
    assert.equal(skillChange("Scanning", 2, earlier), null);
});

test("a report renders only what's there, and escapes what the coach typed", () => {
    assert.equal(hasReport({ workedOn: "words only" }), false);
    assert.equal(reportHtml({ workedOn: "x" }), "");
    const html = reportHtml({ focus: "<b>Finish</b>", drills: [{ name: "Rondo", result: "12 min" }], skills: [{ skill: "Weak foot", level: 3 }] });
    assert.ok(!html.includes("<b>Finish</b>") && html.includes("&lt;b&gt;"));
    assert.match(html, /Rondo/); assert.match(html, /New/); assert.match(html, /aria-label="3 of 5"/);
});
