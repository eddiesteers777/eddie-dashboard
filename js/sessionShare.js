/* ==========================================
   Southbound — share a completed session as an image

   shareSession(session): the card for a run, a strength workout or a
   cross-training session (js/executionShare.js sessionCardModel), in
   the person's Strength unit, opened in the shared share dialog. Shares
   and saves are noted on the session (workout-shares).
========================================== */

import { sessionCardModel, openCardDialog } from "./executionShare.js";

function unit() {
    try { return JSON.parse(localStorage.getItem("strength-settings") || "null")?.unit === "kg" ? "kg" : "lb"; }
    catch { return "lb"; }
}

export function shareSession(session) {
    // A run: rep by rep when its plan day has targets, else its splits, else
    // the plain card (js/runCard.js); the laps are asked of COROS if needed.
    if (session?.type === "run") {
        const card = import("./runCardData.js").then(m => m.runCardForSession(session)).then(c => c.model).catch(() => null);
        return openCardDialog(card, { date: session.date, sessionId: session.id || null });
    }
    let model = null;
    try { model = sessionCardModel(session, { unit: unit() }); } catch { model = null; }
    return openCardDialog(model, { date: session?.date, sessionId: session?.id || null });
}
