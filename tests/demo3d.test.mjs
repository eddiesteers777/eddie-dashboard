// The 3D demo lab (lab/demo3d): the movement checks (qa.js), the catalog
// rules (catalog.js) and the shipped catalog itself (exercises.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gradeSquat, gradeLunge, GRADERS, fromHorizontal, fromVertical, bottomFrame, MAX_JOINT_SPEED } from "../lab/demo3d/qa.js";
import { validateEntry, findDemo, readiness, playable, pickSex, viewsFor, cameraFor, isReviewed, VIEWS } from "../lab/demo3d/catalog.js";

const lab = join(dirname(fileURLToPath(import.meta.url)), "..", "lab", "demo3d");

// A plain, good squat: joints move between a standing and a bottom position.
const TOP = {
    Hips: [0, 0.95, 0], Spine2: [0, 1.3, 0], Head: [0, 1.6, 0],
    LeftUpLeg: [0.1, 0.92, 0], LeftLeg: [0.12, 0.5, 0.02], LeftFoot: [0.12, 0.08, 0], LeftToeBase: [0.14, 0.02, 0.14],
    RightUpLeg: [-0.1, 0.92, 0], RightLeg: [-0.12, 0.5, 0.02], RightFoot: [-0.12, 0.08, 0], RightToeBase: [-0.14, 0.02, 0.14],
    LeftArm: [0.18, 1.4, 0], LeftHand: [0.2, 0.8, 0.05], RightHand: [-0.2, 0.8, 0.05]
};
const BOTTOM = {
    Hips: [0, 0.5, -0.1], Spine2: [0, 0.8, 0.1], Head: [0, 1.08, 0.2],
    LeftUpLeg: [0.1, 0.5, -0.07], LeftLeg: [0.16, 0.48, 0.3], LeftFoot: [0.12, 0.08, 0], LeftToeBase: [0.14, 0.02, 0.14],
    RightUpLeg: [-0.1, 0.5, -0.07], RightLeg: [-0.16, 0.48, 0.3], RightFoot: [-0.12, 0.08, 0], RightToeBase: [-0.14, 0.02, 0.14],
    LeftArm: [0.18, 0.95, 0], LeftHand: [0.2, 0.95, 0.55], RightHand: [-0.2, 0.95, 0.55]
};
function squatTrack({ bottom = BOTTOM, n = 96, fps = 30, tweak = () => {} } = {}) {
    const frames = [];
    for (let i = 0; i < n; i++) {
        const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
        const f = {};
        for (const j of Object.keys(TOP)) f[j] = TOP[j].map((v, k) => v + (bottom[j][k] - v) * s);
        tweak(f, s, i);
        frames.push(f);
    }
    return { fps, frames };
}
const byId = (report, id) => report.checks.find(c => c.id === id);

test("a good squat passes every check", () => {
    // (This fixture slides joints in straight lines, which stretches the limbs; the limb-length check has its own tests.)
    const r = gradeSquat(squatTrack());
    const bad = r.checks.filter(c => !c.pass && c.id !== "limb-length");
    assert.deepEqual(bad, [], JSON.stringify(bad));
    assert.deepEqual(r.checks.map(c => c.id), ["feet-planted", "depth", "range", "knees-out", "chest-up", "balance", "smooth",
        "phase-order", "tempo-down", "tempo-up", "knee-bend", "limb-length", "loop-closes"]);
});

test("limbs that stretch fail 'limb-length'; a still body passes", () => {
    assert.equal(byId(gradeSquat(squatTrack()), "limb-length").pass, false);
    const still = squatTrack({ bottom: TOP });
    assert.equal(byId(gradeSquat(still), "limb-length").pass, true);
});

test("hips that bob on the way down fail 'phase-order'", () => {
    const r = gradeSquat(squatTrack({ tweak: (f, s, i) => { if (i === 20) f.Hips[1] += 0.08; } }));
    assert.equal(byId(r, "phase-order").pass, false);
});

test("a rep that drops in under a second fails the tempo check", () => {
    const r = gradeSquat(squatTrack({ n: 40 }));
    assert.equal(byId(r, "tempo-down").pass, false);
});

test("a squat that is not deep enough in the knees fails 'knee-bend'", () => {
    const r = gradeSquat(squatTrack({ bottom: { ...BOTTOM, LeftLeg: TOP.LeftLeg.map((v, k) => v + (BOTTOM.LeftLeg[k] - v) * 0.2) } }));
    assert.equal(byId(r, "knee-bend").pass, false);
});

test("a sliding foot fails 'feet planted'", () => {
    const r = gradeSquat(squatTrack({ tweak: (f, s) => { f.LeftFoot[2] += 0.05 * s; } }));
    assert.equal(byId(r, "feet-planted").pass, false);
    assert.equal(r.pass, false);
});

