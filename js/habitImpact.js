/* ==========================================
   Southbound — what your habits do to your nights (pure)

   The morning check-in asks what you did yesterday / last night (nose
   strip, mouth tape, alcohol, late caffeine…) and how much water you
   drank. This puts each answer next to the numbers from that night:
   sleep, sleep score, HRV, resting heart rate, readiness (the body part,
   so how you said you felt doesn't count twice) and COROS recovery.

   How it's worked out (so a good month doesn't look like a good habit):
     · each number is compared with your own baseline: the median of the
       28 nights before it (7+ needed). Training blocks, heat and season
       move the baseline, not the habit;
     · a habit is compared on the mornings you checked in: nights with it
       vs. nights without, within the last 90 days. Like WHOOP's Journal,
       nothing shows until there are 5 of each;
     · the difference comes with a 90% range (Welch); "linked to" only
       when the whole range is on one side of zero, else "no clear link
       yet". It's your own pattern, not proof: habits travel together, so
       habits that mostly share nights with another are said to;
     · water and protein: nights after your higher days (at or above your
       own median) vs. the rest, needing 10+ days logged.

   nightsFrom(...)            one row per check-in morning
   habitEffects(nights, ...)  every habit × every number
   monthRecap(...)            a month against the month before
   Unit-tested in tests/habitImpact.test.mjs.
========================================== */

import { TAGS } from "./readiness.js";

export const IMPACT_VERSION = "0.1.0";
export const MIN_EACH = 5;          // WHOOP's Journal: 5 yes + 5 no in 90 days
export const MIN_WATER_DAYS = 10;   // any amount (water, protein): days logged before it's compared
// Amounts the check-in asks about (yesterday's), each also kept in that day's Nutrition log.
export const AMOUNTS = [
    { id: "water", field: "waterOz", nutrition: "water", unit: "oz", noun: "of water" },
    { id: "protein", field: "proteinG", nutrition: "protein", unit: "g", noun: "of protein" }
];
export const WINDOW_DAYS = 90;
export const BASELINE_DAYS = 28;
export const BASELINE_MIN = 7;

export const OUTCOMES = [
    { key: "sleep", label: "Sleep", unit: "min", better: 1, get: d => d.health?.sleep?.asleepMin },
    { key: "sleepScore", label: "Sleep score", unit: "pts", better: 1, get: d => d.health?.sleep?.score },
    { key: "hrv", label: "HRV", unit: "ms", better: 1, get: d => d.health?.hrv?.avg },
    { key: "rhr", label: "Resting HR", unit: "bpm", better: -1, get: d => d.health?.rhr },
    { key: "readiness", label: "Readiness", unit: "pts", better: 1, get: d => d.readiness?.bodyScore ?? d.readiness?.score },
    { key: "recovery", label: "COROS recovery", unit: "%", better: 1, get: d => d.fitness?.recovery?.percent }
];

const num = v => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
export const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const variance = a => { const m = mean(a); return a.length > 1 ? a.reduce((t, x) => t + (x - m) ** 2, 0) / (a.length - 1) : 0; };
// Two-sided 90% t critical value, close to the table for every df ≥ 2.
export const tCrit90 = df => 1.645 + 1.86 / Math.pow(Math.max(df, 1), 1.05);

/** An amount on `day` (water oz, protein g): the check-in's answer the next morning, else the Nutrition log. */
export function amountOn(id, day, checkins = {}, nutrition = {}) {
    const a = AMOUNTS.find(x => x.id === id);
    const fromCheckin = num(checkins[addDays(day, 1)]?.[a.field]);
    if (fromCheckin != null) return fromCheckin;
    const logged = num(nutrition[day]?.[a.nutrition]);
    return logged ? logged : null;
}
export const waterOn = (day, checkins, nutrition) => amountOn("water", day, checkins, nutrition);

/**
 * One row per date in [from, to]: { date, checkedIn, tags:Set, water, values:{key:value}, dev:{key:deviation} }
 * health / fitness by wake-up day; readiness = readiness-history; nutrition = { date: { water } }.
 */
