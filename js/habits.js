/* ==========================================
   Southbound Habits

   Same underlying data as the old 75-Day page --
   'habits' and 'entries' in localStorage, same
   shapes -- just no longer bound to a fixed
   date range. Tracks indefinitely.
========================================== */

import { icon } from "./icons.js";
import { storedIcon, habitIconId } from "./habitIconSet.js";
import { habitIconHtml, attachIconSuggestions, iconForNewHabit, pickHabitIcon, useLineIcons } from "./habitIconPicker.js";
import { showsPersonalPlan } from "./role.js";
import { COACH_HABITS, CLIENT_HABITS } from "./habitDefaults.js";
import { habitStreak, streakAtRisk, weekBar, recentCompletionPct as completionPct, ringValues } from "./habitProgress.js";

// The Habits page draws line icons, like the rest of the app (Today and 75-Day keep the drawn tiles).
useLineIcons(true);

// Habits saved before icons existed have the emoji baked into the
// name itself (e.g. "🙏 Prayer") -- strip it so it isn't shown
// twice, and fall back to a generic icon since we don't know which
// one it used to be.
const EMOJI_PREFIX = /^\s*(?:\p{Extended_Pictographic}️?)\s*/u;

function habitLabel(h) {
    return h.name.replace(EMOJI_PREFIX, "").trim();
}

// The drawn Southbound icon (habit-icons/*.svg): the one picked for the
// habit, else the one its name suggests (js/habitIconSet.js).
function habitIcon(h, options) {
    return habitIconHtml(h, options);
}

// The starting lists live in js/habitDefaults.js (shared with Today's
// habit row). Copies: the page edits habits in place (rename, icon) and
// the shared lists are frozen.
const DEFAULT_HABITS = (showsPersonalPlan() ? COACH_HABITS : CLIENT_HABITS).map(h => ({ ...h }));

let habits = [];
let entries = {};
let currentView = "today";
let selectedDate = todayStr();
let calendarMonth = new Date();
calendarMonth.setDate(1);

/* ==========================================
   Date helpers (UTC-anchored on purpose, same
   convention the original page used -- both
   parsing and formatting go through UTC, so
   they stay consistent with each other and
   never drift by a day)
========================================== */

function toDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function toStr(d) {
    return d.toISOString().slice(0, 10);
}

function addDays(s, n) {
    const d = toDate(s);
    d.setUTCDate(d.getUTCDate() + n);
    return toStr(d);
}

function fmtNice(s) {
    const d = toDate(s);
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC"
    });
}

