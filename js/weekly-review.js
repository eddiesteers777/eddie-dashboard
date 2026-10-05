/* ==========================================
   Southbound Weekly Review — the header and "Also this week"

   The week's story (audit Phase D) is js/weeklyStory.js (sentence,
   glance, response, recovery, reading, next week), js/weeklyLoad.js
   (training stimulus) and js/thisWeekCard.js (the decision). This file
   draws the week's dates and the compact list at the end: strength,
   cross-training, nutrition (with the day bars) and shoes.
========================================== */

import {
    getCurrentWeek,
    getWeek,
    getAdjustedWeekDays
} from "./marathonData.js";


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function fmtDateRange(start, end) {
    const opts = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

/* ==========================================
   This week = Monday to Sunday (the marathon plan's weeks start on Mondays too)
========================================== */

const pad2 = n => String(n).padStart(2, "0");
const isoLocal = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function thisWeek() {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday, from: isoLocal(monday), today: isoLocal(today), to: isoLocal(sunday) };
}

/* ==========================================
   Strength volume (from the current plan)
========================================== */

function renderStrength(week) {
    const valueEl = document.getElementById("wrStrengthValue");
    const metaEl = document.getElementById("wrStrengthMeta");

    // What was lifted this week (js/strengthHistory.js keeps every logged exercise by day),
    // plus scheduled sessions ticked off on the Strength calendar.
    let history = {};
    let schedule = null;
    try { history = JSON.parse(localStorage.getItem("strength-history") || "{}") || {}; } catch {}
    try { schedule = JSON.parse(localStorage.getItem("strength-schedule") || "null"); } catch {}

    let volume = 0;
    let exercises = 0;
    const days = new Set();
    Object.values(history).forEach(entries => {
        (Array.isArray(entries) ? entries : []).forEach(entry => {
            if (!entry?.date || entry.date < week.from || entry.date > week.to) return;
            exercises++;
            days.add(entry.date);
            (entry.sets || []).forEach(set => { volume += (Number(set.weight) || 0) * (Number(set.reps) || 0); });
        });
    });
    (schedule?.items || []).forEach(item => {
        if (item.completed && item.date >= week.from && item.date <= week.to) days.add(item.date);
    });

    if (!days.size) {
        valueEl.textContent = "0";
        metaEl.textContent = "no strength logged this week";
        return 0;
    }

    valueEl.textContent = volume ? volume.toLocaleString() : String(days.size);
    metaEl.textContent = volume
        ? `lb lifted · ${days.size} session${days.size === 1 ? "" : "s"}, ${exercises} exercise${exercises === 1 ? "" : "s"}`
        : `session${days.size === 1 ? "" : "s"} this week`;

    return volume;
}

/* ==========================================
   Cross-training coverage
========================================== */

function renderCrossTraining(weekNumber) {
    const valueEl = document.getElementById("wrCrossValue");
    const metaEl = document.getElementById("wrCrossMeta");

    let days = [];

    // The plan's days with your own changes (cross-training is attached there).
    try {
        days = getAdjustedWeekDays(weekNumber);
    } catch {
        days = [];
    }

    const covered = days.filter(
        d => Array.isArray(d.crossTraining) && d.crossTraining.length > 0
    ).length;

    valueEl.textContent = String(covered);
    metaEl.textContent = `day${covered === 1 ? "" : "s"} planned this week`;

    return covered;
}

/* ==========================================
   Nutrition adherence (last 7 calendar days)
========================================== */

function nutritionKeyFor(date) {
    return "nutrition-" + date.toISOString().split("T")[0];
}

// Your calorie goal from Nutrition ("nutrition-goals"), else its default for you.
let calorieGoal = 3200;
try { calorieGoal = Number(JSON.parse(localStorage.getItem("nutrition-goals") || "null")?.calories) || 3200; } catch {}

