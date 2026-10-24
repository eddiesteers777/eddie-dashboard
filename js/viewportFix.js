// Keeps the bars pinned to the bottom of a phone screen (the tab dock, the
// Fueling bar) off the form. Loaded by js/loadHeader.js on every app page.
//
// 1. While a field has the keyboard or a picker open, html.sb-typing hides
//    those bars (css/style.css, css/fueling.css), so they never sit on the
//    field being filled in.
// 2. iOS 26 Safari can leave the bars drawn high up the page after the
//    keyboard closes (js/viewportFixModel.js). --sb-vv-fix moves them back
//    down until the browser catches up.

import { fixedShift, isTypingTarget } from "./viewportFixModel.js";

const root = document.documentElement;
const vv = window.visualViewport;
const phone = window.matchMedia("(max-width: 900px)");
let frame = 0;

const typing = () => phone.matches && isTypingTarget(document.activeElement);

function update() {
    frame = 0;
    root.classList.toggle("sb-typing", typing());
    const shift = vv ? fixedShift({
        innerHeight: window.innerHeight,
        vvHeight: vv.height,
        vvOffsetTop: vv.offsetTop,
        scale: vv.scale,
        typing: typing()
    }) : 0;
    if (shift) root.style.setProperty("--sb-vv-fix", `${shift}px`);
    else root.style.removeProperty("--sb-vv-fix");
}

const soon = () => { if (!frame) frame = requestAnimationFrame(update); };

document.addEventListener("focusin", soon);
// focusout fires before the next field takes focus: wait a beat so moving
// between fields doesn't flash the bars.
document.addEventListener("focusout", () => setTimeout(soon, 60));
vv?.addEventListener("resize", soon);
vv?.addEventListener("scroll", soon);
window.addEventListener("resize", soon);
phone.addEventListener?.("change", soon);
update();
