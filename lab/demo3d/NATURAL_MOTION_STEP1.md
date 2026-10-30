# Step 1 — Natural Motion — Branch-Only Work Package — Oct 30, 2026

**Branch only. No merge, no PR, no production change until Eddie approves a merge separately.**
**Proposed branch (from main, not from the 154-behind demo branch): `muse/demo-natural-motion-step1`**
**Scope: squat + push-up only (the two exercises on main). The other four exercises get the same treatment after this step proves out.**

## Why it looked robotic (from reading the actual motion code)

Every joint is driven by ONE curve, `repCurve`, with the same cosine ease. Hips, chest, arms and head all start, stop and turn around at exactly the same instant, at the same speed, and every rep is byte-identical. There is no breath, no weight shift, no secondary motion, and no difference between rep 1 and rep 2. The gym setting looked human enough because it is a static set — the figure is the only thing moving, and it moves like a machine.

That is a timing problem first, a model problem second. Swapping the model (MetaHuman, Mixamo, a new body) would keep the same single-curve timing and still look robotic, just prettier. So Step 1 fixes timing and secondary motion, and leaves the model alone.

## What Step 1 changes

New file `lab/demo3d/tools/motion-natural.js` (pure helpers, no assets):
- `staggerCurve(u, delay, curve)` — shifts a joint's curve behind the hips by 4–12% of a rep, blending back at the ends so start/bottom positions and the loop are unchanged.
- `breathFromCurve(u, phases)` — inhale on the lowering, held at the bottom, exhale on the lift. Applied as 1–3 degrees of chest/head rotation, never a scale change.
- `sway(t, reps, amp)` — lateral hip sway, 6 mm, periodic over the whole clip (0 at t = 0 and t = 1).
- `repVar(t, amp)` — 1.5–2% variation across the clip, returning to exactly 1 at t = 1, so reps differ without breaking the loop.
- `settle(u, boundary, amp)` — tiny extra dip just after a turnaround (available, not yet used — Step 2 candidate).

Modified files:
- `lab/demo3d/tools/motions/squat.js` — hips lead, chest follows 6% behind, arms lag 12% behind, head 3% behind; breath opens the chest ~2 degrees on the lift; 6 mm sway; 1.5% depth variation.
- `lab/demo3d/tools/motions/pushup.js` — body still moves as one rigid line (as it should), but with whole-body sway and a breathing head (gaze lifts ~3 degrees on the press); 1.5% depth variation. `straightBody` takes an optional sway offset.
- `lab/demo3d/tools/demo3d.js` (separate, documented fix) — pixel ratio capped at the documented 1.5 instead of the code's current up-to-2.5×, so a phone is not rendering ~2.8× the documented pixels. This is a performance fix, not a motion fix, and it should be tested on the phone alongside the motion.

Not changed in Step 1: the athlete models, the gym, the player controls, exercises.json (except any defaults Eddie separately approves), the other four exercises, the app, or any production page.

## Helper checks already run (local, Oct 30, 2026)

- Stagger endpoints: staggered(0) = 0, staggered(1) = 0 — start/bottom unchanged.
- Stagger actually separates joints mid-rep: at u = 0.28, base curve 0.500, 6% stagger 0.273, 12% stagger 0.095.
- Breath: 0.15 lowering, 0.50 at bottom, 0.75 lifting — correct direction.
- Sway and repVar: both return to their start values at t = 1 (loop seamless).
- Smoothness: max per-sample step in the staggered curve over 1000 samples = 0.0044 (no pops from the stagger blend).
- Syntax: motion-natural.js, squat.js, pushup.js all pass `node --check`.

## Acceptance before any merge (must all pass, in Claude with the bake tools)

1. `node lab/demo3d/tools/bake.mjs` for squat and push-up on both athletes (motion files are baked, not hand-edited into assets).
2. `node lab/demo3d/tools/qa.mjs` — squat and push-up graders pass on both athletes (feet planted, thighs parallel, mass over feet, straight push-up line, joint speed under 1.5 m/s). If a grader fails, reduce sway/breath/repVar amplitude first — do not weaken the grader.
3. Browser check at 1280px and 390px: loads, plays, pauses, Male/Female, angles, 0.5×, drag, Reduce Motion, fallbacks, 44px taps, no sideways scroll.
4. **Real-phone watch test (Eddie):** lab page on his iPhone, squat and push-up, both athletes, side view, full and half speed. Pass = it no longer reads as one rigid machine — joints arrive in sequence, the chest breathes, reps are not identical — and no stutter after the pixel-ratio fix.
5. Static tests: `node --test tests/demo3d.test.mjs`.

If 2 or 4 fails, Step 1 is revised on the branch — it is not merged on the strength of the helper math above.

## Step 2 (not started — only after Step 1 passes)

- Apply the same stagger/breath/sway layer to lunge, row, press, plank (carried forward from the demo branch onto main first — do not merge the 154-behind branch whole).
- Per-exercise secondary motion: scapular movement on row/press, ankle/toe articulation on lunge, hip hinge timing on row.
- Then, and only then, judge whether the model itself needs work (skin detail, hair) — with phone evidence, not desktop screenshots.
- Mocap retargeting (CMU data as reference, own motion as the shipped motion, as the squat already does) is a Step 3 candidate, not a Step 1 shortcut: it would replace the IK timing system, not tune it.
