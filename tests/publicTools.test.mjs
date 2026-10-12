import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const squash = html => html.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();

// The calculator itself, from the tool tabs to the end of its root.
function calculatorMarkup(html, endMarker) {
    const start = html.indexOf('<div class="pc-tool-tabs"');
    const end = html.indexOf(endMarker, start);
    assert.ok(start > 0 && end > start, "calculator markup found");
    return squash(html.slice(start, end));
}

test("the public Pace Calculator is the same calculator as the app's", () => {
    const app = calculatorMarkup(read("pace-calculator.html"), '<script src="js/pace-calculator.js">');
    const pub = calculatorMarkup(read("pace.html"), '<section class="pub-section">');
    // The app page closes #pc-root right before its script; the public page closes it before the call to action.
    const trim = s => s.replace(/(<\/div>\s*)+$/, "").trim();
    assert.equal(trim(pub), trim(app), "pace.html's calculator drifted from pace-calculator.html: change both, or neither");
});

test("the public page needs no account and loads no app code", () => {
    const html = read("pace.html");
    assert.ok(!/loadHeader\.js|firebase|auth\.js|cloudSync/.test(html), "no sign-in, sync or app header");
    assert.match(html, /loadPublicHeader\.js/);
    assert.match(html, /src="js\/pace-calculator\.js"/);
    const script = read("js/pace-calculator.js");
    assert.ok(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|firebase/.test(script), "the calculator stores and sends nothing");
});

test("it is findable: titled, described, and linked from Home", () => {
    const html = read("pace.html");
    assert.match(html, /<title>Free Pace Calculator \| Southbound Coaching<\/title>/);
    assert.match(read("home.html"), /href="pace\.html"/);
    assert.match(html, /href="apply\.html\?service=running"/, "its next step preselects Running on the application");
});
