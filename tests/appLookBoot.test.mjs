// Night mode (2026-11-25): js/appLookBoot.js picks the mode before the first paint, and css/skin.css part 3
// (the mist ground) only applies in light mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const boot = readFileSync(new URL("../js/appLookBoot.js", import.meta.url), "utf8");

function run({ stored, dark = false, pb = false } = {}) {
    const classes = new Set(pb ? ["pb-app"] : []);
    const attrs = {};
    const store = new Map(stored === undefined ? [] : [["southbound-look", stored]]);
    const events = [];
    const html = {
        classList: { contains: c => classes.has(c), add: c => classes.add(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
        setAttribute: (k, v) => { attrs[k] = v; },
    };
    const mqListeners = [];
    const mq = { matches: dark, addEventListener: (_, f) => mqListeners.push(f) };
    const win = {
        matchMedia: () => mq,
        addEventListener: () => {},
        dispatchEvent: e => events.push(e),
    };
    const ctx = {
        window: win,
        document: { documentElement: html, body: null, readyState: "loading", addEventListener: () => {}, querySelector: () => null },
        localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
        CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } },
        JSON, Date,
    };
    vm.runInNewContext(boot, ctx);
    return { classes, attrs, store, events, look: win.SouthboundLook, goDark: () => { mq.matches = true; mqListeners.forEach(f => f()); } };
}

test("light is the default, with the mist ground on", () => {
    const r = run();
    assert.equal(r.attrs["data-sb-mode"], "light");
    assert.ok(r.classes.has("al-on") && r.classes.has("al-light"));
});

test("a bad saved value falls back to light", () => {
    assert.equal(run({ stored: "{oops" }).attrs["data-sb-mode"], "light");
    assert.equal(run({ stored: JSON.stringify({ m: "purple" }) }).attrs["data-sb-mode"], "light");
});

test("night drops the mist ground but keeps the app look", () => {
    const r = run({ stored: JSON.stringify({ m: "night" }) });
    assert.equal(r.attrs["data-sb-mode"], "night");
    assert.ok(r.classes.has("al-on") && !r.classes.has("al-light"));
});

test("match device follows the phone, also when it changes", () => {
    assert.equal(run({ stored: JSON.stringify({ m: "auto" }), dark: true }).attrs["data-sb-mode"], "night");
    const r = run({ stored: JSON.stringify({ m: "auto" }) });
    assert.equal(r.attrs["data-sb-mode"], "light");
    r.goDark();
    assert.equal(r.attrs["data-sb-mode"], "night");
    assert.equal(r.events.at(-1).type, "southbound-look");
});

test("set saves the choice and tells the page", () => {
    const r = run();
    r.look.set({ m: "night" });
    assert.equal(JSON.parse(r.store.get("southbound-look")).m, "night");
    assert.ok(!r.classes.has("al-light"));
    assert.equal(r.events.at(-1).detail.m, "night");
    r.look.set({ m: "light" });
    assert.ok(r.classes.has("al-light"));
});

test("the Playbook keeps its own look", () => {
    const r = run({ pb: true });
    assert.ok(!r.classes.has("al-on") && !r.classes.has("al-light"));
    assert.equal(r.look, undefined);
});

test("skin.css: part 3 is light mode only, parts 1 and 2 never mention it", () => {
    const css = readFileSync(new URL("../css/skin.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const i = css.indexOf("html.al-light");
    assert.ok(i > 0);
    const head = css.slice(0, i);
    const p3 = css.slice(head.lastIndexOf("}") + 1);
    assert.ok(!/al-light/.test(head), "parts 1 and 2 stay mode-free");
    const selectors = [...p3.matchAll(/([^{}]+)\{/g)].flatMap(m => m[1].split(/,(?![^()]*\))/)).map(s => s.trim()).filter(Boolean);
    assert.ok(selectors.length > 50);
    for (const s of selectors) assert.ok(s.startsWith("html.al-light"), s);
});

test("settings has the Look switch", () => {
    const html = readFileSync(new URL("../settings.html", import.meta.url), "utf8");
    assert.match(html, /id="lookMode"/);
    assert.match(html, /src="js\/lookSetting\.js"/);
});

// Colourways (step 4, 2026-11-25): Fog, Forest, Pitch, Track, Dusk, Slate.
test("colourway: Fog by default, a saved one applies, a bad one falls back to Fog", () => {
    assert.equal(run().attrs["data-sb-scheme"], "fog");
    assert.equal(run({ stored: JSON.stringify({ c: "track", m: "night" }) }).attrs["data-sb-scheme"], "track");
    assert.equal(run({ stored: JSON.stringify({ c: "neon" }) }).attrs["data-sb-scheme"], "fog");
});

test("changing the colourway keeps the mode, and the other way round", () => {
    const r = run({ stored: JSON.stringify({ c: "dusk", m: "night" }) });
    r.look.set({ c: "pitch" });
    assert.deepEqual([r.attrs["data-sb-scheme"], r.attrs["data-sb-mode"]], ["pitch", "night"]);
    r.look.set({ m: "light" });
    assert.deepEqual([r.attrs["data-sb-scheme"], r.attrs["data-sb-mode"]], ["pitch", "light"]);
    assert.equal(JSON.stringify(r.look.schemes.map(s => s[0])), JSON.stringify(["fog", "forest", "pitch", "track", "dusk", "slate"]));
});

test("the colourway blocks in skin.css are up to date (npm run colorways)", async () => {
    const { SCHEMES, readTokens, schemeTokens } = await import("../scripts/build-colorways.mjs");
    const css = readFileSync(new URL("../css/skin.css", import.meta.url), "utf8");
    const tokens = readTokens(css);
    for (const [id, , main] of SCHEMES.slice(1)) {
        const m = css.match(new RegExp(`html\\[data-sb-scheme="${id}"\\]\\{([^}]*)\\}`));
        assert.ok(m, `block for ${id}`);
        const have = Object.fromEntries([...m[1].matchAll(/(--sb-[\w-]+):([^;]+);/g)].map(x => [x[1], x[2]]));
        assert.deepEqual(have, Object.fromEntries(schemeTokens(tokens, main)), id);
    }
    assert.ok(tokens.length > 60);
    assert.ok(!/#[0-9a-fA-F]{6}\b/.test(css.slice(css.indexOf("/* Part 2:")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/#(D2AD62|E6CB8E|A8883F|d19a7a)\b/gi, "")), "parts 2 and 3 use tokens, not hex blues");
});

test("text stays readable in every colourway", async () => {
    const { SCHEMES, readTokens, schemeTokens, contrast } = await import("../scripts/build-colorways.mjs");
    const css = readFileSync(new URL("../css/skin.css", import.meta.url), "utf8");
    const tokens = readTokens(css), hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    for (const [id, , main] of SCHEMES) {
        const t = new Map(tokens);
        for (const [k, v] of schemeTokens(tokens, main)) t.set(k, v);
        if (id === "fog") t.clear(), tokens.forEach(([k, v]) => t.set(k, v));
        for (const [a, b] of [["--sb-ink", "--sb-ground"], ["--sb-ink-3", "--sb-ground"], ["--sb-ink-link", "--sb-ground"], ["--sb-on-card", "--sb-card-top"], ["--sb-on-card-3", "--sb-card-top"]])
            assert.ok(contrast(hex(t.get(a)), hex(t.get(b))) >= 4.5, `${id}: ${a} on ${b}`);
    }
});

test("the look is saved to the account", () => {
    assert.match(readFileSync(new URL("../js/cloudSync.js", import.meta.url), "utf8"), /"southbound-look"/);
});
