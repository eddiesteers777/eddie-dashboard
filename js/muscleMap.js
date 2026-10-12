/* ==========================================
   Southbound — the muscle map (pure)

   A flat body, front and back, with the muscles an exercise or a whole
   workout worked, in Southbound's colours: the main ones in tan, the ones
   helping in sage, the rest a quiet forest. Apart from the moving figure
   (js/demoFigure.js): this is the at-a-glance diagram, that's the video.

   muscleMapSvg(levels, { view, id })   one view as an <svg>
       levels  { muscle: "primary" | "secondary" } (js/exerciseMuscles.js names)
   muscleMapHtml(muscles, { id, title }) both views + the chips under them
   workoutMuscles(exercises)             { primary, secondary } for a workout:
       a muscle is main when it's main in any exercise with sets done.
   ensureMuscleMapStyles()               loads css/muscle-map.css once.
========================================== */

import { musclesFor, MUSCLE_LABELS } from "./exerciseMuscles.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const W = 200, H = 436;
const C = {
    // Southbound's own colours: a forest body with a cream line, tan for
    // the main muscles, sage for the ones helping.
    body: "#1F3428",
    line: "#C8BFAE",
    idle: "#2D4537",
    main: ["#E6CDA2", "#B89B6E"],
    help: ["#B7D0BC", "#7FA488"]
};

// The body, viewer's left half (mirrored for the right). Lines are limbs
// drawn as round-capped strokes of width w.
const LIMBS = [
    { a: [55, 96], b: [44, 168], w: 24 },   // upper arm
    { a: [44, 170], b: [36, 236], w: 18 }   // forearm
];
const PARTS = [
    `<ellipse cx="34" cy="250" rx="8" ry="13"/>`,
    // the leg: hip to ankle, narrowing at the knee
    `<path d="M63 220 C59 262 63 300 69 326 C67 352 71 388 75 414 L92 414 C94 388 97 352 95 326 C98 298 100 268 99 244 Z"/>`,
    `<ellipse cx="83" cy="421" rx="12" ry="7"/>`
];
const CENTER = [
    `<ellipse cx="100" cy="36" rx="19" ry="25"/>`,
    `<path d="M89 54 L111 54 L114 78 L86 78 Z"/>`,
    `<path d="M56 92 C60 80 78 76 100 76 C122 76 140 80 144 92 L146 120 C142 150 134 170 134 196 L138 222 C130 238 112 244 100 244 C88 244 70 238 62 222 L66 196 C66 170 58 150 54 120 Z"/>`
];

// Muscle shapes: [muscle or "" (never lit), svg element]; side = mirrored pair.
const FRONT = {
    side: [
        ["shoulders", `<ellipse cx="57" cy="100" rx="11" ry="14" transform="rotate(-24 57 100)"/>`],
        ["chest", `<path d="M70 95 Q84 89 98 92 L98 122 Q84 129 71 122 Q64 108 70 95 Z"/>`],
        ["traps", `<path d="M84 79 L95 81 L95 88 L75 90 Z"/>`],
        ["biceps", `<ellipse cx="48" cy="134" rx="8" ry="21" transform="rotate(8 48 134)"/>`],
        ["forearms", `<ellipse cx="40" cy="204" rx="7" ry="24" transform="rotate(7 40 204)"/>`],
        ["abdominals", `<rect x="87" y="132" width="11" height="18" rx="4"/>`],
        ["abdominals", `<rect x="87" y="154" width="11" height="18" rx="4"/>`],
        ["abdominals", `<rect x="87" y="176" width="11" height="22" rx="4"/>`],
        ["", `<path d="M73 136 Q80 132 84 140 L84 190 Q77 197 71 185 Q67 160 73 136 Z"/>`],
        ["abductors", `<ellipse cx="66" cy="226" rx="5" ry="13"/>`],
        ["quadriceps", `<ellipse cx="79" cy="278" rx="11" ry="38" transform="rotate(-3 79 278)"/>`],
        ["adductors", `<ellipse cx="93" cy="268" rx="4" ry="22"/>`],
        ["calves", `<ellipse cx="77" cy="364" rx="5" ry="30"/>`],
        ["calves", `<ellipse cx="89" cy="362" rx="4.5" ry="26"/>`]
    ],
    center: []
};
const BACK = {
    side: [
        ["shoulders", `<ellipse cx="57" cy="100" rx="11" ry="14" transform="rotate(-24 57 100)"/>`],
        ["lats", `<path d="M66 106 Q78 103 87 111 L90 168 Q81 186 73 176 Q62 142 66 106 Z"/>`],
        ["triceps", `<ellipse cx="47" cy="134" rx="8" ry="21" transform="rotate(8 47 134)"/>`],
        ["forearms", `<ellipse cx="40" cy="204" rx="7" ry="24" transform="rotate(7 40 204)"/>`],
        ["glutes", `<ellipse cx="83" cy="226" rx="16" ry="17"/>`],
        ["hamstrings", `<ellipse cx="80" cy="284" rx="11" ry="33" transform="rotate(-3 80 284)"/>`],
        ["adductors", `<ellipse cx="94" cy="268" rx="3.5" ry="16"/>`],
        ["calves", `<ellipse cx="82" cy="360" rx="10" ry="30"/>`]
    ],
    center: [
        ["neck", `<rect x="95" y="58" width="10" height="17" rx="4"/>`],
        ["traps", `<path d="M100 72 L123 91 L111 104 L89 104 L77 91 Z"/>`],
        ["middle back", `<path d="M90 107 L110 107 L106 150 L94 150 Z"/>`],
        ["lower back", `<path d="M88 160 L112 160 L118 177 L100 191 L82 177 Z"/>`]
    ]
};

