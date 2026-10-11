/* ==========================================
   Southbound — Featured Runs on the dashboard

   The dashboard shows a small curated spotlight of recent completed
   Long Runs and Speed Work. Actual COROS + Strava runs are the source of
   truth, so a workout can still be featured when it was moved off the
   exact planned date or came from Strava only.

   The home page intentionally shows at most one card per category
   (maximum two cards total). The full recent-run manager stays behind
   the Customize control so the dashboard does not become a run-history
   wall.
========================================== */

import { WEEKS, getAdjustedWeekDays, PACES, weekStart } from "./marathonData.js";
import { planDayFromMarathon, marathonTitle } from "./marathonCoros.js";
import { kindOfDay } from "./readiness.js";
import { allRuns, fetchLaps, laps } from "./trendsData.js";
import { registerShare, registerRunShare, registerCard } from "./executionShare.js";
import { runCardModel } from "./runCard.js";

import {
    FEATURED_KEY,
    FEATURED_CATEGORIES,
    categoryFor,
    autoCategory,
    autoRunCategory
} from "./featuredTrainingModel.js";

const MILE = 1609.344;
const LOOKBACK_DAYS = 42;
const PLAN_MATCH_DAYS = 2;

function todayBack(today, days) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - (days - 1));
    return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
}

function dayDistance(a, b) {
    const left = new Date(a + "T12:00:00");
    const right = new Date(b + "T12:00:00");
    return Math.abs(Math.round((left - right) / 86400000));
}

function loadOverrides() {
    try {
        const raw = JSON.parse(localStorage.getItem(FEATURED_KEY) || "null");
        return raw && typeof raw === "object" ? raw : {};
    } catch {
        return {};
    }
}

function recentPlanDays(today, days) {
    const fromIso = todayBack(today, days);
    const out = [];

    WEEKS.forEach(function (_, wi) {
        getAdjustedWeekDays(wi + 1).forEach(function (raw, di) {
            // Plan days carry no date of their own (they never matched a run
            // before 2026-10-10): Monday of the week + the day's place.
            const d = new Date(weekStart(wi + 1));
            d.setDate(d.getDate() + di);
            const day = { ...raw, date: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") };
            if (!day?.miles || day.date > today || day.date < fromIso) return;

            const planDay = planDayFromMarathon(day, PACES);
            out.push({
                date: day.date,
                day,
                planDay,
                autoCategory: autoCategory(day, planDay) ||
                    (day && planDay && !day.race && planDay.type !== "race" && /^(quality)$/i.test(String(kindOfDay(day, planDay) || ""))
                        ? FEATURED_CATEGORIES.SPEED_WORK
                        : null)
            });
        });
    });

    return out;
}

function matchPlanDay(run, planDays) {
    let best = null;

    for (const candidate of planDays) {
        const delta = dayDistance(run.date, candidate.date);
        if (delta > PLAN_MATCH_DAYS) continue;

        const category = candidate.autoCategory;
        const runName = String(run.name || "");

        // Prefer a category-compatible plan day when there are several days
        // within the matching window. This is especially useful for a moved
        // quality session sitting beside an easy day.
        const nameSuggestsSpeed = /\b(intervals?|repeats?|reps?|fartlek|tempo|threshold|progression|speed\s+work|hill\s+repeats?|track|marathon\s+pace|half\s+marathon\s+pace|5k\s+pace|10k\s+pace)\b/i.test(runName);
        const nameSuggestsLong = /\blong\s+run\b|\bmarathon\s+long\b/i.test(runName);
        const compatible =
            (nameSuggestsSpeed && category === FEATURED_CATEGORIES.SPEED_WORK) ||
            (nameSuggestsLong && category === FEATURED_CATEGORIES.LONG_RUN);

        // Distance matters too: a 12-mile run the day after a planned long run
        // is that long run, not the 3-mile recovery jog planned for its own date.
        const runMiles = Number(run.distance) / 1609.344;
        const planMiles = Number(candidate.day?.miles) || 0;
        const sizeGap = runMiles > 0 && planMiles > 0 ? Math.abs(Math.log(runMiles / planMiles)) * 12 : 0;
        const score = delta * 10 + sizeGap + (compatible ? -8 : 0);
        if (!best || score < best.score) {
            best = { ...candidate, score };
        }
    }

    return best;
}

function actualRunId(run) {
    if (run?.source && run?.labelId) return "run|" + run.source + "|" + run.labelId;
    return "run|" + (run?.source || "unknown") + "|" + (run?.date || "") + "|" + Math.round(Number(run?.distance) || 0);
}

function recentRuns(today, days) {
    const fromIso = todayBack(today, days);
    const runs = allRuns(today);
    const planDays = recentPlanDays(today, days);
    const overrides = loadOverrides();

    return runs
        .filter(run => run?.date && run.date >= fromIso && run.date <= today && Number(run.distance) > 0)
        .map(run => {
            const id = actualRunId(run);
            const match = matchPlanDay(run, planDays);
            const planCategory = match?.autoCategory || null;
            const legacyId = match ? "marathon|" + match.date : "";

            const auto = autoRunCategory(run, match?.planDay || null, planCategory);
            const override = overrides[id] ?? (legacyId ? overrides[legacyId] : null) ?? "";

            return {
                id,
                legacyId,
                date: run.date,
                day: match?.day || null,
                planDay: match?.planDay || null,
                matchedPlanDate: match?.date || null,
                matchedPlanDistance: Number(match?.day?.miles) || 0,
                kind: auto,
                override,
                autoCategory: auto,
                category: override === FEATURED_CATEGORIES.NONE
                    ? null
                    : override || auto,
                title: match?.day?.session
                    ? marathonTitle(match.day.session, Number(match.day.miles) || 0)
                    : (run.name || (auto === FEATURED_CATEGORIES.LONG_RUN ? "Long Run" : "Speed Work")),
                run,
                runMiles: Number(run.distance) / MILE,
                plannedMiles: Number(match?.day?.miles) || 0
            };
        })
        .sort((a, b) => {
            const dateOrder = b.date.localeCompare(a.date);
            if (dateOrder) return dateOrder;
            return Number(b.run.distance || 0) - Number(a.run.distance || 0);
        });
}

/**
 * Curated dashboard selection:
 * - at most one Long Run
 * - at most one Speed Work
 * - newest qualifying session wins within each category
 *
 * The full history remains available through manageableTrainingItems().
 */
export function featuredTrainingItems(today, options) {
    const opts = options || {};
    const days = opts.days == null ? LOOKBACK_DAYS : opts.days;
    const runs = recentRuns(today, days);
    const selected = [];

    [FEATURED_CATEGORIES.LONG_RUN, FEATURED_CATEGORIES.SPEED_WORK].forEach(category => {
        const item = runs.find(run => run.category === category);
        if (item) selected.push(item);
    });

    return selected
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, opts.limit == null ? 2 : Math.min(2, opts.limit));
}

