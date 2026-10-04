# Southbound Athlete Model — planning document

Working name only. Status (2026-10-04): **Phase 1 (current-state audit) done, questions to Eddie open.** Phase 2 (research review), Phase 3 (model design), Phase 4 (validation plan) and Phase 5 (implementation plan) come after his answers. No code has changed for this yet.

Read with `CLAUDE.md`. Everything below was checked against the code on `main` at `8b8a1db`, not against earlier summaries.

---

## Phase 1 — Current Southbound audit

### 1.1 The short version

Southbound already collects a lot of what a serious athlete model needs, but it is **scattered across three places that can't see each other**, and the only "model" math in the app is a handful of single-purpose formulas tuned to Eddie:

- **The coach can read** the plan (with structured workouts), every logged plan workout (distance, time, RPE, pain), weekly check-ins (energy / recovery / motivation), the client profile, and three small COROS summaries the client chooses to share (28 days, at most 8 runs or 8 nights each).
- **The client's own private data** (readable only by that client, never by the coach) holds the real history: up to ~400 days of COROS runs with heart rate, COROS's daily fitness numbers, ~400 days of sleep / HRV / resting HR, the morning check-in, the running log.
- **Eddie's own private data** holds the richest set by far: the same COROS history plus his Strava archive back to 2016, FIT-file fastest efforts, lap data for his key workouts, and his marathon plan.

There is no server (Spark plan), so **whatever computes the model has to run in someone's browser**, on data that browser is allowed to read. That single fact decides most of the architecture (see 1.8).

### 1.2 Where every relevant piece of data lives

| Data | Where | Who can read | History kept | Tier |
|---|---|---|---|---|
| Logged plan workout: status, distance (mi), duration (s), RPE 1–10 (optional), pain + note, note, planned miles, title | `workoutResults/{client}_{plan}_{date}` (`js/workoutResults.js`) | client + linked coach | forever | 1 |
| Logged strength session: exercises × sets (weight, reps), RPE, pain | `workoutResults/…_strength` | client + linked coach | forever | 1 |
| The prescription: day type, miles, structured run (warm-up, reps × distance/time @ pace or effort word, recoveries, cool-down), strength session | `coachingPlanMasters` (whole) / `coachingPlans/…/versions` (2 weeks) | coach (master); client (versions) | forever, versioned | 1 |
| Weekly check-in: rating, energy / recovery / motivation 1–5, pain + where, notes, week snapshot | `checkins/{client}_{week}` | client + coach | forever | 1 |
| Soccer session attendance + notes | `sessionLogs` | client + coach | forever | 1 |
| Profile: birth year, weekly miles, runs/week, longest run, years running, run-non-stop ability, event type + date, goal text, injuries + areas + status, health check | `clientRecords/{client}` | client + coach | current values + confirmation dates | 1 |
| COROS runs: date, start, distance, duration, avg pace, **avg HR**, calories | `coros-run-history` (private sync) | **client only** | 365 fetched, ~400 kept | 2 |
| COROS daily fitness: training load short / long / ratio, recovery %, VO₂max, marathon prediction, threshold pace | `coros-fitness-history` (private) | client only | ~400 days (only days the app was opened) | 2 |
| Sleep (score, asleep, stages, bed/wake), HRV (COROS avg, normal range, baseline, status), resting HR, stress | `coros-health-history` (private) | client only | ~400 days | 2 |
| Morning check-in: soreness / energy / mood 1–5, sick, pain, "yesterday did you…" tags | `readiness-checkins` (private) | client only | all | 1 |
| Daily readiness score | `readiness-history` (private) | client only | recomputed last 8 days | derived |
| Shared activity: 28-day count / miles / time + 8 runs (date, miles, time) | `sharedWearableActivity` | coach, with `activity` consent | rolling 28 days | 2 |
| Shared performance: 28-day avg pace + HR, best pace, VO₂max, threshold, COROS marathon prediction, COROS load short/long/ratio + 8 runs (pace, avg HR) | `sharedWearablePerformance` | coach, with `performance` consent | rolling 28 days | 2 |
| Shared recovery: 28-day averages + 8 days of sleep, HRV, RHR, stress, COROS recovery % | `sharedWearableRecovery` | coach, with `recovery` consent | rolling 28 days | 2 |
| Laps (meters, seconds, avg HR) | `coros-laps` (private) | owner | last 80 runs, **Eddie's marathon key workouts only** | 3 |
| Strava archive: per activity date, start, type, distance, moving + elapsed time, avg + max HR, **climb**, fastest mile / 5K / 10K / half / full inside the run | `strava-history` + `users/{uid}/sync/strava*` | owner (only Eddie uses it; the import is on the coach-only Analytics page) | all years | 2–3 |
| Hand-logged runs | `running-log` (private) | owner | all | 1 |
| Typed personal records | `personal-records` (private) | owner | — | 1 |

