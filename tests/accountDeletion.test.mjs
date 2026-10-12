import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { REQUESTS, requestFor } from "../js/contactRequests.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
// js/inquiries.js loads Firebase from the web, so read its topic list as text.
const TOPICS = [...read("js/inquiries.js").match(/INTEREST_OPTIONS\s*=\s*\[([\s\S]*?)\];/)[1].matchAll(/value:\s*"([^"]+)"/g)].map(m => m[1]);

test("a deletion request link fills in a fixed message and an existing topic", () => {
    const asked = requestFor("delete-account");
    assert.ok(asked, "delete-account is a known request");
    assert.ok(TOPICS.includes(asked.about), "its topic is one the form (and the rules) accept");
    assert.match(asked.message, /delete my Southbound account/);
    assert.ok(asked.message.length <= 2000, "fits the message limit");
    assert.ok(!/ -- /.test(asked.message), "real dashes only");
});

test("a link can't bring its own words", () => {
    for (const key of ["", null, undefined, "constructor", "__proto__", "toString", "<b>hi</b>", "Please wire me money"]) {
        assert.equal(requestFor(key), null, String(key));
    }
    assert.deepEqual(Object.keys(REQUESTS), ["delete-account"]);
    assert.ok(Object.isFrozen(REQUESTS));
});

test("Settings points at the request, and the privacy page explains it", () => {
    const settings = read("settings.html");
    assert.match(settings, /href="contact\.html\?about=other&amp;request=delete-account"/);
    assert.match(settings, /Ask to delete my account/);
    assert.match(settings, /id="deleteAccountRow"[^>]*data-requires="client"|data-requires="client"[^>]*id="deleteAccountRow"/, "shown to clients, not hidden behind a coach-only rule");
    assert.match(settings, /href="privacy\.html#deleting"/);
    assert.match(read("privacy.html"), /id="deleting"/, "the anchor it links to exists");
    assert.ok(existsSync(new URL("../contact.html", import.meta.url)));
});

test("the Contact page reads the request and leaves a typed message alone", () => {
    const contact = read("js/contact.js");
    assert.match(contact, /requestFor\(query\.get\("request"\)\)/);
    assert.match(contact, /!messageEl\.value\.trim\(\)/, "only fills an empty message");
});
