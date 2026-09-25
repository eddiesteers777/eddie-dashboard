# SOUTHBOUND COACHING — OFFICIAL-GRADE APP POLISH + CUSTOM EMOJI MASTER PROMPT

## ROLE

Act as a senior product designer, frontend engineer, design-systems engineer, QA engineer, and mobile-app UX reviewer.

You are working on the existing Southbound Coaching repository:

GitHub:
https://github.com/eddiesteers777/eddie-dashboard/

Live product:
https://southboundcoaching.com

Southbound is an actual coaching business and PWA, not a concept project.

The goal of this task is to remove every visual, interaction, typography, loading, responsiveness, browser-default, broken-state, and branding issue that could make a prospective paying client think:

> "Is this really an official app?"

Do NOT merely make the site "prettier."

Make it feel like a real, polished commercial coaching product that could sit beside established apps such as Runna, TrainingPeaks, or TrainHeroic.

Use those products as references for polish, hierarchy, consistency, workout cards, mobile execution, calendars, loading/empty/error states, and interaction quality — NOT as templates to copy.

TrainingPeaks currently emphasizes structured workouts, athlete execution, workout cards, planned-vs-completed information, coach instructions, and structured strength execution. Runna emphasizes a real-time training calendar, weekly plan navigation, daily workouts, rescheduling, completed activity tracking, and integrated strength. TrainHeroic emphasizes mobile programming, exercise libraries/video instructions, training history, and coach/athlete communication.

---

# 1. START BY INSPECTING THE REAL REPO

Before changing anything:

1. Read `CLAUDE.md`.
2. Read `docs/PRODUCT_ARCHITECTURE.md`.
3. Inspect the current repo tree.
4. Inspect every page that a client or guest can reach.
5. Inspect the shared header and public header.
6. Inspect `css/style.css`.
7. Inspect `css/public.css`.
8. Inspect every page-specific stylesheet that affects public/client experiences.
9. Inspect `js/icons.js`.
10. Inspect `js/loadHeader.js`.
11. Inspect `js/loadPublicHeader.js`.
12. Inspect the PWA manifest and service worker.
13. Search the repo for:
   - inline styles
   - hard-coded colors
   - hard-coded font families
   - hard-coded font sizes that bypass the system
   - browser-default controls
   - raw Unicode symbols
   - emoji characters used as UI icons
   - `innerHTML`
   - dynamic HTML injection
   - dynamic icon injection
   - elements that are hidden/shown with JavaScript
   - loading states
   - empty states
   - error states
   - modals
   - dropdowns
   - selects
   - tabs
   - cards
   - buttons
   - active/selected states
   - focus states
   - visited links
   - hover states
   - `:active`
   - `:disabled`
   - `:focus-visible`
   - `autofill`
   - `option`
   - responsive breakpoints
   - service-worker caching
   - Google Fonts / external fonts

Do not assume the current documentation is perfect. The code is the source of truth.

---

# 2. IMPORTANT CURRENT ARCHITECTURE FACTS

Preserve these unless there is a compelling architectural reason to change them:

- Southbound Coaching is the public brand.
- Existing old `eddieos-*` localStorage/cache/event identifiers are intentionally preserved for data compatibility.
- Do NOT globally rename those internal identifiers.
- They are allowed to remain internally.
- They must NEVER visibly appear to clients or guests.
- Do not put Eddie's personal email or private information into the public repo.
- Firebase / Firestore security rules are the real security boundary.
- Existing cloud sync must continue working.
- Existing client/coach access relationships must continue working.
- Existing PWA behavior must continue working.

---

# 3. DEFINE THE ACTUAL DESIGN SYSTEM

Create one authoritative Southbound design system and make every page obey it.

Current brand direction:

- Deep forest background
- Forest surfaces
- Tan primary
- Cream text
- Sage support color
- Stone support color

Current tokens include values such as:

`--bg`
`--surface`
`--surface-light`
`--border`
`--text`
`--text-secondary`
`--muted`
`--primary`
`--primary-light`
`--primary-dark`
`--forest`
`--sage`
`--stone`
`--cream`
`--on-primary`

Do not introduce another unrelated palette.

Create a clear hierarchy:

### Brand colors
Used globally.

### Semantic colors
Success / warning / danger / info.

### Sport/category colors
Running / strength / cross-training / fueling etc.

Sport colors should be subtle accents rather than completely different visual worlds.

A client should be able to move from Running → Strength → Fueling and still feel like they are in ONE Southbound app.

---

