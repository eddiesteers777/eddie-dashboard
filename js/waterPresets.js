/* ==========================================
   Southbound — your own water buttons (pure, 2026-11-03)

   The water screen always has +8 / +12 / +16 / +24. You can add buttons
   of your own (a gym bottle, a mug). They are kept under the key
   "water-presets" as [{ oz, label }], synced with the account, at most
   MAX_CUSTOM of them. Unit-tested in tests/waterPresets.test.mjs.
========================================== */

import { PRESETS, MAX_ADD } from "./waterModel.js";

export const PRESETS_KEY = "water-presets";
export const MAX_CUSTOM = 4;
export const MAX_LABEL = 14;

/** The saved list, cleaned: valid sizes only, no repeats of a built-in or each other, sorted small to large. */
export function cleanCustom(list) {
    const seen = new Set(PRESETS.map(p => p.oz));
    const out = [];
    for (const e of Array.isArray(list) ? list : []) {
        const oz = Math.round(Number(e?.oz));
        if (!Number.isFinite(oz) || oz < 1 || oz > MAX_ADD || seen.has(oz)) continue;
        seen.add(oz);
        out.push({ oz, label: cleanLabel(e?.label) });
        if (out.length >= MAX_CUSTOM) break;
    }
    return out.sort((a, b) => a.oz - b.oz);
}

export function cleanLabel(label) {
    const t = String(label ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
    return t || "mine";
}

/** Adds one. Returns { list } or { error } with a sentence for the person. */
export function addCustom(list, oz, label) {
    const n = Math.round(Number(oz));
    if (!Number.isFinite(n) || n < 1 || n > MAX_ADD) return { error: `Pick a size from 1 to ${MAX_ADD} oz.` };
    const cur = cleanCustom(list);
    if (PRESETS.some(p => p.oz === n) || cur.some(p => p.oz === n)) return { error: `You already have a +${n} button.` };
    if (cur.length >= MAX_CUSTOM) return { error: `You can keep ${MAX_CUSTOM} of your own buttons. Hold one to remove it first.` };
    return { list: cleanCustom([...cur, { oz: n, label }]) };
}

export function removeCustom(list, oz) {
    return cleanCustom(cleanCustom(list).filter(p => p.oz !== Number(oz)));
}

/** All buttons in order: the four built-in ones, then yours. */
export function allPresets(list) {
    return [...PRESETS.map(p => ({ ...p, custom: false })), ...cleanCustom(list).map(p => ({ ...p, custom: true }))];
}
