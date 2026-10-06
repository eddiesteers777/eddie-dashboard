/* ==========================================
   Southbound — Featured Training on the dashboard

   Keeps the dashboard focused on two share-worthy workout types for now:
   Long Runs and Speed Work. Auto classification comes from the plan,
   with interval/repeat formatting taking priority over the generic day
   kind so a hard long workout does not get mislabeled. A coach can
   override any recent completed run as Long Run, Speed Work, Auto or
   Hide. Overrides live in the existing cloud-synced localStorage
   pattern; no new Firestore collection is needed.
========================================== */

import { WEEKS, getAdjustedWeekDays, PACES } from "./marathonData.js";
import { planDayFromMarathon, marathonTitle } from "./marathonCoros.js";
import { kindOfDay } from "./readiness.js";
import { allRuns, fetchLaps, laps } from "./trendsData.js";
import { reconstructWorkout } from "./workoutExecution.js";
import { registerShare, registerRunShare } from "./executionShare.js";

export const FEATURED_KEY = "featured-training-categories";
export const FEATURED_CATEGORIES = Object.freeze({
    LONG_RUN: "long_run",
    SPEED_WORK: "speed_work",
    NONE: "none"
});

const MILE = 1609.344;

const clean = function (value) { return String(value == null ? "" : value).trim(); };

function todayBack(today, days) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - (days - 1));
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}

function loadOverrides() {
    try {
        const raw = JSON.parse(localStorage.getItem(FEATURED_KEY) || "null");
        return raw && typeof raw === "object" ? raw : {};
    } catch {
        return {};
    }
}

export function autoCategory(day, planDay) {
    if (!day || !Number(day.miles) || day.race || planDay?.type === "race") return null;

    const session = clean(day.session);
    const sets = planDay?.workout?.sets || [];

    // Repeats / mixed repeats are an explicit speed signal. This wins
    // over kindOfDay(), which can call a hard 12+ mile day "long".
    const repeatedStructure = sets.some(function (s) {
        return Number(s.repeat) > 1 || (Array.isArray(s.parts) && s.parts.length > 0);
    });
    const intervalWords = /\b(intervals?|repeats?|reps?|fartlek|speed\s+work|hill\s+repeats?)\b/i.test(session);
    const intervalFormat = /\b\d+\s*[x×]\s*\d/i.test(session);

    if (repeatedStructure || intervalWords || intervalFormat) return FEATURED_CATEGORIES.SPEED_WORK;

    if (kindOfDay(day, planDay) === "long" || planDay?.type === "long" || /\blong\s+run\b/i.test(session)) {
        return FEATURED_CATEGORIES.LONG_RUN;
    }

    return null;
}

export function categoryFor(day, planDay, overrides) {
    const id = "marathon|" + (day?.date || "");
    const map = overrides || {};
    const override = map[id];

    if (override === FEATURED_CATEGORIES.LONG_RUN ||
        override === FEATURED_CATEGORIES.SPEED_WORK ||
        override === FEATURED_CATEGORIES.NONE) {
        return override === FEATURED_CATEGORIES.NONE ? null : override;
    }

    return autoCategory(day, planDay);
}

function recentPlanRuns(today, days) {
    const fromIso = todayBack(today, days);
    const runs = allRuns(today);
    const overrides = loadOverrides();
    const out = [];

    WEEKS.forEach(function (_, wi) {
        const weekDays = getAdjustedWeekDays(wi + 1);
        weekDays.forEach(function (day) {
            if (!day?.miles || !day.date || day.date > today || day.date < fromIso) return;

            const run = runs
                .filter(function (r) { return r.date === day.date && Number(r.distance) > 0; })
                .sort(function (a, b) { return Number(b.distance) - Number(a.distance); })[0] || null;
            if (!run) return;

            const planDay = planDayFromMarathon(day, PACES);
            const kind = kindOfDay(day, planDay);

            out.push({
                id: "marathon|" + day.date,
                date: day.date,
                day: day,
                planDay: planDay,
                kind: kind,
                category: categoryFor(day, planDay, overrides),
                autoCategory: autoCategory(day, planDay),
                title: marathonTitle(day.session, Number(day.miles) || 0),
                run: run,
                runMiles: Number(run.distance) / MILE,
                plannedMiles: Number(day.miles) || 0
            });
        });
    });

    return out.sort(function (a, b) { return b.date.localeCompare(a.date); });
}

