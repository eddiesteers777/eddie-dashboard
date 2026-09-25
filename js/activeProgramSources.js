/* ==========================================
   Southbound Running — Active Program Sources

   The Running calendar (js/runningProgramCalendar.js) used to
   read only running-programs (Race Plans). Training Plans live
   in their own training-programs store -- a different schema,
   see js/trainingPrograms.js -- so this module merges "active,
   generated" entries from both stores into the same shape the
   calendar already consumes. Neither storage module is changed;
   this is a read-side adapter used only by the calendar.
========================================== */

import { loadRunningPrograms, saveRunningPrograms } from "./runningPrograms.js";
import { loadTrainingPrograms, saveTrainingPrograms } from "./trainingPrograms.js";
import { loadCoachPlans, saveCoachPlans } from "./coachPlanStore.js";

function getActivePrograms() {
    const race = loadRunningPrograms()
        .filter(program => program?.status === "active" && program?.generatedPlan)
        .map(program => ({ ...program, source: "race-plan" }));
    const training = loadTrainingPrograms()
        .filter(program => program?.status === "active" && program?.generatedPlan)
        .map(program => ({ ...program, source: "training-plan" }));
    // Plans the coach published (js/coachPlanStore.js).
    const coach = loadCoachPlans()
        .filter(program => program?.status === "active" && program?.generatedPlan)
        .map(program => ({ ...program, source: "coach" }));
    return [...coach, ...race, ...training];
}

export function getActiveRunningPrograms() {
    return getActivePrograms();
}

function dayDateWithinWeek(week, dayCode) {
    const start = new Date(`${week.startDate}T00:00:00`);
    const codes = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const offset = codes.indexOf(dayCode);
    if (offset < 0) return null;
    start.setDate(start.getDate() + offset);
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, "0");
    const day = String(start.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getActiveProgramEntriesForDate(dateStr) {
    const results = [];

    for (const program of getActivePrograms()) {
        const generated = program.generatedPlan;
        for (const week of generated.weeks || []) {
            const generatedDay = (week.days || []).find(day => day.date === dateStr);
            if (generatedDay && generatedDay.type !== "rest") {
                results.push({
                    programId: program.id,
                    programName: program.name,
                    planType: program.type,
                    programSource: program.source,
                    week: week.week,
                    phase: week.phase,
                    entry: generatedDay
                });
            }

            for (const supplemental of week.supplemental || []) {
                const supplementalDate = dayDateWithinWeek(week, supplemental.day);
                if (supplementalDate !== dateStr) continue;
                results.push({
                    programId: program.id,
                    programName: program.name,
                    planType: program.type,
                    programSource: program.source,
                    week: week.week,
                    phase: week.phase,
                    entry: {
                        ...supplemental,
                        date: supplementalDate,
                        type: supplemental.type === "strength" ? "strength" : "cross"
                    }
                });
            }
        }
    }

    return results;
}

export function getActiveProgramWeekStats(mondayDate, sundayDate) {
    const start = new Date(`${mondayDate}T00:00:00`);
    const end = new Date(`${sundayDate}T00:00:00`);
    const summaries = [];

    for (const program of getActivePrograms()) {
        let planned = 0;
        let completed = 0;

        for (const week of program.generatedPlan?.weeks || []) {
            for (const day of week.days || []) {
                if (!day.date) continue;
                const date = new Date(`${day.date}T00:00:00`);
                if (date < start || date > end || day.type === "rest") continue;
                const miles = Number(day.miles) || 0;
                planned += miles;
                if (day.completed) completed += miles;
            }
        }

        if (planned > 0) {
            summaries.push({
                programId: program.id,
                programName: program.name,
                planned,
                completed,
                percent: planned ? Math.round((completed / planned) * 100) : 0
            });
        }
    }

    return summaries;
}

export function getActiveProgramUpcomingRuns(todayDate, horizonDays = 14) {
    const start = new Date(`${todayDate}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + horizonDays);
    const upcoming = [];

    for (const program of getActivePrograms()) {
        for (const week of program.generatedPlan?.weeks || []) {
            for (const day of week.days || []) {
                if (!day.date || day.type === "rest" || !day.miles) continue;
                const date = new Date(`${day.date}T00:00:00`);
                if (date < start || date > end) continue;
                upcoming.push({
                    programId: program.id,
                    programName: program.name,
                    week: week.week,
                    phase: week.phase,
                    ...day
                });
            }
        }
    }

    return upcoming.sort((a, b) => a.date.localeCompare(b.date));
}

export async function toggleRunningProgramDayCompleted(programId, dateStr) {
    for (const [load, save] of [[loadCoachPlans, saveCoachPlans], [loadRunningPrograms, saveRunningPrograms], [loadTrainingPrograms, saveTrainingPrograms]]) {
        const programs = load();
        const program = programs.find(item => item.id === programId);
        if (!program?.generatedPlan?.weeks) continue;

        for (const week of program.generatedPlan.weeks) {
            const day = (week.days || []).find(item => item.date === dateStr);
            if (!day || day.type === "rest") continue;
            day.completed = !Boolean(day.completed);
            program.updatedAt = new Date().toISOString();
            await save(programs);
            return day.completed;
        }
    }

    return null;
}
