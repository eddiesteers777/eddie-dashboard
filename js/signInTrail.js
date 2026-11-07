/* ==========================================================
   signInTrail.js -- a short, device-only log of sign-in steps.

   Written so "sign-in loops on my phone" can be read off the phone
   instead of guessed at. Holds step names and times only: no tokens,
   no email, no data. Survives sign-out on purpose. ?signincheck on any
   page shows it (js/signInCheck.js). Pure helpers are unit-tested.
   ========================================================== */

const KEY = "sb-signin-trail";
const KEEP = 40;

/** Adds a step to a trail array and keeps the last KEEP. */
export function addStep(list, step, detail, page, now) {
    const next = [...(Array.isArray(list) ? list : []), [now, page, String(step), String(detail ?? "").slice(0, 80)]];
    return next.slice(-KEEP);
}

/** How many times the app sent a signed-out visitor back to the home page within `windowMs`. */
export function recentBounces(list, now, windowMs = 120000) {
    return (Array.isArray(list) ? list : []).filter(e => e[2] === "bounce" && now - e[0] <= windowMs).length;
}

export function readTrail() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]") || []; } catch { return []; }
}

export function trail(step, detail = "") {
    try {
        const page = (location.pathname.split("/").pop() || "index.html");
        localStorage.setItem(KEY, JSON.stringify(addStep(readTrail(), step, detail, page, Date.now())));
    } catch { /* storage unavailable: the log is a courtesy */ }
}