function todayStr() {
    const d = new Date();
    return toStr(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* ==========================================
   Persistence -- same keys, same shapes as
   the old page, so nothing already stored is
   ever lost or duplicated.
========================================== */

function loadData() {
    try {
        const h = localStorage.getItem("habits");
        habits = h ? JSON.parse(h) : DEFAULT_HABITS.map(x => ({ ...x }));
    } catch {
        habits = DEFAULT_HABITS.map(x => ({ ...x }));
    }

    try {
        const e = localStorage.getItem("entries");
        entries = e ? JSON.parse(e) : {};
    } catch {
        entries = {};
    }
}

function saveHabits() {
    localStorage.setItem("habits", JSON.stringify(habits));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

function saveEntries() {
    localStorage.setItem("entries", JSON.stringify(entries));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

/* ==========================================
   Core habit logic (same as the original page)
========================================== */

function isChecked(date, habitId) {
    return !!(entries[date] && entries[date][habitId]);
}

function toggleCheck(date, habitId) {
    if (!entries[date]) {
        entries[date] = {};
    }

    entries[date][habitId] = !entries[date][habitId];

    if (!entries[date][habitId]) {
        delete entries[date][habitId];
    }

    saveEntries();
}

function dayComplete(date) {
    if (habits.length === 0) {
        return false;
    }

    return habits.every(h => isChecked(date, h.id));
}

function dayPct(date) {
    if (habits.length === 0) {
        return 0;
    }

    const complete = habits.filter(h => isChecked(date, h.id)).length;
    return Math.round((complete / habits.length) * 100);
}

/* ==========================================
   Streak & rolling completion -- rewritten to
   walk backward through real calendar dates
   instead of indexing into a fixed-length
   array, since there's no fixed end anymore.
========================================== */

function currentStreak() {
    return habitStreak(entries, habits, todayStr());
}

function recentCompletionPct(days = 30) {
    return completionPct(entries, habits, todayStr(), days);
}

/* ==========================================
   Hero stats
========================================== */

function renderHero() {
    const streakEl = document.getElementById("habitsStreakValue");
    const completionEl = document.getElementById("habitsCompletionValue");

    if (streakEl) {
        streakEl.textContent = String(currentStreak());
    }

    if (completionEl) {
        const pct = recentCompletionPct(30);
        completionEl.textContent = pct === null ? "--" : `${pct}%`;
    }

    renderWeek();
    publishRings();
}

/* ==========================================
   This week: Monday to Sunday, from the same
   check-offs. The streak is the page's own
   (js/todayCues.js); a cue shows only when a
   real streak is at risk.
========================================== */

function renderWeek(riseKey = null) {
    const bar = document.getElementById("habitsWeekBar");
    const count = document.getElementById("habitsWeekCount");
    const cue = document.getElementById("habitsWeekCue");

    if (!bar) {
        return;
    }

    const today = todayStr();
    const week = weekBar(entries, habits, today);

    if (count) {
        count.textContent = `${week.completeDays} of 7 days complete`;
    }

    bar.innerHTML = week.days.map(d => {
        const label = d.state === "future"
            ? `${fmtNice(d.key)}, upcoming`
            : `${fmtNice(d.key)}, ${d.done} of ${d.total} done`;
        const fill = d.state === "future" ? 0 : d.pct;

        return `
            <button
                type="button"
                class="habits-week-day is-${d.state}${d.isToday ? " is-today" : ""}${d.key === selectedDate ? " is-selected" : ""}"
                ${d.state === "future" ? "disabled" : `data-jump-to-date="${d.key}"`}
                aria-label="${escapeHtml(label)}"
                ${d.isToday ? 'aria-current="date"' : ""}>
                <span class="habits-week-letter" aria-hidden="true">${d.letter}</span>
                <span class="habits-week-tank" aria-hidden="true">
                    <i class="habits-week-fill${d.key === riseKey ? " is-rising" : ""}" style="height:${fill}%"></i>
                    ${d.state === "complete" ? `<span class="habits-week-check">${icon("check")}</span>` : ""}
                </span>
            </button>
        `;
    }).join("");

    if (cue) {
        const atRisk = streakAtRisk(entries, habits, today);

        cue.hidden = !atRisk;
        cue.textContent = atRisk
            ? `${atRisk} day streak. Finish today's habits to keep it.`
            : "";
    }
}

// The page drawing's three rings follow real progress: today, this week, last 30 days.
function publishRings() {
    const values = ringValues(entries, habits, todayStr());

    document.documentElement.dataset.sbHabitRings = values.map(v => v.toFixed(3)).join(",");
    window.dispatchEvent(new CustomEvent("sb-habit-rings"));
}

/* ==========================================
   Today panel
========================================== */

function renderToday(justOn = null) {
    const label = document.getElementById("habitsDayLabel");
    const countEl = document.getElementById("habitsChecklistCount");
    const list = document.getElementById("habitsChecklist");

    if (!list) {
        return;
    }

    if (label) {
        const today = todayStr();
        label.textContent = selectedDate === today
            ? `Today · ${fmtNice(selectedDate)}`
            : fmtNice(selectedDate);
    }

    const doneCount = habits.filter(h => isChecked(selectedDate, h.id)).length;

    if (countEl) {
        countEl.textContent = `${doneCount}/${habits.length} done`;
    }

    const bar = document.getElementById("habitsProgress");

    if (bar) {
        const pct = habits.length ? Math.round(doneCount / habits.length * 100) : 0;

        bar.setAttribute("aria-valuenow", String(pct));
        bar.setAttribute("aria-valuetext", `${doneCount} of ${habits.length} done`);
        bar.firstElementChild.style.width = `${pct}%`;
    }

    if (!habits.length) {
        list.innerHTML = `
            <div class="habits-empty-note">
                No habits yet — add one in the Habits tab.
            </div>
        `;
        return;
    }

    list.innerHTML = habits.map(h => {
        const checked = isChecked(selectedDate, h.id);

        return `
            <div class="habits-row${h.id === justOn ? " just-on" : ""}" data-toggle-habit="${h.id}" role="checkbox" aria-checked="${checked}" tabindex="0">
                <div class="habits-check ${checked ? "on" : ""}">${checked ? icon("check") : ""}</div>
                <div class="habits-row-name ${checked ? "done" : ""}">
                    ${habitIcon(h)} <span>${escapeHtml(habitLabel(h))}</span>
                </div>
            </div>
        `;
    }).join("");
}

/* ==========================================
   Calendar panel -- month grid, same visual
   language as the Running page's Month view
========================================== */

function renderCalendar() {
    const label = document.getElementById("habitsCalLabel");
    const grid = document.getElementById("habitsCalGrid");

    if (!grid) {
        return;
    }

    if (label) {
        label.textContent = calendarMonth.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric"
        });
    }

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayStr();

    const cells = [];

    for (let i = 0; i < startOffset; i++) {
        cells.push(`<div class="habits-cal-cell empty"></div>`);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const localDate = new Date(year, month, d);
        // Build the date string from local components (not
        // toISOString) so this always matches the local calendar
        // day, regardless of timezone.
        const dateStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;

        const isFuture = dateStr > today;
        const isToday = dateStr === today;

        let bg = "";

        if (!isFuture) {
            const pct = dayPct(dateStr);

            if (pct === 100) {
                bg = "background:var(--primary);color:#0f2019;";
            } else if (pct >= 50) {
                bg = "background:var(--teal);color:#0f2019;";
            } else if (pct > 0) {
                bg = "background:var(--amber);color:#0f2019;";
            }
        }

        cells.push(`
            <div
                class="habits-cal-cell ${isToday ? "today" : ""} ${isFuture ? "future" : ""}"
                style="${bg}"
                ${isFuture ? "" : `data-jump-to-date="${dateStr}"`}
                title="${isFuture ? "Upcoming" : fmtNice(dateStr) + " — " + dayPct(dateStr) + "%"}">
                ${d}
            </div>
        `);
    }

    grid.innerHTML = cells.join("");
}

/* ==========================================
   Habits management panel
========================================== */

function renderManage() {
    const list = document.getElementById("habitsManageList");

    if (!list) {
        return;
    }

    if (!habits.length) {
        list.innerHTML = `
            <div class="habits-empty-note">
                No habits yet — add your first one below.
            </div>
        `;
        return;
    }

    list.innerHTML = habits.map(h => `
        <div class="habits-manage-item">
            <span>${habitIcon(h, { edit: true })} ${escapeHtml(habitLabel(h))}</span>
            <button
                type="button"
                class="habits-del-btn"
                data-del-habit="${h.id}"
                title="Remove">
                ${icon("close")}
            </button>
        </div>
    `).join("");
}

/* ==========================================
   View switching + master render
========================================== */

function setView(view) {
    currentView = view;

    document.querySelectorAll("[data-habits-view]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.habitsView === view);
    });

    document.querySelectorAll("[data-habits-panel]").forEach(panel => {
        panel.classList.toggle("active", panel.dataset.habitsPanel === view);
    });

    renderAll();
}

function renderAll() {
    renderHero();

    if (currentView === "today") renderToday();
    if (currentView === "calendar") renderCalendar();
    if (currentView === "habits") renderManage();
}

/* ==========================================
   Event wiring
========================================== */

document.addEventListener("click", e => {
    const target = e.target;

    const viewBtn = target.closest("[data-habits-view]");

    if (viewBtn) {
        setView(viewBtn.dataset.habitsView);
        return;
    }

    if (target.matches("#habitsPrevDay")) {
        selectedDate = addDays(selectedDate, -1);
        renderToday();
        renderWeek();
        return;
    }

    if (target.matches("#habitsNextDay")) {
        selectedDate = addDays(selectedDate, 1);
        renderToday();
        renderWeek();
        return;
    }

    if (target.matches("#habitsTodayBtn")) {
        selectedDate = todayStr();
        renderToday();
        renderWeek();
        return;
    }

    if (target.matches("#habitsCalPrev")) {
        calendarMonth.setMonth(calendarMonth.getMonth() - 1);
        renderCalendar();
        return;
    }

    if (target.matches("#habitsCalNext")) {
        calendarMonth.setMonth(calendarMonth.getMonth() + 1);
        renderCalendar();
        return;
    }

    if (target.matches("#habitsCalToday")) {
        calendarMonth = new Date();
        calendarMonth.setDate(1);
        renderCalendar();
        return;
    }

    const habitRow = target.closest("[data-toggle-habit]");

    if (habitRow) {
        const habitId = habitRow.dataset.toggleHabit;
        toggleCheck(selectedDate, habitId);

        // Only a tick animates: the check, a small fill on that habit, the bar, the week and the rings.
        const on = isChecked(selectedDate, habitId);
        renderToday(on ? habitId : null);
        renderHero();
        if (on) renderWeek(selectedDate);
        document.querySelector(`[data-toggle-habit="${CSS.escape(habitId)}"]`)?.focus({ preventScroll: true });
        return;
    }

    const calCell = target.closest("[data-jump-to-date]");

    if (calCell) {
        selectedDate = calCell.dataset.jumpToDate;
        setView("today");
        return;
    }

    const iconBtn = target.closest("[data-change-icon]");

    if (iconBtn) {
        changeIcon(iconBtn.dataset.changeIcon);
        return;
    }

    const delBtn = target.closest("[data-del-habit]");

    if (delBtn) {
        habits = habits.filter(h => h.id !== delBtn.dataset.delHabit);
        saveHabits();
        renderManage();
        renderHero();
        return;
    }

    if (target.matches("#addHabitBtn")) {
        addNewHabit();
        return;
    }
});

document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.id === "newHabitInput") {
        addNewHabit();
    }

    // A habit row is a checkbox: Space or Enter ticks it.
    if ((e.key === " " || e.key === "Enter") && e.target.matches?.("[data-toggle-habit]")) {
        e.preventDefault();
        e.target.click();
    }
});

