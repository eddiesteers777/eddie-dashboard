import assert from "node:assert/strict";
import { test } from "node:test";
import { LOOKS, lookFor, DEFAULT_LOOK } from "../js/routeMapLook.js";

test("every look has a tile url, zoom and attribution", () => {
    for (const l of LOOKS) {
        assert.match(l.url, /^https:\/\/[^ ]*\{z\}\/\{x\}\/\{y\}\.png$/);
        assert.ok(l.maxZoom >= 15 && l.attribution.length > 10 && l.label);
    }
    assert.equal(new Set(LOOKS.map(l => l.id)).size, LOOKS.length);
});
test("unknown or empty choices fall back to the default look", () => {
    assert.equal(lookFor("terrain").id, "terrain");
    assert.equal(lookFor("satellite").id, DEFAULT_LOOK);
    assert.equal(lookFor(null).id, DEFAULT_LOOK);
    assert.ok(LOOKS.some(l => l.id === DEFAULT_LOOK));
});
test("terrain credits OpenTopoMap and OpenStreetMap", () => {
    const t = lookFor("terrain");
    assert.match(t.attribution, /OpenTopoMap/);
    assert.match(t.attribution, /OpenStreetMap/);
});
