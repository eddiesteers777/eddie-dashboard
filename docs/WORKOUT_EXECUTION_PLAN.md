# Structured Workouts + Planned vs Actual — audit and plan

Written 2026-10-06 in answer to the "Structured Workout + Planned vs Actual" master prompt (the 4-panel mockup: planned workout, completed overview, detailed analysis, coaching insight). The audit came first; nothing visible changed. Step 1 (the foundation, below) is built and unit-tested but isn't shown anywhere yet.

## 1. Current workout architecture

- **One structured workout shape already exists** and is used everywhere: `day.workout` in `js/runWorkout.js`: `{ warmup, sets: [{ repeat, amount, unit (mi/km/m/min), pace "7:40-7:50", effort, recovery, parts? }], cooldown, why, cue, fuel }`.
  - Clients' coach plans store it directly. The coach builds it with Details (`js/workoutBuilder.js`) or Generate, and it's published in `coachingPlans`.
  - Eddie's marathon plan is text (`js/marathonData.js` + `training-overrides`). `planDayFromMarathon` (`js/marathonCoros.js`) reads that text into the same shape. It already understands his shorthand: `6x600m @ 2:27`, `2min jog`, `1mi @ 7:08`, `2mi WU`, `4x(1mi @ MP, 1mi @ threshold)`, `last 3 @ MP`.
- **Workout ids are stable already.** Eddie's are `marathon|<date>` and clients' are `<planId>|<date>`, both used by `coros-sent`. Activities are `c:<labelId>` (COROS), `s:<k>` (Strava) and `l:<id>` (hand-logged), from `js/athleteLedger.js`.
- **Views of a workout today:**
  - The Marathon page shows a preview in words (`marathonPreview`).
  - The workout page and Workout Mode (`executionSteps`).
  - COROS courses (`courseFromDay`).
  - The calendar export.
- **What a client logs** (`workoutResults`): done or skipped, distance, time, effort, pain and a note. Planned vs actual is only the whole run's average pace (`compareRun`).

## 2. COROS architecture

- `js/corosClient.js` is the only request path.
- Runs come in through `js/corosRuns.js` / `js/corosData.js`, are read by `js/corosParse.js` and are kept compact in `coros-run-history`: labelId, sportType, start, date, distance in meters, duration in seconds, pace and average HR. It holds a year and is cloud-synced.
- **Laps:**
  - `fetchLaps` (`js/trendsData.js`) calls `queryActivityLapData` once per key-workout run, only for the quality, long and race days of Eddie's marathon plan.
  - `parseLaps` (`js/trends.js`) reads them and keeps `{ i, m, s, hr }` per lap in `coros-laps` (the last 80 runs, cloud-synced).
  - COROS sends one group of auto laps (type 10, every mile). When the watch ran a workout, or the lap button was used, it also sends another group. That other group is the one kept.
- **Sending:** `js/corosWorkout.js` / `js/corosSend.js` turn a plan day into a COROS course. Warm-up, work, recovery and cool-down become sections, and repeats become interval groups. Note that a COROS interval group has a recovery after the last rep too.

## 3. Activity / lap data available

| Data | Where | Notes |
|---|---|---|
| Run totals: distance, moving time, avg HR, start | `coros-run-history` | every run, a year |
| Laps: meters, seconds, avg HR | `coros-laps` | key workouts of Eddie's plan only, last 80; **which group (workout vs auto) wasn't saved until this step** |
| Max HR, cadence, elevation, step type per lap | not saved | COROS may send these; we keep only m / s / hr (question 1) |
| GPS / second-by-second streams | not saved | FIT download exists (`queryActivityFitFileDownloadUrls`, daily limit); `js/fitParse.js` already reads FIT laps incl. their `intensity` (active / rest / warm-up / cool-down) |
| Effort 1–10 | `session-rpe` (CR-10) | per run |
| Clients' laps | not available to the coach | clients' COROS data stays on their device; `sharedAthleteModel` carries run totals only |

## 4. What already works (kept, not rebuilt)

- The workout schema, the marathon text reader (it handles the success example exactly, see the tests), the COROS course builder and the stable ids.
- Lap fetching and storage, the keyWorkouts list, Analytics' Key workouts panel with its lap table.
- `checkWorkout`'s on-target / fast / slow counts. They feed `executionSummary`, readiness's outcome check, P4's plan vs actual and Weekly Review.
- Client logging, the workout page, Workout Mode and effort answers.

## 5. What's missing

