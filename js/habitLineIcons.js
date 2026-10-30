/* ==========================================
   Southbound — habit line icons

   One line icon for every habit icon ID in js/habitIconSet.js, drawn the
   way the rest of the app's icons are (js/icons.js: 24x24, round strokes,
   currentColor), so the Habits page matches the dashboard. The drawn,
   coloured habit-icons/*.svg stay for the share images and the
   completion moments; the Habits page uses these.
   tests/habitLineIcons.test.mjs fails if an ID has no line icon.
========================================== */

const P = {
    pray: `<path d="M12 3v18"/><path d="M8 7c0 4-2 5-2 9a2 2 0 0 0 2 2"/><path d="M16 7c0 4 2 5 2 9a2 2 0 0 1-2 2"/>`,
    bible: `<path d="M5 4a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0-2 2z"/><path d="M5 4v18"/><path d="M12 6v8M9 9h6"/>`,
    read: `<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>`,
    journal: `<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z"/><path d="M9 8h6M9 12h6"/><path d="M5 7H3M5 12H3M5 17H3"/>`,
    meditate: `<circle cx="12" cy="5" r="2"/><path d="M12 8v5"/><path d="M5 19c2-1 4-3 7-3s5 2 7 3"/><path d="M7 14l5-1 5 1"/>`,
    gratitude: `<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>`,
    study: `<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>`,
    run: `<circle cx="15" cy="4" r="2"/><path d="M13 8l-3 3 3 3v6"/><path d="M10 11l-4 1"/><path d="M13 8l4 3 3-1"/><path d="M13 14l4 2"/>`,
    workout: `<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>`,
    strength: `<path d="M6 6v12M18 6v12"/><path d="M3 9v6M21 9v6"/><path d="M6 12h12"/>`,
    stretch: `<circle cx="12" cy="4" r="2"/><path d="M12 6v5"/><path d="M5 9l7 2 7-2"/><path d="M8 21l4-10 4 10"/>`,
    steps: `<path d="M4 16v-2.4C4 11 5.5 9 7.5 9c2.5 0 3.5 2 3.5 4.4C11 15.8 10 18 8 18H5a1 1 0 0 1-1-1z"/><path d="M20 13v-1.4c0-2.2-1.2-4.6-3.2-4.6C14.7 7 13 9 13 11.4 13 13.8 14 16 16 16h3a1 1 0 0 0 1-1z" transform="translate(0 2)"/><path d="M5 21h4M15 21h4"/>`,
    bike: `<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/><circle cx="15" cy="5" r="1"/>`,
    swim: `<path d="M2 18c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"/><path d="M2 22c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"/><circle cx="16" cy="6" r="2"/><path d="M4 14l5-4 4 2 3-3"/>`,
    core: `<rect x="6" y="3" width="12" height="18" rx="4"/><path d="M12 3v18M6 9h12M6 15h12"/>`,
    ball: `<circle cx="12" cy="12" r="9"/><path d="M12 8l3.5 2.5-1.3 4h-4.4l-1.3-4z"/><path d="M12 8V3M15.5 10.5L20 9M14.2 14.5L17 18.5M9.8 14.5L7 18.5M8.5 10.5L4 9"/>`,
    protein: `<path d="M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23"/><path d="m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59"/>`,
    water: `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 5 12 2c-.5 3-2 5-4 7s-3 3.5-3 6a7 7 0 0 0 7 7z"/>`,
    veggies: `<path d="M5 19c-1-6 2-12 10-14 1 8-3 13-10 14z"/><path d="M5 19c3-5 6-8 10-11"/>`,
    fruit: `<path d="M12 7c-1-2-3-3-5-3 0 2 1 3 2.5 3.5"/><path d="M12 7c-2-1.5-6-1-7 3-1 4 1 11 5 11 1.5 0 1.5-.7 2-.7s.5.7 2 .7c4 0 6-7 5-11-1-4-5-4.5-7-3z"/>`,
    meals: `<path d="M5 3v7a2 2 0 0 0 4 0V3M7 3v18"/><path d="M17 21V3c-2.5 1-4 4-4 8 0 2 1 3 2 3h2"/>`,
    mealprep: `<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18M12 8v12"/><path d="M8 8V5h8v3"/>`,
    nosugar: `<rect x="5" y="9" width="14" height="11" rx="2"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/><path d="M3 3l18 18"/>`,
    noalcohol: `<path d="M8 3h8l-1 7a3 3 0 0 1-6 0z"/><path d="M12 13v8M8 21h8"/><path d="M3 3l18 18"/>`,
    coffee: `<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v2M12 3v2"/>`,
    vitamins: `<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-35 12 12)"/><path d="M9.5 7.5l7 9" transform="rotate(0)"/>`,
    fasting: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
    sleep: `<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>`,
    cold: `<path d="M12 2v20M4.5 7l15 10M19.5 7l-15 10"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>`,
    sauna: `<path d="M3 19h18"/><path d="M5 19v-5h14v5"/><path d="M8 11c0-1.5 1-1.5 1-3s-1-1.5-1-3M13 11c0-1.5 1-1.5 1-3s-1-1.5-1-3"/>`,
    sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
    screens: `<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/><path d="M3 3l18 18"/>`,
    breathe: `<path d="M3 9h10a3 3 0 1 0-3-3"/><path d="M3 15h14a3 3 0 1 1-3 3"/><path d="M3 12h7"/>`,
    love: `<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>`,
    family: `<circle cx="9" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2"/><circle cx="18" cy="10" r="2"/><path d="M18 15a4 4 0 0 1 3 4v2"/>`,
    friends: `<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><path d="M16 15a4 4 0 0 1 6 3v3"/>`,
    tidy: `<path d="M12 3v8"/><path d="M8 11h8l1 10H7z"/><path d="M10 15v2M14 15v2"/>`,
    money: `<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.5-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.5 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>`,
    work: `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>`,
    music: `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`,
    nature: `<path d="M12 22v-7"/><path d="M12 15c-4 0-6-3-6-6 0-3 2-5 6-7 4 2 6 4 6 7 0 3-2 6-6 6z"/>`,
    dog: `<path d="M10 5.2C9 4 7 4 5.5 5 4 6 3.5 8 4 10l2 1v6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-6l2-1c.5-2 0-4-1.5-5S15 4 14 5.2z"/><circle cx="9.5" cy="11" r=".6"/><circle cx="14.5" cy="11" r=".6"/><path d="M11 15h2"/>`,
    weigh: `<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8.5 9a5 5 0 0 1 7 0"/><path d="M12 9l1.5 2"/>`,
    teeth: `<path d="M7 3c-2 0-3.5 1.5-3.5 4 0 3 1 4 1.5 8 .4 3 1.5 6 3 6 1.5 0 1.5-3 4-3s2.5 3 4 3c1.5 0 2.6-3 3-6 .5-4 1.5-5 1.5-8 0-2.5-1.5-4-3.5-4-1.5 0-2.5.8-5 .8S8.5 3 7 3z"/>`,
    goal: `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
    star: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
    check: `<polyline points="20 6 9 17 4 12"/>`
};

export const HABIT_LINE_ICONS = Object.freeze(P);

/** The inline line icon for a habit icon ID (a star for an unknown one). */
export function habitLineSvg(id, size = 24) {
    const body = P[id] || P.star;
    return `<svg class="sb-habit-line" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
