---
name: exercise-demo-integration
description: Plan, build, test and maintain Southbound's exercise demonstrations (the "How to" sheet, the 3D clips, the drawn figure, and the licensed MuscleWiki videos served through a Cloud Function). Use before adding a demo source, changing the How to sheet, or touching the MuscleWiki proxy.
---

# Exercise demonstrations

A "How to" sheet opens from a strength exercise (`js/setRunner.js`, `js/strengthSession.js`). It shows the exercise moving, the steps, the muscle map and the coach's note. The sources, in the order the sheet tries them:

| # | Source | Where | Notes |
|---|---|---|---|
| 1 | **MuscleWiki** licensed videos (real people, male + female, front + side) | `functions/exerciseDemoModel.js` + `getExerciseDemo` in `functions/index.js` (server), `js/exerciseDemoRemote.js` (app) | Paid API. Off until `REMOTE_DEMOS_ENABLED` in `js/exerciseDemoConfig.js` is true. |
| 2 | Our 3D clips (mannequin) | `js/exerciseClips.js`, `videos/`, built by `scripts/build-clips/` | 4 exercises. Not precached. |
| 3 | The drawn Southbound figure | `js/exerciseDemos.js` + `js/demoFigure.js` | Works offline. |
| 4 | Nothing | | The sheet still opens with the steps (if any) and the coach's note, and says the demo isn't available. |

**In the lab (not wired into the sheet yet): free 3D athletes** in `lab/demo3d/` (male + female, CC0 MakeHuman bodies, our own motions, Three.js player, drawn figure as fallback). Read `lab/demo3d/README.md` (pipeline, review gate, adding an exercise) and `lab/demo3d/LICENSES.md` before touching it. A 3D demo is shown to clients only when its movement checks pass and a person signed it off in `lab/demo3d/exercises.json`. If it moves into the app it slots in as source 2, ahead of the mannequin clips.

`hasHowTo(name)` (`js/exerciseMuscles.js`) decides whether the button shows. With remote demos on, every named exercise gets the button, because the server is the one who knows.

## Before changing anything

1. Read `js/exerciseDemoSheet.js` top to bottom (the sheet and both players) and the module you'll touch.
2. Read the `southbound-design` skill for any visual change. The sheet styles are `css/demo.css`.
3. For MuscleWiki, re-read the provider's rules (below). They change, and breaking them can suspend the key.

## MuscleWiki rules (checked 2026-10-18: api.musclewiki.com/documentation, /api-terms, /pricing)

