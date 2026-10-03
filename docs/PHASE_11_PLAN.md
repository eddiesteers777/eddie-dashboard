# Phase 11 — Client experience and service entitlements

Audit of `main` at e334cfa (2026-10-03) and the plan that follows from it. **Nothing in sections 3–6 is built yet.** Eddie answered the decisions on 2026-10-03 (at the end); the capability table below follows them. Waiting on his go-ahead ("step 1").

---

## 0. The bugs behind "clients don't show up" and "I can't edit their profiles"

They're fixed on branch `claude/sweet-gauss-5buyzm`, commit c3e5a7f. None of them is live until "push it".

| What Eddie saw | Cause | Fix |
|---|---|---|
| Opening any client said "client not found", so no profile could be edited | Since 2026-09-30, `loadClientRecord` (js/clientDirectory.js) had a positional `Promise.all` with `packages` missing from its names. Every value after it shifted by one, and the hub crashed for **every** client. | Uses named parts (`allNamed`), so a missing name can't shift values again |
| Find a Client → **Assign** always failed | `assignClient` read the coach link before creating it. Reading a link that doesn't exist yet is refused by the rules (permission-denied, not "missing"). | Writes directly; "already your client" is told apart afterwards. A rules test documents both. |
| Approving someone didn't link them | Same cause: Approve calls `assignClient` | Same fix |
| (not reported yet) A client's first wearable share failed | Same read-before-create in `saveWearableShare` | A refused read now means "first share" |
| Searching for a client you already coach found "no active client profiles" | Find a Client only lists people **not** linked to you, and its empty message was misleading | Matching clients you already coach show as "Already your client · Open". The empty message now says how a client becomes findable. |

**Still true by design:** Find a Client can only list accounts that have a `clientDirectory` entry (added 2026-09-30). An account gets one when its owner opens the updated app, or when a coach approves it or changes its services. The rules don't let a coach read the full profile of an active client they aren't linked to, so the coach's app can't create the entry for them. So an account approved before 2026-09-30, and not opened since, stays invisible until that person opens the app once (or sends a code, More → Connect with Coach). Older **pending** signups are the same: the Pending list now reads the directory too.

**Eddie's two steps:**
1. **Paste the whole `firestore.rules` into Firebase.** The checklist shows Phase 6 (`sessionLogs`) as unpublished, and `main` has since added `clientDirectory`, `clientPackages`, `wearableShares` and `sharedWearable*`. Without them, Pending, Find a Client, packages and session logs are refused.
2. Ask any client who's missing from search to open the app once.

---

## 1. Already right — keep as is

- **The coach boundary is the rules.** `isApprovedCoach()` reads the caller's own profile. A self-signup is pinned to pending with no services. A client can only edit their application fields, `displayName`, `email` and `lastSeenAt` (server time).
- **The relationship gate.** `coachLinks` is created by an approved coach, either directly (active client, exact name/email) or by burning an invite code. Every coach read of client data checks `linked()`.
- **Coach-private collections have no client clause:** `coachNotes`, `coachingPlanDrafts`, `coachingPlanMasters`.
- **Minimal directory:** `clientDirectory` holds only name, email, services and status. `userProfiles` can't be listed.
- **Wearables are client-controlled.** Only the client creates `wearableShares`. Each `sharedWearable*` read needs that category's consent. A coach link grants nothing here.
- **Account isolation** in `js/auth.js`: a storage owner, and the cache is cleared when the account changes.
- **Coach plans:** published versions, a whole-plan master, the client's two-week window, and Got it.
- **One week model** (`js/weekModel.js`) feeds both Today and My Plan.
- **Fueling:** `js/fuelTargets.js` and `js/workoutFuel.js`.
- **Sessions:** `sessionLogs`, attendance, and package credits counted from completed logs via `packageAssignmentId`.
- **Nav fails open and is documented as UX only.**
- **Spark-compatible.** The one exception is `functions/` (Stripe, needs Blaze). It isn't deployed and should stay untouched.

---

## 2. Inconsistent today

