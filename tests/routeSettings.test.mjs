// Route builder settings: defaults, reading bad data, the stored record, sidewalk-first.
import test from "node:test";
import assert from "node:assert/strict";
import { readSettings, settingsRecord, sidewalkFirst, DEFAULT_LAYERS, LAYER_KEYS } from "../js/routeSettings.js";

test("a new user sees the whole builder: every layer on, sidewalk-first on, safety toggles off", () => {
    const s = readSettings(null);
    assert.deepEqual(s.layers, { safe: true, fuel: true, profile: true, markers: true, surface: true, globe: true });
    assert.equal(sidewalkFirst(s.prefs), true);
    assert.deepEqual(s.opts, { avoidBusy: false, preferLit: false });
    assert.equal(s.pace, null); assert.equal(s.gelG, null);
});

test("older records (pace + prefs only, before Settings) keep their values and get the defaults", () => {
    const s = readSettings(JSON.stringify({ pace: "8:30", gelG: 30, prefs: { style: "direct", surface: "trail" } }));
    assert.equal(s.pace, "8:30"); assert.equal(s.gelG, 30);
    assert.equal(sidewalkFirst(s.prefs), false); assert.equal(s.prefs.surface, "trail");
    assert.deepEqual(s.layers, { ...DEFAULT_LAYERS });
});

test("unreadable or wrong-typed values fall back to the default, one by one", () => {
    assert.deepEqual(readSettings("{not json").layers, { ...DEFAULT_LAYERS });
    const s = readSettings({ layers: { fuel: false, globe: "no", safe: 0, extra: false }, opts: { avoidBusy: "yes", preferLit: true }, gelG: 999 });
    assert.equal(s.layers.fuel, false);
    assert.equal(s.layers.globe, true); assert.equal(s.layers.safe, true);
    assert.equal("extra" in s.layers, false);
    assert.deepEqual(s.opts, { avoidBusy: false, preferLit: true });
    assert.equal(s.gelG, null);
});

test("the stored record holds only known fields", () => {
    const r = settingsRecord({ pace: "9:00", gelG: 25, prefs: { style: "sidewalk" }, layers: { fuel: false }, opts: { avoidBusy: true }, email: "x" });
    assert.deepEqual(Object.keys(r).sort(), ["gelG", "layers", "opts", "pace", "prefs"]);
    assert.deepEqual(Object.keys(r.layers), LAYER_KEYS);
    assert.equal(r.layers.fuel, false); assert.equal(r.opts.avoidBusy, true);
    assert.deepEqual(readSettings(JSON.stringify(r)), readSettings(r), "round trip");
});
