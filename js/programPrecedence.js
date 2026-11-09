/* ==========================================
   Southbound — which plan wins on a date

   When two active plans cover the same day, the one that started
   latest wins (a winter block laid over an older plan). Rest days
   count: if the winning plan rests that day, the older plan stays
   hidden. The older plan comes back on any day the winner doesn't
   cover. Pure: no storage, no DOM.
========================================== */

function planStart(program) {
    const plan = program?.generatedPlan || {};
    const dates = [];
    if (plan.trainingStartDate) dates.push(plan.trainingStartDate);
    for (const week of plan.weeks || []) {
        if (week.startDate) dates.push(week.startDate);
        for (const day of week.days || []) if (day.date) dates.push(day.date);
    }
    return dates.sort()[0] || "";
}

export function coversDate(program, dateStr) {
    for (const week of program?.generatedPlan?.weeks || []) {
        if ((week.days || []).some(day => day.date === dateStr)) return true;
        if (week.startDate && week.endDate && dateStr >= week.startDate && dateStr <= week.endDate) return true;
    }
    return false;
}

export function winningProgramId(programs, dateStr) {
    const covering = (programs || []).filter(program => coversDate(program, dateStr));
    if (covering.length < 2) return covering[0]?.id ?? null;
    covering.sort((a, b) =>
        planStart(b).localeCompare(planStart(a))
        || String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
        || String(a.id).localeCompare(String(b.id)));
    return covering[0].id;
}

export function overriddenProgramNames(programs, dateStr) {
    const winner = winningProgramId(programs, dateStr);
    return (programs || [])
        .filter(program => program.id !== winner && coversDate(program, dateStr))
        .map(program => program.name);
}

export function programWins(programs, program, dateStr) {
    return winningProgramId(programs, dateStr) === program.id;
}
