/* ==========================================
   Southbound — completed workouts (pure, unit-tested)

   One shape for every workout that was actually done, whatever it
   was and wherever it came from, so the Train page's Recent Workouts,
   the share cards and the completion screens all read the same thing:

   { v, id, type: run|strength|cross, source, status: "completed",
     date (the phone's own day), startedAt, completedAt, updatedAt (ms),
     title, note, durationSec | null,
     run:      { meters, movingSec, paceSec (per mile), avgHr, category, plannedMiles, runType },
     strength: { dayId, exercises: [{ name, mode, bw, sets: [{ w (lb), r, d (s), t? }] }] },
     cross:    { workoutId, activity, intensity, blocks: [{ label, min, intensity, done }] },
     share:    { count, lastAt, via } (attached when reading) }

   Where each one lives:
   - Runs stay where they already are (COROS history, the Strava
     import, the Running Log, a client's plan logs); runFrom*() turns
     them into this shape when read, so nothing is copied twice.
   - Strength sessions finished on the Strength page and cross-training
     sessions are stored, one localStorage key each
     (`workout-session-<id>`, cloud-synced). Cloud sync is last write
     wins per key, so one key per session means two phones each adding
     a workout can never overwrite each other's. Sync doesn't carry a
     removed key, so deleting leaves a marker ({ deleted: true }).
   - Share history is `workout-shares` { id: { count, lastAt, via } }.

   A completed session is a snapshot: editing the template it came from
   (strength-plan, the cross-training library) or the schedule never
   changes it; editing the session itself changes only its own words
   and numbers (editSession) and keeps its id and when it was done.
   Nothing here makes a number up: a metric the source doesn't have is
   left out (null), never estimated.
========================================== */

export const SESSION_VERSION = 1;
export const SESSION_PREFIX = "workout-session-";
export const SHARES_KEY = "workout-shares";
export const TYPES = ["run", "strength", "cross"];
export const TYPE_LABEL = { run: "Run", strength: "Strength", cross: "Cross-training" };
export const MILE = 1609.344;

export const CROSS_ACTIVITIES = {
    cycling: "Cycling", swimming: "Swimming", elliptical: "Elliptical", rowing: "Rowing",
    yoga: "Yoga", circuit: "Strength Circuit", mobility: "Mobility", other: "Other"
};
export const INTENSITIES = ["easy", "moderate", "hard"];
const SET_TYPES = ["working", "warmup", "drop", "failure"];
// A strength session that's "still today" when the same workout is opened again:
// finishing it again updates that one instead of adding a second.
export const RESUME_WINDOW_MS = 3 * 3600 * 1000;
const MAX_SESSION_SEC = 24 * 3600;

const num = v => (Number.isFinite(Number(v)) ? Number(v) : null);
const pos = v => { const n = num(v); return n != null && n > 0 ? n : null; };
const text = (v, max = 120) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
const pad = n => String(n).padStart(2, "0");

export const storageKey = id => SESSION_PREFIX + id;

/** The phone's own calendar day for a time in ms. */
export function localDay(ms = Date.now()) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A new id for a stored session: "st-…" (strength) or "ct-…" (cross-training). */
export function newSessionId(type, now = Date.now(), rand = Math.random) {
    const prefix = type === "strength" ? "st" : type === "cross" ? "ct" : "ss";
    return `${prefix}-${Number(now).toString(36)}-${rand().toString(36).slice(2, 7).padEnd(5, "0")}`;
}

const validDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const durationOf = (startedAt, completedAt) => {
    const s = pos(startedAt), e = pos(completedAt);
    if (!s || !e || e <= s) return null;
    const sec = Math.round((e - s) / 1000);
    return sec >= 30 && sec <= MAX_SESSION_SEC ? sec : null;
};

/* ---------- strength ---------- */

function cleanSet(set) {
    const t = SET_TYPES.includes(set?.type) ? set.type : SET_TYPES.includes(set?.t) ? set.t : "working";
    const out = {
        w: Math.max(0, Math.round((num(set?.weight ?? set?.w) || 0) * 100) / 100),
        r: Math.max(0, Math.round(num(set?.reps ?? set?.r) || 0)),
        d: Math.max(0, Math.round(num(set?.duration ?? set?.d) || 0))
    };
    if (t !== "working") out.t = t;
    return out;
}

