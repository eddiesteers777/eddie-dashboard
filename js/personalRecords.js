/* ==========================================
   Southbound — personal records, filled in from your runs (pure)

   For the mile, 5K, 10K, half and marathon, the fastest of:
     - a time you typed in ("personal-records", as before)
     - the fastest stretch inside any run's watch file (Strava archive
       .fit files: `b` in js/stravaHistory.js)
     - a whole run of about that distance (COROS or Strava, 1.5% short
       to 4% long), its time scaled to the exact distance
   A found time can be hidden ("Not right? Hide"): records._hidden[field]
   lists the hidden candidate ids, and the next fastest shows instead.
   Unit-tested in tests/personalRecords.test.mjs.
========================================== */

const MILE = 1609.344;
export const PR_FIELDS = [
    { id: "mile", label: "Mile", meters: MILE, effort: 0 },
    { id: "5k", label: "5K", meters: 5000, effort: 1 },
    { id: "10k", label: "10K", meters: 10000, effort: 2 },
    { id: "half", label: "Half Marathon", meters: 21097.5, effort: 3 },
    { id: "marathon", label: "Marathon", meters: 42195, effort: 4 }
];
const FLOOR = 210;                    // s per mile (3:30): faster is a bad reading

/** "3:05:00" / "18:45" / "1:25:30" -> seconds, else null. */
export function parseTime(text) {
    const m = String(text || "").trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/);
    if (!m) return null;
    const s = Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    return s > 0 ? s : null;
}
export const formatTime = s => {
    const r = Math.round(s), h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60), sec = r % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/**
 * runs: every run [{ date, distance m, duration s, name, labelId | key }] (COROS + Strava, once each)
 * acts: Strava history activities (for the watch-file efforts)
 * typed: the saved "personal-records" object
 * -> [{ id, label, sec, text, source: "typed"|"effort"|"run"|null, date, name, inside, candidate, hiddenCount }]
 */
export function personalRecords(runs, acts, typed = {}) {
    const hidden = typed?._hidden || {};
    return PR_FIELDS.map(f => {
        const floor = FLOOR * f.meters / MILE;
        const found = [];
        for (const a of Object.values(acts || {})) {
            const s = a.y === "run" ? a.b?.[f.effort] : null;
            if (s && s >= floor) found.push({ source: "effort", sec: s, date: a.d, name: a.n || "", inside: (a.m || 0) > f.meters * 1.04, candidate: `e:${a.k}` });
        }
        for (const r of runs || []) {
            const d = Number(r.distance), t = Number(r.duration);
            if (!d || !t || d < f.meters * 0.985 || d > f.meters * 1.04) continue;
            const sec = Math.round(t * f.meters / d);
            if (sec >= floor) found.push({ source: "run", sec, date: r.date, name: r.name || "", inside: false, candidate: `r:${r.labelId || r.key || r.date}` });
        }
        const shown = found.filter(c => !(hidden[f.id] || []).includes(c.candidate));
        const typedSec = parseTime(typed?.[f.id]);
        const options = [...shown, ...(typedSec ? [{ source: "typed", sec: typedSec, date: null, name: "", inside: false, candidate: null }] : [])];
        const best = options.sort((a, b) => a.sec - b.sec)[0] || null;
        const base = { id: f.id, label: f.label, hiddenCount: (hidden[f.id] || []).length };
        if (best) return { ...base, ...best, text: formatTime(best.sec) };
        // Something typed that isn't a time (kept as written) or nothing at all.
        const raw = String(typed?.[f.id] || "").trim();
        return { ...base, sec: null, text: raw || null, source: raw ? "typed" : null, date: null, name: "", inside: false, candidate: null };
    });
}
