// The exercise demo figure (js/demoFigure.js), the demos (js/exerciseDemos.js)
// and the muscle lookup (js/exerciseMuscles.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { skeleton, poseAt, frameSvg, fitBox, BONES, JOINTS } from "../js/demoFigure.js";
import { DEMOS, demoFor, normalizeName } from "../js/exerciseDemos.js";
import { musclesFor, hasHowTo, MUSCLES, MUSCLE_LABELS, muscleWords } from "../js/exerciseMuscles.js";
import { BUILT_IN_WORKOUTS } from "../js/strengthLibraryData.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("bones keep their length in any pose", () => {
    const pose = Object.fromEntries(JOINTS.map((j, i) => [j, [((i * 37) % 120) - 60, ((i * 53) % 60) - 30, ((i * 71) % 40) - 20]]));
    const { pts } = skeleton(pose);
    for (const s of ["l", "r"]) {
        assert.ok(Math.abs(dist(pts[s + "Sh"], pts[s + "El"]) - BONES.upper) < 1e-6);
        assert.ok(Math.abs(dist(pts[s + "El"], pts[s + "Wr"]) - BONES.fore) < 1e-6);
        assert.ok(Math.abs(dist(pts[s + "Hp"], pts[s + "Kn"]) - BONES.thigh) < 1e-6);
        assert.ok(Math.abs(dist(pts[s + "Kn"], pts[s + "An"]) - BONES.shin) < 1e-6);
    }
    assert.ok(Math.abs(dist(pts.pelvis, pts.chest) - BONES.spine) < 1e-6);
});

test("standing: on the floor, head on top, left on the left", () => {
    const { pts } = skeleton({});
    const ys = Object.values(pts).map(p => p[1]);
    assert.ok(Math.min(...ys) >= 0 && Math.min(...ys) < 8, "soles at the floor");
    assert.ok(pts.headTop[1] > 165 && pts.headTop[1] < 195, `about a person tall: ${pts.headTop[1]}`);
    assert.ok(pts.lSh[0] > 0 && pts.rSh[0] < 0);
    // Flexing a hip swings the thigh forward (+z).
    const { pts: q } = skeleton({ lHip: [-90, 0, 0] });
    assert.ok(q.lKn[2] - q.lHp[2] > 40);
});

test("every demo: complete, grounded, anchored, and draws from every angle", () => {
    const ids = new Set(), names = new Map();
    for (const d of DEMOS) {
        assert.ok(!ids.has(d.id), `unique id ${d.id}`); ids.add(d.id);
        for (const n of [d.name, ...(d.aliases || [])]) {
            const k = normalizeName(n);
            assert.ok(!names.has(k) || names.get(k) === d.id, `"${n}" belongs to one demo only (also ${names.get(k)})`);
            names.set(k, d.id);
        }
        assert.equal(d.keys[0].at, 0, d.id);
        assert.equal(d.keys[d.keys.length - 1].at, 1, d.id);
        assert.ok(d.start && d.move && d.cue, `${d.id} has its words`);
        assert.ok(d.muscles.primary.every(m => MUSCLES.includes(m)) && d.muscles.secondary.every(m => MUSCLES.includes(m)), `${d.id} muscle names`);
        assert.ok(d.views.length >= 3, d.id);
        const opts = { anchor: d.anchor, level: d.level };
        const sks = Array.from({ length: 12 }, (_, i) => skeleton(poseAt(d.keys, i / 12), opts));
        for (const sk of sks) {
            const minY = Math.min(...Object.values(sk.pts).map(p => p[1]));
            assert.ok(minY > -1 && minY < 10, `${d.id} stays on the floor (${minY.toFixed(1)})`);
            if (d.anchor) {
                const ax = d.anchor.reduce((s, k) => s + sk.pts[k][0], 0) / d.anchor.length;
                const az = d.anchor.reduce((s, k) => s + sk.pts[k][2], 0) / d.anchor.length;
                assert.ok(Math.abs(ax) < 1e-6 && Math.abs(az) < 1e-6, `${d.id} anchored`);
            }
            if (d.level) {
                const gap = sk.pts[d.level[0]][1] - sk.pts[d.level[1]][1];
                assert.ok(Math.abs(gap - (d.level[2] || 0)) < 0.5, `${d.id} levelled (${gap.toFixed(2)})`);
            }
        }
        for (const v of d.views) {
            const box = fitBox(sks, v);
            for (const sk of [sks[0], sks[5]]) {
                const svg = frameSvg(sk, v, box, { equipment: d.equipment || [], mat: d.mat, id: "t" });
                assert.ok(!/NaN|Infinity|undefined/.test(svg), `${d.id} ${v.label} draws cleanly`);
                assert.match(svg, /^<svg[^>]+viewBox="[-\d. ]+"/);
                assert.ok(svg.length < 60000, `${d.id} frame stays small (${svg.length})`);
            }
        }
    }
});