# 4. FIX THE TYPOGRAPHY SYSTEM

This is a major priority.

The product should never look like:

> Southbound font here → browser default font there → random system font inside a form → another font in a modal.

Normalize ALL native controls:

`button`
`input`
`select`
`textarea`
`optgroup`
`option`

Make them inherit the Southbound typography system.

Create explicit typography tokens:

- display
- page title
- section title
- card title
- body
- body-small
- metadata
- label
- button
- numeric/stat
- mono/data

Normalize:

- font family
- font weight
- line height
- letter spacing
- font size

Test:

- buttons
- dropdowns
- date inputs
- number inputs
- time inputs
- text inputs
- textarea
- forms
- modals
- tabs
- calendars
- dynamically generated cards

No raw browser typography should remain in client-facing UI.

---

# 5. FIX NATIVE CONTROL APPEARANCE

Normalize:

- `<input>`
- `<select>`
- `<textarea>`
- `<button>`
- `<option>`

Use consistent:

- border
- background
- text color
- placeholder color
- radius
- focus treatment
- disabled treatment
- hover treatment
- active treatment
- error treatment

Make sure the closed `<select>` matches the app.

For dark mode, test native controls on:

- Chrome desktop
- Edge desktop
- Safari iPhone
- Safari iPad
- Chrome Android

Use `color-scheme` appropriately.

Do not rely on browser-default control styling.

---

# 6. FIX FOCUS / ACTIVE / HOVER / SELECTED STATES

This is one of the fastest ways for a homemade app to look homemade.

Every interactive component should have a deliberate:

- default
- hover
- active
- selected
- focus-visible
- disabled
- loading
- success
- error

state.

Especially:

- nav links
- dropdowns
- bottom nav
- tabs
- segmented controls
- cards
- buttons
- icon buttons
- selects
- calendar days
- workout cards
- checkboxes
- radio buttons
- modals

Never let:

- browser blue
- purple visited-link color
- default blue focus ring
- default gray disabled text
- default button shading

appear unexpectedly.

---

# 7. AUDIT COLOR CONSISTENCY

Search the entire repo for hard-coded colors.

Do not necessarily remove every hard-coded color.

Instead classify each one:

### Keep
Brand tokens and legitimate semantic/sport colors.

### Replace
Colors that duplicate existing design tokens.

### Redesign
Colors that make a page feel visually detached from Southbound.

### Allow
One-off data visualization colors where they are genuinely meaningful.

Pay special attention to:

- inline `style=""`
- generated `style=""`
- gradients
- background colors inside dynamic HTML
- chart colors
- icon colors
- active states
- badges

The user specifically wants the app to stop feeling like the color scheme changes when they click something.

---

# 8. ELIMINATE "RAW HTML" MOMENTS

Search every use of:

`innerHTML`
`insertAdjacentHTML`
`createElement`
`textContent`

Inspect dynamic content for cases where:

- a style class is missing
- an icon isn't hydrated
- a class name doesn't exist
- a CSS file isn't loaded
- text appears unstyled
- a component loses its typography
- a button turns into a browser-default button
- a dynamic card looks different from static cards

Every dynamically generated component must use the same design-system classes as static components.

---

# 9. ICON HYDRATION AUDIT

The existing `js/icons.js` system is good and should remain the functional icon system.

Audit every dynamically created `[data-icon]`.

Make sure dynamically inserted content calls icon hydration when needed.

Never allow:

```text
[data-icon="whatever"]
```

to remain visible as empty space.

Never allow missing icons to create awkward gaps.

Never rely on emoji characters as the fallback for functional UI icons.

If an icon isn't available:

1. Add it to the Southbound icon set, or
2. Use an existing semantically appropriate icon.

Do not invent random icon styles on individual pages.

---

# 10. REMOVE BROWSER / PLATFORM DEFAULTS

Look specifically for:

- default form controls
- default links
- default focus rings
- default checkboxes
- default radio buttons
- default select arrows
- default alert/confirm UX
- raw browser validation messages where avoidable
- browser text selection oddities
- default scrollbars that clash with the design
- default autocomplete/autofill colors
- default date/time input appearance

The product should feel intentional even when a user interacts with an input incorrectly.

---

# 11. LOADING STATES

Every page that waits for data must have a designed loading state.

Never show:

- blank page
- "Loading..."
 floating by itself
- unstyled placeholder text
- half-rendered UI
- layout jumping after Firebase loads

Create a consistent Southbound loading system:

### Page loading
Skeleton / subtle branded state.