- **Plan.** API keys need a paid plan: TESTING $10/mo (1,000 calls, testing), GROWTH $39.99/mo (30,000 calls, production). Every `/stream/` request is a call, **including each video range request**, so one playback costs several calls.
- **Key stays on the server.** It lives in Firebase Secret Manager as `MUSCLEWIKI_API_KEY` and is only read inside `getExerciseDemo`. Never in `js/`, never in a test fixture, never logged.
- **Video playback uses media tokens.** The function mints a token with `POST /media/token` (15 minutes, valid on `/stream/` only), keeps one per function instance until about a minute before it expires, and returns stream URLs with `?token=`. Never mint per video. Never log the token, put it in analytics, a share link, `localStorage` or Firestore. The app keeps it in memory only.
- **Caching.** Metadata (text) may be cached up to 30 days: the function caches it in the server-only Firestore collection `exerciseDemoCache` (no client rule, so clients are denied). Video bytes: transient only (the browser's buffer). The service worker never touches `api.musclewiki.com` (`sw.js` only handles our origin and two CDNs); keep it that way. Thumbnails: at most 24 hours, on the device. We don't store them.
- **No download, no re-hosting, no scraping.** No download button or link to a video URL, `controlsList="nodownload"`, no right-click menu on the video. Don't bulk-fetch the catalog; look exercises up when someone opens one.
- **Attribution.** (1) `privacy.html` must carry, verbatim: "Exercise data and videos provided by MuscleWiki.com". (2) Never crop, cover or re-encode the video: it plays with `object-fit: contain` and **no controls are laid over it** (they sit in a bar under the video). A visible credit linked to musclewiki.com is encouraged and shown under the video.
- **Use.** Fitness apps only, no reselling or exposing the data to third parties, no AI training on it.

## How the remote path works

1. The app calls the callable `getExerciseDemo({ name })` (`js/exerciseDemoRemote.js`, cached in memory per name until the token is about to expire).
2. The function checks the caller is signed in and an active client or approved coach (`userProfiles/{uid}`), so pending sign-ups can't spend the quota.
3. It looks in `exerciseDemoCache/{key}` (fresh for 30 days; a miss is remembered for 7 days). Otherwise `GET /search?q=<name>&limit=8`, picks the best match (`pickBestMatch`: exact name, then aliases, then word overlap, never a weak guess), and keeps only safe fields (`sanitizeExercise`: `/stream/videos/branded/…` and `/stream/images/og_images/…` paths on api.musclewiki.com, nothing else).
4. It adds a media token to each video and poster URL and returns `{ found, exercise, videos, expiresAt, credit }`.
5. Errors become `HttpsError`s the app understands: no key or a rejected key → `failed-precondition`, quota → `resource-exhausted`, network/5xx → `unavailable`. The app never shows provider error text; it quietly falls back to source 2/3/4.
6. In the sheet: Male/Female and Front/Side toggles (only the ones that exist), 0.5×, play/pause, and the MuscleWiki steps. The viewer's Male/Female choice is kept on the device (`sb-demo-gender`, cleared at sign-out). If a video fails mid-way (token expired), the app refreshes once, then falls back.

## Turning it on (needs Eddie)

1. Firebase project on the **Blaze** plan (Cloud Functions need it).
2. A MuscleWiki API subscription (TESTING to try, GROWTH for real clients) and an API key from its dashboard.
3. `firebase functions:secrets:set MUSCLEWIKI_API_KEY`, then `firebase deploy --only functions` (steps in `functions/README.md`).
4. Set `REMOTE_DEMOS_ENABLED = true` in `js/exerciseDemoConfig.js`, run `npm run manifest`, test, and push.

## Tests (run all before pushing)

- `node --test tests/exerciseDemoModel.test.mjs` — server: matching, sanitizing (rejects foreign URLs), cache freshness, error mapping, the full lookup with a fake `fetch` (cache hit, miss, quota, bad key, token reuse).
- `node --test tests/exerciseDemoRemote.test.mjs` — app: response checking, video choice and fallbacks, gender preference, in-memory cache and expiry, error codes.
- `node --test tests/exerciseDemos.test.mjs` — the drawn figures and clips.
- `npm run test:static` and `npm run test:stripe` (it also syntax-checks `functions/`).
- **Playwright:** serve the repo (`python3 -m http.server 8934`), block service workers, route `js/exerciseDemoRemote.js`'s callable through a mock (see `scripts/demo-check.mjs`), open the sheet at 1280px and 390px: the remote video, the gender/angle toggles, a failure that falls back to the drawn figure, and an exercise with nothing.

## Adding more demos

- **Another MuscleWiki exercise:** nothing to build. If the match picks the wrong one, add an alias in `NAME_HINTS` (`functions/exerciseDemoModel.js`) mapping our name to MuscleWiki's, with a test.
- **Another drawn figure or 3D clip:** follow `js/exerciseDemos.js` / `scripts/build-clips/build.mjs`; they stay the offline fallback.
- **Another provider:** add it behind the same server function and return the same shape, so the sheet doesn't change. Check its license, caching and attribution first and record them in this file.

## After a change

Run `npm run manifest`, then update `docs/APP_REFERENCE.md` ("How to" section) and `docs/BUILD_HISTORY.md`. If what we send to a provider changes, update `privacy.html`.
