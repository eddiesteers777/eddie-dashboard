// Pure rules for js/viewportFix.js (tested in tests/viewportFix.test.mjs).
//
// iOS 26 Safari bug (WebKit 297779): after the keyboard or a picker closes,
// the visual viewport can stay short (height smaller than innerHeight), and
// bars pinned to the bottom of the screen (the tab dock, the Fueling bar) are
// drawn that far up the page, on top of the form. fixedShift() says how far
// to move them back down; 0 means leave them alone.

// Below this, a gap is just rounding or the toolbar settling, not the bug.
export const MIN_SHIFT = 40;

export function fixedShift({ innerHeight, vvHeight, vvOffsetTop = 0, scale = 1, typing = false } = {}) {
    // While typing the keyboard really is there; when zoomed the gap is real too.
    if (typing) return 0;
    if (!(Math.abs(Number(scale) - 1) < 0.01)) return 0;
    const inner = Number(innerHeight), vh = Number(vvHeight), top = Number(vvOffsetTop) || 0;
    if (!(inner > 0) || !(vh > 0)) return 0;
    const gap = Math.round(inner - vh - top);
    // Never more than half the screen: a bigger gap means something else is going on.
    return gap >= MIN_SHIFT && gap <= inner / 2 ? gap : 0;
}

// Fields that bring up the phone's keyboard or picker.
export function isTypingTarget(el) {
    if (!el || typeof el.tagName !== "string") return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    if (tag !== "input") return false;
    const type = String(el.type || "text").toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(type);
}
