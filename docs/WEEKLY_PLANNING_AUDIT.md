# Weekly Planning — Audit and Architecture

**Status:** audit 2026-10-06; Eddie's decisions recorded in section 15. **P1 (Athlete State) built 2026-10-06** (`js/athleteState.js`, `js/athleteSources.js`, `js/athleteStateView.js`; see `CLAUDE.md`). **P2 (Planning Context, Brief, Weekly Planning page + the Client Hub's Planning tab) built 2026-10-06** (`js/planningContext.js`, `js/planningBrief.js`, `js/planningView.js`, `js/planningData.js`, `planning.html`; proposal intake reuses `planPrompt.parseReply` / `applyReply` / `checkPlan` inside the view instead of a separate `js/planningProposal.js`; see `CLAUDE.md`).
**Asked for by Eddie:** a weekly planning capability. Southbound becomes the source of truth for the athlete's training state, an AI planning layer proposes the week, and the coach decides.
**Read first:** `CLAUDE.md`, `docs/PERFORMANCE_ENGINE_PLAN.md`, `docs/ATHLETE_MODEL_AUDIT.md`. This document builds on them and does not repeat them.

---

## 0. The short version (for Eddie)

**What Southbound already has is most of an "Athlete State".**

Southbound already calculates, for you and for any client who shares their data:

- race capability with a range and a confidence
- training load (recent, base, where it sits in your year)
- how you're responding (easy-run heart rate, effort vs what a run usually costs you, workout execution)
- readiness
- preparation for the race against your own usual block
- a weekly decision (Proceed / Absorb / Ease / Recover / Check in) with suggested changes and a log of what you did with them

The coach plans for clients are already versioned: draft → publish → version history. There's even an AI round trip: Copy chatbot prompt / Paste chatbot plan.

**What's missing is the layer that pulls it together for planning.** Today each card works things out on its own. The chatbot prompt sends the profile and the plan, but **none** of the athlete model, so a chatbot plans without knowing load, response, readiness or capability. Nothing records "what was suggested → what the coach changed and why → what happened."

**What's missing in the data:**

1. **Your own training has no plan store after Indianapolis.** Your marathon block is written into the app's code (`js/marathonData.js`) plus your edits (`training-overrides`). Clients' plans live in Firestore with versions. A planning system needs one approved-plan store for everyone, including you.
2. **No history of plans vs outcomes.** Your edits overwrite the plan with no record of when or why. Client plans keep versions but not the reasons for each change. The weekly decision log is the only "suggested → chosen" record, and it covers one kind of suggestion.
3. **No race calendar.** One target race per plan or profile. Tune-up races are only plan days, and there are no A/B/C priorities.
4. **A few planning preferences:** preferred long-run day, workout days, doubles, disliked sessions. Some already exist in other forms: the generator's settings have run days and the long-run day, and the profile has days available, time, equipment, what's worked and what hasn't.
5. **Strength and cross-training aren't in the load model.** They're logged (strength lifted, plan days) but shown beside the running numbers, never in them.
6. **Clients' weekly check-ins** (energy, recovery, motivation, pain) aren't read by the model. Only the morning check-in is.

**My recommendation is to build it in this order, and to wait on the AI API:**

| Step | What | Rules change? | AI? |
|---|---|---|---|
| **P1** | **Athlete State**: one module that runs the existing engines once and wraps each result with where it came from, how sure it is and what it stands on. Clients' Model tab moves onto it unchanged. | No | No |
| **P2** | **Planning Context + Planning Brief + a Weekly Planning page**: what matters this week, the brief to read or copy, and the existing paste-back flow, now with the athlete's state in it. Works with any chatbot, ChatGPT included. | No | Copy/paste only |
| **P3** | **Planning cycles**: every week's context, every proposal, every coach edit with an optional reason, and the approved plan, saved as one record. | Yes (one new coach-only collection) | — |
| **P4** | **Plan outcome**: planned vs actual per session, and how the athlete responded to what was prescribed. It fills in the cycle and feeds the next one. | No | — |
| **P5** | **AI API**: the coach-only relay (built once on Sep 27, then removed), now sending only the Planning Context and returning a checked, structured proposal. | No (consent in person; the privacy page is updated first) | Yes |
| **P6** | **Learning**: plain descriptive tendencies from the saved cycles (completion by session type, how often the coach changes what, response to load). No machine learning until the history is there. | No | — |

**Decisions (section 15), answered by Eddie on 2026-10-06:** 1 yes, 2 yes, 3 **no switch** (he asks clients in person), 4 yes.

1. **Is the "no AI inside Southbound" decision of Sep 27 being reversed?** This request reverses it. My advice: yes, but not until P3–P4. Until then the Brief works with any chatbot at no cost and with no new accounts.
2. **After Indianapolis, does your own training move into the same plan model as clients?** I recommend yes.
3. **Should clients get a separate "my coach may use AI with my training data" switch?** I recommend yes. The privacy page currently promises that Southbound itself sends nothing to an AI service.
4. **Do we start with you as the only athlete?** I recommend yes, then one client.

---

## 1. What I inspected

These files were read for this audit, beyond what `CLAUDE.md` says about them:

