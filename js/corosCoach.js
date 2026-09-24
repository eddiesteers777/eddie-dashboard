/* ==========================================
   Southbound COROS Coach Assessment — Step 5

   Turns COROS fitness/recovery/training-load data
   plus recent Marathon-plan execution into a
   transparent coaching assessment.

   Important:
   - This is an Southbound composite signal, not a
     medical diagnosis or a COROS-provided score.
   - The Marathon plan remains untouched.
========================================== */

import {
    WEEKS,
    weekStart,
    getAdjustedWeekDays
} from "./marathonData.js";

const SNAPSHOT_KEY = "__eddieos_coros_data_snapshot_v2";

function $(id) {
    return document.getElementById(id);
}

function snapshot() {
    try {
        return JSON.parse(
            localStorage.getItem(SNAPSHOT_KEY) || "null"
        );
    } catch {
        return null;
    }
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function dateKey(value) {
    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return null;

    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
    ].join("-");
}

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function deepValues(data) {
    const result = [];

    function walk(value, path = "") {
        if (!value || typeof value !== "object") {
            return;
        }

        for (const [key, item] of Object.entries(value)) {
            const normalized =
                `${path}.${key}`.toLowerCase();

            result.push({
                key: normalized,
                value: item
            });

            if (
                item &&
                typeof item === "object" &&
                !Array.isArray(item)
            ) {
                walk(item, normalized);
            }
        }
    }

    walk(data);

    return result;
}

function findNumber(data, names) {
    const entries = deepValues(data);

    for (const wanted of names) {
        const target = wanted.toLowerCase();

        const exact = entries.find(
            item =>
                item.key === `.${target}` ||
                item.key.endsWith(`.${target}`)
        );

        const n = num(exact?.value);

        if (n !== null) return n;
    }

    return null;
}

function findString(data, names) {
    const entries = deepValues(data);

    for (const wanted of names) {
        const target = wanted.toLowerCase();

        const item = entries.find(
            entry =>
                entry.key === `.${target}` ||
                entry.key.endsWith(`.${target}`)
        );

        if (
            item &&
            item.value !== null &&
            item.value !== undefined &&
            typeof item.value !== "object"
        ) {
            return String(item.value);
        }
    }

    return null;
}

function activityList(s) {
    return Array.isArray(s?.activities)
        ? s.activities
        : [];
}

function isRun(activity) {
    const text = [
        activity?.sport,
        activity?.sport_type,
        activity?.sportType,
        activity?.sport_name,
        activity?.sportName,
        activity?.name,
        activity?.activity_name
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
        text.includes("run") ||
        text.includes("running") ||
        text.includes("trail")
    );
}

function activityDate(activity) {
    return (
        activity?.start_time ??
        activity?.startTime ??
        activity?.start_date ??
        activity?.startDate ??
        activity?.date ??
        ""
    );
}

function activityMeters(activity) {
    const raw =
        activity?.distance_meters ??
        activity?.distanceMeters ??
        activity?.distance ??
        0;

    const n = num(raw) ?? 0;

    const unit = String(
        activity?.distance_unit ??
        activity?.distanceUnit ??
        ""
    ).toLowerCase();

    return unit.includes("mile")
        ? n * 1609.344
        : n;
}

function miles(meters) {
    return Number(meters || 0) / 1609.344;
}

function buildPlan() {
    const rows = [];

    WEEKS.forEach((week, index) => {
        const weekNumber = index + 1;
        const days = getAdjustedWeekDays(weekNumber);

        days.forEach((day, dayIndex) => {
            const date = new Date(
                weekStart(weekNumber).getTime() +
                dayIndex * 86400000
            );

            rows.push({
                week: weekNumber,
                date,
                dateKey: dateKey(date),
                session: day.session,
                miles: Number(day.miles || 0)
            });
        });
    });

    return rows;
}

function isRunningPlanDay(day) {
    const session =
        String(day.session || "").toLowerCase();

    return !(
        session.includes("rest") ||
        session.includes("off")
    );
}

