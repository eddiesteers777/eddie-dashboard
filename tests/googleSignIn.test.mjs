import test from "node:test";
import assert from "node:assert/strict";
import { googleErrorCode, googleSignInReady, GOOGLE_CLIENT_ID } from "../js/googleSignIn.js";
import { signInFailureMessage } from "../js/signInErrors.js";

test("closing Google's window is quiet, like the old pop-up", () => {
    assert.equal(signInFailureMessage({ code: googleErrorCode("popup_closed") }), null);
});

test("a blocked Google window gets the pop-up message", () => {
    assert.match(signInFailureMessage({ code: googleErrorCode("popup_failed_to_open") }), /blocked/i);
});

test("anything else gets the plain try-again message", () => {
    assert.match(signInFailureMessage({ code: googleErrorCode("something") }), /Couldn't sign you in/);
});

test("not ready until the script is loaded", () => {
    assert.equal(googleSignInReady(), false);
    assert.equal(typeof GOOGLE_CLIENT_ID, "string");
});
