# Southbound Performance — Mobile-First App Visual Blueprint

**Status:** Stage 1 — audit and design direction only  
**Scope:** Signed-in coaching app first  
**Repository baseline:** `main`, inspected 2026-10-14  
**Implementation status:** No application UI or behavior changed in this stage.

## 1. Purpose and product principle

Southbound should feel like a premium coaching product designed around an athlete's training life—not a desktop admin dashboard compressed onto a phone. The visual language is **coaching-led, performance-precise**: human and calm in its hierarchy, exact and useful in its data.

This document is the decision baseline for implementation. Stage 2 should not begin by adding more CSS polish to individual cards. It should apply a coherent app shell and responsive rules across existing screens, then redesign the highest-frequency athlete flows.

## 2. Evidence-based repository audit

Files inspected on `main`:
- `index.html`, `components/header.html`, `js/loadHeader.js`, `js/todayLayout.js`
- `css/style.css`, `css/dashboard.css`, `css/week.css`, `css/readiness.css`, `css/public.css`
- `manifest.json`, `docs/PRODUCT_ARCHITECTURE.md`, `CLAUDE.md`

### What exists and should be reused
- Canonical design tokens already live in `css/style.css`: forest canvas (`#0F2019)), surface (`#17291F)), lighter surface (`#203528)), cream text (`#F2EEE4)), sand primary (`#C9AD84)), sage (`#8FA388)), stone (`#E3DDD0`).
- Locally hosted Inter, Bebas Neue, Saira, and JetBrains Mono fonts already provide a useful typographic system and avoid runtime font requests.
- The shared header is generated from `components/header.html` and loaded through the existing header pipeline. It includes Coach, Training, Health, Planning, Progress, and Tools groupings plus search, sync status, account identity, and sign-in/out controls.
- Today is assembled from separate sections and scripts: readiness, the weekly decision card, today's workouts, nutrition, and other capability-dependent sections. `js/todayLayout.js` controls client-specific section visibility/order.
- Workout cards already contain workout metadata and actions; the readiness card already has data-driven states and gauges.
- The PWA manifest is configured for standalone display and portrait orientation.
- The repository includes real data/integration behavior (auth, service entitlements, coach/client experiences, Firestore sync, COROS/Strava, training and fueling logic). These are product capabilities, not things to rebuild for a visual refresh.

### Findings and design implications
1. **Navigation is category-rich.** Six desktop groupings are too much to expose as six equal mobile destinations. Keep a small primary dock and place infrequent tools in a purposeful secondary menu.
2. **Today has multiple independently rendered sections.** The visual hierarchy must establish one primary next action; all other modules should support that decision rather than compete with it.
3. **The current design tokens are already close to the approved palette.** The opportunity is not another palette; it is stronger use of contrast, type scale, spacing, surface hierarchy, and purposeful layouts.
4. **Existing page styles are distributed across many stylesheets.** Introduce shared components/tokens carefully; do not use broad overrides that cause regressions on unrelated pages.
5. **Different users have different entitlements.** The navigation and screen layouts must honor existing access filtering. Do not hard-code every tab for every client or assume coach and client have identical destinations.
6. **A service worker caches app assets.** Any changed cached CSS/JS/assets must follow the repository's existing precache/versioning process.
7. **Visual limitation:** this is a source-level audit. A live-device screenshot/browser audit was not performed. The implementation stage must include actual viewport review before calling the design done.

## 3. Visual direction: Southbound Performance

### Brand character
- Premium, grounded, athletic, deliberate.
- Editorial hierarchy rather than generic dashboard tiles.
- Quiet confidence rather than neon gradients or excessive glass effects.
- Training data is prominent when it helps a decision; decorative metrics are not.
- Use the SB mark and current Southbound identity consistently.

### Palette
Keep the existing tokens as the source of truth:
- Canvas: `--bg: #0F2019`
- Primary surface: `--surface: #17291F`
- Raised surface: `--surface-light: #203528`
- Primary text: `--text: #F2EEE4`
- Secondary text: `--text-secondary: #C3C9BD`
- Muted text: `--muted: #8E9A89`
- Sand/action accent: `--primary: #C9AD84`
- Sage: `--sage: #8FA388`
- Stone: `--stone: #E3DDD0`
- Positive/negative feedback: existing `--good` and `--bad` tokens.

Rules:
- Sand is for primary actions, selected navigation, and high-value emphasis—not every border or icon.
- Sage communicates appropriate positive/ready states, not generic decoration.
- Use red/terracotta sparingly for genuine caution or negative states.
- Build depth with a small number of surface levels; don't give every component a different background.
- Preserve readable contrast and never communicate status by color alone.

### Typography
- Inter: body, controls, labels, forms, and explanatory copy.
- Bebas Neue: short display moments, large numbers, and compact performance headlines; avoid long passages in it.
- Saira: use sparingly for brand-forward moments if it adds clear value.
- JetBrains Mono: small technical values, splits, pace, and structured numbers only where tabular precision helps.
- Define a responsive type scale with clamp-based display sizes, readable body copy, and consistent line heights. Avoid turning every heading into all-caps display type.

### Shape, spacing, and surfaces
- Use a consistent spacing scale based on 4/8-point increments.
- Main cards: moderate rounding; small controls and chips: smaller rounding; primary dock: pill/capsule.
- Use thin borders and subtle tonal shifts more often than heavy shadows.
- Allow selected hero/feature sections to break the card grid, with intentional asymmetry.
- Use dividers and whitespace to organize information before adding containers.
- Motion should be short, purposeful, and respect `prefers-reduced-motion`.

## 4. Mobile information architecture

### Primary bottom dock
Default mobile model: **Today · My Week · Progress · More**.
- Dock floats above the device safe area, remains compact, and does not cover scroll content or bottom actions.
- Each item has an icon and short label; selected state uses a restrained sand cue.
- Respect service entitlements: unavailable destinations are omitted, not merely dimmed.
- Keep the dock stable across screens; active state and accessible names must be clear.
- More opens a full-height or large bottom sheet/menu designed for touch, grouped by task rather than mirroring the desktop dropdowns verbatim.

### More menu grouping
Only show items the user can access. Proposed groups:
- **Train:** Running, Strength, Cross-training, Habits
- **Plan:** My Plan / Planner, Programs, weekly planning where authorized
- **Fuel & recover:** Nutrition, Fueling, Readiness details
- **Connect & manage:** Coach, clients, messages, check-ins, sessions/schedule
- **Tools & settings:** analytics/progress details, pace calculator, gear, settings, install/help

These are group labels, not a mandate to add routes. Reuse current destinations and entitlements.

### Mobile shell
- Compact top bar: SB mark/wordmark, page/context title when useful, one contextual action or account control.
- Avoid a tall desktop masthead and redundant page title bars.
- Use safe-area insets at top and bottom; test standalone PWA and Safari browser modes.
- Main content uses a narrow, readable measure with consistent side padding; full-bleed content only when it serves the composition.
- No horizontal page scrolling at common phone widths.

## 5. Screen blueprints

### A. Today — daily decision surface
**Purpose:** Answer “What matters today, and what should I do next?”
1. Compact top bar and brief personalized greeting/context.
2. One primary training/workout/session module: activity, key prescription, time/distance, and clear action.
3. Readiness/recovery summary when data is available; secondary to the plan unless an actionable caution exists.
4. Weekly decision/coach context presented as concise, expandable insight.
5. Supporting modules (nutrition, habits, recent result) in a lower visual tier.
6. Empty/loading/offline states must feel designed, not like broken blank cards.

Do not put every module into equal-weight cards. The primary action should be apparent without scanning the whole page.

### B. My Week / Plan — training overview
**Purpose:** Understand the week's load and choose a day/workout quickly.
- Compact weekly summary: planned volume or sessions, completed count, and a clear progress signal when data supports it.
- Day-by-day vertical sequence optimized for one-hand scrolling.
- Each day shows the minimum useful information: activity, duration/distance, workout type, and status.
- Selected/current day receives emphasis; rest/recovery days have their own quiet visual treatment.
- Tap opens workout detail; avoid stuffing the full workout prescription into every list row.
- Preserve existing plan editing, apply/undo, and coach-authored plan behaviors.

### C. Workout detail — execution view
**Purpose:** Make the session easy to understand during preparation and execution.
- Strong title plus concise prescription summary.
- Large key metric (distance, duration, reps, or pace) appropriate to workout type.
- Structured blocks for warm-up, work intervals/sets, recovery, and cool-down.
- Each block is visually distinct but compact; units and interval counts remain explicit.
- Primary action is thumb-reachable; secondary edit/log actions are visually subordinate.
- Mobile tables become stacked rows only where the data semantics remain clear. Do not change workout calculations or source data.

### D. Progress — insight before metric volume
**Purpose:** Show what is changing and what it means.
- Lead with one meaningful trend, not a wall of stat cards.
- Weekly mileage/volume and consistency are prominent; completed workouts and self-reported effort support interpretation.
- Charts use legible labels, restrained gridlines, and accessible summaries.
- Put detailed metric sets below the main trend or behind a secondary detail view.
- Distinguish planned vs. completed data clearly; never imply a planned value is an actual result.

### E. Strength
**Purpose:** Select, understand, and record a session with minimal friction.
- Workout overview, then a clear sequence of exercises/sets.
- Exercise name and prescription lead; demos/media support rather than dominate.
- Rest, set completion, and edit controls have clear touch targets.
- Exercise picker remains a purposeful mobile sheet with obvious Add/Added states; don't compress desktop picker rows.
- Preserve exercise library, custom exercises, logging, and coach/client sharing.

### F. Nutrition and fueling
**Purpose:** Connect daily nutrition and workout fueling to the athlete's plan without clutter.
- Nutrition: daily target/progress and meal/logging actions first; detailed nutrients secondary.
- Fueling: pre/during/post separated into clear phases; quantities, timing, and units are easy to scan.
- Workout-specific fueling remains connected to the relevant session.
- Avoid dense desktop tables on phone; use labeled rows or compact cards.
- Preserve existing calculations and saved values.

### G. Readiness / check-in
**Purpose:** Make recovery signals understandable and easy to report.
- One overall status and a concise explanation first.
- Individual sleep/HRV/resting-HR signals are supporting context, not competing hero cards.
- Morning check-in controls are comfortable to tap, with clear completion feedback.
- Handle missing wearable data gracefully; do not manufacture scores or show empty gauges as if they were valid.

### H. Coach and client surfaces
**Purpose:** Support coaching decisions and communication, distinct from athlete self-training.
- Coach home prioritizes today's work, client needs, pending check-ins, and actionable alerts.
- Client hub prioritizes coach updates, current plan, upcoming session, check-in, and package information according to entitlements.
- Client lists and schedules use compact, readable rows on phone with clear status and actions.
- Message threads use familiar conversation hierarchy and composer placement.
- Keep coach-only tools grouped in More/Coach navigation; do not overload the athlete dock.

### I. Forms, settings, and tools
- One clear page title, concise helper text, logical grouped fields.
- Inputs and buttons meet touch-target expectations (aim for 44px minimum).
- Long settings and advanced calculators can remain information-dense but must wrap and stack intentionally.
- Preserve keyboard navigation, focus states, labels, validation, and current behavior.

## 6. Desktop adaptation

Desktop is not just the phone layout stretched wider.
- Keep the same tokens, typography, card language, and information hierarchy.
- Expand into a constrained content grid (not full-width endless columns).
- Use the capsule top navigation with primary categories and contextual account/sync actions.
- Dashboard may use two-column composition: primary training/weekly content plus supporting readiness/coach context.
- Progress charts can sit beside explanatory insights where width permits.
- More complex coach/client management may use tables on wide screens, switching to structured rows/cards on phone.
- Avoid making all text lines too long; use maximum content widths and deliberate column proportions.
- Breakpoints should follow layout pressure rather than device labels alone.

## 7. Reusable component rules

Define shared variants rather than one-off selectors:
- **App top bar:** compact, safe-area aware, one clear contextual action.
- **Bottom dock:** persistent, inset, safe-area aware, active state, entitlement-aware destinations.
- **Page heading:** eyebrow/context, title, optional one-line description/action.
- **Primary action:** sand fill, dark text, consistent height, clear disabled/loading states.
- **Quiet action:** outlined or tonal button for secondary actions.
- **Surface:** low-emphasis container for related content; not every section needs one.
- **Metric block:** value, unit, label, optional trend; use tabular numerals where appropriate.
- **Status chip:** label plus icon/text, not color alone.
- **Workout row/card:** consistent activity label, key prescription, status, tap behavior.
- **Disclosure:** accessible button, accurate aria-expanded/controls, preserves inner action usability.
- **Empty/loading/error state:** concise explanation plus next useful action where possible.
- **Bottom sheet/dialog:** keyboard, focus, dismissal, safe-area, scroll, and screen-reader behavior defined.

Use semantic HTML and existing shared UI helpers where practical. Avoid introducing a framework or new dependencies for a visual redesign.

## 8. Accessibility and responsive requirements

- Design and verify at 320, 375, 390, 430, 768, 1024, and 1440 CSS pixels.
- No horizontal overflow at phone widths.
- Touch targets aim for at least 44×44 CSS pixels; maintain sufficient spacing between adjacent actions.
- Text contrast should meet WCAG AA where applicable; status must not rely on color alone.
- Visible focus styles and full keyboard operation on desktop.
- Respect dynamic text sizing, zoom, reduced motion, and device safe areas.
- Charts need text summaries/labels; controls need accessible names and state.
- Test long client names, long workout titles, missing data, empty states, errors, and large numbers.

## 9. Implementation sequence after blueprint approval

1. **Stage 2 — app shell:** shared tokens and component primitives, compact mobile top bar, bottom dock/More surface, safe-area/content-width rules, and desktop capsule adaptation. Keep the change visual/structural only.
2. **Stage 3 — core athlete flows:** Today, My Week, workout detail, Progress.
3. **Stage 4 — supporting flows:** Strength, Nutrition, Fueling, Readiness, coach/client, forms, tools.
4. At every stage: feature branch, targeted tests, full CI, inspect actual phone and desktop rendering, update service-worker fingerprints if needed, open PR. Do not merge to main until Eddie explicitly says “push”/approves the merge.

## 10. Explicit non-goals and regression guardrails

This redesign must not:
- Change authentication, authorization, service entitlements, or Firestore rules.
- Change storage schemas, sync behavior, or data migration.
- Change training, readiness, analytics, nutrition, or fueling calculations.
- Change COROS/Strava behavior or tokens.
- Remove routes or change navigation destinations without a separately approved IA decision.
- Replace working components wholesale just for aesthetics.
- Add decorative charts or metrics that do not reflect real data.
- Merge or deploy the implementation before approval.

## 11. Acceptance checklist

Stage 1 is complete when this blueprint defines the product's visual direction, phone navigation, screen hierarchy, shared components, desktop adaptation, accessibility expectations, implementation sequence, and behavior guardrails.

Implementation is not accepted until:
- [ ] Eddie reviews the design direction and screen hierarchy.
- [ ] Actual phone screenshots are inspected, including standalone PWA.
- [ ] Primary navigation works with each service entitlement.
- [ ] No horizontal overflow or dock/content overlap at target widths.
- [ ] Existing data and actions behave identically before and after.
- [ ] Tests and CI pass, and service-worker cache metadata is correct.
- [ ] Desktop remains coherent rather than merely inheriting mobile constraints.
