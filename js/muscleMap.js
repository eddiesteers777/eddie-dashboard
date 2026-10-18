/* ==========================================
   Southbound — the muscle map (pure)

   An anatomical body, front and back, with the muscles an exercise or a
   whole workout worked, in Southbound's colours: the main ones in tan, the
   ones helping in sage, the rest a quiet forest. Apart from the moving
   figure (js/demoFigure.js): this is the at-a-glance diagram, that's the video.

   The shapes follow real anatomy, grouped into the 17 names of
   js/exerciseMuscles.js: e.g. "abdominals" = the six-pack and the
   obliques, "abductors" = the outer hip (TFL in front, glute medius
   behind), "calves" = gastrocnemius and soleus (plus the shin in front).

   muscleMapSvg(levels, { view, id })   one view as an <svg>
       levels  { muscle: "primary" | "secondary" } (js/exerciseMuscles.js names)
   muscleMapHtml(muscles, { id, title }) both views + the chips under them
   workoutMuscles(exercises)             { primary, secondary } for a workout:
       a muscle is main when it's main in any exercise with sets done.
   ensureMuscleMapStyles()               loads css/muscle-map.css once.
========================================== */

import { musclesFor, MUSCLE_LABELS } from "./exerciseMuscles.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const W = 200, H = 424;
const LOOKS = {
    // A: an anatomy plate. Every muscle drawn, the worked ones lit.
    plate: {
        outline: "#CDBF9F", outlineW: 1.6,
        body: ["#1C3428", "#132A1F"],
        idle: "#2A4636", idleStroke: "#10251B", idleW: 1.1,
        detail: "rgba(205,191,159,.24)",
        glow: true
    },
    // B: a clean silhouette. Muscles only as fine contours until they're lit.
    clean: {
        outline: "#94B89D", outlineW: 1.2,
        body: ["#20392C", "#162D22"],
        idle: "rgba(0,0,0,0)", idleStroke: "rgba(205,191,159,.20)", idleW: .8,
        detail: "rgba(205,191,159,.10)",
        glow: false
    }
};
const LIT = {
    primary: ["#F1DCB4", "#D6B98E", "#A9895F"],
    secondary: ["#C6DCC6", "#A0BB9C", "#6F9478"]
};

// The body's viewer-left half, closed along the middle (x = 100), mirrored
// for the other half. Same outline front and back.
// The foot, from the outer ankle round to the inner ankle. Front: a foot
// turned out a little, with five toes. Back: the heel and the sides of the foot.
const FOOT = {
    front: "C 74 391 69 396 64.5 400 L 62.5 403 C 60.6 406.3 63.7 408.1 65.6 404.8 C 63.7 408.1 67.1 410.1 69 406.8 C 67.1 410.1 70.8 412.2 72.7 408.9 C 70.8 412.2 74.8 414.5 76.7 411.2 C 74.4 415.1 79.8 418.2 82.1 414.3 C 86 411 89.5 403 90 395 C 90.5 391 89.5 387 89 383.1",
    back: "C 74 390.5 73 396 72.6 401 C 72.2 406.5 73 410.8 77.5 411.6 C 81 412.2 85.6 411.8 87.4 408.6 C 88.8 405 88.8 400 88.6 395 C 88.5 390 88.8 386 89 383.1"
};
const halfFor = view => `M 100 8 C 88 8 81 18 81 32 C 81 44 85 53 90 58 L 90 65.4 C 84 70.3 72 72.7 62 75.2 C 51 78.6 46 87.4 45 98.8 C 43 111.1 41 125.1 40 137.4 C 39 146.1 38 152.3 37 158.4 C 34 174.2 31 191.7 30 209.2 C 28.5 214.5 27 219 26.2 224 C 25.4 230 25.2 236 25.6 240.5 C 25.8 246 29 246.8 29.2 242.6 C 29.3 248.6 32.5 249.4 32.6 244 C 32.7 250.8 36 251.3 36.1 244.6 C 36.2 250 38.8 249.6 39 243.5 C 40.8 243.5 43.4 241.5 43.5 237 C 43.7 233 43.2 230 42.8 226 C 43.2 220 43.7 214 44 209.2 C 47 193.5 51 177.7 53 161.9 C 54 154 55 146.1 56 137.4 C 57 126.8 60 117.2 63 110.2 C 64 128.6 66 146.1 68 165.4 C 66 177.7 62 190 60 204 C 58 227.4 60 255.4 64 277.9 C 66 287.3 67 295.2 66 305.6 C 63 322.4 64 341.2 70 362.1 C 73 372.6 75 378.9 75 385.2 ${FOOT[view]} C 90 364.2 93 343.3 94 324.5 C 95 311.9 94 301.5 93 293.1 C 95 270.4 97 244.2 98 219.9 L 100 218 Z`;

