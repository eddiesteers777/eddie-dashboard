// Builds the Southbound reaction emojis in emoji/*.svg.
// Run: node scripts/build-emoji.mjs
//
// One illustrator, one rule book: a 64x64 canvas, the same thick
// deep-forest outline, the brand palette (tan, cream, sage, stone,
// forest) with a few muted accents, and the SB speed streaks as the
// family signature. Hand-drawn vectors, so they stay crisp from 20px
// to 128px and work offline. The list of emojis (IDs, labels,
// categories) lives in js/emoji.js; this file only draws them.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, "emoji");

// ---- The rule book ----
const INK = "#0F2019";      // outline (the app's --bg)
const W = 3.5;              // outline weight
const TAN = "#C9AD84";
const TAN_D = "#AE9068";    // tan in shadow
const CREAM = "#F2EEE4";
const STONE = "#E3DDD0";
const SAGE = "#8FA388";
const SAGE_D = "#6F8769";
const FOREST = "#173226";
const FLAME = "#E07A3F";
const FLAME_L = "#F2B35E";
const WATER = "#7FB2CF";
const GOLD = "#D8A444";

const line = `stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"`;
const ink = (extra = "") => `fill="none" ${line}${extra}`;

// Composite shapes get one clean outer outline: draw every piece with
// a doubled stroke first, then every fill on top.
function outlined(pieces) {
    const back = pieces.map(p => p.replace("/>", ` stroke="${INK}" stroke-width="${W * 2}" stroke-linejoin="round" stroke-linecap="round"/>`)).join("");
    return back + pieces.join("");
}

// The family signature: three speed streaks on the left.
const streaks = (x = 4, y = 26, color = TAN) => `
    <path d="M${x + 4} ${y}h9M${x} ${y + 7}h12M${x + 5} ${y + 14}h8" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`;

// A face: tan disc, shaded lower edge, outline.
const face = (inner, { cx = 32, cy = 33, r = 25 } = {}) => `
    <clipPath id="f"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${TAN}"/>
    <circle cx="${cx + 7}" cy="${cy + 9}" r="${r}" fill="${TAN_D}" opacity=".45" clip-path="url(#f)"/>
    ${inner}
    <circle cx="${cx}" cy="${cy}" r="${r}" ${ink()}/>`;

