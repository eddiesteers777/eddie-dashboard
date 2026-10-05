# Southbound Athlete Model — Full Audit and Recommended Architecture

*2026-10-05. An audit before any production change, as asked.*

**Status:** A1–A2 built (race model 0.2.0: COROS raw, preparation shown not applied, backtest scores the trim both ways). A3 built (dose 0.3.0: load = external; heart rate and effort kept apart as internal). A4 built (readiness v2 0.2.0 body-only; readiness check 0.2.0 on non-circular outcomes with a "what you already knew" baseline and a week-block bootstrap, E3 now 0.51; decision replay judged on missed sessions and new pain, with the simple way to beat). A5 built (Weekly Review's week so far against the same weekday of the last 8 weeks, with a band from their own spread). A6 built (COROS compared on week-to-week changes with Spearman ρ, a ±7-day lag scan and where each puts today in its own 90 days; E5 now 0.20 on changes for unrelated loads vs 0.96 on levels). Phase A done. B5 built (CR-10 words with a scale on every answer, old answers read on CR-10 but never rewritten, delay kept, late answers count half, Today waits 15 minutes after a run). B6 built (decision 0.2.0: load, response and recovery vote as groups, recovery at most twice, the effort shortcut removed).

This audit covers everything from the raw watch data through to the weekly decision, and both pages that show it (Analytics and Weekly Review). The code was read in full. Wherever a claim could be tested, it was tested:

- **Time-ordered backtests** on synthetic athletes whose true race times are known.
- **Controlled experiments** that run the real Southbound modules unchanged.
- **Reading of the literature.**

There is no real athlete data in the development sandbox. So every number below that comes from a simulation shows what a design choice does under a stated assumption about the truth. It says nothing about Eddie's own data. The plan in section 7 builds the same comparisons into Model check, so Eddie's real races and runs can answer the questions the simulations can only frame.

Labels used throughout:

- **[Established]**: well supported in the literature.
- **[Assumption]**: a reasonable modeling choice, not validated.
- **[Hypothesis]**: a Southbound idea that needs testing.
- **[Shown here]**: demonstrated in this audit's experiments.

---

## 1. Full audit summary

The athlete model has good bones. It keeps an honest session ledger, compares everything against the athlete's own baselines, refuses "safe zone" ratios, and its race backtest uses only data from before each race. Those are the right instincts, and most of the parts are individually reasonable.

The problems are in **how the parts connect**. Seven matter most.

1. **The same information is counted more than once.** Three places:
   - **Load and response.** Heart rate and RPE are blended into the training load. The same heart rate and RPE are then used as the "response" signals. A run that simply *felt* harder raises both the load concern and the response concern in the weekly decision. [Shown here: identical runs reported as RPE +2 and HR +6 bpm move recent load from the 37th to the 80th percentile of the year. The decision then counts two warning domains instead of one.]
   - **COROS and durability.** COROS's prediction already reflects the athlete's training. Southbound applies its own durability penalty to COROS anyway.
   - **Readiness v2 and the weekly decision.** Both re-aggregate the same five domains, and v2 folds stimulus (load) and adaptation (response) into "current state".

2. **Two validations are circular, so they flatter the model.**
   - **Readiness check.** It defines a "rough run" with the same effort and heart-rate residuals that readiness v2 already contains. [Shown here: in a simulated world where HRV, sleep and check-ins carry *no* information, v2 still scores AUC 0.64 against rough runs, while Classic and HRV score 0.51–0.52.]
   - **Weekly decision replay.** It uses the same rough-run definition, so it has the same problem.

3. **The race model's durability is a fixed, hand-built penalty, and the backtest can't test it.**
   - **What it does.** It compares the athlete's mileage and long runs with a population volume table. Then it penalizes the training lens, COROS and shorter races.
   - **Why it double-counts.** The personal distance exponent, learned from the athlete's own race pairs, already captures most of their durability.
   - **What the simulation shows.** [Shown here] With a real block-to-block effect, the fixed penalty helps marathon accuracy only slightly. Without one, it costs about 0.5 percentage points of MAE and adds about 0.7% slow bias. The backtest can't tell which world Eddie is in, because it never runs the model with the penalty off.

4. **COROS is not compared raw.** The backtest's "COROS" column is COROS *after* Southbound's durability penalty, so it can't say how good COROS itself is. [Shown here: raw COROS beats penalized COROS in all four simulated worlds.]

5. **Prediction ranges are too narrow, and the stated confidence isn't checked against reality.**
   - **Races treated as independent.** Several races are combined as if their errors were unrelated. In fact they share the athlete's distance-scaling error, so each extra race shrinks the range more than it should.
   - **Under-coverage.** [Shown here] The "80%" range covers 73–78% of outcomes.
   - **Fixed thresholds.** The "High / Moderate" labels are fixed at ±2.5% / ±5%, not calibrated against the athlete's own record.

6. **Weekly Review compares part of a week with whole weeks.** "40% of your usual week, 3 of 7 days in" is arithmetically true and useless. [Shown here: a normal week reads under 80% of "usual" on 99% of days before Sunday. A same-weekday median over the previous 8 weeks centers on 1.0 and misreads 0–4% of the time.]

7. **The COROS load comparison can't tell the coach anything.** It is a Pearson correlation between two smoothed 42-day load levels. [Shown here: two load series built from *independent* daily loads correlate at a median |r| of 0.98 on their levels, but only 0.11 on week-to-week changes.]

**The pages.**
- **Analytics** grew one card per build step. Coaching content and model diagnostics sit interleaved, and race prediction appears in two places.
- **Records** appear in three places.
- **No single place** answers "how confident are we and why".
- **Weekly Review** reports facts but doesn't tell the week's story or carry the decision. The decision lives on Today.

**Recommendation in one line:** keep the parts, rewire the joints.
1. Separate **external load** (stimulus) from **internal response** (how it landed).
2. Keep **capability**, **preparation** and **current state** as separate outputs.
3. Use COROS raw as independent evidence, and explain disagreements.
4. Make every validation test something the model didn't already use.
5. Let uncertainty come from the athlete's own track record as it grows.

---

## 2. Current architecture (as built)

```
SOURCES            COROS runs (coros-run-history), COROS laps, COROS health (HRV, RHR, sleep,
                   stress), COROS fitness (recovery %, marathon prediction, threshold, load),
                   Strava archive (strava-history), Running Log, coach-plan logs (clients),
                   answers: session-rpe, race-results, readiness-checkins
                           │
LEDGER             athleteLedger.sessionsFrom → one list, COROS wins duplicates, Strava aliases
  (measured)       linkPlan (plan day ↔ closest run), attachAnswers (RPE, race, plan-day RPE)
                           │
PARAMS             athleteParams: hrMax (2nd highest day, 18 mo), hrRest (30-day median),
  (derived)        efforts (training bests 120 d, races excluded), personalExponent (race pairs,
                   shrunk to 1.06), speedCurve, critical speed
                           │
ANCHORS            sessionDose.weeklyAnchors: v60 (1-hour race speed) per week from races +
  (modeled)        training bests × 0.97 + exponent, else COROS threshold; HR max/rest
                           │
DOSE               rawDose: pace load (rTSS-like, IF² × h × 100, climb × 6), HR load (TRIMP),
  (modeled)        effort load (min × RPE) → chooseDose: weighted GEOMETRIC MEAN of all
                   three on the pace scale (ratios calibrated per athlete) → one number/run;
                   intensity domains from pace laps, else HR, else RPE
                           │
LOAD STATE         EWMA τ42 "base", τ7 "recent", balance, percentile of recent in the year,
  (modeled)        weekly totals, monotony/strain, loadTotals (days/weeks/months, effort load),
                   corosComparison (Pearson of EWMA levels vs COROS load)
                           │
RESPONSE           efficiency (easy-run HR vs speed residual vs 8-wk baseline, Theil–Sen),
  (modeled)        effort vs expected (RPE − class average), quality-rep HR, execution
                   (laps vs plan targets), long-run decoupling → a "reading"; doseBacktest
                           │
READINESS v1       HRV vs COROS range 40%, RHR 20%, sleep 25%, COROS recovery 15%, feel 15%
READINESS v2       autonomic + sleep + feel + RESPONSE + LOAD (z-scores vs own baselines)
  (modeled)        readinessCheck: AUC of morning score vs "rough runs"
                           │
RACE CAPABILITY    lenses: races (moved by exponent), training (best effort × trainingFactor),
  (modeled)        COROS (marathon only); DURABILITY penalty on training, COROS, shorter races;
                   inverse-variance mean; χ² widening; × trackRecord; 80% = ±1.28σ
RACE BACKTEST      each race from data before it: Riegel, VDOT, last time, lenses, full model
                           │
WEEKLY DECISION    5 concern domains (load, response, autonomic, sleep, subjective) → count
  (decisional)     → Proceed/Absorb/Ease/Recover/Check in → plan changes; replay vs "trouble"
                           │
VIEWS              Today: readiness, This week, effort card · Analytics: trends, load+response,
                   capability, races, 4 model checks, decision log, records, data
                   Weekly Review: cards (miles, strength, cross, nutrition, recovery, gear),
                   training load this week, nutrition by day, summary · Client Hub: Model tab
```

**What each layer actually is:**

| Layer | Measured | Calculated | Modeled | Displayed only |
|---|---|---|---|---|
| Ledger | distance, time, avg/max HR, climb, laps, HRV, RHR, sleep | dedup, plan link | — | — |
| Answers | RPE, race confirmation, check-ins | — | — | — |
| Params | — | hrMax, hrRest, best efforts | exponent (shrinkage), CS, v60 | — |
| Dose | — | pace IF, TRIMP, sRPE | the blend and its ratios, climb factor | — |
| Load | — | daily sums, weekly totals, monotony | EWMA "base"/"recent" (a smoothing choice, not physiology) | percentile |
| Response | — | residuals | baselines, expected effort, reading rules | — |
| Readiness | — | z-scores | weights, score mapping, caps | COROS recovery (v2) |
| Race | — | lens arithmetic | σs, trainingFactor, durability, track record, ranges | — |
| Decision | — | domain counts | thresholds, levels, plan percentages | — |

---

## 3. Problems found

Severity: **A** = producing misleading results now, **B** = weakens validity, **C** = presentation.

### 3.1 Race prediction (Part 4)

| # | Problem | Sev |
|---|---|---|
| R1 | **COROS gets Southbound's durability penalty** (`device.sec * pen`). COROS's predictor already uses the athlete's training. Penalizing it double-counts preparation, and the lens stops being an independent opinion. [Shown here] Raw COROS has lower MAE and bias than penalized COROS in all 4 simulated worlds (e.g. 1.98% vs 2.12% MAE, bias +0.68% vs +0.92%). | A |
| R2 | **The backtest's "COROS" row is penalized COROS** (`out[l.key] = l.sec`). So "is COROS any good for Eddie?" can't be answered today. | A |
| R3 | **Durability double-counts the exponent and is untestable.** The personal exponent from race pairs already contains how the athlete fades with distance. The absolute volume table then penalizes low-volume athletes again, and it scales its target with the *predicted* time: a faster prediction raises the volume target, which slows the prediction (a feedback loop). There is no "durability off" variant in the backtest. [Shown here] With no real block effect, the penalty costs ~0.45 pp marathon MAE (2.12 → 1.65%). With a real within-athlete effect (up to 5% slower after a thin block), turning it off costs 0.2–0.3 pp. Expected loss favors *learning* it over assuming it. | A |
| R4 | **Race lens treats races as independent.** σ = √(1/Σwᵢ) shrinks with every race, yet all races share the exponent's error and the athlete's current-form error. Ranges are too narrow. [Shown here] Nominal 80% covers 73–78%. Using the best single race's σ covers 91–97% (too wide). The truth is in between, which is what empirical calibration is for. | B |
| R5 | **Fixed lens σs (3%/5%/6%) and confidence thresholds.** Treated as facts. They should be priors that the athlete's own backtest errors replace. | B |
| R6 | **trainingFactor pools all distances.** A 5K race vs training ratio is applied to a marathon target. It is calibrated on the same races as the track record (two calibrations, same small sample). The track record does real work, though: [Shown here] removing it doubles the slow bias (+0.7% → +2%). | B |
| R7 | **Training lens takes the minimum across distance bands.** The fastest of several noisy estimates is biased fast (selection on noise). trainingFactor partly absorbs this, but only for the band mix the athlete happens to have. | B |
| R8 | **Track-record clamp is asymmetric** (0.90–1.12). Defensible (bad days are slower, not faster), but it should be documented as such. | C |

### 3.2 Durability (Part 5)

The concept is sound [Established: Maunder et al. 2021; Jones 2024 call durability the "fourth dimension". Vickers & Vertosick 2016 found weekly mileage predicts marathon time beyond a shorter race, and that Riegel is badly optimistic for the marathon in recreational runners.]

The implementation is a hypothesis presented as a correction:

- **The volume table** ([150 min → 70 mi/wk … 360 → 25]) is a plausible summary of typical plans [Assumption]. It is not a measured relationship for this athlete.
- **The maximum penalties** (8% marathon, 3% half) and the long-run counts (4 × 18 mi) are [Assumption].
- **It is absolute, not relative.** The literature supports volume as a *between-athlete* predictor (Vickers & Vertosick). The race lens already carries between-athlete information through the personal exponent. What remains to model is the *within-athlete* question: is this block thinner than this athlete's usual? [Shown here] A relative version (this block vs the athlete's own median 12-week block) beats the absolute one when a block effect exists (1.93% vs 2.00% MAE). It still loses to no penalty at all when there is no block effect.

