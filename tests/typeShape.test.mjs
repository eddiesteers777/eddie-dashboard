// Type and shape (step 6 of the premium look, 2026-11-25): one corner scale and sentence-case card titles (css/skin.css part 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const skin = read("css/skin.css");
const part5 = skin.slice(skin.indexOf("/* Part 5: type and shape"));
// The public site and the Playbook keep their own corners; these stylesheets are theirs alone.
const NOT_APP = new Set(["playbook.css", "public.css", "publicFog.css", "publicLook.css", "public-example.css", "home.css", "install.css",
    "start.css", "tools.css", "seventyfive.css", "parent.css", "soccerPage.css", "routes.css", "routesBigMap.css"]);

test("the corner scale is set only for the app (html.al-on), with the old control tokens on it", () => {
    const tokens = part5.match(/html\.al-on\{([^}]*)\}/)[1];
    for (const [k, v] of [["xs", 8], ["sm", 12], ["md", 14], ["lg", 18], ["xl", 24]]) assert.match(tokens, new RegExp(`--sb-r-${k}:${v}px`));
    assert.match(tokens, /--radius-pill:var\(--sb-r-md\)/);
    assert.match(tokens, /--radius:var\(--sb-r-lg\)/);
    assert.doesNotMatch(read("css/style.css"), /--sb-r-(xs|sm|md|lg|xl):/, "style.css must not define the scale (public pages would pick it up)");
});

test("every corner from 4 to 28px in the app's stylesheets is a step on the scale, with the old value as fallback", () => {
    for (const f of readdirSync(new URL("../css/", import.meta.url)).filter(f => f.endsWith(".css") && !NOT_APP.has(f))) {
        const css = read(`css/${f}`).replace(/\/\*[\s\S]*?\*\//g, "");
        const loose = [...css.matchAll(/border-radius:\s*(\d+(?:\.\d+)?)px\s*(?:!\s*important)?\s*[;}]/g)].map(m => +m[1]).filter(px => px >= 4 && px < 29);
        assert.deepEqual(loose, [], `${f} has corners off the scale`);
        for (const m of css.matchAll(/var\(--sb-r-(\w+),(\d+(?:\.\d+)?)px\)/g)) assert.ok(["xs", "sm", "md", "lg", "xl"].includes(m[1]), `${f}: ${m[0]}`);
    }
});

test("card titles are sentence case in the text font; Big Shoulders stays for page titles and big numbers", () => {
    const rules = [...part5.matchAll(/html\.al-on :is\(([^)]*(?:\([^)]*\)[^)]*)*)\)\{([^}]*)\}/g)];
    assert.ok(rules.length >= 2);
    for (const [, , body] of rules.slice(0, 2)) {
        assert.match(body, /font-family:var\(--font-body\)!important/);
        assert.match(body, /text-transform:none!important/);
    }
    assert.match(rules[0][1], /\.eos-today-card-header h2/);
    assert.doesNotMatch(rules[0][1], /hr-big|sb-page-title|hero h1/);
});

test("visible card titles in the app are written in sentence case", () => {
    for (const [file, gone] of [["index.html", ["This Week", "Featured Runs", "From Your Coach"]], ["progress.html", ["Six Weeks", "Your Sessions", "Getting Started"]],
        ["train.html", ["Recent Workouts"]], ["analytics.html", ["Training Snapshot", "Data Connections"]], ["cross-training.html", ["Attach to Your Plan"]]]) {
        const html = read(file);
        for (const words of gone) assert.ok(!html.includes(`>${words}<`), `${file}: ${words}`);
    }
});