function renderNutrition() {
    const valueEl = document.getElementById("wrNutritionValue");
    const metaEl = document.getElementById("wrNutritionMeta");
    const daysContainer = document.getElementById("wrNutritionDays");

    const results = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        let day = null;

        try {
            const raw = localStorage.getItem(nutritionKeyFor(date));
            day = raw ? JSON.parse(raw) : null;
        } catch {
            day = null;
        }

        const goal = calorieGoal;
        const actual = day?.calories || 0;
        const pct = day ? Math.round((actual / goal) * 100) : null;

        results.push({
            label: date.toLocaleDateString(undefined, { weekday: "short" }),
            pct,
            hasData: !!day
        });
    }

    const withData = results.filter(r => r.hasData);
    const avgPct = withData.length
        ? Math.round(withData.reduce((s, r) => s + r.pct, 0) / withData.length)
        : null;

    valueEl.textContent = avgPct !== null ? `${avgPct}%` : "—";
    metaEl.textContent = withData.length
        ? `avg across ${withData.length} logged day${withData.length === 1 ? "" : "s"}`
        : "no days logged yet";

    daysContainer.innerHTML = results.map(r => {
        const height = r.hasData ? Math.min(100, r.pct) : 0;
        const color =
            !r.hasData ? "var(--surface-light)"
            : r.pct >= 85 && r.pct <= 115 ? "var(--green)"
            : r.pct > 115 ? "var(--orange)"
            : "var(--yellow)";

        return `
            <div class="wr-nutrition-day ${r.hasData ? "" : "no-data"}">
                <div class="wr-nutrition-day-label">${escapeHtml(r.label)}</div>
                <div class="wr-nutrition-day-bar-track">
                    <div
                        class="wr-nutrition-day-bar-fill"
                        style="height:${height}%;background:${color};"></div>
                </div>
                <div class="wr-nutrition-day-pct">
                    ${r.hasData ? r.pct + "%" : "—"}
                </div>
            </div>
        `;
    }).join("");

    return avgPct;
}

/* ==========================================
   Gear
========================================== */

function renderGear() {
    const valueEl = document.getElementById("wrGearValue");
    const metaEl = document.getElementById("wrGearMeta");

    let shoes = [];

    try {
        shoes = JSON.parse(localStorage.getItem("gear-shoes") || "[]");
    } catch {
        shoes = [];
    }

    const active = shoes.filter(s => !s.retired);

    const nearing = active.filter(s => {
        const logged = (s.mileageLog || []).reduce((sum, e) => sum + (Number(e.miles) || 0), 0);
        const miles = (Number(s.startingMiles) || 0) + logged;
        return miles >= (s.threshold || 400) * 0.8;
    });

    valueEl.textContent = String(nearing.length);
    metaEl.textContent = active.length
        ? `of ${active.length} active pair${active.length === 1 ? "" : "s"}`
        : "no shoes tracked yet";

    return nearing.length;
}

/* ==========================================
   Init
========================================== */

function init() {
    const week = thisWeek();
    const rangeEl = document.getElementById("wrWeekRange");
    try {
        const weekNumber = getCurrentWeek();
        if (getWeek(weekNumber) && rangeEl) rangeEl.textContent = `Week ${weekNumber} of your marathon plan · ${fmtDateRange(week.monday, week.sunday)}`;
    } catch {
        // Fall through with defaults if the plan can't resolve a week.
    }
    if (rangeEl && !rangeEl.textContent.trim()) rangeEl.textContent = `Your training this week · ${fmtDateRange(week.monday, week.sunday)}`;
    let weekNumber = 1;
    try { weekNumber = getCurrentWeek(); } catch { weekNumber = 1; }
    renderStrength(week);
    renderCrossTraining(weekNumber);
    renderNutrition();
    renderGear();
}

init();


// Training load this week: the athlete model's blended load, by day (js/weeklyLoad.js).
import("./weeklyLoad.js").then(m => m.mountWeeklyLoad(document.getElementById("wrLoad")))
    .catch(error => console.error("Southbound: training load section failed to load.", error));

import("./cloudSync.js").then(({ initCloudSync }) => {
    initCloudSync().then(init).catch(() => {});
}).catch(() => {});