### Section loading
Card skeletons.

### Button loading
Button keeps its dimensions and shows progress.

### Data loading
Do not shift the layout dramatically.

### Sync loading
Use the existing sync indicator, but make it feel polished.

---

# 12. EMPTY STATES

Every empty area needs a designed explanation.

Bad:

> No data.

Better:

> No workouts scheduled yet.
> Your coach will add your next session here.

Include:

- icon
- short explanation
- appropriate next action
- no excessive visual noise

Do this for:

- no clients
- no plans
- no workouts
- no runs
- no strength sessions
- no check-ins
- no bookings
- no messages
- no progress
- no search results
- no fueling plan

---

# 13. ERROR STATES

Never let users see:

- raw JavaScript errors
- undefined
- null
- `[object Object]`
- Firestore error wording
- permission-denied as a technical message
- broken buttons after a failed request

Create polished messages:

> We couldn't save that workout.
> Check your connection and try again.

And optionally:

`Try Again`

Technical details should go to console/logging, not the client.

---

# 14. SUCCESS STATES

Every meaningful action should make it obvious it worked.

Examples:

**Plan saved**

**Plan published**

**Workout completed**

**Check-in submitted**

**Booking requested**

**Changes synced**

Use a consistent Southbound success treatment.

Do not rely exclusively on tiny status text.

---

# 15. BUTTON AUDIT

Create a small set of canonical button styles:

### Primary
Main action.

### Secondary
Alternative action.

### Tertiary
Low-emphasis action.

### Destructive
Delete/revoke.

### Icon-only
Small utility action.

### Link/button text action
For less important actions.

Every page should use these same components.

Do not allow each page to invent its own:

- border radius
- padding
- font weight
- hover behavior
- tan shade

---

# 16. CARD AUDIT

Create a canonical Southbound card.

Then make sure:

- dashboard cards
- workout cards
- coach cards
- client cards
- package cards
- check-in cards
- booking cards
- progress cards

all feel like members of the same family.

Cards can vary in density and purpose.

They should not vary randomly in:

- radius
- padding
- border
- shadow
- title size
- metadata treatment

---

# 17. PAGE HEADER AUDIT

Every major page should have a consistent page-header system.

Avoid:

> giant title on one page
> tiny title on another
> centered title elsewhere
> random uppercase kicker elsewhere

Create:

- eyebrow
- page title
- subtitle
- optional action

Then reuse it.

Exceptions should be intentional.

---

# 18. MOBILE IS NOT JUST A SHRUNK DESKTOP

Treat the app as a mobile product.

Inspect every major client workflow at:

- 320px
- 375px
- 390px
- 430px
- 768px
- 1024px
- 1280px

Check:

- bottom nav
- top bar
- page title wrapping
- buttons
- forms
- tables
- workout cards
- week calendars
- modals
- dropdowns
- sheets
- input controls
- numeric values
- long workout names
- coach notes

No horizontal scrolling unless intentional.

No clipped text.

No buttons that become unreachable.

No overlays that extend beyond the viewport.

No keyboard/input problems on mobile.

---

# 19. PWA / INSTALLED APP AUDIT

The app must feel like a native installed application.

Audit:

- manifest
- icons
- splash/loading experience
- status bar color
- safe-area insets
- bottom navigation
- standalone mode
- back behavior
- page transitions
- offline behavior
- stale-cache behavior
- install instructions

Important:

The current service worker deliberately avoids intercepting cross-origin requests, which includes Google Fonts.

Test whether an installed/offline app changes fonts when the Google Font cannot be fetched.

If that creates a visual jump:

- use a robust fallback stack, OR
- introduce a locally hosted font strategy where licensing permits.

Do not create an offline experience where the app suddenly looks like a different website.

---

# 20. BRAND LANGUAGE AUDIT

Search visible UI for anything that feels like an unfinished development project.

Examples:

- EddieOS
- developer terminology
- "debug"
- "test"
- "local"
- "sync doc"
- raw collection names
- technical Firebase wording
- "sharedPlans"
- "pending profile" if client-facing
- placeholder setup messages
- unfinished feature wording

Internal code identifiers containing `eddieos` can remain because they are intentionally preserved for compatibility.

Visible UI should be 100% Southbound.

---

# 21. COPY AUDIT

Audit every client-visible label.

Remove:

- awkward phrases
- developer language
- inconsistent capitalization
- inconsistent singular/plural
- mixed terminology
- inconsistent verbs

Choose one vocabulary system.

Example:

Use:

**Workout**

