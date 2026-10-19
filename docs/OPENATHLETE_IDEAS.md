# Ideas from OpenAthlete (2026-10-19)

Eddie asked to take what would help Southbound from [OpenAthlete](https://github.com/openathleteorg/openathlete), an open-source TrainingPeaks/Strava alternative (React + NestJS + PostgreSQL).

**License: AGPL-3.0.** Copying its code into this repo would put the whole site under the AGPL. So we take ideas only and write original code; nothing of theirs is copied.

## Ranked: what's worth taking

| # | Idea | What it gives Southbound | Effort | Status |
|---|---|---|---|---|
| 1 | **Heart rate zones**; PR #77 has the richer version (threshold, % of max, reserve). Still worth adding there: max HR estimated from age, a plain "how it feels" line per zone | A free tool on the website and in the app; runners with a watch ask for it | Small | Built in a sibling thread (PR #77), not here |
| 2 | **A / B / C race priority** | Tells the coach and the plan which race gets the taper and which are training races | Medium (a race field, plan generator reads it; rules change if on the client record) | **Built** 2026-10-19: a race plan can be A, B or C; B tapers one week less, C no taper |
| 3 | **Questions the coach attaches to a workout** (multiple choice or open) | "How did the hills feel?" answered right after the run, not at the weekly check-in | Medium (new field on the workout, answer on the log, rules change) | **Built** 2026-10-19: up to two questions per run (`js/workoutQuestions.js`) |
| 4 | **Injury log over time** (area, pain 0–10, Worsening / Stable / Improving / Resolved, linked to the run it came up on) | Today pain is a flag in a check-in and areas on the profile; a log shows the trend | Medium–large (new collection + rules) | **Built** 2026-10-19 as a read-only Pain log in the Client Hub, from existing logs and check-ins, no new collection (`js/painLog.js`) |
| 5 | **Weather on each run** (free Open-Meteo, no key) | Explains a slow hot run; the fueling heat setting could use it | Medium | **Built** 2026-10-19 as tap tags (hot, humid, cold, windy, rain, snow) on the run log; no auto forecast, since a lookup would send where they run to a third party (`js/runConditions.js`) |
| 6 | **Grade-adjusted pace** for hilly runs | "What that hilly run was worth on the flat" | Medium (needs per-second data, which COROS imports have) | Idea |
| 7 | **Folders and repeating workouts** in the coach library | Keeps the library tidy as it grows; "every Tuesday" in one step | Small–medium | Idea |
| 8 | **Live calendar subscription** (a feed URL, not a one-time .ics) | The week updates itself in Google / Apple Calendar | Large (needs a server: Cloud Functions + Blaze) | Later |

## Not taking

- **Fitness / fatigue / form (CTL / ATL / TSB):** Southbound's athlete model deliberately keeps load and response separate and shows COROS's own numbers (`docs/ATHLETE_MODEL_AUDIT.md`). Adding another load number would compete with it.
- AI agents and their MCP server, self-hosting, subscriptions, Garmin / Polar / Suunto sync (already a known gap that needs Garmin's partner program).
