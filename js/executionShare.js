/* ==========================================
   Southbound — share a rebuilt workout as an image

   A Share button on the rep-by-rep card (Analytics' key workouts, the
   client's workout page) opens a preview of one tall image in
   Southbound's own style (forest, tan, cream; Bebas / Inter / JetBrains
   Mono; the SB mark): the workout, the run's distance and time, how much
   was done and how much was on target, every rep with its time and its
   difference from the target, recoveries, warm-up and cool-down. Share
   opens the phone's share sheet (save to Photos, Strava, Messages...);
   Save image downloads it. Nothing leaves the device unless the person
   shares it.

   shareCardModel(x, meta)   pure: what the card says (unit-tested)
   cardHeight(model)         pure: how tall it draws
   drawShareCard(canvas, model)   draws it (1080 wide)
   registerShare(x, meta)    remembers an execution for its Share button
   openShareCard(x, meta)    the preview dialog
   (The button: executionHtml(x, { share: true }) in js/executionView.js.)
========================================== */

import { clockText } from "./workoutExecution.js";

const MILE = 1609.344;
export const CARD_W = 1080;
export const MIN_H = 1350;   // 4:5, the tallest most feeds show whole

const C = {
    bg: "#0F2019", surface: "#17291F", line: "rgba(243,239,230,0.12)", text: "#F3EFE6", muted: "rgba(243,239,230,0.62)",
    // Within target is the only positive execution state. Fast / slow are
    // deliberately the same muted neutral so "faster" does not read as "better".
    tan: "#C9AD84", within: "#94B89D", fast: "#C9AD84", slow: "#C9AD84", bad: "#D9705A", done: "#C9AD84", unobserved: "rgba(243,239,230,0.45)"
};
const RESULT = { within: "On target", fast: "Fast", slow: "Slow", partial: "Cut short", missed: "Missed", unobserved: "Not in laps", done: "Done" };

const signed = sec => {
    if (sec == null) return "";
    const r = Math.round(sec);
    return r === 0 ? "0:00" : `${r < 0 ? "−" : "+"}${clockText(Math.abs(r))}`;
};
const dateWords = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function rowOf(s) {
    const state = s.status === "done" ? s.verdict || "done" : s.status;
    let actual = "";
    if (s.actual) {
        if (s.normalizedSec != null) actual = clockText(s.normalizedSec, { tenths: s.normalizedSec < 300 });
        else if (s.durationSec && s.actual.paceSec) actual = `${clockText(s.actual.paceSec)}/mi`;
        else actual = clockText(s.actual.seconds, { tenths: s.actual.seconds < 300 });
    }
    const delta = s.deltaSec != null ? signed(s.deltaSec) : s.deltaPace != null ? `${signed(s.deltaPace)}/mi` : "";
    return {
        label: s.of > 1 ? `Rep ${s.rep}${s.part ? `.${s.part}` : ""}` : s.amount,
        actual, delta, state, result: RESULT[state] || "",
        hr: s.actual?.hr || null,
        note: s.status === "partial" ? s.notes?.[0] || "" : ""
    };
}

/**
 * What the image says. meta: { date, name?, runMeters?, runSec?, who? }
 * -> { date, title, name, stats: [{ label, value }], sets: [{ head, sub, rows, summary }], easy: [text], read, footer }
 */
