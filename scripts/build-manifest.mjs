// Writes site-manifest.json: every page, partial, script and stylesheet
// in the site. site-check.html reads it instead of a hand-typed list
// (which drifted out of date), and tests/static.test.mjs fails if it's
// stale -- run `npm run manifest` after adding, removing OR CHANGING files.
//
// It also writes the service worker's precache list into sw.js (between
// the "precache" markers): every file the app needs to open offline,
// each with a short fingerprint of its contents, plus the Firebase SDK
// files the code imports from gstatic. A new fingerprint means a new
// sw.js, which is how phones learn there's a new version; they then
// download only the files whose fingerprint changed.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const list = (dir, ext) => readdirSync(join(root, dir))
    .filter(f => (ext instanceof RegExp ? ext.test(f) : f.endsWith(ext)))
    .map(f => (dir === "." ? f : `${dir}/${f}`))
    .sort();

export function buildManifest() {
    return {
        pages: list(".", ".html"),
        partials: list("components", ".html"),
        scripts: list("js", ".js"),
        styles: list("css", ".css")
    };
}

// What the service worker keeps for offline use. Photos (images/) and
// the share image aren't here: they're cached as they're viewed.
export function precacheFiles() {
    const m = buildManifest();
    return [
        ...m.pages, ...m.partials, ...m.scripts, ...m.styles,
        "manifest.json",
        ...list("fonts", ".woff2"),
        ...list("brand", ".svg"),
        ...list("icons", /\.(png|svg)$/).filter(f => f !== "icons/og-image.png"),
        ...list("emoji", ".svg"),
        ...list("habit-icons", ".svg")
    ].sort();
}

const hash = text => createHash("sha256").update(text).digest("hex").slice(0, 12);

export function buildPrecache() {
    const files = {};
    for (const f of precacheFiles()) files[f] = hash(readFileSync(join(root, f)));
    // The Firebase SDK files the app imports (versioned URLs, safe to keep).
    const sdk = new Set();
    for (const f of buildManifest().scripts) {
        for (const m of readFileSync(join(root, f), "utf8").matchAll(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-[a-z]+\.js/g)) sdk.add(m[0]);
    }
    const cdn = [...sdk].sort();
    const version = hash(JSON.stringify([files, cdn]));
    return { version, files, cdn };
}

const START = "// ---- precache (written by `npm run manifest`; don't edit by hand) ----";
const END = "// ---- end precache ----";

export function precacheBlock(p = buildPrecache()) {
    return [
        START,
        `const VERSION = ${JSON.stringify(p.version)};`,
        `const PRECACHE = ${JSON.stringify(p.files, null, 1).replace(/\n\s*/g, " ")};`,
        `const CDN_PRECACHE = ${JSON.stringify(p.cdn)};`,
        END
    ].join("\n");
}

export function currentPrecacheBlock(swSource) {
    const a = swSource.indexOf(START), b = swSource.indexOf(END);
    return a < 0 || b < 0 ? null : swSource.slice(a, b + END.length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    writeFileSync(join(root, "site-manifest.json"), JSON.stringify(buildManifest(), null, 2) + "\n");
    const swPath = join(root, "sw.js");
    const sw = readFileSync(swPath, "utf8");
    const old = currentPrecacheBlock(sw);
    if (!old) throw new Error("sw.js is missing its precache markers");
    writeFileSync(swPath, sw.replace(old, precacheBlock()));
    console.log("site-manifest.json and sw.js precache updated");
}
