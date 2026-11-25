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
