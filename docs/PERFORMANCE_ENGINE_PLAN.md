# Southbound Athlete Model — planning document

Working name only. Status (2026-10-04): **Architecture approved. Steps 0 and 1 built** (cleanup; sessions, races, effort). Next: step 2.

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


### 1.12 Open items from the audit, now resolved

- **The 2026 three-dimensional impulse-response model exists:** Kontro, Mastracci, Cheung & MacInnis, *PLOS ONE*, 6 Feb 2026. See 2.3.
- **Garmin:** see 2.6. New applications to Garmin's developer program are paused.
- **Public datasets:** see 4.6.
- **COROS `getActivityDetail` / FIT download formats for clients' watches:** still to be captured with the existing diagnostic when it's needed (step 3 of Phase 5). Nothing earlier depends on it.

---

## Round 1 answers (Eddie, 2026-10-04)

1. **Optimize for:** adjusting each client's plan week to week from these calculations, accurate race targets, and saving coach time.
2. **Athletes:** no clients yet. Eddie will coach himself first to build real coaching competence. *Consequence: everything is built and proven on Eddie's own data first. Client plumbing (sharing rules, Hub tab) waits until there's a client to use it.*
3. **Sharing:** yes, clients will be asked to share a longer history (opt-in, when the time comes).
4. **RPE:** required on planned runs, plus a one-tap effort question for other runs after the watch syncs.
5. **Garmin:** "can I not connect Garmin the same way as COROS?" Answered in 2.6: not at the moment. Upload is the route.
6. **Races:** picked up automatically from the watch and from uploaded Strava data. *Neither source labels races (2.6), so the app finds likely races and asks for a one-tap yes / no. A wrong "race" would quietly bend every calibration, so the yes matters.*
7. **Plan changes:** suggestions from a formula that dial the plan down by percentages of what was planned. Eddie is open to a better design; see 3.9.

---

## Phase 2 — Research and model review

Confidence labels: **Strong** = consistent evidence across several studies or a solid review; **Moderate** = some good evidence, real limits; **Weak** = mostly theory, small samples, or vendor claims. Sources are listed in 2.8.

### 2.1 Race performance and prediction

| Model | What it needs | What it's good at | Where it fails | Confidence for Southbound |
|---|---|---|---|---|
| **Riegel** T₂ = T₁(D₂/D₁)^1.06 | One race | Simple, well calibrated from 5K up to the half for recreational runners (Vickers & Vertosick 2016) | Marathon: at least 10 min too fast for half of recreational runners in that study. The exponent varies between athletes | **Strong** up to the half; **Weak** for the marathon unless the exponent is personalized |
| **VDOT** (Daniels & Gilbert 1979) | One race | Training paces; same family as Riegel (VO₂ cost of speed + fraction of VO₂max sustainable over time) | Same marathon problem. **Not independent evidence from Riegel:** both turn one race into others | Moderate. Use as an alternative curve shape, never as a second vote |
| **Critical speed / D′** (Monod & Scherrer; Hill; Jones) | 3+ maximal efforts lasting about 2–20 min | Best physiological anchor for the boundary between heavy and severe intensity. **CS can be computed from everyday training data** (Smyth & Muniz-Pumares 2020, 25,000+ marathoners) | Marathon pace sits well below CS and the fraction varies: about 93% of CS for 2:30 runners to 79% for 6:00 runners (84.8% ± 13.6% overall). The fit is only as good as the efforts are truly maximal | **Strong** as a fitness anchor; **Moderate** for marathon prediction (needs the fraction) |
| **Individual power law / matrix completion** (Blythe & Király 2016) | Several race results | Shows each runner's performances follow a personal power law; about 3 numbers summarize a runner; ~2% out-of-sample error on elite data | Needs several races; elite data; not trained on recreational runners' training logs | Moderate. Supports "personal exponent" and shrinking toward population patterns |
| **Aerobic power index + endurance index** (Emig & Peltonen 2020) | Training sessions' duration and distance (14,000 runners, 1.6M sessions of Polar data) | Marathon predicted without a prior marathon, ~2% mean error | Fit on one platform's population; their exact implementation isn't packaged for reuse | Moderate. Strong support for "use training as testing" |
| **Regression on training + a race** (Vickers & Vertosick 2016) | A prior race + weekly mileage (+ other training) | Marathon error clearly lower than Riegel's (mean squared error 208–228 vs 381) | Survey data (self-reported); population model, not personal | **Strong** evidence that **volume belongs in marathon prediction** |
| **The many marathon equations** (Keogh et al. 2019 review) | Varies | 114 equations, 36 studies | No single equation is accurate for all runners; weather, course and sex often missing | The review's own conclusion: never rely on one equation |
| **COROS race predictor** | COROS's own fitness model | Free, daily, trend-friendly | Formula not public; feeds from VO₂max-style estimates. Only the marathon number is stored today | Weak as truth, useful as **one lens** and as a trend |
| **Garmin race predictor** (Firstbeat) | VO₂max estimate + running economy (pace-to-HR), newer watches also training history | Trend | User analyses report marathon predictions 30–60 min too fast for runners without marathon-specific training | Weak as truth; not available to Southbound (no Garmin connection) |
| **Runalyze "marathon shape"** | Weekly km + long runs vs targets derived from the VO₂max prediction | Openly explains a durability correction on top of an aerobic prediction | Targets come from typical plans, not validated individually | Moderate. **Closest public precedent for Southbound's durability lens** |

**Durability.** "Physiological resilience" (Maunder et al. 2021; Jones 2023, "the fourth dimension") is how well an athlete's thresholds and economy hold up during long efforts. It varies a lot between people and helps explain marathon performance beyond VO₂max, threshold and economy. This is the science behind Eddie's "Runner A vs Runner B".

**Conditions.** Ely et al. 2007: marathon times slow progressively as WBGT rises from 5 to 25 °C (top men +1.7% to +4.5% over the course record across quartiles), and **slower runners are hurt more**. Southbound has no weather data today; a race-day heat note is an optional later add-on.

### 2.2 Training load

