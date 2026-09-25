# Southbound Coaching — Client Management / Mindbody-Style Upgrade

## Purpose

I want to upgrade Southbound Coaching so that it is much easier for the coach to keep up with client information, while making the client experience simple and seamless.

The goal is **not** to recreate Mindbody feature-for-feature. The goal is to build a **coaching CRM/client-management system inside Southbound** that connects the tools that already exist into one coherent client record.

The guiding product principle is:

> **Powerful underneath, simple on the surface.**

For the coach, Southbound should feel like a client-management dashboard.
For the client, Southbound should feel like a simple coaching app — not a CRM.

---

# 1. Current Southbound System — Important Context

Repository:
`https://github.com/eddiesteers777/eddie-dashboard/`

Live site:
`https://southboundcoaching.com`

Brand:
**Southbound Coaching**

The repository is a static HTML/CSS/ES-module JavaScript PWA hosted through GitHub Pages, with Firebase/Firestore providing authentication and cloud data.

Do NOT start over. The existing architecture should be extended incrementally.

## Current major systems already built

The current system already has the following pieces:

### Account / client identity
- `userProfiles/{uid}`
- Google sign-in
- client approval workflow
- `status` values such as pending/active/archived
- `services[]`
- coach approval
- application information

### Coach/client relationship
- `coachLinks/{coachUid}_{clientUid}`
- one-time invite codes
- client can grant coach access
- approved coach can connect with clients
- Firestore rules enforce the relationship

### Training / plans
- Training Plans
- Running/Race Plans
- coach can view/edit linked client's training/running plans
- `sharedPlans/{clientUid}` mirrors training/race plans
- coach notes currently exist at plan level

### Weekly coaching
- `checkins/{clientUid}_{weekOf}`
- client submits rating + notes
- coach reviews check-in
- coach feedback is returned to client
- email notifications exist through EmailJS

### Scheduling
- coach availability
- weekly availability slots
- blackout dates
- booking requests
- recurring weekly requests
- coach approval/denial
- client cancellation

### Public leads
- `apply.html`
- `contact.html`
- website inquiries
- coach dashboard shows website questions

### Coach dashboard
Current `coach.html` already displays:
- website questions
- pending accounts
- booking requests
- check-ins to review
- active clients
- quick links to manage these areas

### Client app
Current client experience already includes areas such as:
- Today
- Training / Running
- Strength
- Cross-training
- Nutrition
- Fueling
- Habits
- Schedule
- Weekly Check-in
- Progress-related tools

### Business vision
Southbound ultimately covers:
- online coaching
- running coaching
- strength coaching
- cross-training
- race plans
- nutrition
- fueling
- hydration
- 1-on-1 soccer
- group soccer
- booking
- client communication
- progress tracking
- eventually packages/payments/business tools

---

# 2. The Main Problem With the Current System

The current pieces work, but the coach's view is still fragmented.

A client is currently represented across several collections/features:

```text
userProfiles
    +
coachLinks
    +
sharedPlans
    +
checkins
    +
bookingRequests
    +
private app data
```

That means the information exists, but it does not yet feel like **one client record**.

The coach should be able to click a client and immediately understand:

- who this person is
- what services they receive
- why they are training
- what their current goal is
- what their current plan is
- what happened recently
- what they have coming up
- what the coach needs to do next
- what private notes exist
- how their progress is going
- what sessions they have completed
- what their check-ins have said

The client should NOT have to navigate all of those systems individually.

---

# 3. Core Product Change

Create a **Client Hub** / **Client Profile** system.

The coach's experience should evolve toward:

```text
Coach Dashboard
      ↓
   My Clients
      ↓
   Client Hub
      ↓
┌───────────────────────────────────────┐
│ Client Name                           │
│ Services • Status • Main Goal         │
│                                       │
│ Overview | Plan | Calendar | Checkins │
│ Notes | Progress | Forms | Billing*   │
└───────────────────────────────────────┘
```

`* Billing can be added later.`

The Client Hub becomes the center of gravity for client management.

---

# 4. New Client Hub — Desired UX

When the coach clicks a client, do NOT just open the current generic plan editor.

Instead, open a dedicated client workspace, conceptually:

`client.html?uid=CLIENT_UID`

The exact implementation can differ if there is a better architecture, but the concept should be a dedicated client record/workspace.

## Header

Example:

**John Smith**

`RUNNING • ONLINE COACHING`
`Active since Sept. 12, 2026`

Then a compact summary:

- Current goal
- Current plan
- Next session
- Last check-in
- Current week
- Client status

Example:

