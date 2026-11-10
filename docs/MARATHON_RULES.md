# Southbound marathon rulebook

Eddie's rules for a marathon plan, agreed 2026-11-10. `js/marathonEngine.js` builds plans from these, and every number below lives in its `RULES` table. Change a rule here and in that table together.

Lines marked **Eddie** are his words. Lines marked **Engine** are how the engine fills the gaps, and Eddie can change any of them.

## Principles (Eddie)
- A new stimulus every 4 weeks.
- Mileage has to be sustainable for the person.
- The week is built around a high-quality long run workout and/or a high-quality speed workout earlier in the week.
- Long run: 20 miles or 3 hours, whichever comes first.
- Repeat the same workout early and late to measure progress and build confidence. 800m repeats are the main one.
- Periodic down weeks as the miles climb.
- Race week: 3 x 1 mile at race pace on the Tuesday before a weekend race.
- The plan adapts to injury, a missed workout, not feeling great and long travel. Small changes apply on their own with a note to the coach. Big ones wait for the coach.
- The coach hand-edits only to make a plan more specific to the runner. Hand edits are always kept.

## What the runner is asked
Race date, goal time, a recent race, current weekly miles, longest recent run, run days, long-run day, injury history, first marathon or not. The coach can also set the ramp, the peak miles, one or two key sessions a week, and the 800s reps and rest.

## Paces (Engine)
- A recent race sets the paces (VDOT, `js/vdot.js`). With only a goal time, paces come from the goal and the coach is told they are unproven.
- A goal more than 3% faster than the recent race suggests: race-pace work follows current fitness and the coach is warned.
- With nothing to go on, workouts use effort words.

## Blocks
- **Eddie:** 4-week blocks, one stimulus each.
- **Engine:** the last block is the peak week plus the taper. Blocks before it, first to last, by how many fit: Base, Hills, Speed, Threshold, Threshold strength, Marathon specific. A 16-week plan is Speed, Threshold, Marathon specific, Peak and taper. Leftover weeks at the front are "Settle in" weeks at current miles.
- **Engine:** the taper is 3 weeks (2 when the plan is under 12 weeks).

## Down weeks (Eddie approved the system 2026-11-10)
- The last week of every block is the down week. The taper replaces it in the last block.
- Normal ramp: up, up, up, then 20% down. Careful ramp: up, hold, up, then 25% down. Experienced: up, up, up, then 15% down.
- In a down week the long run is 30% shorter and easy, and the speed session has about two-thirds of the reps at the same pace.
- The 800s test never lands in a down week.
- **Engine:** the week after a down week goes one step above the last high. (Holding it at the last high left careful runners building 18 to 23 miles a week in 16 weeks.)

## Mileage (Engine)
- Starts at current miles. An up week adds 6% (careful), 8% (normal) or 10% (experienced), at least 1 mile and at most 5.
- Builds to about 1.4x (careful), 1.5x (normal) or 1.35x (experienced) of current miles. A low base may double, up to 32 / 36 / 40 miles a week, or the long run never gets long enough.
- Injury history forces the careful ramp. 45+ miles a week defaults to experienced. Everyone else is normal.
- The long run is at most half the week on 3 or 4 run days, 45% on 5, 40% on 6 or 7.

## Peak miles and the long run target (Eddie, 2026-11-10)
- **Eddie:** the coach sets the peak weekly miles for the plan, and the plan builds to it over time. The long run goes up to 20 miles for a marathon (10 for a half).
- **Engine:** `peakMiles` is the most miles in one week. The plan climbs just fast enough to arrive at it in the peak week, never faster than the runner's ramp. A peak too far away to reach safely stops short and the coach is told. With no peak set, the engine picks one from current miles.
- **Engine:** `longTarget` defaults to 20 and can be lowered, never raised past 20. The long run climbs evenly to it, limited by the 3-hour rule and by its share of the week. A peak too low to hold the target gives a warning that names the weekly miles needed.
- Half marathon plans: see "Half marathon" below.

## The week (Engine)
- Speed day: Tuesday when it is a run day, otherwise the earliest run day that is not next to the long run.
- Runners in their first marathon or under 25 miles a week get one key session a week: speed and the long run workout take turns. Everyone else gets both.
- The day after the long run is a recovery run on 5+ run days.

## Long run workouts (Engine)
- Base, Hills: easy. Speed: the last week finishes 2 miles steady. Threshold: last 2, 3, 4 miles steady. Threshold strength: last 2, 3, 4 miles at race pace.
- Marathon specific: 2 x 3, 2 x 4, 3 x 3 miles at race pace with 1 mile easy between. Peak week: 3 x 4. Race-pace miles are capped at 35% / 50% / 60% of the long run by ramp.

