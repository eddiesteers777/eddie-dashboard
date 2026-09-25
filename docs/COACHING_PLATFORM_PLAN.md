# Southbound Coaching — Deep-Dive Client Experience & Coaching Platform Upgrade

## Purpose

This document is a deeper redesign brief for Southbound Coaching.

The goal is **not** to add a few more pages to the existing app. The goal is to turn Southbound into a real **coach-delivery platform** where:

- Eddie builds and updates a client's program from the coach side.
- The client opens the Southbound app and immediately sees the current plan.
- Running, strength, cross-training, fueling, check-ins, progress, scheduling, and coach communication live in one connected experience.
- The client never has to wonder, "Where is my workout?"
- Eddie never has to wonder, "Which version of the plan is this client looking at?"
- The client experience feels worth paying for every month.

The target philosophy is:

> **Powerful for the coach. Simple for the client.**
>
> **One plan. One calendar. One source of truth.**

This document should be treated as a product/architecture handoff for another ChatGPT/Codex session working on the Southbound repository.

---

# 1. The Most Important Finding

Southbound already has many of the pieces needed for this.

The current repo has:

- client accounts and approval
- coach/client relationships
- active services
- running plans
- race plans
- training plans
- a running calendar
- strength programming
- strength scheduling
- a workout mode for strength
- cloud sync
- coach editing of running/training plan data
- weekly client check-ins
- booking/scheduling
- fueling
- COROS integration
- progress/analytics infrastructure
- a coach dashboard

The issue is **how these pieces are connected**.

Today the system is still partially built around:

> "This user's app has some local data, and a coach can mirror a subset of that data."

That is not the ideal architecture for a paid coaching product.

The stronger model is:

> **The coach owns the prescribed program.**
>
> **The client owns the execution/results.**
>
> **Southbound connects the two.**

That distinction is the biggest architectural change recommended in this document.

---

# 2. What Is Already Good in the Current Repo

Based on direct inspection of the current repository:

## Account / client foundation

The current system already has:

- `userProfiles/{uid}`
- client approval/status
- services such as:
  - `online_coaching`
  - `running`
  - `strength`
  - `soccer_1on1`
  - `soccer_group`
- `coachLinks`
- client/coach security rules

This is a strong base.

## Coach-client plan sharing

The current implementation already has:

- `sharedPlans/{clientUid}`
- coach-side access to Training Plans and Running/Race Plans
- per-plan coach notes
- coach editing
- last-write-wins timestamps

This proves the coach-delivery concept is already underway.

## Weekly check-ins

The check-in system already supports:

- client submission
- coach review
- coach feedback
- history
- email notifications

This should become one of the major feedback loops of the platform.

## Scheduling

The current scheduling system supports:

- coach availability
- blackout dates
- booking requests
- recurring requests
- approve/deny
- client cancellation
- session notes

Again, this should become part of the client's unified record rather than remaining a separate utility.

---

# 3. The Biggest Current Limitation

The current coach editor is too shallow for a serious coaching product.

Today, the coach-side plan editor essentially lets the coach edit:

- workout/day type
- mileage
- session text

That is useful, but it is not enough for the service Southbound is trying to sell.

A professional coaching plan needs to let the coach prescribe **what the athlete is actually supposed to do**.

For running that means things such as:

- warm-up
- intervals
- distance/time
- pace
- pace range
- RPE
- heart-rate target
- recovery interval
- cooldown
- cadence target when relevant
- workout instructions
- fueling instructions
- hydration target
- coach note
- optional start time

For strength that means:

- exercise
- sets
- reps
- weight prescription
- percentage when appropriate
- RPE
- RIR
- tempo
- rest
- exercise order
- supersets/circuits
- exercise demonstration
- exercise-specific instructions
- coach notes
- substitutions
- completed result

That is the direction used by mature coaching products.

TrainingPeaks currently supports structured workouts based on duration/distance and intensity targets such as pace, heart rate, power and RPE; its strength builder supports exercise prescriptions, coach notes, instructions, demonstrations and RPE/RIR.

TrainHeroic similarly centers coach-created sessions, exercise/program libraries, videos, session instructions, messaging and training history.

---

# 4. What Runna Gets Right for the CLIENT

Runna is particularly useful as a reference for the client experience because it makes a complex training plan feel simple.

Current Runna documentation describes:

- a Today experience showing what is planned that day
- a Plan area for the full plan
- a Calendar showing upcoming sessions and completed workouts
- week-by-week navigation
- workout cards
- the ability to move individual workouts temporarily
- a progress/completion view
- strength sessions appearing alongside running in the same training calendar
- detailed workout stages
- an adjustment system when life disrupts the plan
- calendar synchronization

Runna's visual product language is also important: the plan is not presented as one giant spreadsheet. It is presented as a **week with daily workout cards**, and the athlete can drill into one workout when it is time to train.

The Runna feature imagery shows this week-oriented plan model with a visible week number, completion progress, coach guidance, and daily cards.

### Southbound should borrow the PRODUCT PATTERN, not copy the design.

The pattern is:

**Plan → Week → Day → Workout → Execute → Complete → Feedback**

That is exactly the direction Southbound should move.

---

# 5. The New Southbound Client Experience

The client should not open Southbound and feel like they are opening a collection of tools.

They should feel like they are opening:

> **My training plan.**

The app's core experience should become:

## TODAY

The most important screen.

Example:

---

### TODAY

**Week 7 · Marathon Build**

**Tuesday · Sept 29**

### Tempo Run
6.0 mi

**Warm-up**
1.5 mi easy

**Main Set**
3 × 1 mi @ 8:05–8:15/mi

2:00 easy jog between reps

**Cool-down**
1.5 mi easy

**Coach**
> Keep this controlled today. The goal is threshold work, not a race.

**Fuel**
30–45g carbs/hr  
16–24 oz fluid/hr

[ Start Workout ]

---

Below that:

### THIS WEEK

MON
Easy Run ✅

TUE
Tempo Run → TODAY

WED
Strength

THU
Recovery Run

FRI
Rest

