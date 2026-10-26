/* ==========================================
   Southbound — home page "How a week gets made" story (pure logic)

   progress is how far the visitor has scrolled through the story
   section, 0 at its top and 1 at its end. Returns the step on show
   (1..steps) and how full each 01-04 bar is (0..100). The current
   bar never shows less than a sliver, so the visitor can see where
   they are.
========================================== */

export function storyState(progress, steps = 4) {
    const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    const step = Math.min(steps, Math.floor(p * steps) + 1);
    const local = p * steps - (step - 1);
    const fills = Array.from({ length: steps }, (_, i) =>
        i < step - 1 ? 100 : i === step - 1 ? Math.round(Math.max(6, Math.min(100, local * 100))) : 0);
    return { step, fills };
}

/* How far through the story the page is, from the section's box.
   top = its distance from the top of the window, height = its height. */
export function storyProgress(top, height, viewport) {
    const travel = height - viewport;
    if (!(travel > 0)) return 0;
    return Math.min(1, Math.max(0, -top / travel));
}
