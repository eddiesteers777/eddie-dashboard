/* ==========================================
   Southbound — MuscleWiki exercise demos, server side (pure)

   The getExerciseDemo Cloud Function (functions/index.js) uses this to
   look up an exercise on the MuscleWiki API with the server's key, keep
   only safe fields, cache the text for up to 30 days, and hand the app
   stream URLs carrying a short-lived media token (never the key).
   Rules we follow: .claude/skills/exercise-demo-integration/SKILL.md.

   createDemoService({ fetch, apiKey, cache, now })  -> { lookup(name) }
   Everything here is unit-tested in tests/exerciseDemoModel.test.mjs.
========================================== */

export const API_BASE = "https://api.musclewiki.com";
export const METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000; // provider limit for text
export const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;      // "no match" is remembered a week
export const TOKEN_MARGIN_MS = 60 * 1000;                 // refresh a token a minute early
export const CREDIT = { text: "Video: MuscleWiki", url: "https://musclewiki.com" };

const KEEP_S = new Set(["abs", "plus", "obliques", "biceps", "triceps", "quads", "lats", "traps", "delts", "glutes", "hamstrings"]);

/** "Push-Ups (Wide)" -> "push up wide" */
export function normalizeName(name) {
    return String(name ?? "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\b(\w+?)s\b/g, (word, stem) => (stem.length >= 2 && !/(ss|us|is)$/.test(word) && !KEEP_S.has(word) ? stem : word))
        .trim()
        .replace(/\s+/g, " ");
}

/** Firestore doc id for a name. */
export const cacheKey = name => normalizeName(name).replace(/ /g, "-").slice(0, 120) || "unnamed";

// Our names that MuscleWiki calls something else.
export const NAME_HINTS = {
    "pull up": "pull ups",
    "back squat": "barbell squat",
    "barbell back squat": "barbell squat",
    "rdl": "romanian deadlift",
    "db rdl": "dumbbell romanian deadlift",
    "dumbbell rdl": "dumbbell romanian deadlift"
};

/** What to search MuscleWiki for. */
export function searchTermFor(name) {
    const n = normalizeName(name);
    return NAME_HINTS[n] || n;
}

const words = s => new Set(normalizeName(s).split(" ").filter(Boolean));

/** How well a MuscleWiki name matches ours, 0..1. */
export function matchScore(ours, theirs) {
    const a = normalizeName(searchTermFor(ours)), b = normalizeName(theirs);
    if (!a || !b) return 0;
    const compact = x => x.replace(/ /g, "");
    if (a === b || normalizeName(ours) === b || compact(a) === compact(b)) return 1; // "pushup" = "push up"
    const A = words(a), B = words(b);
    let shared = 0;
    for (const w of A) if (B.has(w)) shared++;
    if (!shared) return 0;
    // Every word of ours present, few extras: strong. Otherwise overlap (Jaccard).
    const jaccard = shared / (A.size + B.size - shared);
    return shared === A.size ? Math.max(jaccard, 0.6 + 0.3 * jaccard) : jaccard;
}

export const MIN_MATCH = 0.6;

/** The best search result for a name, or null when nothing is close enough. */
export function pickBestMatch(results, name) {
    let best = null, bestScore = 0;
    for (const r of Array.isArray(results) ? results : []) {
        if (!r || typeof r.name !== "string") continue;
        const s = matchScore(name, r.name);
        // Ties: prefer the one with more videos (male and female).
        if (s > bestScore || (s === bestScore && best && (r.videos?.length || 0) > (best.videos?.length || 0))) { best = r; bestScore = s; }
    }
    return bestScore >= MIN_MATCH ? best : null;
}

const STREAM_VIDEO = /^https:\/\/api\.musclewiki\.com\/stream\/videos\/branded\/[A-Za-z0-9._-]+\.mp4$/;
const STREAM_IMAGE = /^https:\/\/api\.musclewiki\.com\/stream\/images\/og_images\/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/;
const text = (v, max = 400) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v, max = 12, len = 60) => (Array.isArray(v) ? v.map(x => text(x, len)).filter(Boolean).slice(0, max) : []);

/** Only the fields and URLs we trust. Returns null when there's no playable video. */
export function sanitizeExercise(raw) {
    if (!raw || typeof raw !== "object" || !Number.isInteger(raw.id)) return null;
    const videos = [];
    const seen = new Set();
    for (const v of Array.isArray(raw.videos) ? raw.videos : []) {
        if (!v || !STREAM_VIDEO.test(v.url || "")) continue;
        const gender = v.gender === "female" ? "female" : v.gender === "male" ? "male" : null;
        const angle = v.angle === "side" ? "side" : v.angle === "front" ? "front" : null;
        if (!gender || !angle || seen.has(gender + angle)) continue;
        seen.add(gender + angle);
        videos.push({ gender, angle, url: v.url, poster: STREAM_IMAGE.test(v.og_image || "") ? v.og_image : null });
    }
    if (!videos.length) return null;
    return {
        id: raw.id,
        name: text(raw.name, 120),
        steps: list(raw.steps, 12, 400),
        primary: list(raw.primary_muscles),
        secondary: Array.isArray(raw.secondary_muscles) ? list(raw.secondary_muscles) : [],
        category: text(raw.category, 60),
        difficulty: text(raw.difficulty, 30),
        videos
    };
}