- **Engines:** `js/athleteLedger.js`, `athleteParams.js`, `raceCapability.js`, `raceBacktest.js`, `sessionDose.js`, `loadState.js`, `trainingResponse.js`, `readiness.js`, `readinessV2.js`, `readinessBacktest.js`, `weeklyDecision.js`
- **Assembly / glue:** `athleteData.js`, `readinessV2Data.js`, `readinessData.js`, `weeklyDecisionData.js`, `clientModel.js`, `clientModelTab.js`, `athleteShare.js`, `analyticsLayout.js`, `analyticsSummary.js`, `weeklyStory.js`, `weekStory.js`, `weeklyLoad.js`, `thisWeekCard.js`
- **Plans:** `marathonData.js` (`WEEKS`, `PACES`, `loadOverrides`, `getAdjustedWeekDays`), `marathonCoros.js`, `coachingPlanModel.js`, `coachingPlans.js`, `planOps.js`, `planShape.js`, `coachPlanGenerator.js`, `planWindow.js`, `planPrompt.js`, `planPromptDialogs.js`, `weekModel.js`, `weekData.js`, `runWorkout.js`, `strengthWorkout.js`
- **Results / feedback:** `workoutResults.js`, `feedbackModel.js`, `changeRequests.js`, `checkins.js`, `sessionLogs.js`, `sessionModel.js`, `clientSummary.js`, `trends.js`, `trendsData.js`, `strengthHistory.js`, `plannerEvents.js`
- **Profile:** `clientRecordSchema.js` (every field), `clientRecords.js`, `profileChecks.js`
- **Storage / security:** `cloudSync.js` (the synced key list), `firestore.rules` (links, plans, drafts, masters, shares), `privacy.html` (what's promised about AI)
- **Backend:** `cloudflare-worker/` (the shelved Strava broker), and the removed AI relay from git history: `b9de989` "Describe a client's plan in your own words" and `ae6150b` "Take out the AI plan helper", including `cloudflare-worker/ai-helper.js` and `docs/AI_HELPER_SETUP.md`

---

## 2. How Southbound works today (as built)

### 2.1 Two kinds of athlete, two data paths

| | **Eddie (coach as athlete)** | **A client** |
|---|---|---|
| Runs | COROS history + Strava archive + Running Log on his device (`loadLedger`) | `sharedAthleteModel` (only with the "Athlete model" consent): 365 days of runs, compacted. Otherwise only `workoutResults` (logged plan workouts) |
| Laps | `coros-laps` (key workouts) | Not shared |
| Health (HRV, RHR, sleep) | `coros-health-history` | Shared (120 nights) with consent |
| Morning check-in | `readiness-checkins` | Shared (yes/no for pain/sick, never the words) |
| Weekly check-in | — | `checkins/{uid}_{week}` (energy, recovery, motivation 1–5, pain, notes). **Not read by the model.** |
| Effort answers | `session-rpe` | Shared inside the runs, plus `workoutResults.rpe` |
| Races | `race-results` | Coach's answers in `coach-athlete-model` + client's own |
| Plan | `js/marathonData.js` `WEEKS` (code) + `training-overrides` (synced key) | `coachingPlans` + versions + `coachingPlanMasters` + `coachingPlanDrafts` (Firestore) |
| Profile / goals | **None** (the race and goal are in the plan's race-day title) | `clientRecords/{uid}`: goals, event, days, time, equipment, injuries, what's worked… |
| Decision log | `athlete-model.decisions` / `.snapshots` / `.policy` | `coach-athlete-model[uid].decisions` / `.snapshots` |
| Where it's assembled | Spread across cards: `loadCard.js`, `weeklyLoad.js`, `raceCapabilityCard.js`, `readinessCard.js` (via `readinessV2Data.athleteInputs`), `thisWeekCard.js` (via `weeklyDecisionData.currentDecision`) | **One place:** `clientModel()` in `js/clientModel.js` |

`clientModel()` is already a near-complete "Athlete State" builder for clients: sessions → doses → load → response → readiness v2 → race capability → weekly decision on the next 7 days of the published plan. Eddie's side has the same engines but no single builder.

### 2.2 The pipeline

```
sources (COROS, Strava, Running Log, check-ins, answers, plan)
   → athleteLedger.sessionsFrom / attachAnswers / linkPlan      (one list of sessions)
   → athleteParams (HR max/rest, efforts, exponent)
   → sessionDose (one external dose per run; internal HR/effort kept apart)
   → loadState (base τ42, recent τ7, balance, percentile, weeks, long runs, totals, week-to-date)
   → trainingResponse (efficiency, effort vs expected, quality HR, execution, decoupling, reading)
   → readiness v1 (Classic) / v2 (body only; response + load as context)
   → raceCapability (lenses, range, confidence, grade, durability/preparation, track record)
   → weeklyDecision (5 domains → 3 vote groups → level → changes on the next 7 days; log; replay)
   → cards: Analytics (8 sections), Weekly Review (story), Today (This week, Readiness), Client Hub Model tab
```

### 2.3 Plans

- **Eddie:**
  - `WEEKS` is an array in code: 16 weeks, a phase per week (rebuild / build / mp / peak / taper), and 7 days of `{ session, miles, pace }`, plus week notes (purpose, mental, fueling, heat, strength) and race days.
  - `PACES` is the pace table.
  - His edits go into `training-overrides[week][Mon…]`, overwritten in place: no history, no reason.
  - The weekly decision's Apply writes there too, logging what it replaced so Undo works.
- **Clients:**
  - A plan is `{ weeks: [{ week, phase, cutback, days: [{ date, type, miles, session, workout?, strength? }] }], generator?, raceDate? }`.
  - Structured run workouts (`day.workout`: warm-up, sets, cool-down, paces or effort words, `why`, `cue`, `fuel`) and strength sessions (`day.strength`).
  - Draft → Review & publish → version N (immutable, with a `changes[]` list and a coach note). The client sees two weeks at a time.
  - `plan.generator.prints` fingerprints every generated day, so Southbound can tell **generated** from **hand-edited** (Regenerate already uses this).
- **Plan text Southbound can read:**
  - `planDayFromMarathon` / `marathonCoros.js` turn plain text ("6x1mi @ threshold; 90s jog", "last 3 @ MP") into a structured workout.
  - `planPrompt.parseReply` reads a chatbot's day lines.
  - `checkPlan` gives "Worth a look" warnings.
  - `compactChange` / `previewChanges` describe a change in one line.

### 2.4 The existing AI round trip

- **Copy chatbot prompt / Paste chatbot plan** (`js/planPrompt.js`, `js/planPromptDialogs.js`):
  - Sends the client's first name, age band, profile training details, the coach's notes and the plan in a line format.
  - Reads the answer back tolerantly, checks it, previews the changes, and applies them into the draft with Undo.
- It sends **no athlete-model data:** no load, response, readiness or capability. The chatbot plans blind to everything Southbound has measured.
- Its "coaching rules" include "weekly running goes up by no more than about 10%". The evidence behind that rule is weak (section 10.2), and it reads like a safety rule. It should give way to the athlete's own history.
- The chatbot's explanation ("what I changed and why") is free text after the code block, and it isn't kept.

### 2.5 The removed AI relay (Sep 27)

`cloudflare-worker/ai-helper.js` in commit `b9de989` was a good base:

- It held the Anthropic key as a Cloudflare secret.
- It answered only approved coaches, by reading `userProfiles/{uid}` from Firestore **with the caller's own ID token**, so Firestore verified the token and applied the rules.
- It accepted exactly one request shape with size limits, picked the model and output limit itself, and returned only the tool result.

You removed it the same day ("he'll use AI on his own when he wants it"). Two things would have to change if it came back:

- **Forced tool choice** (`tool_choice: { type: "tool" }`) now returns an error on the current Opus model. The rebuild should use structured outputs (a JSON schema on the response) instead.
- It should send the Planning Context, not free text.

---

## 3. Inventory: what Southbound already knows, by domain

Kinds:

- **M** measured (a device or a log recorded it)
- **D** derived (arithmetic on measured values)
- **Mo** modeled (an estimate that depends on Southbound's assumptions)
- **P** predicted (about the future)
- **S** subjective (the athlete's own answer)
- **C** coach-entered
- **A** athlete-entered (profile)
- **V** vendor-modeled (COROS's own estimate)

Columns: **Self** = Eddie. **Client+** = a client sharing the athlete model. **Client−** = a client who doesn't.

### 3.1 Goals

| Signal | Kind | Where | Self | Client+ | Client− | Confidence available? |
|---|---|---|---|---|---|---|
| Primary goal (words) | A | `clientRecords.primaryGoal` | ✗ | ✓ | ✓ | freshness (`answerFreshness`) |
| Target race, date, distance | A / C | profile `eventType` / `targetEvent` / `targetDate`; plan `raceDate`; self: `planRace(planDays)` | ✓ | ✓ | ✓ | freshness for profile |
| Target time | A / C | self: "Goal h:mm:ss" in the race title; client: goal text → `goalSeconds` | ✓ | partly | partly | — |
| Secondary goals | A | `secondaryGoals` | ✗ | ✓ | ✓ | — |
| Race calendar (several races, A/B/C) | — | **missing**; tune-ups exist only as `race: true` plan days | — | — | — | — |
| Training phase | C | self: `WEEKS[].phase`; client: `weeks[].phase` from `planShape` or the coach | ✓ | ✓ | ✓ | — |

### 3.2 Current fitness

| Signal | Kind | Where | Self | Client+ | Client− | Confidence |
|---|---|---|---|---|---|---|
| Race capability (time, 80% range) | P | `predictRace` | ✓ | ✓ | weak (plan logs only) | `confidence`, `quality.grade` A–D, `flags`, `explanation`, `assumptions` |
| Race evidence | M + S | `confirmedRaces`, race lens | ✓ | ✓ (coach confirms) | ✗ | per-lens σ |
| Training capability | D | training lens (`effortsFrom`) | ✓ | ✓ | ✗ | per-lens σ |
| COROS capability | V | COROS lens, VO₂max, threshold pace (`coros-fitness-history`) | ✓ | ✓ (shared) | ✗ | COROS's own record (`corosRecord`) |
| Capability trend over time | — | **missing for Southbound's own number** (COROS's trend exists: `predictionTrend`; locks are single points) | — | — | — | — |
| Pace at usual easy HR (fitness proxy) | Mo | `efficiency` weekly series | ✓ | ✓ with HR | ✗ | SE-based verdict |

### 3.3 Training load

| Signal | Kind | Where | Self | Client+ | Client− |
|---|---|---|---|---|---|
| Recent / base / balance, percentile in their year | Mo | `loadState` | ✓ | ✓ | effort-only dose |
| Week, month totals; week-to-date vs same weekday | D | `loadTotals`, `weekToDate` | ✓ | ✓ | ✓ (fewer) |
| Intensity split easy / threshold / hard | Mo | dose domains (pace vs v60, lap by lap) | ✓ | ✓ (no laps: whole-run) | effort words |
| Long runs (count, longest, 8 weeks) | D | `loadState.longRuns`, `durability` | ✓ | ✓ | ✓ |
| Monotony / strain | D | `weeklyTotals` | ✓ | ✓ | ✓ |
| Strength load | M | `strength-history` (lb lifted), client strength `workoutResults` | shown, **not modeled** | logged, not modeled | logged |
| Cross-training | C | plan days only; **no actuals** in the ledger (runs only) | plan | plan | plan |
| Southbound vs COROS load | D | `corosComparison` | ✓ | — | — |

### 3.4 Training response

| Signal | Kind | Where | Self | Client+ | Client− |
|---|---|---|---|---|---|
| Easy-run efficiency (HR at speed vs own 8 weeks) | Mo | `efficiencySignal` | ✓ | ✓ with HR | ✗ |
| Effort vs expected (CR-10, by session class) | Mo from S | `effortSignal`, `effortResponse` | ✓ | ✓ | ✓ (logged efforts) |
| Workout execution (laps vs pace targets) | D | `checkWorkout`, `executionSummary` | ✓ | ✗ (no laps) | ✗ |
| Quality-rep HR | Mo | `qualityHr` | ✓ | ✗ | ✗ |
| Long-run decoupling | D | `decoupling` | ✓ | ✗ | ✗ |
| Reading (Adapting / Steady / Tired… / Not enough) | Mo | `reading` | ✓ | ✓ | partly |
| Planned vs actual (client logs) | M + S | `workoutResults` + `compareRun` / `compareStrength` | — | ✓ | ✓ |

### 3.5 Readiness and recovery

| Signal | Kind | Where | Self | Client+ | Client− |
|---|---|---|---|---|---|
| Classic score + parts | Mo | `computeReadiness` | ✓ | own device only | own device only |
| v2 domains (autonomic, sleep, feel) + context | Mo | `readinessV2` | ✓ | ✓ (shared nights) | ✗ |
| Why there's no score | D | `missingReason` | ✓ | — | — |
| Morning check-in | S | `readiness-checkins` | ✓ | ✓ (coarse) | ✗ |
| Weekly check-in (energy / recovery / motivation / pain) | S | `checkins` | — | ✓ | ✓ — **not used by any engine** |
| COROS recovery % | V | shown, never scored | ✓ | ✓ | ✗ |
| Is readiness any good for this athlete? | D | `readinessCheck` (AUC vs "what you already knew") | ✓ | not run | — |

### 3.6 Durability and race preparation

| Signal | Kind | Where | Self | Client+ | Client− |
|---|---|---|---|---|---|
| This block vs own usual block (weekly miles, long runs, longest) | D | `durability` (`basis: yours / typical`) | ✓ | ✓ | partly |
| Learned effect of thinner blocks | Mo | `trackRecord` β | ✓ | ✓ (needs races) | ✗ |
| Key sessions done (12 weeks) | D | `keyWorkouts` + linkage | ✓ | — | — |
| Mileage consistency | — | **missing as a named measure** (the week totals exist) | | | |
| Race-specific work done (e.g. miles at marathon pace in the block) | — | **missing** (needs laps classified against the plan's MP range; the parts exist: `checkWorkout`, the work-lap rule) | | | |

### 3.7 Schedule, constraints, preferences

| Signal | Kind | Where | Self | Client |
|---|---|---|---|---|
| Days available | A | `availabilityDays` (+ notes) | ✗ | ✓ |
| Time of day, session length, where, equipment | A | profile step 2 fields | ✗ | ✓ |
| Injuries / limits (training-relevant) | A | `injuries`, `injuryAreas`, `injuryStatus` | ✗ | ✓ |
| Run days, long-run day, quality runs, strength per week | C | `plan.generator.settings` | ✗ | ✓ (generated plans) |
| Busy days (classes, deadlines…) | C | `planner-events` (his own calendar) | ✓ | ✗ |
| Booked sessions | M | `bookingRequests` + `sessionLogs` | — | ✓ (soccer) |
| What's worked / hasn't, coaching wants, feedback style, obstacle | A | profile | ✗ | ✓ |
| Fueling (gels, practised plan) | A | Fueling Library, saved plans | ✓ | ✓ |
| Coach's building blocks | C | `coach-workout-library` | ✓ | ✓ |
| Preferred long-run / workout days, doubles, disliked sessions | — | **missing** | | |

### 3.8 Coach decisions and overrides

| Record | Where | What it keeps | Gap |
|---|---|---|---|
| Weekly decision log | `athlete-model.decisions` / `coach-athlete-model[uid].decisions` | suggestion, applied / declined + reason (4 choices) / undone, the plan before | Covers one engine's suggestion only |
| Weekly snapshots | `.snapshots` | level + domain severities the first time a week is seen | No context, no state versions beyond the decision's |
| Plan versions | `coachingPlans/{id}/versions/{n}` | prescription, `changes[]`, coach note | No reason per change; drafts aren't kept after publish |
| Generated vs hand-edited | `plan.generator.prints` | which days the coach changed | Not stored as an event |
| Eddie's edits | `training-overrides` | the current value only | **No history at all** |
| Change requests | `changeRequests` | client's reason (6 kinds) + coach reply | — |
| Workout replies | `workoutResults.coachComment` | — | — |

### 3.9 Plan vs actual

- **Planned distance:** ✓ (`miles`, `plannedMiles(workout)`).
- **Planned duration:** for timed workouts (`timedMinutes`), otherwise estimated from pace.
- **Planned intensity:** pace ranges or effort words (`workout.sets`, `PACES`).
- **Planned RPE: no field.** It can be **derived** without a new field: the planned workout's session class gives the expected effort (`EFFORT_DEFAULTS`, the athlete's own class averages in `effortResponse`). I recommend deriving it, and adding a coach-set target RPE only if derivation proves wrong.
- **Actual:**
  - self: the ledger session linked to the plan day (`linkPlan`), laps (`checkWorkout`), effort answer
  - client: `workoutResults` (distance, time, RPE, pain, note) + shared runs
- **Status:**
  - self: done / partial / missed / extra (`weekGlance`); skipped / slow / rough / hurt (`trainingOutcomes`)
  - client: completed / skipped (`workoutResults`), auto-done at 80% (`weekModel`)
- **The prescription in force when it was run:**
  - client: `workoutResults.planVersion` ✓
  - self: **unknown** (overrides overwrite)

---

## 4. Where calculations are already duplicated

| Calculation | Called from | Notes |
|---|---|---|
| `loadLedger` / `buildLedger` | `athleteData.loadModelInputs`, `effortCard`, `racesCard`, `weeklyStory`, `athleteShare` | Weekly Review builds the ledger 4 times per load (`weeklyLoad`, `weeklyStory`, `thisWeekCard` via `athleteInputs`, the effort card) |
| `sessionDoses` | `loadCard`, `weeklyLoad`, `readinessV2Data.athleteInputs`, `clientModel` | Weekly Review computes doses twice (`weeklyLoad` + `thisWeekCard` via `athleteInputs`) |
| `loadModelInputs` | `analyticsLayout`, `loadCard`, `raceCapabilityCard`, `weeklyLoad` | Analytics reads the inputs 3 times |
| `predictRace` | `raceCapabilityCard`, `clientModel`, `raceBacktest` | fine (the backtest is meant to repeat it) |

`readinessV2Data.athleteInputs(today)` already caches per page and per day. **The Athlete State should own that cache** (one ledger, one dose run, one response run per page), and the cards should move onto it over time. Each card still draws itself; only the arithmetic is shared. Two rules for this:

1. P1 must not change any number the cards show. The existing browser suites (s1–s12) are the check.
2. No persistent cache of computed state on the device. It goes stale the moment a run or an answer arrives. The weekly snapshot saved in a planning cycle (P3) is a record, not a cache.

---

## 5. Gaps that matter for planning (ranked)

1. **One approved-plan store for every athlete, including Eddie.** Without it, approvals for Eddie can only write into `training-overrides`. Those edits have no history, and his next block would need code changes.
2. **A planning history.** Context, proposal, coach edits + reasons, approved plan, outcome. Nothing like it exists beyond the weekly decision log.
3. **Athlete-model facts in the AI prompt.** The round trip exists, but without the state.
4. **Plan outcome per prescription.** The parts exist (`linkPlan`, `checkWorkout`, `effortResponse`, `workoutResults`), but no per-week record joins them.
5. **Eddie's own goals and constraints.** He has no profile, so his goal lives in a plan title. `planner-events` holds his busy days but nothing reads it for training.
6. **Race calendar with priorities.**
7. **Clients' weekly check-in in the model** (subjective domain). Already listed as a next option in the performance plan.
8. **Strength and cross-training actuals in the picture.** Not in the dose: they're shown as context.
9. **Planning preferences:** long-run day, workout days, doubles, disliked sessions. Add them only when P2 shows the planner needs them.
10. **Southbound's own capability trend:** predictions at past dates. The backtest code can produce it.

Deliberately **not** gaps:

- **Injury prediction:** out of scope, never claimed.
- **A "safe load range":** removed in step 3 and not coming back.
- **More readiness metrics:** the readiness check shows the current ones barely beat "what you already knew"; adding more won't fix that.

---

## 6. Recommended architecture

```
                     ┌───────────── existing engines (unchanged) ─────────────┐
 sources ──► adapters ──► ledger → params → dose → load → response → readiness → race → decision
              │                                                                    │
              │                 ┌──────────────────────────────────────────────────┘
              ▼                 ▼
      AthleteInputs ──► athleteState() ──► AthleteState v0.1 (provenance on every signal)
                                  │
             ┌────────────────────┼─────────────────────────┐
             ▼                    ▼                         ▼
        Analytics            Weekly Review           planningContext(state, week)
   "what is happening"   "what happened this week"        │
                                                           ├─► planningBrief() (text: read / copy / debug)
                                                           ▼
                                        proposal sources: paste (any chatbot) · AI relay (P5) · rule engine
                                                           ▼
                                        normalizeProposal → Southbound checks (parse, miles, checkPlan, evidence refs)
                                                           ▼
                                        Coach review (accept / edit / reject per day, optional reason)
                                                           ▼
                                        Approved plan → plan store adapter (client: draft → publish; self: see §11)
                                                           ▼
                                        PlanningCycle record (context, proposals, edits, approved, outcome)
                                                           ▼
                                        planOutcome() after the week → next cycle's context → (later) tendencies
```

**Layers and the minimum to build:**

| Layer | Module (proposed) | Pure? | Builds on | First in |
|---|---|---|---|---|
| Adapters | `js/athleteSources.js`: `selfInputs(today)`, `clientInputs(record, today)` | no | `athleteData`, `readinessData`, `readinessV2Data`, `weeklyDecisionData.planDaysFrom`, `clientDirectory.loadClientRecord`, `clientModel.clientSessions` / `coachPlanDays` | P1 |
| Athlete State | `js/athleteState.js` | yes | every engine, called once | P1 |
| Planning Context | `js/planningContext.js` | yes | Athlete State | P2 |
| Planning Brief | `js/planningBrief.js` | yes | Planning Context | P2 |
| Proposal intake | `js/planningProposal.js` | yes | `planPrompt.parseReply` / `checkPlan`, `marathonCoros`, `runWorkout` | P2 (paste), P5 (API) |
| Weekly Planning page | `planning.html` + `js/planningPage.js` | no | all of the above; existing review/preview/Undo | P2 |
| Planning cycle store | `js/planningCycles.js` + rules | no | Firestore | P3 |
| Plan outcome | `js/planOutcome.js` | yes | `linkPlan`, `weekGlance`, `checkWorkout`, `effortResponse`, `trainingOutcomes`, `workoutResults` | P4 |
| AI relay | `cloudflare-worker/planning-relay.js` | — | the removed `ai-helper.js` | P5 |
| Tendencies | `js/planningTendencies.js` | yes | planning cycles | P6 |

`clientModel()` becomes a thin wrapper over `athleteState()`, keeping its output so the Model tab and its tests don't change. Eddie's cards can move onto the state one at a time.

---

## 7. Athlete State v0.1 (P1)

### 7.1 The signal envelope

Every value in the state has the same wrapper. This is what lets the brief and the AI say *why* Southbound believes something.

```js
{
  value: …,                    // number, word, or small object
  unit: "mi" | "s" | "bpm" | "%" | null,
  kind: "measured" | "derived" | "modeled" | "predicted" | "subjective" | "coach" | "athlete" | "vendor",
  confidence: "high" | "moderate" | "low" | "none",   // from the engine's own measure, never invented
  evidence: ["HR 4 bpm lower at the same pace over 14 days (11 easy runs)", …],  // ≤ 3 short lines
  window: { from: "2026-09-08", to: "2026-10-05" } | null,
  asOf: "2026-10-05",
  source: "trainingResponse@0.2.0#efficiencySignal",
  missing: "Needs heart rate on easy runs" | null     // when value is null: what would fill it
}
```

Confidence comes **only** from what each engine already reports:

- race: `confidence` + `grade`
- efficiency: the 2-SE rule (`verdict`) + run count
- effort: answered runs vs the class's prior weight
- readiness: baseline nights (≥ 14) + `missingReason`
- load: `percentile` needs 4 weeks
- durability: `basis` yours / typical
- decision: domain count + votes

Where an engine has no measure of its own, the state says `"none"` and explains in `missing`. It never guesses a number.

### 7.2 Domains (only what exists, no new metrics)

```
identity     who (self | client uid), tier (full | shared | plan-logs | none), counts (runs, nights, mornings, answered)
goals        primaryGoal (A), targetRace { name, date, meters, goalSec } (A/C), daysToRace (D), phase (C), secondaryGoals (A)
fitness      race { sec, lo, hi, confidence, grade, lensesUsed, flags } (P)
             efficiency { verdict, bpm, paceAtUsualHr } (Mo) · coros { vo2max, marathonSec, thresholdPace } (V)
load         recent, base, balance, percentile, words (Mo) · weekToDate (D) · last4Weeks { miles, runs, longRuns, longest } (D)
             mix { easy, threshold, hard } (Mo) · monotony/strain last week (D) · strength { sessions, lbLifted } (M, context) · cross { planned } (C)
response     reading (Mo) · efficiency (Mo) · effort { meanResidual, n, lastFive } (Mo/S) · execution [{ date, title, onTarget, work }] (D) · decoupling (D)
readiness    v2 { score, domains, concern, positives } (Mo) · classic { score } (Mo) · coros recovery (V, shown only) · checkins { morningCount, weekly } (S)
             trust { auc vs baseline, verdict } (D, from the readiness check when it has run)
preparation  durability { readiness, parts, basis, beta, applied } (D/Mo) · keySessions { done, of } (D)
schedule     available days, notes, time, length, where, equipment (A) · generator settings (C) · busy days (self: planner-events) · booked sessions (M)
constraints  injuries / limits (A, training-relevant only) · open change requests (S) · pain/sick flags last 7 days (S)
preferences  workedBefore, notWorked, coachingWants, feedbackStyle (A) · fueling practised (A)
plan         current plan ref { store, id, version }, next 7–14 days as written (C), phase, cutback, race days
decision     weekly decision { level, votes, domains, changes, summary } (Mo) · last 4 logged choices + reasons (C)
unknowns     list of { what, why it matters, how to fill it } from dataCoverage, missingReason, quality.flags, reading "partial"
versions     { ledger, dose, load, response, readinessV2, race, decision } engine versions
```

**What the state never contains:**

- names (beyond the first name, for the brief)
- email, phone or birth year (an age band only)
- emergency contacts
- health-check answers (`healthFlags`, `healthNote`)
- private coach notes
- GPS
- free-text notes from check-ins

This applies to every athlete, Eddie included, because the same state feeds what can be sent out.

### 7.3 Tests for P1

- Unit tests on the made-up athletes already in `tests/athleteFixture.mjs`:
  - every signal has `kind`, `confidence`, `source`
  - nothing from the excluded list appears (a test serializes the state and searches for the profile's phone, email, birth year and health note)
  - `clientModel()` output is identical before and after the refactor (snapshot)
- Browser suites s1–s12 re-run: no number on any card changes.
- Timing: the state is built in under ~1.5 s on a 4×-throttled phone for ~10 years of runs (the s9 bar).

---

## 8. Planning Context and Planning Brief (P2)

### 8.1 Planning Context

`planningContext(state, { weekOf, horizonDays = 7, include })` → a small JSON object, ~3–5k tokens at most.

```
athlete      { firstName, ageBand, sport, experience }                       // no other identity
goal         { primary, race { distance, date, weeksToGo, goalTime }, phase, phaseSource: "coach plan" }
fitness      { predicted { time, range, confidence, basis: ["2 races in 12 months", "training bests"] }, trend? }
load         { where: "71st percentile of your last 12 months", trend: "up 12% this week", last4: [w1…w4 miles/runs/long], mix }
response     { reading, evidence: [...], confidence }
recovery     { readiness, evidence, confidence, trustNote: "readiness has not predicted your rough days better than recent history" }
preparation  { vsUsualBlock: { miles: "48 / 55", longRuns: "4 / 6", longest: "19 / 20" }, basis, learnedEffect }
recent       { last14Days: [{ date, planned, done, status, effort, note? }] }   // compact, one line per day
nextWeek     { asWritten: [...7 day lines in the plan's own format], raceDays, cutback }
constraints  { days, time, equipment, limits, busyDays, bookedSessions }
preferences  { worked, notWorked, wants }
engine       { weeklyDecision { level, votes, summary, suggestedChanges } }   // an input, not the answer
coach        { recentChoices: [{ week, suggested, chose, reason }], notesForThisWeek }
flags        [ "pain reported Oct 3 (left calf)" ]                          // words the athlete chose to share in the log
unknowns     [ { what, why } ]
paces        the pace table / goal-derived paces the plan uses               // the AI picks from these, it doesn't compute them
rules        { maxHardDaysInARow: 1, … }                                     // coach-set planning rules, not safety claims
```

**Selection, not compression:**

- Each section is in the context only when it carries information for this week.
- A domain with confidence "none" goes to `unknowns` instead.
- `include` lets the coach leave a section out before copying or sending (for example, recovery for a client who didn't consent).

**Provenance is kept** in short `evidence` and `confidence` fields, exactly as you asked:

```json
"recovery": {
  "readiness": "74 (green)",
  "confidence": "moderate",
  "evidence": ["HRV within your usual range (7-night average)", "sleep 7h 20m vs 7h 30m need", "morning check-ins normal (4 this week)"],
  "trustNote": "on your history, readiness hasn't flagged rough days better than how your last run went"
}
```

### 8.2 Planning Brief

`planningBrief(context)` → plain text, about one screen. It's used in the page, for Copy, for export and for debugging. These are the eight questions, each 1–3 lines.

> **The example below is made up for illustration; it is not Eddie's data.**

```
WEEKLY PLANNING BRIEF · Eddie · week of Oct 12 (week 13 of 16)

1. Where they are now
   Marathon (Indianapolis, Nov 8, 4 weeks out), goal 3:05. Southbound predicts 3:07 (3:02–3:13, moderate
   confidence: 2 races in 12 months + training bests; COROS says 3:01).
2. What we're trying to accomplish
   Marathon-specific endurance: marathon-pace volume inside long runs, while keeping weekly load near
   the peak before the taper starts in 2 weeks (plan: peak phase).
3. What happened recently
   Last 2 weeks: 53 and 49 mi (plan 37 and 52); long runs 19 and 16 mi; 2 of 3 key sessions done;
   the half-marathon tune-up was skipped (coach's choice).
4. How they're responding
   Easy runs: heart rate 3 bpm lower at the same pace than the 8 weeks before (adapting, moderate
   confidence, 11 runs). Effort: 4 rated runs felt about as hard as usual.
5. Current constraint
   Recent load is in the top 15% of the last 12 months and rose 14% in a week. Recovery signals are normal.
6. Primary training priority (Southbound's reading — the coach decides)
   Durability for the marathon: longest run this block 19 mi vs 20 in your usual marathon block;
   marathon-pace miles in long runs: 7 of the 10–12 your plan intended.
7. Be cautious about
   Stacking the 20-miler with a hard Tuesday and Thursday at this load; the weekly decision says Absorb
   (2 votes: load high, effort slightly up).
8. What's missing
   No effort answer on 3 of 7 runs this week; no laps for Saturday's run (execution can't be checked).
```

Rules for the brief's language:

- **Never "safe" or "unsafe".**
- **No injury prediction.** Pain or sickness says "check in with the athlete first", which matches the decision's Check-in level.
- **Readiness is called "a rough guide"** unless its own check says otherwise.
- **One metric never decides alone.** Section 6 always names at least two lines of evidence or says it can't.

### 8.3 What priority means here

Southbound proposes **candidate priorities with evidence**, and the coach (or the AI, then the coach) chooses. The candidates come from rules that only *read* the state:

- the race's distance and weeks to go
- the plan's own phase (never one invented by Southbound)
- preparation gaps against the athlete's own usual block
- the weekly decision's level
- open flags and unknowns

This is where "a marathon 8 weeks out is not a 5K 8 weeks out" comes in (section 10.1). It uses distance-specific emphases taken from the plan and the athlete's own history, not a hard-coded phase calendar.

---

## 9. Proposals, coach review, approved plan (P2 → P3 → P5)

### 9.1 One proposal shape for every source

```js
Proposal {
  id, source: "paste" | "ai" | "engine" | "coach",
  model?: "claude-opus-5-5",          // when source = ai
  contextHash,                        // ties it to the exact context it saw
  weekOf, createdAt,
  summary: "Keep the 20-miler with 8 at MP; trim Tuesday's reps; Thursday easy.",
  priorities: [{ text, evidence: ["load.percentile", "preparation.longest"] }],
  days: [{
    date, type, miles, durationMin,
    workout: "2mi WU; 6x1mi @ 6:45-6:55; 90s jog; 1.5mi CD",   // the shorthand Southbound already reads
    strength: "none" | "<library name>" | "<custom>",
    purpose: "Threshold stimulus, controlled",
    why: "Fitness is improving (efficiency) but recent load is high, so 6 reps instead of 8.",
    evidence: ["response.efficiency", "load.percentile"],     // must be ids that exist in the context
    confidence: "moderate"
  }],
  cautions: ["…"], uncertainties: ["Durability evidence is moderate: only 2 earlier marathons."],
  questionsForCoach: ["Is Thursday's travel confirmed?"]
}
```

**Southbound checks every proposal before the coach sees it,** whatever its source, and owns the facts:

1. It parses each `workout` with the existing readers (`planDayFromMarathon` with the context's pace table).
2. It recomputes the miles. A mismatch is shown ("the parts add up to 7.9 mi, not 6").
3. It runs `checkPlan`'s "Worth a look" checks: back-to-back hard days, long run share, race day, unavailable days.
4. It drops `evidence` ids the context doesn't contain, and says so.
5. Paces that aren't in the pace table are flagged, not "fixed".

The AI never writes into the plan, and nothing is applied without the coach.

### 9.2 Coach review

The proposal is shown as a diff against the plan as written. The existing pieces cover most of it: `previewChanges`, `compactChange`, the Regenerate preview, the editor's Undo.

- Per day: **Accept**, **Edit** (opens the existing day editor), or **Keep mine**.
- Each edit or rejection can carry a reason (optional, one tap):
  - recent load
  - schedule / travel
  - athlete preference
  - injury or pain
  - I disagree with the evidence
  - race or event
  - other + words
- **Approve** writes to the plan through the plan store's own path:
  - client: into the draft, then the coach's existing **Review & publish** (unchanged, so the client is told the same way as now)
  - self: see section 11
- Nothing reaches a client until the coach publishes, which is exactly how plans work today.

### 9.3 Planning cycle record (P3)

```js
planningCycles/{coachUid}_{athleteUid}_{weekOf}     // athleteUid = coachUid for Eddie's own training
{
  coachUid, athleteUid, weekOf, version: 1,
  context: { …the exact Planning Context, ≤ 40 KB },
  engineVersions: { dose, load, response, readinessV2, race, decision },
  proposals: [ Proposal (≤ 3 kept) ],
  review: [{ date, proposalDay, finalDay, action: "accepted" | "edited" | "kept-mine", reason?, words? }],
  approved: { at, planRef: { store: "coachingPlans" | "self", planId?, version? }, days: [ final day lines ] },
  outcome: null | { …P4 },
  createdAt, updatedAt
}
```

- **Why a new Firestore collection and not the synced data blob:**
  - The main sync doc must stay under 1 MB.
  - A year of cycles per athlete is ~0.5–2 MB, and clients multiply that.
  - The coach needs cycles from any device without loading every key.
- **The rule:** **coach only, no client clause.** This is the same pattern as `coachingPlanDrafts` / `coachingPlanMasters`.
  - Create/update when `coachUid == request.auth.uid` and (`athleteUid == coachUid` or `linked(coach, athlete)`).
  - Known keys only, a size cap per field.
  - It needs a rules test and the usual "paste the whole file" step.
- **What a client could see later:** only what the coach publishes, as now. The "why" lines can go onto the published plan's `workout.why`, which clients already read.

---

## 10. Race-aware planning and the evidence behind it

### 10.1 What should change with the race (from the literature, not invented)

| Point | Source | What Southbound does with it |
|---|---|---|
| Training becomes more race-specific as the race nears (the principle of specificity: general → specific) | Coaching texts: Daniels, *Daniels' Running Formula* (phases: foundation → early quality → transition quality → final quality); Pfitzinger & Douglas, *Advanced Marathoning* (mesocycles toward race pace and endurance). Coaching practice, not trials. | Read the **plan's own phase** (coach-entered) and show race-specific work done vs intended. Never invent a phase from the calendar. |
| Distance changes the emphasis: 5K / 10K lean on VO₂max and speed; half / marathon on threshold, race-pace volume and long-run durability | Same texts; physiological determinants of distance running (e.g. Joyner & Coyle 2008, *J Physiol*: VO₂max, lactate threshold, economy) | The context carries the distance and weeks to go; the candidate priorities differ by distance (marathon: long run + MP volume vs the athlete's usual block; 5K: quality frequency and execution) |
| A taper of about 2 weeks, with volume cut ~40–60% and intensity kept, gives a small average gain | Bosquet et al. 2007, *Med Sci Sports Exerc* (meta-analysis); Mujika & Padilla 2003 (review) | The plan's taper weeks stay the coach's; the decision engine already makes no automatic changes in race week and only "slower end" notes in taper |
| Most endurance training is easy; hard sessions are a minority | Seiler 2010, *IJSPP* (intensity distribution in endurance athletes) | The state reports the mix (easy / threshold / hard) as measured, not as a target |
| Internal and external load answer different questions | Impellizzeri et al. 2019, *IJSPP* ("Internal and external training load: 15 years on") | Already built (audit A3): the dose is external; HR and effort are the response |
| The acute:chronic ratio has no reliable "safe zone" | Impellizzeri et al. 2020, *IJSPP* (ACWR conceptual issues) | No safe ranges anywhere; load is described as where it sits in the athlete's own year |
| The "10% rule" isn't well supported: a graded 10% program didn't reduce injuries in novices; larger jumps (> 30%) were associated with some injury types | Buist et al. 2008, *Am J Sports Med*; Nielsen et al. 2014, *JOSPT* | Replace the chatbot prompt's "≤ 10% a week" rule with the athlete's own recent range ("biggest week in your last 12 months was X"), worded as a coaching guide, not a safety limit |
| People over-trust automated advice, especially when the reasons aren't shown | Parasuraman & Manzey 2010, *Human Factors* (automation complacency and bias) | Every proposed day shows its evidence and confidence; approval is per day; "Keep mine" is as easy as Accept; the coach's reasons are recorded |

### 10.2 What this means for the design

- **Phase is coach-entered and read, not computed.** When a plan has no phase, the brief says "weeks to race: N" and doesn't name one.
- **Distance-specific needs are expressed against the athlete's own history:** their usual block and their earlier races, where it exists (`durability` basis "yours"). Otherwise against a typical plan, and labelled as such.
- **The weekly decision stays an input** to the proposal, shown with its votes. It isn't the answer.

---

## 11. The approved-plan store for Eddie (the biggest structural decision)

Today an approved change to Eddie's week can only go into `training-overrides`:

- the edit overwrites in place
- there's no history or reason
- the next training block needs `WEEKS` rewritten in code

Clients have the full model: versions, generator fingerprints, structured workouts, results with `planVersion`, COROS auto-send.

**Options:**

| | A. Eddie coaches himself in the client plan model | B. Keep `marathonData` + overrides, add a history log | C. A separate "self plan" key in synced data |
|---|---|---|---|
| One store for planning and learning | ✓ | ✗ (two adapters forever) | ✗ |
| Versions, structured workouts, generator, workspace, library, results | ✓ (all existing) | ✗ | rebuild |
| Rules change | Yes: allow `coachUid == clientUid` on plans/drafts/masters/results (no link needed for self) | No | No |
| Work | Medium: the coach's Today, Marathon page, COROS buttons and Weekly Review read a coach plan for self | Small | Medium |
| Indianapolis block | Stays as is until Nov 8 | — | — |

**Recommendation: A, starting with the next block after Indianapolis.**

- Until then, P1–P2 read Eddie's current plan through `planDaysFrom` (the adapter already exists).
- An approval for Eddie writes `training-overrides` through the existing `applyDecision` path, and the cycle record keeps the history the overrides lack.

---

## 12. Plan vs actual (P4)

`planOutcome(cycle, inputs)` runs once the week is over and fills `cycle.outcome`. It makes **no new measurements**; it joins what exists:

```
per day: {
  date, planned: { type, miles, durationMin, intensity: "threshold", expectedEffort: 6 (derived), workout },
  actual:  { sessions: [ids], miles, durationMin, avgPace, avgHr, effort, status: "completed" | "modified" | "missed" | "extra" | "rest" },
  execution?: { onTarget, work, fast, slow },            // self with laps (checkWorkout)
  response?: { effortResidual, hrResidual },             // effortResponse / efficiency rows of that day
  note?: athlete's log note (client) — kept out of any AI context
}
week: { plannedMiles, doneMiles, keyDone/keyPlanned, adherence, flags (new pain / sickness), decisionLevel then, outcomeOf (existing) }
```

- **Status:**
  - *completed* = ≥ 80% of planned miles (the existing `autoDone` rule)
  - *modified* = 30–80%, or a different session type (easy instead of workout)
  - *missed* = planned, nothing run
  - *extra* = run, nothing planned
- **Duplication guard:** status comes from `weekGlance` / `trainingOutcomes`; the outcome only adds "modified" and stores the result.

The Weekly Review gains one line per key session: "Prescribed 6 × 1 mi @ 6:45–6:55 → ran 5, 4 on target, effort 7 (usual 6)". The next cycle's context includes last week's outcome in three lines.

---

## 13. AI integration architecture (P5)

### 13.1 Constraints found

- **Static site** on GitHub Pages; Firebase **Spark** (no Cloud Functions without Blaze).
- **Cloudflare Workers already in use** (`cloudflare-worker/`, the shelved Strava broker), and an AI relay was built and tested there once (`b9de989`).
- **The privacy page promises** "Southbound itself doesn't send anything to an AI service". It allows only the coach's own copy/paste of first name + plan + profile training details, never health-check answers or contacts. Clients consented to wearable/model sharing **with their coach**, not with an AI provider.

### 13.2 Options

| Option | Secret safe? | Data minimized? | Cost / setup | Verdict |
|---|---|---|---|---|
| API key in the page's JavaScript | **No** (public) | — | — | Never |
| Copy/paste with any chatbot (exists) | Nothing to keep | Coach sees exactly what leaves | Free, nothing to set up | **P2: the default** |
| Cloudflare Worker relay, coach-verified (the Sep 27 design) | Yes (Cloudflare secret) | The coach's app sends only the Planning Context; the relay can't read the database | Cloudflare free tier + Anthropic pay-as-you-go | **P5** |
| Firebase Cloud Functions | Yes | Server reads with admin rights: the opposite of minimal | Needs Blaze | Not needed |
| Managed agents / tool-using agent | — | Would need data access | More cost and surface | Overkill: one structured call per week is enough |

### 13.3 The relay, done properly

- **Who:**
  - The coach's signed-in app sends its Firebase ID token.
  - The relay reads `userProfiles/{uid}` *with that token* and requires `isCoachApproved === true`.
  - Firestore verifies the token, and the rules still apply.
  - The relay has **no database credentials of its own**, so it can't reach any athlete's data. It only sees the context the coach's app sent, and that app could only build it from what the rules already let that coach read. Unrelated athletes can't leak through it.
- **What:**
  - Exactly one request shape: `{ context (≤ 40 KB JSON), contextHash, weekOf, coachNotes (≤ 2,000 chars) }`.
  - The relay adds the fixed instructions and the proposal JSON schema itself, so it can't be used as a general AI endpoint.
- **How:**
  - Claude via the Messages API with **structured outputs** (`output_config.format`, a JSON schema).
  - **Not** a forced tool choice: the old relay used one, and the current model rejects it.
  - Default model `claude-opus-5-5`, effort `medium` (its default) or `high`.
  - Thinking is always on for this model.
  - The server-side refusal fallback is enabled.
  - The relay validates the JSON against the schema again before returning it.
- **Logging:** status codes and token counts only. Never the request or response bodies. Cloudflare's own request logs must not be set to capture bodies.
- **Limits:**
  - a monthly spend limit in the Anthropic console (as in the old setup guide)
  - the relay caps the request size and output tokens
  - optionally a per-coach daily count in Workers KV
- **Consent:** Eddie's decision (2026-10-06): **no switch in the app.** He asks each client in person before their training data goes to the AI planner.
  - Before P5 goes live, the privacy page is updated so it stays true: it currently says Southbound itself sends nothing to an AI service.
  - The context only ever holds what section 7.2 allows (no contacts, health check, birth year, words or GPS), whoever has agreed.
- **Retention:**
  - Under Anthropic's commercial API terms, inputs aren't used for training by default and are kept for a limited period. Zero data retention is available by agreement.
  - Check the current terms when setting up, and say what they are on the privacy page.
- **Cost (Opus 5.5 list price, $4 per million input tokens / $20 per million output, thinking billed as output):**
  - One weekly proposal is about 8k input + 5–9k output (proposal + thinking), so roughly **$0.13–0.22**.
  - About $10 a year for one athlete planned weekly; about $200 a year for 20.
  - Prompt caching helps only when the coach regenerates several times within minutes. It's worth adding then, but not a design driver.

### 13.4 What the AI does and doesn't do

- **Does:** interpretation, prioritization, workout choice, sequencing, trade-offs, explanation and uncertainty, all citing context ids.
- **Doesn't:**
  - compute load, paces, predictions or totals (they're in the context)
  - see raw runs, GPS, names, contact details, health checks or private notes
  - write into any plan
  - claim safety or predict injury: the system prompt says so, and the brief's language rules apply to the output

---

## 14. Learning and calibration (P6, later)

Start by **storing** (P3–P4). Once there are enough cycles, plain descriptive summaries come first, each with its *n* and an honest "not enough yet":

- Completion and modification rate by session type (long, threshold, intervals, MP), by weekday, by week load percentile.
- How often the coach changes the proposal, by section and by reason. Which context signals were present when the coach disagreed.
- Effort and HR residuals after each kind of session and after back-to-back hard days (the response engines already make the residuals).
- Weekly response to load (the step-4 dose test, per athlete).
- Whether the coach's overrides were followed by fewer missed or off-target sessions.
  - **Confounded:** the coach overrides for reasons the data doesn't see.
  - It's reported as a pattern, never as proof.

These go back into the context as `tendencies` with their n. They're never used to change a number automatically. The audit's Phase E (per-athlete σ and β, pooling across clients) stays where it is.

---

## 15. Decisions for Eddie

Answered 2026-10-06:

1. **AI inside Southbound:** **yes**, reversing the Sep 27 decision, built after P1–P4 so every AI suggestion is recorded from day one.
2. **Your own plan store after Indianapolis:** **A**, Eddie coaches himself in the client plan model (a rules change, at P3 or with the next block).
3. **Client consent for AI:** **no switch.** Eddie handles consent in person; the privacy page is updated before P5.
4. **Who first:** **Eddie**, then one client who shares the athlete model.

Still open:

5. **Planning preferences fields** (long-run day, workout days, doubles, disliked sessions): add them in P2 only if the first briefs show they're needed. Your generator settings already hold run days and the long-run day for clients.
6. **Where the Weekly Planning page lives:**
   - its own coach page (`planning.html`, Coach menu), with an athlete picker: "Me" + each client
   - plus a **Planning** tab in the Client Hub that opens the same view
   - I recommend both, sharing one module.

---

## 16. P1 in detail (the next step, when you say go)

1. `js/athleteSources.js`: `selfInputs(today)` (wraps `loadModelInputs`, `readinessData.inputs`, `athleteInputs`, `planDaysFrom`, `planner-events`, `athlete-model`) and `clientInputs(record, today)` (wraps the parts `loadClientRecord` already returns + `clientSessions`). One cache per page and day; reset on `sb:athlete-answers`, COROS and Strava updates.
2. `js/athleteState.js` (pure): runs each engine once; returns the domains in 7.2 with the signal envelope; `unknowns` from `dataCoverage`, `missingReason`, `quality.flags`, reading "partial".
3. `clientModel()` rebuilt on top of it, with output unchanged (snapshot test).
4. An "Athlete State" view in Analytics → Data, folded, coach only: each domain, its signals with kind / confidence / evidence / source, and **Copy as JSON** for debugging.
5. Tests: unit (envelope on every signal, no excluded fields, the client snapshot, a thin-data athlete gives "none" + missing, not invented values), browser suites s1–s12 unchanged, the timing bar.
6. No rules change, no AI, no change to any number on any page.