Not collected anywhere: **sex**, max HR, resting HR as a setting, threshold HR, heart-rate zones, elevation for COROS runs, per-run COROS training load or training effect, temperature / weather, HR or pace streams (second-by-second), running power or dynamics, and — most important for this project — **which runs were races**.

### 1.3 What is calculated today, and the verdict on each

| Calculation | Code | What it does | Verdict |
|---|---|---|---|
| Readiness 0–100 | `js/readiness.js` | Weighted mean of part scores: HRV 40% (last night vs COROS's range / baseline), resting HR 20% (vs previous 30-day mean, −12 points per bpm above), sleep 25% (duration vs 7h30 need blended 60/40 with COROS sleep score), COROS recovery % 15%, morning feel 15%; sick caps at 30, pain at 55; plain-language parts; advice per workout kind | **Keep the shape, replace the math.** See 1.4 |
| Readiness insights ("alcohol lowers your score 6") | `js/readiness.js` `insights` | Mean body-score with vs without a tag, ≥4 each | **Keep, tighten** (needs a confidence check: 4 vs 4 mornings is noise) |
| Sleep coach | `js/readiness.js` `sleepCoach` | Bedtime from median wake time, 7-day debt | Keep as is (context, not a model input) |
| Aerobic fitness trend | `js/trends.js` `aerobicTrend` | Easy runs (HR 100–155, ≥3 mi) → speed ÷ HR → "pace at 140 bpm", weekly; 4 weeks vs 4 before | **Replace.** See 1.4 |
| Load + ratio | `js/trends.js` `loadTrend` | Weekly miles; last 7 days ÷ (28 days ÷ 4) with labels safe / caution / high (0.8–1.3 "safe band") | **Replace.** Exactly the simplistic ACWR "safe/unsafe" Eddie wants to avoid |
| Plan vs actual | `js/trends.js` `planVsActual`, `js/clientSummary.js` `summarizePlanVsActual` | Planned vs run miles per week | Keep (it's compliance, an input to the model) |
| Key-workout lap check | `js/trends.js` `checkWorkout` | Laps within the plan's pace range, fast / slow counts | **Keep and generalize** (today only Eddie's marathon plan); becomes an "execution" signal |
| Long runs | `js/trends.js` `longRuns` | Each week's longest 10+ mi | Keep as an input (durability lens) |
| Body trends | `js/trends.js` `bodyTrend` / `bodySummary` | 8 weeks of HRV / RHR / sleep / readiness, 7-day vs prior 4 weeks | Keep as display; baselines move into the model |
| Race prediction | `js/trends.js` `predictionTrend` | Plots COROS's marathon prediction by day | **Becomes one input** to an ensemble; never the answer |
| Paces from a goal | `js/coachPlanGenerator.js` `pacesFor` | Riegel exponent 1.06 from the **goal** time → 5K, 10K, threshold, tempo, HM, MP paces | Keep for goal-driven plans; later offer "paces from current capability" |
| VDOT | `js/pace-calculator.js` (non-module, page-only) | Daniels–Gilbert equations, verified at VDOT 50 | **Move into a pure module** and reuse; don't write it twice |
| Personal records | `js/personalRecords.js` | Fastest of typed, Strava in-run efforts, whole runs ≈ distance | Keep; becomes the "best efforts" input to critical speed / power-law fits |
| Fastest efforts in a FIT file | `js/fitParse.js` `bestEfforts` | Fastest mile … marathon inside a run from the distance stream | Keep; extend the same reader for HR / altitude streams |
| Coach Hub progress | `js/clientSummary.js` `summarizeProgress`, `summarizeTrainingTrends` | 28-day / 6-week counts, miles, average RPE | Keep as descriptive; the model sits beside it |
| COROS coach assessment | `js/corosCoach.js` (926 lines) | A composite "assessment" from COROS data + marathon plan | **Delete.** No page loads it (only `sw.js` precaches it) |
| COROS replies → numbers | `js/corosMetrics.js`, `js/corosHealth.js`, `js/corosParse.js`, `js/corosHistory.js` | Reading COROS's text replies | Keep; these are the ingestion layer |

### 1.4 Specific problems in the existing formulas

**Readiness (`js/readiness.js`)**
1. *HRV dominates (40%) and uses one night.* Single-night HRV is noisy; the HRV-guided-training literature works from a rolling (usually 7-day) log-transformed average judged against the athlete's own normal variation. The current part scores last night only, against COROS's own range.
2. *Resting HR penalty is a fixed slope* (−12 points per bpm above the 30-day mean). One bpm means different things for someone whose RHR varies ±1 and someone who varies ±4. It should be a personal z-score.
3. *Sleep counts duration twice.* COROS's sleep score already contains duration, and the part blends duration with that score.
4. *COROS recovery % is itself a training-load model.* Once Southbound has its own load model, adding COROS recovery on top double-counts training stress.
5. *Subjective feel gets only 15%,* although the best-known systematic review on athlete monitoring (Saw et al., 2016) found subjective measures responded to training load at least as reliably as objective ones. To be confirmed in Phase 2.
6. *Weights and thresholds are hand-picked and untested.* Nothing checks whether the score predicts anything (e.g. how a key workout went).

Keep: the parts-with-reasons design, the sick / pain caps, `missingReason`, the advice wording style, the check-in, insights, sleep coach.

**Aerobic trend (`js/trends.js` `aerobicTrend`)**
1. *Speed ÷ HR assumes the heart-rate–speed line goes through zero.* It doesn't (there's a resting-HR intercept), so "pace at 140 bpm" is biased, more so the farther an athlete's easy HR is from 140.
2. *155 bpm and 140 bpm are Eddie's numbers,* hard-coded. They'd be wrong for nearly any client.
3. *Whole-run average HR includes warm-up and cardiac drift,* so long runs and hot days look "less fit". There's no correction for terrain, heat or run type.