const setHasNumbers = (set, mode) => mode === "time" ? set.d > 0 : set.w > 0 || set.r > 0;

/**
 * Which sets of a day count as done: the ones ticked off; with none ticked
 * and `includeAll`, every set with numbers in it (how the Strength page
 * always logged an untouched workout). -> [{ name, mode, bw, sets }]
 */
export function doneExercises(day, { includeAll = false, isBodyweight = () => false } = {}) {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    const anyTicked = exercises.some(ex => (ex.sets || []).some(s => s.done));
    return exercises.map(ex => {
        const mode = ex.mode === "time" ? "time" : "reps";
        const chosen = (ex.sets || []).filter(s => anyTicked ? s.done : includeAll);
        const sets = chosen.map(cleanSet).filter(s => setHasNumbers(s, mode));
        const out = { name: text(ex.name, 80) || "Exercise", mode, sets };
        if (mode !== "time" && isBodyweight(ex)) out.bw = true;
        return out;
    }).filter(ex => ex.sets.length);
}

/** A finished Strength-page workout. Duration only when the timer really ran. */
export function strengthSession(day, { id, startedAt = null, completedAt = Date.now(), now = completedAt, includeAll = false, isBodyweight, note = "" } = {}) {
    const exercises = doneExercises(day, { includeAll, isBodyweight });
    if (!exercises.length) return null;
    return {
        v: SESSION_VERSION,
        id: id || newSessionId("strength", completedAt),
        type: "strength",
        source: "strength",
        status: "completed",
        date: localDay(completedAt),
        startedAt: pos(startedAt),
        completedAt,
        updatedAt: now,
        title: text(day?.name, 80) || "Strength workout",
        note: text(note, 500),
        durationSec: durationOf(startedAt, completedAt),
        strength: { dayId: day?.id ? String(day.id) : null, exercises }
    };
}

/**
 * Totals worked out from the sets every time, so an edit can't leave them
 * stale. Volume = weight × reps over weighted sets only: warm-ups,
 * bodyweight exercises and timed holds are left out (a bodyweight
 * "volume" would need a body weight Southbound doesn't have).
 */
export function strengthTotals(session) {
    const exercises = session?.strength?.exercises || [];
    let sets = 0, warmups = 0, volumeLb = 0, volumeSets = 0;
    const tops = [];
    for (const ex of exercises) {
        let top = null;
        for (const s of ex.sets || []) {
            if (s.t === "warmup") { warmups++; continue; }
            sets++;
            if (ex.mode !== "time" && !ex.bw && s.w > 0 && s.r > 0) {
                volumeLb += s.w * s.r;
                volumeSets++;
            }
            if (ex.mode === "time") { if (!top || s.d > top.d) top = s; }
            else if (!top || s.w > top.w || (s.w === top.w && s.r > top.r)) top = s;
        }
        tops.push(top);
    }
    return {
        exercises: exercises.length,
        sets,
        warmups,
        volumeLb: Math.round(volumeLb),
        volumeSets,
        tops
    };
}

/* ---------- cross-training ---------- */

/**
 * A cross-training session logged from a library workout (or a plain
 * activity when `workout` is null). `done` = the block ids done (null =
 * all of them). Minutes: what was typed, else the done blocks' total.
 */
