/* ==========================================
   Southbound — habit icons on the page

   The drawn habit icons (habit-icons/*.svg, the list in
   js/habitIconSet.js) as used by the Habits page and the
   75-Day page:

     habitIconHtml(habit)          the icon a habit shows
     attachIconSuggestions(input)  icons that fit what's typed, under
                                   the "New habit" field, as you type
     pickHabitIcon({ name })       the full picker (search + every
                                   icon by group); resolves to an ID,
                                   or null when closed
     iconForNewHabit(name, s)      what a new habit gets: the chip
                                   picked, else the best fit, else
                                   the picker asks ("Pick an icon for
                                   this habit"), else a star

   The picker is a <dialog> (showModal): Escape or a tap outside
   closes it; a bottom sheet on a phone, centered on a computer.
========================================== */

import { icon } from "./icons.js";
import { HABIT_ICONS, HABIT_ICON_CATEGORIES, suggestIcons, searchIcons, habitIconId, habitIconSrc, habitIconById, DEFAULT_HABIT_ICON } from "./habitIconSet.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function iconImg(id, size = 24) {
    return `<img class="sb-habit-img" src="${habitIconSrc(id)}" width="${size}" height="${size}" alt="" decoding="async">`;
}

// The tile a habit row shows. With edit: true it's a button that changes it.
export function habitIconHtml(habit, { edit = false, size = 28 } = {}) {
    const id = habitIconId(habit);
    if (!edit) return `<span class="sb-habit-icon" title="${esc(habitIconById(id)?.label)}">${iconImg(id, size)}</span>`;
    return `<button type="button" class="sb-habit-icon is-edit" data-change-icon="${esc(habit.id)}" aria-label="Change the icon for ${esc(habit.name)}" title="Change icon">${iconImg(id, size)}<span class="sb-habit-icon-pen" aria-hidden="true">${icon("edit")}</span></button>`;
}

/* ---------- the picker ---------- */

let dialog = null;
let settle = null;

function grid(ids) {
    return `<div class="sb-hip-grid">${ids.map(id => {
        const icon = habitIconById(id);
        return `<button type="button" class="sb-hip-choice" data-hip-id="${id}" title="${esc(icon.label)}">
            ${iconImg(id, 34)}<span>${esc(icon.label)}</span></button>`;
    }).join("")}</div>`;
}

function fillBody(query, name) {
    const body = dialog.querySelector(".sb-hip-body");
    const q = String(query || "").trim();
    if (q) {
        const hits = searchIcons(q);
        body.innerHTML = hits.length
            ? grid(hits)
            : `<p class="sb-hip-none">No icon for “${esc(q)}”. Try another word, or pick the closest one below.</p>${grid(HABIT_ICONS.map(i => i.id))}`;
        return;
    }
    const suggested = suggestIcons(name, 6);
    body.innerHTML = (suggested.length ? `<div class="sb-hip-cat"><div class="sb-hip-cat-label">Fits “${esc(name)}”</div>${grid(suggested)}</div>` : "")
        + HABIT_ICON_CATEGORIES.map(cat => `<div class="sb-hip-cat"><div class="sb-hip-cat-label">${esc(cat)}</div>
            ${grid(HABIT_ICONS.filter(i => i.category === cat).map(i => i.id))}</div>`).join("");
}

function finish(value) {
    if (!dialog) return;
    const done = settle;
    settle = null;
    if (dialog.open) dialog.close();
    done?.(value);
}

function buildDialog() {
    const d = document.createElement("dialog");
    d.className = "sb-hip";
    d.innerHTML = `
        <div class="sb-hip-head">
            <div>
                <div class="sb-hip-title"></div>
                <div class="sb-hip-sub"></div>
            </div>
            <button type="button" class="sb-hip-close" aria-label="Close">×</button>
        </div>
        <input type="search" class="sb-hip-search" placeholder="Search icons (water, sleep, bible…)" aria-label="Search icons" autocomplete="off">
        <div class="sb-hip-body"></div>
        <div class="sb-hip-foot"><button type="button" class="sb-btn sb-btn-tertiary sb-hip-skip">Use a star for now</button></div>`;
    d.addEventListener("click", event => {
        if (event.target === d || event.target.closest(".sb-hip-close")) return finish(null);
        if (event.target.closest(".sb-hip-skip")) return finish(DEFAULT_HABIT_ICON);
        const choice = event.target.closest("[data-hip-id]");
        if (choice) finish(choice.dataset.hipId);
    });
    d.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    d.querySelector(".sb-hip-search").addEventListener("input", event => fillBody(event.target.value, d.dataset.name || ""));
    document.body.appendChild(d);
    return d;
}

