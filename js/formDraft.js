/* ==========================================================
   formDraft.js -- keep what someone typed until it's sent.

   A weekly check-in or a workout log can take a few minutes to
   write. If the app closes, the phone locks for good or the page
   reloads before Save, the words used to be gone. A draft keeps the
   form's values on this device only (never synced, never sent) and
   hands them back the next time the same form opens.

   - One draft per form (`draftKey`), e.g. one per week's check-in.
   - Only kept while it differs from what the form would show
     anyway, so there is never a "draft" of an untouched form.
   - Forgotten after 14 days, on a successful save, and on sign-out
     (`sb-draft:` is in js/auth.js's account cleanup list).
   - Pure: storage is passed in, so it is unit-tested.
   ========================================================== */

export const DRAFT_PREFIX = "sb-draft:";
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CHARS = 20000;

export function draftKey(name, id = "") {
    return `${DRAFT_PREFIX}${name}${id ? `:${id}` : ""}`;
}

const defaultStorage = () => {
    try { return globalThis.localStorage || null; } catch { return null; }
};

// Same values, whatever order the keys were written in.
function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value ?? null);
}
export function sameValues(a, b) {
    return stable(a) === stable(b);
}

/** Keep `values` under `key`. Returns true when something was stored. */
export function saveDraft(key, values, { storage = defaultStorage(), now = Date.now() } = {}) {
    if (!storage || !values || typeof values !== "object") return false;
    try {
        const text = JSON.stringify({ v: 1, at: now, values });
        if (text.length > MAX_CHARS) return false;
        storage.setItem(key, text);
        return true;
    } catch {
        return false; // a full or blocked phone: the form still works, it just isn't kept
    }
}

/** The values kept under `key`, or null (none, too old, or unreadable). */
export function loadDraft(key, { storage = defaultStorage(), now = Date.now() } = {}) {
    if (!storage) return null;
    try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const draft = JSON.parse(raw);
        const fresh = draft && draft.v === 1 && Number.isFinite(draft.at) && now - draft.at <= DRAFT_MAX_AGE_MS;
        if (!fresh || !draft.values || typeof draft.values !== "object") {
            storage.removeItem(key);
            return null;
        }
        return draft.values;
    } catch {
        return null;
    }
}

export function clearDraft(key, { storage = defaultStorage() } = {}) {
    try { storage?.removeItem(key); } catch { /* nothing to clear */ }
}

/** Every draft on the device (sign-out does this through js/auth.js's prefix list). */
export function clearAllDrafts({ storage = defaultStorage() } = {}) {
    if (!storage) return;
    try {
        for (let i = storage.length - 1; i >= 0; i--) {
            const key = storage.key(i);
            if (key?.startsWith(DRAFT_PREFIX)) storage.removeItem(key);
        }
    } catch { /* nothing to clear */ }
}

/**
 * Save `values` unless they match what the form shows untouched
 * (`untouched`), in which case any old draft goes: there is nothing to keep.
 */
export function keepOrForget(key, values, untouched, options) {
    if (sameValues(values, untouched)) {
        clearDraft(key, options);
        return false;
    }
    return saveDraft(key, values, options);
}