SAT
Long Run

SUN
Rest

---

This should be the first thing a paid client sees.

---

# 6. The WEEK VIEW Should Be the Heart of Running

The current running calendar exists, but it should become much more deliberate.

The weekly client view should look conceptually like:

```text
WEEK 7
Sept 28 – Oct 4

18.5 / 32 mi completed
4 / 6 sessions completed

MON
Easy Run
5 mi
✅ Complete

TUE
Tempo Run
6 mi
→ TODAY

WED
Strength
45 min

THU
Recovery
4 mi

FRI
Rest

SAT
Long Run
12 mi
Fueling Plan Attached

SUN
Rest
```

The client should be able to tap any day.

Each day opens the **Workout Detail** screen.

This is much closer to the successful pattern used by Runna's calendar and TrainingPeaks' workout cards than simply displaying a list of generic workouts.

---

# 7. Each RUNNING WORKOUT Should Be a Real Workout

This is a major upgrade.

Instead of storing:

```text
session = "5 x 800 @ 5K pace"
```

store an actual structured workout.

Example:

```text
Workout
  title: "5 x 800m @ 5K Effort"

  warmup
    1.0 mi easy
    mobility
    strides

  block
    repeat: 5
      800m
      target: 5K pace
      recovery: 400m easy jog

  cooldown
    1.0 mi easy

  coachNote
    "Stay relaxed. The fifth rep should look like the first."

  fueling
    optional
```

This has enormous long-term value.

It means Southbound can later:

- show the athlete exactly what to do
- calculate planned duration
- calculate planned distance
- create device-compatible workouts
- compare planned vs actual
- show compliance
- attach fueling
- analyze workouts
- generate better progress reports
- reuse workouts from a library

TrainingPeaks already uses this structured-workout concept and can translate prescriptions into athlete-specific targets.

---

# 8. Running Workout Execution

When the athlete taps:

**START WORKOUT**

the experience should switch from "calendar" to "training mode."

For an interval workout:

```text
TEMPO RUN

Warm Up

1.0 mi
Easy

[ Start ]
```

Then:

```text
MAIN SET

1 / 5

800 m
8:00–8:10 / mi

Recovery
400 m Easy

[ Complete Interval ]
```

The system does not have to become a full Garmin replacement on day one.

The initial goal is:

> **Tell the athlete exactly what to do.**

Later:

- COROS
- Apple Watch
- Garmin
- Strava
- device workouts
- GPS activity matching

can provide richer execution data.

---

# 9. Planned vs Completed Is Critical

This should become a core data model.

Never mix these concepts:

```text
planned workout
completed workout
```

They are not the same thing.

Example:

### Planned

6 mi

Tempo:

3 × 1 mi @ 8:05–8:15

### Completed

6.2 mi

Average pace: 8:11

Intervals:

8:08
8:12
8:19

RPE: 8/10

Athlete note:

> Felt good until the last rep.

Then Southbound can show:

**Completed**
✅ 6.2 / 6.0 mi

**Workout compliance**
92%

**Coach review**
> Last rep drifted. Keep this week's next quality day controlled.

This is much more valuable than a simple `completed: true`.

TrainingPeaks explicitly emphasizes planned-vs-completed comparison and visual compliance indicators on workout cards.

---

# 10. RUNNING: What the Athlete Should Be Able to Record

For a planned run:

- completed / skipped
- actual distance
- actual duration
- pace
- RPE
- optional heart rate
- optional elevation
- optional device activity
- athlete note
- pain/discomfort flag
- fueling completed
- hydration completed

Later, device integrations can fill these automatically.

---

# 11. STRENGTH Needs an Even Bigger Upgrade

The existing Southbound strength system is already technically impressive for a personal workout builder.

It has:

- exercise library
- custom exercises
- days
- sets
- reps
- weight
- RPE
- rest
- supersets
- circuits
- workout mode
- rest timer
- completion
- workout summary

But it is currently primarily a **personal workout builder**, not a true **coach-to-client strength programming system**.

That distinction matters.

The athlete needs to see:

> **Wednesday — Lower Strength**

not:

> "Here are some exercises I've created."

---

# 12. Strength Should Work Like This

### WEDNESDAY

**Lower Strength**

45 min

**Goal**
Strength + running support

---

### 1. Trap Bar Deadlift

3 × 5

@ RPE 7

Rest 2:30

[ Demo ]

Coach note:

> Leave 3 reps in the tank. Do not chase a max today.

---

### 2. Bulgarian Split Squat

3 × 8 / leg

40 lb

Rest 90 sec

---

### 3A. Hamstring Curl

3 × 10

### 3B. Calf Raise

3 × 12

**Superset**

---

### Finisher

Single-leg calf iso

2 × 30 sec

---

### Session Complete

Then the client logs:

Trap Bar

Set 1: 185 × 5
Set 2: 185 × 5
Set 3: 195 × 5

RPE: 8

---

Now the coach sees the actual work performed.

---

# 13. STRENGTH: Planned vs Actual

This becomes extremely valuable.

Example:

| Exercise | Planned | Actual |
|---|---|---|
| Trap Bar | 185 × 5 × 3 | 185 × 5, 185 × 5, 195 × 5 |
| Bulgarian Split Squat | 40 × 8 × 3 | 40 × 8 × 3 |
| Calf Raise | 12 × 3 | 12 × 3 |

And then:

**Coach sees**

> Completed 100% of planned sets  
> Last deadlift set increased to 195  
> RPE 8  
> No missed sets

This is exactly the sort of experience expected from serious strength platforms, and TrainingPeaks now supports exercise-by-exercise planned-vs-executed analysis for structured strength sessions.

---

# 14. ADD EXERCISE VIDEOS

This would significantly increase the perceived value of the app.

Every exercise should eventually support:

- demonstration video
- short instructions
- coaching cues
- common mistakes
- equipment
- muscle group
- movement category

TrainingPeaks' current strength builder includes exercise demonstrations/videos for many exercises and lets coaches attach notes/instructions.

