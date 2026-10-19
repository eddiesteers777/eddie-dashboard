/* ==========================================
   Southbound — licensed exercise videos (MuscleWiki), app side

   Asks the getExerciseDemo Cloud Function for an exercise. The function
   holds the API key; we only ever see stream URLs with a short-lived
   media token, kept in memory (never stored, logged or shared).

   fetchRemoteDemo(name, { refresh })  { status: "ok", demo } |
                                       { status: "none" } | { status: "error", code }
   pickVideo(videos, { gender, angle })  the best video for a choice
   videoChoices(videos)                  { genders: [...], angles: [...] }
   preferredGender() / setPreferredGender(g)   kept on this device
   Pure parts are unit-tested in tests/exerciseDemoRemote.test.mjs.
========================================== */

const ALLOWED_SRC = /^https:\/\/api\.musclewiki\.com\/stream\/(videos\/branded|images\/og_images)\/[A-Za-z0-9._-]+\.(mp4|jpe?g|png|webp)\?token=[A-Za-z0-9._~%-]+$/;
export const GENDER_KEY = "sb-demo-gender";
const EXPIRY_MARGIN_MS = 60 * 1000;
const GENDERS = ["male", "female"], ANGLES = ["front", "side"];

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Checks the function's answer; anything unexpected is treated as "no demo". */
export function parseDemoResponse(data, now = Date.now()) {
    if (!data || data.found !== true) return null;
    const videos = (Array.isArray(data.videos) ? data.videos : [])
        .filter(v => v && GENDERS.includes(v.gender) && ANGLES.includes(v.angle) && ALLOWED_SRC.test(v.src || ""))
        .map(v => ({ gender: v.gender, angle: v.angle, src: v.src, poster: ALLOWED_SRC.test(v.poster || "") ? v.poster : null }));
    if (!videos.length) return null;
    const ex = data.exercise || {};
    const expiresAt = Number(data.expiresAt);
    return {
        name: clean(ex.name, 120),
        steps: (Array.isArray(ex.steps) ? ex.steps : []).map(s => clean(s, 400)).filter(Boolean).slice(0, 12),
        videos,
        expiresAt: Number.isFinite(expiresAt) && expiresAt > now ? expiresAt : now + 10 * 60 * 1000,
        credit: { text: "Video: MuscleWiki", url: "https://musclewiki.com" }
    };
}

/** Which genders and angles exist, in a fixed order. */
export function videoChoices(videos) {
    return {
        genders: GENDERS.filter(g => videos.some(v => v.gender === g)),
        angles: ANGLES.filter(a => videos.some(v => v.angle === a))
    };
}

/** The asked-for video, else the same gender, else the same angle, else the first. */
export function pickVideo(videos, { gender, angle } = {}) {
    if (!videos?.length) return null;
    return videos.find(v => v.gender === gender && v.angle === angle)
        || videos.find(v => v.gender === gender && v.angle === "front")
        || videos.find(v => v.gender === gender)
        || videos.find(v => v.angle === angle)
        || videos[0];
}

export function preferredGender(storage = globalThis.localStorage) {
    try { const g = storage?.getItem(GENDER_KEY); return GENDERS.includes(g) ? g : "male"; } catch { return "male"; }
}
export function setPreferredGender(gender, storage = globalThis.localStorage) {
    if (!GENDERS.includes(gender)) return;
    try { storage?.setItem(GENDER_KEY, gender); } catch { /* private mode */ }
}

/** Callable error -> a short code the sheet understands. */
export function errorCode(error) {
    const code = String(error?.code || "").replace(/^functions\//, "");
    return ["unauthenticated", "permission-denied", "failed-precondition", "resource-exhausted", "not-found", "invalid-argument"].includes(code) ? code : "unavailable";
}

// In memory only: the tokens inside must never reach storage.
const memo = new Map();

/** Clears the in-memory cache (tests, sign-out). */
export function clearRemoteDemos() { memo.clear(); }

let callable = null;
async function defaultCall(name) {
    if (!callable) {
        const [{ getFunctions, httpsCallable }, { app }] = await Promise.all([
            import("https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js"),
            import("./firebase.js")
        ]);
        callable = httpsCallable(getFunctions(app, "us-central1"), "getExerciseDemo", { timeout: 20000 });
    }
    const result = await callable({ name });
    return result?.data;
}

/** One lookup per exercise while its token lasts; misses are remembered for the visit. */
export async function fetchRemoteDemo(name, { refresh = false, call = defaultCall, now = Date.now } = {}) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return { status: "none" };
    const hit = memo.get(key);
    if (!refresh && hit && (hit.status !== "ok" || hit.demo.expiresAt - EXPIRY_MARGIN_MS > now())) return hit;
    let result;
    try {
        const demo = parseDemoResponse(await call(name), now());
        result = demo ? { status: "ok", demo } : { status: "none" };
    } catch (error) {
        result = { status: "error", code: errorCode(error) };
    }
    // Errors aren't remembered (a retry may work); answers are.
    if (result.status !== "error") memo.set(key, result);
    return result;
}
