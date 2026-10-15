// Unit tests for the header account avatar (js/accountModel.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialsOf, safePhotoUrl, accountLabel } from "../js/accountModel.js";

test("initials are the first letter of the first and last name", () => {
    assert.equal(initialsOf("Maya Lopez"), "ML");
    assert.equal(initialsOf("maya lopez"), "ML");
    assert.equal(initialsOf("Maya J. Lopez"), "ML");
    assert.equal(initialsOf("  Maya   Lopez  "), "ML");
});

test("one name gives one letter; unreadable gives nothing so the person icon shows", () => {
    assert.equal(initialsOf("Maya"), "M");
    assert.equal(initialsOf(""), "");
    assert.equal(initialsOf(null), "");
    assert.equal(initialsOf("🙂"), "");
    assert.equal(initialsOf("(Maya) Lopez"), "ML");
});

test("accented and non-Latin names keep their own first letters", () => {
    assert.equal(initialsOf("Émile Zola"), "ÉZ");
    assert.equal(initialsOf("李 小龍"), "李小");
});

test("a profile photo is used only when it is an https address", () => {
    assert.equal(safePhotoUrl("https://lh3.googleusercontent.com/a/abc=s96-c"), "https://lh3.googleusercontent.com/a/abc=s96-c");
    assert.equal(safePhotoUrl("http://example.com/a.jpg"), "");
    assert.equal(safePhotoUrl("javascript:alert(1)"), "");
    assert.equal(safePhotoUrl("data:image/png;base64,AAAA"), "");
    assert.equal(safePhotoUrl('https://x.com/a.jpg" onerror="x'), "");
    assert.equal(safePhotoUrl(undefined), "");
});

test("the avatar button is named for a screen reader", () => {
    assert.equal(accountLabel(null), "Account: sign in");
    assert.equal(accountLabel({ displayName: "Maya Lopez" }), "Account: Maya");
    assert.equal(accountLabel({ displayName: "" }), "Account");
});
