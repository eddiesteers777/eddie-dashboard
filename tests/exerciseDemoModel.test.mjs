import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    normalizeName, cacheKey, searchTermFor, matchScore, pickBestMatch, sanitizeExercise,
    isFresh, withToken, errorForStatus, toClientPayload, createDemoService,
    METADATA_TTL_MS, MISS_TTL_MS, TOKEN_MARGIN_MS
} from "../functions/exerciseDemoModel.js";

const V = (gender, angle, slug = "push-up") => ({
    gender, angle,
    url: `https://api.musclewiki.com/stream/videos/branded/${gender}-Bodyweight-${slug}-${angle}.mp4`,
    og_image: `https://api.musclewiki.com/stream/images/og_images/og-${gender}-Bodyweight-${slug}-${angle}.jpg`
});
const PUSHUP = { id: 42, name: "Push Up", primary_muscles: ["Chest"], secondary_muscles: null, category: "Bodyweight", difficulty: "Novice", steps: ["Start in a plank.", "Lower your chest.", "Push back up."], videos: [V("male", "front"), V("male", "side"), V("female", "front"), V("female", "side")] };
const INCLINE = { ...PUSHUP, id: 43, name: "Incline Push Up", videos: [V("male", "front", "incline-push-up")] };

test("names normalize the way people type them", () => {
    assert.equal(normalizeName("Push-Ups"), "push up");
    assert.equal(normalizeName("  Pull Ups "), "pull up");
    assert.equal(normalizeName("Bench Press"), "bench press");
    assert.equal(normalizeName("Farmer's Carry"), "farmer carry");
    assert.equal(cacheKey("Barbell Back Squat"), "barbell-back-squat");
    assert.equal(cacheKey(""), "unnamed");
    assert.equal(searchTermFor("Barbell Back Squat"), "barbell squat");
    assert.equal(searchTermFor("Goblet Squat"), "goblet squat");
});

test("matching prefers the exact exercise and refuses weak guesses", () => {
    assert.equal(matchScore("Push-Up", "Push Up"), 1);
    assert.ok(matchScore("Push-Up", "Incline Push Up") < 1);
    assert.equal(pickBestMatch([INCLINE, PUSHUP], "Pushups").id, 42);
    assert.equal(pickBestMatch([INCLINE], "Push-Up").id, 43, "all our words, one extra: close enough");
    assert.equal(pickBestMatch([{ id: 9, name: "Dumbbell Curl", videos: [] }], "Push-Up"), null);
    assert.equal(pickBestMatch([{ id: 9, name: "Cable Chest Fly" }], "Chest Press Machine"), null, "one shared word isn't a match");
    assert.equal(pickBestMatch(null, "Push-Up"), null);
    assert.equal(pickBestMatch([null, { id: 1 }], "Push-Up"), null);
});

test("sanitizing keeps only MuscleWiki stream URLs and known fields", () => {
    const evil = { ...PUSHUP, videos: [
        { gender: "male", angle: "front", url: "https://evil.example/stream/videos/branded/x.mp4" },
        { gender: "male", angle: "front", url: "javascript:alert(1)" },
        { gender: "robot", angle: "front", url: V("male", "front").url },
        V("female", "side"), V("female", "side"),
        { ...V("male", "front"), og_image: "https://evil.example/a.jpg" }
    ], steps: ["  Step   one ", 7, ""], extra: "<script>" };
    const s = sanitizeExercise(evil);
    assert.deepEqual(s.videos.map(v => v.gender + v.angle), ["femaleside", "malefront"]);
    assert.equal(s.videos[1].poster, null, "a foreign poster is dropped");
    assert.deepEqual(s.steps, ["Step one"]);
    assert.equal("extra" in s, false);
    assert.deepEqual(s.secondary, [], "null on lower plans becomes empty");
    assert.equal(sanitizeExercise({ ...PUSHUP, videos: [] }), null, "no playable video, no demo");
    assert.equal(sanitizeExercise({ name: "x" }), null);
    assert.equal(sanitizeExercise(null), null);
});