export function featuredTrainingItems(today, options) {
    const opts = options || {};
    const days = opts.days == null ? 42 : opts.days;
    const limit = opts.limit == null ? 4 : opts.limit;
    return recentPlanRuns(today, days).filter(function (item) { return Boolean(item.category); }).slice(0, limit);
}

export function manageableTrainingItems(today, options) {
    const opts = options || {};
    return recentPlanRuns(today, opts.days == null ? 42 : opts.days);
}

export function saveCategoryOverride(id, category) {
    const value = category === FEATURED_CATEGORIES.LONG_RUN
        ? FEATURED_CATEGORIES.LONG_RUN
        : category === FEATURED_CATEGORIES.SPEED_WORK
            ? FEATURED_CATEGORIES.SPEED_WORK
            : category === FEATURED_CATEGORIES.NONE
                ? FEATURED_CATEGORIES.NONE
                : null;

    const overrides = loadOverrides();
    if (value) overrides[id] = value;
    else delete overrides[id];

    localStorage.setItem(FEATURED_KEY, JSON.stringify(overrides));
    import("./cloudSync.js").then(function (m) { return m.pushToCloud(); }).catch(function () {});
    return overrides;
}

const categoryLabel = function (category) {
    return category === FEATURED_CATEGORIES.LONG_RUN ? "Long Run" : "Speed Work";
};

function fmtMiles(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(2) + " mi";
}

function fmtTime(sec) {
    const n = Math.round(Number(sec));
    if (!Number.isFinite(n) || n <= 0) return "—";
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    return h
        ? h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0")
        : m + ":" + String(s).padStart(2, "0");
}

function fmtPace(sec) {
    const n = Math.round(Number(sec));
    if (!Number.isFinite(n) || n <= 0) return "—";
    return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0") + "/mi";
}

const esc = function (value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
};

const dayWords = function (date) {
    return new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric"
    });
};

function shareFeatured(item) {
    const saved = laps();
    const lapEntry = item.run.labelId ? saved[item.run.labelId] : null;
    const sets = item.planDay?.workout?.sets || [];
    const hasStructuredWork = sets.some(function (s) {
        return Number(s.repeat) > 1 || s.parts || s.pace || s.repTime ||
            (s.effort && !["easy", "recovery"].includes(s.effort));
    });

    if (lapEntry?.laps?.length && hasStructuredWork && item.run.source !== "strava") {
        const x = reconstructWorkout(item.planDay.workout, lapEntry, {
            plannedWorkoutId: item.id,
            activityId: "c:" + item.run.labelId
        });
        registerShare(x, {
            date: item.date,
            name: marathonTitle(item.day.session, item.plannedMiles),
            category: item.category,
            runMeters: item.run.distance,
            runSec: item.run.duration
        });
        return item.id;
    }

    const key = registerRunShare(item.run, {
        date: item.date,
        name: marathonTitle(item.day.session, item.plannedMiles),
        category: item.category,
        plannedMiles: item.plannedMiles,
        runMeters: item.run.distance,
        runSec: item.run.duration
    });
    return key || null;
}

function cardHtml(item) {
    const run = item.run;
    const actual = Number(run.distance) / MILE;
    const paceSec = run.pace_seconds_per_mile ||
        (run.duration && run.distance ? Number(run.duration) / actual : null);
    const shareKey = shareFeatured(item);

    return [
        '<article class="ft-item">',
        '<div class="ft-main">',
        '<div class="ft-top"><span class="ft-type ft-type-', item.category, '">',
        categoryLabel(item.category).toUpperCase(),
        '</span><span class="ft-date">', dayWords(item.date), '</span></div>',
        '<h3>', esc(item.title), '</h3>',
        '<div class="ft-metrics">',
        '<span><strong>', fmtMiles(actual), '</strong> actual</span>',
        '<span><strong>', fmtTime(run.duration), '</strong> time</span>',
        '<span><strong>', fmtPace(paceSec), '</strong> pace</span>',
        run.avgHr ? '<span><strong>' + Math.round(Number(run.avgHr)) + '</strong> bpm</span>' : "",
        '</div></div>',
        '<div class="ft-actions">',
        '<a class="sb-btn sb-btn-tertiary ft-view" href="marathon.html">View plan</a>',
        shareKey ? '<button type="button" class="sb-btn sb-btn-secondary ft-share" data-ex-share="' + esc(shareKey) + '">Share</button>' : "",
        '</div></article>'
    ].join("");
}