**Conclusion:**
- **Show preparation separately.** Preparation should be a separate, visible evidence domain ("Preparation: 82% of your usual marathon block; 3 of your usual 5 long runs").
- **Don't apply it by default.** Its effect on the time should come from a coefficient learned from the athlete's own goal races and shrunk toward zero, applied **once** to the final estimate. It should never touch COROS and never be stacked on the exponent.

### 3.3 Training load (Part 6)

| # | Problem | Sev |
|---|---|---|
| L1 | **The blended dose mixes stimulus and response.** In Impellizzeri's framework [Established: Impellizzeri, Marcora & Coutts 2019], external load is what was done and internal load is how it landed; their *relationship* is the response. Blending them into one load erases that relationship and then re-uses its components as response signals (see 4). [Shown here] Same runs, RPE +2, HR +6: blended weekly load +20%, pace load unchanged; percentile 37 → 80; decision domains "none, none" → "load: mild, response: strong". | A |
| L2 | **One scalar ratio puts TRIMP and RPE onto the pace scale.** Pace load ∝ IF², TRIMP ∝ x·e^(1.92x), sRPE ∝ RPE (linear). Their ratio changes with intensity, so a single median ratio over-scores easy runs and under-scores intervals (or the reverse) depending on the athlete's mix. | B |
| L3 | **The geometric mean has no stated statistical meaning.** It is a reasonable compromise [Assumption], but its weights (1 / 0.8 / 0.8, ×0.6, ×0.5…) are hand-set and unvalidated. | B |
| L4 | **The dose test favors internal measures by construction.** It asks whether HR-based load predicts HR residuals and effort-based load predicts effort residuals. Same-signal autocorrelation will make them look good. | B |
| L5 | **The climb factor (1 m up = 6 m flat) uses total ascent only and ignores descent.** Published rules range from ~6 to 10 (ITRA uses 100 m ascent = 1 km). For a road runner it barely matters; on trails it can move load ±15%. Keep it, labelled [Assumption]; prefer lap-level grade later. | C |
| L6 | **EWMA τ 42/7 and "base/recent"** are conventions [Assumption]. Their use as *descriptions* is fine. The percentile of recent load is honest, observational and not a risk claim. Good. Monotony/strain [Established: Foster 1998] are descriptive; there is no injury claim, rightly. The "fatigue" half of fitness-fatigue models is poorly identifiable [Established: Hellard 2006; Marchal et al. 2025], which supports *not* deriving readiness from load. | C |