```text
JOHN SMITH
Running Coaching • Online Coaching

Goal: Boston Marathon
Plan: Marathon — Week 7
Next Session: Tuesday 4:30 PM
Last Check-in: Sept. 21
Status: Active
```

## Tabs

Recommended initial tabs:

1. Overview
2. Plan
3. Calendar
4. Check-ins
5. Notes
6. Progress
7. Forms

Later:

8. Billing
9. Package / Sessions

Do not force every tab into the first implementation if that creates unnecessary complexity. Build the foundation first.

---

# 5. Overview Page

The Overview should answer:

> "I have 30 seconds. What do I need to know about this client?"

Suggested layout:

## Client Snapshot
- Name
- Preferred name
- Services
- Status
- Start date
- Primary goal
- Current training phase

## What's Next
- Today's/next planned workout
- Next booked session
- Next check-in
- Plan ending date

## Needs Attention
Examples:
- Check-in needs response
- Plan needs adjustment
- No upcoming sessions
- Client has missed recent workouts
- Intake incomplete

## Recent Activity
Show the latest few timeline events.

## Quick Actions
Examples:
- Edit This Week
- Add Private Note
- Send Client Update
- Book Session
- Review Check-in
- View Plan

The Overview should be the main landing page for a client.

---

# 6. Client Timeline — High Priority

This is one of the most important additions.

Create a chronological client history/timeline.

Example:

```text
CLIENT TIMELINE

Sept 25
Training plan updated — Week 7

Sept 24
Session booked — Strength, 4:30 PM

Sept 21
Weekly check-in submitted — 4/5

Sept 22
Coach feedback sent

Sept 18
Training session completed

Sept 12
Client approved

Sept 10
Application submitted
```

Timeline events can eventually come from:

- application submitted
- client approved
- coach linked
- service added/removed
- plan created
- plan edited
- plan published
- workout completed
- workout missed
- check-in submitted
- check-in reviewed
- coach note added
- client update sent
- booking requested
- booking approved
- booking cancelled
- session completed
- progress update
- package purchased
- payment received

Do not build all event types immediately. Start with the most useful ones.

The timeline gives the coach a single place to understand the relationship with the client.

---

# 7. Separate Private Coach Notes From Client-Facing Updates

This distinction is important.

## Private Coach Notes
Only the coach sees these.

Examples:

- Prefers Tuesday/Thursday workouts.
- Has difficulty completing long runs before 9 AM.
- Wants to qualify for Boston.
- Soccer season ends Oct. 15.
- Be conservative increasing mileage.

These should never accidentally appear to the client.

## Client-Facing Updates
The client can see these.

Examples:

- Great week. Let's keep this structure for next week.
- I moved Thursday's workout because of your schedule.
- Your long-run fueling target has been increased.

The existing plan-note system should eventually become part of this broader distinction instead of being the only note mechanism.

---

# 8. New Client Record / Data Layer

Do NOT overload `userProfiles` with every coaching/business field.

Keep `userProfiles` primarily about identity/access/account status.

Consider a separate collection:

```text
clientRecords/{clientUid}
```

Conceptual fields:

```js
{
  clientUid,
  preferredName,
  phone,

  startDate,
  status,

  primaryGoal,
  secondaryGoals,
  currentSport,
  targetRace,
  targetDate,

  services,

  availability,
  trainingPreferences,

  intakeComplete,

  privateSummary,

  createdAt,
  updatedAt
}
```

This is conceptual, not a final schema.

Before implementing, inspect the actual existing data shapes and avoid duplicating existing information unnecessarily.

Potentially useful additional collections later:

```text
clientNotes/{id}
clientTimeline/{id}
clientForms/{id}
clientSessions/{id}
clientProgress/{id}
clientPackages/{id}
clientPayments/{id}
```

Do NOT create every collection immediately. Start with the smallest structure that supports the Client Hub cleanly.

---

# 9. Coach Dashboard Upgrade

The current `coach.html` dashboard already shows counts for:

- pending accounts
- booking requests
- check-ins
- active clients
- website inquiries

Keep that functionality.

Upgrade it into a **Needs Attention** dashboard.

Conceptual layout:

```text
GOOD MORNING, EDDIE

NEEDS ATTENTION

3 Check-ins
Sarah — submitted yesterday
Josh — submitted yesterday
Mark — submitted 2 days ago

2 Plans
Sarah — next week needs adjustment
Alex — plan ends Sunday

2 Booking Requests
John — Tuesday 4:30
Mike — Saturday 9:00

1 Client Follow-up
James hasn't checked in this week
```

Then:

### My Clients

