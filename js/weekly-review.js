/* ==========================================
   Southbound Weekly Review
========================================== */

import {
    getCurrentWeek,
    getWeek,
    getWeekMileage,
    getWeekDays
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
   Marathon miles
========================================== */

function renderMiles(weekNumber) {
    const valueEl = document.getElementById("wrMilesValue");
    const metaEl = document.getElementById("wrMilesMeta");

    let miles = 0;

    try {
        miles = getWeekMileage(weekNumber);
    } catch {
        miles = 0;
    }

    valueEl.textContent = miles ? miles.toFixed(1) : "0";
    metaEl.textContent = "miles this week";

    return miles;
}

/* ==========================================
   Strength volume (from the current plan)
========================================== */

function renderStrength() {
    const valueEl = document.getElementById("wrStrengthValue");
    const metaEl = document.getElementById("wrStrengthMeta");

    let plan = null;

    try {
        plan = JSON.parse(localStorage.getItem("strength-plan") || "null");
    } catch {
        plan = null;
    }

    if (!plan || !Array.isArray(plan.days) || !plan.days.length) {
        valueEl.textContent = "0";
        metaEl.textContent = "no plan built yet";
        return 0;
    }

    let volume = 0;
    let exerciseCount = 0;

    plan.days.forEach(day => {
        (day.exercises || []).forEach(ex => {
            exerciseCount++;
            (ex.sets || []).forEach(set => {
                volume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
            });
        });
    });

    valueEl.textContent = volume.toLocaleString();
    metaEl.textContent = `lb across ${plan.days.length} day${plan.days.length === 1 ? "" : "s"}, ${exerciseCount} exercises`;

    return volume;
}

/* ==========================================
   Cross-training coverage
========================================== */

function renderCrossTraining(weekNumber) {
    const valueEl = document.getElementById("wrCrossValue");
    const metaEl = document.getElementById("wrCrossMeta");

    let days = [];

    try {
        days = getWeekDays(weekNumber);
    } catch {
        days = [];
    }

    const covered = days.filter(
        d => Array.isArray(d.crossTraining) && d.crossTraining.length > 0
    ).length;

    valueEl.textContent = String(covered);
    metaEl.textContent = `of ${days.length || 7} days this week`;

    return covered;
}

/* ==========================================
   Nutrition adherence (last 7 calendar days)
========================================== */

function nutritionKeyFor(date) {
    return "nutrition-" + date.toISOString().split("T")[0];
}

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

        const goal = 3200; // matches nutrition.js's default calorie goal
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

    if (stats.miles > 0) {
        notes.push(`<p>You've logged <strong>${stats.miles.toFixed(1)} miles</strong> this week on the marathon plan.</p>`);
    } else {
        notes.push(`<p>No marathon miles logged for this week yet.</p>`);
    }

    if (stats.strength > 0) {
        notes.push(`<p>Your strength plan totals <strong>${stats.strength.toLocaleString()} lb</strong> of volume across its exercises.</p>`);
    }

    if (stats.cross > 0) {
        notes.push(`<p>Cross-training is covered on <strong>${stats.cross} day${stats.cross === 1 ? "" : "s"}</strong> this week.</p>`);
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

function init() {
    let weekNumber = 1;

    try {
        weekNumber = getCurrentWeek();
        const week = getWeek(weekNumber);
        const rangeEl = document.getElementById("wrWeekRange");

        if (week && rangeEl) {
            rangeEl.textContent = `Week ${weekNumber} of your marathon plan`;
        }
    } catch {
        // Fall through with defaults if the plan can't resolve a week.
    }

    const rangeFallback = document.getElementById("wrWeekRange");
    if (rangeFallback && !rangeFallback.textContent.trim()) rangeFallback.textContent = "Your training this week";

    const stats = {
        miles: renderMiles(weekNumber),
        strength: renderStrength(),
        cross: renderCrossTraining(weekNumber),
        nutrition: renderNutrition(),
        recovery: renderRecovery(),
        gear: renderGear()
    };

    renderSummary(stats);
}

init();

import("./cloudSync.js").then(({ initCloudSync }) => {
    initCloudSync().then(init).catch(() => {});
}).catch(() => {});