export function crossSession(workout, { id, date, minutes = null, intensity = null, done = null, note = "", activity = null, title = "", completedAt = Date.now(), now = completedAt } = {}) {
    const blocks = (workout?.blocks || []).map(b => ({
        label: text(b.label || b.name, 60) || "Block",
        min: pos(b.duration) != null ? Math.round(pos(b.duration) * 10) / 10 : null,
        intensity: INTENSITIES.includes(b.intensity) ? b.intensity : null,
        done: done == null ? true : done.includes(b.id)
    }));
    const doneMin = blocks.filter(b => b.done && b.min).reduce((t, b) => t + b.min, 0);
    const typed = pos(minutes);
    const durationMin = typed != null ? typed : doneMin > 0 ? doneMin : null;
    const act = CROSS_ACTIVITIES[activity] ? activity : CROSS_ACTIVITIES[workout?.category] ? workout.category : "other";
    const level = INTENSITIES.includes(intensity) ? intensity : dominantIntensity(blocks.filter(b => b.done));
    if (durationMin == null && !blocks.some(b => b.done)) return null;
    const day = validDate(date) ? date : localDay(completedAt);
    return {
        v: SESSION_VERSION,
        id: id || newSessionId("cross", completedAt),
        type: "cross",
        source: "cross",
        status: "completed",
        date: day,
        startedAt: null,
        completedAt,
        updatedAt: now,
        title: text(title, 80) || text(workout?.name, 80) || CROSS_ACTIVITIES[act],
        note: text(note, 500),
        durationSec: durationMin != null ? Math.round(durationMin * 60) : null,
        cross: { workoutId: workout?.id ? String(workout.id) : null, activity: act, intensity: level, blocks }
    };
}

function dominantIntensity(blocks) {
    const minutes = { easy: 0, moderate: 0, hard: 0 };
    let any = false;
    for (const b of blocks) if (b.intensity) { minutes[b.intensity] += b.min || 1; any = true; }
    if (!any) return null;
    return INTENSITIES.reduce((best, k) => (minutes[k] > minutes[best] ? k : best), "easy");
}

export function crossTotals(session) {
    const blocks = session?.cross?.blocks || [];
    return { blocks: blocks.length, done: blocks.filter(b => b.done).length };
}

/* ---------- runs (read from where they already live) ---------- */

function runRecord({ id, source, date, startTime, meters, sec, avgHr, title, note = "", category = null, plannedMiles = null, runType = null, updatedAt = null }) {
    const m = pos(meters), s = pos(sec);
    const start = startTime ? Date.parse(startTime) : NaN;
    return {
        v: SESSION_VERSION,
        id,
        type: "run",
        source,
        status: "completed",
        date,
        startedAt: Number.isFinite(start) ? start : null,
        completedAt: Number.isFinite(start) && s ? start + s * 1000 : null,
        updatedAt: updatedAt || (Number.isFinite(start) ? start : null),
        title: text(title, 80) || "Run",
        note: text(note, 500),
        durationSec: s ? Math.round(s) : null,
        run: {
            meters: m ? Math.round(m) : null,
            movingSec: s ? Math.round(s) : null,
            paceSec: m && s ? Math.round(s / (m / MILE)) : null,
            avgHr: pos(avgHr) ? Math.round(avgHr) : null,
            category: category || null,
            plannedMiles: pos(plannedMiles),
            runType: runType ? text(runType, 30) : null
        }
    };
}

/** A COROS or Strava run (as js/trendsData.js allRuns() gives them). Ids match js/athleteLedger.js. */
export function runFromWatch(run, { category = null, title = "" } = {}) {
    if (!run || !validDate(run.date) || !(Number(run.distance) > 0)) return null;
    const strava = run.source === "strava";
    const key = strava ? run.key : run.labelId;
    if (!key) return null;
    return runRecord({
        id: (strava ? "s:" : "c:") + key,
        source: strava ? "strava" : "coros",
        date: run.date,
        startTime: run.startTime,
        meters: run.distance,
        sec: run.duration,
        avgHr: run.avgHr,
        title: title || run.name,
        category
    });
}

/** A Running Log entry (typed in, or imported from COROS). It has miles, never a time. */
export function runFromLog(entry) {
    if (!entry?.id || !validDate(entry.date) || !(Number(entry.miles) > 0)) return null;
    const r = runRecord({
        id: "l:" + entry.id,
        source: "log",
        date: entry.date,
        startTime: entry.time ? `${entry.date}T${entry.time}:00` : null,
        meters: Number(entry.miles) * MILE,
        sec: null,
        title: entry.name || (entry.type ? `${entry.type} run` : "Run"),
        note: entry.notes,
        runType: entry.type
    });
    r.completedAt = r.startedAt;
    r.logId = entry.id;
    r.corosActivityId = entry.corosActivityId || null;
    return r;
}