**A. The service list is defined in 8+ places, with different labels:**
- `userProfile.SERVICES` ("Running Coaching")
- `applicationForm.js` ("Online coaching")
- `inquiries.js` (uses a combined `running_strength`)
- `clientSummary.js` labels
- `emailNotify.js` labels
- `navAccess.js` / `clientSummary.js` `TRAINING_SERVICES`, plus two inline copies in `clientHub.js`
- `packageCatalog.js`
- the rules (the applications list and the packages list)

**B. Services collapse into two buckets.** `hasTrainingAccess` is online / running / strength; `hasSoccerAccess` is soccer.
- A running-only client sees Strength, Cross-Training, Nutrition and Fueling.
- A strength-only client sees Running, Fueling, the Pace Calculator and the Readiness card.
- **`data-requires="soccer"` is used nowhere.** Soccer access unlocks nothing of its own. A soccer-only client gets only the generic "client" pages: Schedule, Check-in, Updates and Profile.

**C. Today ignores services.** Every client, soccer-only and pending included, sees:
- the stats row (Weekly Mileage, Recovery / Sessions Booked, Habit Streak)
- the Nutrition snapshot
- the tile grid (Strength, Cross-Training, Nutrition, Fueling, Habits, Pace Calculator)

A soccer-only client's rest day says "Log a run on Running or start a workout in Strength", which points at pages their menu hides.

**D. Phone and computer disagree.**
- Habits is a phone tab for everyone (pending and soccer included). On a computer it sits inside the training-only Train menu.
- My Plan is `client` on a computer but `client-training` on a phone.
- Search filters out only the coach's pages, so a soccer-only client can still jump to Running, Nutrition or Fueling.

**E. Account status is ignored by the nav.** An archived (denied) account keeps its services, and so its full menu.

**F. Packages vs services.** The catalog and the rules only know online and soccer packages. `running` and `strength` have none, so today they work as menu switches rather than things a client buys. Decision 1 below.

**G. Bookings ignore services.** Any linked client can request any session type. The coach still approves, so it's low risk.

**H. Loose ends in the rules and data:**
- The rules don't check `userProfiles.services` values, so any string a coach writes is kept.
- ~~`clientDirectory.services` is client-writable~~ (checked in step 1: the rules require it to equal the profile's `services`, so it can't be forged).

**I. PR #20 (My Progress).**
- Good: it reuses `summarizeProgress` from `clientSummary.js` (already on `main`) and needs no rules change.
- But it's gated on `training`, so the soccer-only clients its soccer metrics are for can't reach it.
- The coach gets a "My Progress" link with nothing in it.
- It's based on 2026-09-30 and conflicts in `sw.js` / `site-manifest.json`.

**Don't merge it.** Fold its metrics into the Progress section (step 4) and close it with a note.

**J. The coach's command center has no package signals:** credits running out, a package ending, payment past due.

**K. Access checks are scattered:**
- `COACH_ONLY_PAGES` in `loadHeader.js`
- `role.js`
- `navAccess.js`
- the "client" view checks on each page

**L. Fragile profile read.** `syncClientDirectory` runs inside `getMyProfile()`. If that write fails (unpublished rules, say), the whole profile read fails and the nav falls back.

---

## 3. What should change

1. **One service registry** (`js/services.js`, pure). It holds ids (unchanged), labels, short labels, and what each service grants. Every list above reads from it, and a test keeps the rules' lists in step.
2. **Capabilities instead of two buckets**, worked out from `services` + `status` + `isCoachApproved`.
3. **Nav, More, search and the not-entitled page redirect** all ask the capabilities.
4. **Today is composed from sections**, each with the capability it needs and four distinct states.
5. **Progress** rebuilt from PR #20, capability-aware.
6. **Package signals** in the coach's queue.
7. **The directory sync stops blocking the profile read.**

Capabilities stay **UX only**. The rules keep enforcing:
- own data
- links
- coach approval
- wearable consent
- package relationships

No rule starts trusting a capability or anything stored on the device.

---

## 4. Capability model (proposal)

`capabilitiesFor({ services, status, isCoachApproved })` returns a `Set`. It's pure and unit-tested, and unknown service strings are ignored.

