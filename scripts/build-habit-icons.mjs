// Builds the Southbound habit icons in habit-icons/*.svg.
// Run: node scripts/build-habit-icons.mjs
//
// Drawn by the same rule book as the reaction emojis (scripts/drawKit.mjs):
// 64x64, the thick deep-forest outline, the brand palette. Things that
// move (run, bike, swim, steps) carry the SB speed streaks. The list of
// icons (IDs, labels, the words that suggest them) lives in
// js/habitIconSet.js; this file only draws them, and fails if the two
// ever disagree.
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INK, W, TAN, TAN_D, CREAM, STONE, SAGE, SAGE_D, FOREST, FLAME, FLAME_L, WATER, GOLD, line, ink, outlined, streaks } from "./drawKit.mjs";
import { HABIT_ICONS } from "../js/habitIconSet.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, "habit-icons");

// A few muted accents beyond the kit, in the same family.
const ROSE = "#C97A6E";
const BRICK = "#B9573F";
const ICE = "#C6DDE8";

// A "not this" slash, used on no-sugar / no-alcohol / screen time.
const slash = `
    <path d="M12 52L52 12" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
    <path d="M12 52L52 12" stroke="${BRICK}" stroke-width="4.6" stroke-linecap="round"/>`;
const heart = (x, y, s = 1, fill = ROSE) => `<path d="M${x} ${y + 17 * s}C${x - 20 * s} ${y + 5 * s} ${x - 15 * s} ${y - 11 * s} ${x} ${y - 3 * s}C${x + 15 * s} ${y - 11 * s} ${x + 20 * s} ${y + 5 * s} ${x} ${y + 17 * s}z" fill="${fill}" ${line}/>`;
const sparkle = (x, y, r = 5, fill = GOLD) => `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}z" fill="${fill}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
const foot = (x, y, rot = 0) => `<g transform="rotate(${rot} ${x} ${y})">${outlined([
    `<path d="M${x - 6} ${y - 4}q0-12 6-12t6 12q0 6-2 10h-8q-2-4-2-10z" fill="${TAN}"/>`,
    `<ellipse cx="${x}" cy="${y + 12}" rx="5" ry="4.5" fill="${TAN}"/>`
])}</g>`;

const DRAW = {
    // ---- Faith & mind ----
    pray: outlined([
        `<path d="M31 9c-5 6-10 18-10 30v12q0 4 4 4h6z" fill="${TAN}"/>`,
        `<path d="M33 9c5 6 10 18 10 30v12q0 4-4 4h-6z" fill="${TAN}"/>`
    ]) + `<path d="M32 12v42" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M26 30q-2 6-2 12M38 30q2 6 2 12" stroke="${TAN_D}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <path d="M13 14l4 4M9 26h5M51 14l-4 4M55 26h-5" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>`,

    bible: outlined([
        `<rect x="14" y="8" width="36" height="48" rx="4" fill="${FOREST}"/>`,
        `<rect x="44" y="12" width="7" height="42" rx="1.5" fill="${CREAM}"/>`
    ]) + `<path d="M29 18v26M22 26h14" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        <path d="M29 18v26M22 26h14" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>
        <path d="M20 8v48" stroke="${TAN_D}" stroke-width="2.4"/>`,

    read: outlined([
        `<path d="M32 16q-10-6-26-4v36q16-2 26 4z" fill="${CREAM}"/>`,
        `<path d="M32 16q10-6 26-4v36q-16-2-26 4z" fill="${CREAM}"/>`
    ]) + `<path d="M32 16v36" stroke="${INK}" stroke-width="${W}"/>
        <path d="M12 22q8-1 14 2M12 30q8-1 14 2M12 38q8-1 14 2M38 24q6-3 14-2M38 32q6-3 14-2M38 40q6-3 14-2" stroke="${TAN}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,

    journal: outlined([
        `<rect x="12" y="8" width="34" height="48" rx="4" fill="${TAN}"/>`
    ]) + `<path d="M12 18h-4M12 28h-4M12 38h-4M12 48h-4" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <path d="M20 20h18M20 28h14" stroke="${TAN_D}" stroke-width="2.6" stroke-linecap="round"/>
        <g transform="rotate(35 44 38)">${outlined([
            `<rect x="40" y="16" width="8" height="34" rx="2" fill="${CREAM}"/>`,
            `<path d="M40 50h8l-4 8z" fill="${FOREST}"/>`
        ])}<path d="M40 22h8" stroke="${INK}" stroke-width="2.4"/></g>`,

    meditate: `<g transform="translate(32 34) scale(1.3) translate(-32 -34)">
        <path d="M32 12c-7 8-8 20 0 30c8-10 7-22 0-30z" fill="${SAGE}" ${line}/>
        <path d="M31 42c-12 0-20-6-22-16c10-1 18 5 22 16z" fill="${SAGE_D}" ${line}/>
        <path d="M33 42c12 0 20-6 22-16c-10-1-18 5-22 16z" fill="${SAGE_D}" ${line}/>
        <path d="M14 50h36" ${ink()}/></g>`,

    gratitude: heart(32, 28, 1.6) + sparkle(10, 10, 6) + sparkle(55, 10, 5) + sparkle(56, 50, 4),

    study: outlined([
        `<path d="M32 10l28 12l-28 12L4 22z" fill="${FOREST}"/>`,
        `<path d="M16 28v12q16 10 32 0V28L32 34z" fill="${TAN}"/>`
    ]) + `<path d="M52 25v14" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
        <path d="M52 25v14" stroke="${GOLD}" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="52" cy="42" r="3.6" fill="${GOLD}" ${line}/>`,

    // ---- Training ----
    run: streaks(0, 24) + outlined([
        `<path d="M14 42h38q9 0 9 4.5T52 51H18q-4 0-4-4.5z" fill="${CREAM}"/>`,
        `<path d="M16 43V28q0-5 5-5h5q2 7 9 7h4q14 0 19 10.5q1 2.5-1.5 2.5z" fill="${TAN}"/>`
    ]) + `<path d="M30 30.5l3-5M35.5 30.5l2.5-4.5M41 31l2-4" stroke="${CREAM}" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M22 41l12-8" stroke="${FOREST}" stroke-width="3" stroke-linecap="round"/>`,

    workout: outlined([
        `<path d="M22 24q0-14 10-14t10 14" fill="none" stroke="${STONE}" stroke-width="4.5" stroke-linecap="round"/>`,
        `<path d="M14 40q0-16 18-16t18 16q0 16-18 16T14 40z" fill="${TAN}"/>`
    ]) + `<path d="M22 44q4 5 10 5" stroke="${TAN_D}" stroke-width="3" stroke-linecap="round" fill="none"/>`,

    strength: `<g transform="rotate(-22 32 32)">${outlined([
        `<rect x="14" y="29" width="36" height="6" rx="2" fill="${STONE}"/>`,
        `<rect x="7" y="18" width="9" height="28" rx="3.5" fill="${TAN}"/>`,
        `<rect x="48" y="18" width="9" height="28" rx="3.5" fill="${TAN}"/>`,
        `<rect x="2" y="23" width="6" height="18" rx="2.5" fill="${TAN_D}"/>`,
        `<rect x="56" y="23" width="6" height="18" rx="2.5" fill="${TAN_D}"/>`
    ])}</g>`,

    stretch: outlined([
        `<path d="M6 50l30-14h22l-30 14z" fill="${SAGE}"/>`,
        `<circle cx="45" cy="30" r="12" fill="${SAGE}"/>`
    ]) + `<path d="M45 30m-6 0a6 6 0 1 1 6 6a3 3 0 1 1-3-3" fill="none" stroke="${SAGE_D}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M14 46l20-9M22 49l20-9" stroke="${SAGE_D}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
        <path d="M8 26q8-14 22-12" stroke="${TAN}" stroke-width="3.2" stroke-linecap="round" fill="none"/>
        <path d="M24 9l6 5l-6 5" stroke="${TAN}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

    steps: foot(22, 36, -12) + foot(44, 22, 12),

    bike: streaks(0, 12, TAN) + `
        <circle cx="16" cy="42" r="11" fill="none" stroke="${INK}" stroke-width="${W}"/>
        <circle cx="48" cy="42" r="11" fill="none" stroke="${INK}" stroke-width="${W}"/>
        <path d="M16 42l10-16h16l6 16M26 26l8 16h14M34 42l-8-16" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16 42l10-16h16l6 16M26 26l8 16h14M34 42l-8-16" fill="none" stroke="${TAN}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M22 22h8M40 26l3-6h5" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" fill="none"/>
        <circle cx="34" cy="42" r="3" fill="${INK}"/>`,

    swim: `
        <circle cx="42" cy="20" r="7" fill="${TAN}" ${line}/>
        <path d="M14 30q10-10 22-2" fill="none" stroke="${INK}" stroke-width="${W + 3.5}" stroke-linecap="round"/>
        <path d="M14 30q10-10 22-2" fill="none" stroke="${TAN}" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M4 40q7-6 14 0t14 0t14 0t14 0" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
        <path d="M4 40q7-6 14 0t14 0t14 0t14 0" fill="none" stroke="${WATER}" stroke-width="4.4" stroke-linecap="round"/>
        <path d="M4 52q7-6 14 0t14 0t14 0t14 0" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
        <path d="M4 52q7-6 14 0t14 0t14 0t14 0" fill="none" stroke="${WATER}" stroke-width="4.4" stroke-linecap="round"/>`,

    core: [[16, 10], [34, 10], [16, 26], [34, 26], [18, 42], [32, 42]].map(([x, y], i) =>
        `<rect x="${x}" y="${y}" width="${i >= 4 ? 14 : 14}" height="${i >= 4 ? 12 : 13}" rx="5" fill="${TAN}" ${line}/>`).join("")
        + `<path d="M32 8v50" stroke="${TAN_D}" stroke-width="2" opacity=".6"/>`,

    ball: (() => {
        const cx = 34, cy = 32, r = 24, pr = 7.5;
        const pts = [...Array(5)].map((_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [cx + pr * Math.cos(a), cy + pr * Math.sin(a), a]; });
        const pent = pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");
        const spokes = pts.map(([x, y, a]) => `M${x.toFixed(1)} ${y.toFixed(1)}L${(cx + (r - 1) * Math.cos(a)).toFixed(1)} ${(cy + (r - 1) * Math.sin(a)).toFixed(1)}`).join("");
        return `
        <clipPath id="ball"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${CREAM}"/>
        <circle cx="${cx + 7}" cy="${cy + 8}" r="${r}" fill="${STONE}" clip-path="url(#ball)"/>
        <path d="${spokes}" stroke="${INK}" stroke-width="2.4" clip-path="url(#ball)"/>
        <path d="M${pent}Z" fill="${FOREST}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
        ${pts.map(([, , a]) => { const ex = cx + (r + 1.5) * Math.cos(a), ey = cy + (r + 1.5) * Math.sin(a); return `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" fill="${FOREST}" clip-path="url(#ball)"/>`; }).join("")}
        <circle cx="${cx}" cy="${cy}" r="${r}" ${ink()}/>`;
    })(),

    // ---- Nutrition ----
    protein: `<g transform="rotate(-35 32 32)">${outlined([
        `<rect x="29" y="34" width="7" height="18" rx="2" fill="${CREAM}"/>`,
        `<circle cx="29.5" cy="54" r="4.5" fill="${CREAM}"/>`,
        `<circle cx="35.5" cy="54" r="4.5" fill="${CREAM}"/>`,
        `<path d="M32.5 6c12 0 18 9 18 18c0 9-8 14-18 14s-18-5-18-14c0-9 6-18 18-18z" fill="${TAN}"/>`
    ])}<path d="M22 20q4-8 12-9" stroke="${CREAM}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"/></g>`,

    water: outlined([
        `<rect x="20" y="16" width="24" height="42" rx="7" fill="${CREAM}"/>`,
        `<rect x="24" y="7" width="16" height="10" rx="3" fill="${TAN}"/>`
    ]) + `<clipPath id="bottle"><rect x="20" y="16" width="24" height="42" rx="7"/></clipPath>
        <path d="M18 34q7-4 14 0t14 0V60H18z" fill="${WATER}" clip-path="url(#bottle)"/>
        <rect x="20" y="16" width="24" height="42" rx="7" ${ink()}/>
        <path d="M20 24h24" ${ink()}/>`,

    veggies: `
        <path d="M30 22l6-10M34 22l10-6M32 22l0-12" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        <path d="M30 22l6-10M34 22l10-6M32 22l0-12" stroke="${SAGE}" stroke-width="4" stroke-linecap="round"/>
        <path d="M22 26q10-8 20 0L34 56q-2 4-4 0z" fill="${FLAME}" ${line}/>
        <path d="M27 34h5M29 42h4M30 49h3" stroke="${BRICK}" stroke-width="2.4" stroke-linecap="round"/>`,

    fruit: `
        <path d="M32 20c-6-4-20-4-20 12c0 14 10 24 20 20c10 4 20-6 20-20c0-16-14-16-20-12z" fill="${ROSE}" ${line}/>
        <path d="M20 30q2-6 8-6" stroke="${CREAM}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"/>
        <path d="M32 20q0-8 4-12" ${ink()}/>
        <path d="M35 14q8-8 16-2q-8 8-16 2z" fill="${SAGE}" ${line}/>`,

    meals: `
        <circle cx="32" cy="34" r="20" fill="${CREAM}" ${line}/>
        <circle cx="32" cy="34" r="12" fill="none" stroke="${STONE}" stroke-width="3"/>
        <path d="M6 12v14q0 4 3 4v24M10 12v12M4 12v12" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" fill="none"/>
        <path d="M58 12q-6 6-6 16h6v26" stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round" fill="${STONE}"/>`,

    mealprep: outlined([
        `<rect x="2" y="32" width="10" height="7" rx="3.5" fill="${TAN_D}"/>`,
        `<rect x="52" y="32" width="10" height="7" rx="3.5" fill="${TAN_D}"/>`,
        `<path d="M10 30h44v16q0 10-10 10H20q-10 0-10-10z" fill="${STONE}"/>`,
        `<path d="M8 30q0-8 24-8t24 8z" fill="${TAN}"/>`,
        `<rect x="28" y="15" width="8" height="7" rx="3" fill="${TAN_D}"/>`
    ]) + `<path d="M16 42h32" stroke="${CREAM}" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>
        <path d="M18 4q-3 3 0 6M46 4q-3 3 0 6" stroke="${CREAM}" stroke-width="3" stroke-linecap="round" fill="none"/>`,

    nosugar: outlined([
        `<path d="M8 22l10 10l-10 10z" fill="${ROSE}"/>`,
        `<path d="M56 22l-10 10l10 10z" fill="${ROSE}"/>`,
        `<ellipse cx="32" cy="32" rx="16" ry="12" fill="${CREAM}"/>`
    ]) + `<path d="M24 26q8 12 16 0" stroke="${ROSE}" stroke-width="3" fill="none" stroke-linecap="round"/>` + slash,

    noalcohol: `
        <path d="M20 8h24q2 18-12 24q-14-6-12-24z" fill="${CREAM}" ${line}/>
        <clipPath id="glass"><path d="M20 8h24q2 18-12 24q-14-6-12-24z"/></clipPath>
        <rect x="18" y="16" width="28" height="18" fill="${ROSE}" clip-path="url(#glass)"/>
        <path d="M20 8h24q2 18-12 24q-14-6-12-24z" ${ink()}/>
        <path d="M32 32v18M22 54h20" ${ink()}/>` + slash,

    coffee: outlined([
        `<path d="M44 30h4q8 0 8 8t-8 8h-4" fill="none" stroke="${TAN}" stroke-width="4"/>`,
        `<path d="M10 24h36v18q0 14-14 14h-8q-14 0-14-14z" fill="${TAN}"/>`
    ]) + `<path d="M10 30h36" stroke="${FOREST}" stroke-width="3"/>
        <path d="M20 6q-4 5 0 9t0 9M30 6q-4 5 0 9t0 9M40 6q-4 5 0 9t0 9" stroke="${STONE}" stroke-width="3" stroke-linecap="round" fill="none"/>`,

    vitamins: `<g transform="rotate(-40 26 34)">${outlined([
        `<rect x="10" y="26" width="34" height="16" rx="8" fill="${CREAM}"/>`
    ])}<clipPath id="cap"><rect x="10" y="26" width="34" height="16" rx="8"/></clipPath>
        <rect x="27" y="24" width="20" height="20" fill="${TAN}" clip-path="url(#cap)"/>
        <rect x="10" y="26" width="34" height="16" rx="8" ${ink()}/>
        <path d="M27 26v16" stroke="${INK}" stroke-width="2.4"/></g>
        <circle cx="46" cy="46" r="9" fill="${SAGE}" ${line}/>
        <path d="M40 46h12" stroke="${SAGE_D}" stroke-width="2.4" stroke-linecap="round"/>`,

    fasting: `
        <path d="M18 10h28M18 54h28" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
        <path d="M18 10h28M18 54h28" stroke="${TAN}" stroke-width="4.4" stroke-linecap="round"/>
        <path d="M21 13q0 12 11 19q-11 7-11 19h22q0-12-11-19q11-7 11-19z" fill="${CREAM}" ${line}/>
        <path d="M26 22h12q-2 5-6 7q-4-2-6-7zM24 49q1-7 8-10q7 3 8 10z" fill="${GOLD}"/>
        <path d="M32 29v10" stroke="${GOLD}" stroke-width="2" stroke-dasharray="2 3"/>`,

    // ---- Recovery ----
    sleep: `
        <path d="M34 8a24 24 0 1 0 22 32a19 19 0 0 1-22-32z" fill="${CREAM}" ${line}/>
        <path d="M24 26a3 3 0 1 0 0.1 0" fill="${STONE}"/>
        <path d="M44 10h8l-8 9h8M50 24h6l-6 7h6" stroke="${TAN}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

    cold: outlined([
        `<rect x="10" y="16" width="36" height="36" rx="7" fill="${ICE}"/>`
    ]) + `<path d="M16 24q0-3 3-3h8" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none" opacity=".85"/>
        <g stroke="${INK}" stroke-width="6" stroke-linecap="round"><path d="M48 8v20M39 13l18 10M57 13l-18 10"/></g>
        <g stroke="${WATER}" stroke-width="2.6" stroke-linecap="round"><path d="M48 8v20M39 13l18 10M57 13l-18 10"/></g>`,

    sauna: `
        <path d="M18 8q-5 6 0 12t0 12M32 6q-5 6 0 12t0 12M46 8q-5 6 0 12t0 12" stroke="${STONE}" stroke-width="3.2" stroke-linecap="round" fill="none"/>
        <path d="M32 26c5 7 12 11 12 20c0 7-5 12-12 12s-12-5-12-12c0-5 3-8 5-11c1 4 2 6 4 7c-1-5 0-10 3-16z" fill="${FLAME}" ${line}/>
        <path d="M32 42c2.5 3.5 5 5 5 8.5c0 3-2 5-5 5s-5-2-5-5c0-3 2.5-5 5-8.5z" fill="${FLAME_L}"/>`,

    sun: `
        <path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M52 12l-6 6M12 52l6-6" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        <path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M52 12l-6 6M12 52l6-6" stroke="${GOLD}" stroke-width="3.6" stroke-linecap="round"/>
        <circle cx="32" cy="32" r="14" fill="${GOLD}" ${line}/>
        <path d="M24 28q2-5 7-6" stroke="${CREAM}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"/>`,

    screens: outlined([
        `<rect x="18" y="6" width="28" height="52" rx="6" fill="${FOREST}"/>`
    ]) + `<rect x="22" y="12" width="20" height="36" rx="2" fill="${CREAM}"/>
        <path d="M26 20h12M26 27h8M26 34h12" stroke="${STONE}" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="32" cy="53" r="2" fill="${TAN}"/>` + slash,

    breathe: `
        <path d="M6 22h32a7 7 0 1 0-7-7" stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"/>
        <path d="M6 22h32a7 7 0 1 0-7-7" stroke="${WATER}" stroke-width="3.6" stroke-linecap="round" fill="none"/>
        <path d="M6 34h46a7 7 0 1 1-7 7" stroke="${INK}" stroke-width="8" stroke-linecap="round" fill="none"/>
        <path d="M6 34h46a7 7 0 1 1-7 7" stroke="${STONE}" stroke-width="3.6" stroke-linecap="round" fill="none"/>
        <path d="M14 46h18" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        <path d="M14 46h18" stroke="${WATER}" stroke-width="3.6" stroke-linecap="round"/>`,

    // ---- Life ----
    love: heart(28, 30, 1.6) + heart(50, 12, 0.7, TAN),

    family: outlined([
        `<path d="M8 30L32 10l24 20z" fill="${FOREST}"/>`,
        `<rect x="13" y="28" width="38" height="28" rx="3" fill="${TAN}"/>`
    ]) + heart(32, 38, 0.55, ROSE),

    friends: `
        <path d="M6 12h32q4 0 4 4v16q0 4-4 4H20l-8 7v-7h-6q-4 0-4-4V16q0-4 4-4z" fill="${CREAM}" ${line}/>
        <path d="M26 28h32q4 0 4 4v14q0 4-4 4h-4v7l-8-7H26q-4 0-4-4V32q0-4 4-4z" fill="${TAN}" ${line}/>
        <path d="M12 22h20M12 28h12" stroke="${STONE}" stroke-width="2.6" stroke-linecap="round"/>`,

    tidy: `<g transform="rotate(30 32 32)">
        <path d="M32 4v30" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        <path d="M32 4v30" stroke="${TAN}" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M22 34h20l6 22H16z" fill="${GOLD}" ${line}/>
        <path d="M26 40l-2 14M32 40v14M38 40l2 14" stroke="${TAN_D}" stroke-width="2.2" stroke-linecap="round"/></g>`
        + sparkle(12, 50, 5, CREAM) + sparkle(52, 14, 4, CREAM),

    money: [46, 36, 26].map(y => `
        <ellipse cx="30" cy="${y + 4}" rx="18" ry="6" fill="${TAN_D}" ${line}/>
        <ellipse cx="30" cy="${y}" rx="18" ry="6" fill="${GOLD}" ${line}/>`).join("")
        + `<circle cx="48" cy="16" r="10" fill="${GOLD}" ${line}/><path d="M48 10v12M45 13q3-2 6 0t-6 6q3 2 6 0" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,

    work: outlined([
        `<path d="M24 18v-4q0-4 4-4h8q4 0 4 4v4" fill="none" stroke="${STONE}" stroke-width="3.5"/>`,
        `<rect x="6" y="18" width="52" height="36" rx="6" fill="${TAN}"/>`
    ]) + `<path d="M6 32h52" stroke="${INK}" stroke-width="2.6"/>
        <rect x="27" y="28" width="10" height="9" rx="2" fill="${GOLD}" ${line}/>`,

    music: `
        <path d="M24 46V16l28-6v30" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
        <path d="M24 46V16l28-6v30" fill="none" stroke="${CREAM}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M24 21l28-6" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
        <path d="M24 21l28-6" stroke="${TAN_D}" stroke-width="4" stroke-linecap="round"/>
        <ellipse cx="17" cy="47" rx="8" ry="6.5" fill="${TAN}" ${line}/>
        <ellipse cx="45" cy="41" rx="8" ry="6.5" fill="${TAN}" ${line}/>`,

    nature: `
        <path d="M28 40h8v18h-8z" fill="${TAN_D}" ${line}/>
        <path d="M32 6c12 0 20 8 20 18c0 12-10 18-20 18s-20-6-20-18c0-10 8-18 20-18z" fill="${SAGE}" ${line}/>
        <path d="M24 18q4-6 10-6" stroke="${CREAM}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".6"/>
        <path d="M8 58h48" ${ink()}/>`,

    dog: `
        <ellipse cx="32" cy="42" rx="14" ry="12" fill="${TAN}" ${line}/>
        <ellipse cx="14" cy="28" rx="6" ry="7.5" fill="${TAN}" ${line}/>
        <ellipse cx="25" cy="16" rx="6" ry="7.5" fill="${TAN}" ${line}/>
        <ellipse cx="39" cy="16" rx="6" ry="7.5" fill="${TAN}" ${line}/>
        <ellipse cx="50" cy="28" rx="6" ry="7.5" fill="${TAN}" ${line}/>`,

    weigh: outlined([
        `<rect x="8" y="12" width="48" height="44" rx="10" fill="${CREAM}"/>`
    ]) + `<path d="M18 30a14 14 0 0 1 28 0z" fill="${STONE}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M32 30l6-9" stroke="${BRICK}" stroke-width="3" stroke-linecap="round"/>
        <rect x="16" y="40" width="10" height="10" rx="3" fill="${TAN}"/><rect x="38" y="40" width="10" height="10" rx="3" fill="${TAN}"/>`,

    teeth: `
        <path d="M18 10c6-4 10 2 14 2s8-6 14-2c8 5 6 18 2 26c-3 7-3 20-8 20c-4 0-4-14-8-14s-4 14-8 14c-5 0-5-13-8-20c-4-8-6-21 2-26z" fill="${CREAM}" ${line}/>
        <path d="M22 18q3-4 8-3" stroke="${STONE}" stroke-width="2.6" stroke-linecap="round" fill="none"/>` + sparkle(52, 50, 5),

    goal: `
        <circle cx="30" cy="34" r="24" fill="${CREAM}" ${line}/>
        <circle cx="30" cy="34" r="16" fill="${ROSE}" ${line}/>
        <circle cx="30" cy="34" r="8" fill="${CREAM}" ${line}/>
        <path d="M30 34L56 8" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
        <path d="M30 34L56 8" stroke="${TAN}" stroke-width="3" stroke-linecap="round"/>
        <path d="M50 6l8-2l-2 8l-4 2l-4-4z" fill="${FOREST}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,

    star: `
        <path d="M32 6l7.6 15.6l17.2 2.5l-12.4 12.1l2.9 17.1L32 45.2l-15.3 8.1l2.9-17.1L7.2 24.1l17.2-2.5z" fill="${GOLD}" ${line}/>
        <path d="M32 16l3.6 7.5l-3.6 13.5z" fill="${CREAM}" opacity=".55"/>`,

    check: `
        <circle cx="32" cy="32" r="26" fill="${SAGE}" ${line}/>
        <path d="M19 33l9 9l18-19" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19 33l9 9l18-19" fill="none" stroke="${CREAM}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`
};

// The registry and the drawings must match exactly.
const listed = HABIT_ICONS.map(i => i.id);
const missing = listed.filter(id => !DRAW[id]);
const extra = Object.keys(DRAW).filter(id => !listed.includes(id));
if (missing.length || extra.length) {
    console.error(`habit icons out of step: missing drawings ${missing.join(", ") || "none"}; not in js/habitIconSet.js ${extra.join(", ") || "none"}`);
    process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(OUT_DIR)) if (f.endsWith(".svg") && !DRAW[f.replace(/\.svg$/, "")]) unlinkSync(join(OUT_DIR, f));
for (const [id, body] of Object.entries(DRAW)) {
    // Unique clip ids per file so several icons inline on one page never clash.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body.replace(/id="(\w+)"/g, `id="hb-${id}-$1"`).replace(/url\(#(\w+)\)/g, `url(#hb-${id}-$1)`)}</svg>\n`;
    writeFileSync(join(OUT_DIR, `${id}.svg`), svg.replace(/\n\s+/g, "\n"));
}
console.log(`Wrote ${Object.keys(DRAW).length} habit icons to habit-icons/`);
