# Southbound 3D exercise demos (lab prototype)

Free, branded 3D demonstrations: a male and a female athlete in Southbound kit doing the exercise in a smooth loop, with play/pause, Male/Female, 3/4 · Side · Front, half speed and drag-to-turn. Everything plays from our own site: no paid service, no account, nothing fetched from anyone else. Licences: `LICENSES.md`.

**Status:** a prototype in `lab/` with two exercises (bodyweight squat, push-up; `?demo=push-up` on the lab page). It is not linked from the app, not in the service worker's precache, and doesn't change any production page. Open `/lab/demo3d/` on the site (or a local server) to see it.

## How it fits together

```
tools/build_athletes.py  (Blender + MPFB, once)   ->  athlete-male.glb, athlete-female.glb   (bodies, kit, rig; no motion)
tools/motions/<name>.js  (our own motion)          \
tools/bake.mjs + bake.html (headless Chromium)      ->  assets/athlete-<sex>.glb               (the athlete, once, shared)
                                                     ->  assets/<exercise>-<sex>.motion.glb     (the looping clip, about 100–150 KB)
                                                     ->  /tmp/demo3d-review/*.png, *.track.json (review frames, joint paths)
tools/qa.mjs + qa.js     (movement checks)          ->  assets/<exercise>-<sex>.qa.json
exercises.json           (metadata, status, review) ->  demo3d.js (player)  ->  index.html (lab page)
```

- **Player (`demo3d.js`)**: loads Three.js only when a demo opens; plays the clip baked into the GLB with an `AnimationMixer`. Pixel ratio capped at 1.5; nothing draws while paused, off screen or in a hidden tab; everything is disposed on close. Reduce Motion starts it paused at the bottom of the rep. With no WebGL, a model that fails to load or a lost graphics context, it calls `onFallback(reason)` and the page shows the drawn figure (`js/demoFigure.js`), the app's existing fallback.
- **Catalog (`catalog.js`, pure)**: finds a demo by name or alias, decides what's playable, picks the athlete and the view, and places the camera to fit the body on any screen shape.
- **Athletes**: built once, reused for every exercise. Each bake adds only the motion. The kit (crew-neck tee with the Southbound mark on the chest, shorts for the male, leggings for the female, full coverage, no bare midriff) is generated from the body's own surface, so it moves exactly like the skin and its hems and neckline are clean cuts; the body underneath is hidden where the kit covers it.

## Quality review: when a demo is "ready"

A demo reaches clients only when **both** are true. `tests/demo3d.test.mjs` fails if `exercises.json` marks one "ready" without them.

1. **Automatic movement checks** pass for both athletes (`node lab/demo3d/tools/qa.mjs`). For the squat: feet stay planted (no slide, heels down), thighs about parallel at the bottom, the hips really travel, knees no narrower than the feet, torso lean under 50°, body mass over the feet, and no joint faster than 1.5 m/s (catches pops and IK flips) with a seamless loop. Each new exercise needs its own grader in `qa.js` (`GRADERS`).
2. **A person watches it** (Eddie, or a coach he trusts) at full and half speed from all three angles, male and female, and checks: the movement is how he'd coach it, nothing clips or flickers, the face, hands and feet look right. Then in `exercises.json` set `"status": "ready"` and `"review": { "approvedBy": "<name>", "approvedOn": "YYYY-MM-DD", "notes": "…" }`.

Until then the status is `"review"`: the lab page shows it with an "In review" badge; the app never would.

## Rebuilding (needs Blender, only on a build machine)

1. Blender 4.5 LTS, the MPFB 2 extension, the MakeHuman system asset pack (CC0) in MPFB's user data folder.
2. `blender -b -noaudio -P lab/demo3d/tools/build_athletes.py -- /tmp/athletes`
3. `node lab/demo3d/tools/bake.mjs /tmp/athletes squat /tmp/demo3d-review` (writes `assets/`, review frames and joint paths)
4. `node lab/demo3d/tools/qa.mjs` and look at the review frames.
5. `node lab/demo3d/tools/check.mjs` (browser check: loads, plays, pauses, Male/Female, angles, speed, drag, Reduce Motion, no-WebGL and failed-model fallbacks, 44px taps, no sideways scroll, at 1280px and 390px).
6. `node --test tests/demo3d.test.mjs`

## Adding an exercise

1. Write `tools/motions/<name>.js` (`setup(rig)`, `pose(rig, t)` with t from 0 to 1 over the loop): world-space targets for the hips, chest, hands and feet, solved by `tools/rig.js`. Register it in `tools/motions/index.js` and in the `ID` map of `tools/bake.mjs`.
2. Equipment (bar, dumbbells, bench, pull-up bar) is a simple prop added in `bake.html` and attached to the hand bones, so it's baked into the same GLB.
3. Add a grader to `qa.js` with that exercise's rules (for a push-up: straight body line, chest near the floor, elbows under 60° from the body; for a pull-up: chin over the bar, full hang).
4. Bake, check, add the entry to `exercises.json` with `"status": "review"`, then the person's review.

Floor exercises set their own camera framing with `"stage": {"height", "span", "centerY"}` in `exercises.json` (the standing default measures the head bone). The push-up grader (`gradePushup`) checks a straight shoulder-hip-ankle line, planted hands and toes, chest to about a fist off the floor, elbows bent at the bottom and nearly straight at the top, and no pops.

## Known limits of the prototype

- The athlete files are 3.4 MB (male) and 4.0 MB (female), downloaded once and cached; each exercise adds only a 100–150 KB motion file.
- Hair is a cut-out card (no strands); skin is a single texture with no detail maps. Good on a phone, not film quality.
- Tested in headless Chromium with software graphics. Needs a pass on a real iPhone and an Android phone before it ships.

## The gym
`gym.js` builds the garage gym (rubber floor, forest walls, rack, dumbbells, bench, mirror, Southbound mark) around every demo; `"room": "none"` in `exercises.json` turns it off for one exercise, `"floorMat": true` lays a mat (push-ups). Mock-up and GIF renders: `mockups/gym.html?room=garage|studio|performance&demo=...&sex=...&t=...`.