function optionsHtml(selected) {
    return [
        ["", "Auto"],
        [FEATURED_CATEGORIES.LONG_RUN, "Long Run"],
        [FEATURED_CATEGORIES.SPEED_WORK, "Speed Work"],
        [FEATURED_CATEGORIES.NONE, "Hide"]
    ].map(function (pair) {
        return '<option value="' + pair[0] + '"' + ((selected || "") === pair[0] ? " selected" : "") + ">" + pair[1] + "</option>";
    }).join("");
}

function managerRowsHtml(items) {
    return items.length
        ? items.map(function (item) {
            return [
                '<label class="ft-manager-row">',
                '<span><strong>', esc(item.title), '</strong><small>', dayWords(item.date), ' · ', fmtMiles(item.runMiles), '</small></span>',
                '<select data-ft-category="', esc(item.id), '" aria-label="Featured type for ', esc(item.title), '">',
                optionsHtml(item.category || ""), '</select></label>'
            ].join("");
        }).join("")
        : '<p class="ft-empty">No completed runs found in the last 6 weeks.</p>';
}

function managerHtml(items) {
    return [
        '<dialog class="sb-dialog ft-manager-dialog"><div class="sb-dialog-form">',
        '<h2 class="sb-dialog-title">Featured Training</h2>',
        '<p class="clients-card-note">Southbound auto-picks long runs and interval-style speed work. Use the selector to override any recent run.</p>',
        '<div class="ft-manager-list">', managerRowsHtml(items), '</div>',
        '<div class="sb-dialog-actions"><button type="button" class="sb-btn sb-btn-tertiary" data-ft-close>Done</button></div>',
        '</div></dialog>'
    ].join("");
}

export function mountFeaturedTraining(options) {
    const host = options?.host;
    const manageButton = options?.manageButton;
    const today = options?.today;
    if (!host || !today) return;

    const render = function () {
        const items = featuredTrainingItems(today);
        host.innerHTML = items.length
            ? items.map(cardHtml).join("")
            : '<p class="ft-empty">No long runs or speed work to show yet. Complete one and it will appear here.</p>';

        if (manageButton && !manageButton.dataset.bound) {
            manageButton.dataset.bound = "true";
            manageButton.addEventListener("click", function () {
                const old = document.querySelector(".ft-manager-dialog");
                if (old) old.remove();

                document.body.insertAdjacentHTML("beforeend", managerHtml(manageableTrainingItems(today)));
                const dialog = document.querySelector(".ft-manager-dialog");
                if (!dialog) return;

                dialog.showModal();
                dialog.addEventListener("close", function () { dialog.remove(); }, { once: true });
                dialog.addEventListener("change", function (event) {
                    const select = event.target.closest("[data-ft-category]");
                    if (!select) return;
                    saveCategoryOverride(select.dataset.ftCategory, select.value);
                    render();
                    const list = dialog.querySelector(".ft-manager-list");
                    if (list) list.innerHTML = managerRowsHtml(manageableTrainingItems(today));
                });
                const close = dialog.querySelector("[data-ft-close]");
                if (close) close.addEventListener("click", function () { dialog.close(); });
            });
        }


    };

    render();

    // Fetch missing COROS workout laps for interval-style featured sessions so
    // Speed Work gets the full rep-by-rep share graphic when available.
    const items = featuredTrainingItems(today, { limit: 8 }).filter(function (item) {
        return item.run.labelId && item.planDay?.workout?.sets?.some(function (s) {
            return Number(s.repeat) > 1 || s.parts;
        });
    });
    if (items.length) {
        fetchLaps(items, { max: 8, onBatch: render }).then(render).catch(function () {});
    }
}
