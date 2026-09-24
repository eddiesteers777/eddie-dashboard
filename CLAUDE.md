# Southbound Coaching — Project Guide & Handoff

Southbound Coaching (formerly "EddieOS") is Eddie Steers' coaching business platform: a public marketing site for guests, plus an installable app (PWA) where clients train and Eddie coaches them. It covers online coaching, running and strength programming, and 1-on-1 or group soccer training.

- **Live site:** https://eddiesteers777.github.io/eddie-dashboard/ (GitHub Pages, deploys automatically from `main`)
- **Repo:** `eddiesteers777/eddie-dashboard`
- **Deeper background:** `docs/PRODUCT_ARCHITECTURE.md` (the original audit, account/role design, and roadmap)

---

## Directions for a new chat (read first)

1. **Read this file, then `docs/PRODUCT_ARCHITECTURE.md`,** before changing anything. Inspect the real code instead of trusting summaries. Both docs describe intent, and the code is the truth.
2. **Workflow Eddie expects:**
   - Build on a feature branch, test it, commit, and push the branch.
   - Wait for Eddie to say **"push it"** (or "push"). Only then merge to `main` (`git checkout main && git pull origin main && git merge --no-edit <branch> && git push origin main`) and switch back to the branch.
   - Eddie paces big work with short messages like "step 8". Do one roadmap step fully (build → test → report), then stop.
3. **Eddie isn't a developer.** Any step he has to do himself (Firebase Console, GitHub uploads) needs plain, click-by-click directions. Screenshots from him are common, so read them carefully.
4. **Challenge ideas when there's a better way.** Eddie explicitly asked for pushback, not agreement.
5. **Firestore rules are NOT auto-deployed.** Whenever `firestore.rules` changes, tell Eddie to paste the **whole file** into Firebase Console → Firestore Database → **Rules** → Publish. A new collection without its rules fails with permission-denied.
6. **Never put Eddie's email or other personal info in the code.** He chose to keep it out of the public repo.

---

## The three experiences

| Who | What they see | How it's decided |
|---|---|---|
| **Guest** (signed out) | Public site only: Home, About, Packages, Get the App, Apply | `js/loadHeader.js` sends signed-out visitors on any app page to `home.html` |
| **Client** (approved, `status: "active"`) | The app, filtered to the services Eddie granted them | `services[]` on their profile, read by `js/navAccess.js` |
| **Coach / admin** (`isCoachApproved: true`) | Everything, plus the Coach section | Eddie's own account. Approved coaches can approve anyone. |

A new sign-in starts as a **pending client** with no services, so it sees almost nothing until approved. That's by design.

---

## Page map

**Public site** (uses `components/publicHeader.html` + `js/loadPublicHeader.js` + `css/public.css`)

| Page | Purpose |
|---|---|
| `home.html` | Guest "dashboard": hero photo, the four offerings as photo cards, meet-your-coach, what the app gives clients, how it works |
| `about.html` | Photo + bio (bio text is still placeholder) + 3-photo gallery |
| `packages.html` | Online Coaching / 1-on-1 Soccer / Group Soccer packages (prices are still `$—`) |
| `coaching.html`, `soccer.html` | Offering detail pages (linked from Home cards and footers, not the top nav) |
| `apply.html` | Intake form (requires Google sign-in). Writes the request onto the applicant's pending profile. |
| `install.html` | "Get the App" install instructions (own standalone header) |

Photos live in `images/`. `images/README.md` lists the exact filenames. A missing photo shows a styled placeholder (the `<img onerror="this.remove()">` + `.pub-photo-fallback` pattern).

**App: client pages** (use `components/header.html` + `js/loadHeader.js`)

| Area | Pages |
|---|---|
| Today | `index.html` (dashboard) |
| Train | `running.html`, `strength.html`, `cross-training.html` |
| Health | `nutrition.html`, `fueling.html` |
| Habits | `habits.html` |
| More | `marathon.html`, `75day.html`, `planner.html`, `programs.html`, `analytics.html`, `weekly-review.html`, `gear.html`, `pace-calculator.html`, `settings.html`, `more.html` |
| Client coaching | `schedule.html` (book sessions), `checkin.html` (weekly check-in), both reached via Tools / More |

**App: coach pages** (the **Coach** bottom tab on mobile / **Coach** dropdown on desktop)

| Page | Purpose |
|---|---|
| `coach.html` | Dashboard: pending accounts, booking requests, check-ins to review, active clients |
| `clients.html` | Tabs: *Coach a Client* (plan editor), *Share My Plans* (invite codes), *Pending* (approve/deny signups, make coach) |
| `checkin.html` | *Review Check-ins* tab (coaches land here by default) |
| `schedule.html` | Availability, blackout dates, approve/deny booking requests |