not sometimes:

- Session
- Activity
- Exercise
- Training item

unless those terms truly mean different things.

Use:

**Coach**

not sometimes:

- Trainer
- Admin
- Provider

unless the context requires it.

---

# 22. MICROCOPY AUDIT

Buttons should describe what actually happens.

Bad:

`Save`

Better where needed:

`Save Draft`

`Publish to Client`

`Complete Workout`

`Submit Check-in`

`Request Session`

`Review Changes`

This gives the product a professional UX language.

---

# 23. DATE / TIME / NUMBER FORMATTING

Create one formatting system.

Dates:

`Tue, Sept 29`

Times:

`5:30 PM`

Distance:

`6.0 mi`

Duration:

`42 min`

Do not mix:

- 5:30
- 5:30 PM
- 17:30
- Tuesday 09/29/26
- 9/29/26
- Sep 29th

unless context requires the variation.

Workout data should be easy to scan.

---

# 24. NUMERIC DATA SHOULD LOOK PROFESSIONAL

Fitness apps live and die by numbers.

Create a consistent numeric style for:

- mileage
- pace
- weight
- reps
- RPE
- heart rate
- duration
- calories
- carbs
- fluid
- sodium

Use JetBrains Mono only where it improves scanability, not everywhere.

---

# 25. TAB / SEGMENTED CONTROL AUDIT

The current app has many tabs.

Standardize them.

A tab should have:

- default
- hover
- active
- disabled

No inconsistent underline treatment.

No random pill style on one page and text tabs on another unless that is deliberate.

---

# 26. MODAL / BOTTOM SHEET AUDIT

Standardize:

- overlay
- blur
- radius
- header
- close button
- body
- footer/actions
- animation
- mobile behavior

On mobile, large editors should become a full-height or near-full-height sheet.

Never create a tiny desktop modal inside a 390px screen.

---

# 27. NOTIFICATION SYSTEM

Create a reusable Southbound toast/snackbar system.

Examples:

> Workout completed

> Plan updated

> Changes published

> Check-in submitted

> Saved offline

> Back online — changes synced

This should replace scattered inline messages where appropriate.

---

# 28. CONSISTENT INFORMATION HIERARCHY

Every page should clearly answer:

1. Where am I?
2. What is this?
3. What do I need to do?
4. What happened?
5. What should I do next?

If users have to visually hunt for the next action, redesign the page.

---

# 29. REMOVE VISUAL NOISE

A professional app does not mean "more decoration."

Remove:

- unnecessary giant sections
- duplicate headings
- redundant labels
- excessive borders
- excessive gradients
- inconsistent glow effects
- decorative elements that compete with content
- overly large empty spaces
- tiny text that looks technical

Prioritize content and actions.

---

# 30. MAKE THE APP FEEL COHESIVE BETWEEN PUBLIC WEBSITE AND CLIENT APP

The public website and installed app should clearly be the same brand.

Check:

- logo
- type
- color
- buttons
- icons
- imagery
- tone
- spacing

A user should feel:

> "I went from southboundcoaching.com into the Southbound app."

Not:

> "I left the website and opened somebody else's software."

---

# 31. CUSTOM SOUTHBOUND EMOJIS

Create a completely separate visual language for **personal/emotional reactions**.

Do NOT use the custom emojis as replacements for functional UI icons.

Functional UI should remain SVG/icon-system based.

Custom emojis are for:

- coach messages
- check-in responses
- celebrations
- workout completion reactions
- client encouragement
- milestones

---

# 32. CUSTOM EMOJI DESIGN DIRECTION

Create a cohesive Southbound emoji family.

Style:

- premium modern fitness-app aesthetic
- expressive but not childish
- simple shapes
- thick clean outline
- subtle Southbound brand personality
- forest / cream / tan / sage / stone palette
- occasional controlled semantic accent color
- transparent background
- centered composition
- strong silhouette
- readable at 24–48px
- also attractive at 64–128px
- no photorealism
- no random 3D rendering
- no glossy cartoon look
- no generic Apple/Google emoji imitation
- no copyrighted character resemblance
- no text-heavy designs

They should feel like:

> "Southbound's reaction language."

---

# 33. RECOMMENDED EMOJI SET

Create a first set of 20–24.

Examples:

1. SB mark with subtle motion streak — identity
2. Locked In — focused training
3. Let's Go — energized
4. Great Work — celebration
5. Easy Day — relaxed
6. Recovery — calm/rest
7. Long Run — endurance
8. Strong — strength
9. Fuel Up — fueling
10. Hydrate — hydration
11. Fire / Big Effort — hard workout
12. PR / Milestone — achievement
13. Check — completed
14. Coach's Eye — feedback/review
15. Calendar / Ready — scheduled
16. Race Day — competition
17. Trail / Adventure — outdoor running
18. Soccer Ball / Footwork — soccer
19. Tired but Proud — honest post-workout feeling
20. Survived — difficult workout
21. Locked / Focus — "do the work"
22. Recovery Mode — sleep/recovery
23. High Five — encouragement
24. Southbound SB reaction — signature brand reaction

Do not literally write words on every emoji. Use visual cues.

---

# 34. CUSTOM EMOJI ASSET SYSTEM

Use stable IDs, not Unicode characters.

Example:

`sb_locked_in`
`sb_lets_go`
`sb_great_work`
`sb_recovery`
`sb_fuel`
`sb_hydrate`
`sb_long_run`
`sb_strong`
`sb_pr`
`sb_race_day`

Store:

```text
emojiId
label
asset
category
```

Then the UI can render:

```text
Southbound emoji: sb_locked_in
```

without tying the app to a platform-specific Unicode emoji.

This is important because standard Unicode emoji can render differently on iOS, Android, Windows and macOS.

---

# 35. CUSTOM EMOJI PICKER

Eventually add:

**🙂 Southbound**

Opening it gives categories:

### Training
Locked In
Strong
Long Run
Let's Go

### Recovery
Easy
Recovery
Sleep
Hydrate

### Coach
Great Work
Coach Eye
Check
Adjust

### Milestones
PR
Race Day
Finish
Achievement

Make the picker feel like part of Southbound, not like a third-party emoji widget.

---

# 36. IMAGE GENERATION PROMPT FOR THE CUSTOM EMOJIS

Use this prompt with the image-generation system:

> Create a cohesive set of premium custom reaction emojis for a fictional modern coaching app called Southbound Coaching.
>
> Brand identity: deep forest green, muted sage, warm tan, cream, stone, with extremely limited accent colors. The brand is athletic, outdoors-oriented, disciplined, calm, premium, and masculine without feeling aggressive.
>
> Create a recognizable Southbound visual language: compact shapes, bold silhouettes, clean thick outlines, subtle speed/motion cues, minimal geometric construction, expressive but understated faces where appropriate.
>
> These are ORIGINAL custom app emojis, NOT standard Unicode emoji and NOT an imitation of Apple, Google, Samsung, Microsoft, Slack, Discord, or any existing emoji set.
>
> Visual style:
> - premium modern fitness-app illustration
> - clean vector-like forms
> - flat or very subtle shading
> - crisp edges
> - transparent background
> - centered object
> - strong silhouette
> - consistent stroke weight
> - consistent scale
> - consistent perspective
> - minimal detail so the icons remain readable at 24px
> - sophisticated rather than childish
> - friendly but performance-oriented
> - no photorealism
> - no 3D plastic look
> - no gradients unless extremely subtle
> - no text unless absolutely necessary
> - no letters except a very small occasional SB mark
>
> Create the following reactions:
> 1. Locked In
> 2. Let's Go
> 3. Great Work
> 4. Easy Day
> 5. Recovery
> 6. Long Run
> 7. Strong
> 8. Fuel Up
> 9. Hydrate
> 10. Big Effort
> 11. PR
> 12. Completed
> 13. Coach Eye
> 14. Scheduled
> 15. Race Day
> 16. Trail Adventure
> 17. Soccer
> 18. Tired but Proud
> 19. Survived
> 20. High Five
> 21. Sleep / Recovery Mode
> 22. Signature Southbound reaction
>
> All 22 emojis should clearly look like one family designed by the same illustrator.
>
> Output them as a clean 4x6 presentation sheet with generous spacing, each emoji isolated and visually distinct, on a transparent or neutral background for easy asset extraction.
>
> Prioritize consistency over novelty.

After generating the reference sheet, create each emoji as an individual transparent asset using the same visual rules.

---

# 37. IMPORTANT EMOJI RULE

The emoji system should supplement the UI, not replace clarity.

Bad:

A workout card with 6 emojis and no text.

Good:

**Tempo Run**
6 mi
🔥 Big Effort

The emoji adds personality.

The text still carries meaning.

---

# 38. BUILD A "NO SLOP" QA PASS

Before calling this work complete, inspect every route as a real paying client.

Test:

### Guest
Home
About
Packages
Coaching
Soccer
Contact
Apply
Get the App