test("cache: text for 30 days, a miss for 7", () => {
    const t = 1_000_000_000_000;
    assert.equal(isFresh({ found: true, fetchedAt: t }, t + METADATA_TTL_MS - 1), true);
    assert.equal(isFresh({ found: true, fetchedAt: t }, t + METADATA_TTL_MS), false);
    assert.equal(isFresh({ found: false, fetchedAt: t }, t + MISS_TTL_MS + 1), false);
    assert.equal(isFresh({ found: true, fetchedAt: t + 5000 }, t), false, "a time from the future isn't trusted");
    assert.equal(isFresh(null, t), false);
});

test("tokens are added to stream URLs, replacing any old one", () => {
    const u = withToken("https://api.musclewiki.com/stream/videos/branded/a.mp4?token=old", "eyJ.abc-_");
    assert.equal(u, "https://api.musclewiki.com/stream/videos/branded/a.mp4?token=eyJ.abc-_");
    assert.equal(withToken(null, "t"), null);
});

test("provider errors map to codes the app understands", () => {
    assert.equal(errorForStatus(401).code, "failed-precondition");
    assert.equal(errorForStatus(403).code, "failed-precondition");
    assert.equal(errorForStatus(429).code, "resource-exhausted");
    assert.equal(errorForStatus(404).code, "not-found");
    assert.equal(errorForStatus(500).code, "unavailable");
});

test("the app payload never carries the key, only tokened stream URLs", () => {
    const entry = { found: true, exercise: sanitizeExercise(PUSHUP), fetchedAt: 1 };
    const p = toClientPayload(entry, "TOKEN123", 99);
    assert.equal(p.found, true);
    assert.equal(p.videos.length, 4);
    for (const v of p.videos) {
        assert.match(v.src, /^https:\/\/api\.musclewiki\.com\/stream\/videos\/branded\/.+\.mp4\?token=TOKEN123$/);
        assert.match(v.poster, /\?token=TOKEN123$/);
    }
    assert.equal(p.credit.url, "https://musclewiki.com");
    assert.equal(JSON.stringify(p).includes("mw_"), false);
    assert.deepEqual(toClientPayload({ found: false }, "t", 1), { found: false });
});

// A fake MuscleWiki for the lookup.
function fakeApi({ search = [PUSHUP], searchStatus = 200, tokenStatus = 200, throws = false } = {}) {
    const calls = [];
    const fetch = async (url, init = {}) => {
        calls.push({ url, method: init.method || "GET", key: init.headers?.["X-API-Key"] });
        if (throws) throw new Error("offline");
        const json = body => ({ ok: true, status: 200, json: async () => body });
        const fail = status => ({ ok: false, status, json: async () => ({ detail: "nope" }) });
        if (url.includes("/media/token")) return tokenStatus === 200 ? json({ token: "tok" + calls.length, expires_in: 900 }) : fail(tokenStatus);
        if (url.includes("/search")) return searchStatus === 200 ? json(search) : fail(searchStatus);
        return fail(404);
    };
    return { fetch, calls };
}
function memoryCache() {
    const m = new Map();
    return { m, get: async k => m.get(k) ?? null, set: async (k, v) => { m.set(k, structuredClone(v)); } };
}

test("lookup: searches once, caches the text, reuses the media token", async () => {
    const api = fakeApi(), cache = memoryCache();
    let t = 1_000_000;
    const tokenStore = {};
    const svc = createDemoService({ fetch: api.fetch, apiKey: "mw_secret", cache, now: () => t, tokenStore });
    const first = await svc.lookup("Push-Ups");
    assert.equal(first.found, true);
    assert.equal(first.exercise.name, "Push Up");
    assert.deepEqual(api.calls.map(c => c.method + " " + new URL(c.url).pathname), ["GET /search", "POST /media/token"]);
    assert.ok(api.calls.every(c => c.key === "mw_secret"), "the key goes only to MuscleWiki, as a header");
    assert.ok(api.calls[0].url.includes("q=push%20up"));
    assert.ok(cache.m.has("push-up"));
    assert.equal(JSON.stringify([...cache.m.values()]).includes("tok"), false, "no token in the cache");

    t += 5 * 60 * 1000;
    const second = await svc.lookup("push up");
    assert.equal(api.calls.length, 2, "cache hit and the same token: no new calls");
    assert.equal(second.videos[0].src, first.videos[0].src);

    t += 15 * 60 * 1000 - TOKEN_MARGIN_MS;
    await svc.lookup("push up");
    assert.equal(api.calls.filter(c => c.url.includes("/media/token")).length, 2, "an almost-expired token is replaced");

    t += METADATA_TTL_MS;
    await svc.lookup("push up");
    assert.equal(api.calls.filter(c => c.url.includes("/search")).length, 2, "stale text is fetched again");
});