export function shareCardModel(x, meta = {}) {
    // Plain-run share: the same image system, without inventing a target.
    // Used for Featured Training's Long Run cards and as a fallback when a
    // structured speed workout's laps are not available yet.
    if (meta.runSummary) {
        const runMeters = Number(meta.runMeters);
        const runSec = Number(meta.runSec);
        const miles = Number.isFinite(runMeters) && runMeters > 0 ? runMeters / MILE : null;
        const paceSec = miles && Number.isFinite(runSec) && runSec > 0 ? runSec / miles : null;
        const runStats = [];
        if (miles != null) runStats.push({ label: "Distance", value: miles.toFixed(2) + " mi" });
        if (runSec) runStats.push({ label: "Time", value: clockText(runSec) });
        if (paceSec) runStats.push({ label: "Avg pace", value: clockText(paceSec) + "/mi" });
        if (meta.avgHr) runStats.push({ label: "Avg HR", value: String(Math.round(Number(meta.avgHr))) + " bpm" });
        const category = meta.category === "long_run" ? "Long Run" : meta.category === "speed_work" ? "Speed Work" : "";
        return {
            kind: "run",
            date: meta.date ? dateWords(meta.date) : "",
            title: category || meta.name || "Run",
            name: category ? meta.name || "" : "",
            stats: runStats.slice(0, 4),
            sets: [],
            easy: [],
            summary: meta.plannedMiles && miles != null
                ? miles.toFixed(2) + " of " + Number(meta.plannedMiles).toFixed(1) + " planned miles"
                : category ? "Completed training" : "",
            summaryNote: meta.plannedMiles || category ? "Recorded from your run data · Southbound Coaching" : "",
            footer: (category || "Run") + " · recorded training"
        };
    }

    const work = x.steps.filter(s => s.kind === "work");
    const sets = (x.sets || []).map(set => {
        const steps = work.filter(s => s.set === set.set);
        const first = steps[0];
        const rec = x.steps.find(s => s.kind === "recovery" && s.set === set.set && !s.part);
        const bits = [];
        if (set.avgSec != null && steps.length > 1) bits.push("avg " + clockText(set.avgSec, { tenths: set.avgSec < 300 }));
        else if (set.avgPace && steps.length > 1) bits.push("avg " + clockText(set.avgPace) + "/mi");
        if (set.spreadSec != null && steps.length > 2) bits.push("spread " + (Math.round(set.spreadSec * 10) / 10) + " s");
        if (set.avgHr && steps.length > 1) bits.push(set.avgHr + " bpm");
        return {
            head: set.label + (set.target ? " @ " + set.target : ""),
            sub: rec ? rec.amount + " " + (rec.effort || "recovery") : first?.effort && !set.target ? first.effort : "",
            rows: steps.map(rowOf),
            summary: bits.join(" · ")
        };
    });
    const c = x.completion, t = x.targetCompliance;
    const stats = [];
    if (meta.runMeters) stats.push({ label: "Distance", value: (meta.runMeters / MILE).toFixed(2) + " mi" });
    if (meta.runSec) stats.push({ label: "Time", value: clockText(meta.runSec) });
    if (c) stats.push({ label: "Complete", value: c.pct == null ? "—" : c.done + "/" + c.planned });
    if (t) stats.push({ label: "Within target", value: t.within + "/" + t.judged });
    const easy = x.steps.filter(s => (s.kind === "warmup" || s.kind === "cooldown") && s.actual)
        .map(s => (s.kind === "warmup" ? "Warm-up" : "Cool-down") + " " + (s.actual.meters / MILE).toFixed(2) + " mi @ " + clockText(s.actual.paceSec) + "/mi");
    const title = (x.sets || []).map(s => s.label).join(" + ") || "Workout";
    const name = meta.name && !/^\d/.test(meta.name) && meta.name.length <= 40 && meta.name.toLowerCase() !== title.toLowerCase() ? meta.name : "";
    let summary = "";
    let summaryNote = "";
    if (c && t) {
        summary = c.done + "/" + c.planned + " completed · " + t.within + "/" + t.judged + " within target";
        summaryNote = "Within target is the goal — faster is not automatically better.";
    } else if (c) {
        summary = c.done + "/" + c.planned + " completed";
    }
    return {
        kind: "execution",
        date: meta.date ? dateWords(meta.date) : "",
        title,
        name,
        stats: stats.slice(0, 4),
        sets,
        easy,
        summary,
        summaryNote,
        footer: x.matchConfidence === "exact" ? "Planned vs actual · every lap matched to the plan"
            : x.matchConfidence === "approximate" ? "Planned vs actual · laps matched approximately"
            : "Planned vs actual · a rough match (mile laps)"
    };
}
// ---------- strength and cross-training (pure) ----------

