---
name: southbound-design
description: The Southbound look (direction A "Golden Hour" type and shapes on the original forest/tan/cream palette, chosen by Eddie 2026-10-14). Use before changing or adding any page, component, style or image in the app or the website.
---

# Southbound design: direction A on the original palette

Eddie's words: "More like A, but keep my original palette." A = trail-editorial, race-poster energy; never a generic dashboard. The tokens live in `css/style.css` `:root`; use them, never hard-code a colour or font.

## Palette (unchanged brand colours)
- Ground `--bg` #0F2019 forest, panels `--surface` / `--surface-light`, lines `--border`.
- Text `--text` cream, secondary `--text-secondary`, quiet `--muted`.
- **Tan `--primary` is the one action colour** (main buttons, the active tab, today's marker, the accent rule on today's card). Text on tan is `--on-primary`.
- Sage `--sage` / `--green` = done / on target. Status tones (`--amber`, `--red`…) only for real status, never decoration.
- The app is photo-free (speed, offline). Photography belongs on the public website.

## Public website look (Eddie, 2026-10-28): old-print sepia
The app stays forest/tan/cream. The public pages (home, About, Coaching, Soccer, Packages, Apply, Contact, Get the App, Free tools) wear an old-print sepia night: brown-black ground with amber glow, light grain, dark corners (`css/publicLook.css`, `js/publicLook.js`; home in `js/homeSky.js`). Panels are see-through glass with a 1px gold hairline on top; photos get a glass sheen; each page has its own drawing behind it (prints, route, pitch, ledger, lamp, postmark, drops, graph paper). Chat bubbles beside the home phone are water drops that pop into falling water. Keep new public work in this look; do not turn public pages back to flat forest panels.

## Type
- **Headlines:** `var(--font-display)` = Big Shoulders Display, **always uppercase** (the font has lowercase; every rule using it sets `text-transform:uppercase`). Weight 800–900, line-height ~0.9–1. Use for page titles, the greeting, workout names, big numbers.
- **Text:** `var(--font-body)` = Albert Sans (Instrument Sans is the fallback), 15–16px, 1.45–1.55 line height. Sentences in normal case.
- **Labels and data:** `var(--font-mono)` = IBM Plex Mono 500/600, 10.5–12px, uppercase, letter-spacing .1–.14em, for kickers ("TODAY · THU OCT 15"), paces, splits, dates, counts.
- Never put long text in the display font; never more than one display headline per card.

## Shapes and structure
- Corners: `--radius-pill` 6px (buttons), `--radius-sm` 6px, `--radius-md` 8px, `--radius` 12px (cards). The dock and top bar stay capsules.
- **Lines over boxes.** Prefer a rule (1px `--border`, or a 2px tan rule over today's item) and spacing to a card inside a card. One level of card at most.
- Hierarchy on a card: mono kicker → display title (+ big number right-aligned in tan) → one line of body text → actions.
- Buttons: main action = tan fill, squared (6px), bold body font; secondary = outline in `--border`. Start before a workout, Mark done after.
- Touch targets ≥ 44px; text ≥ 11px; no horizontal scroll at 320px.

## Never
- Neon or new accent colours; gradients on buttons; faint logo watermarks behind text (use the brand tile).
- Lowercase display headlines; emoji as icons; "safe"/"optimal" about training load.
- Photos inside the app; Google Fonts at runtime (fonts are self-hosted in `fonts/`, and `npm run manifest` must run after adding one).

## Check every change
1. Render it against the emulator harness (see CLAUDE.md → Testing) at 320, 390 and 1280; look at the screenshots.
2. Measure: no horizontal overflow, no new text under 11px or tap target under 44px, no page errors.
3. Compare with this file; fix anything off-brand before reporting.