| Capability | Granted by | Unlocks |
|---|---|---|
| `plan` | online, running, strength; soccer-only **while Eddie has given them an active coach plan** | My Plan tab, workout pages, Today's workouts, Send to COROS |
| `running` | online, running, strength | Running, Pace Calculator, run logging |
| `strength` | online, running, strength | Strength page and library |
| `crossTraining` | online, running, strength | Cross-Training |
| `fueling` | online, running, strength | Fueling page, Fuel card on runs (never soccer-only) |
| `nutrition` | online, running, strength | Nutrition (never soccer-only) |
| `readiness` | online, running, strength | Readiness card (still needs their own COROS) |
| `sessions` | soccer_1on1, soccer_group | Book a session (only these clients can request one), sessions on Today, session notes |
| `checkins` | online, running, strength; soccer-only **only while they have an active coach plan** (work outside sessions) | Weekly check-in |
| `progress` | any active service | Progress section / page, content per capability |
| `habits` | any active service | Habits |
| `package` | any active service | Package card (shows only when a package exists) |
| `coach` | `isCoachApproved` | Coach section + personal tools (unchanged) |

- Every active client also gets profile, From Your Coach, Connect with Coach and Get the App.
- Pending gets a waiting banner, the guided profile and Get the App (decision 4).
- Archived gets the same as pending, minus the profile.
- Offline: the capabilities this device last knew, cached as `sb-nav-access` v2; old v1 entries are ignored.
- If the profile can't be read and nothing is cached: all client capabilities, **never** `coach`.

**Section states, shown differently on every section:**
- **Not entitled** → absent, with no empty card.
- **Entitled, no data** → a designed empty state with the next step ("Your coach is building your plan").
- **Loading** → `sb-wait` / skeleton.
- **Offline** → the last copy + "last updated …", or "Available when you're back online".

---

## 5. Client Today, top to bottom

1. **Header:** greeting, plan week / phase.
2. **One banner only when needed:** waiting for approval / not connected yet / plan updated (Got it) / your coach asked.
3. **Today** (`plan` or `sessions`): today's workouts and sessions, Mark done / Start, rest day + next. The Readiness card sits inside it for people with COROS.
4. **This Week** (`plan` or `sessions`): the strip linking to My Plan.
5. **Coach:** From Your Coach (updates, check-in due, profile check, change answers).
6. **Progress** (`progress`): 3–4 numbers for what they do (miles or sets or sessions attended) + link to the Progress page.
7. **Package & sessions** (`package` / `sessions`): package, credits left, next session.
8. **Tools** (folded, filtered): Nutrition, Fueling, Habits, Pace Calculator, Settings. The old stats row and Nutrition snapshot move into Progress / Tools under their capability.

- **Soccer-only Today:** next session, this week's sessions, coach, attendance + "what you worked on", credits. No mileage, fueling or readiness.
- **The coach's Today** is unchanged; the command center stays on `coach.html`.

---

## 6. Implementation steps

Each step is one reviewable commit with tests, then "push it".

