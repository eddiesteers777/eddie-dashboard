/* ==========================================
   Southbound — unfinished fueling plans (pure)

   A draft is everything typed and picked on the Fueling page, kept as
   the athlete works, so they can leave and come back (on this phone or
   another one) exactly where they were. One cloud-synced key per draft,
   "fueling-draft-<id>", so drafts on two phones never overwrite each
   other; a deleted (or saved) draft leaves a dated marker because cloud
   sync can't carry a removed key.

     draft     { v, id, name, named, createdAt, updatedAt, rev, device,
                 planId (the saved plan it edits, or null), state,
                 conflictOf? }
     marker    { v, id, deleted: true, reason: "deleted" | "saved",
                 updatedAt, planId? }
     state     { v, fields: { <input id>: string | boolean }, units,
                 order, items, mode, segments, segmentsText, marathonRef,
                 typedTargets, calculated, sourceQuery }
               What the person typed, exactly (half-typed paces too),
               with weights in lb and fluids in oz so a unit switch
               doesn't make it look changed. Derived numbers (targets,
               totals, the schedule) are worked out again on resume.

   Unit-tested in tests/fuelDrafts.test.mjs.
========================================== */

export const DRAFT_PREFIX = "fueling-draft-";
export const DRAFT_VERSION = 1;
export const draftKey = id => `${DRAFT_PREFIX}${id}`;

export function newDraftId(now = Date.now(), rand = Math.random) {
    return `d${now.toString(36)}${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0")}`;
}

// Key order never matters when comparing.
export function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value ?? null);
}
export const sameState = (a, b) => stable(a) === stable(b);

const blank = v => v == null || (typeof v === "string" && v.trim() === "");

/** Worth keeping: a workout, products, a drink or a name. A page opened and left untouched isn't a draft. */
export function isMeaningful(state) {
    if (!state) return false;
    const f = state.fields || {};
    if (["duration", "distance", "pace", "planName"].some(k => !blank(f[k]))) return true;
    if ((state.items || []).length) return true;
    if (state.marathonRef || state.planId) return true;
    if (Number(f.diyCarbTarget) > 0 || Number(f.diySodiumTarget) > 0) return true;
    return Boolean(state.calculated);
}

const TYPE_WORDS = { easy: "Easy run", recovery: "Recovery run", long: "Long run", workout: "Workout", marathon: "Marathon-pace run", race: "Race", other: "Run" };

export function workoutWords(state) {
    const f = state?.fields || {};
    const type = state?.mode === "race" && f.workoutType !== "race" ? "Race" : (TYPE_WORDS[f.workoutType] || "Run");
    const miles = Number(f.distance);
    const min = Number(f.duration);
    const bits = [type];
    if (miles > 0) bits.push(`${Math.round(miles * 10) / 10} mi`);
    if (min > 0) bits.push(min >= 60 ? `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}` : `${Math.round(min)} min`);
    return { type, miles: miles > 0 ? miles : null, minutes: min > 0 ? min : null, text: bits.join(" · ") };
}

/** "Long run · 18 mi" until the person names it. */
export function autoName(state) {
    const w = workoutWords(state);
    return w.miles || w.minutes ? w.text : "Untitled plan";
}

export function draftTitle(draft) {
    const name = String(draft?.name || "").trim();
    return draft?.named && name ? name : (name || autoName(draft?.state));
}

export function createDraft({ id, state, device = "", now = Date.now(), name = "", planId = null } = {}) {
    const typed = String(state?.fields?.planName || name || "").trim();
    return {
        v: DRAFT_VERSION,
        id,
        name: typed || autoName(state),
        named: Boolean(typed),
        createdAt: now,
        updatedAt: now,
        rev: 1,
        device,
        planId: planId ?? state?.planId ?? null,
        state
    };
}

/** The same draft with the page's newest state (unchanged = the same object back). */
export function updateDraft(draft, state, { device = "", now = Date.now() } = {}) {
    if (sameState(draft.state, state)) return draft;
    const typed = String(state?.fields?.planName || "").trim();
    return {
        ...draft,
        name: typed || autoName(state),
        named: Boolean(typed),
        state,
        planId: state?.planId ?? draft.planId ?? null,
        updatedAt: Math.max(now, (draft.updatedAt || 0) + 1),
        rev: (draft.rev || 0) + 1,
        device
    };
}

export function renameDraft(draft, name, now = Date.now()) {
    const clean = String(name || "").trim().slice(0, 80);
    const fields = { ...(draft.state?.fields || {}), planName: clean };
    return { ...draft, name: clean || autoName(draft.state), named: Boolean(clean), state: { ...draft.state, fields }, updatedAt: Math.max(now, (draft.updatedAt || 0) + 1), rev: (draft.rev || 0) + 1 };
}

