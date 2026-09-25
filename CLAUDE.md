# Southbound Coaching — Project Guide & Handoff

Southbound Coaching (formerly "EddieOS") is Eddie Steers' coaching business platform: a public marketing site for guests, plus an installable app (PWA) where clients train and Eddie coaches them. It covers online coaching, running and strength programming, and 1-on-1 or group soccer training.

- **Live site:** https://southboundcoaching.com (GitHub Pages custom domain via the `CNAME` file; deploys automatically from `main`). The old https://eddiesteers777.github.io/eddie-dashboard/ address redirects there. Absolute URLs (share tags, the COROS `oauth/client-metadata.json` client ID) use the domain; everything else uses relative paths, so keep it that way.
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
| **Guest** (signed out) | Public site only: Home, About, Packages, Contact, Get the App, Apply | `js/loadHeader.js` sends signed-out visitors on any app page to `home.html` |
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
| `contact.html` | "Ask a question" form, **no sign-in**: name, email and/or phone, topic, who's training (+ athlete age), message. Saves to `inquiries` and emails a coach alert. `?about=soccer_group` etc. preselects the topic. Every page's CTA band has an "Ask a Question" button next to Apply. |
| `install.html` | "Get the App" install instructions (own standalone header) |
| `privacy.html` | Plain-language privacy page (what's collected, Firebase/EmailJS, who sees it, deletion via Contact). Linked from every public footer, the apply sign-in and the contact form. Keep it true when data handling changes. |

Photos live in `images/`. `images/README.md` lists the exact filenames. A missing photo shows a styled placeholder (the `<img onerror="this.remove()">` + `.pub-photo-fallback` pattern).

**App: client pages** (use `components/header.html` + `js/loadHeader.js`)

| Area | Pages |
|---|---|
| Today | `index.html` (dashboard) |
| Train | `running.html`, `strength.html`, `cross-training.html` |
| Health | `nutrition.html`, `fueling.html` |
| Habits | `habits.html` |
| More | `programs.html`, `pace-calculator.html`, `settings.html`, `more.html` |
| Coach-only personal tools | `marathon.html`, `75day.html`, `planner.html`, `analytics.html`, `weekly-review.html`, `gear.html` (Eddie's own; `data-requires="coach"` in nav, More, search and the Today cards. Still reachable by direct URL.) |
| Client coaching | `schedule.html` (book sessions), `checkin.html` (weekly check-in), both reached via Tools / More |

**App: coach pages** (the **Coach** bottom tab on mobile / **Coach** dropdown on desktop)

| Page | Purpose |
|---|---|
| `coach.html` | Dashboard: new website questions (with Email/Text/Call and Mark answered), pending accounts, booking requests, check-ins to review, active clients. `coach.html#inquiries` jumps to the questions. |
| `clients.html` | Tabs: *Coach a Client* (plan editor), *Share My Plans* (invite codes), *Pending* (approve/deny signups, make coach) |
| `checkin.html` | *Review Check-ins* tab (coaches land here by default) |
| `schedule.html` | Availability, blackout dates, approve/deny booking requests |

Deep links: `?tab=pending`, `?tab=availability`, `?tab=review`, `?tab=coach`, read by each page's `selectTab()`.

`site-check.html` is a diagnostics page and is exempt from the guest redirect.

---

## How it's built

- **Static site, no build step.** Plain HTML/CSS/ES-module JS, hosted on GitHub Pages. PWA via `manifest.json` + `sw.js` (network-first for same-origin files).
- **Firebase** (project `eddie-s-dashboard`): Google sign-in only (`js/auth.js`), Firestore for data (`js/firebase.js`). SDK loads from `gstatic.com`.
- **Brand:** Southbound Coaching. The SB mark is traced from Eddie's own logo image (speed-streak S, open B, thin tan slash) and should keep matching it. Logo files in `brand/`: `sb-mark.svg` (cream letters, for dark backgrounds, used in every header and the page watermarks), `sb-mark-forest.svg` (dark letters, for light backgrounds), `southbound-logo.svg` / `southbound-logo-forest.svg` (full lockup with "COACHING"). App icons in `icons/` are the dark mark on cream, exactly like his image (`icon-512/192`, `icon-maskable-512`, `apple-touch-icon`, `favicon-32`). Taglines: "Faster | Stronger | Smarter" (home hero) and "Train | Develop | Compete | Grow". The old name "EddieOS" survives only in data identifiers: `eddieos-...` localStorage/cache keys, and the backup file's `app` field. Don't rename those.
- **Design system:** CSS custom properties in `css/style.css`: deep forest `--bg #0F2019`, `--surface #17291F`, tan `--primary #C9AD84`, cream `--text`/`--cream`, plus `--forest`, `--sage`, `--stone`. Text on a tan fill uses `--on-primary` (dark green), never white. Fonts: Inter (body) / Bebas Neue (display headings) / Saira 800 (`--font-brand`, the wordmark) / JetBrains Mono. Category colors (run/strength/etc.) are separate on purpose. Reuse the tokens and don't hard-code new colors.
- **Icons:** `js/icons.js`. Write `<span data-icon="name">` in HTML. Content inserted later needs `import("./icons.js").then(m => m.hydrate())`.
- **Email:** `js/emailNotify.js` uses EmailJS (client-side). The free plan allows only **2 templates**, so everything runs on two: "Coach alert" (recipient fixed to Eddie's address inside EmailJS, never in this repo) for booking requests, applications and check-ins, and "Client update" (`{{to_email}}`) for booking replies and check-in feedback. Both use `{{subject}}`, `{{headline}}`, `{{details}}`, `{{link}}` (+ `{{to_name}}` for clients). Until the IDs are filled in, emails are skipped quietly; core flows never depend on email. EmailJS's allowed-domains lock is a paid feature, so on the free plan the public key could be reused elsewhere. The mitigation: "Coach alert" only ever goes to Eddie, and "Client update" is fixed text ("your coach replied, open the app", fixed subject and link, only `{{to_name}}` varies), so it's useless for spam; "Allow EmailJS API for non-browser applications" stays off. The code still sends subject/headline/details to both templates; the client template just ignores them.
- **Fueling (`fueling.html`):** targets → products (gels from the Fueling Library) → homemade drink → **Race-Day Schedule**. The schedule math is pure and unit-tested in `js/fuelSchedule.js` (`buildSchedule`, `scheduleInputFromPlan`, `diyMix`, the DIY ingredient table); `js/fuelScheduleView.js` renders it; `tests/fuelSchedule.test.mjs` covers it. Rules: gels spaced evenly from "First gel at" (default 30 min) to 15 min before the finish, caffeinated ones last; bottles split the run into equal back-to-back mile ranges with oz-per-mile sip guidance; hour-by-hour check vs targets (a leftover under 20 min folds into the last hour); warnings for gels <15 min apart, drinks >10% carbs, and bottles covering <80% of the fluid target. Saved plans open in a "View Plan" sheet (`#fuelPlanSheet`, printable) and older saved plans still render (schedule is computed from the saved fields, `firstGelMin` defaults to 30).
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
| `inquiries/{id}` | Questions from `contact.html`. **Anyone can create one without signing in**, so the rules validate every field (known keys, sizes, email format, an email or a phone, `status: "new"`, server timestamp). Only approved coaches can read them; the coach can only flip `status` new/handled. A hidden honeypot field in the form drops obvious bots. If spam ever becomes a problem, add Firebase App Check. |

Services vocabulary (`js/userProfile.js`): `online_coaching`, `running`, `strength`, `soccer_1on1`, `soccer_group`.

### Eddie's personal plan vs. clients

`js/marathonData.js` is Eddie's own race block (Indianapolis, 3:05). It must only show for the coach. `js/role.js` remembers the account's role per device (`sb-account-role` in localStorage, written by `js/navAccess.js`, not cloud-synced). Pages that render before the profile loads call `showsPersonalPlan()`; `js/loadHeader.js` reloads the page once (guarded by sessionStorage `sb-role-reloaded`) when the role it just learned differs from what the page rendered with. Unknown role = client. For clients: Today, Running, Strength, Cross-Training, Fueling and Nutrition use the client's own Programs (`getActiveProgramEntriesForDate`) and logged miles instead of the marathon plan, and the marathon picker/overlap checks are off.

### Client Today + coach link

- **"From your coach" card** (`js/coachCard.js`, `#coachCardSection` in `index.html`, clients only): next approved session, requests waiting, notes from the last session (`coachNote`), weekly check-in due/sent, latest feedback. Reads only data the client can already read.
- **Auto-link on approval, no rules change:** an applicant's app leaves a standing invite code `APPLY-{uid}` (`ensureApplyCode()` in `js/coachAccess.js`, refreshed by `loadHeader` while pending and by `apply.js` after submitting; recreated when older than 5 days). The coach's Approve (`js/clients.js`) then calls `linkApplicant(uid)`, which redeems it through the normal code path (`linkWithCode`). If it fails, the alert falls back to the old "ask for an invite code" instructions.
- **Session notes:** the coach can add/edit notes on approved bookings (`setSessionNotes` in `js/scheduling.js`, allowed by the existing rules); the client sees them on Schedule and the Today card.
- **Group capacity:** the coach's request rows show "x/y already booked -- full", and approving into a full slot asks first. Clients can't see spots left (that would need a rules change).
- **Schedule for clients** hides the availability tab and opens on "Book a Session".

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
- **The domain move changed the origin.** Browser storage (localStorage, the installed app, COROS tokens) is per-origin, so it doesn't carry over from the github.io address; signed-in users get their data back from cloud sync on the new domain. Google sign-in only works on domains listed in Firebase Console → Authentication → Settings → Authorized domains.
- **Honeypot fields must not look like real fields.** The contact form's hidden spam trap was once labeled "Company"; browser autofill filled it, so real questions were silently dropped while showing "Question sent". Keep it as `sbLeaveEmpty` ("Leave this empty", `autocomplete="off"` + password-manager ignore attributes).
- **Hand-uploaded files can drop rules.** A 2026-09-17 upload replaced `css/nutrition.css` and silently removed the barcode-scanner modal, food log and confirm styles (restored 2026-09-25). If Eddie uploads a file, diff it against the previous version.
- **Phone inputs must be 16px+** or iOS zooms on focus. `css/style.css` forces 16px on form fields at <=900px (the big fueling-target and record inputs are excluded); small buttons get ~40px touch targets there too.
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

## Current status (as of 2026-09-25)

Roadmap steps 1–7 are done and live on `main`: audit, account/profile model, coach approval, public site, service-driven nav, coach dashboard, weekly check-ins. After that came the unified Coach nav section and the guest-view redesign (photo-led Home, About, Packages, Get the App in the top nav). Then a security review's fixes (rules + atomic invite-code redemption), the live-workout layout fixes on phones, automated tests + CI, and launch polish (meta descriptions, interim bio/pricing copy, setup checklist on the Coach Dashboard). Then the Southbound Coaching rebrand (SB mark traced from Eddie's logo, forest/tan palette, new app icons) and the two-template EmailJS setup.

**2026-09-25 batch (no rules change):** personal plan hidden from clients, client Today "From your coach" card, auto-link on approval, session notes, group capacity checks, client Schedule view, phone polish (no input zoom, bigger tap targets, nutrition +/- row), restored nutrition scanner/food-log CSS, privacy page. Regression harness: an emulator-backed Playwright run (real modules + rules) covering pending → approve → linked → client Today/Running/Fueling/More/Nutrition/Schedule, coach Today/Schedule, guest privacy + redirect.

**Known gaps (not fixed yet):**
- Nutrition goals default to Eddie's numbers (3200 kcal, 180 g protein...) in `js/nutrition.js`; clients can edit them, but a coach-set or sensible default would be better.
- `planner.html` contains Eddie's school calendar in the public repo (now coach-only in nav, but the data is still in the code).
- Personal pages are hidden from nav, not blocked; a client could still open them by URL.

**Waiting on Eddie:**
- [x] Eddie's own account is an approved coach (the Coach Dashboard works for him).
- [x] Firestore rules published (2026-09-24, including `inquiries`). Re-paste the whole file whenever it changes.
- [ ] Upload photos to `images/` (filenames in `images/README.md`).
- [ ] Send real **prices** for `packages.html` (monthly coaching, per soccer session, 5-pack, 10-pack, group drop-in, group monthly). Until then each package says "Pricing on request".
- [ ] Send a short **bio** for `about.html` (background, experience, certifications). It currently has honest interim copy with no specific claims.
- [x] EmailJS is connected (service + "Coach Alert" / "Client Update" templates + public key in `js/emailNotify.js`). Emails come from Eddie's Gmail as "Southbound Coaching".

## What's next (roadmap)

8. **Training ↔ fueling connection.** (The race-day schedule — gels by mile, bottles by mile range — is done; what's left is auto-building a plan for each training day.) Read `js/fueling.js` and `js/nutrition.js` data shapes first, then design per-day fueling targets (pre/during/post) from each training day's type and duration.
9. **Booking refinements:** location, session length. (Done: the public question path `contact.html`, session notes, group capacity checks.)
10. **Business tools:** payments, packages checkout.

The brand is Southbound Coaching (decided 2026-09-24 from Eddie's brand board: SB speed monogram, forest green / sage / tan / stone / cream).
