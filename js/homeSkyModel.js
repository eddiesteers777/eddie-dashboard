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
