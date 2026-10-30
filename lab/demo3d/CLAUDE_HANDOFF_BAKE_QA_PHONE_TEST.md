# Claude Handoff — Bake, QA, and Phone-Test Natural-Motion Step 1 — Oct 30, 2026

**Paste this whole brief into a NEW thread in the personal Claude project "Southbound Coaching — Premium Redesign". Do not paste it into the old "More human exercise demo figure" thread — that thread is waiting on Eddie and its branch is 154 commits behind main.**
**Branch only. Do NOT merge to main, do NOT create a PR, do NOT deploy, until Eddie says "push it" for this specific branch after watching it on his phone.**

## Branch and what is already on it (verified Oct 30, 2026)

- Repo: `eddiesteers777/eddie-dashboard`
- Branch: `muse/demo-natural-motion-step1` (from main)
- Commit a1fc644: `lab/demo3d/tools/motion-natural.js` (new), `lab/demo3d/tools/motions/squat.js` (reworked), `lab/demo3d/tools/motions/pushup.js` (reworked), `lab/demo3d/NATURAL_MOTION_STEP1.md` (spec)
- Commit 44a7691: `lab/demo3d/demo3d.js` — pixel ratio capped at 1.5 (was up to 2.5× on phones; header already documented 1.5)

## What Step 1 is supposed to fix

Eddie's phone test verdict: the demo figure looked human enough in the Southbound gym, but the motion was very robotic and did not move naturally for any movement. Diagnosis from the motion code: every joint was driven by ONE rep curve with the same cosine ease — hips, chest, arms and head starting, stopping and turning together, every rep identical, no breath, no weight shift.

Step 1 fixes timing and secondary motion only, not the model:
- Stagger: hips lead, chest 6% of a rep behind, arms 12% behind, head 3% behind (squat); push-up body moves as one rigid line, with whole-body sway and a breathing head.
- Breath: inhale on the lowering, held at the bottom, exhale on the lift — 2–3 degrees of chest/head rotation, never a scale change.
- Sway: ~6 mm lateral, periodic over the whole clip (0 at t = 0 and t = 1).
- Rep variation: ~1.5% depth difference across the clip, returning to exactly the start at t = 1.
- Start and bottom positions are unchanged. Helper math was checked locally (stagger endpoints 0/0, mid-rep separation 0.500 / 0.273 / 0.095, breath direction correct, loop seamless, max per-sample step 0.0044, syntax OK) — but helper math is NOT proof. The bake, the graders, and Eddie's phone watch are the proof.

## Do these steps, in order, and report each result

### 1. Check out the branch and confirm the files
- Check out `muse/demo-natural-motion-step1`.
- Confirm these files exist on it and match the commits above: `lab/demo3d/tools/motion-natural.js`, `lab/demo3d/tools/motions/squat.js`, `lab/demo3d/tools/motions/pushup.js`, `lab/demo3d/demo3d.js` (pixel ratio line: `Math.min(window.devicePixelRatio || 1, 1.5)`).
- If any file is missing or different, stop and report that — do not recreate the work from memory.

### 2. Bake squat and push-up for both athletes
- Follow `lab/demo3d/README.md` Rebuilding steps: Blender 4.5 LTS + MPFB 2 + MakeHuman CC0 asset pack, then `node lab/demo3d/tools/bake.mjs` for squat and push-up.
- Motion files are baked, never hand-edited into assets. Report the baked motion file sizes and confirm they are in the ~100–150 KB range, like the existing motions.
- Save the review frames and joint paths from the bake for step 4.

### 3. Run the QA graders — do not weaken them
- Run `node lab/demo3d/tools/qa.mjs` for squat and push-up, both athletes.
- Squat must still pass: feet planted (no slide, heels down), thighs about parallel at the bottom, hips really travel, knees no narrower than the feet, torso lean under 50°, body mass over the feet, no joint faster than 1.5 m/s, seamless loop.
- Push-up must still pass: straight shoulder-hip-ankle line, planted hands and toes, chest about a fist off the floor, elbows under 60° from the body, no pops.
- If a grader fails, FIRST reduce sway / breath / rep-variation amplitude in the motion files and re-bake. Do NOT change the grader thresholds, and do NOT mark anything "ready" with a failing grader — `tests/demo3d.test.mjs` enforces that a "ready" entry has both automatic checks and human review.

### 4. Browser check (the README's own check)
- Run `node lab/demo3d/tools/check.mjs`: loads, plays, pauses, Male/Female, angles, 0.5×, drag, Reduce Motion, no-WebGL and failed-model fallbacks, 44px taps, no sideways scroll, at 1280px and 390px.
- Run `node --test tests/demo3d.test.mjs`.
- Report every failure by name. A passing helper-math check from Muse does not replace this step.

### 5. Prepare Eddie's phone test (do not test on his phone yourself)
- Serve the branch's lab page so Eddie can open `/lab/demo3d/` on his iPhone (or give him the exact local/preview steps he needs — do not deploy it to the live site to do this).
- Give him this exact checklist, and ask him to answer each line:
  1. Squat, male, side view, full speed: do the joints arrive in sequence (hips, then chest, then arms) instead of all at once?
  2. Squat, female, side view, half speed: does the chest breathe on the lift?
  3. Push-up, either athlete, side view: does it still read as one straight line, with a breathing head — or does the sway bend it?
  4. Play the same exercise twice in a row: are the reps visibly non-identical, or still identical?
  5. Any stutter, heat, or slow load on the phone after the 1.5× pixel-ratio cap?
  6. Any dark specks back on skin edges at 1.5×? (The old supersampling was there to avoid specks — if specks return, report it; the fix is antialiasing at 1.5×, NOT going back to 2.5×.)
  7. Overall: does it stop reading as "very robotic", or is it still robotic — and if still robotic, which joint or moment looks worst?
- Until Eddie answers that checklist, the six exercises stay "review" in exercises.json (approvedBy / approvedOn null). Do NOT flip any entry to "ready" on the strength of the bake or the graders alone.

## Guardrails (do not break these for any reason)

- Work ONLY on `muse/demo-natural-motion-step1`. Do not touch main, do not touch the old demo branch `claude/project-thread-8k07lh`, do not merge, do not create a PR, do not deploy.
- Do not change the athlete models, the gym, the player controls, or exercises.json statuses — except amplitude tuning in the two motion files if a grader fails, with the change and the reason reported.
- Do not swap the model (no MetaHuman, Mixamo, Ready Player Me, or Z-Anatomy in the shipped demo), do not copy any third-party video, GIF, or asset, and do not weaken any QA grader.
- Do not apply this layer to lunge, row, press, or plank in this thread. That is Step 2, and it starts only after Step 1 passes steps 2–5 above.
- If the bake tools, Blender, or MPFB are unavailable in this thread, say so plainly and stop — do not claim the bake passed without running it.

## What to report back (in one message, at the end)

1. Branch checked out: yes/no, and the commit you worked from.
2. Bake: squat + push-up, both athletes — pass/fail, motion file sizes, review frames location.
3. QA: squat + push-up, both athletes — pass/fail per grader, and any amplitude change made with its reason.
4. Browser check + static tests: pass/fail per check.
5. Eddie's phone checklist: ready for him to answer (with the serving/preview steps), or his answers if he has already given them.
6. Your recommendation: ready for Eddie's phone test, needs another amplitude pass on the branch, or Step 1 does not fix the robotic read (and what you think the next motion change should be).
