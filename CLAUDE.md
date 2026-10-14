# Southbound Coaching — Project Guide

Southbound Coaching (formerly "EddieOS") is Eddie Steers' coaching business platform: a public marketing site for guests, plus an installable app (PWA) where clients train and Eddie coaches them. It covers online coaching, running and strength programming, and 1-on-1 or group soccer training.

- **Live site:** https://southboundcoaching.com (GitHub Pages custom domain via `CNAME`; deploys automatically from `main`). The old github.io address redirects there. Absolute URLs (share tags, the COROS `oauth/client-metadata.json` client ID) use the domain; everything else uses relative paths, so keep it that way.
- **Repo:** `eddiesteers777/eddie-dashboard`

**This file is the rules. The details live in `docs/`:** read only the section you need (see "Where the details are").

---

## Directions for a new chat (read first)

1. **Read this file, then the relevant part of `docs/APP_REFERENCE.md`,** before changing anything. Inspect the real code instead of trusting summaries. The docs describe intent, and the code is the truth.
2. **Workflow Eddie expects:**
   - Build on a feature branch, test it, commit, and push the branch.
   - Wait for Eddie to say **"push it"** (or "push"). Only then merge to `main` (`git checkout main && git pull origin main && git merge --no-edit <branch> && git push origin main`) and switch back to the branch.
   - Eddie paces big work with short messages like "step 8". Do one roadmap step fully (build → test → report), then stop.