test("the moving parts actually move", () => {
    const squat = demoFor("Bodyweight Squat");
    const top = skeleton(poseAt(squat.keys, 0), { anchor: squat.anchor });
    const bottom = skeleton(poseAt(squat.keys, 0.5), { anchor: squat.anchor });
    assert.ok(top.pts.pelvis[1] - bottom.pts.pelvis[1] > 30, "the hips drop in a squat");
    const calf = demoFor("Calf Raise");
    const up = skeleton(poseAt(calf.keys, 0.45), { anchor: calf.anchor });
    const down = skeleton(poseAt(calf.keys, 0), { anchor: calf.anchor });
    assert.ok(up.pts.headTop[1] - down.pts.headTop[1] > 4, "a calf raise lifts you");
    const bridge = demoFor("Glute Bridge");
    const lifted = skeleton(poseAt(bridge.keys, 0.5), { anchor: bridge.anchor, level: bridge.level });
    const flat = skeleton(poseAt(bridge.keys, 0), { anchor: bridge.anchor, level: bridge.level });
    assert.ok(lifted.pts.pelvis[1] - flat.pts.pelvis[1] > 12, "a bridge lifts the hips");
});

test("demos answer to their names, any case or punctuation", () => {
    assert.equal(demoFor("goblet squats").id, "goblet-squat");
    assert.equal(demoFor("PUSH UP").id, "push-up");
    assert.equal(demoFor("Push-Ups").id, "push-up");
    assert.equal(demoFor("DB RDL").id, "dumbbell-rdl");
    assert.equal(demoFor("Romanian Deadlift").id, "romanian-deadlift");
    assert.equal(demoFor("Back Squat"), null);
    assert.equal(demoFor(""), null);
});

test("muscles: what the exercise brings first, then its demo, then the table", () => {
    assert.deepEqual(musclesFor("Anything", { primaryMuscles: ["Chest", "nonsense"], secondaryMuscles: ["triceps", "chest"] }), { primary: ["chest"], secondary: ["triceps"] });
    assert.deepEqual(musclesFor("Goblet Squat").primary, ["quadriceps", "glutes"]);
    assert.deepEqual(musclesFor("Lat Pulldown"), { primary: ["lats"], secondary: ["biceps", "middle back"] });
    assert.deepEqual(musclesFor("Underwater basket weaving"), { primary: [], secondary: [] });
    assert.equal(muscleWords(["quadriceps", "middle back"]), "Quads, Upper back");
    assert.ok(MUSCLES.every(m => MUSCLE_LABELS[m]));
    assert.equal(hasHowTo("Bird Dog"), true);
    assert.equal(hasHowTo("Lat Pulldown"), false, "no demo, no How to");
    assert.equal(hasHowTo("Underwater basket weaving"), false);
});

test("every exercise in the Southbound library has its muscles", () => {
    const names = new Set(BUILT_IN_WORKOUTS.flatMap(w => (w.exercises || []).map(e => e.name)));
    const missing = [...names].filter(n => !musclesFor(n).primary.length);
    assert.deepEqual(missing, []);
});