Southbound does not need a 1,000-exercise encyclopedia immediately.

Start with a **Southbound Exercise Library**.

For example:

### Lower Body
Squat
Trap Bar Deadlift
Romanian Deadlift
Split Squat
Step-Up
Lunge

### Posterior Chain
Hip Thrust
Hamstring Curl
Single-Leg RDL

### Calf / Foot
Standing Calf Raise
Seated Calf Raise
Soleus Iso
Tibialis Raise

### Core
Dead Bug
Plank
Side Plank
Pallof Press

And gradually grow it.

---

# 15. THE WEEK SHOULD COMBINE EVERYTHING

This is probably the biggest client-facing opportunity for Southbound.

Instead of:

Running page
+
Strength page
+
Fueling page
+
Nutrition page
+
Cross-training page

the client should have:

## MY WEEK

Monday
**Easy Run — 5 mi**

Tuesday
**Strength — Lower Body**

Wednesday
**Tempo Run — 6 mi**

Thursday
**Recovery Run — 4 mi**

Friday
**Rest**

Saturday
**Long Run — 12 mi**
Fueling plan attached

Sunday
**Recovery / Mobility**

Everything lives on the same calendar.

Runna already integrates strength and other complementary training into the same training calendar.

This is exactly the direction Southbound should take.

---

# 16. FUELING SHOULD ATTACH TO THE WORKOUT

Do not make the client manually jump between:

Running → Fueling

For a long run:

### Saturday — Long Run

12 miles

**Run**
Easy effort

**Fuel**
- 30–60g carbs/hr
- 20 oz fluid/hr
- sodium target
- first gel at 30 min
- gel every 30–35 min

[ View Fueling Plan ]

Eventually:

### Before
Breakfast recommendation

### During
Gel 1
Gel 2
Gel 3
Bottle 1

### After
Recovery target

This is one of the strongest differentiators Southbound can have because it connects Eddie's coaching rather than treating nutrition as a standalone feature.

---

# 17. THE TODAY SCREEN SHOULD ALSO SHOW COACH COMMUNICATION

Example:

## Coach

**Eddie**

> I moved Saturday's long run to Sunday because of the weather.

[ View Updated Plan ]

This is better than making the athlete search through messages.

The change should be directly connected to the affected workout.

---

# 18. COACH-INITIATED PLAN UPDATES

This is the key interaction you specifically asked for.

You said:

> "I would update them on my end and then they would see them on their end."

That should become the foundation of the platform.

The process should be:

### Eddie

Opens:

**Clients → John Smith → Week 7**

Changes:

Saturday
12 mi

to:

Sunday
10 mi

Adds:

> "Backing this down 2 miles because of your fatigue this week."

Clicks:

**Publish Update**

---

### John

Receives:

**Your plan has been updated**

The Today screen immediately updates.

No manual import.
No copying.
No code.
No confusion.

---

# 19. DO NOT RELY ON CLIENT LOCAL STORAGE AS THE SOURCE OF TRUTH

This is one of the most important architecture changes.

Currently the system's cloud sync mirrors localStorage, including things such as:

- strength plans
- strength schedule
- running log
- running programs
- training programs
- nutrition
- fueling
- etc.

That is excellent for personal backup/sync.

But it is not ideal for **coach-delivered programming**.

For coach-owned programming, Firestore should become the authoritative source.

Client localStorage should become:

> **a fast local cache/offline layer**

not the master copy of a coach's prescription.

---

# 20. NEW SOURCE-OF-TRUTH MODEL

Instead of:

```text
Client localStorage
      ↓
Cloud sync
      ↓
sharedPlans
      ↓
Coach
```

move toward:

```text
              COACH
                ↓
        Published Program
                ↓
             Firestore
                ↓
       ┌────────┴────────┐
       ↓                 ↓
    CLIENT APP       COACH APP
       ↓
 local cache
```

That makes the relationship much clearer.

---

# 21. USE PLAN VERSIONS

Every published change should create a version.

Example:

**Marathon Plan**
Version 12

Published:
Sept 25, 2026

Changes:
- Tuesday workout modified
- Saturday long run moved
- strength session reduced

The client should only see the current published version.

The coach should be able to see:

**Current**
Version 12

**Previous**
Version 11

This solves an enormous number of problems later.

---

# 22. DRAFT VS PUBLISHED

This is another major upgrade.

The coach should be able to work on:

### Draft

without changing what the athlete currently sees.

Then:

**Preview**

followed by:

**Publish to Client**

Only then does the client's plan change.

This is much safer than directly mutating the live client plan while editing.

---

# 23. PUBLISH CHANGES, NOT JUST "SAVE"

The wording matters.

Do not make the coach think:

> Save = client sees it

Instead:

**Save Draft**

and

**Publish to Client**

This makes Southbound feel like real coaching software.

---

# 24. CLIENT CHANGE NOTIFICATION

When Eddie publishes a new plan:

Client gets:

### Your plan was updated

Eddie made changes to Week 7.

**3 changes**

- Tuesday: Tempo workout updated
- Wednesday: Strength shortened to 35 min
- Saturday: Long run moved to Sunday

[ Review Changes ]

That is much more meaningful than:

> "Your app synced."

---

# 25. SHOW A CHANGE LOG

When a client opens the updated plan:

**Plan Updated**

Sept 25

**Tuesday**
5 mi Easy → 6 mi Tempo

**Wednesday**
Strength 45 min → 30 min

**Saturday**
12 mi → Sunday 10 mi

This creates transparency and makes the coaching value visible.

---

# 26. LET CLIENTS REQUEST CHANGES

The client shouldn't edit coach programming directly.

Instead:

### Need a change?

[ Request Schedule Change ]

Options:

- Work conflict
- Fatigue
- Travel
- Pain/discomfort
- Race/event
- Other

Then:

> "I can't do Tuesday's workout. Can we move it to Wednesday?"

This becomes a coaching interaction.

Runna already has mechanisms for athletes to adjust plans for life changes, but Southbound has the opportunity to make the change explicitly collaborative between athlete and coach.

---

