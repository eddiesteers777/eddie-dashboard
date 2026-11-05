/* ==========================================================
   syncGuard.js -- pure rules for two cloud-sync questions.

   1. May this device push? Only after it has read the account's
      cloud copy once. A device that never did would send its own
      (empty or default) keys as "newest" and overwrite the cloud's
      (2026-11-05: a device that said "never synced" would have
      replaced the plan completions with one tick).
   2. What does the sync line say? A device that has never synced says
      so in words and says what that means, instead of a bare
      "Synced never synced on this device".
   ========================================================== */

export const NOT_PULLED_ERROR = "not-pulled-yet";
export const UNREACHABLE_ERROR = "cloud-unreachable";

/**
 * True when this device has read the cloud copy for `uid`.
 * `pulledUid` is the flag a finished pull leaves. Devices from before the
 * flag existed count as pulled when they synced before for the same owner.
 */
export function hasPulled({ pulledUid, uid, ownerUid, lastSyncedAt }) {
    if (!uid) return false;
    if (pulledUid) return pulledUid === uid;
    return Boolean(lastSyncedAt) && ownerUid === uid;
}

/** { text, error } for the sync line in the header and More. `ago` turns a time into words. */
export function syncStatusLine(status, online, ago) {
    const lastSyncedAt = status?.lastSyncedAt || null;
    const err = status?.lastError && status.lastError !== "not-signed-in" ? status.lastError : null;
    if (status?.lastError === "not-signed-in" && !lastSyncedAt) return { text: "Signed out", error: false };
    if (online === false) return { text: "Offline — last synced " + ago(lastSyncedAt), error: false };
    if (err === NOT_PULLED_ERROR) return { text: "Your data hasn't loaded — tap to retry", error: true };
    if (err === UNREACHABLE_ERROR) return { text: "Can't reach your saved data — tap to retry", error: true };
    if (err) return { text: "Sync error — tap to retry", error: true };
    if (!lastSyncedAt) return { text: "Your data hasn't loaded yet — tap to sync", error: true };
    return { text: "Synced " + ago(lastSyncedAt), error: false };
}
