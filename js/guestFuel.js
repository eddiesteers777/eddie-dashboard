/* ==========================================
   Southbound — the Fueling calculator without an account (phase 2, 2026-10-15)

   Anyone can use fueling.html signed out. A guest's answers, drafts, saved
   plans and library stay in this browser (the same "fueling-" keys the
   page always uses; nothing is sent anywhere). When that guest signs in,
   js/auth.js would normally clear every account key left on the device (a
   new owner must never inherit the last one's data), so it sets the guest's
   fueling keys aside first (STASH_KEY, tied to the account that signed in).
   The Fueling page then asks once: add them to your account? Yes merges
   them with what the account already has, the same way two devices merge
   (js/syncMerge.js): nothing either side made is lost, the account's own
   settings win where there is nothing to merge. No drops them.

   Pure: no DOM, no storage. Unit-tested in tests/guestFuel.test.mjs.
========================================== */

import { mergeSyncedValue } from "./syncMerge.js";

export const GUEST_MARK = "sb-guest-fueling";            // set while a guest uses the calculator
export const STASH_KEY = "sb-guest-fueling-stash";       // { uid, at, keys: { key: value } }
export const FUEL_PREFIX = "fueling-";

/**
 * The guest's fueling keys merged into what the account has now.
 * `stash` and `current` are { key: string value }. Returns { set, added, merged }:
 * `set` is every key to write (with any copies a merge made), `added` and
 * `merged` count what happened, so the page can say so.
 */
export function adoptGuestFueling(stash = {}, current = {}) {
    const set = {};
    let added = 0, merged = 0;
    for (const [key, value] of Object.entries(stash || {})) {
        if (!key.startsWith(FUEL_PREFIX) || typeof value !== "string") continue;
        const now = current?.[key];
        if (now == null) { set[key] = value; added++; continue; }
        if (now === value) continue;
        const m = mergeSyncedValue(key, value, now, null);
        if (!m) continue;                                // not a key we merge (mode, units...): the account's own stays
        set[key] = m.value;
        for (const [k, v] of m.extra || []) set[k] = v;
        merged++;
    }
    return { set, added, merged };
}

/** Is there a stash waiting for this account (and only this one)? */
export function stashFor(raw, uid) {
    if (!raw || !uid) return null;
    let s;
    try { s = JSON.parse(raw); } catch { return null; }
    if (!s || s.uid !== uid || !s.keys || typeof s.keys !== "object") return null;
    return Object.keys(s.keys).some(k => k.startsWith(FUEL_PREFIX)) ? s : null;
}