# 27. COACH DASHBOARD SHOULD BECOME A WORK QUEUE

Instead of mostly showing counts, make the dashboard answer:

> **Who needs me today?**

Example:

## NEEDS ATTENTION

### Sarah
Check-in submitted
**4/5**
Needs review

### Josh
Missed two workouts

### Alex
New message

### Mark
Plan ends Sunday

### Taylor
Booking request

Then:

## MY CLIENTS

| Client | Plan | This Week | Last Check-in |
|---|---|---|---|
| Sarah | Marathon W7 | 4/6 | 4/5 |
| Josh | 10K W3 | 2/5 | 3/5 |
| Alex | Strength W5 | 5/5 | 5/5 |

Clicking a client goes directly to the Client Hub.

---

# 28. CLIENT HUB STRUCTURE

The new client page should probably have:

## Overview

- current goal
- current plan
- weekly completion
- next session
- last check-in
- coach message
- alerts
- recent activity

## Plan

- active running plan
- strength schedule
- cross-training
- future weeks
- past weeks

## Calendar

- complete unified training calendar

## Check-ins

- submitted check-ins
- coach responses

## Progress

- mileage
- PRs
- compliance
- strength progress
- body/performance metrics chosen by the athlete/coach
- race results

## Notes

Private coach notes.

## Forms

- intake
- waiver
- agreements
- future documents

## Sessions

- booked
- completed
- cancelled
- session notes

## Billing

Eventually:

- package
- payment status
- next billing date
- sessions remaining

---

# 29. PRIVATE NOTES VS CLIENT NOTES

Keep them separate.

## Private Coach Note

Only Eddie sees it.

Example:

> "Seems more fatigued than he reports. Watch recovery next week."

## Client Note

Client sees it.

Example:

> "Nice job controlling Tuesday. Keep the same effort next week."

This should be enforced in Firestore, not only hidden by the UI.

---

# 30. STRENGTH PROGRAMMING SHOULD BE DATE-BASED

The current strength system has:

- reusable workouts
- a schedule
- completion

But for coaching, the real unit should become:

> **Scheduled Strength Session**

Example:

```text
Strength Session
date: 2026-10-01
title: Lower Strength B
programId: marathon-john
status: published
estimatedMinutes: 45
```

It references a structured workout.

That means you can change the workout without destroying the historical session.

---

# 31. DO NOT OVERWRITE HISTORICAL WORKOUTS

This is critical.

Suppose Week 2 had:

Trap Bar
3 × 5 @ 185

John completed it.

Later you change the template to:

3 × 5 @ 195

Do not rewrite Week 2.

Week 2 should remain:

**Planned 185**

**Completed 185**

Week 5 may be:

**Planned 195**

This lets Southbound show actual progression.

---

# 32. STRENGTH HISTORY SHOULD BECOME A FIRST-CLASS DATASET

Then you can answer:

- best trap-bar set
- estimated 1RM trend
- volume trend
- exercise frequency
- average RPE
- progression over 8 weeks
- missed sessions
- consistency

You do not need all of these on day one.

But the data model should allow them.

---

# 33. RUNNING HISTORY SHOULD WORK THE SAME WAY

For each prescribed run:

```text
plannedWorkout
completedActivity
athleteFeedback
coachFeedback
```

Then you can calculate:

- planned miles
- completed miles
- weekly compliance
- quality workout completion
- long-run completion
- pace progression
- RPE trends
- race readiness

---

# 34. WEEKLY REVIEW SHOULD BECOME AUTOMATICALLY INFORMED

Your existing check-in is good.

Make the check-in smarter.

Instead of just:

> How did your week go?

the client sees:

### YOUR WEEK

Planned sessions: 6
Completed: 5
Miles: 28 / 32

Strength: 2 / 2

Long run: ✅

Average RPE: 6.8

Then:

### CHECK-IN

How did this week feel?

Energy:
1–5

Recovery:
1–5

Motivation:
1–5

Any pain/discomfort?

Anything affecting training?

What went well?

What should we change?

Now the coach doesn't have to manually reconstruct the week before answering the check-in.

---

# 35. AUTOMATIC COACH ALERTS

Coach dashboard should flag:

- missed workout
- multiple missed workouts
- unusually low completion
- client hasn't opened plan
- client check-in submitted
- client says pain/discomfort
- client requests schedule change
- client hasn't logged in recently
- plan ending soon
- race approaching
- strength progression stall

These become "attention" signals rather than things Eddie has to discover.

---

# 36. CLIENT NOTIFICATIONS

Notifications should eventually cover:

- new plan published
- plan changed
- workout due today
- coach message
- check-in due
- check-in feedback received
- booking approved
- session reminder
- package/payment status
- plan milestone
- race countdown

Start in-app.

Email is already available.

Browser/push notifications can come later.

---

# 37. CALENDAR SYNC

Runna supports syncing planned workouts to personal calendars.

Southbound should eventually let clients subscribe to:

**Southbound Training Calendar**

This can put:

- runs
- strength
- soccer sessions
- coaching appointments

into Apple Calendar / Google Calendar / Outlook.

Do this as a convenience, not as the source of truth.

---

# 38. OFFLINE / LOW-CONNECTION BEHAVIOR

Because this is a PWA:

The client should still be able to open:

- today's workout
- current week
- strength workout
- recent plan

with limited/no connection.

Then execution data syncs when connection returns.

The cloud source remains authoritative for future plan changes.

---

# 39. WHAT THE CLIENT SHOULD NEVER HAVE TO DO

A paid client should not have to:

- enter a coach code after onboarding
- manually import a plan
- download a PDF
- copy workouts
- manually rebuild a strength workout
- manually type the same information into three pages
- figure out which plan version is current
- hunt for the coach's update
- guess what today's workout is
- wonder whether Eddie received their check-in
- navigate through separate running/strength/fueling tools to understand one day

All of that should disappear.

---

# 40. WHAT EDDIE SHOULD NEVER HAVE TO DO

Eddie should not have to:

