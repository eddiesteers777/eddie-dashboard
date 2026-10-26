/* ==========================================
   Southbound — home page scrolling backdrop (pure logic)

   The page background follows the visitor down the page: the hero's
   sunset, dusk, night behind the "How a week gets made" story, then a
   sage dawn before the cream close. Everything is derived from the
   scroll position and where a few sections sit (all in page pixels),
   so the colour change always lines up with the content.
   Returns opacities 0..1 for the dusk, night and dawn layers, how far
   the sun has set (0..1) and how far through the hero the visitor is.
========================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ramp = (v, a, b) => (b > a ? clamp((v - a) / (b - a)) : v >= b ? 1 : 0);
const num = (v) => (Number.isFinite(v) ? v : 0);

export function skyState({ scrollY, vh, heroH, storyTop, storyBottom, closeTop }) {
    const y = num(scrollY), v = Math.max(1, num(vh));
    const hero = Math.max(1, num(heroH));
    const sTop = num(storyTop), sBot = Math.max(sTop, num(storyBottom));
    const cTop = Math.max(sBot, num(closeTop));
    const mid = y + v * 0.5; // the line across the middle of the screen

    const dusk = ramp(y, hero * 0.15, hero * 0.9);
    const night = ramp(mid, sTop - v * 0.2, sTop + v * 0.6);
    const dawn = ramp(mid, sBot - v * 0.2, Math.max(sBot + 1, cTop - v * 0.4));
    return {
        dusk,
        night: night * (1 - dawn),
        dawn,
        set: ramp(y, 0, sTop + v * 0.3),
        rise: dawn,
        hero: clamp(y / hero),
    };
}

/* ---- "The Run": the page is a 13.1 mile run ---- */

export const RACE_MILES = 13.1;
export const CHAPTERS = [
    "Start line", "Warm-up",
    "01 · You apply", "02 · I write your week", "03 · You train and check in", "04 · I change it by hand",
    "Your three ways in", "Finish",
];

/* How far down the run the visitor is, 0..1: from the middle of the hero to the cream close. */
export function runProgress({ scrollY, vh, heroH, closeTop }) {
    const start = num(heroH) * 0.6;
    return clamp((num(scrollY) + Math.max(1, num(vh)) * 0.6 - start) / Math.max(1, num(closeTop) - start));
}

/* Which chapter label to show. step is the story's step, 1..4. */
export function chapterIndex({ scrollY, vh, heroH, storyTop, storyBottom, closeTop, step }) {
    const y = num(scrollY), v = Math.max(1, num(vh)), mid = y + v * 0.5;
    if (y < num(heroH) * 0.6) return 0;
    if (mid < num(storyTop)) return 1;
    if (mid < num(storyBottom)) return 1 + Math.min(4, Math.max(1, Math.round(num(step)) || 1));
    if (mid < num(closeTop) - v * 0.2) return 6;
    return 7;
}

/* A pinned sideways track: top is the wrapper's distance from the pin line, travel how far the cards slide. */
export function sidewaysProgress(top, travel) {
    return travel > 0 ? clamp(-num(top) / travel) : 0;
}

/* ---- The phone that rides beside the story ---- */

export const PHONE_SCREENS = 6; // apply, today, week, workout, check-in, note from Eddie

/* Which part of the app feed the phone shows, 0..5, for how far through the story the visitor is (0..1).
   It holds on the screen that matches each of the four steps and scrolls between them. */
const KEYS = [0.16, 0.28, 0.43, 0.55, 0.68, 0.8];
const VALS = [0, 2, 2, 4, 4, 5];
export function phoneFeed(sp) {
    const p = clamp(num(sp));
    if (p <= KEYS[0]) return VALS[0];
    if (p >= KEYS[5]) return VALS[5];
    for (let i = 0; i < 5; i++) {
        if (p <= KEYS[i + 1]) {
            const t = (p - KEYS[i]) / (KEYS[i + 1] - KEYS[i]);
            return VALS[i] + (VALS[i + 1] - VALS[i]) * t * t * (3 - 2 * t);
        }
    }
    return VALS[5];
}

/* How visible the phone is: arrives just before the story, leaves when the story is done. */
export function phoneFade({ scrollY, vh, storyTop, storyH }) {
    const y = num(scrollY), v = Math.max(1, num(vh));
    const end = num(storyTop) + num(storyH) - v;
    return {
        inn: ramp(y, num(storyTop) - v * 0.55, num(storyTop) - v * 0.1),
        out: ramp(y, end, end + v * 0.6),
    };
}
