/* ==========================================
   Southbound — "Describe it": ask the AI helper (network part)

   describePlan({ description, settings, today })
     -> { settings, changed, understood, notes, name }  (js/planDescribe.js)
   Sends the coach's words and current settings to the AI helper
   (js/aiConfig.js, cloudflare-worker/ai-helper.js) with the coach's
   sign-in token, and cleans the answer. Throws an Error with a plain
   message the dialog can show.
========================================== */

import { AI_HELPER_URL, isAiConfigured } from "./aiConfig.js";
import { describeRequest, cleanDescribed } from "./planDescribe.js";

export async function describePlan({ description, settings, today }) {
    if (!isAiConfigured()) throw new Error("The AI helper isn't set up yet.");
    const { getIdToken } = await import("./auth.js");
    const token = await getIdToken?.();
    if (!token) throw new Error("Sign in again, then try once more.");
    let res;
    try {
        res = await fetch(AI_HELPER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(describeRequest({ description, settings, today }))
        });
    } catch {
        throw new Error("Couldn't reach the AI helper. Check your connection and try again.");
    }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw new Error(data?.message || "The AI helper couldn't answer that. Try again.");
    return cleanDescribed(data?.input, settings, today);
}
