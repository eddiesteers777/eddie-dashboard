/* ==========================================
   Southbound — the Readiness card's reasons and 4-week trends (pure)

   Option C of the 2026-11-12 redesign (mock-ups: /mnt/project-files/readiness-card/).
   A word (Ready / Steady / Easy day), one line of advice, then a ledger of WHY:
   with a watch, last night's sleep, HRV and resting HR plus what you said; with no
   watch, what you have logged (miles against your usual, hard days) plus what you
   said, and a dashed "Sleep, HRV: Not connected" row that offers to connect.
   Tap a row and it opens 4 weeks of that measure (trendPanel).

   The no-watch read is an ESTIMATE from what the person logged. It never shows a
   0-100 number and never says anything about sleep, HRV or resting heart rate.
   It needs a few check-ins or logged runs first (logRead -> ready: false).
   Everything is compared with the person's own last weeks, never a population norm.
   No DOM, no storage: unit tested in tests/readinessRead.test.mjs. Drawn by
   js/readinessLedger.js.
========================================== */

import { hm, colorOf, DEFAULT_SLEEP_NEED } from "./readiness.js";

export const WORDS = Object.freeze({ green: "Ready", yellow: "Steady", red: "Easy day" });
export const wordOf = color => WORDS[color] || "";
export const TREND_DAYS = 28;
export const MIN_TREND_DAYS = 14;     // a line needs two weeks of nights before it says anything
export const MIN_CHECKINS = 3;        // no watch: check-ins in the last 14 days ...
export const MIN_SESSIONS = 4;        // ... or logged sessions, before the read starts
export const DOTS = 5;

export const ENERGY_WORDS = ["Drained", "Low", "Okay", "Good", "Great"];
export const SORE_WORDS = ["None", "A little", "Some", "Sore", "Very sore"];
const WEEK_LABELS = ["3 wks ago", "2 wks ago", "Last week", "This week"];
const MILE = 1609.344;