export function nightsFrom({ from, to, checkins = {}, health = {}, fitness = {}, readiness = {}, nutrition = {} }) {
    const raw = {};
    const valueOf = (o, date) => num(o.get({ health: health[date], fitness: fitness[date], readiness: readiness[date] }));
    const rows = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
        const c = checkins[d];
        const values = {}, dev = {};
        for (const o of OUTCOMES) {
            const v = valueOf(o, d);
            values[o.key] = v;
            if (v == null) continue;
            const prior = [];
            for (let i = 1; i <= BASELINE_DAYS; i++) {
                const k = addDays(d, -i);
                const key = `${o.key}|${k}`;
                if (!(key in raw)) raw[key] = valueOf(o, k);
                if (raw[key] != null) prior.push(raw[key]);
            }
            dev[o.key] = prior.length >= BASELINE_MIN ? v - median(prior) : null;
        }
        const amounts = Object.fromEntries(AMOUNTS.map(a => [a.id, amountOn(a.id, addDays(d, -1), checkins, nutrition)]));
        rows.push({ date: d, checkedIn: !!c, tags: new Set(c?.tags || []), ...amounts, values, dev });
    }
    return rows;
}

function compare(withRows, withoutRows, o) {
    const a = withRows.map(r => r.dev[o.key]).filter(v => v != null);
    const b = withoutRows.map(r => r.dev[o.key]).filter(v => v != null);
    if (!a.length && !b.length) return { key: o.key, label: o.label, unit: o.unit, nWith: 0, nWithout: 0, verdict: "nodata" };
    const need = Math.max(0, MIN_EACH - a.length) + Math.max(0, MIN_EACH - b.length);
    if (a.length < MIN_EACH || b.length < MIN_EACH) return { key: o.key, label: o.label, unit: o.unit, nWith: a.length, nWithout: b.length, need, verdict: "few" };
    const diff = mean(a) - mean(b);
    const va = variance(a) / a.length, vb = variance(b) / b.length;
    const se = Math.sqrt(va + vb);
    const df = se ? (va + vb) ** 2 / ((va ** 2) / Math.max(1, a.length - 1) + (vb ** 2) / Math.max(1, b.length - 1)) : a.length + b.length - 2;
    const half = tCrit90(df) * se;
    const lo = diff - half, hi = diff + half;
    const clear = lo > 0 || hi < 0;
    const good = diff * o.better > 0;
    return { key: o.key, label: o.label, unit: o.unit, nWith: a.length, nWithout: b.length, diff, lo, hi, verdict: clear ? (good ? "better" : "worse") : "unclear" };
}

/** The factors: every check-in answer plus the higher-amount days (water, protein). */
export function factorsFor(rows) {
    const out = TAGS.map(t => ({ id: t.id, label: t.label, has: r => r.tags.has(t.id), pool: r => r.checkedIn }));
    for (const a of AMOUNTS) {
        const vals = rows.map(r => r[a.id]).filter(v => v != null);
        if (!vals.length) continue;
        const cut = median(vals);
        // When half the days sit exactly on the median, ">= median" would be every day: split above it instead.
        const strict = !vals.some(v => v < cut);
        out.push({ id: a.id, amount: true, label: strict ? `More than ${Math.round(cut)} ${a.unit} ${a.noun}` : `${Math.round(cut)}+ ${a.unit} ${a.noun}`, cut, has: r => (strict ? r[a.id] > cut : r[a.id] >= cut), pool: r => r[a.id] != null, days: vals.length });
    }
    return out;
}

/**
 * Every habit against every number over the window ending `to`.
 * -> [{ id, label, nights, total, results:[compare...], linked:[results with a clear link], overlap }]
 *    sorted: clear links first (most of them), then the ones with data, then the rest.
 */
export function habitEffects(rows, { to } = {}) {
    const last = to || rows.at(-1)?.date;
    const window = rows.filter(r => r.date > addDays(last, -WINDOW_DAYS) && r.date <= last);
    const factors = factorsFor(window);
    const effects = factors.map(f => {
        const pool = window.filter(f.pool);
        const yes = pool.filter(f.has), no = pool.filter(r => !f.has(r));
        if (f.amount && pool.length < MIN_WATER_DAYS) {
            return { id: f.id, label: f.label, nights: yes.length, total: pool.length, results: [], linked: [], need: MIN_WATER_DAYS - pool.length, amount: true };
        }
        const results = OUTCOMES.map(o => compare(yes, no, o));
        return { id: f.id, label: f.label, nights: yes.length, total: pool.length, results, linked: results.filter(r => r.verdict === "better" || r.verdict === "worse"), amount: !!f.amount, cut: f.cut, yesDates: new Set(yes.map(r => r.date)) };
    });
    // Habits that mostly share their nights with another (alcohol + ate late…).
    for (const e of effects) {
        if (!e.yesDates?.size) continue;
        let best = null;
        for (const other of effects) {
            if (other === e || other.amount || e.amount || !other.yesDates?.size) continue;
            const shared = [...e.yesDates].filter(d => other.yesDates.has(d)).length;
            const share = shared / e.yesDates.size;
            if (share >= 0.6 && (!best || share > best.share)) best = { id: other.id, label: other.label, share };
        }
        e.overlap = best;
    }
    const rank = e => (e.linked.length ? 2 + e.linked.length : e.results.some(r => r.verdict !== "few") ? 1 : 0);
    return effects.map(({ yesDates, ...e }) => e).sort((a, b) => rank(b) - rank(a) || b.nights - a.nights);
}

