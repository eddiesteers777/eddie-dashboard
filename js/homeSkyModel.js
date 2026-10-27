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
    "More in the app", "Your three ways in", "Finish",
];

/* How far down the run the visitor is, 0..1: from the middle of the hero to the cream close. */
export function runProgress({ scrollY, vh, heroH, closeTop }) {
    const start = num(heroH) * 0.6;
    return clamp((num(scrollY) + Math.max(1, num(vh)) * 0.6 - start) / Math.max(1, num(closeTop) - start));
}

/* Which chapter label to show. step is the story's step, 1..4. */
export function chapterIndex({ scrollY, vh, heroH, storyTop, storyBottom, featBottom, closeTop, step }) {
    const y = num(scrollY), v = Math.max(1, num(vh)), mid = y + v * 0.5;
    if (y < num(heroH) * 0.6) return 0;
    if (mid < num(storyTop)) return 1;
    if (mid < num(storyBottom)) return 1 + Math.min(4, Math.max(1, Math.round(num(step)) || 1));
    if (mid < num(featBottom)) return 6;
    if (mid < num(closeTop) - v * 0.2) return 7;
    return 8;
}

/* A pinned sideways track: top is the wrapper's distance from the pin line, travel how far the cards slide. */
export function sidewaysProgress(top, travel) {
    return travel > 0 ? clamp(-num(top) / travel) : 0;
}

/* ---- The phone that rides beside the story: real recordings of the app ---- */

/* The seven recordings on the site (videos/tour/<id>.mp4), in tour order, with the words shown for each. */
export const CLIPS = {
    checkin: ["Check-in", "Morning check-in", "Thirty seconds on how you feel becomes a readiness score, and your coach sees it too."],
    wins: ["Wins", "Wins and habits", "Finish a workout or tick off a habit and the app marks the moment."],
    plans: ["Plans", "Plans", "Strength, running and race plans, built by your coach and always up to date."],
    live: ["Live", "Live workouts", "Log sets, run the rest timer and watch a demo of every exercise as you train."],
    soccer: ["Soccer", "Soccer", "Book a session, read the report afterwards, then practice with the video your coach picked."],
    fuel: ["Fueling", "Fueling", "A fueling plan for your run: carbs, fluid and sodium, and when to take them. Free for everyone."],
    pace: ["Pace", "Pace", "Pace, race splits and training zones from one real result. Free for everyone."],
};
export const CLIP_ORDER = ["checkin", "wins", "plans", "live", "soccer", "fuel", "pace"];
/* The tabs under the phone: one row, five picks. Wins and Live still play inside the story. */
export const CHIP_ORDER = ["plans", "checkin", "soccer", "fuel", "pace"];
const FEATURE_CLIPS = ["soccer", "fuel", "pace"]; // "More in the app", in order

/* Which recording the phone shows, and how far through it (0..1), for a point in the story.
   progress is 0..1 through the pinned story (four equal steps), one recording per step. */
export function storyClipAt(progress) {
    const p = clamp(num(progress)) * 4, step = Math.min(3, Math.floor(p)), local = clamp(p - step);
    return { id: ["checkin", "plans", "live", "wins"][step], frac: local };
}

/* The feature section: three recordings, each played start to end while its quarter scrolls past. */
export function featureStep(progress) {
    return Math.min(FEATURE_CLIPS.length - 1, Math.floor(clamp(num(progress)) * FEATURE_CLIPS.length));
}
export function featureClipAt(progress) {
    const p = clamp(num(progress)) * FEATURE_CLIPS.length, step = featureStep(progress);
    return { id: FEATURE_CLIPS[step], frac: clamp(p - step) };
}

/* A tapped chip: the chosen recording follows the scroll for a screen or so from where the visitor was,
   then the page takes over again. dy is how far the page has scrolled since the tap. */
export const MANUAL_SPAN = 1.2; // screens of scrolling to play a tapped recording start to end
export function manualFrac(dy, vh) { return clamp(num(dy) / (Math.max(1, num(vh)) * MANUAL_SPAN)); }
export function manualActive(dy, vh) {
    const v = Math.max(1, num(vh)), d = num(dy);
    return d > -v * 0.4 && d < v * MANUAL_SPAN;
}

/* How visible the phone is: arrives just before the story, leaves when the feature section is done. */
export function phoneFade({ scrollY, vh, storyTop, featTop, featH }) {
    const y = num(scrollY), v = Math.max(1, num(vh));
    const end = num(featTop) + num(featH) - v;
    return {
        inn: ramp(y, num(storyTop) - v * 0.55, num(storyTop) - v * 0.1),
        out: ramp(y, end, end + v * 0.6),
    };
}
