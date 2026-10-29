// The app's foggy blue look (Eddie, 2026-10-29): fog-blue ground, blue glass, an instrument drawing per page, gold only as an accent.
// Adds css/appLook.css, a fixed background layer and one faint drawing per page. No layout change.
// One simple instrument drawing per page, in mist lines (a compass for Today, a calendar for Plan, ...).
const L = (a, w = ".6") => `fill="none" stroke="rgba(214,228,240,${a})" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"`;
const DRAW = {
    index: `<g ${L(.34)}><circle cx="62" cy="38" r="24"/><circle cx="62" cy="38" r="20" stroke-dasharray="1 2"/><path d="M62 18 L68 38 L62 58 L56 38 Z"/><circle cx="62" cy="38" r="1.6"/></g>`,
    plan: `<g ${L(.32)}><rect x="12" y="12" width="76" height="58" rx="3"/><path d="M12 26 H88"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<line x1="${12 + i * 10.86}" y1="26" x2="${12 + i * 10.86}" y2="70"/>`).join("")}<path d="M12 40 H88 M12 54 H88"/><rect x="45.7" y="40" width="10.9" height="14" fill="rgba(214,228,240,.18)"/></g>`,
    train: `<g ${L(.34)}><circle cx="55" cy="42" r="26"/><circle cx="55" cy="42" r="21" stroke-dasharray="1 2"/><path d="M50 10 h10 M55 10 v6 M55 42 L66 30"/><path d="M80 18 l4 -4"/></g>`,
    nutrition: `<g ${L(.32)}><path d="M42 6 h16 v10 c 8 4 12 8 12 18 v34 H30 V34 c0 -10 4 -14 12 -18 Z"/><path d="M30 30 H70 M30 42 H70 M30 54 H70" stroke-dasharray="1 1.5"/></g>`,
    habits: `<g ${L(.36, ".9")}><circle cx="58" cy="38" r="26"/><circle cx="58" cy="38" r="18"/><circle cx="58" cy="38" r="10"/></g><g ${L(.55, "1.4")}><path d="M58 12 A26 26 0 1 1 33 46"/><path d="M58 20 A18 18 0 0 1 76 38"/></g>`,
    progress: `<g ${L(.36)}><path d="M0 40 H22 L28 40 L33 20 L40 60 L46 30 L50 40 H66 L72 40 L77 26 L82 52 L86 40 H100"/></g><g ${L(.2, ".4")}><path d="M0 16H100M0 66H100"/></g>`,
    messages: `<g ${L(.34)}><path d="M12 12 H88 V50 H52 L36 66 V50 H12 Z"/><path d="M24 24 H76 M24 34 H62" stroke-dasharray="1 1.6"/></g>`,
    coach: `<g ${L(.34)}><rect x="8" y="10" width="84" height="58" rx="3"/><line x1="50" y1="10" x2="50" y2="68"/><circle cx="50" cy="39" r="9"/><path d="M22 24 l6 6 m0 -6 l-6 6 M70 50 l6 6 m0 -6 l-6 6"/><circle cx="68" cy="26" r="3"/><circle cx="30" cy="52" r="3"/><path d="M33 50 L62 30" stroke-dasharray="1 1.6"/></g>`
};
DRAW.clients = DRAW.coach;

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
    if (DRAW[page]) bg.innerHTML = `<svg viewBox="0 0 100 80" preserveAspectRatio="xMaxYMin meet">${DRAW[page]}</svg>`;
    document.body.prepend(bg);
    document.documentElement.classList.add("al-on");
}