0. **Done on the branch:** the hub crash, Assign / auto-link on Approve, the first wearable share, and clearer search.
1. **Registry + capabilities (pure).** ✅ Done 2026-10-03 (`js/services.js`, `tests/services.test.mjs`; also fixed `tests/clientAssignment.test.mjs`, which wasn't in the suite and expected the wrong order).
   - `js/services.js` and `capabilitiesFor`, with unit tests.
   - A test that the rules' service lists match.
   - Every duplicated list switches to the registry, which unifies the labels.
   - No visible change apart from the labels.
2. **Nav from capabilities.** ✅ Done 2026-10-03 (`js/navAccess.js`, `tests/navAccess.test.mjs`; Today's rest-day text and the coach card's booking / check-in prompts follow the capabilities too).
   - `getNavAccess()` returns `caps`; `hasTrainingAccess` / `hasSoccerAccess` stay, derived from it, until nothing reads them.
   - `data-requires="running"` etc. are checked against the capabilities.
   - Phone tabs, computer menus, More and search agree.
   - A client who opens a page they aren't entitled to by link goes to Today with a short note (UX only, like `COACH_ONLY_PAGES`). The coach is unchanged.
3. **Today composition.** ✅ Done 2026-10-03 (`js/todayLayout.js`, `tests/todayLayout.test.mjs`; soccer rest days show the next session).
   - A section list with capabilities + the four states.
   - Soccer-only and pending versions.
   - The stats row, Nutrition snapshot and tiles move under their capability.
4. **Progress.** ✅ Done 2026-10-03 (`progress.html`, `js/clientProgress.js`, `js/progressView.js`, `tests/progressView.test.mjs`). PR #20 closed.
   - `progress.html` + the Today snapshot, rebuilt from PR #20 on top of `summarizeProgress`, per capability.
   - No coach link. Close PR #20.
   - This overlaps Client Management Phase 7 (progress, on hold): do them as one.
5. **Packages and sessions.** ✅ Done 2026-10-03 (`packageAttention`, a Packages and payments group on the dashboard; Today's package card already follows the `package` capability since step 3). PR #20 closed.
   - Today's package card follows the capability.
   - Coach queue: 1 credit left, package ends within 7 days, payment past due / pending over 7 days.
   - Pure, in `feedbackModel` / `coachToday`. No rules change.
6. **Hardening.** ✅ Done 2026-10-03: directory save never blocks the profile read (and skips archived accounts); archived accounts see "isn't active" on Today and More; RULES: known services only on profiles, bookings only from active soccer clients (2 rules tests).
   - `syncClientDirectory` fire-and-forget.
   - Archived accounts.
   - Optional rules changes (Eddie's call): validate `userProfiles.services` values; a booking's type must match the client's services. Each needs rules tests + a paste.
7. **Docs + full regression.**

---

## 7. Testing

- **Unit:**
  - the `capabilitiesFor` matrix: pending/none, running, strength, soccer 1-on-1, group, online, running+soccer, archived, coach, unknown strings, offline cache
  - registry vs the rules' lists
  - the Today section picker
  - progress per capability
  - package signals
- **Static:**
  - no service list outside the registry (a grep test)
  - every `data-requires` value is a known capability
- **Rules:** unchanged until step 6. The existing 61 must pass. Step 6 adds the attack + legitimate flow for anything it changes.
- **Browser (emulator + Playwright, 390 and 1280).** Personas: signed out, pending, running-only, strength-only, soccer-only, hybrid, online, coach. For each:
  - phone tabs
  - computer menus
  - More
  - search
  - Today sections and their empty / loading / offline states
  - a direct link to a page they aren't entitled to
  - a direct link to a coach page

  Coach regressions: dashboard, hub (every tab), publish, Find a Client + Assign, Approve + link, session log.
- **Keep the legacy-account scenario** from this audit (old link, no directory entry, hub edit, assign) as a permanent suite. It's the one that would have caught both live bugs.

---

## 8. Risks and migration

- **No data migration:** capabilities come from the existing `services`. Some clients will see **fewer** pages (a running-only client loses Strength). Eddie decides the mapping first.
- **Cached access on phones:** the `sb-nav-access` shape changes, so it gets a version and old copies are ignored. Every changed file goes through `npm run manifest`.
- **Fail-open stays,** but it never grants `coach`.
- **Legacy accounts** still need to open the app once to be searchable (section 0).
- **Unpublished rules** make Pending, Find a Client, packages and session logs fail. Paste first.
- **PR #20** will conflict if merged later. Close it once step 4 lands.
- **`functions/` (Stripe)** stays undeployed; packages keep the manual payment status.
- **More than one coach later:** `userProfiles` lets any approved coach update any profile. That's fine with one coach, but it needs narrowing (linked or pending only) before a second coach is approved.

---

## Decisions (Eddie, 2026-10-03)

1. **Online Coaching includes running and strength.** Yes.
2. **Running-only and strength-only clients see both** Running and Strength. Yes. So the three training services grant the same capabilities; the real split is training vs soccer.
3. **Soccer clients:** Habits yes, Nutrition no (and no fueling). The weekly check-in only when Eddie gives them work outside sessions. In the app that means: while a soccer-only client has an active coach plan from Eddie, they get `plan` + `checkins`; without one, neither.
4. **Pending accounts:** only the waiting banner, their profile and Get the App. Yes.
5. **Booking requests:** only clients with a soccer service. The only in-person sessions for now are soccer. Done in the app in step 2; a rules check stays optional (step 6).