/** "Long run" -> "Long run copy", then "Long run copy 2"... */
export function uniqueName(base, taken = []) {
    const names = new Set(taken.map(n => String(n).toLowerCase()));
    const root = String(base || "Untitled plan").trim();
    if (!names.has(root.toLowerCase())) return root;
    for (let i = 2; i < 500; i++) {
        const next = `${root} ${i}`;
        if (!names.has(next.toLowerCase())) return next;
    }
    return `${root} ${Date.now()}`;
}

export function duplicateDraft(draft, { id, now = Date.now(), device = "", taken = [] } = {}) {
    const name = uniqueName(`${draftTitle(draft)} copy`, taken);
    const fields = { ...(draft.state?.fields || {}), planName: name };
    return {
        v: DRAFT_VERSION, id, name, named: true, createdAt: now, updatedAt: now, rev: 1, device,
        // A copy is a new plan, not an edit of the saved one.
        planId: null,
        state: { ...draft.state, fields, planId: null, marathonRef: null }
    };
}

export function deletedMarker(draft, { now = Date.now(), reason = "deleted", planId = null } = {}) {
    return { v: DRAFT_VERSION, id: draft.id, deleted: true, reason, planId: planId ?? draft.planId ?? null, updatedAt: Math.max(now, (draft.updatedAt || 0) + 1) };
}

export function parseDraft(raw) {
    let d = raw;
    if (typeof raw === "string") { try { d = JSON.parse(raw); } catch { return null; } }
    if (!d || typeof d !== "object" || !d.id) return null;
    if (d.deleted) return d;
    if (!d.state || typeof d.state !== "object") return null;
    return d;
}

/** Live drafts from { key: stored string }, newest first. */
export function listDrafts(entries) {
    return Object.entries(entries || {})
        .filter(([k]) => String(k).startsWith(DRAFT_PREFIX))
        .map(([, v]) => parseDraft(v))
        .filter(d => d && !d.deleted)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** What a list row says about a draft. */
export function draftSummary(draft) {
    const w = workoutWords(draft.state);
    const status = draft.conflictOf ? "conflict"
        : draft.planId ? "editing"
            : draft.state?.calculated ? "ready" : "unfinished";
    return {
        id: draft.id,
        title: draftTitle(draft),
        workout: w.type,
        miles: w.miles,
        minutes: w.minutes,
        detail: w.text,
        updatedAt: draft.updatedAt || 0,
        status,
        products: (draft.state?.items || []).reduce((n, i) => n + (Number(i.qty) || 0), 0)
    };
}

export const STATUS_LABELS = {
    unfinished: "Unfinished",
    ready: "Targets worked out, not saved",
    editing: "Changes to a saved plan, not saved",
    conflict: "Copy from another device"
};

/** "just now", "5 min ago", "3 h ago", "Oct 9" */
export function agoText(ms, now = Date.now()) {
    if (!ms) return "";
    const diff = Math.max(0, now - ms);
    if (diff < 45 * 1000) return "just now";
    if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / 60000))} min ago`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.round(diff / 3600000)} h ago`;
    return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Cloud sync found this draft changed on this device AND elsewhere since
 * they last agreed. Nothing is dropped: an edit beats a delete, and when
 * both sides edited, this device keeps the draft and the other device's
 * version becomes its own draft ("… (from another device)").
 * -> { value, extra: [[key, value]] }
 */
export function mergeDraftValues(localStr, cloudStr, { newId } = {}) {
    const local = parseDraft(localStr);
    const cloud = parseDraft(cloudStr);
    if (!cloud) return { value: localStr, extra: [] };
    if (!local) return { value: cloudStr, extra: [] };
    if (local.deleted && cloud.deleted) return { value: localStr, extra: [] };
    if (local.deleted) return { value: cloudStr, extra: [] };   // edited elsewhere: keep the edit
    if (cloud.deleted) return { value: localStr, extra: [] };   // edited here: keep the edit
    if (sameState(local.state, cloud.state)) return { value: (local.updatedAt || 0) >= (cloud.updatedAt || 0) ? localStr : cloudStr, extra: [] };
    const id = newId || `${cloud.id}x${(cloud.rev || 0)}`;
    const copy = {
        ...cloud,
        id,
        name: `${draftTitle(cloud)} (from another device)`,
        named: true,
        conflictOf: cloud.id,
        state: { ...cloud.state, fields: { ...(cloud.state.fields || {}), planName: `${draftTitle(cloud)} (from another device)` } }
    };
    return { value: localStr, extra: [[draftKey(id), JSON.stringify(copy)]] };
}