Deep links: `?tab=pending`, `?tab=availability`, `?tab=review`, `?tab=coach`, read by each page's `selectTab()`.

`site-check.html` is a diagnostics page and is exempt from the guest redirect.

---

## How it's built

- **Static site, no build step.** Plain HTML/CSS/ES-module JS, hosted on GitHub Pages. PWA via `manifest.json` + `sw.js` (network-first for same-origin files).
- **Firebase** (project `eddie-s-dashboard`): Google sign-in only (`js/auth.js`), Firestore for data (`js/firebase.js`). SDK loads from `gstatic.com`.
- **Brand:** Southbound Coaching. The SB mark is traced from Eddie's own logo image (speed-streak S, open B, thin tan slash) and should keep matching it. Logo files in `brand/`: `sb-mark.svg` (cream letters, for dark backgrounds, used in every header and the page watermarks), `sb-mark-forest.svg` (dark letters, for light backgrounds), `southbound-logo.svg` / `southbound-logo-forest.svg` (full lockup with "COACHING"). App icons in `icons/` are the dark mark on cream, exactly like his image (`icon-512/192`, `icon-maskable-512`, `apple-touch-icon`, `favicon-32`). Taglines: "Faster | Stronger | Smarter" (home hero) and "Train | Develop | Compete | Grow". The old name "EddieOS" survives only in data identifiers: `eddieos-...` localStorage/cache keys, the backup file's `app` field, and the COROS OAuth client name. Don't rename those.
- **Design system:** CSS custom properties in `css/style.css`: deep forest `--bg #0F2019`, `--surface #17291F`, tan `--primary #C9AD84`, cream `--text`/`--cream`, plus `--forest`, `--sage`, `--stone`. Text on a tan fill uses `--on-primary` (dark green), never white. Fonts: Inter (body) / Bebas Neue (display headings) / Saira 800 (`--font-brand`, the wordmark) / JetBrains Mono. Category colors (run/strength/etc.) are separate on purpose. Reuse the tokens and don't hard-code new colors.
- **Icons:** `js/icons.js`. Write `<span data-icon="name">` in HTML. Content inserted later needs `import("./icons.js").then(m => m.hydrate())`.
- **Email:** `js/emailNotify.js` uses EmailJS (client-side). The free plan allows only **2 templates**, so everything runs on two: "Coach alert" (recipient fixed to Eddie's address inside EmailJS, never in this repo) for booking requests, applications and check-ins, and "Client update" (`{{to_email}}`) for booking replies and check-in feedback. Both use `{{subject}}`, `{{headline}}`, `{{details}}`, `{{link}}` (+ `{{to_name}}` for clients). Until the IDs are filled in, emails are skipped quietly; core flows never depend on email. Keep EmailJS's allowed-domains list set to `eddiesteers777.github.io` so the public key can't be used elsewhere.
- **Integrations:** COROS (`js/coros*.js`). Strava (`js/strava*.js` + the Cloudflare Worker in `cloudflare-worker/`) is **shelved**: since mid-2026 creating a Strava API app requires a paid Strava subscription, which Eddie doesn't have. The code stays; its Analytics panels hide themselves until `js/stravaConfig.js` is filled in.

### Firestore data model

| Collection | What it holds |
|---|---|
| `users/{uid}/sync/localStorage` | Each user's private app data, mirrored from localStorage (`js/cloudSync.js`, last-write-wins per key) |
| `userProfiles/{uid}` | `role`, `isCoachApproved`, `status` (`pending`/`active`/`archived`), `services[]`, application fields. Readable only by the owner and approved coaches. Users may only edit their own application fields; role/status/services/isCoachApproved are coach-only. |
| `inviteCodes/{code}` | One-time codes a client gives a coach. Never listable; expire after 7 days. |
| `coachLinks/{coachUid}_{clientUid}` | Proof a client linked a coach. It gates everything below. Only an approved coach can create one, in the same batch that deletes (burns) a valid code from that client (`redeemInviteCode` in `js/coachAccess.js`). |
| `sharedPlans/{clientUid}` | Mirror of the client's training/race plans + coach notes |
| `coachAvailability/{coachUid}` | Weekly slots + blackout dates |
| `bookingRequests/{id}` | Session requests (single or recurring). Only the coach can approve/deny; the client can only cancel; booking details never change after creation. |
| `checkins/{clientUid}_{weekOf}` | One weekly check-in per client (rating + notes, then coach feedback) |

Services vocabulary (`js/userProfile.js`): `online_coaching`, `running`, `strength`, `soccer_1on1`, `soccer_group`.

### Navigation access

`js/navAccess.js` turns the profile into `{ isCoach, hasTrainingAccess, hasSoccerAccess, status }`. HTML elements carry `data-requires="..."` with any of `training`, `soccer`, `coach`, `client` (meaning a non-coach with training or soccer access). Multiple values are OR'd. Mobile bottom tabs are defined in `BOTTOM_TABS` in `js/loadHeader.js`: Today, Train, Health, Habits, Coach (coach only), More. **Nav access fails open:** if the profile can't load, the full nav shows rather than an empty one.

---

## Gotchas we've already hit (don't repeat them)

- **`[hidden]` vs CSS `display`:** any class that sets `display` beats the browser's native `[hidden]`. Every page/component scope has a blanket override (`.clients-page [hidden]{display:none!important}` etc.). Add one when writing new CSS.
- **Flex rows with wrapping text:** use `align-items:flex-start`, or action buttons float to the middle of tall rows.
- **Flex wrapping:** `flex:1` (basis 0) overrides `width:100%`. Use `flex:0 0 100%` to force an item onto its own row.
- **Reload loop:** comparing Firestore data with plain `JSON.stringify` caused an infinite reload (key order changes). Use `stableStringify` in `js/coachAccess.js`.
- **Guest redirect** only fires when Firebase definitively says "signed out". It never fires on an auth-load error, so offline users aren't kicked out.
- **Overlays** need `z-index` above the navbar (1000) and search overlay (4500). The plan editor uses 5000.
- **Cards with `overflow:hidden` inside a scrolling flex column shrink to slivers** (their flex min-height becomes 0). Give them `flex-shrink:0` -- this was the live-workout "things overlap" bug.
- **Any rules change needs a test.** Add the attack and the legitimate flow to `tests/rules.test.mjs`.

## Testing

- `npm install` once, then `npm test` runs everything: `npm run test:static` (every script parses, every local link/asset/import exists, public pages have meta descriptions and no placeholder text, `site-manifest.json` is current) and `npm run test:rules` (the Firestore emulator against `firestore.rules`). GitHub Actions (`.github/workflows/ci.yml`) runs both on every push.
- After adding or removing a page, script or stylesheet, run `npm run manifest` (it feeds `site-check.html` and the static tests).
- The sandbox can't reach `gstatic.com`, so the real Firebase SDK won't load. Test with Playwright (installed globally at `/opt/node22/lib/node_modules/playwright`, browsers at `/opt/pw-browsers`) by serving the repo with `python3 -m http.server 8934` and mocking `js/auth.js`, `js/firebase.js`, `js/userProfile.js`, `js/cloudSync.js`, etc. via `page.route()`.
- **Create contexts with `serviceWorkers: "block"`,** or the service worker serves the real modules and bypasses your mocks.
- Screenshot at desktop (1280px) **and** phone (375–390px) widths, and look at them.
- Mock data must match the real shape (e.g. list functions return `{ id, ...data }`).
- `node --check file.js` for quick syntax checks.

---

## Current status (as of 2026-09-24)

Roadmap steps 1–7 are done and live on `main`: audit, account/profile model, coach approval, public site, service-driven nav, coach dashboard, weekly check-ins. After that came the unified Coach nav section and the guest-view redesign (photo-led Home, About, Packages, Get the App in the top nav). Then a security review's fixes (rules + atomic invite-code redemption), the live-workout layout fixes on phones, automated tests + CI, and launch polish (meta descriptions, interim bio/pricing copy, setup checklist on the Coach Dashboard). Then the Southbound Coaching rebrand (SB mark traced from Eddie's logo, forest/tan palette, new app icons) and the two-template EmailJS setup.