```text
Search clients...

[All] [Running] [Strength] [Soccer] [Needs Attention]

John Smith
Running • Online Coaching
Next session: Tue 4:30
Check-in: Reviewed
Plan: Week 7

Sarah Jones
Strength
Next session: Thu 5:00
Check-in: Needs Review
Plan: Week 3
```

The dashboard should help Eddie answer:

> "What do I need to do today?"

not simply:

> "How many things exist?"

---

# 10. Client List / Search / Filters

The current `clients.html` should evolve from primarily an access-management page into the main Client List / Client Hub entry point.

Keep the existing coach/client relationship tools, but make the coach's client list much more useful.

Add:

## Search

```text
Search clients...
```

Search should work by:
- name
- preferred name
- email

## Filters

Potential filters:

- All
- Active
- Inactive
- Running
- Strength
- Soccer
- Online Coaching
- Needs Attention

Do not overcomplicate filters in version one.

---

# 11. Improve the Client's Experience

The client should not experience the complexity of the coach CRM.

The client experience should remain simple.

The client should primarily see something like:

```text
TODAY

Today's Training
Easy Run — 5 miles

NEXT
Tuesday — 4:30 PM
1-on-1 Session

CHECK-IN
Due Sunday

COACH
Eddie sent you an update
```

Main navigation should remain simple and service-driven.

The client does not need to see:
- CRM terminology
- internal notes
- lead information
- coach dashboard functionality
- administrative workflow
- approval mechanics once active

The client's experience should feel like a **personal coaching app**, not a business-management system.

---

# 12. Make Intake Better

The public application exists already.

Keep it.

But after approval, create a fuller Client Intake/Profile experience where appropriate.

Potential sections:

## About You
- Name
- Preferred name
- Phone
- Birthday

## Training
- Primary sport
- Current training
- Weekly availability
- Current mileage
- Strength experience

## Goals
- Primary goal
- Secondary goals
- Target race
- Target date

## Coaching
- What do you want from a coach?
- What has worked before?
- What has not worked?

## Important Information
Only collect information that has a clear coaching purpose and can be appropriately protected.

The design principle is:

> **Client enters information once. Southbound remembers it.**

Do not create repeated forms asking for the same information in different places.

---

# 13. Connect Scheduling to the Client Record

Existing scheduling should NOT be rebuilt.

Instead, connect its events to the Client Hub.

A booking should become part of the client's history.

Example:

```text
Upcoming Session

1-on-1 Soccer Training
Oct 2 — 4:30 PM
Status: Booked
```

After the session:

**Mark Complete**

Then show a simple session note form:

```text
Session Notes

What did you work on?
How did the client perform?
Anything to remember?

[Save Session]
```

That creates durable session history.

Eventually the Calendar tab should display:

- upcoming sessions
- past sessions
- training plan events
- check-ins
- other relevant milestones

---

# 14. Progress Section

Southbound already has substantial training data and external workout integrations.

The Client Hub should eventually summarize that data.

Potential information:

### Running
- weekly mileage
- long-run progression
- race results
- PRs
- completed vs planned training

### Strength
- completed sessions
- major movements/lifts
- progression

### Soccer
- sessions completed
- attendance
- session notes

### General
- client goals
- progress milestones

Do not create duplicate tracking systems if the current app already stores the underlying data.

The Client Hub should **read/summarize existing data whenever possible**.

---

# 15. Check-ins Should Become Part of the Client Record

Current weekly check-ins are already a good foundation.

Keep the existing check-in system.

The Client Hub should show:

```text
CHECK-INS

Sept 21
4 / 5
"Feeling good overall..."
Coach response:
"Great week..."

Sept 14
3 / 5
...
```

The coach should be able to:

- review
- respond
- see previous check-ins
- understand trends over time

The client should be able to:

- submit the current check-in
- see previous check-ins
- see coach responses

Do not duplicate the check-in system. Connect it to the Client Hub.

---

# 16. Plan Management Should Become More Client-Centered

Current `clients.html` has a plan editor that lets the coach edit shared training/race plans.

Keep that functionality.

But eventually the flow should be:

```text
Client Hub
   ↓
Plan
   ↓
Current Week
   ↓
Edit This Week
   ↓
Save / Publish
```

The coach should not need to think about localStorage, shared plan mirrors, or synchronization.

Technical mechanics remain underneath.

The user experience should feel like:

> "I'm coaching John this week."

not:

> "I'm editing a copy of John's shared plan document."

---

# 17. Publish Workflow

A useful future workflow:

```text
Coach edits next week
        ↓
Save Draft
        ↓
Review changes
        ↓
Publish to Client
        ↓
Client sees update
```

Potentially show:

**Draft**

then:

**Published Sept. 25**

