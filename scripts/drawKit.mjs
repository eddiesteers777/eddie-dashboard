// The Southbound drawing rule book, shared by scripts/build-emoji.mjs (the
// reaction emojis) and scripts/build-habit-icons.mjs (the habit icons), so
// both sets look drawn by one hand: a 64x64 canvas, the same thick
// deep-forest outline, the brand palette and a few muted accents.
// ---- The rule book ----
export const INK = "#0F2019";      // outline (the app's --bg)
export const W = 3.5;              // outline weight
export const TAN = "#C9AD84";
export const TAN_D = "#AE9068";    // tan in shadow
export const CREAM = "#F2EEE4";
export const STONE = "#E3DDD0";
export const SAGE = "#8FA388";
export const SAGE_D = "#6F8769";
export const FOREST = "#173226";
export const FLAME = "#E07A3F";
export const FLAME_L = "#F2B35E";
export const WATER = "#7FB2CF";
export const GOLD = "#D8A444";

export const line = `stroke="${INK}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round"`;
export const ink = (extra = "") => `fill="none" ${line}${extra}`;

// Composite shapes get one clean outer outline: draw every piece with
// a doubled stroke first, then every fill on top.
export function outlined(pieces) {
    // A piece that is a stroke already (a handle, a strap) gets a wider ink
    // copy of itself; a filled piece gets the ink edge added.
    const back = pieces.map(p => / stroke="/.test(p)
        ? p.replace(/ stroke-line(cap|join)="[^"]*"/g, "").replace(/ stroke="[^"]*"/, ` stroke="${INK}"`).replace(/ stroke-width="([\d.]+)"/, (m, w) => ` stroke-width="${+w + W * 2}" stroke-linejoin="round" stroke-linecap="round"`)
        : p.replace("/>", ` stroke="${INK}" stroke-width="${W * 2}" stroke-linejoin="round" stroke-linecap="round"/>`)).join("");
    return back + pieces.join("");
}

// The family signature: three speed streaks on the left.
export const streaks = (x = 4, y = 26, color = TAN) => `
    <path d="M${x + 4} ${y}h9M${x} ${y + 7}h12M${x + 5} ${y + 14}h8" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`;

// A face: tan disc, shaded lower edge, outline.
export const face = (inner, { cx = 32, cy = 33, r = 25 } = {}) => `
    <clipPath id="f"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${TAN}"/>
    <circle cx="${cx + 7}" cy="${cy + 9}" r="${r}" fill="${TAN_D}" opacity=".45" clip-path="url(#f)"/>
    ${inner}
    <circle cx="${cx}" cy="${cy}" r="${r}" ${ink()}/>`;

export const eyeDot = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="3.4" fill="${INK}"/>`;
export const drop = (x, y, s = 1) => `<path d="M${x} ${y}c${-3 * s} ${4.5 * s} ${-4.5 * s} ${6.5 * s} ${-4.5 * s} ${8.5 * s}a${4.5 * s} ${4.5 * s} 0 0 0 ${9 * s} 0c0 ${-2 * s} ${-1.5 * s} ${-4 * s} ${-4.5 * s} ${-8.5 * s}z" fill="${WATER}" ${line}/>`;