function planCategory(session = "") {
    const text = session.toLowerCase();

    if (text.includes("long")) return "long";

    if (
        text.includes("tempo") ||
        text.includes("threshold") ||
        text.includes("interval") ||
        text.includes("vo2") ||
        text.includes("repeat") ||
        text.includes("cruise") ||
        text.includes("marathon pace") ||
        text.includes("@ mp")
    ) {
        return "quality";
    }

    if (text.includes("recovery")) return "recovery";

    if (text.includes("easy")) return "easy";

    return "other";
}

function recentPlanWindow(s) {
    const plan = buildPlan();

    const start =
        s?.startDate
            ? dateKey(
                `${String(s.startDate).slice(0, 4)}-${String(s.startDate).slice(4, 6)}-${String(s.startDate).slice(6, 8)}`
            )
            : null;

    const end =
        s?.endDate
            ? dateKey(
                `${String(s.endDate).slice(0, 4)}-${String(s.endDate).slice(4, 6)}-${String(s.endDate).slice(6, 8)}`
            )
            : dateKey(new Date());

    return plan.filter(day => {
        if (!day.dateKey) return false;
        if (start && day.dateKey < start) return false;
        if (end && day.dateKey > end) return false;
        return day.date <= new Date();
    });
}

function actualOnDay(runs, key) {
    return runs
        .filter(
            run =>
                dateKey(activityDate(run)) === key
        )
        .sort(
            (a, b) =>
                activityMeters(b) -
                activityMeters(a)
        )[0] || null;
}

function recentPlanMetrics(s) {
    const runs = activityList(s).filter(isRun);
    const plan = recentPlanWindow(s);
    const runningDays = plan.filter(
        isRunningPlanDay
    );

    let plannedMiles = 0;
    let actualMiles = 0;
    let matchedDays = 0;

    const longPlan = [];
    const qualityPlan = [];

    for (const day of runningDays) {
        plannedMiles += day.miles;

        const actual = actualOnDay(
            runs,
            day.dateKey
        );

        if (actual) {
            matchedDays++;
            actualMiles += miles(
                activityMeters(actual)
            );
        }

        const category = planCategory(
            day.session
        );

        if (category === "long") {
            longPlan.push({
                day,
                actual
            });
        }

        if (category === "quality") {
            qualityPlan.push({
                day,
                actual
            });
        }
    }

    const longCompleted =
        longPlan.filter(
            item =>
                item.actual &&
                miles(
                    activityMeters(item.actual)
                ) >= item.day.miles * .90
        ).length;

    const qualityCompleted =
        qualityPlan.filter(
            item =>
                item.actual &&
                miles(
                    activityMeters(item.actual)
                ) >= item.day.miles * .90
        ).length;

    const mileagePct =
        plannedMiles > 0
            ? Math.min(
                120,
                (actualMiles / plannedMiles) *
                    100
            )
            : 0;

    const executionPct =
        runningDays.length > 0
            ? (matchedDays / runningDays.length) *
                100
            : 0;

    return {
        plannedMiles,
        actualMiles,
        mileagePct,
        executionPct,
        longPlanCount: longPlan.length,
        longCompleted,
        qualityPlanCount: qualityPlan.length,
        qualityCompleted
    };
}

function extractRecovery(s) {
    return {
        percent:
            findNumber(s?.recovery, [
                "recoveryPercentage",
                "recovery_percent",
                "recoveryScore",
                "recovery"
            ]),
        level:
            findString(s?.recovery, [
                "recoveryLevel",
                "recovery_level",
                "level"
            ])
    };
}

function extractLoad(s) {
    return {
        short:
            findNumber(s?.trainingLoad, [
                "shortTermLoad",
                "short_term_load",
                "shortTermTrainingLoad",
                "loadImpact"
            ]),
        long:
            findNumber(s?.trainingLoad, [
                "longTermLoad",
                "long_term_load",
                "baseFitness",
                "base_fitness"
            ]),
        ratio:
            findNumber(s?.trainingLoad, [
                "loadRatio",
                "load_ratio",
                "trainingLoadRatio",
                "intensityTrend"
            ]),
        comment:
            findString(s?.trainingLoad, [
                "comment",
                "dailyComment",
                "trainingStatus"
            ])
    };
}