This is especially useful once there are many clients.

Do not implement a complex version-control system unless it becomes necessary. Start simple.

---

# 18. Messaging — Keep It Simple at First

Do not immediately build a full texting/chat application.

Start with lightweight communication:

### Coach → Client
- plan note
- client update
- check-in response
- session note

### Client → Coach
- weekly check-in
- booking note
- potentially a future "Message Coach" feature

The existing EmailJS notification system can continue handling email alerts.

The in-app client record should remain the source of coaching history.

---

# 19. Packages / Billing — Later Phase

Eventually Southbound should support:

## Online Coaching
Monthly coaching subscription/package.

## Soccer
- single session
- 5-pack
- 10-pack
- group drop-in
- group monthly package

The client record could eventually show:

```text
PLAN
Running Coaching — Monthly

PAYMENT
Next payment: Oct 1

SOCCER PACKAGE
10 Sessions
7 Remaining
```

Do not implement payments until the client-management foundation is in place.

Business/payment architecture should be its own later phase.

---

# 20. Suggested Data Architecture

Use the existing model as the base.

Current important collections:

```text
userProfiles
coachLinks
sharedPlans
bookingRequests
coachAvailability
checkins
inquiries
users/{uid}/sync/localStorage
```

Add only what is necessary.

A likely future structure is:

```text
clientRecords/{clientUid}
clientNotes/{noteId}
clientTimeline/{eventId}
clientSessions/{sessionId}
clientForms/{formId}
clientProgress/{progressId}
```

Later:

```text
clientPackages/{packageId}
clientPayments/{paymentId}
```

Potential relationships:

```text
userProfiles/{uid}
       │
       └──── clientRecords/{uid}
                    │
          ┌─────────┼─────────┐
          │         │         │
       Notes    Timeline   Sessions
          │         │         │
          └─────────┼─────────┘
                    │
                 Client Hub
                    │
       ┌────────────┼────────────┐
       │            │            │
     Plans       Check-ins   Progress
```

This is conceptual. Inspect the existing code/data before finalizing the schema.

---

# 21. IMPORTANT: Do Not Duplicate Existing Systems

Before creating anything new, inspect these existing modules/data shapes:

- `js/userProfile.js`
- `js/coachAccess.js`
- `js/clients.js`
- `js/checkin.js`
- `js/checkins.js`
- `js/schedule.js`
- `js/scheduling.js`
- `js/coach.js`
- `js/cloudSync.js`
- `js/fueling.js`
- `js/nutrition.js`
- plan-generation modules
- progress/analytics modules
- Firestore rules

The implementation should reuse existing data rather than creating competing versions of the same information.

For example:

- Existing `checkins` remain the check-in source.
- Existing `bookingRequests` remain the booking source.
- Existing `sharedPlans` remain the coach-plan sharing source.
- Existing `userProfiles` remain the access/identity source.
- The Client Hub becomes the place that reads and presents this information together.

---

# 22. Security Requirements

The coach CRM introduces more client information, so security matters.

Continue treating **Firestore Security Rules as the actual security boundary**.

UI hiding is not security.

Private coach notes must only be readable by the appropriate coach(es).

Client-facing updates must be readable by the associated client and appropriate coach.

A client must never be able to alter:
- their own coach-only notes
- coach-only status fields
- coach approval
- internal timeline entries if marked private
- business/admin fields

The existing relationship-based access model should be preserved.

Whenever Firestore rules are changed:

1. update `firestore.rules`
2. update rules tests
3. run the existing test suite
4. tell Eddie to paste the WHOLE rules file into Firebase Console → Firestore Database → Rules → Publish

---

# 23. Existing Architecture Constraints to Preserve

These are important.

### Do not globally rename old EddieOS storage/cache identifiers
The old name may remain in existing data identifiers such as:

- `eddieos-...` localStorage/cache keys
- backup `app` field

Preserve those to avoid data loss.

### New localStorage keys
Register them in:

`js/cloudSync.js`

### Shared headers
App:
- `components/header.html`
- `js/loadHeader.js`

Public site:
- `components/publicHeader.html`
- `js/loadPublicHeader.js`

### Icons
Use:

`js/icons.js`

Dynamic content should hydrate icons as needed.

### Hidden CSS
Remember the existing `[hidden]` CSS gotcha: classes that set `display` can override browser hiding. Preserve/add the blanket hidden override where necessary.

### Tests
Run:

```text
npm test
```

Use:

```text
node --check <touched-js-file>
```

and the existing rule tests.

After adding/removing pages/scripts/styles, run:

```text
npm run manifest
```

### Workflow
Do not blindly edit `main`.