// Thin anatomical lines that aren't muscles (kneecap, collarbone, spine).
const DETAIL = {
    front: [
        `<path d="M65.6 404.8 L67.3 401.8 M69 406.8 L70.7 403.8 M72.7 408.9 L74.4 405.9 M76.7 411.2 L78.4 408.2"/>`,
        `<path d="M29.2 242.6 L29.4 234 M32.6 244 L32.8 234 M36.1 244.6 L36.2 234 M39 243.5 L39.8 229"/>`,
        `<path d="M 66 77.8 C 76 76 86 76 96 77.8"/>`,
        `<path d="M 79 289.1 C 82 283.5 89 283.5 91 289.1 C 90 297.3 82 298.3 79 289.1 Z"/>`
    ],
    back: [
        `<path d="M29.2 242.6 L29.4 234 M32.6 244 L32.8 234 M36.1 244.6 L36.2 234 M39 243.5 L39.8 229"/>`,
        `<path d="M 100 64.5 L 100 137.4"/>`,
        `<path d="M 70 289.1 C 78 293.1 86 293.1 92 289.1"/>`
    ]
};

// Muscle shapes on the viewer-left half: [muscle or "" (never lit), path d].
const FRONT = [
    ["neck", "M 91 58.8 C 93 64.5 96 71.1 98 76.9 L 95 76.9 C 92 71.1 90 65.4 90 60.5 Z"],
    ["traps", "M 90 64.5 C 85 69.5 75 72.7 64 75.2 C 73 76.9 83 76.9 92 75.2 C 91 71.9 90 67.8 90 64.5 Z"],
    ["shoulders", "M 62 76.9 C 52 78.6 46 87.4 46 98.8 C 46 107.6 47 114.6 49 119 C 54 110.2 59 100.5 67 92.7 C 67 85.6 66 80.4 62 76.9 Z"],
    ["chest", "M 98 80.4 C 88 78.6 76 79.5 68 90 C 64 97 63 104 65 110.2 C 73 117.2 87 119 98 114.6 Z"],
    ["", "M 64 111.9 L 72 115.4 L 66 119.8 Z M 66 121.6 L 73 125.1 L 67 129.5 Z"],
    ["biceps", "M 53 112.8 C 47 121.6 45 135.6 46 147.9 C 48 153.1 53 151.4 54 144.4 C 56 133.9 57 121.6 53 112.8 Z"],
    ["", "M 46 104 C 43 114.6 42 128.6 42 140.9 C 43 145.2 45 144.4 45 137.4 C 45 126.8 46 114.6 47 104.9 Z"],
    ["forearms", "M 40 161 C 35 175 33 190.8 33 206.6 C 36 210.1 40 208.4 42 203.1 C 46 189.1 50 175 52 164.5 C 48 157.5 43 157.5 40 161 Z"],
    ["abdominals", "M 88 120.7 C 88 119 98 118.1 98 119.8 L 98 134.7 L 88 135.6 Z"],
    ["abdominals", "M 88 138.2 L 98 138.2 L 98 154 L 88 154 Z"],
    ["abdominals", "M 88 156.6 L 98 156.6 L 98 174.2 L 88 173.3 Z"],
    ["abdominals", "M 88 176.8 L 98 177.7 L 98 205.7 C 94 204 90 195.2 88 186.4 Z"],
    ["abdominals", "M 67 120.7 C 73 123.3 80 126.8 85 130.3 L 85 177.7 C 80 186.4 73 192.6 65 197 C 67 182.9 69 170.7 69 161 C 69 147 68 133.9 67 120.7 Z"],
    ["abductors", "M 62 192.6 C 60 201.3 60 210.1 62 218.9 C 66 213.6 70 204.9 72 196.1 C 70 190.8 66 189.1 62 192.6 Z"],
    ["quadriceps", "M 61 219.9 C 59 240.5 60 264.8 66 285.4 C 70 289.1 74 283.5 74 272.3 C 74 253.6 72 233 68 216.2 Z"],
    ["quadriceps", "M 70 212.7 C 70 207.5 80 205.7 82 211 C 86 229.2 88 253.6 86 274.2 C 84 283.5 76 285.4 74 276 C 72 255.4 70 233 70 212.7 Z"],
    ["quadriceps", "M 87 257.3 C 82 266.7 80 278.8 83 288.2 C 87 292 93 289.1 94 281.6 C 95 272.3 93 262.9 87 257.3 Z"],
    ["adductors", "M 98 220.8 C 91 225.5 85 236.7 85 252.6 C 87 258.2 90 257.3 93 251.7 C 96 240.5 98 230.2 98 220.8 Z"],
    ["calves", "M 66 313 C 63 323.4 64 336 67 346.5 C 69 337 69 323.4 66 313 Z"],
    ["calves", "M 69 308.8 C 67 324.5 69 343.3 74 364.2 C 76 367.4 79 363.2 79 355.9 C 79 337 78 322.4 76 306.7 Z"],
    ["calves", "M 88 301.5 C 94 314 95 332.9 91 355.9 C 87 351.7 84 334.9 84 318.2 C 84 309.8 85 303.6 88 301.5 Z"]
];
const BACK = [
    ["neck", "M 95 56 L 100 56 L 100 64.5 L 93 66.2 Z"],
    ["traps", "M 100 59.6 C 96 64.5 92 69.5 84 72.7 C 74 76 66 77.8 62 79.5 C 72 83 84 89.1 92 100.5 C 96 114.6 98 128.6 100 139.1 Z"],
    ["shoulders", "M 61 79.5 C 52 81.3 46 89.1 46 99.7 C 46 108.4 47 114.6 49 119 C 54 108.4 60 97.9 68 90.9 C 68 85.6 66 82.1 61 79.5 Z"],
    ["middle back", "M 70 90.9 C 78 92.7 86 97.9 90 104.9 C 90 112.8 87 119.8 81 123.3 C 75 118.1 69 107.6 67 97.9 Z"],
    ["lats", "M 66 110.2 C 68 128.6 70 144.4 73 160.1 C 78 172.4 85 181.2 91 186.4 C 92 172.4 91 158.4 91 146.1 C 86 137.4 80 130.3 76 126 C 72 122.5 68 117.2 66 110.2 Z"],
    ["lower back", "M 93 137.4 C 92 156.6 92 175.9 93 192.6 C 95 197 99 195.2 99 190 L 99 137.4 C 97 133.9 95 133.9 93 137.4 Z"],
    ["triceps", "M 47 101.4 C 43 113.7 42 129.5 43 143.5 C 46 152.3 52 151.4 55 142.6 C 57 130.3 56 116.3 54 106.7 C 52 101.4 49 99.7 47 101.4 Z"],
    ["forearms", "M 40 161 C 35 175 33 190.8 33 206.6 C 36 210.1 40 208.4 42 203.1 C 46 189.1 50 175 52 164.5 C 48 157.5 43 157.5 40 161 Z"],
    ["abductors", "M 63 187.3 C 61 195.2 62 203.1 65 207.5 C 72 200.5 82 195.2 93 192.6 C 86 186.4 74 183.8 63 187.3 Z"],
    ["glutes", "M 66 209.2 C 61 220.8 63 233 71 238.6 C 81 243.3 94 241.4 98 233.9 L 98 200.5 C 92 194.3 80 196.1 66 209.2 Z"],
    ["hamstrings", "M 62 240.5 C 60 261.1 62 279.8 69 295.2 C 74 295.2 78 287.3 78 272.3 C 78 257.3 77 246.1 74 238.6 C 70 236.7 65 236.7 62 240.5 Z"],
    ["hamstrings", "M 79 242.3 C 80 259.2 81 276 85 291 C 89 295.2 94 289.1 95 277.9 C 96 262.9 95 249.8 92 240.5 C 88 236.7 82 236.7 79 242.3 Z"],
    ["adductors", "M 97 237.7 C 93 245.1 93 258.2 95 265.7 C 97 260.1 98 250.8 98 239.5 Z"],
    ["calves", "M 67 305.6 C 63 318.2 63 332.9 69 345.4 C 74 343.3 78 332.9 78 318.2 C 77 309.8 72 301.5 67 305.6 Z"],
    ["calves", "M 80 305.6 C 80 320.3 82 337 87 347.5 C 92 341.2 95 324.5 93 311.9 C 89 301.5 83 301.5 80 305.6 Z"],
    ["calves", "M 71 348.5 C 74 360.1 78 372.6 81 381 C 85 372.6 88 360.1 88 350.6 C 82 355.9 76 355.9 71 348.5 Z"]
];

