// Fast checks that need no browser or emulator: every script parses,
// every local link/asset/import points at a real file, and the site
// manifest that site-check.html reads is current. Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "../scripts/build-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = buildManifest();
const read = path => readFileSync(join(root, path), "utf8");

// Photo slots on the public pages fall back to a styled placeholder
// until the real photos are uploaded (see images/README.md).
const OPTIONAL_PREFIXES = ["images/"];

function isLocal(ref) {
    return ref && ref !== "..." && !/^(https?:|\/\/|#|mailto:|tel:|data:|javascript:|blob:)/i.test(ref)
        && !ref.includes("${") && !ref.includes("{{");
}

function resolveRef(fromFile, ref, baseIsRoot = false) {
    const clean = ref.split(/[?#]/)[0];
    if (!clean) return null;
    const base = baseIsRoot ? "" : dirname(fromFile);
    return normalize(join(base, clean)).replace(/\\/g, "/");
}

test("site-manifest.json is up to date (run `npm run manifest` if this fails)", () => {
    assert.deepEqual(JSON.parse(read("site-manifest.json")), manifest);
});

test("every script parses", () => {
    for (const file of manifest.scripts) {
        try {
            execFileSync(process.execPath, ["--check", join(root, file)], { stdio: "pipe" });
        } catch (error) {
            assert.fail(`${file} has a syntax error:\n${error.stderr}`);
        }
    }
});

test("every local link, script, stylesheet and image in the HTML exists", () => {
    const missing = [];
    const htmlFiles = [...manifest.pages, ...manifest.partials];
    for (const file of htmlFiles) {
        const html = read(file);
        // Partials are injected into root-level pages, so their links resolve from the root.
        const fromRoot = file.startsWith("components/");
        for (const [, ref] of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
            if (!isLocal(ref)) continue;
            const target = resolveRef(file, ref, fromRoot);
            if (!target || OPTIONAL_PREFIXES.some(p => target.startsWith(p))) continue;
            if (!existsSync(join(root, target))) missing.push(`${file} -> ${ref}`);
        }
    }
    assert.deepEqual(missing, [], `Broken local references:\n${missing.join("\n")}`);
});

test("every relative JS import points at a real module", () => {
    const missing = [];
    for (const file of manifest.scripts) {
        const src = read(file);
        const refs = [
            ...src.matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g),
            ...src.matchAll(/\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)
        ];
        for (const [, ref] of refs) {
            const target = resolveRef(file, ref);
            if (!existsSync(join(root, target))) missing.push(`${file} -> ${ref}`);
        }
    }
    assert.deepEqual(missing, [], `Broken imports:\n${missing.join("\n")}`);
});

test("firestore.rules has no leftover wide-open rules", () => {
    const rules = read("firestore.rules");
    assert.ok(!/allow\s+(read|write|read,\s*write)\s*:\s*if\s+true/.test(rules), "a rule allows everyone");
    assert.ok(!/allow read:\s*if request\.auth != null;/.test(rules), "a rule lets any signed-in user read everything in a collection");
});

const PUBLIC_PAGES = ["home.html", "about.html", "packages.html", "coaching.html", "soccer.html", "apply.html", "contact.html", "install.html"];

test("public pages have a search description and share preview", () => {
    for (const page of PUBLIC_PAGES) {
        const html = read(page);
        assert.match(html, /<meta name="description" content="[^"]{50,160}">/, `${page} needs a 50-160 character meta description`);
        assert.match(html, /<meta property="og:title"/, `${page} needs og:title`);
        assert.match(html, /<meta property="og:image"/, `${page} needs og:image`);
    }
});

test("public pages show no leftover placeholder text", () => {
    for (const page of PUBLIC_PAGES) {
        // Visible text only: drop comments, scripts and tags first.
        const text = read(page)
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<script[\s\S]*?<\/script>/g, "")
            .replace(/<[^>]+>/g, " ");
        for (const marker of ["$—", "[Replace", "[Add ", "lorem ipsum", "[YOUR"]) {
            assert.ok(!text.includes(marker), `${page} still shows placeholder text "${marker}"`);
        }
    }
});
