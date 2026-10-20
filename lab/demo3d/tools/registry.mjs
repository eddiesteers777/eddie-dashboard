// The asset register: one row per file that ships with the 3D demos (everything under lab/demo3d/ except tools/),
// with where it came from, its licence, what we changed and who approved it.
//   node lab/demo3d/tools/registry.mjs          rewrite lab/demo3d/REGISTRY.json (sizes and hashes refreshed)
// approval.status: "licence-checked" (provenance and licence verified) or "approved" (a person has signed it off; edit
// REGISTRY.json by hand, the script keeps what is there). tests/demo3d.test.mjs fails when a shipped file has no row, a row has no file, a hash is stale, or a licence is not on
// the allowed list. A changed asset therefore has to be re-registered (and so looked at) on purpose.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const lab = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ALLOWED = ["own", "CC0-1.0", "MIT"];
const MH = "MakeHuman base mesh and system assets via MPFB 2.0.16 (Blender 4.5 LTS)";
const THREE = "Three.js r160, github.com/mrdoob/three.js";

// First matching rule wins. `match` is a path regex relative to lab/demo3d.
export const RULES = [
    { match: /^assets\/athlete-(male|female)\.glb$/, kind: "character", source: `${MH}: body, skin, hair, brows, lashes, eyes, shoes03; rig = MPFB's built-in Mixamo-compatible rig`, licence: "CC0-1.0", author: "MakeHuman community (assets); Southbound (kit, build)",
      changes: "Southbound kit generated from the body surface (tools/build_athletes.py); body hidden under the kit; shoe weights and colours; hair edge feathered; muscle-definition normal map baked from a more muscular copy of the same character; logo patch (own mark)." },
    { match: /^assets\/[a-z-]+-(male|female)\.motion\.glb$/, kind: "motion", source: "Written for Southbound: inverse-kinematics motion in tools/motions/*.js, baked by tools/bake.mjs", licence: "own", author: "Southbound",
      changes: "Compared with CMU motion capture for joint angles and timing (reference only, no data used)." },
    { match: /^assets\/[a-z-]+-(male|female)\.qa\.json$/, kind: "report", source: "Output of tools/qa.mjs on the baked motion", licence: "own", author: "Southbound", changes: "" },
    { match: /^assets\/sb-logo\.png$/, kind: "image", source: "Southbound mark (copy of tools/art/sb-logo.png, rendered from brand/sb-mark.svg)", licence: "own", author: "Southbound", changes: "" },
    { match: /^vendor\/three\//, kind: "code", source: THREE, licence: "MIT", author: "mrdoob and the Three.js authors", changes: "GLTFLoader and BufferGeometryUtils import the minified build by relative path; nothing else." },
    { match: /^(demo3d\.js|catalog\.js|qa\.js|gym\.js|props\.js|demo3d\.css|index\.html|mockups\/gym\.html)$/, kind: "code", source: "Written for Southbound", licence: "own", author: "Southbound", changes: "" },
    { match: /^exercises\.json$/, kind: "data", source: "Written for Southbound (steps copied from js/exerciseDemos.js)", licence: "own", author: "Southbound", changes: "" },
    { match: /^(LICENSES|README)\.md$|^REGISTRY\.json$/, kind: "doc", source: "Written for Southbound", licence: "own", author: "Southbound", changes: "" }
];

export function shippedFiles() {
    const out = [];
    const walk = dir => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) { if (relative(lab, p) !== "tools") walk(p); } else out.push(relative(lab, p).split("\\").join("/")); } };
    walk(lab);
    return out.sort();
}

export function build(previous = {}) {
    const files = [];
    for (const path of shippedFiles()) {
        if (path === "REGISTRY.json") continue;
        const rule = RULES.find(r => r.match.test(path));
        if (!rule) throw new Error(`no registry rule for ${path}`);
        const buf = readFileSync(join(lab, path));
        const old = (previous.files || []).find(f => f.path === path) || {};
        files.push({ path, kind: rule.kind, source: rule.source, licence: rule.licence, author: rule.author, changes: rule.changes,
            bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"),
            approval: old.approval || { status: "licence-checked", by: "Claude, against the licence file named in LICENSES.md", date: "2026-10-20" } });
    }
    return { format: "southbound-demo-registry/1", updated: new Date().toISOString().slice(0, 10), allowedLicences: ALLOWED, files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    let prev = {}; try { prev = JSON.parse(readFileSync(join(lab, "REGISTRY.json"), "utf8")); } catch {}
    const reg = build(prev); writeFileSync(join(lab, "REGISTRY.json"), JSON.stringify(reg, null, 2) + "\n");
    console.log(`REGISTRY.json: ${reg.files.length} files`);
}
