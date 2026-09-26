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

const PUBLIC_PAGES = ["home.html", "about.html", "packages.html", "coaching.html", "soccer.html", "apply.html", "contact.html", "install.html", "privacy.html"];

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

// The app talks through js/ui.js (Southbound dialogs and toasts), never
// the browser's grey alert()/confirm()/prompt() boxes. A plain call is
// only allowed as the fallback side of a ternary (`window.SB ? ... : confirm(...)`)
// in inline scripts that run before js/ui.js may have loaded.
test("no browser alert/confirm/prompt dialogs", () => {
    const offenders = [];
    const sources = [
        ...manifest.scripts.filter(f => f !== "js/ui.js").map(f => [f, read(f)]),
        ...manifest.pages.map(f => [f, (read(f).match(/<script[\s\S]*?<\/script>/g) || []).join("\n")])
    ];
    for (const [file, src] of sources) {
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        for (const m of code.matchAll(/(^|[^.\w])((?:window\.)?(alert|confirm|prompt))\s*\(/g)) {
            const before = code.slice(Math.max(0, m.index - 2), m.index + m[1].length);
            if (/:\s*$/.test(before)) continue;
            const line = code.slice(0, m.index).split("\n").length;
            offenders.push(`${file}:${line} ${m[2]}()`);
        }
    }
    assert.deepEqual(offenders, [], `Use toast/sbAlert/sbConfirm/sbPrompt from js/ui.js instead:\n${offenders.join("\n")}`);
});

// Visible copy reads like a finished product: a real dash (—), never a
// typed "--", and never the old "EddieOS" name. EddieOS survives only in
// data identifiers (eddieos-* keys, the backup file's app field, the COROS
// client name), which live in code, not copy.
const stringLiterals = code => [...code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/\/\/[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g)]
    .map(m => m[0]).filter(t => !t.startsWith("//"));

test("visible copy uses real dashes and the Southbound name", () => {
    const offenders = [];
    const IDENTIFIERS = { "js/cloudSync.js": 1, "js/corosData.js": 1 };
    for (const page of [...manifest.pages, ...manifest.partials]) {
        const text = read(page)
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<script[\s\S]*?<\/script>/g, "")
            .replace(/<style[\s\S]*?<\/style>/g, "")
            .replace(/<[^>]+>/g, " ");
        // A lone "--" on its own line is a value placeholder ("-- mi"), not a dash.
        if (/\S -- \S/.test(text)) offenders.push(`${page}: "--" in the page text`);
        if (/eddie\s*os/i.test(text)) offenders.push(`${page}: says EddieOS`);
        if (/operating system/i.test(read(page).replace(/<!--[\s\S]*?-->/g, ""))) offenders.push(`${page}: says "operating system" (the old EddieOS tagline)`);
    }
    for (const file of manifest.scripts) {
        const src = read(file);
        const strings = stringLiterals(src);
        // Whole code minus comments too, so a "--" inside a template nested
        // in another template (which the string scan can't see) is caught.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
        for (const line of code.split("\n").filter(l => /[^\s-] -- [^\s-]/.test(l))) offenders.push(`${file}: ${line.trim().slice(0, 70)}`);
        const names = strings.filter(t => /eddie\s*os/i.test(t.replace(/eddieos[-_:]\w*/gi, "")));
        if (names.length > (IDENTIFIERS[file] || 0)) offenders.push(`${file}: says EddieOS`);
    }
    assert.deepEqual(offenders, [], `Use " — " for a dash and "Southbound" for the name:\n${offenders.join("\n")}`);
});

test("fonts are self-hosted (no Google Fonts) and every font file exists", () => {
    const css = manifest.styles.map(f => [f, read(f)]);
    for (const [file, src] of css) {
        assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(src), `${file} still loads Google Fonts`);
        for (const [, ref] of src.matchAll(/url\(['"]?([^'")]+\.woff2)['"]?\)/g)) {
            const target = resolveRef(file, ref);
            assert.ok(existsSync(join(root, target)), `${file} -> ${ref} is missing`);
        }
    }
    for (const page of [...manifest.pages, ...manifest.partials]) {
        assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(read(page)), `${page} still loads Google Fonts`);
    }
});
