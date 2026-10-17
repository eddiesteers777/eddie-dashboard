/* ==========================================
   Southbound Programs: what the page shows

   Pure helpers (tests/programsView.test.mjs). Race plans
   (`running-programs`), training blocks (`training-programs`) and the
   coach's own marathon block are turned into one shape, so the page can
   lay them on a season line, group them, draw their weeks and check them.
   Nothing here reads or writes storage.
========================================== */

import { START_DATE, RACE_DATE, WEEKS, PHASES, weekStart } from "./marathonData.js";

export const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_MS = 86400000;

export const TYPE_LABELS = {
    rest: "Rest", easy: "Easy", recovery: "Recovery", workout: "Quality", long: "Long", race: "Race",
    strength: "Strength", cross: "Cross"
};

// ---------- dates ----------

export function isoOf(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parse(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function daysBetween(fromIso, toIso) {
    const a = parse(fromIso);
    const b = parse(toIso);
    if (!a || !b) return NaN;
    return Math.round((b - a) / DAY_MS);
}

export function addDays(iso, n) {
    const d = parse(iso);
    if (!d) return "";
    d.setDate(d.getDate() + n);
    return isoOf(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso) {
    const d = parse(iso);
    return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : "—";
}

export function longDate(iso) {
    const d = parse(iso);
    return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : "—";
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return aStart <= bEnd && bStart <= aEnd;
}

// ---------- one shape for every program ----------

export function statusOf(program) {
    const status = String(program?.status || "").toLowerCase();
    if (["active", "paused", "archived", "draft"].includes(status)) return status;
    if (status === "generated") return "draft";
    return program?.generatedPlan ? "active" : "draft";
}

function dayItem(day, supplemental) {
    const date = day.date || "";
    const code = day.day || DAY_CODES[((parse(date)?.getDay() ?? 1) + 6) % 7];
    const extras = (supplemental || []).filter(item => item.day === code).map(item => item.type);
    return { date, code, type: day.type || "rest", miles: Number(day.miles) || 0, label: day.session || "", extras };
}

function weeksOfGenerated(plan) {
    return (plan?.weeks || []).map((week, i) => {
        const days = (week.days || []).map(day => dayItem(day, week.supplemental));
        const miles = Number.isFinite(Number(week.plannedMiles)) ? Number(week.plannedMiles) : days.reduce((sum, d) => sum + d.miles, 0);
        return {
            n: Number(week.week) || i + 1,
            phase: week.phase || "",
            startDate: week.startDate || days[0]?.date || "",
            endDate: week.endDate || days[days.length - 1]?.date || "",
            miles,
            longRun: Number(week.longRunMiles) || Math.max(0, ...days.map(d => d.miles)),
            days
        };
    });
}

function typeOfMarathonDay(day) {
    if (day.race) return "race";
    if (!Number(day.miles)) return "rest";
    const pace = String(day.pace || "").toLowerCase();
    const session = String(day.session || "").toLowerCase();
    if (pace.includes("long") || /^long run|\blong run\b/.test(session)) return "long";
    if (pace.includes("recovery")) return "recovery";
    if (pace.includes("easy")) return "easy";
    return "workout";
}

export function marathonProgram(name = "Indianapolis Monumental") {
    const weeks = WEEKS.map((week, i) => {
        const start = weekStart(i + 1);
        const days = (week.days || []).map((day, d) => {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
            return { date: isoOf(date), code: DAY_CODES[d], type: typeOfMarathonDay(day), miles: Number(day.miles) || 0, label: day.session || "", extras: [] };
        });
        // The week's longest run is its long run, whatever its workout is called.
        const longest = days.reduce((best, d) => (d.miles > best.miles ? d : best), days[0]);
        if (longest && longest.miles >= 10 && longest.type !== "race") longest.type = "long";
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
        return {
            n: i + 1,
            phase: PHASES[week.phase]?.label || "",
            startDate: isoOf(start),
            endDate: isoOf(end),
            miles: days.reduce((sum, d) => sum + d.miles, 0),
            longRun: Math.max(0, ...days.map(d => d.miles)),
            days
        };
    });
    return {
        key: "marathon", source: "marathon", id: "marathon", name, kind: "Marathon", status: "active",
        start: isoOf(START_DATE), end: isoOf(RACE_DATE), goal: "3:05", weeks, totalWeeks: weeks.length,
        peak: Math.max(0, ...weeks.map(w => w.miles)), longest: Math.max(0, ...weeks.map(w => w.longRun)),
        runDays: 0, liftDays: 0, crossDays: 0, preview: false, editHref: "marathon.html"
    };
}

const GOAL_LABELS = {
    STRENGTH: "Build Strength", RUN_MAINTENANCE: "Running Maintenance", BASE_BUILD: "Base Building", SPEED: "Speed Development",
    RUN_STRENGTH: "Running Strength", VERTICAL_POWER: "Vertical / Power", HYPERTROPHY: "Hypertrophy", ATHLETIC: "Athletic Development"
};

const RACE_LABELS = { "5K": "5K", "10K": "10K", HALF: "Half marathon", MARATHON: "Marathon", "50K": "50K", "50_MILE": "50 mile" };

export function raceProgram(program) {
    const plan = program.generatedPlan || {};
    const settings = program.settings || {};
    const weeks = weeksOfGenerated(plan);
    const type = program.type || settings.raceType || plan.raceType || "";
    const goalTime = plan.goal?.time || settings.goalTime;
    return {
        key: `race:${program.id}`, source: "race", id: program.id,
        name: program.name || program.raceName || `${RACE_LABELS[type] || "Race"} plan`,
        kind: RACE_LABELS[type] || String(type || "Race").replace(/_/g, " "),
        status: statusOf(program),
        start: plan.trainingStartDate || settings.trainingStartDate || "",
        end: plan.raceDate || settings.raceDate || "",
        goal: goalTime || (settings.goalType === "TIME" ? "" : "Finish"),
        weeks, totalWeeks: plan.totalWeeks || weeks.length,
        peak: Number(plan.generatedPeakMileage ?? plan.requestedPeakMileage ?? settings.peakMileage) || 0,
        longest: Number(plan.longestPlannedRun) || Math.max(0, ...weeks.map(w => w.longRun)),
        runDays: Number(plan.runDaysPerWeek) || 0, liftDays: Number(plan.strengthDaysPerWeek) || 0, crossDays: Number(plan.crossDaysPerWeek) || 0,
        preview: false, editHref: "running.html?section=race-plans", updatedAt: program.updatedAt || program.createdAt || ""
    };
}

// `preview` is a plan built from the saved settings with the same generator
// Activate uses, so a draft shows its weeks before it goes on the calendar.
export function trainingProgram(program, preview = null) {
    const settings = program.settings || {};
    const plan = program.generatedPlan || preview || null;
    const weeks = weeksOfGenerated(plan);
    return {
        key: `training:${program.id}`, source: "training", id: program.id,
        name: program.name || settings.name || "Untitled training block",
        kind: GOAL_LABELS[settings.primaryGoal] || "Training block",
        status: statusOf(program),
        start: plan?.trainingStartDate || settings.startDate || "",
        end: plan?.raceDate || settings.endDate || "",
        goal: "", weeks, totalWeeks: plan?.totalWeeks || weeks.length,
        peak: Number(plan?.generatedPeakMileage) || 0, longest: Number(plan?.longestPlannedRun) || 0,
        runDays: Number(plan?.runDaysPerWeek ?? settings.runDays) || 0,
        liftDays: Number(plan?.liftDaysPerWeek ?? settings.liftDays) || 0,
        crossDays: Number(plan?.crossDaysPerWeek ?? settings.crossDays) || 0,
        preview: !program.generatedPlan && Boolean(preview), editHref: "", updatedAt: program.updatedAt || program.createdAt || ""
    };
}

// now = on the calendar today; next = on the calendar later; drafts = drafts and
// paused; finished = archived, or an active plan whose end date has passed.
export function bucketOf(program, today) {
    if (program.status === "archived") return "finished";
    if (program.status === "draft" || program.status === "paused") return "drafts";
    if (program.end && program.end < today) return "finished";
    if (program.start && program.start > today) return "next";
    return "now";
}

export function groupPrograms(programs, today) {
    const groups = { now: [], next: [], drafts: [], finished: [] };
    for (const program of programs) groups[bucketOf(program, today)].push(program);
    groups.next.sort((a, b) => a.start.localeCompare(b.start));
    groups.now.sort((a, b) => a.end.localeCompare(b.end));
    groups.drafts.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    groups.finished.sort((a, b) => b.end.localeCompare(a.end));
    return groups;
}

// ---------- weeks ----------

export function currentWeekIndex(program, today) {
    return program.weeks.findIndex(week => week.startDate && week.startDate <= today && today <= (week.endDate || addDays(week.startDate, 6)));
}

export function phaseRuns(weeks) {
    const runs = [];
    weeks.forEach((week, i) => {
        const last = runs[runs.length - 1];
        if (last && last.label === week.phase) { last.to = i; last.count += 1; }
        else runs.push({ label: week.phase || "Plan", from: i, to: i, count: 1 });
    });
    return runs;
}

export function dayCell(day) {
    const mark = day.extras.includes("strength") ? "S" : day.extras.includes("cross") ? "X" : "";
    if (day.type === "rest") return { top: mark || "Rest", sub: mark ? "no run" : "", tone: mark ? "" : "rest", title: day.label || "Rest" };
    const tone = day.type === "workout" ? "q" : day.type === "long" || day.type === "race" ? "l" : "";
    const miles = Number.isInteger(day.miles) ? String(day.miles) : day.miles.toFixed(1);
    return { top: miles, sub: (TYPE_LABELS[day.type] || day.type).toLowerCase() + (mark ? ` +${mark}` : ""), tone, title: day.label || TYPE_LABELS[day.type] || "" };
}

// ---------- the season line ----------

export function seasonLayout(programs, today) {
    const shown = programs.filter(p => p.status !== "archived" && parse(p.start) && parse(p.end));
    if (!shown.length) return null;
    const low = [today, ...shown.map(p => p.start)].sort()[0];
    const high = [addDays(today, 150), ...shown.map(p => p.end)].sort().reverse()[0];
    const first = parse(low);
    const last = parse(high);
    const from = new Date(first.getFullYear(), first.getMonth(), 1);
    const to = new Date(last.getFullYear(), last.getMonth() + 1, 1);
    const total = to - from;
    const pct = iso => ((parse(iso) - from) / total) * 100;
    const months = [];
    for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        months.push({ label: MONTHS[d.getMonth()], year: d.getFullYear(), left: ((d - from) / total) * 100 });
    }
    const blocks = shown.map(p => {
        const left = pct(p.start);
        const width = Math.max(1.2, pct(addDays(p.end, 1)) - left);
        const bucket = bucketOf(p, today);
        return { key: p.key, name: p.name, left, width, tone: bucket === "now" ? "act" : bucket === "next" ? "next" : bucket === "finished" ? "done" : "draft" };
    });
    // Lanes: a program goes in the first lane where it doesn't overlap the one before it.
    const lanes = [];
    [...blocks].sort((a, b) => a.left - b.left).forEach(block => {
        let lane = lanes.findIndex(end => block.left >= end - 0.01);
        if (lane < 0) { lane = lanes.length; lanes.push(0); }
        lanes[lane] = block.left + block.width;
        block.lane = lane;
    });
    const todayPct = today >= low && today <= high ? pct(today) : null;
    return { months, blocks, lanes: Math.max(1, lanes.length), todayPct };
}

export function seasonNote(programs, today) {
    const live = programs.filter(p => p.status === "active" && p.start && p.end && p.end >= today);
    live.sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
            if (rangesOverlap(live[i].start, live[i].end, live[j].start, live[j].end)) {
                return { warn: true, text: `${live[i].name} and ${live[j].name} overlap (${shortDate(live[j].start)} to ${shortDate(live[i].end)}). Pause or move one.` };
            }
        }
    }
    if (live.length >= 2) {
        const gap = daysBetween(live[0].end, live[1].start) - 1;
        if (gap >= 1) {
            const span = gap >= 14 ? `${Math.round(gap / 7)} weeks` : `${gap} day${gap === 1 ? "" : "s"}`;
            return { warn: false, text: `${span} between ${live[0].name} and ${live[1].name}. Nothing overlaps.` };
        }
    }
    return { warn: false, text: "Nothing overlaps." };
}