const tsMs = v => {
    if (!v) return null;
    if (typeof v === "number") return v;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.seconds === "number") return v.seconds * 1000;
    const p = Date.parse(v);
    return Number.isFinite(p) ? p : null;
};

/** A client's logged result on a coach's plan (workoutResults), completed only. */
export function sessionFromResult(result) {
    if (!result || result.status !== "completed" || !validDate(result.date)) return null;
    const id = "r:" + (result.id || `${result.planId}_${result.date}${result.kind === "strength" ? "_strength" : ""}`);
    const at = tsMs(result.updatedAt) || tsMs(result.createdAt);
    if (result.kind === "strength") {
        const exercises = (result.exercises || []).map(ex => ({
            name: text(ex.name, 80) || "Exercise",
            mode: "reps",
            sets: (ex.sets || []).map(cleanSet).filter(s => s.w > 0 || s.r > 0)
        })).filter(ex => ex.sets.length);
        return {
            v: SESSION_VERSION, id, type: "strength", source: "plan", status: "completed",
            date: result.date, startedAt: null, completedAt: tsMs(result.createdAt), updatedAt: at,
            title: text(result.title, 80) || "Strength session", note: text(result.note, 500),
            durationSec: pos(result.durationSec) ? Math.round(result.durationSec) : null,
            strength: { dayId: null, exercises }, resultId: result.id || null
        };
    }
    const r = runRecord({
        id, source: "plan", date: result.date, startTime: null,
        meters: pos(result.distance) ? result.distance * MILE : null,
        sec: result.durationSec, title: result.title, note: result.note,
        plannedMiles: result.plannedMiles, updatedAt: at
    });
    r.completedAt = tsMs(result.createdAt);
    r.resultId = result.id || null;
    return r;
}

/* ---------- stored records ---------- */

/** A stored record read back from storage or the cloud: checked, or null. */
export function cleanStored(raw) {
    let r = raw;
    if (typeof r === "string") { try { r = JSON.parse(r); } catch { return null; } }
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id) return null;
    if (r.deleted) return { id: r.id, deleted: true, updatedAt: num(r.updatedAt) || 0 };
    if (!["strength", "cross"].includes(r.type) || !validDate(r.date)) return null;
    const base = {
        v: SESSION_VERSION, id: r.id, type: r.type, source: r.type, status: "completed",
        date: r.date, startedAt: pos(r.startedAt), completedAt: pos(r.completedAt),
        updatedAt: num(r.updatedAt) || 0, title: text(r.title, 80) || (r.type === "strength" ? "Strength workout" : "Cross-training"),
        note: text(r.note, 500), durationSec: pos(r.durationSec) ? Math.min(MAX_SESSION_SEC, Math.round(r.durationSec)) : null
    };
    if (r.edited) base.edited = true;
    if (r.type === "strength") {
        const exercises = (r.strength?.exercises || []).map(ex => {
            const mode = ex?.mode === "time" ? "time" : "reps";
            const out = { name: text(ex?.name, 80) || "Exercise", mode, sets: (ex?.sets || []).map(cleanSet).filter(s => setHasNumbers(s, mode)) };
            if (ex?.bw && mode !== "time") out.bw = true;
            return out;
        }).filter(ex => ex.sets.length);
        base.strength = { dayId: r.strength?.dayId ? String(r.strength.dayId) : null, exercises };
    } else {
        const c = r.cross || {};
        base.cross = {
            workoutId: c.workoutId ? String(c.workoutId) : null,
            activity: CROSS_ACTIVITIES[c.activity] ? c.activity : "other",
            intensity: INTENSITIES.includes(c.intensity) ? c.intensity : null,
            blocks: (c.blocks || []).map(b => ({ label: text(b?.label, 60) || "Block", min: pos(b?.min), intensity: INTENSITIES.includes(b?.intensity) ? b.intensity : null, done: Boolean(b?.done) }))
        };
    }
    return base;
}

/** The fields a person can change on a stored session. Id, type, date-done and source never move. */
export const EDITABLE = ["title", "note", "durationSec", "date", "intensity", "exercises", "blocksDone"];