/** How many more nights (with + without) before a habit shows: the smallest gap over the numbers. */
export function nightsToGo(effect) {
    if (effect.need != null) return effect.need;
    const known = effect.results.filter(r => r.verdict !== "nodata");
    const gaps = known.filter(r => r.verdict === "few").map(r => r.need);
    return known.length && gaps.length === known.length ? Math.min(...gaps) : 0;
}

const monthDays = month => { const [y, m] = month.split("-").map(Number); return new Date(y, m, 0).getDate(); };
export const prevMonth = month => { const [y, m] = month.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
export const nextMonth = month => { const [y, m] = month.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };

/**
 * A month (YYYY-MM, through `today` when it's the current one) against the month before.
 * -> { month, from, to, days, checkins, averages:[{ key, label, unit, better, avg, prev, change, n }],
 *      habits:[{ id, label, nights }], water:{ avg, days, prev }, rows (the month's nights), best, worst }
 */
export function monthRecap({ month, today, checkins = {}, health = {}, fitness = {}, readiness = {}, nutrition = {} }) {
    const from = `${month}-01`;
    const end = `${month}-${String(monthDays(month)).padStart(2, "0")}`;
    const to = today && today < end ? today : end;
    const pFrom = `${prevMonth(month)}-01`;
    const pTo = `${prevMonth(month)}-${String(monthDays(prevMonth(month))).padStart(2, "0")}`;
    const all = nightsFrom({ from: pFrom, to, checkins, health, fitness, readiness, nutrition });
    const rows = all.filter(r => r.date >= from);
    const prev = all.filter(r => r.date <= pTo);
    const avgOf = (list, key) => { const v = list.map(r => r.values[key]).filter(x => x != null); return { avg: mean(v), n: v.length }; };
    const averages = OUTCOMES.map(o => {
        const cur = avgOf(rows, o.key), before = avgOf(prev, o.key);
        return { key: o.key, label: o.label, unit: o.unit, better: o.better, avg: cur.avg, n: cur.n, prev: before.avg, change: cur.avg != null && before.avg != null ? cur.avg - before.avg : null };
    });
    const habits = TAGS.map(t => ({ id: t.id, label: t.label, nights: rows.filter(r => r.tags.has(t.id)).length, prev: prev.filter(r => r.tags.has(t.id)).length }))
        .filter(h => h.nights || h.prev).sort((a, b) => b.nights - a.nights);
    // Amounts for each day of the month itself (its check-in is the next morning).
    const avgAmount = (id, list) => { const v = list.map(r => amountOn(id, r.date, checkins, nutrition)).filter(x => x != null); return { avg: mean(v), days: v.length }; };
    const amounts = Object.fromEntries(AMOUNTS.map(a => { const cur = avgAmount(a.id, rows), before = avgAmount(a.id, prev); return [a.id, { avg: cur.avg, days: cur.days, prev: before.avg, unit: a.unit }]; }));
    const scored = rows.filter(r => r.values.readiness != null);
    const byScore = [...scored].sort((a, b) => b.values.readiness - a.values.readiness);
    return {
        month, from, to, days: rows.length,
        checkins: rows.filter(r => r.checkedIn).length,
        averages, habits,
        amounts,
        water: amounts.water,
        rows,
        best: byScore[0] || null,
        worst: byScore.length > 1 ? byScore.at(-1) : null
    };
}

/** "+12 min" / "−3 bpm" / "+1.5 ms": a change in its own unit. */
export function changeText(v, unit) {
    if (v == null) return "–";
    const a = Math.abs(v);
    const tiny = unit === "min" ? a < 0.5 : a < 0.05;
    const sign = tiny ? "±" : v > 0 ? "+" : "−";
    if (unit === "min") return `${sign}${a >= 60 ? `${Math.floor(a / 60)}h ${Math.round(a % 60)}m` : `${Math.round(a)} min`}`;
    const r = a >= 10 ? Math.round(a) : Math.round(a * 10) / 10;
    return `${sign}${r}${unit === "%" ? "%" : ` ${unit}`}`;
}