function extractFitness(s) {
    return {
        vo2:
            findNumber(s?.fitness, [
                "vo2Max",
                "vo2max",
                "VO2Max"
            ]),
        runningFitness:
            findNumber(s?.fitness, [
                "runningFitness",
                "running_fitness",
                "runningPerformance",
                "running_performance"
            ]),
        marathonPrediction:
            findNumber(s?.fitness, [
                "marathonPredictionSeconds",
                "marathonPredictionSec",
                "marathon_seconds",
                "marathonPrediction"
            ]),
        thresholdPace:
            findNumber(s?.fitness, [
                "thresholdPace",
                "threshold_pace"
            ])
    };
}

function parsePredictionSeconds(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "number") {
        if (value > 100000) {
            return null;
        }

        return value;
    }

    const text = String(value);

    const hhmmss = text.match(
        /(\d+):(\d{2}):(\d{2})/
    );

    if (hhmmss) {
        return (
            Number(hhmmss[1]) * 3600 +
            Number(hhmmss[2]) * 60 +
            Number(hhmmss[3])
        );
    }

    const mmss = text.match(
        /(\d{1,3}):(\d{2})/
    );

    if (mmss) {
        return (
            Number(mmss[1]) * 60 +
            Number(mmss[2])
        );
    }

    const numeric = num(text);

    return numeric;
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "—";

    const rounded =
        Math.round(seconds);

    const hours =
        Math.floor(rounded / 3600);

    const minutes =
        Math.floor(
            (rounded % 3600) / 60
        );

    const secs =
        rounded % 60;

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
        : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function scoreFitness(fitness) {
    const target = 3 * 3600 + 5 * 60;

    let prediction =
        fitness.marathonPrediction;

    prediction =
        parsePredictionSeconds(
            prediction
        );

    if (
        prediction !== null &&
        prediction > 2 * 3600 &&
        prediction < 5 * 3600
    ) {
        if (prediction <= target) return 100;

        const delta = prediction - target;

        return Math.max(
            45,
            100 - delta / 90
        );
    }

    if (
        fitness.vo2 !== null &&
        fitness.vo2 >= 60
    ) {
        return 90;
    }

    if (
        fitness.vo2 !== null &&
        fitness.vo2 >= 55
    ) {
        return 82;
    }

    if (
        fitness.vo2 !== null &&
        fitness.vo2 >= 50
    ) {
        return 72;
    }

    if (fitness.vo2 !== null) {
        return 60;
    }

    return null;
}

function scoreRecovery(recovery) {
    const value = recovery.percent;

    if (value === null) return null;

    if (value >= 90) return 100;
    if (value >= 80) return 90;
    if (value >= 70) return 80;
    if (value >= 50) return 65;
    if (value >= 20) return 45;

    return 25;
}

function scoreLoad(load) {
    if (load.ratio === null) return null;

    const ratio = load.ratio;

    if (ratio >= 1 && ratio <= 1.49) {
        return 100;
    }

    if (ratio >= .80 && ratio < 1) {
        return 88;
    }

    if (ratio > 1.49 && ratio <= 1.70) {
        return 82;
    }

    if (ratio < .80) {
        return 72;
    }

    return 50;
}

function scoreExecution(metrics) {
    if (!metrics) return null;

    const execution =
        Math.min(
            100,
            metrics.executionPct
        );

    const mileage =
        metrics.mileagePct >= 90 &&
        metrics.mileagePct <= 110
            ? 100
            : metrics.mileagePct > 110
                ? 92
                : Math.max(
                    45,
                    metrics.mileagePct
                );

    return (
        execution * .55 +
        mileage * .45
    );
}

function overallScore(parts) {
    const valid = parts.filter(
        item =>
            item !== null &&
            Number.isFinite(item)
    );

    if (!valid.length) {
        return null;
    }

    const sum =
        valid.reduce(
            (a, b) => a + b,
            0
        );

    return Math.round(
        sum / valid.length
    );
}

function readinessLabel(score) {
    if (score === null) {
        return "Awaiting Data";
    }

    if (score >= 85) {
        return "Strongly On Track";
    }

    if (score >= 75) {
        return "On Track";
    }

    if (score >= 65) {
        return "Watch Closely";
    }

    return "Needs Attention";
}

