# EddieOS — Product Architecture Audit

_Written from direct inspection of the live repository, not from prior conversation summaries. Treat this as the source of truth for the coaching-platform redesign; update it as decisions are made rather than letting it drift out of sync with the code._

## 1. What Actually Exists Today (Ground Truth)

**Pages (21 HTML files, all fully public, zero access gating):** `index` (dashboard), `running`, `strength`, `cross-training`, `habits`, `nutrition`, `fueling`, `marathon`, `75day`, `planner`, `programs`, `analytics`, `weekly-review`, `gear`, `pace-calculator`, `settings`, `install`, `more`, `clients`, `schedule`, `site-check`.

**The single most important finding: there is no account/role system at all.** A repo-wide search for `role`, `isCoach`, `isAdmin`, `accountType`, `permission` turns up nothing except UI tab *labels* ("Coach a Client" / "Book a Session") on `clients.html`/`schedule.html` — those are toggles, not permissions. `auth.js` exports `requireLogin()` but **no page anywhere calls it** — every page renders fully regardless of sign-in state. Your account and a brand-new stranger's Google account are architecturally identical today. This fact shapes everything else in this document.

### Data architecture (confirmed from code)

- **Single-tenant per-user blob**: `users/{uid}/sync/localStorage` in Firestore, mirroring a flat set of localStorage keys (training/running programs, strength, habits, nutrition, fueling, gear, personal records, settings, etc.) via last-write-wins timestamps per key. Solid, working infrastructure — keep it as the "personal data" layer.
- **Cross-account relationship layer** (built recently, genuinely new): `coachLinks/{coachUid}_{clientUid}` (consent via one-time invite code), `sharedPlans/{clientUid}` (mirrors just training/race plans + coach notes), `coachAvailability/{coachUid}`, `bookingRequests/{id}`. This is a *relationship-based* permission model — narrow and consent-scoped — not a role system. It answers "can uid A touch uid B's data" for specific document types. It does **not** answer "is this account a coach at all" or "is this account an approved client."
- No server. Firestore + static GitHub Pages hosting + client-side JS only. No Cloud Functions, no payment processing, nothing server-authoritative beyond Firestore Security Rules.

### Already built and solid (don't rebuild)

- Training Plan generator (`js/trainingPlanGenerator.js`, 639 lines) — goal-vocabulary-driven, deterministic-but-varied, mileage allocation, quality-day spacing.
- Race Plan generator (`js/racePlanGenerator.js`, 744 lines) + editor + strength integration.
- Cloud sync engine (`js/cloudSync.js`) — per-key conflict resolution, works well.
- Device integrations: **COROS** (`corosAuth.js`, `corosData.js` [771 lines], `corosCoach.js`, `corosPlanCompare.js`, `corosStatus.js`, `corosDiagnostic.js`) and **Strava** (`stravaAuth.js`, `stravaData.js`). Real, working integrations pulling external workout data in — belongs in the "Track/Progress" pillar and is more built than it might seem from memory alone.
- Design system: dark navy (`--bg:#0F172A`), surface cards (`--surface:#1E293B`), blue accent (`--primary:#4EA8FF`), Inter body / Bebas Neue display / JetBrains Mono, all via CSS custom properties in one `css/style.css`. Real, reusable, consistently applied. Keep it.
- Coach↔client linking, plan editing with per-day fields, coach notes, availability + request/approve booking with group capacity — all built and tested, live on main.

### Partial (mechanism exists, product doesn't yet)