// ---------- checks on one program ----------

export function programChecks(program, all, { strengthAvailable = true } = {}) {
    const checks = [];
    const clashes = all.filter(other => other.key !== program.key && other.status === "active"
        && program.status !== "archived" && rangesOverlap(program.start, program.end, other.start, other.end));
    checks.push(clashes.length
        ? { warn: true, text: `Overlaps ${clashes.map(c => c.name).join(", ")} (${shortDate(clashes[0].start)} to ${shortDate(clashes[0].end)}).` }
        : { warn: false, text: "No other active program overlaps these dates." });

    const jumps = [];
    for (let i = 1; i < program.weeks.length; i++) {
        const prev = program.weeks[i - 1].miles;
        const cur = program.weeks[i].miles;
        if (prev > 0 && cur - prev >= 5 && cur > prev * 1.2) jumps.push(`Week ${program.weeks[i].n} adds ${Math.round(cur - prev)} mi over week ${program.weeks[i - 1].n}. Worth a look.`);
    }
    jumps.slice(0, 2).forEach(text => checks.push({ warn: true, text }));
    if (!jumps.length && program.weeks.length) checks.push({ warn: false, text: "No big jumps from one week to the next." });

    const hasStrength = program.liftDays > 0 || program.weeks.some(w => w.days.some(d => d.extras.includes("strength")));
    if (hasStrength && !strengthAvailable) checks.push({ warn: true, text: "This plan has Strength sessions, but no Strength plan is on your calendar yet." });
    return checks;
}

export function programCounts(programs) {
    const counts = { active: 0, paused: 0, draft: 0, archived: 0 };
    for (const p of programs) counts[p.status] = (counts[p.status] || 0) + 1;
    return counts;
}
