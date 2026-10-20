# Southbound Performance: exercise demo system plan (2026-10-20)

Stage A audit + the plan for stages B–E. Built on what already works in `lab/demo3d/`. Nothing here changes the app until the squat passes review.

## 1. What we already have (Southbound)

| Piece | Where | State |
|---|---|---|
| 3D athletes, male + female (MakeHuman CC0 via MPFB2, Southbound kit, shoes, hair) | `lab/demo3d/tools/build_athletes.py` -> `assets/athlete-*.glb` (3.4 / 4.0 MB) | Working. Muscle definition is weak (no normal map), faces a bit flat. |
| Motion: our own IK, solved per frame | `tools/rig.js`, `tools/motions/squat.js`, `pushup.js` -> `*.motion.glb` (~100–140 KB) | Working. Feet planted exactly (measured per frame), QA passes. Not mocap. |
| Movement QA | `qa.js` (+ `tests/demo3d.test.mjs`) | Squat: planted, depth, knees out, lean, balance, speed. Push-up: body line, planted, depth, elbows. |
| Player | `demo3d.js`, `catalog.js`, `exercises.json`, `gym.js` | Play/pause, male/female, views, 0.5×, drag to turn, lazy Three.js, disposal, Reduce Motion, fallback, garage gym. |
| Browser check | `tools/check.mjs` | 28 checks at 1280 and 390 px. |
| App today | `js/exerciseDemoSheet.js` (How to sheet), `js/exerciseDemos.js` (14 drawn figures), `videos/` (4 mannequin clips), `js/muscleMap.js`, `js/exerciseMuscles.js` | Unchanged by this plan until review. |

## 2. External projects: what is reusable

| Project | Licence (checked in the repo) | Verdict |
|---|---|---|
| **OpenGym3D** (`AssiamahS/opengym3d`) | Code MIT. Its assets are listed one by one in `assets/ASSET_LIBRARY.json`. | **Reuse ideas and code, not its motions.** Its 36 unit tests pass here. Worth porting: `qa_glb.py` checks (bone-length drift, roll flips between frames, root pops, loop closure, hand-to-implement gap), the asset-library-as-data idea, `video_mocap.py` (MediaPipe phone capture -> per-bone directions), `motion.py` CMU / Mesh2Motion adapters. **Not usable:** its squat and 18 other motions are Mixamo (Adobe terms, not redistributable); its "video" squat comes from a YouTube clip (no rights). I ran `qa_glb.py` on our squat: it passed but skipped every limb check because it expects MakeHuman bone names, so it needs a bone map before it means anything. |
| **Mesh2Motion** app + assets | Code MIT, all art CC0 | **Push-up and jumping jacks only.** The human packs (178 clips) have no squat, lunge, row or press. OpenGym3D rates the push-up 6/10 (1.5 s). Its characters are stylised low-poly, below our athletes. Useful as a CC0 motion source for a few moves and for the retarget approach. |
| **cc-blender-skill** (`RobLe3`) | MIT | Needs a Blender MCP backend (official Blender Lab MCP wants Blender 5.1+). We drive Blender 4.5 headless with scripts instead (same Python API, repeatable in CI). Its lighting / material / validation notes are worth reading; nothing to vendor. |
| **MPFB2** | Add-on GPL-3.0 (a tool, never shipped). MakeHuman base mesh, targets, rigs, skins, clothes: CC0. | **Already our base.** Has muscle and weight sliders and muscle proxy meshes (`male_muscle_13290`, `female_muscle_13442`). Ships no skin normal maps: muscle detail has to be made. |
| **Z-Anatomy** | CC-BY-SA-4.0 (share-alike) | **Reference only.** We use it to look up muscle placement and names. None of its meshes, textures or derivatives go into Southbound. |
| **CMU mocap** (found through OpenGym3D) | "Free for all uses, may be included in commercially-sold products, may not be resold directly" | **Usable as a reference** for our squat: real squats in trials 13_29 and 13_30 to compare joint ranges and tempo. Credit goes in `LICENSES.md` only. |
| **Three.js r160** | MIT | Already vendored. GLTFLoader, AnimationMixer, disposal as now. |

