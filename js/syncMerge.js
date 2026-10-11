/* ==========================================
   Southbound — merging a synced key changed in two places (pure)

   Cloud sync (js/cloudSync.js) is last write wins per key. That's fine
   for most keys, but for a few the "loser" would be real work: an
   unfinished fueling plan typed on a phone while the laptop also edited
   it, or a plan saved on each of two devices. When a push finds the
   cloud's copy of one of these keys changed since this device last
   synced (it differs from `base`) AND this device changed it too, it
   asks mergeSyncedValue for one value that keeps both:

     fueling-profile        newest answer per field (js/fuelProfile.js)
     fueling-draft-<id>     an edit beats a delete; two edits: this device
                            keeps the draft, the other's becomes a copy
                            (js/fuelDrafts.js)
     fueling-plans          three-way merge by id: added on either side is
     fueling-library        kept, removed on one side and untouched on the
     fueling-diy-recipes    other is removed, changed on both: the newer
                            stays, the other is kept as a copy

   -> null (not a key we merge: last write wins as before) or
      { value, extra: [[key, value]] } (extra keys to add, e.g. a copy).

   Unit-tested in tests/fuelDrafts.test.mjs.
========================================== */

import { mergeProfiles } from "./fuelProfile.js";
import { mergeDraftValues, DRAFT_PREFIX, stable } from "./fuelDrafts.js";

const BY_ID_KEYS = ["fueling-plans", "fueling-library", "fueling-diy-recipes"];

const parse = s => { try { return JSON.parse(s); } catch { return undefined; } };

const itemTime = item => {
    const t = Number(item?.updatedAt) || Date.parse(item?.date || "") || 0;
    return Number.isFinite(t) ? t : 0;
};

/**
 * Three-way merge of two lists of { id } records against what both last
 * agreed on. Nothing either side added is lost; a record changed on both
 * keeps the newer one at its id and the other as "<id>-copy".
 */
export function mergeById(local, cloud, base) {
    const L = Array.isArray(local) ? local : [];
    const C = Array.isArray(cloud) ? cloud : [];
    const B = Array.isArray(base) ? base : [];
    const byId = list => new Map(list.filter(x => x && x.id != null).map(x => [String(x.id), x]));
    const lm = byId(L), cm = byId(C), bm = byId(B);
    const out = [];
    const seen = new Set();
    const push = item => { out.push(item); seen.add(String(item.id)); };
    const order = [...C, ...L].filter(x => x && x.id != null);
    for (const item of order) {
        const id = String(item.id);
        if (seen.has(id)) continue;
        const l = lm.get(id), c = cm.get(id), b = bm.get(id);
        const changedL = l && (!b || stable(l) !== stable(b));
        const changedC = c && (!b || stable(c) !== stable(b));
        if (l && c) {
            if (stable(l) === stable(c)) { push(l); continue; }
            if (!changedL) { push(c); continue; }
            if (!changedC) { push(l); continue; }
            const [win, lose] = itemTime(c) > itemTime(l) ? [c, l] : [l, c];
            push(win);
            let copyId = typeof lose.id === "number" ? lose.id + 1 : `${lose.id}-copy`;
            while (lm.has(String(copyId)) || cm.has(String(copyId)) || seen.has(String(copyId))) copyId = typeof copyId === "number" ? copyId + 1 : `${copyId}-2`;
            push({ ...lose, id: copyId, ...(lose.name ? { name: `${lose.name} (from another device)` } : {}) });
            continue;
        }
        // Only one side has it: deleted on the other, or new here.
        const only = l || c;
        const changedOnly = l ? changedL : changedC;
        if (!b || changedOnly) push(only);      // new, or edited while the other side removed it: keep
        // else: removed on the other side and untouched here: stays removed
    }
    return out;
}

export function mergeSyncedValue(key, localStr, cloudStr, baseStr) {
    if (localStr == null || cloudStr == null || localStr === cloudStr) return null;
    if (key === "fueling-profile") {
        return { value: JSON.stringify(mergeProfiles(localStr, cloudStr)), extra: [] };
    }
    if (key.startsWith(DRAFT_PREFIX)) return mergeDraftValues(localStr, cloudStr);
    if (BY_ID_KEYS.includes(key)) {
        const l = parse(localStr), c = parse(cloudStr), b = baseStr == null ? [] : parse(baseStr);
        if (!Array.isArray(l) || !Array.isArray(c)) return null;
        return { value: JSON.stringify(mergeById(l, c, Array.isArray(b) ? b : [])), extra: [] };
    }
    return null;
}
