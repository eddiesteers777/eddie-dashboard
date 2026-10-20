/* ==========================================
   Southbound 3D demos — the catalog (pure, no Three.js)

   exercises.json lists each 3D demo: its models (male, female), its
   steps, its automatic movement check (qa) and the person who watched
   it and signed it off (review). Only a demo that passed both is
   "ready" and shown to clients; see README.md "Quality review".
   Unit-tested in tests/demo3dCatalog.test.mjs.
========================================== */

export const SEXES = ["male", "female"];

/** Camera angles the viewer offers. yaw: 0 = facing us, 90 = their left side. */
export const VIEWS = {
    "three-quarter": { label: "3/4", yaw: 35, pitch: 6 },
    side: { label: "Side", yaw: 90, pitch: 4 },
    front: { label: "Front", yaw: 0, pitch: 6 }
};

export const SPEEDS = [1, 0.5];

export const normalizeName = name => String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The catalog entry for an exercise name or id (aliases count), or null. */
export function findDemo(catalog, name) {
    const n = normalizeName(name);
    if (!n) return null;
    for (const e of catalog?.exercises || []) {
        if (normalizeName(e.id) === n || normalizeName(e.name) === n || (e.aliases || []).some(a => normalizeName(a) === n)) return e;
    }
    return null;
}

/** Did a person watch it and sign it off? */
export const isReviewed = entry => Boolean(entry?.review?.approvedBy && entry?.review?.approvedOn);

/**
 * Ready for clients: a model for each sex, every automatic check passed for
 * each, and a person's sign-off. qaResults: { male: report, female: report }.
 */
export function readiness(entry, qaResults = {}) {
    const missing = [];
    if (!entry) return { ready: false, missing: ["entry"] };
    for (const s of SEXES) {
        if (!entry.models?.[s]) missing.push(`${s} model`);
        if (!qaResults[s]?.pass) missing.push(`${s} movement check`);
    }
    if (!isReviewed(entry)) missing.push("review");
    if (entry.status !== "ready") missing.push("status");
    return { ready: missing.length === 0, missing };
}

/** What a viewer may play: ready demos for clients, anything with a model in the lab. */
export function playable(entry, { includeReview = false } = {}) {
    if (!entry || !SEXES.some(s => entry.models?.[s])) return false;
    return entry.status === "ready" || (includeReview && entry.status === "review");
}

/** The sex to show: the viewer's choice when the demo has it, else the first it has. */
export function pickSex(entry, preferred) {
    if (entry?.models?.[preferred]) return preferred;
    return SEXES.find(s => entry?.models?.[s]) || null;
}

/** The views this demo offers, in a fixed order, and its starting view. */
export function viewsFor(entry) {
    const list = (entry?.views || Object.keys(VIEWS)).filter(v => VIEWS[v]);
    const views = list.length ? list : ["three-quarter"];
    return { views, start: views.includes(entry?.defaultView) ? entry.defaultView : views[0] };
}

/**
 * Where the camera sits to fit a standing body of `height` metres (feet at
 * y = 0) in a frame of `aspect` (width / height), seen from `view`.
 * Returns { position: [x, y, z], target: [x, y, z] }.
 */
export function cameraFor(view, { height = 1.75, span = height, centerY = height * 0.5, fovDeg = 30, aspect = 1, yawOffset = 0, margin = 1.18 } = {}) {
    const v = VIEWS[view] || VIEWS["three-quarter"];
    const half = (fovDeg * Math.PI / 180) / 2;
    // Fit the height, and on a narrow frame the width of arms reaching forward (about the height).
    const fitH = (height * margin) / 2 / Math.tan(half);
    const fitW = (span * 1.0 * margin) / 2 / (Math.tan(half) * Math.max(0.2, aspect));
    const dist = Math.max(fitH, fitW);
    const ty = centerY;
    const yaw = (v.yaw + yawOffset) * Math.PI / 180, pitch = v.pitch * Math.PI / 180;
    return {
        position: [Math.sin(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist],
        target: [0, ty, 0]
    };
}

/** Resolve a model path in the catalog against the catalog's own URL. */
export const modelUrl = (entry, sex, base) => new URL(entry.models[sex], base).href;

export const CATEGORIES = ["legs", "push", "pull", "core", "full body"];
export const STATUSES = ["draft", "review", "ready"];

/**
 * The shape every exercises.json entry must have, so adding an exercise is data
 * plus a motion file. Returns a list of plain-language problems (empty = fine).
 * muscles: the allowed muscle names (js/exerciseMuscles.js MUSCLES); left out, names are not checked.
 */
export function validateEntry(entry, { muscles = null } = {}) {
    const bad = [];
    const need = (ok, msg) => { if (!ok) bad.push(msg); };
    const text = v => typeof v === "string" && v.trim().length > 0;
    need(entry && typeof entry === "object", "entry is not an object");
    if (!entry || typeof entry !== "object") return bad;
    need(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.id || ""), "id must be lower-case words joined by dashes");
    need(text(entry.name), "name is missing");
    need(CATEGORIES.includes(entry.category), `category must be one of ${CATEGORIES.join(", ")}`);
    need(Array.isArray(entry.equipment) && entry.equipment.length > 0 && entry.equipment.every(text), "equipment must be a list (use [\"bodyweight\"] for none)");
    for (const s of SEXES) {
        need(text(entry.models?.[s]), `${s} model is missing`);
        need(text(entry.motions?.[s]), `${s} motion is missing`);
        need(text(entry.qa?.[s]), `${s} movement-check file is missing`);
    }
    need(entry.clip === entry.id, "clip must equal the id");
    need(Number.isFinite(entry.seconds) && entry.seconds > 0, "seconds must be above 0");
    need(Number.isInteger(entry.reps) && entry.reps >= 1, "reps must be a whole number, 1 or more");
    const views = entry.views;
    need(Array.isArray(views) && views.length > 0 && views.every(v => VIEWS[v]), `views must be a list of: ${Object.keys(VIEWS).join(", ")}`);
    need(Array.isArray(views) && views.includes(entry.defaultView), "defaultView must be one of the views");
    for (const k of ["start", "move", "cue"]) need(text(entry[k]), `${k} text is missing`);
    const m = entry.muscles;
    need(Array.isArray(m?.primary) && m.primary.length > 0, "muscles.primary needs at least one muscle");
    need(Array.isArray(m?.secondary), "muscles.secondary must be a list (may be empty)");
    const all = [...(m?.primary || []), ...(m?.secondary || [])];
    need(new Set(all).size === all.length, "a muscle is listed twice");
    if (muscles) for (const x of all) need(muscles.includes(x), `unknown muscle "${x}"`);
    const ph = entry.phases;
    need(Array.isArray(ph) && ph.length >= 3 && ph.every(p => text(p.label)), "phases need at least three, each with a label");
    if (Array.isArray(ph) && ph.length) {
        need(ph[0].from === 0 && ph[ph.length - 1].to === 1, "phases must run from 0 to 1");
        need(ph.every((p, i) => p.to > p.from && (i === 0 || p.from === ph[i - 1].to)), "phases must follow each other with no gap");
    }
    need(STATUSES.includes(entry.status), `status must be one of ${STATUSES.join(", ")}`);
    need(entry.review && typeof entry.review === "object" && "approvedBy" in entry.review && "approvedOn" in entry.review, "review needs approvedBy and approvedOn");
    if (entry.status === "ready") need(isReviewed(entry), "a ready demo needs a person's sign-off");
    return bad;
}