const MIRROR = `transform="matrix(-1 0 0 1 ${W} 0)"`;
const both = inner => `${inner}<g ${MIRROR}>${inner}</g>`;

function bodySvg(look, id, view) {
    // The outline is the same shape drawn a little fatter underneath, so
    // the seam down the middle never shows.
    const half = `<path d="${halfFor(view)}"/>`;
    return `<g fill="${look.outline}" stroke="${look.outline}" stroke-width="${look.outlineW * 2}" stroke-linejoin="round">${both(half)}</g>
        <g fill="url(#${id}body)">${both(half)}</g>`;
}

/** One view of the map: "front" or "back". */
export function muscleMapSvg(levels = {}, { view = "front", id = "mm", label = "", look: lookName = "plate" } = {}) {
    const look = LOOKS[lookName] || LOOKS.plate;
    const set = view === "back" ? BACK : FRONT;
    const levelOf = muscle => (muscle && (levels[muscle] === "primary" || levels[muscle] === "secondary")) ? levels[muscle] : "";
    const shape = ([muscle, d]) => {
        const level = levelOf(muscle);
        if (!level) return `<path d="${d}" fill="${look.idle}" stroke="${look.idleStroke}" stroke-width="${look.idleW}"/>`;
        const key = level === "primary" ? "m" : "h";
        return `<path d="${d}" fill="url(#${id}${key})" stroke="${look.idleStroke}" stroke-width="${look.idleW}" data-muscle="${esc(muscle)}" data-level="${level}"/>`;
    };
    const lit = set.filter(([m]) => levelOf(m));
    const glow = look.glow && lit.length
        ? `<g filter="url(#${id}glow)" opacity=".55">${both(lit.map(([m, d]) => `<path d="${d}" fill="${LIT[levelOf(m)][1]}"/>`).join(""))}</g>`
        : "";
    const grad = (key, [a, b, c]) => `<linearGradient id="${id}${key}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label || `Muscles worked, ${view}`)}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="${id}body" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0" stop-color="${look.body[0]}"/><stop offset="1" stop-color="${look.body[1]}"/></linearGradient>
            ${grad("m", LIT.primary)}${grad("h", LIT.secondary)}
            <filter id="${id}glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter>
        </defs>
        ${bodySvg(look, id, view === "back" ? "back" : "front")}
        ${glow}
        <g stroke-linejoin="round">${both(set.map(shape).join(""))}</g>
        <g fill="none" stroke="${look.detail}" stroke-width=".9" stroke-linecap="round">${both(DETAIL[view === "back" ? "back" : "front"].join(""))}</g>
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
export function muscleMapHtml(muscles = {}, { id = "mm", title = "Muscles worked", look } = {}) {
    if (!muscles.primary?.length) return "";
    const levels = levelsOf(muscles);
    const chip = (m, level) => `<li class="mm-chip is-${level}">${esc(MUSCLE_LABELS[m] || m)}</li>`;
    return `
        <section class="mm" aria-label="${esc(title)}">
            ${title ? `<h3 class="mm-title">${esc(title)}</h3>` : ""}
            <div class="mm-figs">
                <figure>${muscleMapSvg(levels, { view: "front", id: `${id}f`, look })}<figcaption>Front</figcaption></figure>
                <figure>${muscleMapSvg(levels, { view: "back", id: `${id}b`, look })}<figcaption>Back</figcaption></figure>
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
