import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RAIL_CARDS, railHtml } from "../js/footerRail.js";

test("every rail card has its photo sizes and a real page to open", () => {
    for (const c of RAIL_CARDS) {
        for (const w of c.widths) assert.ok(fs.existsSync(`images/${c.photo}-${w}.webp`), `${c.photo}-${w}.webp is missing`);
        assert.ok(fs.existsSync(c.href), `${c.href} is missing`);
        assert.ok(c.alt.length > 10, `${c.photo} needs alt text`);
    }
});

test("the rail lists soccer, strength and running, and each card is a link", () => {
    const tags = new Set(RAIL_CARDS.map(c => c.tag));
    assert.deepEqual([...tags].sort(), ["Running", "Soccer", "Strength"]);
    const html = railHtml();
    assert.equal((html.match(/class="pub-rail-card"/g) || []).length, RAIL_CARDS.length);
    assert.ok(html.includes('aria-label="Scroll photos right"'));
});

test("the rail is skipped on the apply flow and the Playbook tools", async () => {
    const { mountRail } = await import("../js/footerRail.js");
    const doc = { querySelector: () => { throw new Error("should not look for the footer"); } };
    for (const path of ["/apply.html", "/playbook.html", "/playbook-board.html", "/75.html"]) mountRail(doc, path);
});