/** Is a cache entry still usable? */
export function isFresh(entry, now) {
    if (!entry || typeof entry.fetchedAt !== "number") return false;
    const ttl = entry.found ? METADATA_TTL_MS : MISS_TTL_MS;
    return now - entry.fetchedAt < ttl && now >= entry.fetchedAt;
}

/** A stream URL with the media token added. */
export function withToken(url, token) {
    if (!url) return null;
    const u = new URL(url);
    u.searchParams.delete("token");
    u.searchParams.set("token", token);
    return u.toString();
}

/** What a provider HTTP status means for the app. */
export function errorForStatus(status) {
    if (status === 401 || status === 403 || status === 402 || status === 501) return { code: "failed-precondition", message: "Exercise videos aren't set up yet." };
    if (status === 429) return { code: "resource-exhausted", message: "Exercise videos are resting until next month." };
    if (status === 404) return { code: "not-found", message: "No video for that exercise." };
    return { code: "unavailable", message: "Exercise videos aren't available right now." };
}

export class DemoError extends Error {
    constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}

/** The response the app gets. */
export function toClientPayload(entry, token, expiresAt) {
    if (!entry?.found || !entry.exercise) return { found: false };
    const ex = entry.exercise;
    return {
        found: true,
        exercise: { id: ex.id, name: ex.name, steps: ex.steps, primary: ex.primary, secondary: ex.secondary, category: ex.category, difficulty: ex.difficulty },
        videos: ex.videos.map(v => ({ gender: v.gender, angle: v.angle, src: withToken(v.url, token), poster: v.poster ? withToken(v.poster, token) : null })),
        expiresAt,
        credit: CREDIT
    };
}

/**
 * The lookup, with everything it touches passed in so it can be tested.
 * cache: { get(key) -> entry|null, set(key, entry) }; fetch: WHATWG fetch.
 * tokenStore: a { token, expiresAt } holder shared across calls (one per instance).
 */
export function createDemoService({ fetch, apiKey, cache, now = () => Date.now(), tokenStore = {} }) {
    const call = async (path, init = {}) => {
        if (!apiKey) throw new DemoError("failed-precondition", "Exercise videos aren't set up yet.");
        let res;
        try {
            res = await fetch(API_BASE + path, { ...init, headers: { "X-API-Key": apiKey, Accept: "application/json", ...(init.headers || {}) } });
        } catch {
            throw new DemoError("unavailable", "Exercise videos aren't available right now.");
        }
        if (!res.ok) { const e = errorForStatus(res.status); throw new DemoError(e.code, e.message, res.status); }
        try { return await res.json(); } catch { throw new DemoError("unavailable", "Exercise videos aren't available right now."); }
    };

    async function mediaToken() {
        const t = now();
        if (tokenStore.token && tokenStore.expiresAt - TOKEN_MARGIN_MS > t) return tokenStore;
        const body = await call("/media/token", { method: "POST" });
        if (!body || typeof body.token !== "string" || !body.token) throw new DemoError("unavailable", "Exercise videos aren't available right now.");
        const life = Number.isFinite(body.expires_in) && body.expires_in > 0 ? body.expires_in : 900;
        tokenStore.token = body.token;
        tokenStore.expiresAt = t + life * 1000;
        return tokenStore;
    }

    async function lookup(name) {
        const key = cacheKey(name);
        if (!normalizeName(name)) return { found: false };
        let entry = null;
        try { entry = await cache.get(key); } catch { entry = null; }
        if (!isFresh(entry, now())) {
            const results = await call(`/search?q=${encodeURIComponent(searchTermFor(name))}&limit=8`);
            const match = pickBestMatch(Array.isArray(results) ? results : results?.results, name);
            const exercise = match ? sanitizeExercise(match) : null;
            entry = { found: Boolean(exercise), exercise, query: normalizeName(name), fetchedAt: now() };
            try { await cache.set(key, entry); } catch { /* a cache write failing never blocks the demo */ }
        }
        if (!entry.found) return { found: false };
        const { token, expiresAt } = await mediaToken();
        return toClientPayload(entry, token, expiresAt);
    }

    return { lookup, mediaToken };
}