/**
 * An edited copy. changes: { title?, note?, durationSec? (null clears),
 * date?, intensity? (cross), exercises? (strength: same shape as stored),
 * blocksDone? (cross: [index]) }. Unknown fields are ignored.
 */
export function editSession(session, changes = {}, now = Date.now()) {
    const s = cleanStored(session);
    if (!s || s.deleted) return s;
    const out = JSON.parse(JSON.stringify(s));
    if ("title" in changes) out.title = text(changes.title, 80) || out.title;
    if ("note" in changes) out.note = text(changes.note, 500);
    if ("durationSec" in changes) {
        const d = pos(changes.durationSec);
        out.durationSec = d ? Math.min(MAX_SESSION_SEC, Math.round(d)) : null;
    }
    if ("date" in changes && validDate(changes.date)) out.date = changes.date;
    if (out.type === "cross") {
        if ("intensity" in changes) out.cross.intensity = INTENSITIES.includes(changes.intensity) ? changes.intensity : null;
        if (Array.isArray(changes.blocksDone)) out.cross.blocks.forEach((b, i) => { b.done = changes.blocksDone.includes(i); });
    }
    if (out.type === "strength" && Array.isArray(changes.exercises)) {
        const cleaned = cleanStored({ ...out, strength: { ...out.strength, exercises: changes.exercises } });
        if (cleaned?.strength?.exercises?.length) out.strength.exercises = cleaned.strength.exercises;
    }
    out.updatedAt = Math.max(now, (s.updatedAt || 0) + 1);
    out.edited = true;
    return out;
}

/** The marker a delete leaves (sync can't carry a removed key). */
export const deletedMarker = (id, now = Date.now()) => ({ id, deleted: true, updatedAt: now });

/**
 * Which stored strength session to continue when the same workout is
 * opened again: one for this day, completed today within RESUME_WINDOW_MS.
 */
export function resumableSession(stored, dayId, now = Date.now()) {
    const today = localDay(now);
    return (stored || [])
        .filter(s => s && !s.deleted && s.type === "strength" && s.strength?.dayId === String(dayId) &&
            s.date === today && s.completedAt && now - s.completedAt <= RESUME_WINDOW_MS)
        .sort((a, b) => b.completedAt - a.completedAt)[0] || null;
}

/* ---------- shares ---------- */

/** Share history after one share or save. via: "share" | "save". */
export function recordShare(shares, id, via, now = Date.now()) {
    const all = shares && typeof shares === "object" ? { ...shares } : {};
    const prev = all[id] || {};
    all[id] = { count: (Number(prev.count) || 0) + 1, lastAt: now, via: via === "save" ? "save" : "share" };
    return all;
}

/* ---------- the feed ---------- */

export const sortTime = s => s.completedAt || s.startedAt || Date.parse(`${s.date}T12:00:00`);

const near = (a, b, tol) => a && b && Math.abs(a - b) <= tol * Math.max(a, b);

/**
 * Every completed workout, newest first, each once.
 * { stored: [records], watchRuns: [run records], logRuns: [run records],
 *   results: [records from sessionFromResult], shares, from?, to? }
 * Duplicates dropped: a Running Log entry imported from COROS (or typed in
 * for a day the watch already has the same distance) and a plan log whose
 * watch run is there (the watch run keeps the plan's title and the log's id).
 */