### 3.4 RPE (Part 7)

| # | Problem | Sev |
|---|---|---|
| E1 | **Scale anchors are non-standard and have a duplicate.** 2 and 3 are both "Easy"; "Steady", "Comfortable", "Near max" aren't the validated CR-10 anchors. Session-RPE validity [Established: Foster et al. 2001] rests on the CR-10 anchors (0 rest · 1 very easy · 2 easy · 3 moderate · 4 somewhat hard · 5 hard · 7 very hard · 10 maximal). | B |
| E2 | **Timing is uncontrolled.** The card asks for 3 days and Weekly Review for the whole week, so some answers come days later. Foster's method uses ~30 min after the session; later recall drifts. The rating time is already stored (`at`), so the delay can be measured and late answers down-weighted or flagged. | B |
| E3 | **RPE now feeds load (blend), response (effort vs expected) and decision (effortHigh).** That is three uses of one number. | A |
| E4 | **Missing RPE is handled gracefully.** The dose falls back and the response says "few". Good. | — |

### 3.5 Training response (Part 8)

**Reliable enough to keep and trust [Assumption, sound]:**
- Easy-run efficiency against a rolling own baseline: Theil–Sen, 2 bpm + 2 SE threshold, summer note.
- Workout execution against plan targets.

**Noisy and not validated:**
- Quality-rep HR: few reps, and lap boundaries are imprecise.
- Long-run decoupling: confounded by heat and fueling.
- Effort vs expected: heavily shrunk class defaults; small n.

**Reuse:**
- Efficiency and effort are the *same* signals readiness v2 and the decision use, so the response layer is counted three times downstream.
- The "reading" table (Adapting / Tired, hot or sick…) is a sensible coach-facing rule set [Hypothesis]. It should stay a *description*, not a score.

**What can be validated:**
- Efficiency → later race results (does an "Adapting" block precede races faster than predicted?).
- Execution → race-pace sessions.

These are slow to accumulate, but they are honest. The present validations use the response signals to predict themselves.

### 3.6 Readiness (Part 9)