**Waiting on Eddie:**
- [ ] **Approve his own account** in Firebase Console → Firestore → `userProfiles` → his doc: `isCoachApproved: true`, `role: "coach"`, `status: "active"`. (In progress at the time of writing. The More page shows "Coach account" once it's done.)
- [ ] **Paste the current `firestore.rules` into Firebase Console and Publish.** The security fixes (forged coach links, profile privacy, invite codes, bookings) only protect the live app once this is done.
- [ ] Upload photos to `images/` (filenames in `images/README.md`).
- [ ] Send real **prices** for `packages.html` (monthly coaching, per soccer session, 5-pack, 10-pack, group drop-in, group monthly). Until then each package says "Pricing on request".
- [ ] Send a short **bio** for `about.html` (background, experience, certifications). It currently has honest interim copy with no specific claims.
- [ ] Set up EmailJS (IDs in `js/emailNotify.js`). The Coach Dashboard's "Still to set up" card lists whatever is still off.

## What's next (roadmap)

8. **Training ↔ fueling connection.** Read `js/fueling.js` and `js/nutrition.js` data shapes first, then design per-day fueling targets (pre/during/post) from each training day's type and duration.
9. **Booking refinements:** location, session length, a public request path.
10. **Business tools:** payments, packages checkout.

The brand is Southbound Coaching (decided 2026-09-24 from Eddie's brand board: SB speed monogram, forest green / sage / tan / stone / cream).
