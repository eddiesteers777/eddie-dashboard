// The app wears the public site's old-print night, with forest green kept as glass (Eddie, 2026-10-28).
// Adds css/appLook.css, a fixed background layer and a faint drawing behind a few pages. No layout change.
const DRAW = {
    index: `<path d="M-5 80 C 20 70, 30 88, 55 74 S 90 60, 105 66" fill="none" stroke="rgba(242,226,196,.22)" stroke-width=".35" stroke-dasharray="1 1.2" vector-effect="non-scaling-stroke"/>`,
    plan: `<path d="M0 80 L8 74 L16 78 L24 62 L32 66 L40 48 L48 54 L56 36 L64 44 L72 28 L80 34 L88 18 L100 22" fill="none" stroke="rgba(242,226,196,.28)" stroke-width=".35" vector-effect="non-scaling-stroke"/>`,
    train: `<g fill="none" stroke="rgba(242,226,196,.08)" stroke-width=".3" vector-effect="non-scaling-stroke"><rect x="4" y="30" width="92" height="55"/><line x1="50" y1="30" x2="50" y2="85"/><circle cx="50" cy="57" r="9"/></g>`
};

export function applyAppLook() {
    if (document.documentElement.classList.contains("al-on") || document.documentElement.classList.contains("sb-guest")) return;
    if (!document.querySelector('link[href$="css/appLook.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL("../css/appLook.css", import.meta.url).href;
        document.head.append(link);
    }
    const page = (location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index";
    const bg = document.createElement("div");
    bg.className = "al-bg";
    bg.setAttribute("aria-hidden", "true");
    if (DRAW[page]) bg.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${DRAW[page]}</svg>`;
    document.body.prepend(bg);
    document.documentElement.classList.add("al-on");
}