- **No step-level matching.** `checkWorkout` pools every target in the workout into one pace range (600s @ 6:34 and the threshold mile @ 7:08 become one band from 6:34 to 7:08). It then calls any lap faster than the band + 20 s/mi "work". So a 600 at 7:00 counts as on target, the threshold mile isn't separated from the reps, and a missed rep isn't counted.
- **Rep times were lost to rounding.** `8x800 @ 2:55` and `6x600 @ 2:27` became a rounded pace per mile. Fixed in step 1: `repTime` is kept.
- Which lap group a run's laps came from wasn't saved. Fixed in step 1 (`kind`).
- No missed or partial reps, no completion separate from execution, no match confidence, no rep table, no Southbound Read.
- Clients: no laps at all on the coach's side.

## 6. Schema (the WorkoutExecution)

There is no new workout schema: the existing `day.workout` is the plan, unchanged. The execution is **derived, never stored**. It is computed from the plan plus the saved laps when a view needs it, so COROS's data is never changed and the workout and the laps can't drift apart.

```
WorkoutExecution {
  version, plannedWorkoutId ("marathon|2026-10-13"), activityId ("c:<labelId>"),
  source { laps, kind: "laps" | "auto" | null },
  matchConfidence: "exact" | "approximate" | "low" | "unmatched",
  overallStatus: "completed" | "partial" | "missed" | "unknown",
  completion { planned, done, partial, missed, unobserved, pct, text: "5/6 reps completed, 1 cut short · 1 mi done" },
  targetCompliance { judged, within, fast, slow, pct },
  steps [{ id ("wu", "s1.r3", "s1.r3.rec", "s2.r1.p2", "cd"), kind (warmup / work / recovery / easy / cooldown),
           set, rep, of, label, distanceM | durationSec, target {lo,hi} s/mi, repTime {lo,hi} s, optional,
           lapIndexes, actual { meters, seconds, hr, paceSec }, ratio, status (done / partial / missed / unobserved / skipped),
           normalizedSec, deltaSec, deltaPace, verdict (within / fast / slow / null), matchConfidence, notes }],
  sets [{ label "6 × 600 m", target "2:27", planned, done, partial, missed, within, fast, slow,
          avgSec, avgDelta, spreadSec, fastest, slowest, fadeSec, avgHr }],
  extras [lap numbers nobody claimed], read [plain sentences]
}
```

## 7. Matching strategy