**Load (`js/trends.js` `loadTrend`)**
1. *Miles is the only load.* A 6-mile tempo and a 6-mile jog count the same.
2. *The ratio uses rolling sums* (the coupled, sum-based ACWR the methodological critiques target) *and labels it "safe".* Replace with exponentially weighted load reported as "relative to this athlete's normal", no safety label.

**Race prediction**
1. Only COROS's marathon prediction is stored, and only on days the app is opened.
2. Riegel 1.06 is used only to turn a goal into paces; it's never checked against what the athlete has actually run.
3. VDOT lives in the pace calculator's page script, unusable elsewhere.
4. Nothing records a race result, so no prediction can be checked.

**Client-side trends**
- The hub's "Training trends" are counts, miles and average RPE from plan logs only; runs outside the plan never appear. There is no HR-based anything for clients unless they share Performance, and then only 28 days / 8 runs.

### 1.5 What's missing

1. **A race-result record.** Ground truth for calibration and validation. Nothing marks a run as a race today.
2. **One combined session list.** COROS, Strava, FIT, plan logs and the running log are never merged per athlete into one de-duplicated list of sessions (only `combineRuns` merges COROS + Strava, for Eddie).
3. **Athlete physiology settings:** max HR, resting HR baseline, threshold HR / pace, critical speed, with where each came from (measured, estimated, COROS, typed) and when.
4. **Intensity information per session** beyond average HR: time in zones, decoupling, grade. COROS offers laps (`queryActivityLapData`), FIT downloads (`queryActivityFitFileDownloadUrls`, daily limit) and `getActivityDetail` (text with training load, aerobic / anaerobic TE, perceived effort, cadence, power, elevation). None of those per-run extras are stored today.
5. **Expected difficulty of a prescription.** The plan knows "easy / tempo / threshold / 5K" per set but nothing turns that into an expected RPE or expected HR to compare against.
6. **RPE on runs outside the plan.** RPE exists only on plan logs and is optional. COROS's watch-side "Perceived Effort" exists in `getActivityDetail` but isn't read.
7. **Longer shared history.** The shared projections hold 28 days; a fitness model needs months, and personal baselines need weeks.
8. **Model governance:** no version, data-quality score or assumption log on anything computed.
9. **Garmin:** nothing. The FIT reader already reads Garmin files, but there's no client-facing import and no direct connection.

