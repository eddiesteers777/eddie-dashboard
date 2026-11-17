/* ==========================================================
   syncTimeout.js -- pure helpers for a cloud read that hangs.

   On Eddie's iPhone (2026-11-07) the sync read started and never
   answered: no result, no error, so the page kept its empty copy and
   the sync line never said why. A read now gets a time limit, and when
   it runs out the doc is read over plain HTTPS instead.
   ========================================================== */

import { mergeSyncedValue } from "./syncMerge.js";

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

/**
 * Puts this device's keys into the cloud copy, newest per key (the rule the push has always used).
 * `existing` is { data, keyUpdatedAt }; returns { data, times } without touching its input.
 * One function so the normal save and the HTTPS save can never disagree.
 */
export function mergeIntoCloud({ existing = {}, localData, localTimes, agreed = {}, now = Date.now() }) {
    const cloudData = { ...(existing.data || {}) };
    const cloudTimes = { ...(existing.keyUpdatedAt || {}) };
    for (const key of Object.keys(localData)) {
        const lt = Number(localTimes[key] || 0) || now;
        const ct = Number(cloudTimes[key] || 0);
        if (!(key in cloudData) || lt >= ct) {
            let value = localData[key];
            if (key in cloudData && cloudData[key] !== value && cloudData[key] !== (agreed[key] ?? null)) {
                try {
                    const merged = mergeSyncedValue(key, value, cloudData[key], agreed[key] ?? null);
                    if (merged) {
                        value = merged.value;
                        for (const [k, v] of merged.extra || []) { if (!(k in cloudData)) { cloudData[k] = v; cloudTimes[k] = lt; } }
                    }
                } catch (e) { console.warn("Sync merge failed for", key, e); }
            }
            cloudData[key] = value; cloudTimes[key] = lt;
        }
    }
    return { data: cloudData, times: cloudTimes };
}

/**
 * The Firestore REST :commit body that saves the sync doc and its version doc.
 * `updateTime` is the sync doc's updateTime when it was read (null = it did not exist), so a save
 * that raced another device is refused (and redone) instead of overwriting it.
 */
export function buildSyncCommitBody({ docsRoot, uid, data, times, version, updateTime }) {
    const stamp = [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }];
    const strings = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { stringValue: String(v) }]));
    const stamps = Object.fromEntries(Object.entries(times).map(([k, v]) => [k, { integerValue: String(Math.round(Number(v) || 0)) }]));
    return {
        writes: [
            {
                update: {
                    name: `${docsRoot}/users/${uid}/sync/localStorage`,
                    fields: { data: { mapValue: { fields: strings } }, keyUpdatedAt: { mapValue: { fields: stamps } } }
                },
                updateTransforms: stamp,
                currentDocument: updateTime ? { updateTime } : { exists: false }
            },
            {
                update: { name: `${docsRoot}/users/${uid}/sync/meta`, fields: { v: { stringValue: version } } },
                updateTransforms: stamp
            }
        ]
    };
}