| # | Problem | Sev |
|---|---|---|
| D1 | **v2 is not "current state".** It includes response (adaptation) and load (stimulus). That is exactly the "one opaque score" that should be avoided. | A |
| D2 | **The readiness check is circular** (outcome built from the response residuals v2 includes). The bootstrap resamples days independently, ignoring day-to-day correlation, so its intervals are too narrow. There is no "persistence" baseline (yesterday's rough-run residual), which is the honest null for a persistent outcome. [Shown here: v2 AUC 0.64 when nothing about the body predicts anything.] | A |
| D3 | **v1 counts load twice.** It uses HRV *and* COROS recovery %, and COROS recovery already folds in HRV and training load. | B |
| D4 | **The autonomic method is sound** [Established: Plews et al. 2013, 7-day rolling ln HRV against an individual baseline; ±0.5 SD as smallest worthwhile change]. Keep it. Subjective wellness is often *more* sensitive than objective markers [Established: Saw, Main & Gastin 2016]. Keep its weight. | — |

### 3.7 Weekly decision (Part 10 / 13)

- **Five domains are counted as independent votes**, but they aren't:
  - Load (blended) shares inputs with response.
  - Sleep and autonomic are physiologically linked.
  - Subjective feel and effort-vs-expected are both self-report.
- **`effortHigh` is a sixth use of RPE.**
- **The replay's "trouble" uses the same rough-run definition** (circular).

The policy itself (dial-down only, race-week guard, Undo, logging) is good practice and should stay.

### 3.8 Pages (Parts 3, 10, 16)

**Analytics:**
- **Race prediction in two places.** The Trends "Race prediction" panel (COROS line) and Race capability.
- **Records in three.** "All your running", "Personal Records", "Fastest efforts".
- **COROS numbers in three.** Training Snapshot, Trends, Load comparison.
- **Model checks scattered.** Four model-check panels interleaved with coaching content.
- **Stale hero.** The countdown/phase hero duplicates the Marathon page.
- **No "what should I investigate" or "how sure are we" summary.**

**Weekly Review:**
- **The "%" readings mislead** (partial week vs whole weeks; fixed in part already).
- **No decision on the page.** It lives on Today.
- **Nutrition and gear take equal space with training.**
- **No week-in-a-sentence.**

### 3.9 COROS comparison (Part 12)

- **Load:** Pearson on two EWMA levels (spurious, see summary item 7).
- **Prediction:** the COROS lens is penalized (R1), so disagreement can't be explained.
- **What's needed:** COROS raw; Southbound's capability (no preparation); preparation; final. Plus a decomposition of *why* they differ: different evidence, different distance scaling, or preparation.

---

## 4. Double-counting risks (dependency map)

```
                ┌──────────────── RPE ────────────────┐
                │                 │                   │
          blended dose      effort vs expected     effortHigh rule
                │                 │                   │
          LOAD (EWMA) ──► decision "load"     decision "response"  ──► LEVEL
                │                 │        readiness v2 "response"
          readiness v2 "load"     │
                │           readiness check OUTCOME ("rough run")  ◄── same residuals
                └─ decision replay "trouble" ◄────────┘

          HR ──► TRIMP ──► blended dose ──► LOAD
          HR ──► easy-run efficiency residual ──► response (decision, readiness v2, outcome)

          Training (pace, HR) ──► COROS predictor ──► COROS lens
          Training bests ──────────────────────────► training lens
          Mileage / long runs ─► durability penalty ─► training lens, COROS lens, shorter races
          Race pairs ──► personal exponent (already encodes fade with distance) ─► race + training lens
          Races ──► race lens; ──► exponent; ──► trainingFactor; ──► track record
          HRV + load ─► COROS recovery % ─► readiness v1 (alongside HRV itself)
```

| Shared information | Where it's used | Verdict |
|---|---|---|
| RPE | dose blend, response, `effortHigh`, readiness v2, readiness/decision outcomes | **Fix (A):** RPE belongs to *internal load / response*, once |
| HR | TRIMP in dose, efficiency, readiness v2, outcomes | **Fix (A):** HR in response only; in load only when pace can't measure the run |
| Mileage/long runs | load, durability penalty, and (via the athlete's history) the exponent | **Fix (A/B):** preparation as its own domain, applied once, learned |
| Training | training lens and COROS lens | **Accept, but model it:** the two lenses' errors correlate, so the combined σ must not shrink as if independent |
| Races | race lens, exponent, trainingFactor, track record | **Accept with care:** that's how calibration works. Shrinkage is already there; keep n visible |
| HRV and load | readiness v1 (HRV + COROS recovery %) | **Fix (B):** show COROS recovery, don't score it (v2 already does this) |
| Domain votes | decision counts correlated domains as independent | **Fix (B):** group into recovery state / response / stimulus |

---

## 5. Research findings

| Topic | Status | What it means here |
|---|---|---|
| Session RPE (Foster 2001) | Established | Valid internal-load measure on the CR-10 scale, ~30 min after. Use the CR-10 anchors; keep it as *internal* load. |
| Internal vs external load (Impellizzeri, Marcora & Coutts 2019) | Established framework | Keep them separate. The internal:external relationship is the response. |
| Banister TRIMP | Established (as a measure) | Fine as internal load. Not a substitute for external load. |
| Fitness–fatigue / impulse-response | Weak for prediction | Ill-conditioned, fatigue part poorly identifiable (Hellard 2006; Marchal et al. 2025, Sci Rep). Use EWMAs as descriptions only. |
| Foster monotony / strain | Established descriptors | Descriptive only. No validated injury thresholds. |
| ACWR | Discredited as a risk zone | Mathematical coupling creates spurious correlation (Lolli et al. 2019; Impellizzeri et al. 2020). Southbound correctly avoids it. |
| Riegel (1981) | Established, limited | Good to the half. Optimistic for recreational marathoners (Vickers & Vertosick 2016). The personal exponent is the right fix. |
| VDOT | Established, same limitation | A different curve on the same race, not a separate lens. Correctly a backtest comparator. |
| Critical speed | Established | From training data it predicts the marathon with ~7.7% error; runners race at ~85% of CS, more for faster ones (Smyth & Muniz-Pumares 2020). Weaker than races; a useful training lens later. |
| Big-data race prediction (Emig & Peltonen 2020) | Established | An aerobic index plus an *endurance index* (fade with duration) from everyday runs predicted race times within ~2%. Supports a per-athlete endurance parameter (the exponent) over a volume table. |
| Durability (Maunder et al. 2021; Jones 2024) | Established concept, immature measurement | Real, but how to quantify it from field data is still research. Treat Southbound's version as a hypothesis. |
| Training volume and marathon time (Vickers & Vertosick 2016) | Established, between athletes | Supports volume as a between-athlete predictor. Says nothing about a fixed per-block penalty. |
| HRV monitoring (Plews et al. 2013) | Established | 7-day rolling ln HRV vs an individual baseline. Already done well. |
| Subjective wellness (Saw et al. 2016) | Established | As or more sensitive than objective markers. Keep the morning check-in central. |
| Empirical / conformal intervals | Established statistics | With few races, use the athlete's own past prediction errors as the error distribution, blended with a prior. This is the simplest honest method. |
| Rolling-origin validation | Established statistics | Every backtest must use only earlier data. Southbound already does this for races. Extend it to load, readiness and decision checks, with outcomes that don't share inputs. |

**Sources:**
- [Impellizzeri, Marcora & Coutts 2019, IJSPP](https://www.semanticscholar.org/paper/Internal-and-External-Training-Load:-15-Years-On.-Impellizzeri-Marcora/4d499852205d05f789ccdea1c79d13569140471f)
- [Foster et al. 2001, JSCR](https://pubmed.ncbi.nlm.nih.gov/11708692/)
- [Vickers & Vertosick 2016, BMC Sports Sci Med Rehabil](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5000509/)
- [Lolli et al. 2019, mathematical coupling in ACWR](https://www.researchgate.net/publication/320847733_Mathematical_coupling_causes_spurious_correlation_within_the_conventional_acute-to-chronic_workload_ratio_calculations)
- [Maunder et al. 2021, durability](https://www.semanticscholar.org/paper/The-Importance-of-%E2%80%98Durability%E2%80%99-in-the-Physiological-Maunder-Seiler/479720103dc3c41c0e67ae577850b73023ae600e)
- [Jones 2024, the fourth dimension](https://physoc.onlinelibrary.wiley.com/doi/full/10.1113/JP284205)
- [Plews et al. 2013, HRV monitoring](https://www.researchgate.net/publication/249321195_Training_Adaptation_and_Heart_Rate_Variability_in_Elite_Endurance_Athletes_Opening_the_Door_to_Effective_Monitoring)
- [Saw, Main & Gastin 2016, BJSM](https://www.researchgate.net/publication/282360724_Monitoring_the_athlete_training_response_Subjective_self-reported_measures_trump_commonly_used_objective_measures_A_systematic_review)
- [Emig & Peltonen 2020, Nat Commun](https://www.nature.com/articles/s41467-020-18737-6)
- Smyth & Muniz-Pumares 2020, *Med Sci Sports Exerc* 52(12):2637–45 (critical speed from raw training data)
- [Hellard et al. 2006](https://coachsci.sdsu.edu/csa/vol161/hellard.htm)
- [Marchal et al. 2025, Sci Rep](https://www.nature.com/articles/s41598-025-88153-7)

---

## 6. Recommended architecture

Ten stages. Each has one job, and each stage's output is only *read* downstream, never re-derived from the same inputs.

```
 1 RAW DATA ──► 2 SESSION LEDGER ──► 3 SESSION CHARACTERIZATION
                                         │ external: distance, time, pace/IF, climb, structure
                                         │ internal: HR (TRIMP, HRr), RPE (CR-10, sRPE)
                                         ▼
          4 EXTERNAL LOAD (stimulus) ◄──┘──► 5 INTERNAL:EXTERNAL RESPONSE (per session)
                 │ EWMA history, week/month,           │ easy-run efficiency, RPE vs expected,
                 │ intensity mix, long runs,           │ quality-rep HR, execution, drift
                 │ same-weekday expectations           ▼
                 │                               6 TRAINING RESPONSE (trend, 2–3 weeks)
                 ▼                                      │ Adapting / Steady / Unusual / Not enough
          7 CAPABILITY (fitness, fully prepared)        │
                 │ races (exponent), training lens,     │
                 │ COROS RAW, calibrated by track record│
                 ▼                                      │
          8 PREPARATION (race-specific)                 │     9 CURRENT STATE (readiness)
                 │ this block vs own usual + typical    │        HRV, RHR, sleep, morning feel
                 │ (evidence; time effect learned)      │        (no load, no response)
                 ▼                                      ▼             │
          RACE ESTIMATE = capability × preparation effect (learned, once)
                 │  ranges from the athlete's own backtest errors (+prior)
                 ▼
         10 DECISION: stimulus (4) × response (6) × current state (9) × flags
                 → Proceed / Absorb / Ease / Recover / Check in, with the evidence listed
```

| Stage | Inputs | Output | Kind | Must NOT influence | Validated by |
|---|---|---|---|---|---|
| 2 Ledger | sources, answers | sessions | measured | — | dedup unit tests |
| 3 Characterization | session, laps, anchors | IF, TRIMP, sRPE, class | derived | — | unit tests |
| 4 External load | pace load (HR only when pace can't measure: treadmill, trail without climb) | daily/weekly/monthly, EWMA, mix | derived/descriptive | readiness score | stays descriptive; tested only as a *predictor* in the dose test |
| 5 Response per session | internal vs external | residuals | modeled | load | residual stability; later races |
| 6 Training response | residual trends | reading + confidence | modeled | readiness score | later races; execution |
| 7 Capability | races, training bests, COROS raw, exponent | time + σ (fully prepared) | predictive | preparation, readiness | race backtest per lens |
| 8 Preparation | 12-wk volume, long runs, specific sessions vs own blocks | % of usual + learned effect | modeled (learned) | COROS lens, exponent | backtest on/off |
| 9 Current state | HRV, RHR, sleep, feel | state + which signal moved | modeled | capability, load | non-circular readiness check |
| Race estimate | 7 × 8 (+ taper/race-day state later) | time + empirical range | predictive | — | coverage of the range |
| 10 Decision | 4, 6, 9, flags | level + evidence | decisional | — | replay vs outcomes NOT in its inputs (completed sessions, pain/sick reports, later race vs prediction) |

**Why this order.** Capability and preparation stay apart because they answer different questions: "what is the engine" and "is it built for *this* distance". COROS stays raw so that Southbound can say *why* it disagrees:
- "COROS says 2:59. Your races and training say 3:04 fully prepared."
- "Your preparation is 85% of your usual marathon block."
- "We don't yet know how much that costs you (no past races with a thin block)."

---

## 7. Exact formula / logic changes (proposed)

### Race (A)

1. **COROS lens: raw.**
   ```
   COROS lens = COROS marathon prediction × (meters / 42195)
   ```
   No durability. σ_COROS starts at 6% [Assumption] and is replaced by the athlete's own COROS error once ≥ 3 races have a COROS prediction before them:
   ```
   σ = √[(k·0.06² + Σ eᵢ²) / (k + n)],   k = 2
   ```

2. **Backtest rows for each lens before and after any adjustment**, plus the variants *durability on / off* and *COROS raw / penalized*. Eddie's own races then answer R1–R3.

3. **Race lens σ with shared error:**
   ```
   σ_R² = 1 / Σwᵢ  +  ρ · σ̄²
   ```
   where σ̄ is the mean single-race σ. Start ρ at 0.5 [Assumption, between the two simulated extremes], then calibrate as in 5.

4. **Preparation, not a penalty:**
   ```
   prep = mean( min(1, weekly / usualWeekly),
                min(1, long / usualLong),
                min(1, longest / usualLongest) )
   ```
   `usual*` is the median of the athlete's earlier 12-week blocks before goal races at that distance. Before there are 2 such blocks, it falls back to the typical table, shown as "typical", not "yours".
   ```
   effect = β · (1 − prep)
   β ~ prior 0 (± 8% marathon, ± 3% half), updated by least squares
       on log(actual / capability) vs (1 − prep) over past goal races, shrunk toward 0
   ```
   Applied **once**, to the final estimate. With no learned β, the shown time uses β = 0 and the card says what a thin block *could* cost, from the range of the prior.

5. **Ranges from the athlete's own errors.** Keep a running list of the log errors of the full model's day-before predictions (the backtest already makes them).
   ```
   width_80 = quantile_0.8(|e|) over the athlete's errors at that distance band,
              blended with the model σ:
   σ_final² = (m · σ_model² + n · σ_emp²) / (m + n),   m = 3
   ```
   Confidence labels come from σ_final, and the card says "your last N predictions at this distance were within X%".

6. **trainingFactor per band** (≤ 12 km / half / marathon), each shrunk to the pooled value.

### Load (A)

7. **Stimulus = external load.**
   ```
   stimulus_dose = pace load
                   (HR-based only if pace unusable: treadmill, trail without climb, GPS failure;
                    miles-only fallback as now)
   ```
   This feeds EWMA, percentiles, the weekly decision's load domain and the week-to-date comparison.
   - **Internal load is kept and shown:** TRIMP and sRPE, per session and per week. The "effort load" already exists.
   - **The blended number is kept for display** as "Southbound session load (blended)", or retired; it no longer feeds decisions. *This reverses part of the 2026-10-05 change*, for the reason in L1.

8. **Response per session**, from internal vs external:
   ```
   effortResidual = RPE − expected(class, duration)        (as now)
   hrResidual     = HR − expected(speed)                   (as now)
   loadRatio      = sRPE / pace load  vs the athlete's median   (new, descriptive)
   ```

9. **Week-to-date:**
   ```
   expected(through weekday d) = median over the previous 8 full weeks
                                 of the load cumulated through weekday d
   ```
   Show "on track / ahead / behind" when |log ratio| > the 80th percentile of the same ratio in those 8 weeks. [Shown here: misreads normal weeks 0–4% of the time vs 77–100% now.] The same is done for miles.

### Readiness and decision (A)

10. **Readiness = current state only:** autonomic (as v2), sleep (as v2), feel (as v2). Response and load are dropped from the score and shown beside it. COROS recovery is shown, not scored (as v2).
11. **Readiness check without circularity:**
    - Outcomes that readiness does not contain: the planned session completed as prescribed (execution on target), session skipped or cut short, a pain or sick report in the next 2 days.
    - A **persistence baseline**: yesterday's outcome.
    - A **block bootstrap** (7-day blocks).
12. **Decision domains grouped:**
    - **stimulus:** external-load percentile + rise.
    - **response:** efficiency or effort; counted once, the stronger of the two.
    - **recovery state:** autonomic + sleep + feel; counted at most twice when ≥ 2 of the 3 agree.
    - **flags.**

    `effortHigh` is removed (already inside response). The replay's "trouble" is judged on outcomes from 11.

### RPE (B)

13. **Scale:** CR-10 anchors (0 Rest · 1 Very easy · 2 Easy · 3 Moderate · 4 Somewhat hard · 5 Hard · 6 – · 7 Very hard · 8 – · 9 – · 10 Maximal). Stored with `scale: "cr10"`; existing answers keep `scale: "sb1"`. They are re-mapped where anchors differ (sb1 "Steady 5" ≈ CR-10 3–4) only for *comparisons*, never silently rewritten.
14. **Timing:**
    - Store `delayMin` (rating time − run end).
    - The Today prompt appears ≥ 15 min after the run ends.
    - Ratings given more than 24 h later count at half weight in the response baselines and are marked "rated late".

### COROS comparison (A/B)

15. **Load:**
    - Spearman ρ of **week-to-week changes** (ours vs COROS's Base Fitness and Load Impact), with a lag scan of ±7 days.
    - Plus the standardized gap: z(ours) − z(COROS) over 90 days.
    - Shown as "move together / partly / not" with n.
16. **Prediction:**
    - Show COROS raw, Southbound capability, preparation, final, plus a one-line reason for any gap > 2% (which evidence drives each).
    - The backtest gives COROS's own MAE/bias on the athlete's races.

---

## 8. Analytics page redesign

**Purpose:** what is happening over time, how sure we are, and what to look into. One question per section, in coaching order.

| Section | Answers | Contents (from existing parts) |
|---|---|---|
| **0. Summary strip** | H. What to investigate | 3 auto-generated lines at most, e.g.: "COROS and Southbound differ by 5%: no race since May", "Only 4 of 11 runs rated this month", "Easy-run HR down 4 bpm over 3 weeks". Each links to its section. |
| **1. Capability** | A. What can they run? | Race capability with lenses (races, training, COROS raw) → capability → preparation → final + empirical range + "last N predictions within X%". Your races (confirm / not a race). Bests (merges Personal Records, All your running's records, fastest efforts). |
| **2. Training** | B. How much? | External load: weekly/monthly volume and load, intensity mix, long runs, plan vs actual. Internal load beside it (sRPE, TRIMP). Key workouts (execution). |
| **3. Response** | C. How are they responding? | The reading. Easy-run efficiency trend. Effort vs expected. Long-run drift. Each with its n and confidence. |
| **4. Recovery** | D. Are they recovering? | HRV / RHR / sleep trends vs baseline (the current Body panel). Readiness history. Morning feel. |
| **5. Preparation** | E. Ready for the target race? | This block vs own usual and typical. Long-run progression. Race-specific sessions done. |
| **6. Model check** (collapsed) | F/G. How sure, and why | Race backtest (per lens, raw COROS, durability on/off, range coverage). Load-measure test (non-circular). Readiness check (non-circular, persistence baseline). Decision log + replay. COROS agreement. |
| **7. Data** | — | COROS / Strava connections and imports. Data coverage (HR on X%, laps on Y%, RPE on Z%, HRV nights). |

**Removed or merged:**
- Trends "Race prediction" (into 1).
- "Training Snapshot" COROS cards (into 7).
- Duplicate records (into 1).
- The marathon countdown hero (kept as one line in 0).

**Each number labelled as one of:** *measured* (plain), *calculated* (plain), *estimated* (with ±), *prediction* (with range and "based on").

---

## 9. Weekly Review redesign

**Purpose:** what happened this week, what it means, what to do next. Readable in one scroll; a story, not a spreadsheet.

1. **This week in a sentence.** "Week 12: 41 of 52 planned miles, both key workouts done, easy runs costing a little more heart rate than usual; recovery normal → Proceed."
2. **Week at a glance.** Planned vs done by day (runs, strength, cross-training), key workouts marked. Miles and runs vs plan.
3. **Training stimulus.**
   - External load through today vs the same-weekday expectation ("on track / ahead / behind", with the band).
   - Intensity mix vs usual. Long run's share.
   - Internal load (sRPE) beside it, with the ratio note when it's unusual.
4. **Response.** RPE vs expected this week (rated N of M), easy-run efficiency, workout execution, "unusual" sessions listed.
5. **Recovery.** Sleep vs need, HRV/RHR vs baseline, morning check-ins, all as *changes from their usual*.
6. **What the model thinks.** One reading: Adapting / Steady / Accumulating fatigue / Unusual response / Not enough evidence, with what's missing.
7. **Decision.** The weekly decision moves here, or is mirrored from Today: level, the evidence chips (stimulus / response / recovery), Apply / Not this week. **Why** is the evidence list itself.
8. **Next week.** The plan's next 7 days with any suggested changes, and the one thing to watch.
9. **Rate this week's runs** (as now) and **other** (nutrition adherence, gear alerts), compact, at the end.

**Client vs coach:** see section 10.

---

## 10. Client vs coach

| Item | Coach Analytics | Client Analytics* | Coach Weekly Review | Client Weekly Review* |
|---|---|---|---|---|
| Race estimate + range | ✓ with lenses | ✓ time + range + "based on" | — | — |
| Lenses, exponent, σ, backtests | ✓ (Model check) | — | — | — |
| Load (external), mix, long runs | ✓ | ✓ simplified | ✓ | ✓ miles, sessions, "on track" |
| Internal load / ratios | ✓ | — | ✓ | — |
| Response reading | ✓ with evidence | ✓ one sentence | ✓ | ✓ one sentence |
| Readiness / recovery | ✓ trends | ✓ own trends | ✓ | ✓ |
| Decision + evidence | ✓ log, replay, policy | — | ✓ | ✓ "Your coach adjusted…" only |
| Data coverage | ✓ | ✓ "rate your runs" nudges | — | ✓ |

\* Client Analytics and Weekly Review don't exist yet (both pages are coach-only today). The client sees Today, My Progress and the Model tab output through the coach. This table is the target if they're opened up.

---

## 11. Backtest and experiment results

All synthetic, reproducible, using the real modules. Methods, then results.

**E1. Race model, known truth.**
- **Athletes.** 150 synthetic athletes × 8 sixteen-week blocks (tune-up 10K + goal half or marathon). Each athlete's exponent depends on their usual volume (between-athlete durability).
- **Optional within-athlete block effect.** Up to 5% slower after a thin block.
- **COROS.** Either already reflects the athlete's volume, or predicts from capability via Riegel. A per-athlete bias of −2% ± 2%.
- **Method.** Every goal race from block 3 on, predicted from data before it by the real `predictRace`, with one switch changed at a time.

Marathon MAE % / bias % / 80% coverage (n = 450 per cell):

| World | Current | COROS raw | No durability | COROS raw + correlated races | Relative durability + COROS raw |
|---|---|---|---|---|---|
| Block effect real, COROS knows volume | 2.00 / +0.98 / 74 | 1.93 / +0.74 / 77 | 2.19 / +0.27 / 73 | 1.84 / −0.02 / 93 | 1.93 / +0.66 / 78 |
| Block effect real, COROS capability only | 2.01 / +0.92 / 74 | 1.97 / +0.68 / 76 | 2.30 / +0.22 / 70 | 1.97 / −0.13 / 91 | 1.97 / +0.61 / 78 |
| No block effect, COROS knows volume | 2.12 / +0.92 / 76 | 1.98 / +0.68 / 78 | **1.65** / +0.18 / 84 | 1.89 / −0.11 / 92 | 2.03 / +0.60 / 78 |
| No block effect, COROS capability only | 2.17 / +1.09 / 73 | 2.02 / +0.84 / 77 | **1.67** / +0.34 / 83 | 1.96 / +0.21 / 92 | 2.07 / +0.76 / 75 |

**Readings:**
- **COROS raw ≥ penalized** everywhere.
- **The best durability choice depends on a fact we don't know** → learn it.
- **Removing the track record** raises marathon bias to +1.9–2.3% (it earns its place).
- **Ranges under-cover with independent races and over-cover with fully correlated ones** → empirical calibration.
- **Half:** all variants within 0.1 pp. Durability matters little at the half.

**E2. Load / response double count.** One year of identical runs. In the last 7 days only RPE (+2) and HR (+6 bpm) change.

| | Normal week | "Tired" week |
|---|---|---|
| Blended load | 457 | 547 (+20%) |
| Pace load | 409 | 409 |
| Recent-load percentile, blended | 37 | 80 |
| Recent-load percentile, pace only | 8 | 8 |
| Decision domains | load none, response none | load **mild**, response strong |

**E3. Readiness check circularity.** 20 simulated athletes. HRV, RHR, sleep and check-ins are pure noise; run quality persists day to day (AR(1) 0.8). Mean AUC:

| Method | AUC |
|---|---|
| v2 | **0.64** |
| v1 | 0.51 |
| HRV | 0.52 |
| feel | 0.51 |

An honest check would show all four near 0.5.

**E4. Week-to-date.** 400 synthetic weeks (rest Monday, long run Sunday, cutback every 4th week, the odd sick week, the long run sometimes on Saturday). Normal weeks:

| Estimator | Tue | Thu | Sat |
|---|---|---|---|
| Current (vs full-week median) | 0.14, reads low 100% | 0.50, 99% | 0.68, 77% |
| Same-weekday median, 8 weeks | 1.08, 3% | 1.06, 0% | 1.06, 0% |

**E5. COROS correlation.** Independent daily loads, smoothed into 42-day bases with their own build-ups: median |r| **0.98** on levels (86% above 0.7), **0.11** on week-to-week changes.

**On Eddie's real data:** not available in the sandbox. Phase A adds the variants above to Model check, so Analytics will show these comparisons on his own races once the code is live.

---

## 12. Test results (this audit)

- **No production code was changed.**
- **Experiments run against the unmodified modules:** `sessionDose`, `loadState`, `trainingResponse`, `weeklyDecision`, `readinessBacktest`. The race experiments used a copy of `raceCapability` with one switch per variant, checked to reproduce the current model exactly (140 predictions, 0 s difference) when every switch is at its current value.
- **Existing suites:** last full run (2026-10-05, the Mark Done / Weekly Review batch) was 470 static, 63 rules, and 15 of 16 browser suites. The one failing suite (Phase H calendar) fails identically on the code before that batch.
- **Gate for implementation:** every change in section 7 gets unit tests (formulas, missing-data paths, no-race / no-COROS / half / marathon athletes) and a browser suite, and the existing suites re-run, before anything is merged.

---

## 13. Remaining assumptions (after the proposed changes)

1. Pace load's form: IF² × hours, rTSS-like [Assumption]. The climb factor of 6 [Assumption].
2. v60 from races and training bests × 0.97 [Assumption, calibrated per athlete over time].
3. EWMA time constants of 42/7 days: descriptive conventions.
4. Exponent prior 1.06 ± 0.03 (Riegel), shrinkage weights.
5. Starting priors for σ (races 3% + 0.5%/month, training 5%, COROS 6%) and the race correlation ρ = 0.5, until the athlete's own errors take over.
6. Preparation prior β ~ 0 ± 8% (marathon), ± 3% (half).
7. Readiness z-score → score mapping, and the ±0.5 SD smallest worthwhile change.
8. Decision thresholds and dial-down percentages (Eddie's policy, editable).
9. Expected-RPE class defaults until the athlete's own history replaces them.

---

## 14. Implementation plan

Modular. No new Firestore collections, no rules change. All existing data kept. Each phase is its own build → test → report step.

### Phase A — Critical corrections

| | Change | Files | Effect |
|---|---|---|---|
| A1 | COROS lens raw. Backtest rows for raw/penalized COROS and durability on/off. Lens values before/after adjustment kept. | `raceCapability.js`, `raceBacktest.js`, `raceCapabilityCard.js` | Honest COROS comparison; Eddie's races start deciding durability |
| A2 | Durability shown as **preparation**, not applied, until a learned β exists (β = 0 by default; the card says what a thin block *could* cost) | `raceCapability.js` (+ version 0.2.0) | Removes the untested penalty from the headline time |
| A3 | Stimulus = external load. Decision, readiness and percentiles read it. Internal load and the blend are kept for display. | `sessionDose.js` (dose 0.3.0), `loadState.js`, `weeklyDecision.js`, `readinessV2.js`, `weeklyLoad.js`, `loadCard.js` | Ends the RPE/HR double count |
| A4 | Readiness check and decision replay with non-circular outcomes, a persistence baseline and a block bootstrap. v2 without response/load. | `readinessBacktest.js`, `readinessV2.js`, `weeklyDecision.js` | Validations that can fail |
| A5 | Week-to-date same-weekday expectation | `loadState.js`, `weeklyLoad.js` | Weekly Review "on track" that means something |
| A6 | COROS load comparison on week-to-week changes (Spearman + lag) | `loadState.js`, `loadCard.js` | Comparison that informs |

**Timing note:** Eddie plans to lock the Indianapolis prediction before Nov 8. A1–A2 change that prediction's method. The lock stores its model version, so the cleanest order is **A1–A2 before locking**. Alternatively, lock now, and the card will show the 0.1.0 lock next to a 0.2.0 estimate.

### Phase B — Model improvements

- **B1.** Race lens shared-error σ.
- **B2.** Empirical ranges from the athlete's own errors.
- **B3.** trainingFactor per distance band.
- **B4.** Learned preparation β with shrinkage, relative to the athlete's own blocks.
- **B5.** RPE: CR-10 anchors with a scale version, delay stored, late ratings marked, the prompt ≥ 15 min after a run.
- **B6.** Decision domains grouped (stimulus / response / recovery state), `effortHigh` removed.
- **B7.** v1 readiness: COROS recovery shown, not scored.

### Phase C — Analytics

Restructure into the 8 sections of section 8. Summary strip, merged records, Model check collapsed into one section, data coverage, labels measured / calculated / estimated / prediction.

### Phase D — Weekly Review

The story layout of section 9. The decision and its evidence on the page, the next 7 days, nutrition and gear compact.

### Phase E — Calibration as data accumulates

- **E1.** Per-athlete σ and β fully empirical (≥ 5 goal races per band).
- **E2.** Hierarchical pooling across clients for priors (σ, β, expected RPE by class) once several clients share data, so a new client starts from the group, not from Southbound's guesses.
- **E3.** Critical-speed lens from training data, weighted by its own backtest.
- **E4.** Re-test whether the blended internal load ever *predicts* something external load doesn't. If not, retire it.

---

## 15. Next best improvement

**A1 + A2 together:**
- COROS raw.
- Durability shown as preparation and taken out of the headline until learned.
- Backtest variants for both.

**Why first:**
- **Smallest, most contained:** one module and its card.
- **Removes the double count you named.**
- **Decides before the race lock:** it changes the number Eddie is about to lock for Indianapolis, so it should happen before Nov 8.
- **Makes later evidence count:** every race from now on tests durability on Eddie's own data instead of assuming it.

A3 (external load for decisions) is the most important *conceptual* fix and comes immediately after.