| Measure | Formula / what it is | Needs | Strengths | Weaknesses | Verdict |
|---|---|---|---|---|---|
| **Session RPE** (Foster 2001) | minutes × RPE (CR-10) | RPE | Cheap, works for any session incl. strength; large correlations with HR-based load (r ≈ .74–.89 in adolescent distance runners) | Test–retest noise (about 28% CV in one study); rated 30 min later it reads ~25% lower than at the end; RPE is partly a **response** (it rises when fatigued) | **Use**, for every session; also as a response signal (3.6) |
| **Banister TRIMP** | min × HRr × 0.64·e^(1.92·HRr) (men; 0.86·e^(1.67·HRr) women) | Avg HR, HRmax, HRrest | Needs only average HR; valid for steady aerobic work | Underrates intervals (HR lags); needs HRmax / HRrest; sex constant | **Use** for steady runs; laps improve it |
| **Edwards / Lucia TRIMP** | Time in 5 HR zones (×1–5) / 3 ventilatory zones (×1–3) | HR stream or laps; Lucia needs VT1/VT2 | Simple zone weighting | Zone edges arbitrary (Edwards) or need lab tests (Lucia) | Optional with laps; not core |
| **iTRIMP** (Manzi 2009) | Individual HR–lactate exponential | Lab lactate test | Most individual | Lab test | No (no lab data) |
| **rTSS** (TrainingPeaks, public) | hours × IF² × 100, IF = normalized graded pace ÷ threshold pace | GPS pace, grade, threshold pace | Captures intensity from pace; grade-aware | Needs a good threshold pace; normalization details partly proprietary | **Use the idea** (Southbound's own pace load, 3.3); don't call it TSS (trademark) |
| **hrTSS** | TSS form from HR | HR, threshold HR | Like TRIMP | Same HR lag | TRIMP covers it |
| **Running power load** (Stryd RSS, Polar Muscle Load = kJ) | From power | Power meter / watch power | Responds instantly, hills | Running power is not a good stand-in for metabolic cost (study cited in 2.8) | Context only, Tier 3 |
| **EPOC-based** (Garmin / Firstbeat Training Effect, acute load) | Modelled post-exercise oxygen consumption from HR (+ HRV) | Garmin | Good concept; load focus by low aerobic / high aerobic / anaerobic | Proprietary model; not available to Southbound | Borrow the **3-bucket idea** only |
| **COROS Training Load** | COROS's explainer: HR-reserve TRIMP per workout; Base Fitness (long-term) and Load Impact (short-term); Recovery from base fitness, load and time since the session | COROS | Already stored daily (short / long / ratio) | Exact constants not confirmed from a primary COROS page | Context and cross-check; **never added** to Southbound's own load |
| **Polar Training Load Pro** | Cardio Load = TRIMP; Muscle Load = power × time (kJ); Perceived Load = sRPE, kept separate | Polar | **The most transparent vendor design**, and it keeps the three apart instead of summing them | — | Confirms "separate measures, don't add" |

**Not adding them up.** sRPE, TRIMP, pace load, COROS load and EPOC load are all estimates of **the same session's stress**. Summing them counts one run four times. Averaging them is better but still wrong, because sRPE and HR also carry the athlete's **state** (heat, fatigue, illness). Southbound's answer (3.3): one primary dose per session, chosen by data quality, with the others used to calibrate it and the **gaps** between them used as response signals.

### 2.3 Fitness–fatigue modelling

| Approach | What it is | Evidence | Verdict |
|---|---|---|---|
| **Banister impulse–response** | Performance = baseline + k₁·fitness − k₂·fatigue, each an exponentially decaying sum of past loads (τ ≈ 42 and 7 days typical) | Explains group trends; **individual fits are unstable**: parameters are strongly correlated, wide confidence intervals and ill-conditioning (Hellard et al. 2006, elite swimmers). Parameters depend on starting values, fitting method and which load measure is used; general constants should be avoided | Use the **structure** (exponentially weighted load) descriptively. Don't claim it measures fitness |
| **CTL / ATL / TSB** (TrainingPeaks, intervals.icu, Runalyze) | The same with fixed τ = 42 / 7 and k₁ = k₂ | Practical, widely used; not validated as a predictor of an individual's performance | **Use**, renamed honestly: *training base*, *recent load*, *load balance* |
| **Busso time-varying model; Kalman filter** | Fatigue gain grows with load; the state is updated by each performance measurement | Kalman feedback clearly improves tracking and prediction in published scenarios | **The right direction once there are frequent performance probes** (3.5). Not before |
| **ACWR** | Acute ÷ chronic load with "safe zones" | Methodological critiques: ratio artefacts, mathematical coupling, no causal framework; manipulating ACWR to change injury rates "remains conjecture" (Impellizzeri et al. 2020) | **Drop the ratio and its zones.** Report "recent load vs your own normal" as an observation |
| **Monotony and strain** (Foster 1998) | Weekly mean ÷ SD of daily load; strain = weekly load × monotony | Older, plausible, modest evidence | Context only |
| **Three-dimensional impulse response** (Kontro et al. 2026) | Splits load and performance into aerobic, glycolytic and phosphocreatine dimensions via a 3-parameter critical power model; three Banister-style responses | Published Feb 2026 as a modelling framework; worked from cycling power. I could not open the full text here (network blocked), so I haven't checked how much real-athlete validation it contains | **Adopt the principle** (load by intensity domain, specificity of adaptation). **Don't fit it yet:** it triples the parameters an already unstable model needs, and running needs a speed-based CS / D′ / max-speed version. Revisit after the simpler model is validated |
| **Machine learning** (gradient boosting, deep sequence models) | Learn load → outcome | Needs many athletes and outcomes; injury prediction from 74 runners × 7 years reached AUC ≈ 0.72 (Lövdal et al. 2021): modest | **Not now.** One athlete's data can't train it honestly. Revisit with many clients |

### 2.4 Recovery and readiness

| Signal | Evidence | How Southbound should use it |
|---|---|---|
| **Subjective wellness** (soreness, energy, mood, stress) | **Strong**: in a systematic review of 56 studies, subjective measures tracked acute and chronic load more sensitively and consistently than objective ones, and the two often didn't correlate (Saw et al. 2016) | Full-weight domain, not a 15% add-on |
| **HRV** | **Moderate.** Use a 7-day rolling log-transformed average against the athlete's own smallest worthwhile change, not single nights (Plews et al. 2013). HRV-guided training shows small benefits over fixed plans on some outcomes, e.g. VO₂max, in meta-analyses (Manresa-Rocamora et al. 2021) | One domain (autonomic), with RHR; never dominant |
| **Resting HR** | Moderate; moves opposite HRV; a rise with low HRV is the classic illness / overreach pattern | Same autonomic domain as HRV (counted once) |
| **Sleep duration / debt** | Moderate | Own domain; duration and 7-day debt. Don't add a vendor sleep score on top (it already contains duration) |
| **Sleep stages, sleep score** | Weak to moderate (consumer staging accuracy is limited) | Context only |
| **RPE vs expected, HR vs expected** | Moderate; this is the internal-to-external relationship (Impellizzeri's framework) | The **training-response** domain (3.5) |
| **Recent load** | Strong that load drives fatigue; weak as a threshold for "too much" | Context: "above your normal" |
| **Vendor recovery / readiness scores** (COROS recovery %, WHOOP Recovery: HRV + RHR + sleep + respiratory rate, Oura Readiness: 9 contributors with 14-day "balance" vs 2-month baselines) | Proprietary composites of the same inputs | **Display, never score** (they'd double-count HRV, sleep and load) |
| **Pain, illness** | — | Hard stops: no formula overrides them |

Useful design ideas from vendors: Oura's "balance" contributors (recent 14 days, weighted toward the last few, against a 2-month baseline) and WHOOP adding respiratory rate only where it adds information. Both are consistent with personal baselines and "don't add what's already there".

### 2.5 Running physiology and external load: what earns a place

| Metric | Class | Why |
|---|---|---|
| Race results, best efforts, CS | **C: strong, drives decisions** | Direct performance |
| Pace with grade adjustment | **C** | External load; grade via Minetti's energy-cost curve (Strava's GAP refines it with HR data) |
| Weekly volume, long-run history | **C** for marathon / half | Vickers & Vertosick; Runalyze's shape; durability |
| Pace-to-HR relationship (efficiency) on matched easy runs | **C**, done properly (3.5) | Many observations; sensitive to heat, hills, drift, so conditions must match |
| Aerobic decoupling on long runs | **D: context** | Friel's 5% convention is a rule of thumb, not a validated cut-off; useful durability hint |
| VO₂max estimates (COROS) | **D** | Trend-useful; absolute error several percent |
| Threshold pace from COROS | **D** | Prefer Southbound's own CS; keep COROS's as a cross-check |
| Temperature (wrist sensor) | **D** | Biased by body heat; real weather needs location |
| Running power | **D** | Helps on hills; poor metabolic surrogate |
| Cadence, stride length | **D** | Context for injury discussions, not load |
| Ground contact time, vertical oscillation / ratio | **E: don't drive decisions** | Devices disagree in absolute values; weak links to outcomes at the individual level |
| ACWR safety zones, single-night HRV, calorie burn, "body battery"-type composites | **E** | See above |

### 2.6 Vendor data: exposed vs used vs evidence

A = what the platform exposes · B = what its own calculations are **documented** to use · formula public?

| Platform | A: exposes | B: documented inputs to its scores | Formula public? | Available to Southbound |
|---|---|---|---|---|
| **COROS** | Runs (distance, time, pace, avg HR, laps, FIT files), training load short / long / ratio, recovery %, VO₂max, threshold pace, race prediction, sleep, sleep HRV with COROS's normal range and baseline, resting HR, stress | Load: HR-reserve TRIMP; Recovery: base fitness + load + time since exercise | Partly (concepts; constants unconfirmed) | **Yes, per user, through COROS's open MCP connection with the athlete's own sign-in.** Already built |
| **Garmin** | Activities (FIT), training effect, acute load, load focus, training status, HRV status, race predictor, VO₂max, body battery, endurance / hill score | Firstbeat EPOC from HR (+HRV); race predictor from VO₂max + running economy (+ history on newer watches) | No | **Not directly.** Garmin's Connect Developer Program needs partner approval and a server, and **new applications have been paused since spring 2026 with no reopening date.** Existing partners keep access. Unofficial "Garmin MCP" tools come from independent developers (some log in with the user's Garmin password); not acceptable for client data. **Route: FIT file upload** (Garmin Connect "Export your data", or the Strava archive), which `js/fitParse.js` already reads |
| **TrainingPeaks** | TSS / rTSS / hrTSS, CTL / ATL / TSB, IF, NGP | rTSS from NGP vs threshold pace | rTSS yes; NGP details partly | No API used; ideas only |
| **Polar** | Cardio / Muscle / Perceived load, Nightly Recharge, Running Index | Cardio = TRIMP, Muscle = kJ from power, Perceived = sRPE | Mostly | Via FIT / Strava upload only |
| **WHOOP** | Strain (0–21), Recovery, sleep | HRV, RHR, sleep, respiratory rate | No | No |
| **Oura** | Readiness, sleep, HRV, temperature | 9 contributors vs personal averages | Concepts only | No |
| **Stryd** | Power, RSS, critical power | Power | Partly | Via FIT |
| **Strava** | Activities, GAP, Relative Effort, Fitness & Freshness | HR zones (Relative Effort); GAP from an HR-informed grade model (patent) | Partly | **Archive upload** (built). The API is paid for app makers. **The archive's csv has no race flag** |
| **Runalyze** | Effective VO₂max, marathon shape, TRIMP, ATL / CTL, prognoses | HR–pace relation with a personal correction; weekly km and long runs | **Yes, documented** | Ideas only |
| **Intervals.icu** | Load from power / HR / pace, fitness / fatigue / form, eFTP, CS models | Coggan TSS form; Morton 3-parameter and Monod–Scherrer models | **Yes, documented** | Ideas only |

**C / D / E for the vendor numbers themselves:** none of the vendor composite scores is class C. Raw measurements they expose (HR, pace, laps, sleep duration, HRV) are C or D as in 2.4–2.5; their composites (training load, recovery, readiness, training effect, race predictions) are **D at best**: use them as an independent lens or a cross-check, never as an input that gets added to Southbound's own version of the same thing.

### 2.7 What this means for Southbound

1. **The innovation isn't a new formula.** Every piece has published precedent. What's different is the architecture: separating dose from response, using the coach's own prescription to define "expected", race prediction as distinct evidence sources with a stated reason when they disagree, calibrated uncertainty, and a decision log. It should be described as *a Southbound coaching architecture that combines and individually calibrates established models*. It isn't novel science.
2. **Simpler is likely to win at first.** With one athlete and a few dozen races, a few well-chosen, individually anchored estimates will beat a big fitted model. Complexity has to earn its place in the backtest (Phase 4).
3. **Training data is the main asset.** Races are rare; sessions are many. That's what makes individual calibration possible at all.

### 2.8 Sources

- Kontro, Mastracci, Cheung, MacInnis (2026). The three-dimensional impulse-response model. *PLOS ONE*. https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0341721
- Smyth & Muniz-Pumares (2020). Calculation of critical speed from raw training data in recreational marathon runners. *MSSE*. https://pmc.ncbi.nlm.nih.gov/articles/PMC7664951
- Vickers & Vertosick (2016). An empirical study of race times in recreational endurance runners. *BMC Sports Sci Med Rehabil*. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5000509/
- Blythe & Király (2016). Prediction and quantification of individual athletic performance. *PLOS ONE*. https://arxiv.org/abs/1505.01147v2
- Emig & Peltonen (2020). Human running performance from real-world big data. *Nature Communications*. https://ideas.repec.org/a/nat/natcom/v11y2020i1d10.1038_s41467-020-18737-6.html
- Keogh et al. (2019). Prediction equations for marathon performance: a systematic review. https://www.insight-centre.org/wp-content/uploads/2020/05/Prediction-equations-for-marathon-performance-A-systematic-review-.pdf
- Maunder et al. (2021), durability; Jones (2023). The fourth dimension: physiological resilience. https://pubmed.ncbi.nlm.nih.gov/37606604/
- Ely et al. (2007). Impact of weather on marathon running performance. https://experts.umn.edu/en/publications/impact-of-weather-on-marathon-running-performance/
- Impellizzeri et al. (2020). Training load and its role in injury prevention, part 2. *J Athl Train*. https://pmc.ncbi.nlm.nih.gov/articles/PMC7534938/
- Hellard et al. (2006). Assessing the limitations of the Banister model. *J Sports Sci* 24(5):509–520.
- Fitness–fatigue model with Kalman filter feedback. https://lida.sport-iat.de/ta/Record/4046008?lng=en
- Saw, Main, Gastin (2016). Subjective self-reported measures trump commonly used objective measures. *BJSM*. https://dro.deakin.edu.au/articles/journal_contribution/Monitoring_the_athlete_training_response_Subjective_self-reported_measures_trump_commonly_used_objective_measures_A_systematic_review/20899435
- Plews et al. (2013), HRV 7-day rolling averages. https://openrepository.aut.ac.nz/handle/10292/7122
- Manresa-Rocamora et al. (2021). HRV-guided training meta-analysis. https://www.mdpi.com/1660-4601/18/19/10299 · HRV-based training and VO₂max: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7663087/
- sRPE in distance runners: https://ore.exeter.ac.uk/repository/handle/10871/33946
- Foster (1998, 2001); Banister (1975, 1991); Edwards (1993); Lucia (2003); Manzi (2009); Riegel (1981); Daniels & Gilbert (1979); Minetti (2002); Tanaka (2001); Bosquet et al. (2007, taper meta-analysis, *MSSE*).
- COROS: https://support.coros.com/hc/en-us/articles/15406707571732-Understanding-the-Recovery-Widget · Polar: https://support.polar.com/en/training-load-pro · Garmin load focus: https://www8.garmin.com/manuals/webhelp/fenix6-6ssport/EN-US/GUID-C3205D96-DAB6-4C93-A225-5B8D7B5A5621.html · Garmin race predictor: https://the5krunner.com/garmin-features/performance/race-predictor/ · TrainingPeaks rTSS: https://help.trainingpeaks.com/hc/en-us/articles/204071944 · Runalyze: https://runalyze.com/help/article/marathon-shape · Intervals.icu: https://www.intervals.icu/features/fitness-chart/ · WHOOP: https://www.whoop.com/fi/en/thelocker/adding-respiratory-rate-to-recovery/ · Oura: https://support.ouraring.com/hc/en-us/articles/360057791533 · Strava GAP: https://patents.google.com/patent/US11623121
- Garmin developer program pause: https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/ · https://forums.garmin.com/developer/connect-iq/f/discussion/434798/cannot-access-developer-program-application-form-under-construction · Independent "Garmin chat" connectors: https://gadgetsandwearables.com/2026/03/16/garmin-chat-connector/
- Strava archive has no race flag: https://forum.intervals.icu/t/import-all-data-from-strava/81068
- Running dynamics validity: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9671438/ · Running power as a metabolic surrogate: https://lida.sport-iat.de/dlv/Record/4050211?lng=en

---

## Phase 3 — The proposed Southbound Athlete Model

### 3.1 The shape

```
SOURCES            COROS runs · Strava / FIT uploads · plan logs (RPE, pain) · running log
                   · readiness check-ins · weekly check-ins · sleep / HRV / RHR · the plan
        │
        ▼
1  SESSION LEDGER  one de-duplicated list of sessions, each linked to its planned day
        │
        ▼
2  ATHLETE PARAMETERS  HRmax, HRrest, critical speed + D′, 1-hour speed, personal
                       distance exponent: each with source, date, confidence
        │
        ├──────────────► 3  DOSE: one primary stress number per session + time by
        │                   intensity domain (easy / threshold / hard) + mechanical
        │                         │
        │                         ▼
        │                4  LOAD STATE: training base, recent load, load balance,
        │                   per domain; "recent load vs your normal"
        │
        ├──────────────► 5  RESPONSE (training as testing): efficiency on matched easy
        │                   runs, effort vs expected, HR vs expected, workout execution,
        │                   long-run durability
        │
        ├──────────────► 6  READINESS (today): autonomic · sleep · how you feel ·
        │                   training response · load context (each domain counted once)
        │
        └──────────────► 7  RACE CAPABILITY: four independent lenses → range,
                            confidence, and why they disagree
                                  │
                                  ▼
                         8  WEEKLY DECISION: Proceed / Absorb / Ease / Recover / Check in
                            → % changes to next week's plan, for the coach to apply
                                  │
                                  ▼
                         9  GOVERNANCE: version, data grade, assumptions, snapshot,
                            coach decision log
```

**Dose and response stay separate.** Layers 3–4 describe what was done. Layers 5–6 describe how the athlete is coping. Layer 8 is the only place they meet, by explicit rules.

### 3.2 Layers 1–2: session ledger and athlete parameters

**Session ledger** (`js/athleteLedger.js`, pure). One record per session:
`{ id, date, start, sport, distance, movingSec, climb, avgHr, maxHr, laps?, rpe, rpeSource, pain, plannedDay?, raceStatus, sources[], quality[] }`.
- Merge rules reuse `combineRuns` (COROS wins over Strava; same start within 15 min and distance within 5%, or same day + distance within 3% + time within 10%). Plan logs attach to the session on that date with the closest distance; a plan log with no watch run is itself a session (Tier 1).
- **Derived, never stored as a new source of truth.** The only new stored facts are what the athlete or coach *tells* the app: race confirmations and one-tap RPE (3.10).

**Race finder** (part of the ledger). A run becomes a *race candidate* when it scores enough on: name words (race, 5K, 10K, half, marathon, parkrun, trot, a known race name); distance within 2% of a standard race distance (GPS reads races about 1% long); unusually fast for its length versus the athlete's training at that length in the prior 6 months; a plan day marked as race; morning start. Candidates show in a short list: **Race? Yes / No** (with official time optional). Only confirmed races feed calibration and validation.

**Athlete parameters** (`js/athleteParams.js`, pure). Each value carries `{ value, source, asOf, confidence }`:
| Parameter | How | Fallback |
|---|---|---|
| HRmax | 2nd-highest session max HR on distinct days in 18 months (Strava `x`, FIT, laps) | Tanaka 208 − 0.7 × age, flagged "estimate" |
| HRrest | Median of the last 30 days' resting HR | 60, flagged |
| Critical speed, D′ | Linear fit distance = CS·t + D′ on the best efforts lasting about 2–20 min in the last 120 days (in-run efforts, laps, races), weighted to recent | Last race via the speed–duration curve; then COROS threshold pace |
| 1-hour speed (v60) | From the personal speed–duration curve | — |
| Personal distance exponent b | From pairs of confirmed races / efforts; normal–normal shrinkage to 1.06 (prior SD 0.03) | 1.06 |

### 3.3 Layer 3: one dose per session (no double counting)

Three estimates are computed whenever their data exists:
- **Pace load** (external): `hours × IF² × 100`, with `IF = grade-adjusted speed ÷ v60`, lap by lap when laps exist. One hour at the 1-hour race pace is about 100, the same convention as TSS, without using its name.
- **HR load:** Banister TRIMP from average HR (lap by lap when available). Southbound doesn't collect sex; the male constant is used and the **scale** is calibrated per athlete (below), which absorbs most of the difference.
- **Effort load:** sRPE = minutes × RPE.

**The primary dose** is the first available of: pace load (GPS pace valid, not a treadmill or trail with unknown grade) → HR load → effort load. The other two are converted to the same scale by a per-athlete robust ratio (the median of pace load ÷ HR load, and pace load ÷ effort load, over at least 20 paired sessions, shrunk toward defaults until then). The engine reports which one it used.

**Why not average them:** HR and RPE rise when the athlete is tired, hot or getting sick. Averaging them into the dose would make a bad day look like a big training stimulus. Pace (external) is the most state-independent dose; HR and RPE are kept as **response** measurements (3.5). The backtest (4.3) checks whether this choice beats using HR load or effort load as the dose. If it doesn't, it changes.

**Intensity domains** (Garmin's three buckets and the 3D-IR model's principle, simplified for running): each lap's time goes to **easy** (IF < 0.80), **threshold / steady** (0.80–1.00, which includes marathon pace) or **hard** (> 1.00, above about CS). Without laps, the planned day's class decides, flagged lower quality. **Mechanical** is tracked as distance, long-run share and climb / descent. **Strength** keeps its own sRPE stream and is never mixed into running load.

### 3.4 Layer 4: load state

- Exponentially weighted load: `L_t = L_{t−1} + (dose_t − L_{t−1}) × (1 − e^(−1/τ))`, with **training base** τ = 42 days, **recent load** τ = 7 days, **load balance** = base − recent. The same is done per domain (easy base, threshold base, hard base) and for the long run (count and longest in 8 weeks).
- **Recent load vs your normal:** the percentile of today's recent load within the athlete's own last 12 months, plus the weekly change in training base. Wording is observational: "Recent load is in your top 5% of the year." No ratio, no "safe" zone.
- Monotony and strain (Foster) are shown in the weekly review only.
- τ stays at 42 / 7 until there are frequent performance probes; personal τ is then estimated by a Kalman-filtered fit with shrinkage, and only replaces the default if its 80% interval is narrower than ±30% (3.11).

### 3.5 Layer 5: training response, the core differentiator

Each qualifying session is a small test. All of these are residuals against the athlete's own recent baseline, so they work for any fitness level.

1. **Efficiency** (replaces `aerobicTrend`). For steady easy runs (30–100 min, IF < 0.85, not hilly; laps after the first 10 minutes when available): fit `HR = a + b × speed` by robust regression on the previous 8 weeks (excluding the last 7 days). Each new run's residual = observed HR − expected HR. A 14-day weighted mean of residuals gives "**your easy runs are 3 bpm lower at the same pace than in August**", and its pace equivalent. A change is called only when it's larger than 2 bpm and twice its standard error. Heat isn't known, so the seasonal caveat is shown in summer.
2. **Effort vs expected** (Eddie's "expected vs actual cost"). Expected RPE for a session = the athlete's own average for that session class (easy, long, steady, tempo, threshold, intervals, race) plus a duration term, shrunk toward defaults (easy 3, long 5, tempo 6, threshold 7, intervals 8, race 9) until there are 8 sessions in the class. Residual = reported − expected. A rolling mean over the last 3–5 sessions of +1.0 or more is a "costing more than usual" signal.
3. **HR vs expected at the prescribed pace** for quality sessions with laps: the same regression idea at harder paces.
4. **Execution:** `checkWorkout` generalized to any structured workout: reps on target, too fast, too slow, HR on the work reps.
5. **Durability:** on long steady runs with laps, efficiency in the second half vs the first (decoupling), as context.

**Reading them together (Eddie's examples):**
| Pace | HR | RPE | Reading |
|---|---|---|---|
| Same | Lower | Same or lower | Adaptation |
| Faster | Same | Same | Adaptation |
| Same | Higher | Higher | Fatigue, heat or illness: check sleep, HRV, notes |
| Slower | Higher | Higher | Accumulated fatigue (or illness) |
| Same | Lower | Higher | Possible deeper fatigue; HR can drop when overreached. Needs a second signal |
| Same | Same | Higher | Non-physical stress, or early fatigue: look at the check-in |

The engine reports the combination, not a single "response index". It is honest about the ambiguous rows.

### 3.6 Layer 6: readiness, version 2

Five **domains**, each scored against the athlete's own baseline (z-scores, then mapped to 0–100). Each domain is counted once:
| Domain | Inputs | Notes |
|---|---|---|
| Autonomic | 7-day rolling ln HRV vs 60-day baseline ± the smallest worthwhile change (0.5 SD); 3-day RHR vs 60-day baseline | HRV and RHR share one domain |
| Sleep | Last 3 nights vs sleep need; 7-day debt | COROS sleep score only if duration is missing |
| How you feel | Morning check-in (soreness, energy, mood) vs personal average; weekly check-in | Same weight as autonomic (Saw 2016) |
| Training response | Latest effort-vs-expected and HR-vs-expected residuals | From 3.5 |
| Load context | Recent load vs normal | Context: half weight |

- **Readiness** = the weighted mean of the available domains (equal weights to start; load context half), shown as a number **and** a band, with the top positives and the main concern in plain words. The existing sick (cap 30) and pain (cap 55) rules, `missingReason` and advice stay.
- **COROS recovery %** is shown beside it and labelled as COROS's, not scored.
- Weights are later tuned only if the backtest shows a domain predicts next-day session cost better (4.4).
- Example output (illustrative): *Readiness 73, Good. Positives: HRV in your normal range, sleep 7h40, easy pace 3 bpm cheaper than last month. Concern: recent load in your top 10% for the year. Today's threshold run: go ahead, at the slower end of the range.*

### 3.7 Layer 7: race capability (lenses, not an average)

**Four lenses, chosen to be independent evidence.** Riegel and VDOT are *not* two lenses: they are two curve shapes on the same race.
| Lens | Evidence | Gives |
|---|---|---|
| **R: races** | Confirmed races in the last 12 months, each converted to the target distance with the personal exponent *b* and aged (uncertainty grows with time since the race) | Time + σ |
| **S: speed from training** | CS / D′ and the speed–duration curve from the last 120 days of best efforts. For the marathon, CS × a fraction that depends on speed (Smyth & Muniz-Pumares: about 93% for 2:30 to 79% for 6:00), personalized by the athlete's own past marathons | Time + σ |
| **A: device** | COROS's prediction (marathon today; others if COROS shares them) | Time + σ (wide by default) |
| **D: durability** (half and longer) | Weekly volume over 12 weeks vs what the target time usually needs; long runs ≥ 18 mi (marathon) / ≥ 10 mi (half) in 12 weeks; decoupling on long runs; time at goal pace | A **deficit** applied to S and A (and to R when the race was shorter) |

**Durability deficit (marathon):** `deficit = (1 − readiness_D) × maxPenalty`, where `readiness_D` (0–1) averages the volume, long-run, decoupling and race-pace parts against Runalyze-style targets derived from the predicted time, and `maxPenalty` starts at 8% (between Vickers' "at least 10 minutes too fast for half of runners" and Garmin's reported 30–60 min misses). Both are **assumptions to calibrate** on the athlete's own marathons and halves in the backtest.

**Combining:** precision-weighted mean of the lenses' log-times (weights 1/σ²). Starting σ: R 3%, S 4%, A 6%, each inflated for staleness, few efforts or poor data. These are replaced by measured errors once the backtest has them. If the lenses disagree more than their σ allow, the interval widens: `σ_combined × max(1, √(χ²/df))`. The 80% interval is ±1.28σ.

**Confidence label:** High (80% interval within ±2%), Moderate (±2–4%), Low (wider), always listed with its reasons.

**What the coach sees** (illustrative numbers):
> **Marathon (Indianapolis, Nov 8):** 3:06 (80% range 3:03–3:11), Moderate confidence.
> Races say 3:04 (half in Sept). Training speed says 3:05. COROS says 3:03. Durability trims about 2 min: 3 runs of 18+ mi in 12 weeks (a typical target is 4–5), average 52 mi/week.
> The disagreement is small; the range is mostly about one recent race and no marathon in the last 12 months.

The same lenses give **training paces from current capability**, which the plan generator can offer next to "paces from goal time" (it uses Riegel from the goal today).

### 3.8 What exists vs what's new, in one table

| Output | Coach | Athlete (client) |
|---|---|---|
| Weekly decision + suggested changes | **Yes**, the main card | No |
| Race capability, range, confidence, lens breakdown | Yes | Only if the coach chooses to share it |
| Training base / recent load / load balance by domain (one chart) | Yes | No |
| Training response (efficiency, effort vs expected, execution) | Yes | No |
| Readiness v2 | Yes | Their own Today card (as now) |
| Data quality + "what would sharpen this" | Yes | No |

The coach gets **four cards**, not thirty charts: *This week* (decision), *Race capability*, *Load and response* (one chart), *Data quality*.

### 3.9 Layer 8: the weekly decision (Eddie's percentage dial-down)

**Inputs:** five concern domains, each scored none / mild / moderate / strong over the last 7 days:
1. **Load:** recent load vs normal (mild = top 25% of the year, moderate = top 10%, strong = top 5% *and* rising fast).
2. **Response:** effort-vs-expected, HR-vs-expected, execution misses.
3. **Autonomic:** HRV below its smallest worthwhile change; RHR up.
4. **Sleep:** debt over 7 days.
5. **Subjective:** morning check-ins, the weekly check-in's energy / recovery / motivation.

**Rule (convergence of evidence):** count the domains that agree, so one noisy signal never moves the plan on its own.
| Level | Triggered by | Easy runs | Long run | Quality sessions | Strength |
|---|---|---|---|---|---|
| **Proceed** | 0 domains, or 1 mild | 100% | 100% | As planned | As planned |
| **Absorb** | 2 domains, or 1 moderate | **90%** | 100% | As planned, at the slower end of the pace range | As planned |
| **Ease** | 3 domains, or 2 at moderate+, or effort ≥ +1.5 over expected for 3+ sessions | **80%** | **85%** | One session: keep the pace, **−25% of reps** | −1 set |
| **Recover** | 4+ domains, or Ease for 7+ days without improvement | **65%** for 3 days | **75%** or move it | Easy for 3–4 days, then rebuild | No heavy lower-body work |
| **Check in** | Pain flag, sickness, or autonomic + subjective + response all strong | No automatic change | | | Coach contacts the athlete |

**Why these numbers.** Cutting **volume first and keeping some intensity** is how tapers shed fatigue without losing fitness (taper meta-analysis: volume down 41–60% over about 2 weeks with intensity and frequency kept, Bosquet et al. 2007). Absorb / Ease / Recover sit at milder steps because this is mid-block, not a taper. Southbound's own plan shape already uses about −20% for cutback weeks. **Intensity is cut** when the signals look like illness or pain, not just fatigue. These percentages are **defaults Eddie can change** and the decision log (3.10) will show whether they were right.

**Asymmetric on purpose:** the engine can dial down; it never adds volume above the plan. Upward suggestions are limited to **updating pace targets** when race capability has risen with at least Moderate confidence, and "back to plan" after a dial-down.

**Race and taper protection:** no automatic suggestion inside race week except Check in. During a planned taper, Absorb / Ease only adjust the pace guidance.

**What Eddie sees** (illustrative numbers):
> **This week: Ease.** Three signals agree. Effort has run +1.4 above your usual over the last 4 runs, HRV is below your normal band for 4 days, and sleep is 3h40 short this week. Load is normal.
> Suggested: Tue 8 → 6.5 mi easy · Thu 6×1 mi → 4×1 mi at the same pace · Sat 18 → 15 mi · Sun 5 → 4 mi.
> **[Apply to plan]** (opens the plan with the changes as a draft, Undo available) · **[Not this week]** (with a reason)

### 3.10 Layer 9: governance, storage and privacy

- **Every output** carries `{ engine: "athlete-model", version: "0.1.0", modules: { ledger, params, dose, state, response, readiness, race, decision } (each a number), computedAt, dataThrough, quality: { grade: A–D, flags[] }, assumptions[] }`.
- **Data grade:** A = pace + HR + RPE on at least 80% of sessions, HRV / RHR on at least 5 of 7 nights, a race in 6 months; B / C step down; **D** = under 3 weeks of data or Tier 1 only for under 6 weeks.
- **Weekly snapshot:** the engine saves what it said each week (decision, race capability, parameters), so it can later be judged on what it said **at the time**, not on what it would say now.
- **Decision log:** every suggestion + Eddie's choice (applied / edited / not this week + reason) + what happened next.
- **Storage (Eddie first):** new facts and outputs go into Eddie's own private store, in their own documents under `users/{uid}/sync/` (like the Strava parts), so the main sync document doesn't grow. **No new collection, no rules change** for any step before client rollout. New synced keys are added to `EXACT_KEYS` in `js/cloudSync.js`:
  - `race-results`: confirmed races
  - `session-rpe`: one-tap efforts
  - `athlete-model`: snapshots, parameters and the decision log, in parts
- **Clients (later):** when the first client exists, their sessions reach the coach through an extended, opt-in version of the existing sharing switches. That needs a rules change, a rules test and a privacy page update. The engine itself runs on the coach's side.

### 3.11 Individual calibration: when personal values replace defaults

| Parameter | Default | Personal value used when | Method |
|---|---|---|---|
| Distance exponent *b* | 1.06 | 2+ confirmed races at different distances | Normal–normal shrinkage (prior SD 0.03) |
| Marathon fraction of CS | Smyth & Muniz-Pumares curve | 1+ marathon with a CS estimate within 8 weeks before it | Shrunk average of the athlete's ratios |
| Durability max penalty | 8% | 2+ marathons / halves with training history | Shrinkage |
| Dose scale ratios | Defaults | 20+ paired sessions | Robust median |
| Expected RPE per class | Defaults | 8+ sessions in the class | Shrunk mean + duration slope |
| HR–speed line | — | 8+ steady runs in 8 weeks | Robust regression, refit weekly |
| HRV / RHR baselines | — | 21+ nights in 60 days | Rolling mean and SD |
| Load time constants τ | 42 / 7 | 12+ weeks and 20+ performance probes, and the 80% interval within ±30% | Kalman-filtered fit with shrinkage |
| Readiness domain weights | Equal | 60+ days with readiness and next-session residuals, and a holdout improvement | Regularized regression, tested on held-out weeks |
| Weekly decision thresholds | 3.9 table | 20+ logged decisions with outcomes | Reviewed by Eddie, not auto-tuned |

---

## Phase 4 — Backtest and validation plan

### 4.1 Principles

1. **Time-ordered only.** Each prediction uses data strictly before the event (activities that started at least a day before the race), as if made then. No later race, run or parameter leaks backward.
2. **Freeze before scoring.** A model version is frozen before it is scored against a set of races. Changing it after seeing the results means a new version and a fresh evaluation on races it hasn't seen (or a clearly labelled re-run).
3. **No cherry-picking.** All confirmed races are scored. Exclusions are written down in advance: DNF, paced someone else, trail with more than 30 m climb per km, a race run as a workout (Eddie marks these when confirming). Excluded races are still listed.
4. **Report uncertainty.** With a few dozen races, differences of about 1% between methods aren't distinguishable. Every comparison comes with a bootstrap confidence interval on the **paired** difference.

### 4.2 Race prediction backtest

- **Ground truth:** Eddie's confirmed races from the Strava archive (2016 on) and COROS.
- **For every race, each method predicts using only earlier data:**
  - Riegel 1.06 from the most recent prior race
  - Riegel from the best prior race in 12 months
  - VDOT from the same race
  - Riegel with the personal exponent
  - The CS lens alone
  - COROS's prediction, where one was saved before the race (marathon only, since Sep 2026)
  - A Vickers-style "race + weekly mileage" adjustment
  - **The Southbound combination**
  - A naive baseline: the athlete's last time at that distance
- **Metrics:** MAE (minutes and %), RMSE, MAPE, bias (signed mean error: too optimistic or too pessimistic?), 80% interval coverage (should contain about 80% of results), and calibration (interval width vs actual error). Each is broken down by distance, by data available (HR yes / no, laps yes / no), by weekly volume band, and by horizon (days from the last input to the race).
- **Where it runs:** in Eddie's own browser, as a **Model check** card on Analytics. His data never leaves his device. **Copy results** gives a JSON with times and errors only (no routes) to paste for review.
- **Prospective test:** freeze the model before **Indianapolis (Nov 8, 2026)**, record its range, and score it after. One race proves little, but it is the cleanest possible test: no hindsight at all.

### 4.3 Load and response backtest

- **Which dose works best:** for each candidate dose (pace load, HR load, effort load, the primary-dose rule), build the load state and test how well it predicts the next performance probes: efficiency residuals over the following 7 days and the execution of the next quality session. Compare against a naive baseline (last 7 days' miles). The winner becomes the primary dose; ties go to the simpler one.
- **Efficiency v2 vs the current `aerobicTrend`:** each is judged on its week-to-week noise (lower is better at equal sensitivity) and on whether its changes come before better race results.

### 4.4 Readiness backtest

- **Outcome, defined in advance:** a "rough key session" is a quality or long run whose execution or effort residual is worse than −1 SD of the athlete's own history.
- **Compared:** readiness v1 (today's formula), readiness v2, COROS recovery %, HRV alone, the morning check-in alone, and a naive "yesterday's load" score.
- **Measures:** AUC and calibration for predicting a rough session the same or the next day. Domain weights move away from equal only if the change improves the held-out weeks (expanding window).

### 4.5 Weekly decision backtest

- **Retrospective, honest version:** replay each past week. For each, record what the engine would have said, then look at the next 7–14 days: rough key sessions, illness notes, pain flags, missed days.
  - **Hit rate:** Ease / Recover weeks followed by trouble.
  - **False-alarm rate:** Ease / Recover weeks followed by nothing.
  - **Miss rate:** trouble with no prior flag.
  - Do this for several threshold settings so the trade-off is visible.
- **What it can't show:** whether following the suggestion *would have improved* the outcome. History can't answer that, because the training wasn't changed. Only prospective use can: the decision log (3.10) with outcomes, reviewed monthly. If Eddie wants stronger evidence later, an n-of-1 design (alternating policies across blocks) is possible but slow. Not promised.

### 4.6 External checks (sanity, not proof)

| Dataset | What it has | Use |
|---|---|---|
| Lövdal et al. 2021, DataverseNL (doi 10.34894/UWU9PV) | 74 high-level runners, 7 years of daily training with perceived exertion, injuries | Test the load / response signals' behaviour (not race prediction) |
| Afonseca et al. 2022 (BMClab) | 10.7M runs of 36,412 athletes (distance, duration) | Population priors for volume and long-run patterns |
| National Running Club Database (2025–26) | Race results only | Riegel exponent spread across distances |
| Vickers & Vertosick 2016 | Survey of 2,303 runners | Their published model is a comparison method |

Licences are checked before any use; nothing from them is put into the app.

### 4.7 What "better" will mean

The Southbound combination is called better only if, on the frozen time-ordered backtest:
- its marathon and half **MAE is lower than Riegel's and VDOT's**, with the paired difference's confidence interval excluding zero (or, if there are too few races for that, it's reported as "not yet distinguishable");
- **bias is closer to zero**;
- **80% intervals cover 70–90%** of results.

If it isn't better, the simpler method ships, and the report says so.

---

## Phase 5 — Implementation plan

Each step is a normal Southbound step: pure modules with unit tests, a browser suite, docs, push the branch, Eddie says "push it". Steps 0–6 involve **no rules change** (everything is Eddie's own private data).

| Step | What | Why first / notes |
|---|---|---|
| **0. Cleanup** (small) | Privacy page describes the three sharing switches; saving sharing refreshes all three summaries; delete `js/corosCoach.js`; `CLAUDE.md` data model rows | Found in the audit; independent |
| **1. Sessions, races, RPE** | `athleteLedger.js` (merge + plan linking + race finder), **Your races** card on Analytics (Yes / No, official time), one-tap RPE for watch runs on Eddie's Today, RPE required on planned-run logs, new synced keys | Races are the ground truth everything else is scored against |
| **2. Parameters + race capability + Model check** | `athleteParams.js` (HRmax / rest, CS / D′, v60, personal exponent), `raceCapability.js` (lenses R, S, A, D; combination; interval; explanation), the in-browser backtest card with Copy results, frozen version + prediction for Indianapolis | Can be done before Nov 8 if Eddie paces it; gives a range for his race, clearly labelled "unvalidated" until the backtest says otherwise |
| **3. Dose + load state** | `sessionDose.js`, `loadState.js`; the **Load and response** chart replaces the Load panel (no "safe" labels); dose comparison in Model check | Uses COROS laps / `getActivityDetail` where useful (format captured first with the diagnostic) |
| **4. Training response** | Efficiency v2 (replaces `aerobicTrend`), effort vs expected, HR vs expected, generalized execution check | The core differentiator |
| **5. Readiness v2** | New domain scoring behind the same Today card; v1 vs v2 comparison in Model check; COROS recovery shown, not scored | Keep v1 selectable until v2 wins the backtest |
| **6. Weekly decision for Eddie's own plan** | `weeklyDecision.js` (domains → level → % changes); **This week** card on coach Today / Analytics; Apply writes `training-overrides` with Undo; decision log + weekly snapshots | His own plan first |
| **7. Client rollout** (when there's a client) | RPE prompt for clients' watch runs; extended opt-in sharing (rules + rules test + privacy page; compact encoded history, size-capped); **Model** tab in the Client Hub; This week suggestions applied as a **draft** in the plan workspace (publish as usual) | Rules change: paste the whole file |
| **W. Watches for everyone** (any time, small) | Client-facing watch-history import (Garmin Connect export / Strava archive) in Settings; public **Works with your watch** section: COROS connects directly (plan to watch, runs back); Garmin, Polar, Suunto and others bring their history by upload | Honest selling point today. The coach only sees uploaded history once step 7's sharing exists |

**Guardrails throughout:** formulas live only in pure modules (no math in UI files); every module exports its version; a static test checks that every output object carries the governance block; existing tests and suites keep passing.

---

## Round 2 answers (Eddie, 2026-10-04)

1. Steps 1 → 2 first, for a range before Indianapolis: **yes**.
2. The dial-down table in 3.9 as the starting defaults: **yes**.
3. Morning check-in every day and an effort number after every run: **yes**.
4. Architecture approved; start with steps 0 and 1: **yes**.

## Build log

- **Step 0 + 1 (2026-10-04):** privacy page sharing text; Settings refreshes all three shared summaries; `js/corosCoach.js` deleted. `js/athleteLedger.js` (session list, plan link, race finder, race record, effort prompts; 13 unit tests), `js/athleteData.js`, **Your races** on Analytics, **How hard was it?** on the coach's Today, effort required on planned-run logs, new synced keys `race-results` and `session-rpe`. Race-finder weights were tuned on test data so a fast weekday tempo isn't a candidate on speed and distance alone (score 5 needed). A 25-step browser suite.

## Round 2 questions (answered above)

1. **Order:** do steps 1 and 2 first so you have a range for Indianapolis before Nov 8 (labelled unvalidated), or the steps in plain order? *Suggested: 1 → 2 first.*
2. **The dial-down table (3.9):** OK as the starting defaults (Absorb 90%, Ease 80% easy / 85% long / −25% reps, Recover 65%)? You can change them later.
3. **Your own inputs:** as the first athlete, will you do the 20-second morning check-in daily and give an effort number after every run? The model gives the check-in as much weight as HRV, so skipped days mean weaker conclusions.
4. **Approve the architecture** (Phases 3–5) so step 0 / step 1 can start?
