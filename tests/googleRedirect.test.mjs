import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthUrl, parseReturnHash, useRedirectSignIn, RETURN_URL } from "../js/googleRedirect.js";

test("the trip out names the client, the return page and the state", () => {
    const u = new URL(buildAuthUrl({ clientId: "abc.apps.googleusercontent.com", state: "s1" }));
    assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(u.searchParams.get("redirect_uri"), RETURN_URL);
    assert.equal(u.searchParams.get("response_type"), "token");
    assert.equal(u.searchParams.get("state"), "s1");
    assert.equal(u.searchParams.get("prompt"), "select_account");
});
test("a good return gives the token", () => {
    assert.deepEqual(parseReturnHash("#access_token=tok&token_type=Bearer&state=s1", "s1"), { kind: "token", accessToken: "tok" });
});
test("a return with the wrong or missing state is refused", () => {
    assert.equal(parseReturnHash("#access_token=tok&state=other", "s1").error, "state-mismatch");
    assert.equal(parseReturnHash("#access_token=tok&state=s1", null).error, "state-mismatch");
});
test("Google's own error and an empty return are told apart", () => {
    assert.deepEqual(parseReturnHash("#error=access_denied&state=s1", "s1"), { kind: "error", error: "access_denied" });
    assert.equal(parseReturnHash("", "s1").kind, "none");
    assert.equal(parseReturnHash("#state=s1", "s1").error, "no-token");
});
test("only the Home Screen app on the real site goes out by full page", () => {
    assert.equal(useRedirectSignIn({ standalone: true, origin: "https://southboundcoaching.com" }), true);
    assert.equal(useRedirectSignIn({ standalone: false, origin: "https://southboundcoaching.com" }), false);
    assert.equal(useRedirectSignIn({ standalone: true, origin: "http://localhost:8934" }), false);
});
