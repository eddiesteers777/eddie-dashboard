// auth-return.html: finishes a Google sign-in that went out as a full page trip (js/googleRedirect.js).
import { parseReturnHash } from "./googleRedirect.js";
import { trail } from "./signInTrail.js";

const note = document.getElementById("returnNote");
const home = document.getElementById("returnHome");
function fail(message) { note.textContent = message; home.hidden = false; }

(async () => {
    let state = null, back = "index.html";
    try {
        const saved = JSON.parse(localStorage.getItem("sb-oauth-state") || "null");
        if (saved && Date.now() - saved.at < 15 * 60 * 1000) { state = saved.state; back = saved.back || back; }
        localStorage.removeItem("sb-oauth-state");
    } catch { /* storage unavailable */ }
    const result = parseReturnHash(location.hash, state);
    history.replaceState(null, "", location.pathname);      // the token never stays in the address bar
    if (result.kind !== "token") {
        trail("return-fail", result.kind === "error" ? result.error : "nothing came back");
        fail("Sign-in didn't finish. Go back and try again.");
        return;
    }
    trail("return-token", "received");
    try {
        const [{ auth }, { GoogleAuthProvider, signInWithCredential }, { waitForAccountIsolation }, { retryOnNetworkError }] = await Promise.all([
            import("./firebase.js"),
            import("https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js"),
            import("./auth.js"),
            import("./signInRetry.js")
        ]);
        await retryOnNetworkError(
            () => signInWithCredential(auth, GoogleAuthProvider.credential(null, result.accessToken)),
            { onRetry: n => trail("login-retry", "network, try " + (n + 1)) }
        );
        await waitForAccountIsolation();
        try { localStorage.removeItem("__cloudSyncVersion"); localStorage.removeItem("__cloudSyncFullPullAt"); } catch { /* storage unavailable */ }
        trail("login-ok", "via full page");
        location.replace(back);
    } catch (error) {
        trail("login-fail", error?.code || error?.message || "error");
        fail("Couldn't sign you in. Go back and try again.");
    }
})();
