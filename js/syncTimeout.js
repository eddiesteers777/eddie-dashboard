/* ==========================================================
   syncTimeout.js -- pure helpers for a cloud read that hangs.

   On Eddie's iPhone (2026-11-07) the sync read started and never
   answered: no result, no error, so the page kept its empty copy and
   the sync line never said why. A read now gets a time limit, and when
   it runs out the doc is read over plain HTTPS instead.
   ========================================================== */

export const READ_LIMIT_MS = 12000;
export const WRITE_LIMIT_MS = 25000;

/** Rejects with { code } if `promise` has not settled within `ms`. */
export function withTimeout(promise, ms, code = "sync-timeout") {
    let timer;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), ms); });
    return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

const text = f => (f && "stringValue" in f ? f.stringValue : null);

/** A Firestore REST document ({ fields }) for the sync doc, as { exists, data, keyUpdatedAt, updatedAtMs }. */
export function parseSyncDocRest(doc) {
    const fields = doc?.fields;
    if (!fields) return { exists: false, data: {}, keyUpdatedAt: {}, updatedAtMs: 0 };
    const data = {};
    for (const [k, v] of Object.entries(fields.data?.mapValue?.fields || {})) {
        const s = text(v);
        if (s !== null) data[k] = s;
    }
    const keyUpdatedAt = {};
    for (const [k, v] of Object.entries(fields.keyUpdatedAt?.mapValue?.fields || {})) {
        const n = Number(v?.integerValue ?? v?.doubleValue ?? 0);
        if (n) keyUpdatedAt[k] = n;
    }
    const updatedAtMs = fields.updatedAt?.timestampValue ? Date.parse(fields.updatedAt.timestampValue) || 0 : 0;
    return { exists: true, data, keyUpdatedAt, updatedAtMs };
}