test("a shallow squat fails depth", () => {
    const shallow = { ...BOTTOM, Hips: [0, 0.78, -0.05], LeftUpLeg: [0.1, 0.76, -0.03], RightUpLeg: [-0.1, 0.76, -0.03], Spine2: [0, 1.1, 0.08], Head: [0, 1.4, 0.15] };
    const r = gradeSquat(squatTrack({ bottom: shallow }));
    assert.equal(byId(r, "depth").pass, false);
});

test("knees caving in fail 'knees out'", () => {
    const cave = { ...BOTTOM, LeftLeg: [0.04, 0.48, 0.3], RightLeg: [-0.04, 0.48, 0.3] };
    assert.equal(byId(gradeSquat(squatTrack({ bottom: cave })), "knees-out").pass, false);
});

test("a joint popping between frames fails 'smooth'; a seam in the loop does too", () => {
    const pop = gradeSquat(squatTrack({ tweak: (f, s, i) => { if (i === 40) f.RightHand[0] -= 0.2; } }));
    assert.equal(byId(pop, "smooth").pass, false);
    assert.ok(byId(pop, "smooth").value > MAX_JOINT_SPEED);
    const seam = gradeSquat(squatTrack({ tweak: (f, s, i) => { if (i === 95) f.Head[2] += 0.1; } }));
    assert.equal(byId(seam, "smooth").pass, false);
});

test("too few frames can't pass; the squat grader is registered", () => {
    assert.equal(gradeSquat({ fps: 30, frames: [] }).pass, false);
    assert.equal(GRADERS["bodyweight-squat"], gradeSquat);
});

test("angle helpers", () => {
    assert.equal(Math.round(fromHorizontal([0, 0, 0], [1, 0, 0])), 0);
    assert.equal(Math.round(fromVertical([0, 0, 0], [0, 1, 0])), 0);
    assert.equal(Math.round(fromVertical([0, 0, 0], [0, 1, 1])), 45);
    assert.equal(bottomFrame([{ Hips: [0, 1, 0] }, { Hips: [0, 0.5, 0] }]).Hips[1], 0.5);
});

const ENTRY = {
    id: "bodyweight-squat", name: "Bodyweight Squat", aliases: ["Air Squat"],
    models: { male: "a.glb", female: "b.glb" }, views: ["three-quarter", "side"], defaultView: "side",
    status: "review", review: { approvedBy: null, approvedOn: null }
};
const PASS = { male: { pass: true }, female: { pass: true } };

test("catalog: find by id, name or alias", () => {
    const catalog = { exercises: [ENTRY] };
    assert.equal(findDemo(catalog, "air  squat"), ENTRY);
    assert.equal(findDemo(catalog, "bodyweight-squat"), ENTRY);
    assert.equal(findDemo(catalog, "BODYWEIGHT SQUAT"), ENTRY);
    assert.equal(findDemo(catalog, "Push-up"), null);
    assert.equal(findDemo(catalog, ""), null);
});

test("catalog: ready needs both checks, both models and a person's sign-off", () => {
    assert.deepEqual(readiness(ENTRY, PASS).missing, ["review", "status"]);
    const signed = { ...ENTRY, status: "ready", review: { approvedBy: "Coach", approvedOn: "2026-10-18" } };
    assert.equal(readiness(signed, PASS).ready, true);
    assert.equal(readiness(signed, { male: { pass: true }, female: { pass: false } }).ready, false);
    assert.equal(readiness({ ...signed, models: { male: "a.glb" } }, PASS).ready, false);
    assert.equal(isReviewed(ENTRY), false);
});

test("catalog: clients see only ready demos; the lab may show ones in review", () => {
    assert.equal(playable(ENTRY), false);
    assert.equal(playable(ENTRY, { includeReview: true }), true);
    assert.equal(playable({ ...ENTRY, status: "ready" }), true);
    assert.equal(playable({ ...ENTRY, status: "draft" }, { includeReview: true }), false);
    assert.equal(playable({ ...ENTRY, models: {} }, { includeReview: true }), false);
});

test("catalog: sex and view choices fall back sensibly", () => {
    assert.equal(pickSex(ENTRY, "female"), "female");
    assert.equal(pickSex({ models: { female: "b.glb" } }, "male"), "female");
    assert.equal(pickSex({ models: {} }, "male"), null);
    assert.deepEqual(viewsFor(ENTRY), { views: ["three-quarter", "side"], start: "side" });
    assert.deepEqual(viewsFor({ views: ["nope"] }), { views: ["three-quarter"], start: "three-quarter" });
});

