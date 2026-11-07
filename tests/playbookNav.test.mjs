import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GROUPS, locate, toolsOf } from "../js/playbook/navModel.js";

test("every tool page is in exactly one group and the pages exist", () => {
    const files = GROUPS.flatMap(g => g.tools.map(t => t.file));
    assert.equal(new Set(files).size, files.length);
    for (const f of files) assert.doesNotThrow(() => readFileSync(new URL("../" + f, import.meta.url)), f);
});

test("every page that had a tab row is still reachable from the new nav", () => {
    const old = ["board", "drills", "practice", "season", "roster", "team", "game", "fitness", "conditioning"].map(n => `playbook-${n}.html`);
    const files = GROUPS.flatMap(g => g.tools.map(t => t.file));
    for (const f of old) assert.ok(files.includes(f), f);
});

test("locate finds the group and tool, including steps inside a tool", () => {
    assert.deepEqual(locate("/playbook-drills.html"), { group: "plan", file: "playbook-drills.html" });
    assert.deepEqual(locate("/x/playbook-roster.html?a=1#b"), { group: "team", file: "playbook-roster.html" });
    assert.deepEqual(locate("playbook-run.html"), { group: "plan", file: "playbook-practice.html" });
    assert.deepEqual(locate("playbook-results.html"), { group: "run", file: "playbook-fitness.html" });
    assert.deepEqual(locate("/something-else.html"), { group: "plan", file: "" });
});

test("no group has more than four tools, so the row never wraps on a phone", () => {
    for (const g of GROUPS) assert.ok(toolsOf(g.id).length <= 4, g.id);
});