- `plannedSteps` lists the laps the watch should make, in order. Every recovery is its own step. The recovery after the last rep is *optional*: COROS runs one, but Southbound's plan doesn't count it.
- An order-keeping alignment (dynamic programming) assigns laps to steps. A step can take 0 laps (missed), 1 lap, or 2–3 consecutive laps (an extra lap press, which reduces confidence). A lap can also be left over.
- How well a step and a lap fit is scored on:
  - how close the lap's distance (for distance steps) or time (for timed steps) is to the step's, on a log scale;
  - its pace against the step's target, with 6% free;
  - whether a recovery lap is faster than the rep before it (a sign it's really a rep).
- **No lap is assumed to be a step by its number.** In the tests, the reps are found at laps 2, 4, 6 and so on because they fit, not because of their position.
- **Auto mile laps:** a step is matched only when it covers whole laps (a 2 mi warm-up, a last-3-miles finish), and a position cost keeps it where the plan puts it. Short reps are **unobserved**, never "missed", and the whole result is `low` with `overallStatus: "unknown"`. Old saved laps without a `kind` are read from their shape: every lap about a mile or a km = auto.
- **Confidence:**
  - exact: workout laps, every step within 3%, nothing missing or joined.
  - approximate: GPS or lap-press drift up to 10%, a joined or extra lap, or a missed or cut-short step.
  - low: auto laps, or a poor overall fit.
  - unmatched: no laps, or nothing found.

## 8. Comparison math

- **Durations, never rounded paces.** A distance rep's time is normalized to the planned distance from the lap's own numbers: `seconds × planned meters ÷ lap meters`. 620 m in 148 s is 143.2 s for 600 m.
- That time is compared with the rep time as written (`2:27`), else with the pace range × the distance.
- **Ranges stay ranges.** Inside the range the difference is 0. Outside it, the difference is measured from the nearer end; there's no made-up midpoint. 7:01 within 6:58–7:05 = within; 6:52 = 6 s/mi fast.
- **Negative = faster.** Within target means within 5 s/mi on pace (`TOLERANCE`, about 1.9 s on a 600). Timed reps compare pace.
- A partial step (under 90% of its distance or time) counts toward completion by its share and is **not judged on pace**.
- **Completion and execution are separate numbers.** Running faster than the target is "fast", off target. The Read says "Faster than the target isn't better here" when most misses are fast.
- Per set: average rep, average difference, spread (fastest to slowest), fastest and slowest rep, fade (second half vs first half) and average HR.

## 9. Proposed UI (Southbound's design system, not COROS's)

- **Planned** (workout page / Marathon day): the existing steps list, plus the target per step and the "why" and cue already in the schema.
- **Completed** (a "How it went" card on the workout page, and the Key workouts row on Analytics):
  - completion ring and target-compliance number, side by side, labelled separately;
  - the Southbound Read lines;
  - a step strip coloured by verdict (done, within / fast / slow, missed, unobserved);
  - the rep table (Rep · Target · Actual · Δ · Result). On phones each rep becomes a stacked card and there's no sideways scroll;
  - recoveries folded under their rep (time and HR drop);
  - the match-confidence chip with a line saying why.
- **Weekly Review / P4:** the key-session line uses the execution: "Tue: 6 × 600 m — 6/6, avg 2:25.3 (target 2:27), 3 within, 3 fast · 1 mi 7:06 within".
- **Analytics:** `executionSummary` moves onto the execution (on-target counts per step, not per pooled lap), so readiness's outcome check and P4 become more accurate. Before and after are compared on Eddie's real data first.
- **Future AI:** the brief carries the same `WorkoutExecution` lines. Nothing AI-specific.

## 10. Testing strategy

- **Unit (`tests/workoutExecution.test.mjs`, 10 tests, built):**
  - the success example, exact and rep by rep;
  - GPS distance normalization;
  - a missed rep and a cut-short rep;
  - an extra lap press;
  - auto laps (unobserved, not missed);
  - no laps / no plan;
  - range and timed-rep maths;
  - a mixed repeat;
  - an effort-only rep;
  - lap-group kinds and the text helpers.
- **Next:**
  - fixtures from Eddie's real COROS lap replies (question 1);
  - a browser suite for each view at 390 and 1280 px;
  - the Analytics before/after comparison;
  - every earlier suite re-run (`checkWorkout` callers).

## 11. Phases

1. **Foundation — built:**
   - `js/workoutExecution.js` (pure);
   - `repTime` kept by the marathon reader;
   - `parseLapGroups` + `kind` saved on new `coros-laps` entries;
   - unit tests.
   - Nothing on screen changed. COROS course sending is unchanged (its tests pass).
2. **Completed view for Eddie — built (2026-10-06):** a "How it went" card on Analytics' Key workouts and on the Marathon day (rep table, Read, confidence); `keyWorkouts` carries the whole workout.
3. **Swap the engines over — built (2026-10-06):**
   - `executionSummary` / P4 / Weekly Review read the execution. The before/after on synthetic sessions: the pooled band rated 7 of 7 laps on target where every 600 was 10 s slow; step by step rates 1 of 7. The before/after on Eddie's own laps happens when his next structured workouts come in (his saved laps from before have no `kind`, so they're read from their shape);
   - `checkWorkout` stays for the old lap table until everything has moved.
4. **Clients:**
   - the client's device fetches laps for their coach-plan runs and shows them the same card;
   - the coach sees it only once the client shares it. That's either a field on `workoutResults` or the athlete-model share, **which needs a rules change**.
5. **FIT fallback:** when only auto laps exist, rebuild reps from the FIT distance stream (daily limit, on request).

## 12. Questions for Eddie

1. Next time you run a structured workout sent from Southbound, open Analytics → COROS diagnostic → **Copy one run's details** and paste it to me. That shows the real lap fields COROS sends (step type? max HR? cadence?), so step 2 uses them instead of guessing.
2. Within target: is ±5 s per mile right (about ±2 s on a 600, ±4 s on a 1200)? Or do you want it tighter on short reps?
3. Should the Read ever say "fast" reps are fine, for example in a progression? Or is the target always the target unless the plan says otherwise?
4. Warm-ups and cool-downs: report pace only (my default), or flag them when they're faster than your easy range?
5. For clients, should the coach see rep-by-rep only when they turn on sharing (needs a rules change), or do you want this for your own training first and clients later?
6. Where do you want to see it first: the Marathon page under the day, Analytics' Key workouts, or Today's card after the run?
