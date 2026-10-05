/* ==========================================
   Southbound Weekly Review
========================================== */

import {
    getCurrentWeek,
    getWeek,
    getAdjustedWeekDays
} from "./marathonData.js";

import { describeCorosFreshness } from "./corosStatus.js";

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
   Miles run: what you actually ran (COROS, Strava, the Running Log,
   each run once: js/athleteLedger.js) against what the plan asks for
========================================== */

function plannedMiles(weekNumber) {
    try {
        return getAdjustedWeekDays(weekNumber).reduce((sum, day) => sum + (Number(day.miles) || 0), 0);
    } catch {
        return 0;
    }
}

async function actualRuns(week) {
    const { loadLedger } = await import("./athleteData.js");
    const sessions = await loadLedger(week.today);
    return sessions.filter(s => s.date >= week.from && s.date <= week.today);
}

function renderMiles({ miles, runs, planned }) {
    const valueEl = document.getElementById("wrMilesValue");
    const metaEl = document.getElementById("wrMilesMeta");
    if (miles == null) {
        valueEl.textContent = "—";
        metaEl.textContent = planned ? `${planned.toFixed(1)} planned this week` : "this week";
        return;
    }
    valueEl.textContent = miles.toFixed(1);
    metaEl.textContent = `${runs} run${runs === 1 ? "" : "s"}${planned ? ` · ${planned.toFixed(1)} planned this week` : " this week"}`;
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
   Recovery (latest COROS snapshot)
========================================== */

function renderRecovery() {
    const valueEl = document.getElementById("wrRecoveryValue");
    const metaEl = document.getElementById("wrRecoveryMeta");

    let snapshot = null;

    try {
        snapshot = JSON.parse(
            localStorage.getItem("__eddieos_coros_data_snapshot_v2") || "null"
        );
    } catch {
        snapshot = null;
    }

    // The newest recovery COROS gave (Today's Readiness card saves it by day).
    try {
        const days = JSON.parse(localStorage.getItem("coros-fitness-history") || "{}") || {};
        const day = Object.keys(days).filter(d => days[d]?.recovery?.percent != null).sort().at(-1);
        const snapDay = snapshot?.fetchedAt ? isoLocal(new Date(snapshot.fetchedAt)) : "";
        if (day && day >= snapDay) {
            const percent = Number(days[day].recovery.percent);
            valueEl.textContent = `${Math.round(percent)}%`;
            metaEl.textContent = day === isoLocal(new Date()) ? "COROS, today" : `COROS, ${new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
            return percent;
        }
    } catch {}

    if (!snapshot) {
        valueEl.textContent = "—";
        metaEl.textContent = "no COROS data synced yet";
        return null;
    }

    const recoveryData = snapshot.recovery;
    const percent = findNumeric(recoveryData, [
        "recoveryPercentage", "recovery_percent", "recoveryScore", "recovery"
    ]);

    if (percent === null) {
        valueEl.textContent = "—";
        metaEl.textContent = "no recovery value returned";
        return null;
    }

    valueEl.textContent = `${Math.round(percent)}%`;
    metaEl.textContent = describeCorosFreshness(snapshot.fetchedAt);

    return percent;
}

function findNumeric(data, keys) {
    if (!data || typeof data !== "object") {
        return null;
    }

    const lower = new Map();

    const walk = (value, prefix = "") => {
        if (!value || typeof value !== "object") return;

        for (const [key, item] of Object.entries(value)) {
            const normalized = `${prefix}${key}`.toLowerCase();
            lower.set(normalized, item);

            if (item && typeof item === "object" && !Array.isArray(item)) {
                walk(item, `${normalized}.`);
            }
        }
    };

    walk(data);

    for (const key of keys) {
        for (const [candidate, value] of lower.entries()) {
            if (candidate === key.toLowerCase() || candidate.endsWith(`.${key.toLowerCase()}`)) {
                const n = Number(value);
                if (Number.isFinite(n)) return n;
            }
        }
    }

    return null;
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
   Summary synthesis
========================================== */

function renderSummary(stats) {
    const el = document.getElementById("wrSummaryText");
    const notes = [];

    if (stats.miles == null) {
        notes.push(`<p>Counting this week's runs…</p>`);
    } else if (stats.miles > 0) {
        notes.push(`<p>You've run <strong>${stats.miles.toFixed(1)} miles</strong> this week${stats.planned ? ` of the <strong>${stats.planned.toFixed(1)}</strong> your plan has for the whole week` : ""} (${stats.runs} run${stats.runs === 1 ? "" : "s"}).</p>`);
    } else {
        notes.push(`<p>No runs yet this week${stats.planned ? ` (${stats.planned.toFixed(1)} miles planned)` : ""}.</p>`);
    }

    if (stats.strength > 0) {
        notes.push(`<p>You've lifted <strong>${stats.strength.toLocaleString()} lb</strong> of volume this week.</p>`);
    }

    if (stats.cross > 0) {
        notes.push(`<p>Cross-training is planned on <strong>${stats.cross} day${stats.cross === 1 ? "" : "s"}</strong> this week.</p>`);
    }

    if (stats.nutrition !== null) {
        const label =
            stats.nutrition >= 85 && stats.nutrition <= 115
                ? "right around"
                : stats.nutrition > 115 ? "above" : "below";

        notes.push(`<p>Nutrition logging is averaging <strong>${label} your calorie goal</strong> (${stats.nutrition}%) on the days you tracked.</p>`);
    }

    if (stats.recovery !== null) {
        notes.push(`<p>Your latest COROS recovery reading is <strong>${Math.round(stats.recovery)}%</strong>.</p>`);
    }

    if (stats.gear > 0) {
        notes.push(`<p><strong>${stats.gear} pair${stats.gear === 1 ? "" : "s"}</strong> of shoes are getting close to their replacement mileage — worth a look on the Gear page.</p>`);
    }

    el.innerHTML = notes.join("");
}

/* ==========================================
   Init
========================================== */

let current = null;

function init() {
    let weekNumber = 1;
    const week = thisWeek();

    try {
        weekNumber = getCurrentWeek();
        const planWeek = getWeek(weekNumber);
        const rangeEl = document.getElementById("wrWeekRange");

        if (planWeek && rangeEl) {
            rangeEl.textContent = `Week ${weekNumber} of your marathon plan · ${fmtDateRange(week.monday, week.sunday)}`;
        }
    } catch {
        // Fall through with defaults if the plan can't resolve a week.
    }

    const rangeFallback = document.getElementById("wrWeekRange");
    if (rangeFallback && !rangeFallback.textContent.trim()) rangeFallback.textContent = `Your training this week · ${fmtDateRange(week.monday, week.sunday)}`;

    const planned = plannedMiles(weekNumber);
    const stats = {
        miles: current?.miles ?? null,
        runs: current?.runs ?? 0,
        planned,
        strength: renderStrength(week),
        cross: renderCrossTraining(weekNumber),
        nutrition: renderNutrition(),
        recovery: renderRecovery(),
        gear: renderGear()
    };
    renderMiles(stats);
    renderSummary(stats);
    countRuns(week, stats);
}

// The miles come from the run list, which takes a moment: draw, then fill them in.
async function countRuns(week, stats) {
    try {
        const runs = await actualRuns(week);
        const miles = runs.reduce((sum, s) => sum + (Number(s.distance) || 0), 0) / 1609.344;
        current = { miles: Math.round(miles * 10) / 10, runs: runs.length };
        Object.assign(stats, current);
    } catch (error) {
        console.error("Southbound: this week's runs couldn't be counted.", error);
        Object.assign(stats, { miles: 0, runs: 0 });
    }
    renderMiles(stats);
    renderSummary(stats);
}

init();

// New runs (just pulled from COROS, or a Strava import) update the cards.
let redrawTimer = null;
for (const name of ["eddieos:coros-history-updated", "sb:strava-updated"]) {
    window.addEventListener(name, () => { clearTimeout(redrawTimer); redrawTimer = setTimeout(init, 300); });
}

// Training load this week: the athlete model's blended load, by day (js/weeklyLoad.js).
import("./weeklyLoad.js").then(m => m.mountWeeklyLoad(document.getElementById("wrLoad")))
    .catch(error => console.error("Southbound: training load section failed to load.", error));

import("./cloudSync.js").then(({ initCloudSync }) => {
    initCloudSync().then(init).catch(() => {});
}).catch(() => {});
