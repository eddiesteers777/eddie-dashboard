import test from "node:test";
import assert from "node:assert/strict";
import { signInFailureMessage } from "../js/signInErrors.js";

test("closing the Google window yourself says nothing", () => {
    for (const code of ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]) {
        assert.equal(signInFailureMessage({ code }), null, code);
    }
});

test("each real failure says what to do next", () => {
    assert.match(signInFailureMessage({ code: "auth/popup-blocked" }), /Allow pop-ups/);
    assert.match(signInFailureMessage({ code: "auth/network-request-failed" }), /connection/);
    assert.match(signInFailureMessage({ code: "auth/unauthorized-domain" }), /southboundcoaching\.com/);
    assert.match(signInFailureMessage({ code: "auth/too-many-requests" }), /Wait a minute/);
});

test("an unknown or missing error still gets a plain message", () => {
    assert.match(signInFailureMessage({ code: "auth/something-new" }), /Couldn't sign you in/);
    assert.match(signInFailureMessage(new Error("boom")), /Try again/);
    assert.match(signInFailureMessage(undefined), /Try again/);
});

test("messages are plain: no codes, no blame, no exclamation marks", () => {
    for (const code of ["auth/popup-blocked", "auth/network-request-failed", "auth/unauthorized-domain", "auth/too-many-requests", "x"]) {
        const m = signInFailureMessage({ code });
        assert.ok(!/auth\//.test(m) && !m.includes("!"), m);
    }
});