const eyeDot = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="3.4" fill="${INK}"/>`;
const drop = (x, y, s = 1) => `<path d="M${x} ${y}c${-3 * s} ${4.5 * s} ${-4.5 * s} ${6.5 * s} ${-4.5 * s} ${8.5 * s}a${4.5 * s} ${4.5 * s} 0 0 0 ${9 * s} 0c0 ${-2 * s} ${-1.5 * s} ${-4 * s} ${-4.5 * s} ${-8.5 * s}z" fill="${WATER}" ${line}/>`;

// ---- The SB mark, read from brand/sb-mark.svg (never redrawn by hand) ----
const markSvg = readFileSync(join(root, "brand/sb-mark.svg"), "utf8");
const markInner = markSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

// ---- The emojis ----
const EMOJI = {
    // Training
    sb_locked_in: face(`
        <clipPath id="band"><circle cx="32" cy="33" r="25"/></clipPath>
        <rect x="4" y="15" width="56" height="9" fill="${FOREST}" clip-path="url(#band)"/>
        <path d="M38 24.5L44 14.5" stroke="${TAN}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M17 29l9 3M47 29l-9 3" ${ink()}/>
        ${eyeDot(23, 36)}${eyeDot(41, 36)}
        <path d="M25 47h14" ${ink()}/>
        <path d="M6 23.5h52" ${ink()} clip-path="url(#band)"/><path d="M6 15.5h52" ${ink()} clip-path="url(#band)"/>`),

    sb_lets_go: streaks(1, 22) + face(`
        <path d="M20 33q4-6 8 0M36 33q4-6 8 0" ${ink()}/>
        <path d="M21 40h22q0 12-11 12t-11-12z" fill="${INK}"/>
        <path d="M26 48.5q6-4 12 0q-3 3-6 3t-6-3z" fill="${FLAME}"/>`, { cx: 35 }),

    sb_strong: `<g transform="rotate(-22 32 32)">${outlined([
        `<rect x="14" y="29" width="36" height="6" rx="2" fill="${STONE}"/>`,
        `<rect x="7" y="18" width="9" height="28" rx="3.5" fill="${TAN}"/>`,
        `<rect x="48" y="18" width="9" height="28" rx="3.5" fill="${TAN}"/>`,
        `<rect x="2" y="23" width="6" height="18" rx="2.5" fill="${TAN_D}"/>`,
        `<rect x="56" y="23" width="6" height="18" rx="2.5" fill="${TAN_D}"/>`
    ])}</g>`,

    sb_long_run: streaks(0, 24) + outlined([
        `<path d="M14 42h38q9 0 9 4.5T52 51H18q-4 0-4-4.5z" fill="${CREAM}"/>`,
        `<path d="M16 43V28q0-5 5-5h5q2 7 9 7h4q14 0 19 10.5q1 2.5-1.5 2.5z" fill="${TAN}"/>`
    ]) + `
        <path d="M30 30.5l3-5M35.5 30.5l2.5-4.5M41 31l2-4" stroke="${CREAM}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M22 41l12-8" stroke="${FOREST}" stroke-width="3" stroke-linecap="round"/>`,

    sb_big_effort: `
        <path d="M32 5c6 10 19 17 19 33c0 12-9 20-19 20s-19-8-19-20c0-8 5-13 8-18c1 7 4 10 7 11c-2-9-1-17 4-26z" fill="${FLAME}" ${line}/>
        <path d="M32 31c4 6 9 9 9 15c0 6-4 9.5-9 9.5s-9-3.5-9-9.5c0-5 4-8 9-15z" fill="${FLAME_L}"/>`,

    sb_trail: `
        <circle cx="48" cy="15" r="6" fill="${GOLD}" ${line}/>
        <path d="M3 52l17-26l8 10l10-17l23 33z" fill="${SAGE}" ${line}/>
        <path d="M33 26.5l5-7.5l5 7.5l-3 2l-2-2l-2 2z" fill="${CREAM}" ${line}/>
        <clipPath id="hill"><path d="M3 52l17-26l8 10l10-17l23 33z"/></clipPath>
        <path d="M22 54q10-7 3-12t6-10" fill="none" stroke="${CREAM}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="5 4" clip-path="url(#hill)"/>
        <path d="M3 52l17-26l8 10l10-17l23 33z" ${ink()}/>`,

    sb_soccer: (() => {
        const cx = 36, cy = 32, r = 23, pr = 7.5;
        const pts = [...Array(5)].map((_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [cx + pr * Math.cos(a), cy + pr * Math.sin(a), a]; });
        const pent = pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");
        const spokes = pts.map(([x, y, a]) => `M${x.toFixed(1)} ${y.toFixed(1)}L${(cx + (r - 1) * Math.cos(a)).toFixed(1)} ${(cy + (r - 1) * Math.sin(a)).toFixed(1)}`).join("");
        return streaks(0, 21) + `
        <clipPath id="ball"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${CREAM}"/>
        <circle cx="${cx + 7}" cy="${cy + 8}" r="${r}" fill="${STONE}" clip-path="url(#ball)"/>
        <path d="${spokes}" stroke="${INK}" stroke-width="2.4" clip-path="url(#ball)"/>
        <path d="M${pent}Z" fill="${FOREST}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
        ${pts.map(([, , a]) => { const ex = cx + (r + 1.5) * Math.cos(a), ey = cy + (r + 1.5) * Math.sin(a); return `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" fill="${FOREST}" clip-path="url(#ball)"/>`; }).join("")}
        <circle cx="${cx}" cy="${cy}" r="${r}" ${ink()}/>`;
    })(),

    // Recovery
    sb_easy_day: face(`
        <path d="M19 34q4 4 8 0M37 34q4 4 8 0" ${ink()}/>
        <path d="M24 44q8 6 16 0" ${ink()}/>
        <ellipse cx="18" cy="41" rx="3.5" ry="2.2" fill="${FLAME}" opacity=".35"/><ellipse cx="46" cy="41" rx="3.5" ry="2.2" fill="${FLAME}" opacity=".35"/>`),

    sb_recovery: `
        <path d="M11 53C9 31 25 12 54 9c2 27-13 45-43 44z" fill="${SAGE}" ${line}/>
        <path d="M11 53C22 40 32 30 45 19" fill="none" stroke="${SAGE_D}" stroke-width="3" stroke-linecap="round"/>
        <path d="M24 40l-1-9M31 33l0-9M38 27l2-8M28 37l9 1M35 30l9 1" fill="none" stroke="${SAGE_D}" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M11 53C9 31 25 12 54 9c2 27-13 45-43 44z" ${ink()}/>`,

    sb_sleep: face(`
        <path d="M16 37q5 3 9 0M33 37q5 3 9 0" ${ink()}/>
        <ellipse cx="29" cy="47" rx="3" ry="3.5" fill="${INK}"/>`, { cx: 29, cy: 36, r: 24 }) + `
        <path d="M52 5a11 11 0 1 0 8 17a9 9 0 0 1-8-17z" fill="${CREAM}" ${line}/>`,

    sb_hydrate: outlined([
        `<rect x="18" y="16" width="24" height="42" rx="7" fill="${CREAM}"/>`,
        `<rect x="22" y="7" width="16" height="10" rx="3" fill="${TAN}"/>`
    ]) + `
        <clipPath id="bottle"><rect x="18" y="16" width="24" height="42" rx="7"/></clipPath>
        <path d="M16 34q7-4 14 0t14 0V60H16z" fill="${WATER}" clip-path="url(#bottle)"/>
        <rect x="18" y="16" width="24" height="42" rx="7" ${ink()}/>
        <path d="M18 24h24" ${ink()}/>
        ${drop(52, 26, 0.9)}`,

    sb_fuel: `
        <path d="M17 12l4 3.5l4-3.5l4 3.5l4-3.5l4 3.5l4-3.5l4 3.5l2-1.5V54q0 4-4 4H19q-4 0-4-4V13.5z" fill="${TAN}" ${line}/>
        <path d="M15 21h34" ${ink()}/>
        <path d="M35 25L24 40h8l-3 12l11-16h-8z" fill="${CREAM}" ${line}/>`,

    // Coach
    sb_southbound: `
        <circle cx="32" cy="32" r="28" fill="${FOREST}" stroke="${TAN}" stroke-width="${W}"/>
        <circle cx="32" cy="32" r="29.8" fill="none" stroke="${INK}" stroke-width="1.6"/>
        <g transform="translate(9.5 17.7) scale(0.242)">${markInner}</g>`,

    sb_great_work: `
        <path d="M32 7l7.4 15.3l16.8 2.4l-12.2 11.8l2.9 16.7L32 45.3l-14.9 7.9l2.9-16.7L7.8 24.7l16.8-2.4z" fill="${GOLD}" ${line}/>
        <path d="M32 17l3.6 7.5l-3.6 13.5z" fill="${CREAM}" opacity=".55"/>
        <path d="M54 50l3 3M58 44h4M10 50l-3 3M6 44H2" stroke="${TAN}" stroke-width="3" stroke-linecap="round"/>`,

    sb_coach_eye: `
        <path d="M4 33q28-30 56 0q-28 28-56 0z" fill="${CREAM}" ${line}/>
        <clipPath id="eye"><path d="M4 33q28-30 56 0q-28 28-56 0z"/></clipPath>
        <circle cx="32" cy="32" r="12" fill="${TAN}" clip-path="url(#eye)"/>
        <circle cx="32" cy="32" r="12" fill="none" stroke="${INK}" stroke-width="2.6" clip-path="url(#eye)"/>
        <circle cx="32" cy="32" r="5.5" fill="${INK}"/>
        <circle cx="35" cy="29" r="2" fill="${CREAM}"/>
        <path d="M4 33q28-30 56 0q-28 28-56 0z" ${ink()}/>
        <path d="M14 13l3 5M32 8v6M50 13l-3 5" stroke="${TAN}" stroke-width="3.2" stroke-linecap="round"/>`,

    sb_check: `
        <circle cx="32" cy="32" r="26" fill="${SAGE}" ${line}/>
        <path d="M19 33l9 9l18-19" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19 33l9 9l18-19" fill="none" stroke="${CREAM}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`,

    sb_adjust: [[16, 40], [32, 18], [48, 32]].map(([y, x]) => `
        <path d="M8 ${y}h48" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        <path d="M8 ${y}h48" stroke="${STONE}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${x}" cy="${y}" r="6.5" fill="${TAN}" ${line}/>`).join(""),

    sb_high_five: `<g transform="rotate(12 32 34)">${outlined([
        `<rect x="16" y="28" width="30" height="28" rx="11" fill="${TAN}"/>`,
        `<rect x="17" y="13" width="7" height="26" rx="3.5" fill="${TAN}"/>`,
        `<rect x="25" y="8" width="7" height="30" rx="3.5" fill="${TAN}"/>`,
        `<rect x="33" y="10" width="7" height="28" rx="3.5" fill="${TAN}"/>`,
        `<rect x="41" y="16" width="6.5" height="24" rx="3.25" fill="${TAN}"/>`,
        `<rect x="6" y="34" width="7" height="20" rx="3.5" fill="${TAN}" transform="rotate(-38 9.5 44)"/>`
    ])}
        <path d="M24 38v-6M32 38v-6M40 38v-5" stroke="${TAN_D}" stroke-width="2.4" stroke-linecap="round"/></g>
        <path d="M6 14l5 4M3 24h6M12 6l3 5" stroke="${TAN}" stroke-width="3" stroke-linecap="round"/>`,

    sb_scheduled: outlined([
        `<rect x="8" y="12" width="48" height="44" rx="7" fill="${CREAM}"/>`
    ]) + `
        <clipPath id="cal"><rect x="8" y="12" width="48" height="44" rx="7"/></clipPath>
        <rect x="8" y="12" width="48" height="13" fill="${TAN}" clip-path="url(#cal)"/>
        <rect x="8" y="12" width="48" height="44" rx="7" ${ink()}/>
        <path d="M8 25h48" ${ink()}/>
        <path d="M20 7v10M44 7v10" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
        <path d="M22 40l7 7l13-13" fill="none" stroke="${FOREST}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,

    // Milestones
    sb_pr: `
        <path d="M18 12H9q0 12 12 13M46 12h9q0 12-12 13" fill="none" stroke="${INK}" stroke-width="${W + 4}" stroke-linecap="round"/>
        <path d="M18 12H9q0 12 12 13M46 12h9q0 12-12 13" fill="none" stroke="${GOLD}" stroke-width="3.6" stroke-linecap="round"/>` + outlined([
        `<path d="M18 8h28v14q0 14-14 14T18 22z" fill="${GOLD}"/>`,
        `<rect x="28" y="35" width="8" height="10" fill="${GOLD}"/>`,
        `<rect x="18" y="44" width="28" height="12" rx="3" fill="${TAN}"/>`
    ]) + `
        <path d="M32 13l2.4 4.9l5.4.8l-3.9 3.8l.9 5.4L32 25.3l-4.8 2.6l.9-5.4l-3.9-3.8l5.4-.8z" fill="${CREAM}"/>
        <path d="M24 50h16" stroke="${TAN_D}" stroke-width="2.6" stroke-linecap="round"/>`,

    sb_race_day: `
        <rect x="27" y="4" width="10" height="7" rx="2" fill="${TAN}" ${line}/>
        <path d="M48 14l4-4" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
        <circle cx="32" cy="36" r="23" fill="${CREAM}" stroke="${TAN}" stroke-width="5"/>
        <circle cx="32" cy="36" r="25.5" ${ink()}/>
        <circle cx="32" cy="36" r="20.5" fill="none" stroke="${INK}" stroke-width="1.6"/>
        <path d="M32 18v4M50 36h-4M32 54v-4M14 36h4" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M32 36l9-9" stroke="${FLAME}" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M32 36v-11" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>
        <circle cx="32" cy="36" r="3.2" fill="${INK}"/>`,

    sb_finish: (() => {
        const cells = [];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2 === 0) cells.push(`<rect x="${16 + c * 10}" y="${8 + r * 9}" width="10" height="9" fill="${FOREST}"/>`);
        const flag = "M16 10q10-5 20 0t20 0v26q-10 5-20 0t-20 0z";
        return `
        <clipPath id="flag"><path d="${flag}"/></clipPath>
        <path d="${flag}" fill="${CREAM}"/>
        <g clip-path="url(#flag)">${cells.join("")}</g>
        <path d="${flag}" ${ink()}/>
        <path d="M13 8v50" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        <path d="M13 8v50" stroke="${TAN}" stroke-width="3.5" stroke-linecap="round"/>`;
    })(),

    sb_tired_proud: face(`
        <path d="M18 33h10M36 33h10" ${ink()}/>
        <path d="M19 33q4 5 8 0M37 33q4 5 8 0" fill="${INK}"/>
        <path d="M24 45q8 5 16 0" ${ink()}/>`) + drop(53, 8, 1),

    sb_survived: face(`
        <path d="M18 29l8 4l-8 4M46 29l-8 4l8 4" ${ink()}/>
        <path d="M22 48q2.5-4 5 0t5 0t5 0t5 0" ${ink()}/>`) + drop(9, 10, 0.85) + drop(55, 12, 0.85)
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [id, body] of Object.entries(EMOJI)) {
    // Unique clip ids per file so several emojis inline on one page never clash.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body.replace(/id="(\w+)"/g, `id="${id}-$1"`).replace(/url\(#(\w+)\)/g, `url(#${id}-$1)`)}</svg>\n`;
    writeFileSync(join(OUT_DIR, `${id}.svg`), svg.replace(/\n\s+/g, "\n"));
}
console.log(`Wrote ${Object.keys(EMOJI).length} emojis to emoji/`);