- manually copy a workout into another client record
- maintain duplicate plan versions
- send a workout through text after putting it in the app
- remember which clients need plan updates
- open multiple disconnected pages to reconstruct a client's week
- manually enter the same client data in different places
- wonder whether a client saw the plan
- wonder what a client actually completed
- rewrite old history when a new week changes

---

# 41. NEW CORE DATA MODEL

This is the recommended direction.

## `clientRecords/{clientUid}`

Business/coaching profile.

```text
clientUid
preferredName
phone
startDate
status
primaryGoal
secondaryGoals
currentSport
currentPlanId
coachUid
notesSummary
tags
createdAt
updatedAt
```

Do not turn this into a giant junk document. Keep it focused.

---

## `coachingPlans/{planId}`

The coach-owned program definition.

```text
clientUid
coachUid
name
sport
goal
status
draftVersion
publishedVersion
startDate
endDate
createdAt
updatedAt
```

Possible status:

- draft
- active
- completed
- archived

---

## `coachingPlans/{planId}/versions/{versionId}`

Immutable published/draft plan versions.

```text
version
status
createdAt
createdBy
publishedAt
weeks
changeSummary
```

---

## `coachingPlans/{planId}/weeks/{weekId}`

Optional if you need more granular data later.

```text
weekNumber
startDate
endDate
phase
goal
plannedMiles
sessions
```

---

## `scheduledWorkouts/{workoutId}`

The key athlete-facing unit.

```text
clientUid
planId
planVersion
date
type
title
status
prescription
coachNote
fuelingPlanId
createdAt
updatedAt
```

---

# 42. RUN WORKOUT DATA

A run workout should support:

```text
type: run

title
description

warmup[]
steps[]
cooldown[]

distanceTarget
durationTarget

paceTarget
paceRange

heartRateTarget
rpeTarget

fuelingPlanId

coachInstructions
```

---

# 43. STRENGTH WORKOUT DATA

A strength workout should support:

```text
type: strength

title
estimatedMinutes
goal
coachInstructions

exercises[]:
  exerciseId
  name
  order
  groupId
  groupType
  sets[]
    reps
    weight
    duration
    rpe
    rir
    restSeconds
  notes
  video
```

---

# 44. EXECUTION DATA MUST BE SEPARATE

Use something like:

## `workoutResults/{workoutId}`

```text
clientUid
workoutId
status
startedAt
completedAt

actualDistance
actualDuration

rpe
athleteNotes

painFlag

exerciseResults[]
```

This separation is what allows planned vs actual comparisons.

---

# 45. CLIENT FEEDBACK ON EACH WORKOUT

After completion:

### How did it feel?

RPE:

1 2 3 4 5 6 7 8 9 10

### Anything to tell your coach?

Text box

### Any pain/discomfort?

No
Yes

This should feed the coach dashboard.

---

# 46. COACH REVIEW ON EACH WORKOUT

Eddie can open the completed workout:

**Planned**
6 mi Tempo

**Actual**
6.1 mi
8:14 avg

**Athlete RPE**
8/10

**Athlete note**
> Last rep was tough.

**Coach response**
> Good work. Keep next week's tempo slightly shorter.

That feedback belongs on the workout itself.

---

# 47. THE CLIENT SHOULD HAVE A CLEAR "MY PLAN"

Do not bury the actual plan inside the Running tool.

The client should have:

## MY PLAN

### Marathon Build

Week 7 of 16

[ Week 6 ] [ **Week 7** ] [ Week 8 ]

Progress:
4 / 6 sessions

28 / 32 miles

---

Then the week.

This is a dedicated coaching experience.

---

# 48. MY PLAN SHOULD ALSO SHOW THE BIG PICTURE

At the top:

**Goal**
3:30 Marathon

**Race**
Chicago Marathon
Oct 11

**Current Phase**
Build

**Week**
7 / 16

**Peak Mileage**
45 mi

**Coach**
Eddie

This makes the athlete understand why they are doing today's workout.

---

# 49. ADD "WHY THIS WORKOUT"

This is a major perceived-value feature.

Example:

### Thursday — Tempo Run

**Why:**

> This session develops your ability to sustain a controlled hard effort without accumulating excessive fatigue.

This is much more coach-like than simply:

> 5 × 800.

---

# 50. ADD "COACH CUE"

Every major workout can have:

**Coach Cue**

> Relax your shoulders and finish each rep under control.

This is where Eddie's coaching personality becomes part of the product.

---

# 51. ADD "WHAT TO FOCUS ON"

For running:

- Pace
- Effort
- Form
- Breathing

For strength:

- Technique
- Control
- Load
- RPE

This is useful because not every workout should be about hitting a number.

---

# 52. RUNNING PLAN EDITOR: REDESIGN IT

The current editor is a useful prototype but should eventually become a weekly coach workspace.

Imagine:

# Sarah — Marathon Plan

**Week 7**

MON
Easy 5

TUE
Tempo 6

WED
Strength

THU
Recovery 4

FRI
Rest

SAT
Long 12

SUN
Rest

---

Click Tuesday.

Open a workout editor:

### Tempo Run

**Purpose**
Threshold development

**Warm-up**
1.5 mi easy

**Main**
3 × 1 mi

Target
8:10–8:20

Recovery
2:00 jog

**Cooldown**
1.5 mi

**Coach note**
...

**Fueling**
...

[ Save Draft ]

[ Publish ]

This is a dramatically better coaching workflow.

---

# 53. WEEK BUILDER SHOULD SUPPORT DRAG AND DROP

Coach can:

- move a workout
- duplicate
- copy to next week
- copy from previous week
- replace workout
- insert strength
- insert cross-training
- add rest
- change workout
- add note

This will make weekly coaching far faster.

---

# 54. WORKOUT LIBRARIES WILL SAVE EDDIE A TON OF TIME

Build:

## Run Workout Library

Folders:

- Easy
- Recovery
- Tempo
- Threshold
- Intervals
- Hills
- Long Runs
- Race Specific
- Taper

Then:

**Copy to Client**

Adjust target.

Publish.

Same for Strength:

