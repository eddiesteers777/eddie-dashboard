/* Shared small helpers for the Prayer and Bible pages (js/prayerPage.js, js/biblePage.js, js/faithCard.js). */
import { habitList, dayKey } from "./habitDefaults.js";
import { showsPersonalPlan } from "./role.js";
import { findPrayerHabit, findBibleHabit } from "./faithSheets.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
export const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
export const sync = () => import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
export const today = () => dayKey();

/** Save one value under a key and push it to the account in the background. false if the device refused it. */
export function save(key, value) {
    if (!write(key, value)) return false;
    sync();
    return true;
}

export const habits = () => habitList(read("habits", null), showsPersonalPlan());
export const prayerHabit = () => findPrayerHabit(habits());
export const bibleHabit = () => findBibleHabit(habits());

/** The tab named in the address (#requests, ?tab=requests), else the first. */
export function tabFromUrl(names) {
    const raw = (new URLSearchParams(location.search).get("tab") || location.hash.replace("#", "")).toLowerCase();
    return names.includes(raw) ? raw : names[0];
}

/** Tab buttons as a segmented control. items: [{ id, label, count? }] */
export const tabsHtml = (items, current) => `<div class="fp-tabs" role="tablist">${items.map(t =>
    `<button type="button" role="tab" class="fp-tab${t.id === current ? " is-on" : ""}" data-tab="${t.id}" aria-selected="${t.id === current}">${esc(t.label)}${t.count != null ? ` <span class="fp-n">${t.count}</span>` : ""}</button>`).join("")}</div>`;
