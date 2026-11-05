/* ==========================================================
   googleSignIn.js -- Google sign-in that never opens the
   firebaseapp.com page.

   Firebase's own pop-up finishes on eddie-s-dashboard.firebaseapp.com.
   iPhone Safari (and the home-screen app) keep that site's storage
   apart from southboundcoaching.com, so the page says "missing initial
   state" and sign-in dies. Google's sign-in script talks straight back
   to this page instead: it returns an access token, and js/auth.js
   hands that token to Firebase.

   Needs GOOGLE_CLIENT_ID (the Firebase project's web client ID, not a
   secret) and southboundcoaching.com in that client's Authorized
   JavaScript origins. With no ID, or if Google's script can't load,
   js/auth.js falls back to the old pop-up.
   ========================================================== */

export const GOOGLE_CLIENT_ID = "";
const SCRIPT_URL = "https://accounts.google.com/gsi/client";
const SCOPES = "openid email profile";

/** Firebase-style error code for a Google script error type, or null to fall back. */
export function googleErrorCode(type) {
    if (type === "popup_closed") return "auth/popup-closed-by-user";
    if (type === "popup_failed_to_open") return "auth/popup-blocked";
    return "auth/internal-error";
}

let scriptPromise = null;
let tokenClient = null;
let pending = null;

function loadScript() {
    if (typeof document === "undefined") return Promise.reject(new Error("no document"));
    if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = SCRIPT_URL;
        el.async = true;
        el.onload = () => window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error("Google script missing"));
        el.onerror = () => { scriptPromise = null; reject(new Error("Google script failed to load")); };
        document.head.appendChild(el);
    });
    return scriptPromise;
}

function buildClient(google, clientId) {
    return google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: response => {
            const p = pending; pending = null;
            if (!p) return;
            if (response?.access_token) p.resolve(response.access_token);
            else p.reject(Object.assign(new Error(response?.error || "no token"), { code: "auth/internal-error" }));
        },
        error_callback: error => {
            const p = pending; pending = null;
            if (p) p.reject(Object.assign(new Error(error?.type || "error"), { code: googleErrorCode(error?.type) }));
        }
    });
}

/** Load Google's script ahead of the tap, so the sign-in window can open inside it. */
export function prewarmGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) return;
    loadScript().then(google => { tokenClient = tokenClient || buildClient(google, GOOGLE_CLIENT_ID); }).catch(() => {});
}

/** True when a tap can open Google's window right now (script loaded, ID set). */
export function googleSignInReady() {
    return Boolean(GOOGLE_CLIENT_ID && tokenClient);
}

/** Opens Google's sign-in window. Call it straight from a tap. Resolves to an access token. */
export function requestGoogleAccessToken() {
    return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try { tokenClient.requestAccessToken({ prompt: "select_account" }); }
        catch (error) { pending = null; reject(Object.assign(error, { code: "auth/popup-blocked" })); }
    });
}
