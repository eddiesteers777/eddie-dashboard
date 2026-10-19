/* ==========================================
   Southbound — the pain log (pure)

   One list of every time a client flagged pain, newest first, so a coach
   sees whether it's a one-off or a pattern and whether it's easing:
     - from workout logs (pain + "where, and how bad?")
     - from weekly check-ins (pain + its note)
   Nothing new is stored; it's read from what the client already sent
   (workoutResults, checkins). The trend compares the last 14 days with
   the 14 before: "more", "less", "same", or "new" when it's the first.

   Idea from OpenAthlete's injury tracking (AGPL-3.0); original code, and
   simpler on purpose: no status the coach has to maintain.
   No DOM or storage. Unit-tested in tests/painLog.test.mjs.
========================================== */

const DAY = 86400000;
const dateMs = iso => Date.parse(`${iso}T12:00:00`);
const iso = ms => new Date(ms).toISOString().slice(0, 10);

const checkinDate = c => {
    for (const key of ["weekOf", "week"]) if (/^\d{4}-\d{2}-\d{2}$/.test(c?.[key] || "")) return c[key];
    const t = c?.submittedAt?.toMillis?.() ?? c?.createdAt?.toMillis?.() ?? Number(c?.submittedAt || c?.createdAt) ?? 0;
    return t > 0 ? iso(t) : "";
};

// results: workoutResults rows; checkins: check-in rows. Newest first.
export function painEntries(results = [], checkins = []) {
    const out = [];
    for (const r of results || []) {
        if (r?.pain && /^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) {
            out.push({ date: r.date, source: "workout", where: String(r.painNote || "").trim(), label: r.title || "Workout" });
        }
    }
    for (const c of checkins || []) {
        const date = checkinDate(c);
        if (c?.pain && date) out.push({ date, source: "check-in", where: String(c.painNote || "").trim(), label: "Weekly check-in" });
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// { entries (newest first), recent, before, trend, last } as of `today` (ISO date).
export function painSummary(results, checkins, today) {
    const entries = painEntries(results, checkins);
    const now = dateMs(today);
    const days = new Set(entries.filter(e => now - dateMs(e.date) < 14 * DAY && dateMs(e.date) <= now).map(e => e.date));
    const prior = new Set(entries.filter(e => now - dateMs(e.date) >= 14 * DAY && now - dateMs(e.date) < 28 * DAY).map(e => e.date));
    const recent = days.size, before = prior.size;
    const trend = !entries.length ? "none"
        : recent === 0 ? "quiet"
        : before === 0 ? "new"
        : recent > before ? "more" : recent < before ? "less" : "same";
    return { entries, recent, before, trend, last: entries[0] || null };
}

export const TREND_TEXT = {
    quiet: "Nothing flagged in the last 2 weeks",
    new: "New in the last 2 weeks",
    more: "More often than the 2 weeks before",
    less: "Easing: less often than the 2 weeks before",
    same: "About the same as the 2 weeks before"
};