## 800s test
- **Eddie:** 8 to 10 x 800 with 1:00 to 2:00 easy jog.
- **Engine:** plan week 2 and the peak week (about 4 weeks out), the same session both times. Careful 8 with 2:00, normal 8 with 1:30, experienced 10 with 1:30. Target pace is between 5K and 10K pace.

## Race week
- **Eddie:** 3 x 1 mile at race pace on the Tuesday. **Engine:** 2:00 easy jog between; for a race on another day, the run day closest to five days out. Two days out is rest, the day before is a 2-mile shakeout.

## Not built yet
Adapting (injury, missed, travel), Today pointing at Eddie's own plan, and sending a week to the watch. The coach's screen is built (see `docs/APP_REFERENCE.md` "Marathon plan screen"). See the phases in `docs/APP_REFERENCE.md` "Marathon engine".

## Half marathon (Eddie approved, 2026-11-10, "go")
Same system as the marathon, scaled down. `settings.raceType: "HALF"` (or `distance`), table `DISTANCES` in `js/marathonEngine.js`.
- 8 to 20 weeks. Four-week blocks, a new stimulus each block, week 4 a down week (same percentages).
- Long run climbs to 10 miles (never above), 2:30 limit for slow runners. Down-week long run 30% shorter.
- Taper: 2 taper weeks plus race week (1 taper week under 10 weeks). About 75% then 55% of the biggest week; long runs 85% then 70% of the top long run.
- Race week Tuesday: 3 x 1 mile at half pace, 2:00 jog, same placing rules as the marathon.
- Last block "Half-marathon specific": 2 x 2, 3 x 2, 2 x 3 miles at half pace; peak week 3 x 3. Long runs finish with 2 to 3 race-pace miles. Other blocks are the marathon's.
- 800s test: same (plan week 2 and the peak week).
- Peak: normal 1.5x current, careful 1.4x, experienced 1.35x. Ceilings 28 / 40 / 60. A low base may double up to 22 / 26 / 30.
- Key sessions: both every week, one at a time for a first half or under 25 miles a week (the marathon's rule).
- Paces: from a recent race (same fitness model); race pace is the half's own, from the goal when it is within 3% of fitness.

## 5K and 10K (Eddie approved 2026-11-10; doubles wait)
`settings.raceType: "5K"` or `"10K"`. Table `DISTANCES` and `RULES.shortTiers` in `js/marathonEngine.js`. Research notes and sources: `/mnt/project-files/marathon-generator/5k10k-rulebook-draft.md`. The numbers are starting values from standard coaching sources, not validated on real runners.
- **Five levels** by weekly miles: Beginner (under 15), Intermediate (under 30), Advanced (under 50), Competitive (under 65), Elite high school (65+). Injury history steps one level down. The coach can pick the level. Peak ceilings 5K: 25 / 40 / 55 / 70 / 85; 10K: 30 / 45 / 60 / 75 / 85.
- **Quality days:** Beginner and Intermediate: one key session a week, taking turns with a long run workout. Advanced and up: a speed day plus a second quality day (threshold, hill sprints or tempo), at least two days from the speed day and the long run when the run days allow it, plus the long run.
- **Blocks** (new stimulus every 4 weeks, down week closing each): Base, Hills, Strength (threshold, hill sprints), VO2max (800s, 1K, 1200s), then 5K specific or 10K specific. Fewer weeks drop blocks from the front. The 10K leans on threshold (tempo 25 to 30 min, 2-mile repeats) and finishes long runs at 10K pace.
- **Long run:** 5K up to 12 miles or 100 minutes, 10K up to 14 miles or 110 minutes, at most 30% of the week. Unless the coach sets a target, the plan aims for 6 / 8 / 10 / 12 / 12 miles by level (10K: 8 / 10 / 12 / 14 / 14).
- **Taper:** two taper weeks plus race week (one taper week under 10 weeks), about 80% then 60% of the biggest week, intensity kept.
- **Race week:** 5K: 4 x 600 at 5K pace, 2:00 jog. 10K: 3 x 1 mile at 10K pace, 2:00 jog. Placed about five days out, nothing hard within two days of it.
- **800s test** as the marathon. **Time trial** (optional, Mile or 3200): the same trial in the same two weeks, on the second quality day (needs Advanced and up).
- **Tune-up races** (coach-entered dates): the race replaces that week's hardest work; other hard days within two days become easy. A date that is off a run day, outside the plan, on race day or within 10 days of the race is left out with a note.
- **Goal times** for a 5K or 10K read as minutes:seconds ("17:45", "38:30"); a marathon or half goal still reads hours:minutes ("3:30").
- Paces add 3K and mile pace for the reps and strides. Not built: doubles, cross-country courses, altitude and heat.
