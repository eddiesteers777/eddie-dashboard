/* ==========================================================
   signInErrors.js -- what to tell someone when Google sign-in
   doesn't work. Pure: no Firebase, so it's unit-tested.

   Firebase reports a code (auth/popup-blocked...). Closing the
   Google window yourself isn't an error, so it says nothing.
   ========================================================== */

// Codes that mean "the person changed their mind".
const QUIET = new Set([
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/user-cancelled"
]);

/** The words to show for a sign-in failure, or null to stay quiet. */
export function signInFailureMessage(error) {
    const code = String(error?.code || "");
    if (QUIET.has(code)) return null;
    if (code === "auth/popup-blocked") {
        return "Your browser blocked the sign-in window. Allow pop-ups for this site, then tap Sign In again.";
    }
    if (code === "auth/network-request-failed") {
        return "Couldn't reach Google. Check your connection and try again.";
    }
    if (code === "auth/unauthorized-domain") {
        return "Sign-in isn't set up for this web address yet. Open Southbound from southboundcoaching.com and try again.";
    }
    if (code === "auth/too-many-requests") {
        return "Too many sign-in attempts. Wait a minute, then try again.";
    }
    return "Couldn't sign you in. Try again in a moment.";
}