const MIRROR = `transform="matrix(-1 0 0 1 ${W} 0)"`;

function bodySvg() {
    const limbs = (extra, color) => LIMBS.map(l => `<line x1="${l.a[0]}" y1="${l.a[1]}" x2="${l.b[0]}" y2="${l.b[1]}" stroke="${color}" stroke-width="${l.w + extra}" stroke-linecap="round"/>`).join("");
    const half = (extra, color) => `${limbs(extra, color)}<g fill="${color}" stroke="${color}" stroke-width="${extra}">${PARTS.join("")}</g>`;
    const layer = (extra, color) => `
        <g fill="${color}" stroke="${color}" stroke-width="${extra}" stroke-linejoin="round">${CENTER.join("")}</g>
        ${half(extra, color)}<g ${MIRROR}>${half(extra, color)}</g>`;
    // The outline is the same shapes drawn a little fatter underneath.
    return layer(3.6, C.line) + layer(0, C.body);
}

function fillFor(level, id) {
    if (level === "primary") return `url(#${id}m)`;
    if (level === "secondary") return `url(#${id}h)`;
    return C.idle;
}

/** One view of the map: "front" or "back". */
export function muscleMapSvg(levels = {}, { view = "front", id = "mm", label = "" } = {}) {
    const set = view === "back" ? BACK : FRONT;
    const shape = ([muscle, el]) => el.replace(/\/>$/, ` fill="${fillFor(muscle && levels[muscle], id)}"${muscle && levels[muscle] ? ` data-muscle="${esc(muscle)}" data-level="${levels[muscle]}"` : ""}/>`);
    const side = set.side.map(shape).join("");
    const grad = (key, [a, b]) => `<radialGradient id="${id}${key}" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label || `Muscles worked, ${view}`)}" xmlns="http://www.w3.org/2000/svg">
        <defs>${grad("m", C.main)}${grad("h", C.help)}</defs>
        ${bodySvg()}
        <g>${side}<g ${MIRROR}>${side}</g>${set.center.map(shape).join("")}</g>
    </svg>`;
}

/** Levels from { primary, secondary } lists. */
export function levelsOf(muscles = {}) {
    const levels = {};
    for (const m of muscles.secondary || []) levels[m] = "secondary";
    for (const m of muscles.primary || []) levels[m] = "primary";
    return levels;
}

/** Front + back and the chips, as one block. Empty string with nothing to show. */
export function muscleMapHtml(muscles = {}, { id = "mm", title = "Muscles worked" } = {}) {
    if (!muscles.primary?.length) return "";
    const levels = levelsOf(muscles);
    const chip = (m, level) => `<li class="mm-chip is-${level}">${esc(MUSCLE_LABELS[m] || m)}</li>`;
    return `
        <section class="mm" aria-label="${esc(title)}">
            ${title ? `<h3 class="mm-title">${esc(title)}</h3>` : ""}
            <div class="mm-figs">
                <figure>${muscleMapSvg(levels, { view: "front", id: `${id}f` })}<figcaption>Front</figcaption></figure>
                <figure>${muscleMapSvg(levels, { view: "back", id: `${id}b` })}<figcaption>Back</figcaption></figure>
            </div>
            <ul class="mm-chips">
                ${muscles.primary.map(m => chip(m, "primary")).join("")}
                ${(muscles.secondary || []).map(m => chip(m, "secondary")).join("")}
            </ul>
        </section>`;
}

/** What a whole workout worked: main anywhere = main; exercises with no sets done don't count. */
export function workoutMuscles(exercises = []) {
    const primary = new Set(), secondary = new Set();
    for (const ex of exercises || []) {
        const sets = ex.sets || [];
        if (sets.length && !sets.some(s => s.done !== false)) continue;
        const m = musclesFor(ex.name, ex);
        m.primary.forEach(x => primary.add(x));
        m.secondary.forEach(x => secondary.add(x));
    }
    return { primary: [...primary], secondary: [...secondary].filter(x => !primary.has(x)) };
}

export function ensureMuscleMapStyles() {
    if (typeof document === "undefined" || document.querySelector('link[href$="css/muscle-map.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/muscle-map.css";
    document.head.appendChild(link);
}
