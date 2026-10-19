# 3D demos: what's in here and the licence for each part

Checked 2026-10-18. Everything that ships (the files under `lab/demo3d/` except `tools/`) is either ours or under a licence that allows commercial use with no fee, no account and no per-play service. Re-check this file before adding any asset.

## Shipped with the site

| File(s) | What | Source | Licence | What we must do |
|---|---|---|---|---|
| `assets/bodyweight-squat-male.glb`, `assets/bodyweight-squat-female.glb`, `assets/push-up-male.glb`, `assets/push-up-female.glb` | The two athletes with the squat or the push-up baked in | Bodies, skins, hair, brows, lashes, eyes and clothes: the MakeHuman base mesh and **MakeHuman system assets** (`young_caucasian_male`/`female` skins, `short02` and `ponytail01` hair, `eyebrow001`, `eyelashes01`, `low-poly` eyes, `shoes05`), generated with **MPFB 2.0.16** in Blender 4.5 LTS. The rig is MPFB's built-in Mixamo-compatible rig (MPFB data, not Adobe's). The tees, shorts and leggings are not MakeHuman clothes: `tools/build_athletes.py` generates them from the athlete's own body surface (ours), and the chest logo is Southbound's own mark (`tools/art/sb-logo.png`, rendered from `brand/sb-mark.svg`). | **CC0 1.0** (public domain dedication). Every one of these assets is listed as CC0 in the pack's `makehuman_system_assets.json`, each file carries "explicitly released as CC0", and makehumancommunity.org's licence page says models made with MakeHuman/MPFB are the user's, with no licence obligations. MPFB's *code* is GPL-3; it ran only on our build machine and none of it ships. | Nothing required. We credit MakeHuman anyway (README). |
| The squat and push-up motions inside those GLBs | Our own movement, posed by inverse kinematics in `tools/motions/squat.js` and `pushup.js` and baked frame by frame | Written for Southbound | Ours | — |
| `vendor/three/three.module.min.js`, `vendor/three/addons/loaders/GLTFLoader.js`, `vendor/three/addons/utils/BufferGeometryUtils.js` | Three.js r160, the 3D engine that plays the demos | github.com/mrdoob/three.js | **MIT** | Keep `vendor/three/LICENSE` with the files (done). The two addons were changed only to import the minified build by relative path. |
| `demo3d.js`, `catalog.js`, `qa.js`, `demo3d.css`, `index.html`, `exercises.json` | Player, catalog, movement checks, lab page | Written for Southbound | Ours | — |
| The step text in `exercises.json` | Start / Move / Cue | Copied from our own `js/exerciseDemos.js` | Ours | — |

## Build tools only (in `tools/`, never served to clients)

| File | Licence |
|---|---|
| `tools/three-exporter/` (GLTFExporter, TextureUtils from Three.js r160) | MIT, as above |
| `tools/rig.js` | Ours (copied from `scripts/build-clips/rig.js`) |
| `tools/build_athletes.py` | Ours. The approach (MPFB's `HumanService`, macro sliders, a built-in rig) is adapted from OpenGym3D's `create_human()`, MIT, © 2026 SylvesterAssiamahGK, github.com/AssiamahS/opengym3d. Credited in the file. No OpenGym3D code or asset ships. |
| Blender 4.5 LTS, MPFB 2 extension, the MakeHuman asset pack | Installed on the build machine only (GPL tools, CC0 assets). Not in the repository. |

## Looked at and not used

| Source | Why not |
|---|---|
| OpenGym3D's own squat motion | Extracted from a video that is licensed for non-commercial use only. |
| Mixamo animations (Adobe) | Free, but the licence ties use to Adobe's terms and an Adobe account, and doesn't allow redistributing the raw files. We want no account dependency. |
| CMU motion-capture database | Free to use, but it may not be resold as motion data, and it has no clean bodyweight squat; adapting it was more work than writing the motion. |
| Mesh2Motion clips | CC0 and good, but no squat (or other gym exercise) yet. Worth checking again for future exercises. |
| Ready Player Me avatars | The body is cut away under the outfit, so we couldn't re-dress it in Southbound kit; their terms also tie use to their service. |
| MuscleWiki videos | Real people and very good, but a paid API (see `.claude/skills/exercise-demo-integration/SKILL.md`). |