async function addNewHabit() {
    const input = document.getElementById("newHabitInput");
    const name = input?.value.trim();

    if (!name) {
        return;
    }

    // The chip they tapped, else the best fit, else the picker asks.
    // Closing the picker without choosing leaves the name in the field.
    const iconId = await iconForNewHabit(name, input._iconSuggest);

    if (!iconId) {
        input?.focus();
        return;
    }

    habits.push({
        id: "h" + Date.now(),
        name,
        icon: storedIcon(iconId)
    });

    saveHabits();

    if (input) {
        input.value = "";
        input._iconSuggest?.reset();
    }

    renderManage();
    renderHero();
}

async function changeIcon(habitId) {
    const habit = habits.find(h => h.id === habitId);

    if (!habit) {
        return;
    }

    const iconId = await pickHabitIcon({
        name: habitLabel(habit),
        current: habitIconId(habit),
        title: "Change the icon"
    });

    if (!iconId) {
        return;
    }

    habit.icon = storedIcon(iconId);
    delete habit.color;
    saveHabits();
    renderAll();
    document.querySelector(`[data-change-icon="${CSS.escape(habitId)}"]`)?.focus();
}

/* ==========================================
   Init
========================================== */

loadData();
renderAll();

// The bar eases on a tick, not when the page first draws it.
requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("habitsProgress")?.classList.add("is-live")));

{
    const input = document.getElementById("newHabitInput");
    if (input) attachIconSuggestions(input, { anchor: input.closest(".habits-add-row") });
}

import("./cloudSync.js").then(({ initCloudSync }) => {
    initCloudSync().then(() => {
        loadData();
        renderAll();
    });
}).catch(() => {});