const addDays = (date, n) => {
    const [y, m, d] = date.split("-").map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const mean = list => list.reduce((s, v) => s + v, 0) / list.length;
const sd = list => (list.length < 2 ? 0 : Math.sqrt(mean(list.map(v => (v - mean(list)) ** 2))));
const known = list => list.filter(v => v != null);
const round1 = v => Math.round(v * 10) / 10;

/** The last `days` days ending on `date`, oldest first, null where nothing was recorded. */
export function dailySeries(date, days, pick) {
    return Array.from({ length: days }, (_, i) => {
        const d = addDays(date, i - (days - 1));
        const v = pick(d);
        return { date: d, v: v == null ? null : v };
    });
}

/** 28 days -> four weekly averages (null when a week has under 2 days). */
export function weekAverages(values) {
    return WEEK_LABELS.map((label, k) => {
        const slice = known(values.slice(k * 7, k * 7 + 7));
        return { label, v: slice.length >= 2 ? mean(slice) : null, days: slice.length };
    });
}

// ---------- sessions (js/athleteLedger.js shape: { date, distance (m), rpe }) ----------

export function milesByDate(sessions = []) {
    const out = {};
    for (const s of sessions) {
        const miles = (Number(s?.distance) || 0) / MILE;
        if (s?.date && miles > 0) out[s.date] = (out[s.date] || 0) + miles;
    }
    return out;
}

const weekMiles = (byDate, date, back) => {
    let t = 0;
    for (let i = 0; i < 7; i++) t += byDate[addDays(date, -(back * 7 + i))] || 0;
    return t;
};

const isHard = s => (Number(s?.rpe) >= 6) || ((Number(s?.distance) || 0) / MILE >= 10);

// ---------- trend panels ----------

const fmt = {
    stress: v => `${Math.round(v)}`,
    sleep: v => hm(v),
    hrv: v => `${Math.round(v)} ms`,
    rhr: v => `${Math.round(v)} bpm`,
    miles: v => `${Math.round(v)} mi`,
    said: v => `${round1(v)}`
};

/**
 * One row's 4 weeks.
 * key: sleep | hrv | rhr | miles | said
 * ctx: { health, checkins, sessions, date, needMin }
 * -> { key, title, sub, kind: "bars" | "line", values (28, null = none), band, need, weeks: [{ label, text }],
 *      says, have, building: bool, buildingText }
 */
export function trendPanel(key, ctx) {
    const { health = {}, checkins = {}, sessions = [], date, needMin = DEFAULT_SLEEP_NEED } = ctx;
    const out = { key, weeks: [], says: "", band: null, need: null };

    if (key === "miles") {
        const by = milesByDate(sessions);
        const weeks = [3, 2, 1, 0].map(b => weekMiles(by, date, b));
        const days = Object.keys(by).filter(d => d > addDays(date, -TREND_DAYS) && d <= date).length;
        Object.assign(out, { title: "Training · 4 weeks", sub: "miles per week", kind: "weekbars", weekValues: weeks, have: days, minHave: 4 });
        out.weeks = weeks.map((v, i) => ({ label: WEEK_LABELS[i], text: `${Math.round(v)} mi` }));
        out.big = { text: `${Math.round(weeks[3])}`, unit: "mi this week" };
        out.building = days < out.minHave;
        out.buildingText = `Building: ${days} of ${out.minHave} runs logged`;
        if (!out.building) {
            const prior = mean(weeks.slice(0, 3)), now = weeks[3], diff = Math.round(now - prior);
            out.says = Math.abs(diff) < 1
                ? `About the same as your average of the 3 weeks before (${Math.round(prior)} mi).`
                : `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} mi on your average of the 3 weeks before (${Math.round(prior)} mi).`;
            if (now >= Math.max(...weeks) && now > 0 && diff > 0) out.says += " The most in 4 weeks.";
        }
        return out;
    }

    if (key === "said") {
        const series = dailySeries(date, TREND_DAYS, d => num(checkins[d]?.soreness));
        const values = series.map(p => p.v);
        const have = known(values).length;
        const wk = weekAverages(values);
        Object.assign(out, { title: "What you said · 4 weeks", sub: "soreness, 1 to 5", kind: "line", values, have, minHave: 6, scale: [1, 5] });
        out.weeks = wk.map(w => ({ label: w.label, text: w.v == null ? "–" : String(round1(w.v)) }));
        out.big = { text: wk[3].v == null ? "–" : String(round1(wk[3].v)), unit: "soreness this week" };
        out.building = have < out.minHave;
        out.buildingText = `Building: ${have} of ${out.minHave} check-ins`;
        if (!out.building) {
            const now = wk[3].v, before = known(wk.slice(0, 3).map(w => w.v));
            out.says = now == null ? `You checked in on ${have} of ${TREND_DAYS} days.`
                : before.length ? `Soreness averaged ${round1(now)} this week, ${round1(mean(before))} before. Checked in ${have} of ${TREND_DAYS} days.`
                : `Soreness averaged ${round1(now)} this week. Checked in ${have} of ${TREND_DAYS} days.`;
        }
        return out;
    }

    const pickers = {
        sleep: d => num(health[d]?.sleep?.asleepMin),
        hrv: d => num(health[d]?.hrv?.avg),
        rhr: d => num(health[d]?.rhr),
        stress: d => num(health[d]?.stress?.avg)
    };
    const series = dailySeries(date, TREND_DAYS, pickers[key]);
    const values = series.map(p => p.v);
    const real = known(values);
    const wk = weekAverages(values);
    const f = fmt[key];
    const titles = { sleep: ["Sleep · 4 weeks", `need ${hm(needMin)}`], hrv: ["HRV · 4 weeks", "your normal"], rhr: ["Resting HR · 4 weeks", "your usual"], stress: ["Stress · 4 weeks", "COROS"] }[key];
    Object.assign(out, { title: titles[0], sub: titles[1], kind: key === "sleep" ? "bars" : "line", values, have: real.length, minHave: MIN_TREND_DAYS });
    out.weeks = wk.map(w => ({ label: w.label, text: w.v == null ? "–" : f(w.v) }));
    out.building = real.length < MIN_TREND_DAYS;
    out.buildingText = `Building: ${real.length} of ${TREND_DAYS} ${key === "stress" ? "days" : "nights"}`;
    if (out.building) return out;

    const m = mean(real);
    out.big = key === "sleep" ? { text: hm(m), unit: "avg" } : key === "hrv" ? { text: `${Math.round(m)}`, unit: "ms avg" } : key === "rhr" ? { text: `${Math.round(m)}`, unit: "bpm avg" } : { text: `${Math.round(m)}`, unit: "avg" };
    if (key === "sleep") {
        out.need = needMin;
        const under = real.filter(v => v < needMin - 10).length;
        out.says = `Under your ${hm(needMin)} on ${under} of ${real.length} nights. Average ${hm(m)}.`;
    } else if (key === "hrv") {
        const s = Math.max(sd(real), m * 0.05);
        out.band = [m - s, m + s];
        const now = wk[3].v;
        out.says = now == null ? "No HRV this week yet."
            : now < out.band[0] ? `This week's average (${Math.round(now)} ms) is below your normal range.`
            : now > out.band[1] ? `This week's average (${Math.round(now)} ms) is above your normal range.`
            : "This week's average is inside your normal range.";
    } else if (key === "stress") {
        const now = wk[3].v, before = known(wk.slice(0, 3).map(w => w.v));
        out.says = now == null || !before.length ? "COROS's daily stress. Shown, not scored."
            : `This week averages ${Math.round(now)}, ${Math.round(Math.abs(now - mean(before))) < 1 ? "the same as" : now > mean(before) ? "above" : "below"} the 3 weeks before${Math.round(Math.abs(now - mean(before))) < 1 ? "" : ` (${Math.round(mean(before))})`}. COROS's number, not in your score.`;
    } else {
        const s = Math.max(sd(real), 1.5);
        out.band = [m - s, m + s];
        const now = wk[3].v, before = known(wk.slice(0, 3).map(w => w.v));
        if (now == null || !before.length) out.says = "Not enough this week yet.";
        else {
            const diff = Math.round(now - mean(before));
            out.says = diff === 0 ? "Same as your 3 weeks before."
                : `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} bpm on your 3 weeks before.`;
        }
    }
    return out;
}

// ---------- the lens: which panels, and today's row ----------

/** The inner card's tabs, in order: [{ key, label }]. Stress only once COROS has sent any. */
export function panelTabs({ watch, health = {} } = {}) {
    if (!watch) return [{ key: "miles", label: "Training" }, { key: "said", label: "Soreness" }];
    const tabs = [{ key: "sleep", label: "Sleep" }, { key: "hrv", label: "HRV" }, { key: "rhr", label: "Resting HR" }];
    if (Object.values(health).some(d => d?.stress?.avg > 0)) tabs.push({ key: "stress", label: "Stress" });
    return tabs;
}

const energyOf = c => (c?.energy ? ENERGY_WORDS[c.energy - 1] : null);
const soreOf = c => (c?.soreness ? SORE_WORDS[c.soreness - 1] : null);

/**
 * Today's values in one straight row: [{ key, label, value (null = a dash), tab (the panel it opens, or null) }].
 * With a watch: what the watch reported this morning. Without: what was logged and said.
 */
export function todayStrip({ watch, health = {}, date, checkins = {}, read = null } = {}) {
    if (watch) {
        const d = health[date] || {};
        const cells = [
            { key: "sleep", label: "Sleep", value: num(d.sleep?.asleepMin) ? hm(d.sleep.asleepMin) : null, tab: "sleep" },
            { key: "hrv", label: "HRV", value: num(d.hrv?.avg) ? `${Math.round(d.hrv.avg)}` : null, tab: "hrv" },
            { key: "rhr", label: "Rest HR", value: num(d.rhr) ? `${Math.round(d.rhr)}` : null, tab: "rhr" }
        ];
        if (Object.values(health).some(x => x?.stress?.avg > 0)) cells.push({ key: "stress", label: "Stress", value: num(d.stress?.avg) ? `${Math.round(d.stress.avg)}` : null, tab: "stress" });
        return cells;
    }
    const c = checkins[date];
    return [
        { key: "miles", label: "7 days", value: read && read.miles.last7 > 0 ? `${Math.round(read.miles.last7)} mi` : null, tab: "miles" },
        { key: "hard", label: "Hard", value: read?.hard ? String(read.hard.count) : null, tab: null },
        { key: "said", label: "Sore", value: soreOf(c), tab: "said" },
        { key: "energy", label: "Energy", value: energyOf(c), tab: null }
    ];
}

// ---------- no watch: the read from what was logged ----------

/**
 * { date, sessions (athlete ledger), checkins, workout ({ kind, title }) } ->
 * { ready, color, word, flags, miles, hard, progress: { have, need }, haveCheckins, haveSessions }
 * Not ready (too little logged) -> word "" and the progress dots; the card asks for a check-in.
 */
export function logRead({ date, sessions = [], checkins = {} } = {}) {
    const last14 = d => d > addDays(date, -14) && d <= date;
    const checkinDays = Object.keys(checkins).filter(d => last14(d) && (checkins[d]?.energy || checkins[d]?.soreness || checkins[d]?.mood)).length;
    const sessionCount = sessions.filter(s => s?.date && last14(s.date) && (Number(s.distance) || 0) > 0).length;
    const progress = { have: Math.min(DOTS, checkinDays), need: DOTS };
    const ready = checkinDays >= MIN_CHECKINS || sessionCount >= MIN_SESSIONS;

    const by = milesByDate(sessions);
    const last7 = weekMiles(by, date, 0);
    const before = [1, 2, 3].map(b => weekMiles(by, date, b));
    const usual = before.filter(v => v > 0).length >= 2 ? mean(before) : null;

    const hardDates = [...new Set(sessions.filter(s => s?.date && s.date <= date && s.date > addDays(date, -7) && isHard(s)).map(s => s.date))].sort();
    const anyAnswered = sessions.some(s => s?.date && s.date > addDays(date, -7) && s.date <= date && (s.rpe != null || isHard(s)));
    const lastHardAgo = hardDates.length ? Math.round((new Date(`${date}T12:00:00`) - new Date(`${hardDates.at(-1)}T12:00:00`)) / 864e5) : null;
    const hard = anyAnswered ? { count: hardDates.length, lastAgo: lastHardAgo } : null;

    // The feel: today's check-in, else yesterday's or the day before's.
    const feelDay = [0, 1, 2].map(i => addDays(date, -i)).find(d => checkins[d] && (checkins[d].energy || checkins[d].soreness || checkins[d].sick || checkins[d].pain));
    const c = feelDay ? checkins[feelDay] : null;

    const flags = [];
    if (checkins[date]?.sick) flags.push({ key: "sick", text: "You're feeling sick" });
    if (checkins[date]?.pain) flags.push({ key: "pain", text: `Pain: ${checkins[date].pain}` });

    let score = 80;
    if (usual) { const r = last7 / usual; score -= r > 1.3 ? 20 : r > 1.15 ? 10 : 0; }
    const recentHard = hardDates.filter(d => d >= addDays(date, -2)).length;
    score -= recentHard >= 2 ? 15 : hardDates.includes(addDays(date, -1)) ? 8 : 0;
    if (c?.soreness) score -= c.soreness >= 4 ? 25 : c.soreness === 3 ? 10 : 0;
    if (c?.energy) score -= c.energy <= 2 ? 20 : c.energy === 3 ? 5 : 0;
    if (flags.some(f => f.key === "sick")) score = Math.min(score, 30);
    if (flags.some(f => f.key === "pain")) score = Math.min(score, 55);
    score = Math.max(0, score);

    return {
        ready,
        color: ready ? colorOf(score) : "none",
        word: ready ? wordOf(colorOf(score)) : "",
        flags, miles: { last7, usual }, hard, progress,
        haveCheckins: checkinDays, haveSessions: sessionCount
    };
}
