import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isService } from "../js/services.js";
import { isShown } from "../js/interestPicker.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// What each button should open: the application with a real service chosen.
// Soccer opens with 1-on-1; the application's service screen says "tap all that
// apply", so Group can be added there.
const EXPECTED = { running: "running", strength: "strength", soccer: "soccer_1on1" };

test("each button opens the application with a real service chosen", () => {
    for (const [key, service] of Object.entries(EXPECTED)) {
        assert.ok(isService(service), `${service} is one of the application's services (js/services.js)`);
        // The free calculator that had its own picker (fuel.html) became the full Fueling calculator (2026-10-15).
        for (const page of ["pace.html"]) {
            const html = read(page);
            assert.ok(html.includes(`href="apply.html?service=${service}" data-interest="${key}"`), `${page}: ${key} opens the application with ${service} chosen`);
        }
    }
    assert.deepEqual(Object.keys(EXPECTED), ["running", "strength", "soccer"]);
});

test("each page hides the picker until there's a result and loads its script", () => {
    for (const page of ["pace.html"]) {
        const html = read(page);
        assert.match(html, /id="interestPicker"[^>]*hidden/, `${page}: hidden until there's a result`);
        assert.match(html, /src="js\/interestPicker\.js"/, `${page} loads it`);
        assert.match(html, /data-interest-dismiss/, `${page}: it can be dismissed`);
    }
});

test("isShown tells hidden from shown", () => {
    globalThis.getComputedStyle = el => ({ display: el.display || "block" });
    assert.equal(isShown(null), false);
    assert.equal(isShown({ hidden: true, display: "block" }), false);
    assert.equal(isShown({ hidden: false, display: "none" }), false);
    assert.equal(isShown({ hidden: false, display: "block" }), true);
    delete globalThis.getComputedStyle;
});

test("it watches the result of each calculator, and those elements exist", () => {
    const pace = read("pace.html");
    const watch = pace.match(/id="interestPicker" data-watch="([^"]+)"/)[1].split(",").map(s => s.trim());
    for (const sel of watch) assert.ok(pace.includes(`id="${sel.slice(1)}"`), `pace.html has ${sel}`);
    assert.ok(watch.length === 3, "pace, race splits and training zones results");
});

test("it never stores or sends anything", () => {
    const src = read("js/interestPicker.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon|cookie|firebase/.test(src));
});

test("the copy is plain: no pressure, no urgency", () => {
    const html = read("pace.html");
    const card = html.slice(html.indexOf('id="interestPicker"'), html.indexOf("</section>", html.indexOf('id="interestPicker"')));
    const text = card.replace(/<[^>]+>/g, " ");
    assert.match(text, /What are you training for\?/);
    assert.match(text, /needs no account/);
    assert.ok(!/limited|only \d|hurry|last chance|don't miss|spots left|today only/i.test(text), "no fake urgency or scarcity");
});
