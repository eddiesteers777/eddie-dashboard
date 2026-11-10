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
- Half marathon plans (long run to 10) are not in the engine yet.

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
Adapting (injury, missed, travel), the coach's screens, Eddie's own plan, and sending a week to the watch. See the phases in `docs/APP_REFERENCE.md` "Marathon engine".
