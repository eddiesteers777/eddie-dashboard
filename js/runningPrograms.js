/* ==========================================
   Southbound Running — Program Store

   Single source for the running-programs localStorage
   structure used by Race Plans and the Running calendar.
========================================== */

const PROGRAMS_KEY = "running-programs";

export function loadRunningPrograms() {
    try {
        const raw = localStorage.getItem(PROGRAMS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.plans)) return parsed.plans;
    } catch (error) {
        console.warn("Southbound running-programs storage could not be read:", error);
    }
    return [];
}

export async function saveRunningPrograms(programs) {
    localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs));

    try {
        const { pushToCloud } = await import("./cloudSync.js");
        await pushToCloud();
    } catch (error) {
        console.warn("Running-programs cloud sync could not be completed:", error);
    }
}

export function getActiveRunningPrograms() {
    return loadRunningPrograms().filter(
        program => program?.status === "active" && program?.generatedPlan
    );
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

    for (const program of getActiveRunningPrograms()) {
        const generated = program.generatedPlan;
        for (const week of generated.weeks || []) {
            const generatedDay = (week.days || []).find(day => day.date === dateStr);
            if (generatedDay && generatedDay.type !== "rest") {
                results.push({
                    programId: program.id,
                    programName: program.name,
                    planType: program.type,
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

    for (const program of getActiveRunningPrograms()) {
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

    for (const program of getActiveRunningPrograms()) {
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
    const programs = loadRunningPrograms();
    const program = programs.find(item => item.id === programId);
    if (!program?.generatedPlan?.weeks) return null;

    for (const week of program.generatedPlan.weeks) {
        const day = (week.days || []).find(item => item.date === dateStr);
        if (!day || day.type === "rest") continue;
        day.completed = !Boolean(day.completed);
        program.updatedAt = new Date().toISOString();
        await saveRunningPrograms(programs);
        return day.completed;
    }

    return null;
}