- Booking/scheduling: request→approve flow, recurring weekly bookings, group capacity all work. Missing: location field, session duration choices, payment, "packages," a public-facing booker (current flow requires an existing `coachLinks` invite by design, so a cold visitor can't use it yet).
- Coach notes exist on Training/Race plans only — not a general messaging/check-in system.
- Nutrition and Fueling are separate pages/localStorage keys with (as far as verified) **zero connection** to workout data. Internal data shape of `fueling.js`/`nutrition.js` not yet read in detail — flagged here rather than assumed.

### Not yet built at all

Account roles/status, client approval workflow, service/entitlement-based nav, public marketing site, weekly coaching check-in cycle, training↔fueling connection, payments/packages, multi-coach support, messaging.

## 2. The Real Architectural Risk

The product vision assumes a role system exists (login asks Coach or Client, but that selection alone shouldn't grant access). Right now there's nothing to layer that logic onto — no `users/{uid}/profile` document with a `role` or `status` field at all, just the sync blob. This isn't a UI problem, it's a data-model gap, and every other phase depends on it.

**Pushback on the originally proposed sequence:** "public website redesign" before "authentication + account roles" was the draft order. That should flip. A polished public site with a "Sign In" button that drops someone into the exact same fully-open dashboard as today undermines the premise of the whole redesign. The account/role/status data model should land first — it doesn't need a UI yet, just a `users/{uid}/profile` document created the moment someone signs in for the first time. Everything else (public nav, client nav, coach nav, approval workflow) then just *reads* that document and branches — cheap once it exists, awkward to retrofit if it doesn't.

## 3. Proposed Account/Role Architecture

```
users/{uid}/profile   (new document — doesn't exist today)
{
  role: "client" | "coach",        // requested by user at signup, NOT trusted for access
  isCoachApproved: boolean,        // set ONLY by an existing approved coach, server-trusted
  status: "pending" | "active" | "archived" | "suspended",
  services: ["online_coaching", "running", "strength", "soccer_1on1", "soccer_group"],
  displayName, email, createdAt
}
```

Critical rule: `role: "coach"` in a user's own profile is **self-reported and never grants anything by itself**. Every coach-only Firestore rule and every coach-only UI branch checks `isCoachApproved == true`, and that field can only ever be set by a write from an account that is *already* `isCoachApproved` (bootstrapped manually the first time, same manual-deploy pattern already used for `firestore.rules`). This mirrors the pattern `coachLinks` already uses (a coach can't self-grant access to a client, only redemption of that client's own code creates the link) — it just needs to extend one level up to "is this account a coach at all."

`services[]` is what makes a soccer-only client vs. a hybrid client vs. an online-running client possible from *one* profile document, one account — the client nav reads this array and shows/hides sections.

## 4. The Three Experiences

**Guest (not signed in):** Today, literally every page is this. Should become a small, fixed set of marketing pages that know nothing about training plans, nutrition, or any internal tool. A nav like Home / Coaching / Soccer / About / Pricing / Book / Sign In is right-sized. Note: a cold visitor's "Book" probably shouldn't hit the same `schedule.html` that requires an existing `coachLinks` relationship — it likely needs a lighter "request info / apply" form that feeds the approval workflow, with real booking unlocking after approval.

**Client (signed in, `status: active`):** Today/Calendar/My Plan/Training/Fuel/Progress/Coach/More is need-based, not feature-based — the right shift from today's dropdown-of-everything nav. Build the nav to be **service-driven from the start**, not retrofitted later — a soccer-only client's nav should omit Training/Fuel/My Plan entirely rather than show them empty. Cheap to do now (filter nav items by `services[]`), expensive to retrofit once every client is used to seeing all sections.

**Coach (`isCoachApproved: true`):** Closest to already existing. `clients.html` + `schedule.html` are the real seed of the Dashboard/Clients/Calendar/Bookings sections — they need to be pulled together under one coach-specific nav rather than living as two standalone pages reachable from a generic "Tools" dropdown like today.

## 5. Onboarding/Approval Workflow

On top of the profile document: guest signs in → profile auto-created with `status: "pending"`, `role: "client"` → they pick service(s), optionally submit an intake form → coach sees them in a "Pending" list (a filtered view of `clients.html`, not a new page) → coach approves → `status` flips to `active`, `services[]` set by coach → nav unlocks. The existing `coachLinks` invite-code mechanism can fold into this rather than being separate: approving a pending client *is* what creates the link; the invite-code flow becomes the "existing client invites a friend" path instead of the only path in.

## 6. Training ↔ Fueling Connection

The most product-differentiating idea in the vision and currently the least built (zero connection today). Proposed shape: each generated training day already has `type`, `miles`, `session` fields (verified in `trainingPlanGenerator.js`/`runningPrograms.js`). A fueling engine would compute a `fuelingTargets` object per day (pre/during/post — carbs, fluid, sodium) as a function of duration and intensity, attached to that day object or looked up by date from fueling data. Client sees the collapsed version ("Fuel before / during / after"); coach can see and override generated targets; athlete logs actuals against it. **First real step here is reading `fueling.js`/`nutrition.js`'s actual data shape, not writing the engine** — don't design against assumed fields.

## 7. Recommended Phased Roadmap (revised)

1. **This audit** — done.
2. **Account/profile data model** — `users/{uid}/profile`, security rules, no UI yet beyond auto-creating it on first sign-in.
3. **Coach bootstrap + approval UI** — extend `clients.html` with a Pending list and approve action; this is where `isCoachApproved` gets set on the coach's own account manually.
4. **Public site** — now it has something real to gate behind "Sign In."
5. **Service-driven client nav** — filtered by `services[]`, replacing today's dropdown-of-everything.
6. **Coach dashboard** — consolidate `clients.html` + `schedule.html` under one coach nav, add a "needs attention" summary view.
7. **Weekly coaching cycle** — done. `checkin.html`/`js/checkins.js`: a client submits one rating+notes check-in per week to a linked coach (`checkins/{clientUid_weekOf}`), the coach reviews from a queue (also surfaced on the Coach Dashboard stat grid) and writes feedback back, both steps optionally emailed via EmailJS. Plan publishing itself still happens through the existing plan editor in `clients.html` -- the check-in is the trigger that pulls a coach back to a specific client each week, not a new plan-editing surface.
8. **Training↔fueling connection.**
9. **Booking refinements** — location/duration fields, public-facing request path, payment.
10. **Business tools** — payments, packages.

Payments and multi-coach infrastructure are last deliberately — expensive to change later in terms of money and trust, not architecture, so no rush.

## 8. Brand Name

Deferred until the product is clearly defined. When revisited: broad enough to cover coaching + performance + scheduling, not tied to "Eddie" or to running specifically, while keeping the mountain/E mark.

## Open Items / Next Decisions

- Confirm exact `services[]` vocabulary before building the entitlement filter.
- Read `fueling.js` and `nutrition.js` data shapes before designing the training↔fueling connection schema.
- Decide the public-site "Book"/"Apply" flow's exact fields before building the approval workflow intake form.