test("camera: each view looks from its side, far enough to fit the body", () => {
    const front = cameraFor("front", { height: 1.8, aspect: 0.8 });
    assert.ok(Math.abs(front.position[0]) < 1e-9 && front.position[2] > 3);
    const side = cameraFor("side", { height: 1.8, aspect: 0.8 });
    assert.ok(side.position[0] > 3 && Math.abs(side.position[2]) < 1e-9);
    assert.deepEqual(front.target, [0, 0.9, 0]);
    // A narrow phone frame pulls the camera back further than a wide one.
    assert.ok(cameraFor("front", { aspect: 0.5 }).position[2] > cameraFor("front", { aspect: 1.5 }).position[2]);
    assert.ok(VIEWS["three-quarter"] && VIEWS.side && VIEWS.front);
});

test("the shipped catalog: files exist, phone-sized, licensed, and nothing is 'ready' without passing checks and a sign-off", () => {
    const catalog = JSON.parse(readFileSync(join(lab, "exercises.json"), "utf8"));
    const licenses = readFileSync(join(lab, "LICENSES.md"), "utf8");
    assert.ok(catalog.exercises.length > 0);
    for (const e of catalog.exercises) {
        assert.ok(["draft", "review", "ready"].includes(e.status), `${e.id} status`);
        assert.ok(e.start && e.move && e.cue, `${e.id} steps`);
        const qa = {};
        for (const s of ["male", "female"]) {
            const model = join(lab, e.models[s]), motion = join(lab, e.motions[s]);
            assert.ok(existsSync(model), `${e.models[s]} exists`);
            assert.ok(statSync(model).size < 5 * 1024 * 1024, `${e.models[s]} is under 5 MB`);
            assert.ok(licenses.includes(e.models[s]), `${e.models[s]} is listed in LICENSES.md`);
            assert.ok(existsSync(motion), `${e.motions[s]} exists`);
            assert.ok(statSync(motion).size < 400 * 1024, `${e.motions[s]} is a small motion file (under 400 KB)`);
            assert.ok(licenses.includes(".motion.glb") || licenses.includes(e.motions[s]), `${e.motions[s]} is covered in LICENSES.md`);
            qa[s] = JSON.parse(readFileSync(join(lab, e.qa[s]), "utf8"));
        }
        if (e.status === "ready") assert.equal(readiness(e, qa).ready, true, `${e.id} is marked ready but ${readiness(e, qa).missing.join(", ")}`);
    }
});

test("phases cover one rep from 0 to 1 with no gaps", async () => {
    const { readFile } = await import("node:fs/promises");
    const cat = JSON.parse(await readFile(new URL("../lab/demo3d/exercises.json", import.meta.url), "utf8"));
    for (const e of Array.isArray(cat) ? cat : cat.exercises) {
        assert.ok(e.phases?.length >= 3, `${e.id} has phases`);
        let at = 0;
        for (const ph of e.phases) { assert.equal(ph.from, at, `${e.id}: ${ph.label} starts where the last ended`); assert.ok(ph.to > ph.from); at = ph.to; }
        assert.equal(at, 1, `${e.id}: phases end at 1`);
    }
});

test("the asset register covers every shipped file, with a licence on the allowed list and current hashes", async () => {
    const { build, shippedFiles, ALLOWED } = await import("../lab/demo3d/tools/registry.mjs");
    const { createHash } = await import("node:crypto");
    const reg = JSON.parse(readFileSync(join(lab, "REGISTRY.json"), "utf8"));
    const listed = reg.files.map(f => f.path).sort();
    assert.deepEqual(listed, shippedFiles().filter(p => p !== "REGISTRY.json"), "every shipped file has a row and every row has a file (run: node lab/demo3d/tools/registry.mjs)");
    for (const f of reg.files) {
        assert.ok(ALLOWED.includes(f.licence), `${f.path}: licence ${f.licence} is allowed`);
        assert.ok(f.source && f.author && f.approval?.status, `${f.path}: source, author and approval are filled in`);
        assert.ok(["licence-checked", "approved"].includes(f.approval.status), `${f.path}: approval status`);
        if (/^(assets|vendor)\//.test(f.path)) {
            const sha = createHash("sha256").update(readFileSync(join(lab, f.path))).digest("hex");
            assert.equal(sha, f.sha256, `${f.path} changed since it was registered (re-run tools/registry.mjs after checking it)`);
        }
    }
    build(reg); // every file matches a rule
});

// ---- Reverse lunge and the exercise schema ----

