// Swiping the page left or right moves to the neighbouring section tab
// (Train: Overview / Running / Strength / Cross-Training; Fuel; Coach).
// Pure decisions live here so they can be unit tested; js/loadHeader.js wires
// them to touch events.

export const SWIPE_MIN_DISTANCE = 64;   // px sideways
export const SWIPE_MAX_SLOPE = 0.6;     // up/down may be at most 60% of sideways
export const SWIPE_MAX_MS = 700;

// -1 = finger moved right (go to the previous tab), 1 = moved left (next tab), 0 = not a swipe.
export function swipeDirection({ dx, dy, ms }) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return 0;
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_SLOPE) return 0;
    if (ms > SWIPE_MAX_MS) return 0;
    return dx < 0 ? 1 : -1;
}

// The page to open for a swipe, or null at either end of the row.
export function neighbourPage(pages, current, direction) {
    const i = pages.indexOf(current);
    if (i < 0 || !direction) return null;
    return pages[i + direction] || null;
}

// A swipe that starts on something that scrolls or drags sideways, or on a
// control the finger is working, belongs to that element, not to the tabs.
export function ownsSwipe(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        if (node.matches?.("input, textarea, select, [contenteditable], [data-no-swipe], dialog[open], .eos-bottomnav, .eos-subnav")) return true;
        if (node === document.body) break;
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) return true;
    }
    return false;
}