### Client
Today
Running
Strength
Cross Training
Nutrition
Fueling
Habits
Schedule
Check-in
More
Settings

### Coach
Dashboard
Clients
Client Hub
Check-ins
Schedule
Programming
Any new coach pages

---

# 39. TEST EVERY STATE

For every significant screen test:

- first load
- loading
- loaded
- no data
- partial data
- long text
- very short text
- error
- offline
- slow connection
- signed out
- pending client
- active client
- coach
- mobile
- desktop
- narrow screen
- wide screen
- dark background
- selected state
- hover state
- focus state
- disabled state

---

# 40. CLICK EVERYTHING

Do a literal click-through audit.

Every:

- button
- link
- tab
- dropdown
- card
- calendar date
- icon
- modal close
- save
- cancel
- delete
- add
- complete
- publish

must do what the UI suggests.

A button that visually looks interactive but does nothing is one of the strongest "unofficial app" signals.

---

# 41. TEST LONG CONTENT

Use deliberately long:

- client names
- workout names
- exercise names
- coach notes
- messages
- race names
- package names

Make sure:

- text wraps
- cards grow
- buttons don't break
- nothing overflows
- nothing overlaps
- mobile remains usable

---

# 42. ACCESSIBILITY / PROFESSIONALISM

Check:

- focus-visible
- keyboard navigation
- label associations
- aria-labels
- button semantics
- modal focus
- color contrast
- touch target sizes
- screen-reader labels

The app should not merely look polished.

It should behave professionally.

---

# 43. PERFORMANCE / POLISH

Audit:

- layout shifts
- fonts
- image loading
- icon loading
- transitions
- repeated DOM rendering
- unnecessary reloads
- duplicate listeners
- service-worker cache behavior

Do not add animations everywhere.

Use motion to communicate:

- navigation
- opening/closing
- saved/completed
- state change

Respect reduced-motion preferences.

---

# 44. REMOVE DEVELOPMENT FEEL

Search visible UI and replace anything that feels like a prototype:

Bad:

"Loading your data..."
"Syncing..."
"Try again."
"Data saved."
"Editor"
"Shared Plan"
"Coach access"

when a client-facing term would be more natural.

Use:

"Updating your plan..."
"Saving..."
"Saved"
"Your plan"
"Your coach"

Technical language belongs on the coach/admin side when necessary.

---

# 45. DO NOT REWRITE THE PRODUCT'S CORE FUNCTIONALITY JUST FOR COSMETICS

This is a cleanup/polish initiative.

Do not casually break:

- training plans
- race plans
- cloud sync
- coach-client relationships
- check-ins
- booking
- COROS
- fueling
- PWA install
- permissions

When a visual issue is caused by architecture, fix the architecture carefully.

---

# 46. DELIVERABLES

At the end of the work, provide:

## A. Design system audit

What inconsistent patterns were found?

## B. Fixed components

List shared components normalized.

## C. Page-by-page audit

For every client-facing page:

- fixed
- remaining issue
- intentionally unchanged

## D. Responsive audit

Desktop / tablet / mobile.

## E. State audit

Loading / empty / error / success / selected / disabled.

## F. Branding audit

Confirm no visible development-era branding remains.

## G. Emoji system

Provide:

- emoji IDs
- labels
- asset naming convention
- usage rules
- storage location
- picker plan

## H. Test results

Include:

- `npm test`
- `node --check` for touched JS
- relevant browser tests
- responsive screenshots/tests
- any known limitations

---

# 47. IMPORTANT WORKFLOW

Do this in a feature branch.

Do not merge to `main`.

Make changes in logical batches.

After each major batch:

- test
- inspect
- report
- wait for approval before expanding scope

If Firestore rules change:

Tell me explicitly that the complete `firestore.rules` file must be pasted into Firebase Console → Firestore Database → Rules → Publish.

Do not assume it auto-deploys.

---

# 48. FINAL STANDARD

Do not stop when:

> "Everything technically works."

Stop when a normal person can use the app and say:

> "This feels like a real coaching app."

The app should look consistent before, during and after interaction.

There should be no moment where the user sees:

- browser-default fonts
- browser-default colors
- broken icons
- unstyled dynamic text
- inconsistent buttons
- clipped layouts
- development wording
- empty unexplained boxes
- raw error messages
- broken mobile sheets
- random emoji styles
- unexplained jumps
- page-specific visual identities

The goal is **Southbound Coaching as a coherent product**, not a collection of individually acceptable pages.
