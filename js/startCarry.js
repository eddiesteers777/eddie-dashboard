/* ==========================================
   Southbound — carry the "Get started" taps into the new account

   js/auth.js sets the taps aside at first sign-in (sb-start-pending, tied to
   the account that signed in). This writes them into that account's own
   client record, only where an answer is still empty, and the chosen mark
   into the person's settings. Failing here never blocks sign-in: the stash
   stays and the next page load tries again.
========================================== */
import { START_PENDING_KEY, cleanStart, mergedRecord } from "./startFlow.js";

export async function carryStartAnswers(user) {
    if (!user) return false;
    let stash;
    try { stash = JSON.parse(localStorage.getItem(START_PENDING_KEY) || "null"); } catch { stash = null; }
    if (!stash) return false;
    if (stash.uid !== user.uid) { try { localStorage.removeItem(START_PENDING_KEY); } catch { /* fine */ } return false; }

    const answers = cleanStart(stash.answers);
    const { getClientRecord, saveClientRecord } = await import("./clientRecords.js");
    // Reading your own not-yet-created record is permission-denied, not "missing": that means new.
    let existing = null;
    try { existing = await getClientRecord(user.uid); } catch (error) { if (error?.code !== "permission-denied") throw error; }

    const merged = mergedRecord(answers, existing);
    if (merged) await saveClientRecord(user.uid, merged, existing);
    if (answers.mark) {
        const { saveUserSettings } = await import("./userSettings.js");
        saveUserSettings({ mark: answers.mark });
    }
    try { localStorage.removeItem(START_PENDING_KEY); } catch { /* fine */ }
    return true;
}
