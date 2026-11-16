import test from "node:test";
import assert from "node:assert/strict";
import * as N from "../js/bibleNotes.js";
import * as B from "../js/biblePlan.js";

const mem = obj => ({ get length() { return Object.keys(obj).length; }, key: i => Object.keys(obj)[i], getItem: k => obj[k] ?? null });

test("bookOf finds the book, including numbered books and Psalm", () => {
    assert.equal(N.bookOf("Luke 8"), "Luke");
    assert.equal(N.bookOf("1 Samuel 3:4"), "1 Samuel");
    assert.equal(N.bookOf("Psalm 46"), "Psalm");
    assert.equal(N.bookOf("John 3:16"), "John");
    assert.equal(N.bookOf("1 John 2"), "1 John");
    assert.equal(N.bookOf("nonsense"), "");
});

test("a note needs a reference and at least one answer", () => {
    assert.equal(N.newNote({ ref: "Luke 8", says: "", does: "" }, "2026-11-16"), null);
    assert.equal(N.newNote({ ref: "", says: "x", does: "" }, "2026-11-16"), null);
    assert.ok(N.newNote({ ref: "Luke 8", says: "x", does: "" }, "2026-11-16"));
});

test("search looks at the reference and both answers; book chips follow Bible order", () => {
    const a = N.newNote({ ref: "Psalm 46", says: "be still", does: "" }, "2026-11-14"), b = N.newNote({ ref: "Luke 8", says: "storm", does: "trust" }, "2026-11-15");
    const notes = N.loadNotes(mem({ [N.keyFor(a.id)]: JSON.stringify(a), [N.keyFor(b.id)]: JSON.stringify(b), [N.keyFor("gone")]: JSON.stringify({ id: "gone", deleted: true }) }));
    assert.equal(notes.length, 2);
    assert.equal(notes[0].ref, "Luke 8", "newest first");
    assert.deepEqual(N.filterNotes(notes, "trust").map(n => n.ref), ["Luke 8"]);
    assert.deepEqual(N.filterNotes(notes, "", "Psalm").map(n => n.ref), ["Psalm 46"]);
    assert.deepEqual(N.noteBooks(notes).map(x => x.book), ["Psalm", "Luke"]);
});

test("the verse to carry shows only on the day it was picked", () => {
    const c = { ref: "Psalm 46:10", words: "Be still.", date: "2026-11-16" };
    assert.ok(N.carryFor(c, "2026-11-16"));
    assert.equal(N.carryFor(c, "2026-11-17"), null);
    assert.equal(N.carryFor(null, "2026-11-16"), null);
});

test("esvUrl is a link out with a plus for each space", () => {
    assert.equal(N.esvUrl("Luke 8"), "https://www.esv.org/Luke+8/");
    assert.equal(N.esvUrl("1 John 2"), "https://www.esv.org/1+John+2/");
});

test("book map counts chapters from the plan's check-offs and has all 66 books", () => {
    let plan = B.startPlan("2026-01-01", "year");
    assert.equal(N.bookProgress(plan).length, 66);
    assert.ok(N.bookProgress(plan).every(b => !b.started));
    // finish every chapter of the first days until Genesis (50 chapters) is done
    let day = 0;
    while (!N.bookProgress(plan)[0].done) { B.chaptersOn(plan, day).forEach((_, i) => { plan = B.toggleChapter(plan, "2026-01-01", day, i); }); day++; }
    const g = N.bookProgress(plan)[0];
    assert.equal(g.read, 50); assert.ok(g.done);
    assert.ok(N.bookProgress(plan)[1].started || day > 0);
    assert.equal(N.bookAbbr("1 Samuel"), "1Sa");
    assert.equal(N.bookAbbr("Judges"), "Jdg");
    assert.equal(new Set(B.BOOKS.map(b => N.bookAbbr(b[0]))).size, 66, "every abbreviation is different");
});
