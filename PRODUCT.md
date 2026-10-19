# Product

<!-- impeccable:product-schema 1 -->

> Written 2026-10-19 from the repo (CLAUDE.md, the public pages, docs/) and Eddie's project brief. Lines marked *(inferred)* are waiting on Eddie's confirmation.

## Platform

web

## Users
- **Newcomers (the public website):** runners, people who lift, and soccer players (and parents of young players *(inferred)*) who found Southbound by link, search or word of mouth and are deciding whether to apply. Mostly on a phone.
- **Clients:** approved athletes who train in the installable app (PWA): their plan, logs, check-ins, sessions and messages.
- **Coach:** Eddie, who runs the business, reviews every application himself, and coaches every client.

## Product Purpose
One coach, one plan, one app. Southbound Coaching sells online coaching, running and strength programming, and 1-on-1 or group soccer training. The website's job is to turn a newcomer's interest into a submitted application (or a question on the contact page). Success = more good-fit applications.

## Positioning
A single real coach who builds and adjusts the plan by hand, and an app built for that coaching (plan, weekly check-ins, session booking, progress) instead of a generic training app or a template PDF. Eddie personally reviews every application.

## Operating Context
- Apply without an account (`apply.html`); questions without sign-in (`contact.html`).
- Free tools open to everyone: Pace calculator (`pace.html`) and the full Fueling calculator (`fueling.html`).
- The app installs from the browser (no app store) via `install.html`.
- Static site on GitHub Pages at southboundcoaching.com; no build step.

## Capabilities and Constraints
- Services are exactly: `online_coaching`, `running`, `strength`, `soccer_1on1`, `soccer_group` (`js/services.js`).
- Prices are not published yet ("Pricing on request" until Eddie decides).
- Eddie's email and personal details never go in the code.
- Fonts self-hosted; nothing loads from Google or other third parties at runtime.

## Brand Commitments
- Name "Southbound Coaching" ("Southbound" in short); never "EddieOS".
- Palette is fixed: forest green ground, cream text, tan/sand as the one action colour, sage. Eddie: "keep my original palette" (2026-10-14), and this project: "preserve its recognizable forest-green, cream, sand, and sage identity".
- Direction A type: Big Shoulders Display (uppercase headlines), Albert Sans (text), IBM Plex Mono (labels), Saira (wordmark). Details in `.claude/skills/southbound-design/SKILL.md`.
- Logo: the Southbound mark/brand tile (`brand/`). Tagline "Faster. Stronger. Smarter."
- Voice: first person from Eddie, plain and direct ("I review every application myself").

## Evidence on Hand
- Photos: stock (Unsplash) hero and four offer photos in `images/`. No real photos of Eddie yet; `eddie-portrait.jpg`, `eddie-about.jpg`, `gallery-2/3.jpg` are missing.
- No testimonials, client results, credentials, prices, or bio text yet. Never invent any of these.
- The app itself is real and can be shown (screens of the plan, check-ins, workout view), labelled as an example.
- The coaching page's example week exists and is labelled as an illustration.

## Product Principles
1. Trust in Eddie is the product: show the coach and the method, never hype.
2. Honest by default: no invented results, prices or claims; examples are labelled.
3. One clear next step on every page: apply (or ask a question).
4. Phone first: most newcomers arrive on a phone.

## Accessibility & Inclusion
Tap targets 44px+, inputs 16px+, text 12px+ on public pages, WCAG AA contrast, a skip link, labelled form fields (from the 2026-10-19 audit).