test("lookup: no match is cached and costs no token", async () => {
    const api = fakeApi({ search: [] }), cache = memoryCache();
    const svc = createDemoService({ fetch: api.fetch, apiKey: "k", cache, now: () => 5 });
    assert.deepEqual(await svc.lookup("Underwater basket weaving"), { found: false });
    assert.deepEqual(await svc.lookup("Underwater basket weaving"), { found: false });
    assert.equal(api.calls.length, 1);
    assert.deepEqual(await svc.lookup("   "), { found: false });
});

test("lookup errors: missing key, rejected key, quota, network", async () => {
    const cache = memoryCache();
    await assert.rejects(createDemoService({ fetch: fakeApi().fetch, apiKey: "", cache }).lookup("Push-Up"), { code: "failed-precondition" });
    await assert.rejects(createDemoService({ fetch: fakeApi({ searchStatus: 403 }).fetch, apiKey: "k", cache }).lookup("Push-Up"), { code: "failed-precondition" });
    await assert.rejects(createDemoService({ fetch: fakeApi({ searchStatus: 429 }).fetch, apiKey: "k", cache }).lookup("Push-Up"), { code: "resource-exhausted" });
    await assert.rejects(createDemoService({ fetch: fakeApi({ throws: true }).fetch, apiKey: "k", cache }).lookup("Push-Up"), { code: "unavailable" });
    await assert.rejects(createDemoService({ fetch: fakeApi({ tokenStatus: 501 }).fetch, apiKey: "k", cache: memoryCache() }).lookup("Push-Up"), { code: "failed-precondition" });
});

test("a broken cache never blocks a demo", async () => {
    const cache = { get: async () => { throw new Error("down"); }, set: async () => { throw new Error("down"); } };
    const r = await createDemoService({ fetch: fakeApi().fetch, apiKey: "k", cache }).lookup("Push-Up");
    assert.equal(r.found, true);
});

test("the function keeps the key in Secret Manager and checks the account", () => {
    const src = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
    assert.match(src, /defineSecret\('MUSCLEWIKI_API_KEY'\)/);
    assert.match(src, /export const getExerciseDemo = onCall/);
    assert.match(src, /isCoachApproved !== true && profile\.status !== 'active'/);
    assert.match(src, /collection\('exerciseDemoCache'\)/);
    // No MuscleWiki key or token ever lands in the browser code.
    for (const f of ["exerciseDemoRemote.js", "exerciseDemoSheet.js", "exerciseDemoConfig.js"]) {
        const js = readFileSync(new URL(`../js/${f}`, import.meta.url), "utf8");
        assert.equal(/mw_[A-Za-z0-9]{6,}|X-API-Key|media\/token/.test(js), false, f);
    }
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    assert.equal(rules.includes("exerciseDemoCache"), false, "server-only: no client rule, so clients are denied");
});

test("privacy page carries MuscleWiki's required disclosure verbatim", () => {
    const html = readFileSync(new URL("../privacy.html", import.meta.url), "utf8");
    assert.ok(html.includes("Exercise data and videos provided by MuscleWiki.com"));
});

test("the service worker never caches MuscleWiki media", () => {
    const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
    assert.equal(sw.includes("musclewiki"), false);
    assert.match(sw, /Everything else \(Firestore, sign-in, COROS\.\.\.\) goes straight to the network/);
});