function coachingMessage(score, parts, metrics, recovery, load, fitness) {
    const notes = [];

    if (metrics) {
        if (metrics.executionPct < 80) {
            notes.push(
                "Recent plan execution is below 80%, so consistency is the first thing to protect."
            );
        } else if (
            metrics.mileagePct > 110
        ) {
            notes.push(
                "Recent running volume is above the scheduled range; avoid turning extra mileage into hidden intensity."
            );
        } else if (
            metrics.mileagePct >= 90
        ) {
            notes.push(
                "Recent mileage is closely aligned with the Marathon schedule."
            );
        }
    }

    if (
        recovery.percent !== null &&
        recovery.percent < 70
    ) {
        notes.push(
            `COROS recovery is ${Math.round(recovery.percent)}%, so recovery should influence today's intensity.`
        );
    } else if (
        recovery.percent !== null &&
        recovery.percent >= 90
    ) {
        notes.push(
            "COROS currently shows a high recovery level, which supports normal training provided the legs feel good."
        );
    }

    if (
        load.ratio !== null &&
        load.ratio > 1.49
    ) {
        notes.push(
            "The current load signal is elevated; avoid stacking another hard session unnecessarily."
        );
    } else if (
        load.ratio !== null &&
        load.ratio >= 1 &&
        load.ratio <= 1.49
    ) {
        notes.push(
            "The current load relationship sits in a productive range."
        );
    }

    const prediction =
        parsePredictionSeconds(
            fitness.marathonPrediction
        );

    if (
        prediction !== null &&
        prediction > 3 * 3600 + 5 * 60
    ) {
        notes.push(
            `COROS marathon prediction is ${formatDuration(prediction)}, so the 3:05 goal should be treated as a target still being earned rather than a guarantee.`
        );
    } else if (
        prediction !== null &&
        prediction <= 3 * 3600 + 5 * 60
    ) {
        notes.push(
            `COROS marathon prediction is ${formatDuration(prediction)}, which is at or faster than the 3:05 target.`
        );
    }

    if (!notes.length) {
        notes.push(
            "Southbound does not yet have enough current COROS information to make a strong coaching call."
        );
    }

    return notes.slice(0, 3);
}

function render(snapshotData) {
    if (!snapshotData) {
        setText(
            "corosCoachHeadline",
            "Connect COROS to start the assessment."
        );
        setText(
            "corosCoachScore",
            "—"
        );
        return;
    }

    const metrics =
        recentPlanMetrics(snapshotData);

    const recovery =
        extractRecovery(snapshotData);

    const load =
        extractLoad(snapshotData);

    const fitness =
        extractFitness(snapshotData);

    const parts = [
        scoreExecution(metrics),
        scoreRecovery(recovery),
        scoreLoad(load),
        scoreFitness(fitness)
    ];

    const score =
        overallScore(parts);

    setText(
        "corosCoachScore",
        score === null
            ? "—"
            : `${score}`
    );

    setText(
        "corosCoachHeadline",
        readinessLabel(score)
    );

    setText(
        "corosCoachExecution",
        Math.round(metrics.executionPct) + "%"
    );

    setText(
        "corosCoachMileage",
        `${metrics.actualMiles.toFixed(1)} / ${metrics.plannedMiles.toFixed(1)} mi`
    );

    setText(
        "corosCoachRecovery",
        recovery.percent === null
            ? "—"
            : `${Math.round(recovery.percent)}%`
    );

    setText(
        "corosCoachLoad",
        load.ratio === null
            ? "—"
            : load.ratio.toFixed(2)
    );

    const prediction =
        parsePredictionSeconds(
            fitness.marathonPrediction
        );

    setText(
        "corosCoachPrediction",
        prediction === null
            ? "—"
            : formatDuration(prediction)
    );

    const notes =
        coachingMessage(
            score,
            parts,
            metrics,
            recovery,
            load,
            fitness
        );

    const list =
        $("corosCoachNotes");

    if (list) {
        list.innerHTML =
            notes
                .map(
                    note =>
                        `<div class="coros-coach-note">${escapeHtml(note)}</div>`
                )
                .join("");
    }

    setText(
        "corosCoachUpdated",
        snapshotData.fetchedAt
            ? `Based on COROS data synced ${new Date(
                snapshotData.fetchedAt
            ).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit"
            })}.`
            : ""
    );
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function init() {
    render(snapshot());

    window.addEventListener(
        "eddieos:coros-data-updated",
        () => render(snapshot())
    );
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        init
    );
} else {
    init();
}