- Upper
- Lower
- Full Body
- Runner Strength
- Mobility
- Recovery
- Pre-race
- Post-race

TrainHeroic explicitly emphasizes reusable exercise, prescription and program libraries for coach efficiency.

---

# 55. TEMPLATE + CLIENT OVERRIDE MODEL

This is another important architecture idea.

Example:

**Template**
Runner Lower A

Base:

Trap Bar 3 × 5
Split Squat 3 × 8
Calf Raise 3 × 12

For Sarah:

Trap Bar 3 × 5 @ 185
Split Squat 3 × 8 @ 35

For Mark:

Trap Bar 3 × 5 @ 245
Split Squat 3 × 8 @ 50

One template.

Two individualized prescriptions.

That is much more scalable than rebuilding everything for every client.

---

# 56. PLAN GENERATION SHOULD SUPPORT COACH OVERRIDES

Southbound already has a training-plan generator.

Keep it.

But the architecture should become:

```text
Generator
    ↓
Draft plan
    ↓
Coach edits
    ↓
Coach approves
    ↓
Publish
```

Never:

```text
Generator
    ↓
Automatically replace athlete's live plan
```

The coach should remain in control.

---

# 57. WEEK-BY-WEEK COACHING IS YOUR REAL PRODUCT

The value proposition becomes:

> Eddie doesn't just sell you a static plan.

Instead:

> Eddie builds your plan, watches how you respond, and changes it as your training changes.

The software should visibly reinforce that.

---

# 58. CHECK-IN → PLAN UPDATE LOOP

This should become the central coaching loop.

```text
Client trains
       ↓
Logs results
       ↓
Weekly check-in
       ↓
Eddie reviews
       ↓
Eddie adjusts plan
       ↓
Publish changes
       ↓
Client sees updated week
       ↓
Client trains again
```

This is a much better product story than:

> "Here is your training calendar."

---

# 59. MAKE THAT LOOP VISIBLE TO THE CLIENT

On Sunday:

### Weekly Check-in

Your week:

5 / 6 workouts

28 / 32 miles

Strength:
2 / 2

Long Run:
Complete

Then:

### Tell Eddie About Your Week

...

After Eddie responds:

### Eddie's Feedback

> "Good week. Your fatigue looks manageable, so we're keeping your mileage stable and adding one controlled quality session."

Then:

### Week 8 Published

This makes the subscription feel active.

---

# 60. CLIENT PROGRESS SHOULD SHOW COACHING OUTCOMES

Don't only show:

> 124 miles

Show:

### Running

Weekly mileage
↗

Long-run progression
↗

Tempo pace
↗

Race goal
3:30

### Strength

Trap bar
185 → 205

Split squat
35 → 45

### Consistency

92% planned sessions completed

This is how the client sees what they are paying for.

---

# 61. AVOID THE "TOOLBOX" PROBLEM

The current app has many strong pages.

But a client could potentially perceive them as:

- Running tool
- Strength tool
- Fueling tool
- Nutrition tool
- Habits tool
- Calendar
- Check-in

The redesign should make all of them feel like:

> **My coaching plan**

with specialized tools underneath.

---

# 62. RECOMMENDED CLIENT NAVIGATION

For a running + strength client:

**Today**

**Plan**

**Calendar**

**Progress**

**Coach**

**More**

Where:

### Today
What do I do now?

### Plan
What is my training block?

### Calendar
What is my week/month?

### Progress
How am I improving?

### Coach
Check-ins, messages, feedback

This is easier than forcing clients to think in terms of internal Southbound features.

---

# 63. RECOMMENDED COACH NAVIGATION

Coach:

**Dashboard**

**Clients**

**Calendar**

**Programming**

**Inbox**

**More**

### Dashboard
Needs attention.

### Clients
Client Hub.

### Calendar
Appointments + training schedule.

### Programming
Build/reuse workouts/plans.

### Inbox
Messages, check-ins and requests.

---

# 64. DO NOT BUILD FULL IN-APP CHAT FIRST

Messaging is useful, but don't let it derail the architecture.

The first communication layer can be:

- coach update
- workout comment
- check-in feedback
- change request
- notification

That gives most of the value without building Slack inside Southbound.

True messaging can come later.

---

# 65. THE COACH SHOULD BE ABLE TO SEE "LAST SEEN"

Useful client status:

**Last app activity**
2 hours ago

**Last workout**
Today

**Last check-in**
Sept 21

**Plan acknowledged**
Sept 25

This helps Eddie know whether an update was actually seen.

---

# 66. ADD "ACKNOWLEDGE PLAN"

When Eddie publishes a significant update:

Client sees:

> **Your plan has been updated**

[ Review ]

After opening:

> Got it

This creates an explicit signal:

**planPublishedAt**
**planViewedAt**
**planAcknowledgedAt**

That can later be visible to Eddie.

---

# 67. VERSIONING + ACKNOWLEDGEMENT IS IMPORTANT FOR TRUST

For paid coaching you want to know:

> What did we send the client?

and:

> Did they receive it?

and:

> What did they actually execute?

Versioning solves the first.
Acknowledgement solves the second.
Execution history solves the third.

Together they create a professional coaching record.

---

# 68. SECURITY ARCHITECTURE

Coach-owned programming must not become editable by the client simply because it is visible in localStorage.

Firestore rules should enforce:

### Coach
Can:

- create drafts
- edit drafts
- publish versions
- schedule workouts
- write coach notes
- review results

### Client
Can:

- read published plan
- complete workout
- record actual results
- write athlete notes
- request changes
- submit check-ins

### Client cannot:
- modify the coach's prescribed plan directly
- alter historical published versions
- alter coach notes

The UI should reinforce this, but Firestore rules must be the actual boundary.

---

# 69. MIGRATION FROM THE CURRENT SYSTEM

Do NOT throw away current data.

The current architecture already contains useful data.

Migration should be incremental.

## Phase 1

Continue supporting:

- `training-programs`
- `running-programs`
- `strength-plan`
- `strength-schedule`

as the local cache/personal layer.