export function buildFeed({ stored = [], watchRuns = [], logRuns = [], results = [], shares = {}, from = null, to = null } = {}) {
    const out = [];
    const watch = watchRuns.filter(Boolean).map(r => ({ ...r }));
    const coros = new Set(watch.filter(r => r.source === "coros").map(r => r.id.slice(2)));
    const byDate = new Map();
    for (const r of watch) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
    out.push(...watch);
    for (const r of logRuns.filter(Boolean)) {
        if (r.corosActivityId && coros.has(String(r.corosActivityId))) continue;
        if ((byDate.get(r.date) || []).some(w => near(w.run.meters, r.run.meters, 0.15))) continue;
        out.push(r);
    }
    for (const r of results.filter(Boolean)) {
        if (r.type === "run") {
            const twin = (byDate.get(r.date) || []).find(w => !r.run.meters || near(w.run.meters, r.run.meters, 0.2));
            if (twin) {
                if (r.title && r.title !== "Run") twin.title = r.title;
                twin.resultId = r.resultId;
                if (r.run.plannedMiles) twin.run.plannedMiles = r.run.plannedMiles;
                continue;
            }
        }
        out.push(r);
    }
    const seen = new Map();
    for (const s of stored.map(cleanStored).filter(Boolean)) {
        const prev = seen.get(s.id);
        if (!prev || (s.updatedAt || 0) >= (prev.updatedAt || 0)) seen.set(s.id, s);
    }
    for (const s of seen.values()) if (!s.deleted) out.push(s);
    return out
        .filter(s => (!from || s.date >= from) && (!to || s.date <= to))
        .map(s => (shares?.[s.id] ? { ...s, share: shares[s.id] } : s))
        .sort((a, b) => b.date.localeCompare(a.date) || sortTime(b) - sortTime(a));
}

/** Monday of a YYYY-MM-DD week. */
export function mondayOf(date) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return localDay(d.getTime());
}

/** This week's totals by type, from a feed. Only what was measured is summed. */
export function weekTotals(feed, today) {
    const from = mondayOf(today);
    const week = (feed || []).filter(s => s.date >= from && s.date <= today);
    const runs = week.filter(s => s.type === "run");
    const strength = week.filter(s => s.type === "strength");
    const cross = week.filter(s => s.type === "cross");
    const sum = (list, f) => list.reduce((t, s) => t + (f(s) || 0), 0);
    return {
        from,
        run: { count: runs.length, meters: sum(runs, s => s.run?.meters), longest: runs.reduce((m, s) => Math.max(m, s.run?.meters || 0), 0) },
        strength: {
            count: strength.length,
            sets: sum(strength, s => strengthTotals(s).sets),
            volumeLb: sum(strength, s => strengthTotals(s).volumeLb)
        },
        cross: { count: cross.length, minutes: Math.round(sum(cross, s => s.durationSec) / 60) }
    };
}

/* ---------- words ---------- */

export function clock(sec) {
    const n = Math.round(Number(sec));
    if (!Number.isFinite(n) || n <= 0) return "";
    const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "45 min", "1 h 05 min" — for sessions measured in minutes. */
export function minutesText(sec) {
    const n = Math.round(Number(sec) / 60);
    if (!Number.isFinite(n) || n <= 0) return "";
    return n >= 60 ? `${Math.floor(n / 60)} h ${pad(n % 60)} min` : `${n} min`;
}

export const milesText = meters => (pos(meters) ? `${(meters / MILE).toFixed(2)} mi` : "");
export const paceText = sec => (pos(sec) ? `${clock(sec)}/mi` : "");

const capital = w => (w ? w[0].toUpperCase() + w.slice(1) : "");

/**
 * One line of what a session was, only from what it has:
 * "6.20 mi · 52:10 · 8:25/mi · 148 bpm", "45:10 · 5 exercises · 16 sets · 8,450 lb",
 * "Cycling · 40 min · Moderate · 3/3 blocks".
 * volume(lb) turns a pound total into the person's unit.
 */
export function sessionLine(s, { volume = lb => `${Math.round(lb).toLocaleString("en-US")} lb` } = {}) {
    if (s.type === "run") {
        return [milesText(s.run?.meters), clock(s.durationSec), paceText(s.run?.paceSec), s.run?.avgHr ? `${s.run.avgHr} bpm` : ""].filter(Boolean).join(" · ");
    }
    if (s.type === "strength") {
        const t = strengthTotals(s);
        return [clock(s.durationSec), `${t.exercises} exercise${t.exercises === 1 ? "" : "s"}`, `${t.sets} set${t.sets === 1 ? "" : "s"}`, t.volumeLb > 0 ? volume(t.volumeLb) : ""].filter(Boolean).join(" · ");
    }
    const c = crossTotals(s);
    return [CROSS_ACTIVITIES[s.cross?.activity] || "", minutesText(s.durationSec), capital(s.cross?.intensity), c.blocks ? `${c.done}/${c.blocks} blocks` : ""].filter(Boolean).join(" · ");
}