export function manageableTrainingItems(today, options) {
    const opts = options || {};
    return recentRuns(today, opts.days == null ? LOOKBACK_DAYS : opts.days);
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
    // One rule with Train and Analytics (js/runCard.js): rep by rep against the
    // plan when it has targets and the laps are in, else the run's splits, else
    // the plain run card.
    const entry = item.run.labelId ? laps()[item.run.labelId] : null;
    const sessionId = item.run.labelId ? "c:" + item.run.labelId : item.run.key ? "s:" + item.run.key : null;
    const meta = {
        date: item.date,
        name: item.title,
        category: item.category,
        plannedMiles: item.plannedMiles,
        runMeters: item.run.distance,
        runSec: item.run.duration,
        sessionId
    };
    const card = runCardModel({ run: item.run, workout: item.planDay?.workout, entry, id: item.legacyId || item.id, meta });
    if (card.kind === "execution") return registerShare(card.x, meta);
    if (card.kind === "splits") return registerCard("splits|" + item.id, card.model, { date: item.date, sessionId });
    return registerRunShare(item.run, { id: item.id, ...meta }) || null;
}

function cardHtml(item) {
    const run = item.run;
    const actual = Number(run.distance) / MILE;
    const paceSec = run.pace_seconds_per_mile ||
        (run.duration && run.distance ? Number(run.duration) / actual : null);
    const shareKey = shareFeatured(item);

    const planNote = item.plannedMiles > 0
        ? (item.matchedPlanDate === item.date
            ? "Planned"
            : "Completed " + dayWords(item.date))
        : "";

    const category = categoryLabel(item.category);
    const metrics = [
        fmtMiles(actual),
        fmtTime(run.duration),
        fmtPace(paceSec),
        run.avgHr ? Math.round(Number(run.avgHr)) + " bpm" : ""
    ].filter(Boolean).join(" · ");
    const status = [
        category,
        planNote,
        metrics
    ].filter(Boolean).join(" · ");

    return [
        '<li class="tr-work ft-work">',
        '<div class="tr-work-top">',
        '<strong>', esc(item.title), '</strong>',
        '<span>', esc(dayWords(item.date)), ' · ', esc(fmtMiles(actual)), '</span>',
        '</div>',
        '<small>', esc(status), '</small>',
        shareKey ? '<div class="ft-actions"><button type="button" class="sb-btn sb-btn-secondary ft-share" data-ex-share="' + esc(shareKey) + '">Share</button></div>' : "",
        '</li>'
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
                optionsHtml(item.override || (item.category || "")), '</select></label>'
            ].join("");
        }).join("")
        : '<p class="ft-empty">No completed runs found in the last 6 weeks.</p>';
}

function managerHtml(items) {
    return [
        '<dialog class="sb-dialog ft-manager-dialog"><div class="sb-dialog-form">',
        '<h2 class="sb-dialog-title">Featured Runs</h2>',
        '<p class="clients-card-note">Southbound auto-picks one Long Run and one Speed Work session. Use the selector to override any recent run.</p>',
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
            ? '<ul class="tr-works ft-works">' + items.map(cardHtml).join("") + '</ul>'
            : '<p class="ft-empty">No featured runs yet. Complete a long run or quality session and it will appear here.</p>';

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

    // Fetch missing COROS workout laps only for the small candidate set that
    // could become the featured Speed Work card. Re-render once they arrive.
    // Every featured run's laps (speed work and long runs alike), so each
    // card can show its reps or its splits.
    const items = featuredTrainingItems(today, { limit: 2 }).filter(function (item) {
        return item.run.labelId && item.run.source !== "strava";
    });
    if (items.length) {
        fetchLaps(items, { max: 4, onBatch: render }).then(render).catch(function () {});
    }
}