## 3. What this environment can run (checked)

- Blender 4.5.11 headless, MPFB2 and the CC0 MakeHuman assets: yes (builds both athletes in about 50 s).
- Cycles on CPU, for normal-map bakes: yes (no GPU, so bakes are slow but fine).
- Chromium + Playwright with software WebGL: yes (all renders, GIFs and browser checks).
- pip can reach MediaPipe 1.1.1: yes, so the phone-video lane is possible.
- Blender MCP server: no. It isn't needed; scripts do the same work and are repeatable.
- Real phone GPU timing: no. Only Eddie's phone can confirm the frame rate.

## 4. The plan

**Stage B: characters.**
1. **Muscle definition** by a normal-map bake. Take a high-detail copy of each athlete (subdivided, muscle and definition sliders pushed further) and bake its surface detail onto the shipped body as a normal map. The shipped proportions stay the same while the shading gets real contours: delts, chest, abs, quads, calves. Detail is kept moderate, not bodybuilder.
2. **Skin:** add a roughness map and slightly warmer shading on the light side. Keep it subtle to avoid a plastic look.
3. **Fixed spec for both athletes:** height, scale, rig, materials, light rig, camera framing per view and export settings, all written into `README.md`.

**Stage C: the squat as the benchmark.**
1. **Motion source.** Keep our IK squat, which already has exact foot contact. Check it against real CMU squats (knee, hip and ankle angle ranges, timing, how the hips and chest move together) and adjust where it differs. The best source would be Eddie filming one clean squat from the side on his phone. The MediaPipe lane turns that into our own coach-verified motion, and the IK keeps the feet planted.
2. **Phases:** mark down / bottom / up / top in the clip, so the player can name the phase and the QA can check the order.
3. **QA:** add bone-length drift, roll flips, loop closure and root pops (ported from OpenGym3D with our bone names), plus a camera check that the knees, hips and feet stay in frame.
4. **Player:** add replay, a phase label, and optional **muscle highlight**. Highlighting tints the body by skin-weight areas for the exercise's primary and secondary muscles, using the same muscle list as `js/exerciseMuscles.js`. It is labelled as "muscles worked", never as activation data.

**Stage D: integration.** One `mountDemo3D` component, unchanged API, on a test route (`lab/demo3d/`). The app's How to sheet gets it behind a flag only after review.

**Stage E: validation.** Movement QA, Playwright (loads, plays, loops, desktop + phone, no page errors, frame-time budget in software WebGL), and a screenshot sheet for review. Then a person signs it off in `exercises.json` (`status: ready`). After that comes expansion to push-up, lunge, row, press and plank.

**Schema** (`exercises.json`, extended): id, name, category, equipment, models + motions per sex, muscles {primary, secondary}, views + default, phases, seconds/reps, steps/cues, sources (licence per file), qa + browser status, review {by, date}.

**Asset registry:** `lab/demo3d/assets/REGISTRY.json`. One row per file, with source, licence, changes made and approval. A test fails when a shipped file has no row.

## 5. Smallest next step

The muscle-definition normal bake on both athletes, judged with before/after close-ups. It is the biggest visible gap and touches only the build script. Next: compare the squat against CMU squat data.

## 6. Squat versus real motion capture (2026-10-20)
CMU trial 13_29 (a person doing repeated bodyweight squats, 120 fps): knee bend at the bottom 121–124°, hip bend about 100–105°, lower back about 23–27° (upper back about 9–10°), ankle within about ±10°, each rep 1.7–2.4 s, down and up about equal (0.8 s each, no pause: an athletic rhythm).
Ours (both athletes): knee bend 119–121°, torso lean 28° (male) and 37° (female) from vertical, rep 3.2 s with about 1.3 s down, a short pause and about 1.2 s up. The depth and knee bend match real squats; the tempo is deliberately slower so the movement is readable. Checks added to `qa.js`: phase order, a lowering and a standing phase of at least a second, knee bend 100–135° (real squats 121–124), limb length drift (3% of the bone) and loop closure. Phases (Stand / Down / Bottom / Up) are in `exercises.json` and shown on the player, which also has Replay.
