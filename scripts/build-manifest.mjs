// Writes site-manifest.json: every page, partial, script and stylesheet
// in the site. site-check.html reads it instead of a hand-typed list
// (which drifted out of date), and tests/static.test.mjs fails if it's
// stale -- run `npm run manifest` after adding or removing files.
import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const list = (dir, ext) => readdirSync(join(root, dir))
    .filter(f => f.endsWith(ext))
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    writeFileSync(join(root, "site-manifest.json"), JSON.stringify(buildManifest(), null, 2) + "\n");
    console.log("site-manifest.json updated");
}