### 1.6 What can be computed with no new integration

**Tier 1, every client (coach-readable today):**
- Session RPE load (duration × RPE) for every logged plan workout, daily and weekly; exponentially weighted short and long averages; monotony and strain by week.
- Compliance: done / skipped / missed, planned vs actual miles and time.
- **Expected vs actual cost:** RPE compared with the prescription's effort class, and with the athlete's own history for that class. Pace is available too (time ÷ distance), so "same easy run, faster, same RPE" is visible without a watch.
- Weekly wellness trend (energy / recovery / motivation / pain).
- Race capability from logged race results with Riegel / VDOT. A personal Riegel exponent becomes possible once the athlete has two or more races, and weekly volume can adjust the estimate.
- **Limit:** runs outside the plan are invisible, and RPE is optional.

**Tier 2, COROS shared (needs longer shared history to be useful):**
- Heart-rate load per run (Banister TRIMP needs only average HR, duration, max and resting HR).
- Pace load (rTSS-style, against COROS's threshold pace; flat-ground only without elevation).
- Efficiency (speed vs HR with an intercept, per athlete, matched run types).
- Personal HRV / RHR / sleep baselines (on the client's device the history is already ~400 days).
- COROS VO₂max / threshold / prediction as inputs, not answers.

**Tier 3, needs new fetching (no new partner):**
- From COROS laps or FIT: time in zones, decoupling, rep-by-rep execution, grade-adjusted pace, critical speed from in-run best efforts, temperature (watch sensor), cadence / power when present.

### 1.7 COROS, Garmin and "other devices"

- **COROS works today** for anyone who connects it on their own device: runs, health, fitness numbers, and sending workouts to the watch. The data stays in the client's private store unless they turn on sharing.
- **Garmin: no connection exists.** Options, cheapest first:
  1. *File import for everyone:* Garmin Connect's "Export your data" and Strava's archive both contain FIT files that `js/fitParse.js` already reads. Today the importer is only on Eddie's Analytics page. Opening it to clients costs no money and no approval.
  2. *Direct Garmin connection:* Garmin's Connect Developer Program (Health / Activity APIs, and a Training API to send workouts) needs an approved business application and a server endpoint that Garmin pushes data to. That means the Blaze plan, Cloud Functions, and Garmin sign-in tokens stored on Southbound's server, a change from today's "COROS sign-in stays on your device" privacy promise. Terms and cost to be confirmed in Phase 2.
  3. *Through a hub* (Intervals.icu / Runalyze / Strava): Strava's API is now paid for app makers; the others would need each client to set up a third-party account. Phase 2 will check, but these are unlikely to be good for clients.
- **Selling point:** the public site doesn't mention COROS at all today. COROS can be advertised honestly now. Garmin can't until one of the options above exists (see question 5).

### 1.8 Where the model should run: the deciding constraint

Three possible places, given Spark and the privacy rules:

| Option | How | Good | Bad |
|---|---|---|---|
| A. Coach's device, today's data only | Engine reads what the coach can read | No rules change | 28 days / 8 runs of wearable data is far too thin for fitness / fatigue, baselines or prediction |
| B. Client's device | Engine runs on each client's full private history and shares only its conclusions | Richest data; nothing raw leaves the client | The math runs on the client's phone (hidden from the UI, but not secret); runs only when they open the app; each phone sees one athlete, so no learning across athletes; hard for Eddie to backtest and tune |
| **C. Coach's device, longer consented history (recommended direction)** | Extend the existing consent categories so a client can share a compact per-session history (12 months, no GPS) and daily recovery numbers; the engine runs on Eddie's side across all his athletes | The model really is coach-only; backtesting and calibration across athletes; one engine for Eddie and his clients; fits the existing consent design | Rules change; the shared history must be stored compactly (Firestore's 1 MB document and 1,000-check rule limits mean an encoded, size-capped string checked by one pattern, the way the profile rule and Strava parts already work); the privacy page and consent wording must say plainly what's shared and that the coach analyzes it |

Model **outputs** would live in the coach's own private cloud-synced data (like `coach-plan-prompts`), not a new collection: they're derived, re-computable, versioned. Clients who share nothing still get the Tier 1 model from data the coach can already read.

### 1.9 Reuse vs replace

**Reuse as is:** the ingestion layer (`corosParse`, `corosMetrics`, `corosHealth`, `corosHistory`, `corosClient`), `fitParse` (extend, don't fork), `stravaArchive` / `stravaHistory` (`combineRuns` dedupe), `personalRecords`, `runWorkout` (prescription parsing and paces), `weekModel`, `workoutResults`, `feedbackModel` (check-in flags), `clientSummary` attention queue (the model adds items, it doesn't get its own queue), `svgCharts`, the `sharedWearable*` consent pattern, `offlineWrite`, `cloudSync`.

**Refactor:** VDOT out of `pace-calculator.js` into a pure module; `readiness.js` scoring functions; `trends.js` aerobic and load functions; `checkWorkout` generalized beyond Eddie's marathon plan.

**Replace:** `loadTrend`'s ratio and safety labels; `aerobicTrend`'s scaling; readiness weights.

**Delete:** `js/corosCoach.js` (unused).

### 1.10 Problems found during the audit (worth fixing soon, separate from this project)

1. **The privacy page is out of date.** It says a client's sleep, HRV, resting HR, stress and recovery are kept private and "your coach doesn't see them", but since Phase 7 Step 5C a client can choose to share them. The page should describe the three sharing switches.
2. **Saving sharing choices only refreshes one of the three shared summaries** (`js/corosSettings.js` calls `syncSharedWearableActivity` only). A client who turns on Performance or Recovery doesn't see it reach the coach until their next COROS refresh. Turning sharing off is still safe: the rules check consent on every coach read.
3. **`CLAUDE.md`'s data model table lists `sharedWearableActivity` but not `sharedWearablePerformance` / `sharedWearableRecovery`.**
4. **Analytics' Load panel calls a ratio "safe".** See 1.4.

### 1.11 Early direction (hypotheses Phase 2 will test, not decisions)

1. **Separate the dose from the response.** Training stress (what the session imposed) and the athlete's state (how they responded) are different things. RPE, HR and pace each measure a bit of both. Putting "subjective load" next to "aerobic load" in one vector mixes stimulus with response and makes the model circular.
2. **Treat the load measures as noisy readings of one dose, not as things to add.** For each athlete, learn how their session RPE relates to their HR load and pace load for each kind of session. The **gap** between what the session should have felt like and what they reported is the "expected vs actual cost" signal. The disagreement is the measurement.
3. **Few dose dimensions, by intensity domain:** below the first threshold, between thresholds, above, plus mechanical (distance and descent) and strength separately. Five or six labels that all move together would only look sophisticated.
4. **Use training as testing.** Races are rare, so calibrating a fitness–fatigue model on races alone is statistically fragile (the published individual fits are often unstable). Many sessions are small performance probes: efficiency on matched easy runs, execution of structured reps, in-run best efforts. These give far more data points to individualize on.
5. **Race prediction as lenses, not an average:** speed (critical speed / best efforts), aerobic (VDOT / threshold), durability (long runs, volume, late-run decoupling), specificity (recent race-pace work), actual races. The explanation shows where the lenses disagree, and the prediction interval widens with disagreement and thin data.
6. **Shrink toward population defaults** with minimum sample sizes before any personal parameter moves; every output carries a model version and a data-quality grade.
7. **Recommendations are decision support** with the triggering evidence shown; Eddie's accept / reject is logged, and that log becomes the data for judging the recommendations later.
8. **Eddie first.** His own years of data, races included, are the first and best test set, before any client sees anything.

### 1.12 Things I couldn't verify from memory (Phase 2 will)

- The "2026 three-dimensional impulse-response model" in the brief. I won't build on it until I've found and read the paper.
- Garmin's current developer terms, cost and approval process.
- Which public datasets with race results and training history exist and may be used for validation.
- What COROS's MCP actually returns in `getActivityDetail` and the FIT download for clients' watches (formats, daily limits).

---

## Questions for Eddie (round 1)

See the chat message of 2026-10-04; answers will be recorded here.

## Phase 2 — Research / model review

_To do._

## Phase 3 — Proposed Southbound model

_To do._

## Phase 4 — Backtest / validation plan

_To do._

## Phase 5 — Implementation plan

_To do._
