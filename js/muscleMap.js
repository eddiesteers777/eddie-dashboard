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

const W = 200, H = 440;
const LOOKS = {
    // A: an anatomy plate. Every muscle drawn, the worked ones lit.
    plate: {
        outline: "#CDBF9F", outlineW: 1.6,
        body: ["#1C3428", "#132A1F"],
        idle: "#2A4636", idleStroke: "#10251B", idleW: 1.1,
        detail: "rgba(205,191,159,.16)",
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
const HALF = `M100 8 C88 8 81 18 81 32 C81 44 85 53 90 58 L90 67 C84 73 72 76 62 79
    C51 83 46 93 45 106 C43 120 41 136 40 150 C39 160 38 167 37 174
    C34 192 31 212 30 232 C29 241 27 249 27 257 C27 267 32 273 37 271 C42 269 42 259 41 249
    C42 241 43 236 44 232 C47 214 51 196 53 178 C54 169 55 160 56 150 C57 138 60 127 63 119
    C64 140 66 160 68 182 C66 196 62 210 60 226 C58 252 60 282 64 306 C66 316 67 324 66 334
    C63 350 64 368 70 388 C73 398 75 404 75 410 C70 416 66 424 71 428 L91 428
    C93 421 91 414 89 408 C90 390 93 370 94 352 C95 340 94 330 93 322
    C95 298 97 270 98 244 L100 242 Z`;

// Thin anatomical lines that aren't muscles (kneecap, collarbone, spine).
const DETAIL = {
    front: [
        `<path d="M66 82 C76 80 86 80 96 82"/>`,
        `<path d="M79 318 C82 312 89 312 91 318 C90 326 82 327 79 318 Z"/>`
    ],
    back: [
        `<path d="M100 66 L100 150"/>`,
        `<path d="M70 318 C78 322 86 322 92 318"/>`
    ]
};

// Muscle shapes on the viewer-left half: [muscle or "" (never lit), path d].
const FRONT = [
    ["neck", "M91 59 C93 66 96 74 98 81 L95 81 C92 74 90 67 90 61 Z"],
    ["traps", "M90 66 C85 72 75 76 64 79 C73 81 83 81 92 79 C91 75 90 70 90 66 Z"],
    ["shoulders", "M62 81 C52 83 46 93 46 106 C46 116 47 124 49 129 C54 119 59 108 67 99 C67 91 66 85 62 81 Z"],
    ["chest", "M98 85 C88 83 76 84 68 96 C64 104 63 112 65 119 C73 127 87 129 98 124 Z"],
    ["", "M64 121 L72 125 L66 130 Z M66 132 L73 136 L67 141 Z"],
    ["biceps", "M53 122 C47 132 45 148 46 162 C48 168 53 166 54 158 C56 146 57 132 53 122 Z"],
    ["", "M46 112 C43 124 42 140 42 154 C43 159 45 158 45 150 C45 138 46 124 47 113 Z"],
    ["forearms", "M40 177 C35 193 33 211 33 229 C36 233 40 231 42 225 C46 209 50 193 52 181 C48 173 43 173 40 177 Z"],
    ["abdominals", "M88 131 C88 129 98 128 98 130 L98 147 L88 148 Z"],
    ["abdominals", "M88 151 L98 151 L98 169 L88 169 Z"],
    ["abdominals", "M88 172 L98 172 L98 192 L88 191 Z"],
    ["abdominals", "M88 195 L98 196 L98 228 C94 226 90 216 88 206 Z"],
    ["abdominals", "M67 131 C73 134 80 138 85 142 L85 196 C80 206 73 213 65 218 C67 202 69 188 69 177 C69 161 68 146 67 131 Z"],
    ["abductors", "M62 213 C60 223 60 233 62 243 C66 237 70 227 72 217 C70 211 66 209 62 213 Z"],
    ["quadriceps", "M61 244 C59 266 60 292 66 314 C70 318 74 312 74 300 C74 280 72 258 68 240 Z"],
    ["quadriceps", "M70 236 C70 230 80 228 82 234 C86 254 88 280 86 302 C84 312 76 314 74 304 C72 282 70 258 70 236 Z"],
    ["quadriceps", "M87 284 C82 294 80 307 83 317 C87 321 93 318 94 310 C95 300 93 290 87 284 Z"],
    ["adductors", "M98 245 C91 250 85 262 85 279 C87 285 90 284 93 278 C96 266 98 255 98 245 Z"],
    ["calves", "M66 341 C63 351 64 363 67 373 C69 364 69 351 66 341 Z"],
    ["calves", "M69 337 C67 352 69 370 74 390 C76 393 79 389 79 382 C79 364 78 350 76 335 Z"],
    ["calves", "M88 330 C94 342 95 360 91 382 C87 378 84 362 84 346 C84 338 85 332 88 330 Z"]
];
const BACK = [
    ["neck", "M95 56 L100 56 L100 66 L93 68 Z"],
    ["traps", "M100 60 C96 66 92 72 84 76 C74 80 66 82 62 84 C72 88 84 95 92 108 C96 124 98 140 100 152 Z"],
    ["shoulders", "M61 84 C52 86 46 95 46 107 C46 117 47 124 49 129 C54 117 60 105 68 97 C68 91 66 87 61 84 Z"],
    ["middle back", "M70 97 C78 99 86 105 90 113 C90 122 87 130 81 134 C75 128 69 116 67 105 Z"],
    ["lats", "M66 119 C68 140 70 158 73 176 C78 190 85 200 91 206 C92 190 91 174 91 160 C86 150 80 142 76 137 C72 133 68 127 66 119 Z"],
    ["lower back", "M93 150 C92 172 92 194 93 213 C95 218 99 216 99 210 L99 150 C97 146 95 146 93 150 Z"],
    ["triceps", "M47 109 C43 123 42 141 43 157 C46 167 52 166 55 156 C57 142 56 126 54 115 C52 109 49 107 47 109 Z"],
    ["forearms", "M40 177 C35 193 33 211 33 229 C36 233 40 231 42 225 C46 209 50 193 52 181 C48 173 43 173 40 177 Z"],
    ["abductors", "M63 207 C61 216 62 225 65 230 C72 222 82 216 93 213 C86 206 74 203 63 207 Z"],
    ["glutes", "M66 232 C61 245 63 258 71 264 C81 269 94 267 98 259 L98 222 C92 215 80 217 66 232 Z"],
    ["hamstrings", "M62 266 C60 288 62 308 69 324 C74 324 78 316 78 300 C78 284 77 272 74 264 C70 262 65 262 62 266 Z"],
    ["hamstrings", "M79 268 C80 286 81 304 85 320 C89 324 94 318 95 306 C96 290 95 276 92 266 C88 262 82 262 79 268 Z"],
    ["adductors", "M97 263 C93 271 93 285 95 293 C97 287 98 277 98 265 Z"],
    ["calves", "M67 334 C63 346 63 360 69 372 C74 370 78 360 78 346 C77 338 72 330 67 334 Z"],
    ["calves", "M80 334 C80 348 82 364 87 374 C92 368 95 352 93 340 C89 330 83 330 80 334 Z"],
    ["calves", "M71 375 C74 386 78 398 81 406 C85 398 88 386 88 377 C82 382 76 382 71 375 Z"]
];

const MIRROR = `transform="matrix(-1 0 0 1 ${W} 0)"`;
const both = inner => `${inner}<g ${MIRROR}>${inner}</g>`;

function bodySvg(look, id) {
    // The outline is the same shape drawn a little fatter underneath, so
    // the seam down the middle never shows.
    const half = `<path d="${HALF}"/>`;
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
            <linearGradient id="${id}body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${look.body[0]}"/><stop offset="1" stop-color="${look.body[1]}"/></linearGradient>
            ${grad("m", LIT.primary)}${grad("h", LIT.secondary)}
            <filter id="${id}glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter>
        </defs>
        ${bodySvg(look, id)}
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
