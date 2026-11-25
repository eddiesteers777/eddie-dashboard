// The app's look (Eddie, 2026-10-29: fog-blue ground, blue glass, gold only as an accent; 2026-11-19: mist ground with
// deep cards). Since 2026-11-25 the look itself is css/skin.css, linked in every app page's <head> beside
// js/appLookBoot.js, so it is there before the first paint. This module, called from js/loadHeader.js, fills in
// anything a page is missing and tags dark boxes that css/skin.css doesn't list.
// The instrument drawings that used to live here (compass, calendar, bottle...) were removed on 2026-11-25:
// nothing had drawn them since 2026-11-02 (plain ground on every page). js/appMotion.js keeps their maths and tests.

// Light ground (Eddie, 2026-11-19): text on the ground is dark, so any panel with a dark fill must say so. The
// classes in css/skin.css (part 3) cover the known panels; this tags every other dark-filled box once it is drawn
// (html.al-light .al-dk resets the text tokens to light and gives it a solid dark base). Debounced, never on the ground.
// Night mode (2026-11-25) has a dark ground, so nothing needs tagging there; switching back to Light tags again.
const GROUND = [203, 216, 227];
const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
function stops(str) {
    return [...str.matchAll(/rgba?\(([^)]+)\)/g)].map(m => { const n = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); const a = n.length > 3 ? n[3] : 1; return [0, 1, 2].map(i => n[i] * a + GROUND[i] * (1 - a)); });
}
export function tagDarkSurfaces(root = document.body) {
    if (!document.documentElement.classList.contains("al-light")) return;
    const vw = innerWidth, vh = innerHeight;
    for (const e of root.querySelectorAll("*")) {
        if (e.classList.contains("al-dk") || e.closest(".al-dk,.al-bg,svg")) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 28 || r.height < 20 || (r.width >= vw - 2 && r.height >= vh - 2)) continue;
        const cs = getComputedStyle(e);
        const list = stops(cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "" : cs.backgroundColor).concat(/gradient/.test(cs.backgroundImage) ? stops(cs.backgroundImage) : []);
        if (!list.length) continue;
        if (list.reduce((t, c) => t + lum(c), 0) / list.length < .22) e.classList.add("al-dk");
    }
}
let tagTimer = 0;
function watchSurfaces() {
    const run = () => { tagTimer = 0; tagDarkSurfaces(); };
    const queue = () => { if (!tagTimer) tagTimer = setTimeout(run, 250); };
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
    queue(); addEventListener("load", queue); addEventListener("resize", queue); addEventListener("southbound-look", queue);
}

// Every app page sets the look before its first paint (js/appLookBoot.js and css/skin.css in <head>), so html.al-on
// and the background layer are usually here already. This fills in anything a page is missing and starts the
// dark-panel tagging, once per page.
let started = false;
export function applyAppLook() {
    if (started || document.documentElement.classList.contains("sb-guest")) return;
    started = true;
    if (!document.querySelector('link[href*="css/skin.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL("../css/skin.css", import.meta.url).href;
        document.head.append(link);
    }
    // Plain fog-blue ground on every app page (Eddie, 2026-11-02): no drawing behind the page.
    if (!document.querySelector("body>.al-bg")) {
        const bg = document.createElement("div");
        bg.className = "al-bg";
        bg.setAttribute("aria-hidden", "true");
        document.body.prepend(bg);
    }
    document.documentElement.classList.add("al-on");
    // A page without js/appLookBoot.js has no mode switch: it keeps the light look, as before.
    if (!window.SouthboundLook) document.documentElement.classList.add("al-light");
    watchSurfaces();
}
