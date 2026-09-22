/* ==========================================
   EddieOS — Coach Notes (local read)

   Pure localStorage read, deliberately kept free of any Firebase
   import. Cloud sync (js/cloudSync.js + js/coachAccess.js) is what
   writes "plan-coach-notes" here after a pull; pages that only need
   to *display* a note (like programs.js) import from this file
   instead of coachAccess.js so a slow/blocked Firestore SDK load
   can never break their render.
========================================== */

const NOTES_KEY = "plan-coach-notes";

export function getLocalCoachNotes() {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY) || "{}") || {}; }
    catch { return {}; }
}

export function setLocalCoachNotes(notes) {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes || {})); }
    catch {}
}