3. **Eddie isn't a developer.** Any step he has to do himself (Firebase Console, GitHub uploads) needs plain, click-by-click directions. Screenshots from him are common, so read them carefully.
4. **Challenge ideas when there's a better way.** Eddie explicitly asked for pushback, not agreement.
5. **Firestore rules are NOT auto-deployed.** Whenever `firestore.rules` changes, tell Eddie to paste the **whole file** into Firebase Console → Firestore Database → **Rules** → Publish. A new collection without its rules fails with permission-denied.
6. **Never put Eddie's email or other personal info in the code.** He chose to keep it out of the public repo.
7. **When you finish a feature,** add its details to `docs/APP_REFERENCE.md` (how it's built) and `docs/BUILD_HISTORY.md` (what was done and tested). Add a line here only if it's a new rule or gotcha every future change must know.

---

## The three experiences

| Who | What they see | How it's decided |
|---|---|---|
| **Guest** (signed out) | Public site only: Home, About, Packages, Contact, Get the App, Apply, the free Pace and Fuel calculators | `js/loadHeader.js` sends signed-out visitors on any app page to `home.html` |
| **Client** (approved, `status: "active"`) | The app, filtered to the services Eddie granted them | `services[]` on their profile → capabilities (`js/services.js`), applied by `js/navAccess.js` / `js/todayLayout.js` |
| **Coach / admin** (`isCoachApproved: true`) | Everything, plus the Coach section | Eddie's own account. Approved coaches can approve anyone. |

A new sign-in starts as a **pending client** with no services: it sees only Today (a "waiting for approval" card), its profile and Get the App until approved. A denied (archived) account sees "Your account isn't active".

---

## Page map (one line each; details in `docs/APP_REFERENCE.md` → Page map)

**Public site** (`components/publicHeader.html` + `js/loadPublicHeader.js` + `css/public.css`): `home.html` (guest dashboard), `about.html` (bio still placeholder), `packages.html` (prices still "Pricing on request"), `coaching.html` (incl. the labelled example week, `tests/exampleWeek.test.mjs`: illustration only, never a claim), `soccer.html`, `apply.html` (apply without an account, `js/apply.js` + `js/applicationForm.js`), `contact.html` (questions, no sign-in), `install.html` (Get the App), `pace.html` + `fuel.html` (free calculators; `pace.html` shares markup with `pace-calculator.html`, `tests/publicTools.test.mjs` fails if they drift), `privacy.html` (keep it true when data handling changes). Photos in `images/` (`images/README.md` lists filenames).

**App, client pages** (`components/header.html` + `js/loadHeader.js`): `index.html` Today (client sections follow services, `js/todayLayout.js`), `train.html` + `running.html` / `strength.html` / `cross-training.html`, `nutrition.html`, `fueling.html`, `habits.html`, `plan.html` (My Plan, the week), `workout.html` (one workout: steps, workout mode, log, fuel; `&kind=strength` = coach strength session), `progress.html` (My Progress), `checkin.html`, `schedule.html` (Sessions), `messages.html`, `updates.html` (From Your Coach), `profile.html` (guided profile; `?edit=all` = one-page form), `clients.html?tab=share` (Connect with Your Coach), `programs.html`, `pace-calculator.html`, `settings.html`, `more.html`.

**App, coach pages:** `coach.html` (dashboard: Who needs you today, applications, your clients), `clients.html` (Coach a Client + Pending), `client.html?uid=…` (Client Hub; tabs Overview / Messages / Workouts / Plan + More menu; `?tab=` deep links, `tests/hubTabs.test.mjs`), `checkin.html` (review), `schedule.html` (availability, requests). Eddie's own tools: `marathon.html`, `75day.html`, `planner.html`, `analytics.html`, `weekly-review.html`, `planning.html`, `gear.html`.

Deep links: `?tab=pending`, `?tab=availability`, `?tab=review`, `?tab=coach`, read by each page's `selectTab()`. `site-check.html` is a diagnostics page, exempt from the guest redirect.

---

## How it's built: the rules every change must follow

### Build, deploy, offline
- **Static site, no build step.** Plain HTML/CSS/ES-module JS on GitHub Pages. PWA via `manifest.json` + `sw.js`.
- **Run `npm run manifest` after changing ANY file** (not just adding/removing). It rewrites the precache list in `sw.js` (a fingerprint per file), which is how installed phones learn about a new version; a static test fails when it's stale. **After replacing a photo, run `python3 scripts/build-images.py`.**
- The service worker serves the whole app from the device (one version, all or nothing) and offers "A new version of Southbound is available. Refresh". Public pages don't register it. Firestore, sign-in, COROS and non-GET requests are never touched by it. `.mp4` / `.webm` go straight to the network.
- **Offline writes that matter to clients** (workout/strength logs, check-ins, change requests) go through `settleWrite()` in `js/offlineWrite.js`. Emails asked for offline wait in a device-only outbox.

### Accounts, data, sync (don't break these)
- **Firebase** (project `eddie-s-dashboard`): Google sign-in only (`js/auth.js`), Firestore (`js/firebase.js`) with single-tab persistent cache. Signing out (`logout()`) clears the cache and all account-sensitive local/session state. An account-owner sentinel (`sb-account-storage-owner`) and the auth-transition guard detect UID changes, clear account state and reload. **A new account-data key must be added to the sign-out lists in `js/auth.js`** (and to `EXACT_KEYS` / `KEY_PREFIXES` in `js/cloudSync.js` if it should sync).
- **Cloud sync** (`js/cloudSync.js`): one doc per account (`users/{uid}/sync/localStorage`), last write wins per key, pushes only changed keys; `users/{uid}/sync/meta` holds a version so page loads skip the big read. Conflicts on fueling keys merge in `js/syncMerge.js`.
- **Firestore rules are the security boundary; nav hiding is UX only.** Every rules change needs a test in `tests/rules.test.mjs` (the attack and the legitimate flow).
- **The client profile rule is generated** from `js/clientRecordSchema.js` by `node scripts/build-profile-rules.mjs` (between BEGIN/END markers in `firestore.rules`); run it after changing a profile field or choice. `tests/clientRecordSchema.test.mjs` fails if they differ.
- **A coached plan's source of truth is `coachingPlans`** (+ `coachingPlanMasters` for the whole plan, coach only). The client's copy and versions hold only this week and next. Never write a coach plan into `running-programs`/`training-programs` or edit it through `sharedPlans`; publish a new version.
- **Private coach notes (`coachNotes`) and client updates (`clientUpdates`) are separate collections on purpose,** so a private note can never reach a client. `clientRecords` is readable by the client: nothing coach-private goes there.
- **The coach's side must never open a client's private sync doc.** Client data reaches the coach only through explicitly shared projections (`sharedWearable*`, `sharedAthleteModel`) with the client's consent.
- **Eddie's personal plan** (`js/marathonData.js`, Indianapolis, 3:05) shows for the coach only. Pages that render before the profile loads call `showsPersonalPlan()` (`js/role.js`); unknown role = client.
- **Never commit a real FIT/GPX/Strava file:** they hold GPS routes (home).

### Services, navigation, access
- **`js/services.js` is the one service list** (`online_coaching`, `running`, `strength`, `soccer_1on1`, `soccer_group`) and `capabilitiesFor(...)` decides what each account gets. A test fails if another file keeps its own list or the rules' lists drift.
- `data-requires="a,b"` = any of, `"a+b"` = all of, `!x` = not, `client` = any non-coach. Used by menus, More, Today, Settings, quick-add, `BOTTOM_TABS` / `SEARCH_DESTINATIONS` in `js/loadHeader.js`. Page access: `PAGE_REQUIRES` in `js/navAccess.js` (a client opening a page their services don't cover goes to Today). Never fail closed: if the profile can't load and the device knows nothing, the whole client app shows (never `coach`). `tests/navAccess.test.mjs` covers every persona.

### Design system
- **Tokens** in `css/style.css` `:root`: forest `--bg #0F2019`, `--surface`, tan `--primary #C9AD84`, cream `--text`, `--forest`, `--sage`, `--stone`; earthy status tokens (`--green` sage, `--orange` clay, `--red` brick, `--amber` ochre, …). **Gold is the one action color.** Text on a tan/earthy fill uses `--on-primary` (dark), never white. Reuse tokens, never hard-code colors; a static test fails on old neon colors.
- **The look is direction A on the original palette (Eddie, 2026-10-14): read the `southbound-design` skill (`.claude/skills/southbound-design/SKILL.md`) before any visual change.** Fonts are self-hosted in `fonts/`: Big Shoulders Display (`--font-display`, headlines, always uppercase), Instrument Sans (`--font-body`), IBM Plex Mono (`--font-mono`), Saira (`--font-brand`, the wordmark); The share images and the fueling PDF use the same fonts (PDF copies in `fonts/pdf/`, `scripts/build-pdf-fonts.py`); Inter stays only as the body fallback. Always `var(--font-*)`, never a font name; nothing loads from Google.
- **Buttons:** `.sb-btn` + `.sb-btn-primary` / `-secondary` / `-tertiary` / `-danger` / `.sb-btn-icon`. Main actions are tan, squared (`--radius-pill` is 6px since direction A; the token name stayed).
- **Page headers:** use the `eos-today-hero` markup shown in `css/style.css` "PAGE HEADER". Page widths: `.container` (wide) or `.clients-page` (narrow). Don't give a page body padding for its gutter (it narrows the shared header).
- **Header squeeze rules use the header's own width** (container queries `sbnav` / `sbmtop`), not the window's.
- **Brand:** source of truth `brand/southbound-logo-source.png`; `scripts/trace-logo.py` makes the SVGs, `scripts/build-icons.mjs` the PNGs, then `node scripts/build-emoji.mjs`. The logo inside page content is the **brand tile** (`.sb-brand-tile`), never a faint watermark behind text. "EddieOS" survives only in data identifiers (`eddieos-…` keys, the backup file's `app` field): don't rename those.
- **Drawn assets are generated:** reaction emojis (`scripts/build-emoji.mjs`, list in `js/emoji.js`) and habit icons (`scripts/build-habit-icons.mjs`, list in `js/habitIconSet.js`). Edit the script and re-run it, never the SVGs. Reactions are for feeling only, never in place of a working icon or words.
- **Icons:** `<span data-icon="name">` (`js/icons.js`); content inserted later needs `import("./icons.js").then(m => m.hydrate())`.

### Copy and feedback
- A dash in visible text is a real one (" — "), never " -- "; the product is "Southbound", never "EddieOS". A static test checks both.
- **Never use the browser's `alert/confirm/prompt`** (a static test fails). Use `js/ui.js`: `toast()`, `sbAlert` / `sbConfirm` / `sbPrompt` / `sbChoose` / `sbScale` (async `<dialog>`s; destructive ones pass `danger: true`), `friendlyError(error, "save that")`, `loadingHtml()` / `emptyHtml(...)`. Inline page scripts use `window.SB`.
- A placeholder that fills in after load is an empty element with class `sb-wait`, never "Loading…".
- Wording decisions to keep: a workout that didn't happen is "Not done" for clients (the coach's Weekly Review still says Missed); training load is never called "safe" or "optimal".

### Email
- `js/emailNotify.js` uses EmailJS on two templates: "Coach alert" (recipient fixed inside EmailJS, never in this repo) and "Client update" (`{{to_email}}`, fixed text). Core flows never depend on email.

### The athlete model, readiness, fueling
- **Before changing the athlete model** (load, response, readiness v2, race capability, weekly decision), read `docs/ATHLETE_MODEL_AUDIT.md`. Load is what you did (external); how hard it landed is the response, never added to load. Readiness v2 scores the body only. COROS's own numbers are shown, never scored.
- Pure logic lives in pure, unit-tested modules (`js/*.js` with a matching `tests/*.test.mjs`); keep it that way when adding logic.
- Details for every feature (Fueling, COROS, Strava import, readiness, plan generation, strength, messages, sharing, How to demos): `docs/APP_REFERENCE.md`.

---

## Gotchas we've already hit (don't repeat them)

- **`data-requires` and `hidden` don't mix on one element.** The nav pass sets `hidden` from the capability, so a section that hides itself for "nothing to show" gets unhidden as an empty box. Use its own class (`rd-none`) or let `js/todayLayout.js`'s `sb-off` handle the capability.
- **`[hidden]` vs CSS `display`:** any class that sets `display` beats `[hidden]`. Every page scope has a blanket override (`.clients-page [hidden]{display:none!important}`); add one in new CSS.
- **Flex rows with wrapping text:** `align-items:flex-start`, or buttons float to the middle. `flex:1` overrides `width:100%`; use `flex:0 0 100%` to force a row.
- **Reload loop:** comparing Firestore data with plain `JSON.stringify` reloads forever (key order). Use `stableStringify` in `js/coachAccess.js`.
- **Guest redirect** only fires when Firebase definitively says "signed out", never on an auth-load error (offline users stay).
- **Overlays** need `z-index` above the navbar (1000) and search overlay (4500). The plan editor uses 5000.
- **Cards with `overflow:hidden` inside a scrolling flex column shrink to slivers.** Give them `flex-shrink:0`.
- **Browser storage is per origin.** The domain move lost local data (cloud sync restores it). Google sign-in only works on domains in Firebase → Authentication → Authorized domains.
- **Honeypot fields must not look like real fields** (autofill filled one labelled "Company" and real questions were dropped). Keep `sbLeaveEmpty` ("Leave this empty", `autocomplete="off"`).
- **`Promise.all` with a long positional list breaks silently.** Use `allNamed({ name: promise })` for more than three or four.
- **Hand-uploaded files can drop rules.** If Eddie uploads a file, diff it against the previous version.
- **Phone tap targets are 44px+** (block at the end of `css/style.css`; inline links get an invisible `::after` hit area). **Phone inputs must be 16px+** or iOS zooms on focus. Phone overrides in `css/style.css` need `!important` (page stylesheets load after it).
- **Cloud sync never carries a deleted key.** A deletable synced item needs a marker (`{ deleted: true, updatedAt }`), and a list that grows on several devices needs one key per item (a prefix).
- **Reading your own not-yet-created doc is permission-denied, not "missing".** It has broken first check-ins, `assignClient` and first wearable shares. Write without a pre-read; treat permission-denied on your own doc ID as "new"; test the real create path.
- **Page CSS resets body padding on phones.** `loadHeader` adds `body.has-bottomnav`, padded with `!important`.
- **Firestore rules stop at 1,000 checks per request.** List items and helper calls are expensive. For big documents join values and match one pattern (`scripts/build-profile-rules.mjs`); inside a joined pattern `$` means the end of the whole string. Add a rules test that saves the fullest possible document.
- **A client's copy of a coach plan holds only two weeks.** Coach-side code that needs the whole plan reads `coachingPlanMasters`; editing from a version and publishing would delete the rest.
- **Firestore can't query a subcollection without a filter the rules can check** (`listVersions` uses `where("coachUid"|"clientUid", "==", uid)`).
- **`sbConfirm`/`sbPrompt` are async.** The enclosing function must be `async`; `node --check` catches a stray `await`.
- **`.sb-wait` placeholders shimmer until they have text.** Give them text or remove the class.
- **Search for gradients before assuming the palette is clean** (an old tan-to-blue gradient survived the rebrand).
- **The global `.card` is Today's link card** (hover lift, "→", a glow layer that swallows taps). Use another class name for page panels.
- **Percentage padding is a share of the parent's width.** Size from the element (`calc(var(--sb-tile) * .17)`).
- **The mobile top bar is a size container (`sbmtop`)**; its logo steps down with the bar's width.
- **`pkill -f <pattern>` (and `pgrep -f`) match your own shell** when the pattern is in the command line. Stop test servers by PID.
- **Cloud sync timestamps a key only when it's pushed.** A pull keeps local keys that differ from the last-synced snapshot and must not mark them synced (`markPulled`); otherwise offline changes are lost.

## Testing

- `npm install` once, then `npm test`: `npm run test:static` (every script parses, links/assets/imports exist, public meta descriptions, manifest current, all unit tests) and `npm run test:rules` (the Firestore emulator against `firestore.rules`). CI (`.github/workflows/ci.yml`) runs both on every push.
- **Start the emulator from the repo folder.** From anywhere else it finds no `firebase.json` and runs with **no rules**, so privacy checks falsely fail.
- Browser tests: Playwright is installed globally (`/opt/node22/lib/node_modules/playwright`, browsers at `/opt/pw-browsers`). Serve the repo (`python3 -m http.server 8934`) and either mock `js/auth.js`, `js/firebase.js`, `js/userProfile.js`, `js/cloudSync.js` via `page.route()`, or swap only `js/firebase.js` for one that connects to the Auth + Firestore emulators and signs in a test user (real modules, real rules). **Create contexts with `serviceWorkers: "block"`** or the worker serves the real modules.
- Mock data must match the real shape (list functions return `{ id, ...data }`).
- Screenshot at desktop (1280px) **and** phone (375–390px) widths, and look at them. Use first-screen crops and measured checks (overflow, tap sizes) rather than reading every full-page image.
- `node --check file.js` for quick syntax checks.

---

## Open items

**Waiting on Eddie**
- [ ] Photos: `eddie-portrait.jpg`, `eddie-about.jpg`, `gallery-2/3.jpg` (filenames in `images/README.md`); a real hero photo of Eddie when he has one (the current ones are Unsplash stock).
- [ ] Real **prices** for `packages.html` (until then "Pricing on request").
- [ ] A short **bio** for `about.html`.
- Firestore rules: published as of 2026-10-11 (Messages). Re-paste the whole file whenever it changes.

**Known gaps (Eddie's call):** Garmin and other watches (needs Garmin's partner program + Blaze); the coach can't set a client's nutrition goals (needs fields + a rules change); old school/course dates remain in git history (scrubbing needs a force-push, only with Eddie's go-ahead); card payments wait on prices + Blaze + Stripe (`docs/STRIPE_SETUP.md`); whether Google's sign-in pop-up works in the iPhone home-screen app is untested.

**Active tracks**
- **Redesign (Southbound Performance):** look = direction A on the original palette (A1 fonts + shapes, A2 Today, A3 My Plan / workout page / coach dashboard, A4 website, A5 share images + PDF all done 2026-10-14). blueprint `docs/SOUTHBOUND_PERFORMANCE_VISUAL_BLUEPRINT.md`, Step 2 evidence and plan `docs/SOUTHBOUND_PERFORMANCE_STEP2_VALIDATION.md`. Eddie's decisions are recorded in its §6 (2026-10-14). Build order in §9: steps 1–7 and 9 (tap targets, small text) done; left: desktop two-column Today, Client Hub package copy.
- **Weekly planning** (`docs/WEEKLY_PLANNING_AUDIT.md`): P1–P4 done; P5 (AI relay) on hold (Eddie uses copy/paste with his own chatbot); P6 needs a few weeks of planned weeks.
- **Athlete model** (`docs/PERFORMANCE_ENGINE_PLAN.md`, `docs/ATHLETE_MODEL_AUDIT.md`): steps 0–7 and audit phases A–D done.
- **Email** (`docs/EMAIL_NOTIFICATIONS_PLAN.md`): move from EmailJS to Cloud Functions + Resend when Eddie's accounts are ready.

---

## Where the details are

| Read this | When |
|---|---|
| `docs/APP_REFERENCE.md` | Changing any feature: the full page map, how each feature is built, the Firestore data model (every collection and its rules), the Client Hub, navigation access. Search it for the feature name and read that section. |
| `docs/BUILD_HISTORY.md` | You need to know when/why something was built, what was tested, or the full roadmap and the history of rules publishes. |
| `docs/PRODUCT_ARCHITECTURE.md` | The original audit, account/role design, roadmap. |
| `docs/CLIENT_MANAGEMENT_PLAN.md`, `docs/PHASE_11_PLAN.md`, `docs/COACHING_PLATFORM_PLAN.md` | Client management, service entitlements, the coach-delivery platform. |
| `docs/ATHLETE_MODEL_AUDIT.md`, `docs/PERFORMANCE_ENGINE_PLAN.md`, `docs/WORKOUT_EXECUTION_PLAN.md` | The athlete model, readiness, structured-workout execution. |
| `docs/WEEKLY_PLANNING_AUDIT.md` | Weekly planning P1–P6. |
| `docs/SOUTHBOUND_PERFORMANCE_VISUAL_BLUEPRINT.md`, `docs/SOUTHBOUND_PERFORMANCE_STEP2_VALIDATION.md` | The app redesign. |
| `docs/APP_POLISH_PLAN.md`, `docs/EMAIL_NOTIFICATIONS_PLAN.md`, `docs/STRIPE_SETUP.md`, `docs/STRIPE_TEST_SETUP.md` | Polish, email move, payments. |
| `plugins/auto-model/` + `.claude-plugin/marketplace.json` | A Claude Code plugin (not part of the website): `/plugin install auto-model --marketplace eddiesteers777/eddie-dashboard`. |
