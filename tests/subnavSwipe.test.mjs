// Swiping the page sideways moves between a section's tabs (js/subnavSwipe.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { swipeDirection, neighbourPage } from "../js/subnavSwipe.js";

test("a clear sideways swipe is a swipe; short, slanted or slow ones are not", () => {
    assert.equal(swipeDirection({ dx: -140, dy: 10, ms: 200 }), 1);   // finger left = next tab
    assert.equal(swipeDirection({ dx: 140, dy: -20, ms: 200 }), -1);  // finger right = previous tab
    assert.equal(swipeDirection({ dx: -60, dy: 0, ms: 100 }), 0);     // too short
    assert.equal(swipeDirection({ dx: -120, dy: 90, ms: 200 }), 0);   // mostly a scroll
    assert.equal(swipeDirection({ dx: -100, dy: 5, ms: 1500 }), 0);   // a slow drag
    assert.equal(swipeDirection({ dx: NaN, dy: 0, ms: 100 }), 0);
});

test("the neighbouring tab, and nothing past either end", () => {
    const pages = ["train.html", "running.html", "strength.html"];
    assert.equal(neighbourPage(pages, "running.html", 1), "strength.html");
    assert.equal(neighbourPage(pages, "running.html", -1), "train.html");
    assert.equal(neighbourPage(pages, "train.html", -1), null);
    assert.equal(neighbourPage(pages, "strength.html", 1), null);
    assert.equal(neighbourPage(pages, "other.html", 1), null);
    assert.equal(neighbourPage(pages, "running.html", 0), null);
});