// Resolves to the icon ID picked, or null when closed without one.
// skip: show "Use a star for now" (adding a habit nothing fits).
export function pickHabitIcon({ name = "", current = null, title, sub, skip = false } = {}) {
    finish(null);
    dialog ||= buildDialog();
    dialog.dataset.name = name;
    dialog.querySelector(".sb-hip-title").textContent = title || "Pick an icon";
    const subEl = dialog.querySelector(".sb-hip-sub");
    subEl.textContent = sub || (name ? `For “${name}”` : "");
    subEl.hidden = !subEl.textContent;
    dialog.querySelector(".sb-hip-foot").hidden = !skip;
    const search = dialog.querySelector(".sb-hip-search");
    search.value = "";
    fillBody("", name);
    dialog.querySelectorAll(`[data-hip-id="${current}"]`).forEach(b => b.classList.add("is-current"));
    dialog.classList.toggle("is-sheet", window.matchMedia("(max-width:600px)").matches);
    return new Promise(resolve => {
        settle = resolve;
        dialog.showModal();
        dialog.scrollTop = 0;
        dialog.querySelector(".sb-hip-body").scrollTop = 0;
        // Focus the search on a computer; on a phone the keyboard would cover the icons.
        if (!dialog.classList.contains("is-sheet")) search.focus();
        else dialog.querySelector(".sb-hip-close").focus();
    });
}

/* ---------- suggestions while typing ---------- */

// Adds a row of icon chips after `anchor` (default: the input's parent row)
// that follow what's typed. Returns { chosen() } for the add handler.
export function attachIconSuggestions(input, { anchor = input.parentElement } = {}) {
    if (!input || input.dataset.iconSuggest) return input?._iconSuggest;
    input.dataset.iconSuggest = "1";
    const row = document.createElement("div");
    row.className = "sb-habit-suggest";
    row.setAttribute("aria-live", "polite");
    row.hidden = true;
    anchor.after(row);

    let picked = null;      // chosen by tapping a chip or the picker
    let shown = [];

    const draw = () => {
        const name = input.value.trim();
        if (name.length < 2) { row.hidden = true; row.innerHTML = ""; picked = null; shown = []; return; }
        shown = suggestIcons(name, 4);
        if (picked && !shown.includes(picked)) shown = [picked, ...shown].slice(0, 4);
        const current = picked || shown[0] || null;
        row.hidden = false;
        row.innerHTML = shown.length
            ? `<span class="sb-habit-suggest-label">Icon</span>
               ${shown.map(id => `<button type="button" class="sb-habit-chip${id === current ? " is-on" : ""}" data-suggest-id="${id}" aria-pressed="${id === current}" title="${esc(habitIconById(id).label)}">${iconImg(id, 28)}</button>`).join("")}
               <button type="button" class="sb-habit-more" data-suggest-more>More…</button>`
            : `<span class="sb-habit-suggest-label">No icon fits “${esc(name)}” yet.</span>
               <button type="button" class="sb-habit-more is-strong" data-suggest-more>Pick an icon</button>`;
    };

    row.addEventListener("click", async event => {
        const chip = event.target.closest("[data-suggest-id]");
        if (chip) { picked = chip.dataset.suggestId; draw(); return; }
        if (event.target.closest("[data-suggest-more]")) {
            const name = input.value.trim();
            const id = await pickHabitIcon({ name, current: picked || shown[0], title: "Pick an icon for this habit" });
            if (id) { picked = id; draw(); }
            input.focus();
        }
    });
    input.addEventListener("input", () => {
        if (picked && !input.value.trim()) picked = null;
        draw();
    });

    const api = {
        chosen: () => picked || (input.value.trim() ? suggestIcons(input.value, 1)[0] : null) || null,
        reset: () => { picked = null; draw(); }
    };
    input._iconSuggest = api;
    return api;
}

// The icon a new habit gets. When nothing was picked and nothing fits, the
// picker asks; closing it keeps the habit from being added (null).
export async function iconForNewHabit(name, suggest) {
    const id = suggest?.chosen?.() || suggestIcons(name, 1)[0];
    if (id) return id;
    return pickHabitIcon({ name, title: "Pick an icon for this habit", sub: `Nothing matched “${name}”. Which one fits best?`, skip: true });
}
