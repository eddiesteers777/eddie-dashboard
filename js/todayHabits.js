/* ==========================================
   Southbound — Today's habits (#todayHabits on Today)

   One tap per habit, the same check-offs as the Habits page ("habits"
   and "entries" in localStorage, cloud-synced). Added in redesign
   step 3 (2026-10-14) when Habits left the phone tab bar for anyone
   who has Fuel: checking a habit off stays one tap, here.
   Fires "sb:habits-changed" so Today's streak box redraws.
========================================== */

import { habitList, dayKey, toggleEntry, doneOn } from "./habitDefaults.js";
import { habitIconHtml } from "./habitIconPicker.js";
import { showsPersonalPlan } from "./role.js";
import { icon } from "./icons.js";
import { celebrateHabit } from "./celebrate.js";

const EMOJI_PREFIX = /^\s*(?:\p{Extended_Pictographic}️?)\s*/u;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

function render(el) {
    const habits = habitList(read("habits", null), showsPersonalPlan());
    const entries = read("entries", {});
    const day = dayKey();
    const done = doneOn(entries, day, habits);
    const rows = habits.map(h => {
        const on = Boolean(entries?.[day]?.[h.id]);
        return `<li><button type="button" class="th-row${on ? " is-on" : ""}" data-habit="${esc(h.id)}" aria-pressed="${on}">
            <span class="th-check" aria-hidden="true">${on ? icon("check") : ""}</span>
            ${habitIconHtml(h)}
            <span class="th-name">${esc(String(h.name || "").replace(EMOJI_PREFIX, "").trim())}</span>
        </button></li>`;
    }).join("");
    el.innerHTML = `
        <div class="eos-today-card-header">
            <h2>Today's habits</h2>
            <span class="th-count">${habits.length ? `${done} of ${habits.length}` : ""}</span>
        </div>
        ${habits.length
            ? `<ul class="th-list">${rows}</ul>`
            : `<p class="th-empty">No habits yet.</p>`}
        <a class="th-all" href="habits.html">${habits.length ? "All habits" : "Add a habit"} <span data-icon="chevronRight"></span></a>`;
    import("./icons.js").then(m => m.hydrate?.()).catch(() => {});
}

function init() {
    const el = document.getElementById("todayHabits");
    if (!el) return;
    render(el);
    el.addEventListener("click", event => {
        const btn = event.target.closest("[data-habit]");
        if (!btn) return;
        // Only a keyboard user gets focus put back on the redrawn button. On a
        // phone a tap doesn't focus it, and focusing it from script drew the
        // keyboard ring (a box around the whole button) after every tap.
        const keepFocus = btn.matches(":focus-visible");
        const next = toggleEntry(read("entries", {}), dayKey(), btn.dataset.habit);
        try { localStorage.setItem("entries", JSON.stringify(next)); } catch { return; }
        import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
        render(el);
        const fresh = el.querySelector(`[data-habit="${CSS.escape(btn.dataset.habit)}"]`);
        if (keepFocus) fresh?.focus();
        // Just checked off (not undone): the circle pops; the day's last one sweeps the card (js/celebrate.js).
        if (next?.[dayKey()]?.[btn.dataset.habit]) {
            const habits = habitList(read("habits", null), showsPersonalPlan());
            celebrateHabit(fresh?.querySelector(".sb-habit-icon"), { allDone: habits.length > 0 && doneOn(next, dayKey(), habits) === habits.length });
        }
        window.dispatchEvent(new CustomEvent("sb:habits-changed"));
    });
    // Another device's check-offs arrive through cloud sync on the next load;
    // coming back to the page redraws from what's stored now.
    window.addEventListener("pageshow", () => render(el));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
