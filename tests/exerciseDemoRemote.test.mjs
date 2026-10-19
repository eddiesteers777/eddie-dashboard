import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    parseDemoResponse, videoChoices, pickVideo, preferredGender, setPreferredGender,
    errorCode, fetchRemoteDemo, clearRemoteDemos, GENDER_KEY
} from "../js/exerciseDemoRemote.js";
import { hasHowTo } from "../js/exerciseMuscles.js";
import { REMOTE_DEMOS_ENABLED } from "../js/exerciseDemoConfig.js";

const src = (g, a) => `https://api.musclewiki.com/stream/videos/branded/${g}-Bodyweight-push-up-${a}.mp4?token=eyJ.abc_-`;
const poster = (g, a) => `https://api.musclewiki.com/stream/images/og_images/og-${g}-Bodyweight-push-up-${a}.jpg?token=eyJ.abc_-`;
const vid = (gender, angle) => ({ gender, angle, src: src(gender, angle), poster: poster(gender, angle) });
const NOW = 1_000_000;
const OK = { found: true, exercise: { name: "Push Up", steps: ["Start in a plank.", "Lower.", ""] }, videos: [vid("male", "front"), vid("male", "side"), vid("female", "front")], expiresAt: NOW + 900_000 };

test("the server's answer is checked before anything plays", () => {
    const d = parseDemoResponse(OK, NOW);
    assert.equal(d.name, "Push Up");
    assert.deepEqual(d.steps, ["Start in a plank.", "Lower."]);
    assert.equal(d.videos.length, 3);
    assert.equal(d.expiresAt, NOW + 900_000);
    assert.equal(d.credit.url, "https://musclewiki.com");
    // Anything not a tokened MuscleWiki stream URL is dropped.
    const bad = parseDemoResponse({ ...OK, videos: [
        { gender: "male", angle: "front", src: "https://evil.example/x.mp4?token=a" },
        { gender: "male", angle: "front", src: src("male", "front").replace("?token=eyJ.abc_-", "") },
        { gender: "male", angle: "top", src: src("male", "front") },
        { ...vid("female", "side"), poster: "javascript:alert(1)" }
    ] }, NOW);
    assert.equal(bad.videos.length, 1);
    assert.equal(bad.videos[0].poster, null);
    assert.equal(parseDemoResponse({ ...OK, videos: [] }, NOW), null, "no playable video");
    assert.equal(parseDemoResponse({ found: false }, NOW), null);
    assert.equal(parseDemoResponse(null, NOW), null);
    assert.equal(parseDemoResponse({ ...OK, expiresAt: NOW - 5 }, NOW).expiresAt > NOW, true, "a stale expiry isn't trusted");
});

test("male / female and front / side choices with fallbacks", () => {
    const vids = parseDemoResponse(OK, NOW).videos;
    assert.deepEqual(videoChoices(vids), { genders: ["male", "female"], angles: ["front", "side"] });
    assert.equal(pickVideo(vids, { gender: "female", angle: "front" }).gender, "female");
    const f = pickVideo(vids, { gender: "female", angle: "side" });
    assert.deepEqual([f.gender, f.angle], ["female", "front"], "no female side: female front");
    const m = pickVideo([vid("male", "side")], { gender: "female", angle: "front" });
    assert.deepEqual([m.gender, m.angle], ["male", "side"], "only what exists");
    assert.equal(pickVideo([], {}), null);
    assert.deepEqual(videoChoices([vid("female", "front")]), { genders: ["female"], angles: ["front"] });
});

test("the demonstrator choice is remembered on the device", () => {
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    assert.equal(preferredGender(storage), "male");
    setPreferredGender("female", storage);
    assert.equal(store.get(GENDER_KEY), "female");
    assert.equal(preferredGender(storage), "female");
    setPreferredGender("robot", storage);
    assert.equal(preferredGender(storage), "female");
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    assert.equal(preferredGender(broken), "male");
    setPreferredGender("female", broken); // no throw
    const auth = readFileSync(new URL("../js/auth.js", import.meta.url), "utf8");
    assert.ok(auth.includes(`"${GENDER_KEY}"`), "cleared at sign-out");
});

test("callable errors become a short code", () => {
    assert.equal(errorCode({ code: "functions/resource-exhausted" }), "resource-exhausted");
    assert.equal(errorCode({ code: "functions/failed-precondition" }), "failed-precondition");
    assert.equal(errorCode({ code: "functions/internal" }), "unavailable");
    assert.equal(errorCode(new Error("x")), "unavailable");
});

test("one lookup per exercise while its token lasts; errors retry", async () => {
    clearRemoteDemos();
    let t = NOW, calls = 0, mode = "ok";
    const call = async () => {
        calls++;
        if (mode === "error") throw { code: "functions/unavailable" };
        if (mode === "none") return { found: false };
        return { ...OK, expiresAt: t + 900_000 };
    };
    const opts = () => ({ call, now: () => t });
    assert.equal((await fetchRemoteDemo("Push-Up", opts())).status, "ok");
    assert.equal((await fetchRemoteDemo("push-up", opts())).status, "ok");
    assert.equal(calls, 1, "same exercise, cached in memory");
    t += 15 * 60 * 1000;
    await fetchRemoteDemo("Push-Up", opts());
    assert.equal(calls, 2, "expired token: asks again");
    await fetchRemoteDemo("Push-Up", { ...opts(), refresh: true });
    assert.equal(calls, 3, "a failed video forces a refresh");

    mode = "error";
    assert.deepEqual(await fetchRemoteDemo("Lat Pulldown", opts()), { status: "error", code: "unavailable" });
    mode = "none";
    assert.deepEqual(await fetchRemoteDemo("Lat Pulldown", opts()), { status: "none" }, "an error isn't remembered");
    const before = calls;
    await fetchRemoteDemo("Lat Pulldown", opts());
    assert.equal(calls, before, "a miss is remembered for the visit");
    assert.deepEqual(await fetchRemoteDemo("  ", opts()), { status: "none" });
    clearRemoteDemos();
});

test("How to shows for every exercise only when remote videos are on", () => {
    assert.equal(REMOTE_DEMOS_ENABLED, false, "off until the function and key exist");
    assert.equal(hasHowTo("Lat Pulldown"), false);
    assert.equal(hasHowTo("Lat Pulldown", { remote: true }), true);
    assert.equal(hasHowTo("", { remote: true }), false);
    assert.equal(hasHowTo("Push-Up", { remote: false }), true);
});

test("the sheet plays MuscleWiki video as delivered: no overlay, no download", () => {
    const sheet = readFileSync(new URL("../js/exerciseDemoSheet.js", import.meta.url), "utf8");
    assert.match(sheet, /controlslist="nodownload/);
    assert.match(sheet, /disablepictureinpicture/);
    assert.match(sheet, /contextmenu/);
    const css = readFileSync(new URL("../css/demo.css", import.meta.url), "utf8");
    assert.match(css, /\.dm-remote-video\{[^}]*object-fit:contain/);
    const tokenStored = /localStorage\.setItem\([^)]*(src|token|demo)/i.test(readFileSync(new URL("../js/exerciseDemoRemote.js", import.meta.url), "utf8"));
    assert.equal(tokenStored, false, "tokens stay in memory");
});
