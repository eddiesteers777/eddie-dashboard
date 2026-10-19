// Grades each baked demo's movement and writes assets/<id>-<sex>.qa.json.
//   node lab/demo3d/tools/qa.mjs [reviewDir]   (reads the .track.json files bake.mjs wrote)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GRADERS } from "../qa.js";
const lab = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const review = process.argv[2] || "/tmp/demo3d-review";
let failed = 0;
for (const f of readdirSync(review).filter(f => f.endsWith(".track.json"))) {
    const [, id, sex] = f.match(/^(.+)-(male|female)\.track\.json$/) || [];
    const grade = GRADERS[id];
    if (!grade) { console.log("no grader for", id); continue; }
    const report = { id, sex, gradedAt: new Date().toISOString().slice(0, 10), ...grade(JSON.parse(readFileSync(join(review, f), "utf8"))) };
    writeFileSync(join(lab, "assets", `${id}-${sex}.qa.json`), JSON.stringify(report, null, 1));
    console.log(`${report.pass ? "PASS" : "FAIL"} ${id} ${sex}`);
    for (const c of report.checks) console.log(`   ${c.pass ? "ok " : "BAD"} ${c.label}: ${c.value} (limit ${c.limit})`);
    if (!report.pass) failed++;
}
process.exit(failed ? 1 : 0);
