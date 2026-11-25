// Writes the app's colourways (Eddie, 2026-11-25, step 4: "All six"). Run `npm run colorways` after changing a
// colour token in css/skin.css part 1, then `npm run manifest`.
//
// Fog is the app's own palette: every colour in css/skin.css is a token in part 1 (:root). Each other colourway
// is Fog turned to a new hue: a colour keeps its lightness, takes the colourway's hue and has its saturation
// scaled (pale colours by at most a quarter), so cards, ground and text keep the same depth in every colourway. Gold, clay and greys never change.
// A text colour that would read worse than it does in Fog is nudged lighter or darker until it doesn't.
// It writes two marked blocks:
//   css/skin.css        html[data-sb-scheme=...] { the tokens }   between the "colourways" markers
//   js/appLookBoot.js   the list of colourways (id, name, swatch, phone bar colour)
// The hue and saturation of each colourway come from its main colour in the mockups (Fog #3E5C78).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = join(root, "css/skin.css");
const JS = join(root, "js/appLookBoot.js");

// [id, name, main colour, deep colour] from the mockups. Fog first: it is the default and needs no block.
export const SCHEMES = [
    ["fog", "Fog", "#3E5C78", "#142130"],
    ["forest", "Forest", "#2F5B45", "#0F2019"],
    ["pitch", "Pitch", "#1F7A49", "#0A321D"],
    ["track", "Track", "#8C4030", "#33160F"],
    ["dusk", "Dusk", "#41458F", "#15173A"],
    ["slate", "Slate", "#46515F", "#171C23"],
];

const hexRgb = h => { h = h.replace("#", ""); if (h.length === 3) h = [...h].map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const rgbHex = c => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
export function rgbHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
}
export function hslRgb([h, s, l]) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255));
}
const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

// Same rule css/skin.css's tokens were made with: greys, gold and clay stay as they are.
export const shiftable = c => { if (Math.max(...c) - Math.min(...c) <= 6) return false; const [h, s] = rgbHsl(c); return !(h >= 15 && h <= 60 && s > .2); };
const FOG = rgbHsl(hexRgb(SCHEMES[0][2]));
export function turn(c, main) {
    if (!shiftable(c)) return c;
    const [h, s, l] = rgbHsl(c), [H, S] = rgbHsl(hexRgb(main));
    // Pale colours (the ground, light text) take at most a quarter more colour than Fog, so a bright colourway's
    // ground stays a soft tint rather than a candy colour.
    const k = l > .6 ? Math.min(S / FOG[1], 1.25) : S / FOG[1];
    return hslRgb([h + H - FOG[0], Math.min(1, s * k), l]);
}

// Text and what it sits on. A colourway may not read worse than Fog does (nor drop below 4.5:1 where Fog is above it).
const PAIRS = [
    ["--sb-ink", "--sb-ground"], ["--sb-ink-2", "--sb-ground"], ["--sb-ink-3", "--sb-ground"], ["--sb-ink-link", "--sb-ground"],
    ["--sb-ink", "--sb-ground-low"], ["--sb-ink-3", "--sb-ground-low"],
    ["--sb-on-card", "--sb-card-top"], ["--sb-on-card-2", "--sb-card-top"], ["--sb-on-card-3", "--sb-card-top"],
    ["--sb-on-card-3", "--sb-card-bottom"], ["--sb-on-card-2", "--sb-card-base"],
];

export function readTokens(css) {
    const i = css.indexOf(":root{"), block = css.slice(i, css.indexOf("}", i));
    const out = [];
    for (const m of block.matchAll(/(--sb-[\w-]+):\s*(#[0-9a-fA-F]{3,6}|\d+,\d+,\d+);/g)) out.push([m[1], m[2]]);
    return out;
}
const val = v => (v.startsWith("#") ? hexRgb(v) : v.split(",").map(Number));
const fmt = (like, c) => (like.startsWith("#") ? rgbHex(c) : c.map(Math.round).join(","));

export function schemeTokens(tokens, main) {
    const fog = new Map(tokens.map(([k, v]) => [k, val(v)]));
    const out = new Map([...fog].map(([k, c]) => [k, turn(c, main)]));
    for (const [t, b] of PAIRS) {
        const want = Math.min(contrast(fog.get(t), fog.get(b)), 4.5) - 1e-9;
        let [h, s, l] = rgbHsl(out.get(t));
        const darker = lum(out.get(t)) < lum(out.get(b));
        for (let n = 0; n < 100 && contrast(out.get(t), out.get(b)) < want; n++) {
            l = Math.min(1, Math.max(0, l + (darker ? -.01 : .01)));
            out.set(t, hslRgb([h, s, l]));
        }
    }
    return new Map(tokens.map(([k, v]) => [k, fmt(v, out.get(k))]).filter(([k, v], i) => v !== fmt(tokens[i][1], val(tokens[i][1]))));
}

function between(text, start, end, body) {
    const a = text.indexOf(start), b = text.indexOf(end);
    if (a < 0 || b < a) throw new Error(`markers missing: ${start}`);
    return text.slice(0, a + start.length) + "\n" + body + text.slice(b);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    let css = readFileSync(CSS, "utf8");
    const tokens = readTokens(css);
    const blocks = [], list = [];
    for (const [id, name, main, deep] of SCHEMES) {
        const t = id === "fog" ? new Map() : schemeTokens(tokens, main);
        if (id !== "fog") blocks.push(`html[data-sb-scheme="${id}"]{\n` + [...t].map(([k, v]) => `  ${k}:${v};`).join("\n") + "\n}");
        const bar = rgbHex(turn(hexRgb("#1c2834"), main));
        list.push(`        ["${id}", "${name}", "${main}", "${deep}", "${id === "fog" ? "#1C2834" : bar}"]`);
    }
    css = between(css, "/* colourways:start (npm run colorways writes this; don't edit by hand) */", "/* colourways:end */", blocks.join("\n") + "\n");
    writeFileSync(CSS, css);
    let js = readFileSync(JS, "utf8");
    js = between(js, "    // colourways:start (npm run colorways writes this; don't edit by hand)", "    // colourways:end", "    var SCHEMES = [\n" + list.join(",\n") + "\n    ];\n");
    writeFileSync(JS, js);
    console.log(`colourways written: ${SCHEMES.length - 1} blocks, ${tokens.length} tokens`);
}