## Phase 2

Create new Firestore coaching collections.

## Phase 3

When a coach assigns a plan:

- convert existing plan data into the new coaching format
- publish Version 1

## Phase 4

Client app reads new published coaching data.

## Phase 5

Execution records get stored separately.

## Phase 6

Old local formats remain as fallback/legacy until migration is complete.

Do not globally rename old storage keys.

---

# 70. THE BIG STRENGTH MIGRATION

This deserves special attention.

Currently:

`strength-plan`

is primarily the user's local workout plan.

`strength-schedule`

is primarily the user's local schedule.

For coached strength clients, add a new layer:

```text
coachStrengthPrograms
scheduledStrengthWorkouts
strengthWorkoutResults
```

The existing builder can become the coach-side authoring tool.

The client gets the execution view.

That means most of the existing strength editor can be reused rather than discarded.

---

# 71. RUNNING MIGRATION

Same idea.

Existing:

`training-programs`
`running-programs`

contain generated plans.

Move them toward:

```text
coachingPlans
    ├── running
    ├── strength
    └── combined
```

But do this carefully.

You may still keep the current running/race program schemas for legacy/personal workflows while introducing the new client-coaching layer.

---

# 72. ONE UNIFIED "COACHING PLAN"

Long-term, the athlete should not care whether a workout came from:

- Race Plan
- Training Plan
- Strength Plan
- Cross Training
- Fueling

They should see:

**Tuesday, Sept 29**

Tempo Run

**Wednesday, Sept 30**

Strength

This is a single coaching calendar.

Behind the scenes, different systems can power each workout type.

---

# 73. THE UNIFIED WORKOUT MODEL

Everything eventually becomes:

```text
Workout
  id
  clientUid
  date
  type
  title
  status
  prescription
  instructions
  coachNote
  fueling
  completion
```

The `type` can be:

- run
- strength
- cross_training
- mobility
- soccer
- rest
- recovery
- race

This is the foundation of a real coaching platform.

---

# 74. ADD "SESSION STATUS"

Possible states:

- scheduled
- available
- started
- completed
- skipped
- modified
- cancelled

This allows the client timeline and coach dashboard to be meaningful.

---

# 75. CLIENT WEEKLY SCORE

Be careful about gamification, but a simple coaching metric can help:

**This Week**

5 / 6 sessions
83%

28 / 32 miles
88%

Strength
2 / 2

This is information, not a grade.

---

# 76. DO NOT OVER-GAMIFY

The product should not feel like Duolingo.

The primary message is:

> Train intelligently.

Not:

> Collect badges.

Use progress for clarity rather than addiction mechanics.

---

# 77. PERSONAL CALENDAR INTEGRATION

Eventually provide:

**Add Southbound to Calendar**

Then the client sees:

Tuesday 6:00 AM
Tempo Run

Wednesday 5:30 PM
Strength

Saturday 7:00 AM
Long Run

This complements the app.

Runna already supports exporting/syncing its training calendar to external calendar providers.

---

# 78. DEVICE INTEGRATION ROADMAP

Southbound already has COROS infrastructure.

The long-term model should be:

```text
Coach prescription
      ↓
Southbound
      ↓
COROS / Garmin / Apple / etc.
      ↓
Completed activity
      ↓
Southbound
      ↓
Coach review
```

The athlete should not have to manually reconcile device data with the plan.

---

# 79. WHAT THE CLIENT EXPERIENCE SHOULD FEEL LIKE AFTER THIS UPGRADE

A client signs in.

Immediately:

> Good morning, Sarah.

**Today's Workout**
Tempo Run — 6 mi

**Your Week**
4 / 6 complete

**Coach**
Eddie updated your Saturday long run.

You tap the workout.

You see exactly what to do.

You finish.

You enter RPE.

Your workout turns green/completed.

The app says:

> Nice work. Saturday's long run is next.

On Sunday:

> Weekly check-in due.

You submit it.

Eddie reviews.

He changes next week's plan.

You receive:

> Week 8 is ready.

You open it.

Done.

That is the product you are actually trying to build.

---

# 80. WHAT THE COACH EXPERIENCE SHOULD FEEL LIKE

Eddie signs in.

Dashboard says:

### 4 CLIENTS NEED ATTENTION

Sarah — check-in
Josh — missed 2 runs
Mark — requested schedule change
Taylor — booking request

Click Sarah.

You immediately see:

**Week 7**
5 / 6 complete
28 / 32 miles

Tuesday Tempo:
Completed
RPE 8

Wednesday Strength:
Completed
100%

Saturday Long Run:
Missed

Check-in:
"Feeling fatigued."

You change Saturday.

12 mi → 9 mi
Move to Sunday

Add note:

> "Let's back off slightly and see how you respond."

Publish.

Sarah gets the update.

That is a real coaching workflow.

---

# 81. FEATURE PRIORITIES

## TIER 1 — MUST BUILD

These are the biggest improvements.

### Client side

1. New unified Today screen
2. New unified Week view
3. Dedicated My Plan page
4. Clickable workout cards
5. Detailed running workout view
6. Detailed strength workout view
7. Mark complete
8. Athlete RPE/notes
9. Coach note on workout
10. Published plan updates

### Coach side

11. Dedicated Client Hub
12. Weekly client programming workspace
13. Running workout editor
14. Strength workout editor
15. Draft vs Publish
16. Plan versioning
17. Client change summary
18. Client activity/compliance overview

---

# 82. TIER 2 — HIGH VALUE

19. Workout libraries
20. Reusable strength templates
21. Reusable run templates
22. exercise video library
23. coach/client plan acknowledgement
24. unified training calendar
25. planned vs completed comparison
26. weekly check-in automatically informed by training data
27. missed-workout alerts
28. client change requests

---

# 83. TIER 3 — MAJOR LONG-TERM VALUE

29. COROS workout push
30. Garmin integration
31. calendar subscription
32. push notifications
33. package/payment connection
34. session packages
35. billing
36. client invoices
37. automated reports
38. multi-coach support
39. advanced analytics

