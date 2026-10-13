import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../coaching.html", import.meta.url), "utf8");
const section = html.slice(html.indexOf('id="example-week"'), html.indexOf("The Weekly Cycle"));
const text = section.replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/&times;/g, "×").replace(/&ndash;/g, "–").replace(/&ldquo;|&rdquo;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("the example week is clearly made up", () => {
    assert.match(text, /Example only\. Not a real client, and not a promise of results\./);
    assert.match(text, /Sam is made up/);
    assert.ok(!/testimonial|guarantee|results in \d|you will (run|lose|get)|PR\b/i.test(text), "no testimonials, guarantees or result claims");
    assert.ok(!/ -- /.test(text), "real dashes only");
});

test("it shows a full Monday-to-Sunday week that adds up", () => {
    const days = [...section.matchAll(/<span class="ex-dow">(\w+)<\/span>/g)].map(m => m[1]);
    assert.deepEqual(days, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    // The headline miles: Tue about 6, Wed 5, Thu 4, Sat 12, Sun 3 = about 30.
    const miles = [...section.matchAll(/<strong>[^<]+<\/strong> &middot; (?:about )?(\d+) mi/g)].map(m => Number(m[1]));
    assert.deepEqual(miles, [6, 5, 4, 12, 3]);
    assert.equal(miles.reduce((a, b) => a + b, 0), 30);
    assert.match(text, /about 30 miles/);
    assert.equal((section.match(/is-key/g) || []).length, 2, "the two key sessions are marked");
});

test("Tuesday's workout is the kind the app builds, and its parts add up to about its miles", () => {
    assert.match(text, /6 × 800 m at 3:40–3:45/);
    // 1.5 mi warm-up + 6 × 800 m (2.98 mi) + five 90-second jogs (about 0.8 mi) + 1 mi cool-down.
    const total = 1.5 + 6 * 0.497 + 5 * 0.16 + 1;
    assert.ok(Math.abs(total - 6) < 0.5, `the parts come to ${total.toFixed(1)} mi, close to the day's 6`);
});

test("it shows a check-in and a coach reply, and links to the fueling calculator", () => {
    assert.match(text, /Sunday check-in/);
    assert.match(text, /Coach reply/);
    assert.match(section, /href="fuel\.html"/);
    assert.ok(existsFuel(), "fuel.html exists");
});

test("the section is styled by its own stylesheet, which the page loads", () => {
    assert.match(html, /href="css\/public-example\.css"/);
    assert.match(readFileSync(new URL("../css/public-example.css", import.meta.url), "utf8"), /\.ex-week/);
});

function existsFuel() {
    try { readFileSync(new URL("../fuel.html", import.meta.url)); return true; } catch { return false; }
}
