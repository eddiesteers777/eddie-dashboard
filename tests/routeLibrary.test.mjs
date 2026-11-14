import assert from "node:assert/strict";
import { test } from "node:test";
import { filterRoutes, matchesFilter, thumbPath } from "../js/routeLibrary.js";

const R = [
    { id: "a", name: "Saturday long loop", miles: 15.5, loop: true, updatedAt: 3 },
    { id: "b", name: "Easy out and back", miles: 5, loop: false, updatedAt: 2 },
    { id: "c", name: "Neighborhood 5K", miles: 3.1, loop: true, updatedAt: 1 }
];

test("filters by distance and loop", () => {
    assert.deepEqual(filterRoutes(R, { filter: "short" }).map(r => r.id), ["c"]);
    assert.deepEqual(filterRoutes(R, { filter: "mid" }).map(r => r.id), ["b"]); // 5.0 is in 5 to 10
    assert.deepEqual(filterRoutes(R, { filter: "long" }).map(r => r.id), ["a"]);
    assert.deepEqual(filterRoutes(R, { filter: "loop" }).map(r => r.id), ["a", "c"]);
    assert.equal(matchesFilter(R[0], "nonsense"), true);
});
test("search ignores case and sorts", () => {
    assert.deepEqual(filterRoutes(R, { query: " EASY " }).map(r => r.id), ["b"]);
    assert.deepEqual(filterRoutes(R, { sort: "near" }).map(r => r.id), ["c", "b", "a"]);
    assert.deepEqual(filterRoutes(R, { sort: "far" }).map(r => r.id), ["a", "b", "c"]);
    assert.deepEqual(filterRoutes(R, { sort: "az" }).map(r => r.id), ["b", "c", "a"]);
    assert.deepEqual(filterRoutes(R).map(r => r.id), ["a", "b", "c"]);
});
test("thumbnail stays inside the box and is empty for no line", () => {
    assert.equal(thumbPath([]), "");
    assert.equal(thumbPath([[33, -86]]), "");
    const d = thumbPath([[33.1, -86.7], [33.15, -86.7], [33.15, -86.6], [33.1, -86.6]], 120, 80, 8);
    for (const [x, y] of [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m => [+m[1], +m[2]])) {
        assert.ok(x >= 8 - 0.1 && x <= 112.1 && y >= 8 - 0.1 && y <= 72.1);
    }
    assert.doesNotThrow(() => thumbPath([[33, -86], [33, -86]])); // a point route does not divide by zero
});
