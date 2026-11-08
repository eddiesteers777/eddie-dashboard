// Pure helpers for editing one day of an own plan (race or training plan) on the Running tab.
// The first edit keeps the plan's own values in `original`, so "Undo edit" puts them back.
// Never used on a coach's plan: that one is changed by publishing a new version.

export function applyDayEdit(day, { miles, session }) {
    const m = Math.max(0, Math.round((Number(miles) || 0) * 10) / 10);
    const s = String(session ?? "").trim().slice(0, 300);
    const original = day.original || { miles: day.miles, session: day.session };
    return { ...day, miles: m, session: s || original.session || "Run", edited: true, original };
}

export function revertDayEdit(day) {
    if (!day.original) return day;
    const { original, edited, ...rest } = day;
    return { ...rest, miles: original.miles, session: original.session };
}