test("the muscle map lights the worked muscles", () => {
    const sk = skeleton({});
    const svg = frameSvg(sk, { yaw: 0, pitch: 0 }, fitBox([sk], { yaw: 0, pitch: 0 }), { map: true, muscles: { quadriceps: "primary", abdominals: "secondary" }, id: "m" });
    assert.match(svg, /rgb\(2\d\d,1[0-2]\d,\d+\)/, "clay for the main muscle");
    assert.ok(!/rgb\(30,62,46\)/.test(svg), "no shirt on the map");
});

test("the flat muscle map: lit muscles, front and back, chips, a workout's muscles", async () => {
    const { muscleMapSvg, muscleMapHtml, workoutMuscles, levelsOf } = await import("../js/muscleMap.js");
    const levels = levelsOf({ primary: ["chest", "glutes"], secondary: ["triceps"] });
    const front = muscleMapSvg(levels, { view: "front", id: "a" });
    const back = muscleMapSvg(levels, { view: "back", id: "b" });
    assert.ok(!/NaN|undefined/.test(front + back));
    assert.match(front, /data-muscle="chest" data-level="primary"/);
    assert.ok(!/data-muscle="glutes"/.test(front), "glutes are on the back");
    assert.match(back, /data-muscle="glutes" data-level="primary"/);
    assert.match(back, /data-muscle="triceps" data-level="secondary"/);
    const hips = levelsOf({ primary: ["abductors", "hamstrings", "quadriceps"] });
    assert.match(muscleMapSvg(hips, { view: "front" }), /data-muscle="abductors"/, "outer hip in front (TFL)");
    assert.match(muscleMapSvg(hips, { view: "back" }), /data-muscle="abductors"/, "and behind (glute medius)");
    assert.equal((muscleMapSvg(hips, { view: "front" }).match(/data-muscle="quadriceps"/g) || []).length, 6, "three quad heads a leg");
    assert.ok(!/data-muscle="hamstrings"/.test(muscleMapSvg(hips, { view: "front" })), "hamstrings only behind");
    const html = muscleMapHtml({ primary: ["chest"], secondary: ["triceps"] });
    assert.match(html, /mm-chip is-primary">Chest</);
    assert.match(html, /mm-chip is-secondary">Triceps</);
    assert.equal(muscleMapHtml({ primary: [], secondary: [] }), "");
    const w = workoutMuscles([{ name: "Goblet Squat" }, { name: "Push-Up" }, { name: "Lat Pulldown", sets: [{ done: false }] }]);
    assert.ok(w.primary.includes("quadriceps") && w.primary.includes("chest"));
    assert.ok(!w.primary.includes("lats"), "no sets done, not counted");
    assert.ok(w.secondary.every(m => !w.primary.includes(m)));
});

test("3D clips: found by name, files in videos/, How to for exercises with no figure", async () => {
    const { CLIPS, clipFor, clipSources } = await import("../js/exerciseClips.js");
    const { existsSync } = await import("node:fs");
    for (const c of CLIPS) {
        const src = clipSources(c);
        for (const f of [src.webm, src.mp4, src.poster]) assert.ok(existsSync(new URL(`../${f}`, import.meta.url)), `${f} exists`);
        const full = clipFor(c.name);
        for (const k of ["start", "move", "cue"]) assert.ok(full[k], `${c.name} has ${k}`);
        assert.ok(full.muscles?.primary?.length, `${c.name} has muscles`);
        assert.ok(c.seconds >= 6 && c.seconds <= 10, "6–10 s loop");
    }
    assert.equal(clipFor("back squat")?.id, "barbell-back-squat");
    assert.equal(clipFor("Pull-Ups")?.id, "pull-up");
    assert.equal(clipFor("Pushups")?.id, "push-up", "the figure's own names find the clip too");
    assert.equal(clipFor("Squat"), null, "a plain squat stays the bodyweight figure");
    assert.equal(hasHowTo("Barbell Back Squat"), true);
    assert.equal(hasHowTo("Pull Ups"), true);
    assert.deepEqual(musclesFor("Pull-Ups").primary, ["lats"]);
});