const LUNGE_TOP = { ...TOP, RightLeg: [-0.12, 0.5, 0.02] };
const LUNGE_BOTTOM = {
    Hips: [0, 0.55, -0.4], Spine2: [0, 0.95, -0.38], Head: [0, 1.25, -0.35],
    LeftUpLeg: [0.1, 0.55, -0.4], LeftLeg: [0.12, 0.5, 0.0], LeftFoot: [0.12, 0.08, 0], LeftToeBase: [0.14, 0.02, 0.14],
    RightUpLeg: [-0.1, 0.55, -0.4], RightLeg: [-0.12, 0.1, -0.5], RightFoot: [-0.12, 0.17, -0.8], RightToeBase: [-0.14, 0.02, -0.7],
    LeftArm: [0.18, 1.1, -0.4], LeftHand: [0.1, 1.0, -0.2], RightHand: [-0.1, 1.0, -0.2]
};
function lungeTrack({ bottom = LUNGE_BOTTOM, n = 135, fps = 30, tweak = () => {} } = {}) {
    const frames = [];
    for (let i = 0; i < n; i++) {
        const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n), f = {};
        for (const j of Object.keys(LUNGE_TOP)) f[j] = LUNGE_TOP[j].map((v, k) => v + (bottom[j][k] - v) * s);
        tweak(f, s, i);
        frames.push(f);
    }
    return { fps, frames };
}

test("a good reverse lunge passes the lunge checks, and the grader is registered", () => {
    assert.equal(GRADERS["reverse-lunge"], gradeLunge);
    const r = gradeLunge(lungeTrack());
    const bad = r.checks.filter(c => !c.pass && !["limb-length", "knee-bend"].includes(c.id)); // fixture slides joints in straight lines
    assert.deepEqual(bad, [], JSON.stringify(bad));
});

test("a front foot that slides, a back foot that never steps back and a shallow lunge fail", () => {
    assert.equal(byId(gradeLunge(lungeTrack({ tweak: (f, s) => { f.LeftFoot[2] += 0.06 * s; } })), "front-planted").pass, false);
    assert.equal(byId(gradeLunge(lungeTrack({ bottom: { ...LUNGE_BOTTOM, RightFoot: [-0.12, 0.17, -0.2] } })), "step-back").pass, false);
    assert.equal(byId(gradeLunge(lungeTrack({ bottom: { ...LUNGE_BOTTOM, RightLeg: [-0.12, 0.4, -0.5] } })), "back-knee-low").pass, false);
    assert.equal(byId(gradeLunge(lungeTrack({ bottom: { ...LUNGE_BOTTOM, RightToeBase: [-0.14, 0.2, -0.7] } })), "back-toe-down").pass, false);
});

test("exercise schema: every shipped entry is complete and uses known muscles", async () => {
    const { MUSCLES } = await import("../js/exerciseMuscles.js");
    const catalog = JSON.parse(readFileSync(join(lab, "exercises.json"), "utf8"));
    for (const e of catalog.exercises) assert.deepEqual(validateEntry(e, { muscles: MUSCLES }), [], `${e.id} is a valid entry`);
    assert.ok(catalog.exercises.some(e => e.id === "reverse-lunge"), "the lunge is in the catalog");
    assert.equal(new Set(catalog.exercises.map(e => e.id)).size, catalog.exercises.length, "ids are unique");
    assert.ok(catalog.exercises.every(e => GRADERS[e.id]), "every exercise has a movement grader");
});

test("exercise schema: missing or wrong fields are named", async () => {
    const { MUSCLES } = await import("../js/exerciseMuscles.js");
    const good = JSON.parse(readFileSync(join(lab, "exercises.json"), "utf8")).exercises[0];
    const problems = patch => validateEntry({ ...structuredClone(good), ...patch }, { muscles: MUSCLES }).join(" | ");
    assert.match(problems({ id: "Bad Id" }), /id must be/);
    assert.match(problems({ category: "cardio" }), /category/);
    assert.match(problems({ equipment: [] }), /equipment/);
    assert.match(problems({ motions: { male: "x.glb" } }), /female motion/);
    assert.match(problems({ views: ["side", "above"] }), /views/);
    assert.match(problems({ defaultView: "front", views: ["side"] }), /defaultView/);
    assert.match(problems({ muscles: { primary: ["quadriceps"], secondary: ["quadriceps"] } }), /twice/);
    assert.match(problems({ muscles: { primary: ["wings"], secondary: [] } }), /unknown muscle/);
    assert.match(problems({ phases: [{ label: "A", from: 0, to: 0.4 }, { label: "B", from: 0.5, to: 1 }, { label: "C", from: 1, to: 1.2 }] }), /gap|0 to 1/);
    assert.match(problems({ status: "ready" }), /sign-off/);
    assert.match(problems({ cue: "" }), /cue/);
    assert.ok(validateEntry(null).length > 0);
});
