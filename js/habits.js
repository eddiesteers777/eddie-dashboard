/* ==========================================
   Southbound Habits

   Same underlying data as the old 75-Day page --
   'habits' and 'entries' in localStorage, same
   shapes -- just no longer bound to a fixed
   date range. Tracks indefinitely.
========================================== */

import { icon } from "./icons.js";
import { inferHabitVisual, habitVisual } from "./habitIcons.js";

// Habits saved before icons existed have the emoji baked into the
// name itself (e.g. "🙏 Prayer") -- strip it so it isn't shown
// twice, and fall back to a generic icon since we don't know which
// one it used to be.
const EMOJI_PREFIX = /^\s*(?:\p{Extended_Pictographic}️?)\s*/u;

function habitLabel(h) {
    return h.name.replace(EMOJI_PREFIX, "").trim();
}

function habitIcon(h) {
    const { icon: iconName, color } = habitVisual(h);
    return `<span class="habits-row-icon" style="color:${color}">${icon(iconName)}</span>`;
}

const DEFAULT_HABITS = [
    { id: "h1", name: "Prayer", icon: "pray" },
    { id: "h2", name: "Bible", icon: "bookOpen" },
    { id: "h3", name: "Training Complete", icon: "activity" },
    { id: "h4", name: "Strength", icon: "dumbbell" },
    { id: "h5", name: "Stretch / Mobility", icon: "stretch" },
    { id: "h6", name: "Protein Goal", icon: "drumstick" },
    { id: "h7", name: "Water Goal", icon: "droplet" },
    { id: "h8", name: "Sleep 7+ hrs", icon: "moon" },
    { id: "h9", name: "Read 10 Pages", icon: "bookOpen" },
    { id: "h10", name: "Time with Wife", icon: "heart" }
];

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
        habits = h ? JSON.parse(h) : [...DEFAULT_HABITS];
    } catch {
        habits = [...DEFAULT_HABITS];
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
    let date = todayStr();

    // If today isn't complete yet, that's fine -- don't let an
    // in-progress day zero out yesterday's real streak.
    if (!dayComplete(date)) {
        date = addDays(date, -1);
    }

    let streak = 0;

    while (dayComplete(date)) {
        streak++;
        date = addDays(date, -1);
    }

    return streak;
}

function recentCompletionPct(days = 30) {
    if (habits.length === 0) {
        return null;
    }

    let total = 0;
    let completed = 0;
    let date = todayStr();

    for (let i = 0; i < days; i++) {
        habits.forEach(h => {
            total++;

            if (isChecked(date, h.id)) {
                completed++;
            }
        });

        date = addDays(date, -1);
    }

    return total ? Math.round((completed / total) * 100) : null;
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
}

/* ==========================================
   Today panel
========================================== */

function renderToday() {
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
            <div class="habits-row" data-toggle-habit="${h.id}">
                <div class="habits-check ${checked ? "on" : ""}">${checked ? icon("check") : ""}</div>
                <div class="habits-row-name ${checked ? "done" : ""}">
                    ${habitIcon(h)} ${escapeHtml(habitLabel(h))}
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
            <span>${habitIcon(h)} ${escapeHtml(habitLabel(h))}</span>
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
        return;
    }

    if (target.matches("#habitsNextDay")) {
        selectedDate = addDays(selectedDate, 1);
        renderToday();
        return;
    }

    if (target.matches("#habitsTodayBtn")) {
        selectedDate = todayStr();
        renderToday();
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
        toggleCheck(selectedDate, habitRow.dataset.toggleHabit);
        renderToday();
        renderHero();
        return;
    }

    const calCell = target.closest("[data-jump-to-date]");

    if (calCell) {
        selectedDate = calCell.dataset.jumpToDate;
        setView("today");
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
});

function addNewHabit() {
    const input = document.getElementById("newHabitInput");
    const name = input?.value.trim();

    if (!name) {
        return;
    }

    const visual = inferHabitVisual(name);

    habits.push({
        id: "h" + Date.now(),
        name,
        icon: visual.icon,
        color: visual.color
    });

    saveHabits();

    if (input) {
        input.value = "";
    }

    renderManage();
    renderHero();
}

/* ==========================================
   Init
========================================== */

loadData();
renderAll();

import("./cloudSync.js").then(({ initCloudSync }) => {
    initCloudSync().then(() => {
        loadData();
        renderAll();
    });
}).catch(() => {});