Expected workflow:

1. inspect current repo
2. create feature branch
3. build one roadmap step
4. test
5. commit
6. push branch
7. report what changed
8. wait for Eddie to say **"push it"** before merging to `main`

---

# 24. Recommended Implementation Order

Do this incrementally.

## Phase 1 — Client Hub foundation

Build:

- Client list improvements
- searchable client list
- client card/list rows
- dedicated Client Hub page
- client header/summary
- Overview tab
- existing plan access moved into the new Client Hub flow

Goal:

> Clicking a client gives the coach one home for that client.

---

## Phase 2 — Client profile

Add `clientRecords` only where needed.

Build:

- preferred name
- phone
- start date
- primary goal
- secondary goals
- current sport
- target race/date
- availability/preferences
- intake status

Goal:

> Southbound remembers who the client is and how Eddie coaches them.

---

## Phase 3 — Private notes + client updates

Build:

- private coach notes
- client-facing updates
- clear permission separation
- notes visible in Client Hub

Goal:

> Eddie can keep context without accidentally exposing private notes.

---

## Phase 4 — Timeline

Start generating timeline events from existing activity:

- application
- approval
- plan update
- check-in
- booking
- client update
- note

Goal:

> Eddie can understand the whole client relationship chronologically.

---

## Phase 5 — Dashboard / Needs Attention

Upgrade `coach.html`:

- actionable items
- client follow-ups
- check-ins needing response
- bookings needing response
- plan work
- searchable client list

Goal:

> Eddie opens Southbound and immediately knows what needs attention.

---

## Phase 6 — Calendar + session history

Connect bookings to Client Hub.

Add:

- upcoming sessions
- historical sessions
- session status
- mark complete
- session notes
- attendance

Goal:

> Every real coaching interaction becomes part of the client's record.

---

## Phase 7 — Progress integration

Read existing training/running/strength/soccer data where possible.

Create a Client Hub summary rather than duplicate data entry.

Goal:

> Eddie can see the client's trajectory without opening five different tools.

---

## Phase 8 — Improve client-side experience

The client gets:

- Today
- next session
- plan
- check-in
- progress
- coach updates

Goal:

> Client interaction becomes simple and low-friction.

---

## Phase 9 — Packages / billing

Only after the client-management system is stable:

- packages
- sessions remaining
- payment status
- subscriptions
- invoices
- checkout

Goal:

> Turn Southbound into a real coaching-business platform.

---

# 25. What the Final Southbound Experience Should Feel Like

## Eddie's side

```text
I open Southbound.

I immediately see who needs me.

I click John Smith.

I instantly see:

- who he is
- what he's training for
- what plan he's on
- how last week went
- what I told him
- what session is next
- what I need to change
- what has happened recently

I make the change.

I publish it.

John gets the update.
```

## Client side

```text
I open Southbound.

I see today's training.

I see what's coming next.

I complete my workout.

I check in.

I see my coach's feedback.

I know what I need to do next.
```

That is the target.

---

# 26. Product Philosophy

Do not chase feature count.

The goal is not:

> "How many Mindbody features can Southbound copy?"

The goal is:

> **"How seamlessly can Southbound help Eddie coach a real person from application → onboarding → plan → training → check-in → adjustment → session → progress → long-term client relationship?"**

The client should feel like Southbound knows them.

The coach should feel like Southbound helps them remember everything.

---

# 27. Very Important Implementation Instruction for the Next Chat

Before writing code:

1. Inspect the current `main` branch.
2. Read `CLAUDE.md`.
3. Read `docs/PRODUCT_ARCHITECTURE.md`.
4. Inspect the actual current versions of all relevant files.
5. Verify the real Firestore/data shapes before proposing new collections.
6. Do not trust old documentation if the code has changed.
7. Do not rebuild working systems unnecessarily.

The next chat should approach this as an **incremental product upgrade**, not a rewrite.

Start with **Phase 1: Client Hub foundation** unless a current-code audit reveals a specific architectural issue that must be resolved first.

When proposing implementation, explain:

- what existing code will be reused
- what new files/collections are needed
- how existing data will flow into the Client Hub
- how the client sees the simplified version
- how security rules change
- how existing tests should be extended

Do one phase at a time.

Stop after completing the phase and report exactly what changed.

Do not merge to `main` until Eddie explicitly says:

> **push it**

---

# 28. One-Sentence Handoff

**Upgrade Southbound from a collection of working coaching features into a connected client-management platform centered around a Client Hub, while keeping the client-facing experience extremely simple and reusing the existing profile, coach-link, plan, check-in, scheduling, cloud-sync, and training systems.**