---

# 84. THINGS TO AVOID FOR NOW

Do not spend the next phase building:

- a giant social network
- leaderboards
- complicated gamification
- a huge AI chatbot
- a massive recipe database
- a marketplace
- complicated public community features

Those aren't the core reason someone pays Eddie.

The core reason is:

> **Eddie coaches me, my plan is clear, and Southbound makes it easy to follow.**

---

# 85. RECOMMENDED BUILD ORDER

## Phase A — Client Plan Foundation

Build:

- `client.html`
- Client Hub
- My Plan
- published plan model
- plan versions
- plan acknowledgement

Do this before adding lots of UI polish.

---

## Phase B — Unified Week

Build:

- week view
- day cards
- workout states
- today connection
- running + strength combined

---

## Phase C — Running Workout Engine

Build:

- structured run steps
- warmup
- intervals
- recovery
- cooldown
- targets
- coach notes
- execution
- completion
- actual vs planned

---

## Phase D — Strength Coaching Engine

Build:

- coach-assigned strength sessions
- exercise prescription
- videos
- sets/reps
- weight
- RPE/RIR
- rest
- supersets
- execution
- result storage
- planned vs actual

---

## Phase E — Coach Weekly Workspace

Build:

- drag/drop
- templates
- duplicate week
- copy workout
- publish
- change summary
- client acknowledgement

---

## Phase F — Coaching Feedback Loop

Connect:

- check-ins
- missed workouts
- RPE
- notes
- plan adjustments
- coach dashboard alerts

---

## Phase G — Fueling

Attach fueling directly to the relevant workout.

---

## Phase H — Integrations

COROS / calendar / other devices.

---

## Phase I — Business System

Payments
packages
attendance
billing
reports

---

# 86. ACCEPTANCE CRITERIA FOR A REAL V1

Do not call the new client coaching system "done" until this scenario works:

### Eddie

1. Opens a client.
2. Opens Week 7.
3. Moves a workout.
4. Changes the prescription.
5. Changes a strength session.
6. Adds coach notes.
7. Saves draft.
8. Reviews a preview.
9. Publishes.

### Client

10. Opens Southbound.
11. Immediately sees the current week.
12. Sees the updated workout.
13. Opens the detailed run.
14. Completes it.
15. Records RPE.
16. Adds a note.
17. Opens strength.
18. Completes prescribed sets.
19. Logs actual weights/reps.
20. Submits weekly check-in.

### Eddie

21. Opens client.
22. Sees planned vs actual.
23. Sees workout note.
24. Sees check-in.
25. Adjusts next week.
26. Publishes again.

If that flow works smoothly, Southbound will have a legitimate coaching-product core.

---

# 87. THE MOST IMPORTANT PRODUCT DECISION

Do not think of Southbound as:

> "A website with a running page, a strength page, a fueling page and a coach page."

Think of it as:

> **A personalized coaching operating system.**

The client sees:

**My Day**
→ **My Week**
→ **My Plan**
→ **My Progress**
→ **My Coach**

Eddie sees:

**My Clients**
→ **Their Training**
→ **Their Response**
→ **My Adjustments**

Everything else supports those relationships.

---

# 88. FINAL PRODUCT NORTH STAR

Southbound should eventually make this statement true:

> **Your coach builds it.  
> Southbound delivers it.  
> You train it.  
> Southbound records it.  
> Your coach reviews it.  
> Your next week gets better.**

That is the loop that makes the subscription valuable.

---

# 89. INSTRUCTIONS FOR THE NEXT CHAT / CODING AGENT

Before changing anything:

1. Inspect the current repo.
2. Read `CLAUDE.md`.
3. Read `docs/PRODUCT_ARCHITECTURE.md`.
4. Inspect the existing running, strength, check-in, coach-client and cloud-sync code.
5. Do NOT assume the current architecture is the final one.
6. Do NOT throw away working features.
7. Preserve old `eddieos-...` storage identifiers.
8. Preserve cloud sync for personal/non-coached data.
9. Build the new coaching data layer beside the old system first.
10. Do not make coach-delivered programming dependent on client localStorage being the source of truth.
11. Keep Firestore Security Rules as the real permission boundary.
12. Use feature branches.
13. Test before pushing.
14. Do not merge to `main` until Eddie explicitly says "push it" / "push".
15. If Firestore rules change, Eddie must publish the full rules file in Firebase Console.
16. After adding/removing files, run the project's manifest update workflow.
17. Run JS syntax checks on modified JS.
18. Run the existing test suite.
19. Test desktop and mobile.
20. Prefer incremental phases, but do not be afraid of major architectural changes when the old model prevents the desired product.

The agent should challenge weak implementation ideas and prioritize a better source-of-truth architecture over cosmetic changes.

---

# 90. RESEARCH BASIS

The design recommendations above were informed by current public documentation for:

- Runna — client plan/calendar, weekly training experience, strength integrated into the running plan, workout stages, plan adjustment and calendar syncing.
- TrainingPeaks — coach calendars, workout cards, compliance, structured running workouts, strength workout builder, exercise instructions/videos, RPE/RIR, planned-vs-completed analysis.
- TrainHeroic — coach-created programming, reusable libraries, session instructions, videos, athlete mobile programming, messaging and training history.

These products are references for **interaction patterns and product architecture**, not instructions to copy their proprietary UI or branding.

---

# 91. SUMMARY FOR THE NEXT CHAT

The requested project is now larger than "improve clients.html."

The real project is:

## Build the Southbound Coaching Delivery System

### Coach side

Client Hub
+
Plan Builder
+
Workout Library
+
Draft/Publish
+
Plan Versions
+
Client Review
+
Progress

### Client side

Today
+
My Week
+
Workout Detail
+
Run Execution
+
Strength Execution
+
Progress
+
Coach Feedback

### Core data

Plan
→ Published Version
→ Scheduled Workout
→ Completed Result
→ Coach Review
→ Next Plan Adjustment

That is the architecture that will make Southbound feel like a serious paid coaching platform rather than a collection of fitness tools.