const KG = 2.20462262;
const weightWords = (lb, unit) => {
    const v = unit === "kg" ? Math.round((lb / KG) * 10) / 10 : Math.round(lb * 10) / 10;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}`;
};
const thousands = n => Math.round(n).toLocaleString("en-US");
const holdText = sec => (sec >= 60 ? clockText(sec) : `${sec} s`);

function setWords(set, ex, unit) {
    if (ex.mode === "time") return set.d ? holdText(set.d) : "Done";
    const reps = set.r || 0;
    if (ex.bw) return set.w > 0 ? `BW+${weightWords(set.w, unit)} × ${reps}` : `BW × ${reps}`;
    if (set.w > 0) return `${weightWords(set.w, unit)} × ${reps}`;
    return `${reps} reps`;
}
const SET_LABEL = { warmup: "Warm-up", drop: "Drop", failure: "To failure" };
// More rows than this and each exercise becomes one line (top set, sets, volume).
export const MAX_SET_ROWS = 24;

/**
 * The share card for a completed session (js/completedSessions.js) in the
 * same shape shareCardModel gives, so drawShareCard draws all of them.
 * Only what the session has: no duration without a timer, no volume
 * without weighted sets, no intensity nobody chose.
 * opts: { unit: "lb" | "kg" }
 */
export function sessionCardModel(session, { unit = "lb" } = {}) {
    const date = session?.date ? dateWords(session.date) : "";
    const u = unit === "kg" ? "kg" : "lb";
    if (session?.type === "run") {
        const r = session.run || {};
        const category = r.category === "Long Run" ? "long_run" : r.category === "Speed Work" ? "speed_work" : null;
        return shareCardModel(null, {
            runSummary: true, date: session.date, category,
            name: session.title && session.title !== "Run" ? session.title : "",
            plannedMiles: r.plannedMiles, runMeters: r.meters, runSec: session.durationSec, avgHr: r.avgHr
        });
    }
    if (session?.type === "strength") {
        const exercises = session.strength?.exercises || [];
        let sets = 0, volume = 0;
        for (const ex of exercises) for (const st of ex.sets || []) {
            if (st.t === "warmup") continue;
            sets++;
            if (ex.mode !== "time" && !ex.bw && st.w > 0 && st.r > 0) volume += st.w * st.r;
        }
        const totalRows = exercises.reduce((t, ex) => t + (ex.sets || []).length, 0);
        const compact = totalRows > MAX_SET_ROWS;
        const stats = [];
        if (session.durationSec) stats.push({ label: "Duration", value: clockText(session.durationSec) });
        stats.push({ label: exercises.length === 1 ? "Exercise" : "Exercises", value: String(exercises.length) });
        stats.push({ label: sets === 1 ? "Set" : "Sets", value: String(sets) });
        if (volume > 0) stats.push({ label: `Volume (${u})`, value: thousands(u === "kg" ? volume / KG : volume) });
        const blocks = exercises.map(ex => {
            const working = (ex.sets || []).filter(st => st.t !== "warmup");
            const exVolume = ex.mode !== "time" && !ex.bw ? working.reduce((t, st) => t + (st.w > 0 && st.r > 0 ? st.w * st.r : 0), 0) : 0;
            const top = working.reduce((best, st) => {
                if (!best) return st;
                if (ex.mode === "time") return st.d > best.d ? st : best;
                return st.w > best.w || (st.w === best.w && st.r > best.r) ? st : best;
            }, null);
            let n = 0;
            const rows = compact ? [] : (ex.sets || []).map(st => {
                const warm = st.t === "warmup";
                if (!warm) n++;
                return {
                    label: warm ? "Warm-up" : SET_LABEL[st.t] ? `${SET_LABEL[st.t]}` : `Set ${n}`,
                    actual: setWords(st, ex, u), delta: "", state: warm ? "unobserved" : "done", result: "", hr: null, note: ""
                };
            });
            const bits = [];
            if (compact && top) bits.push(`Top ${setWords(top, ex, u)}`);
            if (exVolume > 0) bits.push(`${thousands(u === "kg" ? exVolume / KG : exVolume)} ${u}`);
            else if (ex.bw) bits.push("Bodyweight");
            return {
                head: ex.name,
                sub: `${working.length} set${working.length === 1 ? "" : "s"}`,
                rows,
                summary: bits.join(" · ")
            };
        });
        return {
            kind: "strength", date,
            title: session.title || "Strength workout",
            name: "Strength",
            stats: stats.slice(0, 4),
            sets: blocks, easy: [],
            summary: "", summaryNote: "",
            footer: volume > 0 ? "Volume = weight × reps on working sets" : "Strength training"
        };
    }
    if (session?.type === "cross") {
        const c = session.cross || {};
        const blocks = c.blocks || [];
        const activity = { cycling: "Cycling", swimming: "Swimming", elliptical: "Elliptical", rowing: "Rowing", yoga: "Yoga", circuit: "Strength Circuit", mobility: "Mobility", other: "Cross-training" }[c.activity] || "Cross-training";
        const level = c.intensity ? c.intensity[0].toUpperCase() + c.intensity.slice(1) : "";
        const stats = [];
        if (session.durationSec) stats.push({ label: "Duration", value: `${Math.round(session.durationSec / 60)} min` });
        if (level) stats.push({ label: "Intensity", value: level });
        if (blocks.length) stats.push({ label: "Blocks", value: `${blocks.filter(b => b.done).length}/${blocks.length}` });
        const title = session.title || activity;
        return {
            kind: "cross", date, title,
            name: title.toLowerCase() === activity.toLowerCase() ? "Cross-training" : activity,
            stats,
            sets: blocks.length ? [{
                head: "Blocks", sub: "",
                rows: blocks.map(b => ({
                    label: b.label, actual: b.min ? `${b.min} min` : "—",
                    delta: b.intensity ? b.intensity[0].toUpperCase() + b.intensity.slice(1) : "",
                    state: b.done ? "done" : "unobserved", result: b.done ? "Done" : "Skipped", hr: null, note: ""
                })),
                summary: ""
            }] : [],
            easy: [], summary: "", summaryNote: "",
            footer: activity
        };
    }
    return null;
}

// ---------- splits (pure) ----------

const MILE_M = 1609.344;
const nearMile = m => Math.abs(m - MILE_M) <= 60;
const nearKm = m => Math.abs(m - 1000) <= 40;

/**
 * A run's laps as rows: auto mile (or km) laps read as "Mile 3 · 8:24/mi",
 * anything else as "Lap 3 · 0.50 mi · 3:21 · 6:42/mi". Scraps under 0.05 mi
 * (a stop pressed late) are left out. -> { unit: "mile" | "km" | "lap", rows }
 */
export function splitRows(entry) {
    const laps = (entry?.laps || []).filter(l => Number(l.m) >= 80 && Number(l.s) > 0);
    if (!laps.length) return { unit: "lap", rows: [] };
    const full = laps.slice(0, -1);
    const unit = full.length && full.every(l => nearMile(l.m)) ? "mile" : full.length && full.every(l => nearKm(l.m)) ? "km" : laps.length === 1 && nearMile(laps[0].m) ? "mile" : "lap";
    let n = 0;
    const rows = laps.map((l, i) => {
        const pace = l.s / (l.m / MILE_M);
        const whole = unit === "mile" ? nearMile(l.m) : unit === "km" ? nearKm(l.m) : true;
        if (whole) n++;
        const dist = l.m >= 1000 || unit === "mile" ? `${(l.m / MILE_M).toFixed(2)} mi` : `${Math.round(l.m)} m`;
        return {
            i, meters: l.m, sec: l.s, pace, hr: Number(l.hr) || null,
            label: unit === "lap" ? `Lap ${i + 1}` : whole ? `${unit === "mile" ? "Mile" : "Km"} ${n}` : dist,
            dist, partial: !whole
        };
    });
    return { unit, rows };
}

/**
 * The splits card: every lap of a run with its pace (or time) and heart rate,
 * the fastest and slowest whole split marked, and how the second half went
 * against the first. Only from the laps the watch saved; nothing estimated.
 * meta: { date, name, category ("long_run" / "speed_work"), runMeters, runSec, avgHr }
 */
export function splitsCardModel(entry, meta = {}) {
    const { unit, rows } = splitRows(entry);
    if (!rows.length) return null;
    const base = shareCardModel(null, { ...meta, runSummary: true, plannedMiles: null });
    const whole = rows.filter(r => !r.partial);
    const judge = whole.length >= 3 ? whole : [];
    const fastest = judge.length ? judge.reduce((a, b) => (b.pace < a.pace ? b : a)) : null;
    const slowest = judge.length ? judge.reduce((a, b) => (b.pace > a.pace ? b : a)) : null;
    const totalM = rows.reduce((t, r) => t + r.meters, 0), totalS = rows.reduce((t, r) => t + r.sec, 0);
    const avgPace = totalS / (totalM / MILE_M);
    const byPace = unit !== "lap";
    const out = rows.map(r => ({
        label: r.label,
        actual: byPace ? `${clockText(r.pace)}/mi` : clockText(r.sec, { tenths: r.sec < 300 }),
        delta: byPace ? (r.partial ? "" : signed(r.pace - avgPace)) : `${clockText(r.pace)}/mi`,
        state: r === fastest ? "within" : r === slowest ? "unobserved" : "done",
        result: r === fastest ? "Fastest" : r === slowest ? "Slowest" : r.partial ? r.dist : "",
        hr: r.hr, note: ""
    }));
    // The halves, by distance, from the laps themselves.
    let half = "";
    if (whole.length >= 4) {
        let acc = 0, s1 = 0, m1 = 0;
        for (const r of rows) {
            if (acc + r.meters <= totalM / 2 + 1) { s1 += r.sec; m1 += r.meters; }
            acc += r.meters;
        }
        const p1 = s1 / (m1 / MILE_M), p2 = (totalS - s1) / ((totalM - m1) / MILE_M);
        const d = Math.round(p2 - p1);
        half = Math.abs(d) <= 3 ? "Even halves" : d < 0 ? `Negative split · 2nd half ${clockText(-d)}/mi faster` : `2nd half ${clockText(d)}/mi slower`;
    }
    const hrs = rows.map(r => r.hr).filter(Boolean);
    return {
        ...base,
        kind: "splits",
        stats: base.stats.length ? base.stats : [{ label: "Distance", value: `${(totalM / MILE_M).toFixed(2)} mi` }, { label: "Time", value: clockText(totalS) }],
        summary: "",
        summaryNote: "",
        sets: [{
            head: unit === "mile" ? "Mile splits" : unit === "km" ? "Km splits" : "Laps",
            sub: byPace ? `avg ${clockText(avgPace)}/mi` : `${rows.length} laps`,
            rows: out,
            summary: [half, byPace && hrs.length ? `HR ${Math.min(...hrs)}–${Math.max(...hrs)}` : ""].filter(Boolean).join(" · ")
        }],
        easy: [],
        footer: `Splits from your watch · ${byPace ? "difference from your average pace" : "time and pace per lap"}`
    };
}

/** Plain words of a card, to paste under the photo (Strava's description, a message). */
export function captionText(model) {
    if (!model) return "";
    const lines = [[model.name, model.title].filter(Boolean).join(": ")];
    if (model.stats.length) lines.push(model.stats.map(s => `${s.label}: ${s.value}`).join(" · "));
    if (model.summary) lines.push(model.summary);
    for (const set of model.sets) {
        const rows = set.rows.length ? set.rows.map(r => r.actual).filter(Boolean).join(", ") : "";
        lines.push(`${set.head}${set.sub ? ` (${set.sub})` : ""}${rows ? `: ${rows}` : ""}${set.summary ? ` · ${set.summary}` : ""}`);
    }
    if (model.easy.length) lines.push(model.easy.join(" · "));
    lines.push("Logged with Southbound Coaching");
    return lines.filter(Boolean).join("\n");
}

// ---------- layout (pure) ----------

const PAD = 72, ROW = 66, SET_HEAD = 64, SET_GAP = 24, STAT_H = 150, SUMMARY_H = 102, FOOT = 118;
const twoCols = n => n > 10;

/** How tall the card draws (at least 1350). */
export function cardHeight(model) {
    let h = PAD + 64 + 32;                       // brand row
    h += (model.name ? 46 : 0) + 104 * (model.title.length > 22 ? 2 : 1) + 28;
    h += model.stats.length ? STAT_H + 32 : 0;
    h += model.summary ? SUMMARY_H + 32 : 0;
    for (const s of model.sets) {
        const rows = twoCols(s.rows.length) ? Math.ceil(s.rows.length / 2) : s.rows.length;
        h += SET_HEAD + rows * ROW + (s.summary ? 40 : 0) + SET_GAP;
    }
    h += model.easy.length ? 54 : 0;
    h += FOOT + PAD;                             // footer
    return Math.max(MIN_H, Math.ceil(h));
}

// ---------- drawing (browser) ----------

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function fitText(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
}

function wrap(ctx, text, max, lines = 2) {
    const words = text.split(" ");
    const out = [];
    let line = "";
    for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (ctx.measureText(next).width > max && line) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
    if (out.length > lines) { out.length = lines; out[lines - 1] = fitText(ctx, `${out[lines - 1]}…`, max); }
    return out;
}

const markImage = () => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "brand/sb-mark.svg";
});

async function fontsReady() {
    if (!document.fonts?.load) return;
    await Promise.all([
        '96px "Bebas Neue"', '600 28px "Inter"', '400 28px "Inter"', '500 32px "JetBrains Mono"', '800 30px "Saira"'
    ].map(f => document.fonts.load(f).catch(() => null)));
}

/** Draws the card on `canvas` (resized to fit). Resolves when done. */
export async function drawShareCard(canvas, model) {
    await fontsReady();
    const mark = await markImage();
    const H = cardHeight(model);
    canvas.width = CARD_W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const W = CARD_W, inner = W - PAD * 2;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // A quiet tan edge down the left, the brand's slash.
    ctx.fillStyle = C.tan; ctx.fillRect(0, 0, 10, H);

    let y = PAD;
    // Brand row: the mark, the name, the date.
    if (mark) ctx.drawImage(mark, PAD, y, 64 * (186 / 119), 64);
    ctx.fillStyle = C.text; ctx.font = '800 30px "Saira", sans-serif'; ctx.textBaseline = "middle";
    ctx.fillText("SOUTHBOUND", PAD + (mark ? 64 * (186 / 119) + 20 : 0), y + 32);
    ctx.textAlign = "right"; ctx.fillStyle = C.tan; ctx.font = '600 26px "Inter", sans-serif';
    ctx.fillText(model.date.toUpperCase(), W - PAD, y + 32);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    y += 64 + 32;

    // Title.
    if (model.name) { ctx.fillStyle = C.tan; ctx.font = '600 30px "Inter", sans-serif'; ctx.fillText(fitText(ctx, model.name.toUpperCase(), inner), PAD, y + 30); y += 46; }
    ctx.fillStyle = C.text; ctx.font = '96px "Bebas Neue", sans-serif';
    for (const line of wrap(ctx, model.title.toUpperCase(), inner, 2)) { y += 96; ctx.fillText(line, PAD, y); y += 8; }
    y += 28;

    // Stats.
    if (model.stats.length) {
        const gap = 18, w = (inner - gap * (model.stats.length - 1)) / model.stats.length;
        model.stats.forEach((s, i) => {
            const x0 = PAD + i * (w + gap);
            ctx.fillStyle = C.surface; roundRect(ctx, x0, y, w, STAT_H, 22); ctx.fill();
            ctx.fillStyle = C.text; ctx.font = '62px "Bebas Neue", sans-serif';
            ctx.fillText(fitText(ctx, s.value, w - 40), x0 + 24, y + 82);
            ctx.fillStyle = C.tan; ctx.font = '600 21px "Inter", sans-serif';
            ctx.fillText(s.label.toUpperCase(), x0 + 24, y + 122);
        });
        y += STAT_H + 32;
    }

    if (model.summary) {
        ctx.fillStyle = C.surface; roundRect(ctx, PAD, y, inner, SUMMARY_H, 22); ctx.fill();
        ctx.fillStyle = C.text; ctx.font = '600 30px "Inter", sans-serif';
        ctx.fillText(fitText(ctx, model.summary, inner - 48), PAD + 24, y + 40);
        if (model.summaryNote) {
            ctx.fillStyle = C.muted; ctx.font = '400 22px "Inter", sans-serif';
            ctx.fillText(fitText(ctx, model.summaryNote, inner - 48), PAD + 24, y + 76);
        }
        y += SUMMARY_H + 32;
    }

    // Each set, rep by rep.
    for (const set of model.sets) {
        ctx.fillStyle = C.tan; ctx.font = '50px "Bebas Neue", sans-serif';
        ctx.fillText(fitText(ctx, set.head.toUpperCase(), inner * 0.68), PAD, y + 44);
        if (set.sub) { ctx.textAlign = "right"; ctx.fillStyle = C.muted; ctx.font = '500 24px "Inter", sans-serif'; ctx.fillText(fitText(ctx, set.sub, inner * 0.3), W - PAD, y + 40); ctx.textAlign = "left"; }
        y += SET_HEAD;
        const cols = twoCols(set.rows.length) ? 2 : 1;
        const per = Math.ceil(set.rows.length / cols);
        const colW = (inner - (cols - 1) * 32) / cols;
        set.rows.forEach((r, i) => {
            const col = Math.floor(i / per), x0 = PAD + col * (colW + 32), ry = y + (i % per) * ROW;
            const color = C[r.state] || C.text;
            ctx.strokeStyle = C.line; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x0, ry); ctx.lineTo(x0 + colW, ry); ctx.stroke();
            ctx.fillStyle = color; roundRect(ctx, x0, ry + 13, 8, ROW - 26, 4); ctx.fill();
            ctx.fillStyle = C.muted; ctx.font = '600 26px "Inter", sans-serif';
            ctx.fillText(fitText(ctx, r.label, colW * 0.24), x0 + 24, ry + 38);
            ctx.fillStyle = C.text; ctx.font = '500 32px "JetBrains Mono", monospace';
            ctx.fillText(r.actual || "—", x0 + colW * 0.27, ry + 38);
            ctx.fillStyle = color; ctx.font = '500 28px "JetBrains Mono", monospace';
            ctx.fillText(r.delta, x0 + colW * (cols === 1 ? 0.52 : 0.55), ry + 37);
            ctx.textAlign = "right"; ctx.font = '600 24px "Inter", sans-serif';
            ctx.fillText(r.result, x0 + colW, ry + 36);
            ctx.textAlign = "left";
            if (r.hr) {
                // Keep heart rate visible in both one- and two-column layouts.
                ctx.fillStyle = C.muted; ctx.font = '400 20px "Inter", sans-serif';
                ctx.fillText(`HR ${r.hr}`, x0 + colW * 0.27, ry + 59);
            }
        });
        y += per * ROW;
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
        if (set.summary) { ctx.fillStyle = C.muted; ctx.font = '500 24px "Inter", sans-serif'; ctx.fillText(set.summary, PAD, y + 34); y += 40; }
        y += SET_GAP;
    }

    // Warm-up and cool-down.
    if (model.easy.length) {
        ctx.fillStyle = C.muted; ctx.font = '400 25px "Inter", sans-serif';
        ctx.fillText(fitText(ctx, model.easy.join("   ·   "), inner), PAD, y + 30); y += 54;
    }

    // Footer.
    const fy = H - PAD - 64;
    ctx.strokeStyle = C.tan; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(PAD, fy); ctx.lineTo(PAD + 120, fy); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillStyle = C.tan; ctx.font = '600 24px "Inter", sans-serif';
    ctx.fillText("southboundcoaching.com", W - PAD, fy + 44);
    const url = ctx.measureText("southboundcoaching.com").width;
    ctx.textAlign = "left"; ctx.fillStyle = C.muted; ctx.font = '500 22px "Inter", sans-serif';
    ctx.fillText(fitText(ctx, model.footer, inner - url - 40), PAD, fy + 44);
    ctx.fillText(model.kind === "execution" ? "Negative = faster than the target" : model.kind === "splits" ? "Negative = faster than your average" : "Your training · Southbound Coaching", PAD, fy + 76);
    return canvas;
}


// ---------- the preview dialog ----------
//
// One dialog for every card (key workouts, Featured Runs, completed
// sessions). It never leaves the person stuck: a card that can't be
// drawn says so with Try again; Share is offered only when the device
// can share files; a failed share says what to do instead of
// downloading behind their back; on an iPhone / iPad (where a download
// from an installed app opens a viewer with no way back) Save shows how
// to keep the picture instead. Every share or save is noted
// (js/sessionStore.js noteShared) when the card belongs to a session.

const registry = new Map();
let wired = false;

function wireClicks() {
    if (wired) return;
    wired = true;
    document.addEventListener("click", event => {
        const btn = event.target.closest?.("[data-ex-share]");
        if (!btn) return;
        const hit = registry.get(btn.dataset.exShare);
        if (!hit) return;
        event.preventDefault();
        if (hit.model) openCardDialog(hit.model, hit.opts);
        else openShareCard(hit.x, hit.meta);
    });
}

/** Remembers a ready card model (a run's splits) for a data-ex-share button. */
export function registerCard(key, model, opts = {}) {
    if (!key || !model) return null;
    registry.set(key, { model, opts });
    wireClicks();
    return key;
}

/** Remembers an execution so its Share button (data-ex-share = plannedWorkoutId) can open it. */
export function registerShare(x, meta = {}) {
    if (!x?.plannedWorkoutId) return null;
    registry.set(x.plannedWorkoutId, { x, meta });
    wireClicks();
    return x.plannedWorkoutId;
}

/**
 * Registers a plain run share in the same image dialog as structured
 * workouts. The key is the run's own id (meta.id, else COROS label /
 * Strava key), so two runs on one day never open each other's card.
 */
export function registerRunShare(run, meta = {}) {
    if (!run) return null;
    const own = meta.id || run.labelId || (run.source === "strava" && run.key ? `s:${run.key}` : "");
    const key = "run|" + (own || `${meta.date || run.date || ""}|${Math.round(Number(run.distance) || 0)}`);
    registry.set(key, {
        x: { plannedWorkoutId: key, steps: [], sets: [], completion: null, targetCompliance: null, matchConfidence: "none" },
        meta: { ...meta, runSummary: true, avgHr: run.avgHr }
    });
    wireClicks();
    return key;
}

/** Opens the share dialog for an execution or a plain run (meta.runSummary). */
export function openShareCard(x, meta = {}) {
    let model = null;
    try { model = shareCardModel(x, meta); } catch { model = null; }
    return openCardDialog(model, { date: meta.date, sessionId: meta.sessionId || null });
}

// The dialog's look lives in css/share.css, loaded here so it works on any page.
function ensureStyles() {
    if (document.querySelector('link[data-share-css]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/share.css";
    link.dataset.shareCss = "";
    document.head.appendChild(link);
}
if (typeof document !== "undefined") ensureStyles();

const escHtml = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** iPhone / iPad (iPadOS says it's a Mac with touch). */
export function isAppleMobile(nav = typeof navigator !== "undefined" ? navigator : {}) {
    const ua = nav.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua) || (nav.platform === "MacIntel" && Number(nav.maxTouchPoints) > 1);
}

export const fileNameFor = (model, date) =>
    `southbound-${model?.kind === "strength" ? "strength" : model?.kind === "cross" ? "cross-training" : model?.kind === "splits" ? "run" : "workout"}-${date || "session"}.png`;

const note = sessionId => (via) => {
    if (!sessionId) return;
    import("./sessionStore.js").then(m => m.noteShared(sessionId, via)).catch(() => {});
};

/**
 * The dialog itself. model: a card model, or a promise of one (a run's laps
 * may still be on their way from COROS); null = couldn't be made.
 * opts: { date, sessionId }
 */
export async function openCardDialog(modelOrPromise, { date = "", sessionId = null } = {}) {
    ensureStyles();
    const noted = note(sessionId);
    let file = null, url = "", closed = false;
    const apple = isAppleMobile();
    const pending = modelOrPromise && typeof modelOrPromise.then === "function";
    let model = pending ? null : modelOrPromise;
    let caption = model ? captionText(model) : "";
    const dialog = document.createElement("dialog");
    dialog.className = "sb-dialog ex-share-dialog";
    dialog.innerHTML = `
        <div class="sb-dialog-form">
            <h2 class="sb-dialog-title">Share this workout</h2>
            <div class="ex-share-preview" aria-live="polite"><p class="clients-card-note sb-wait">Making the image…</p></div>
            <p class="ex-share-status" role="status" hidden></p>
            <p class="ex-share-hint" data-hint></p>
            <details class="ex-share-strava">
                <summary>Add it to Strava</summary>
                <ol>
                    <li>${apple ? "Tap <strong>Share</strong>, then <strong>Save Image</strong> (or press and hold the picture and tap <strong>Save to Photos</strong>)." : "Tap <strong>Save image</strong> (or <strong>Share</strong> and save it to your photos)."}</li>
                    <li>In the Strava app, open the activity, tap <strong>Edit</strong> and add a photo: pick this image.</li>
                    <li>Optional: <strong>Copy caption</strong> below and paste it into the description.</li>
                </ol>
                <p class="ex-share-fine">Southbound can't post to Strava or attach the photo for you: Strava only lets you add photos inside its own app.</p>
            </details>
            <div class="sb-dialog-actions ex-share-actions">
                <button type="button" class="sb-btn sb-btn-tertiary" data-act="close">Close</button>
                <button type="button" class="sb-btn sb-btn-secondary" data-act="caption"${caption ? "" : " hidden"}>Copy caption</button>
                <button type="button" class="sb-btn sb-btn-secondary" data-act="save" disabled>Save image</button>
                <button type="button" class="sb-btn sb-btn-primary" data-act="share" disabled hidden>Share</button>
            </div>
        </div>`;
    document.body.appendChild(dialog);
    const $ = sel => dialog.querySelector(sel);
    const preview = $(".ex-share-preview"), status = $(".ex-share-status"), hint = $("[data-hint]");
    const share = $('[data-act="share"]'), save = $('[data-act="save"]');
    const say = (text, kind = "info") => { status.textContent = text; status.dataset.kind = kind; status.hidden = !text; };
    dialog.addEventListener("close", () => { closed = true; dialog.remove(); if (url) URL.revokeObjectURL(url); });
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    $('[data-act="close"]').addEventListener("click", () => dialog.close());
    $('[data-act="caption"]').addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(caption); say("Caption copied. Paste it into the activity's description."); }
        catch { say("Couldn't copy here. Press and hold to select the words in your notes instead.", "error"); }
    });
    try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }

    if (pending) {
        try { model = await modelOrPromise; } catch { model = null; }
        if (closed) return dialog;
        caption = model ? captionText(model) : "";
        $('[data-act="caption"]').hidden = !caption;
    }

    const fail = () => {
        preview.innerHTML = `<div class="ex-share-error"><p>Couldn't make the image on this device.</p><button type="button" class="sb-btn sb-btn-secondary" data-act="retry">Try again</button></div>`;
        preview.querySelector('[data-act="retry"]').addEventListener("click", () => { dialog.close(); openCardDialog(model || modelOrPromise, { date, sessionId }); });
        hint.textContent = caption ? "You can still copy the caption." : "";
    };

    if (!model) { fail(); return dialog; }
    let blob = null, height = 0;
    try {
        const canvas = document.createElement("canvas");
        await drawShareCard(canvas, model);
        height = canvas.height;
        if (closed) return dialog;
        blob = await new Promise(resolve => {
            try { canvas.toBlob(resolve, "image/png"); } catch { resolve(null); }
        });
    } catch { blob = null; }
    if (closed) return dialog;
    if (!blob) { fail(); return dialog; }

    const name = fileNameFor(model, date);
    file = new File([blob], name, { type: "image/png" });
    url = URL.createObjectURL(blob);
    preview.innerHTML = `<img src="${url}" alt="${escHtml(`${model.title}: ${model.stats.map(st => `${st.label} ${st.value}`).join(", ")}`)}" width="${CARD_W}" height="${height}">`;
    let canShare = false;
    try { canShare = Boolean(navigator.canShare?.({ files: [file] })); } catch { canShare = false; }
    if (canShare) { share.hidden = false; share.disabled = false; }
    if (apple) {
        // A download from an installed app on iOS opens a viewer with no way back.
        save.hidden = true;
        hint.textContent = canShare
            ? "Tap Share, then Save Image to keep it in Photos, or send it to another app."
            : "Press and hold the picture, then tap Save to Photos.";
    } else {
        save.disabled = false;
        hint.textContent = canShare
            ? "Share opens your device's share sheet: send the image to another app or save it."
            : "Save image downloads it to this device.";
    }

    save.addEventListener("click", () => {
        try {
            const a = document.createElement("a");
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            noted("save");
            say("Image saved to your downloads.");
        } catch {
            say("Couldn't save it here. Press and hold the picture to save it instead.", "error");
        }
    });
    share.addEventListener("click", async () => {
        say("");
        try {
            await navigator.share({ files: [file], title: model.title });
            noted("share");
            dialog.close();
        } catch (error) {
            if (error?.name === "AbortError") return;   // they closed the share sheet
            say(apple
                ? "Sharing didn't work this time. Press and hold the picture, then tap Save to Photos."
                : "Sharing didn't work this time. Tap Save image to keep it instead.", "error");
        }
    });
    return dialog;
}
