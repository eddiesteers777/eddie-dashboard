/* ==========================================
   Southbound — daily Readiness, WHOOP-style (pure)

   A 0-100 score each morning, green / yellow / red, from:
     HRV              40%  last night's sleep HRV against COROS's own
                           normal range and baseline for you
     Resting HR       20%  against your average of the previous 30 days
     Sleep            25%  time asleep against your sleep need (7h 30m
                           unless changed) and COROS's sleep score
     How you feel     15%  the morning check-in, when there is one
                           (soreness, energy, mood)
   COROS's recovery % is shown next to the score, never in it (audit B7):
   COROS works it out from the same HRV, resting HR and training load, so
   scoring it counted those again, and it's COROS's opinion, not a
   measurement. Before this it was 15%.
   Missing parts are left out and the rest re-weighted; with neither HRV
   nor sleep there's no score. Feeling sick caps it at 30 (red); pain
   caps it at 55 (yellow). Every part is shown in plain words so the
   score is never a black box.

   The check-in also asks "Yesterday, did you…" (alcohol, late caffeine,
   stretching…). After enough mornings with and without each one, the
   insights say how it moves your readiness (the body part of the score,
   so how you felt doesn't count twice).

   Advice knows today's workout (rest / easy / long / quality / race).
   Unit-tested in tests/readiness.test.mjs.
========================================== */

export const SETTINGS_KEY = "readiness-settings";
export const CHECKIN_KEY = "readiness-checkins";
export const READINESS_KEY = "readiness-history";
export const DEFAULT_SLEEP_NEED = 450; // 7h 30m

export const WEIGHTS = { hrv: 0.40, rhr: 0.20, sleep: 0.25, feel: 0.15 };

// "Yesterday, did you…" (WHOOP calls this the Journal).
export const TAGS = [
    { id: "alcohol", label: "Alcohol" },
    { id: "late-caffeine", label: "Caffeine after 2 pm" },
    { id: "late-meal", label: "Ate late" },
    { id: "screens", label: "Screens in bed" },
    { id: "stress", label: "Stressful day" },
    { id: "travel", label: "Traveled" },
    { id: "nap", label: "Napped" },
    { id: "stretch", label: "Stretched / mobility" },
    { id: "foam", label: "Foam rolled" },
    { id: "hydrated", label: "Drank plenty of water" },
    { id: "sauna", label: "Sauna / hot bath" },
    { id: "magnesium", label: "Took magnesium" }
];

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = n => Math.round(n);
export const hm = min => { const m = Math.round(min); const h = Math.floor(m / 60); return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m % 60}m`; };
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

export function colorOf(score) {
    if (score == null) return "none";
    return score >= 67 ? "green" : score >= 34 ? "yellow" : "red";
}

// ---------- parts ----------

export function hrvPart(hrv) {
    if (!hrv?.avg) return null;
    const b = hrv.baseline || hrv.avg;
    const lo = hrv.low || b * 0.9, hi = hrv.high || b * 1.1;
    const a = hrv.avg;
    let score;
    if (a >= b) score = 75 + 25 * clamp((a - b) / Math.max(1, hi - b), 0, 1);
    else if (a >= lo) score = 75 - 35 * (b - a) / Math.max(1, b - lo);
    else score = 40 - 40 * clamp((lo - a) / Math.max(1, (b - lo) * 1.5), 0, 1);
    const where = a > hi ? `above your normal range (${lo}–${hi})`
        : a < lo ? `below your normal range (${lo}–${hi})`
        : Math.abs(a - b) <= 2 ? `right at your baseline (${b})`
        : a > b ? `above your baseline (${b})` : `a little under your baseline (${b})`;
    return { key: "hrv", label: "HRV", value: `${a} ms`, note: where, score: round(score) };
}

export function rhrPart(rhr, previous) {
    if (!rhr) return null;
    const prev = (previous || []).filter(Number.isFinite);
    if (prev.length < 3) return { key: "rhr", label: "Resting HR", value: `${rhr} bpm`, note: "building your average", score: null };
    const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
    const diff = rhr - avg;
    const score = diff <= 0 ? Math.min(100, 85 + -diff * 5) : Math.max(5, 85 - diff * 12);
    const d = Math.round(Math.abs(diff));
    const note = d === 0 ? `normal (your average ${Math.round(avg)})` : `${d} ${diff > 0 ? "above" : "below"} your 30-day average (${Math.round(avg)})`;
    return { key: "rhr", label: "Resting HR", value: `${rhr} bpm`, note, score: round(score) };
}

export function sleepPart(sleep, needMin = DEFAULT_SLEEP_NEED) {
    if (!sleep?.asleepMin) return null;
    const ratio = sleep.asleepMin / needMin;
    const dur = ratio >= 1 ? 100 : clamp(100 - (1 - ratio) * 200);
    const score = sleep.score ? 0.6 * dur + 0.4 * sleep.score : dur;
    const short = needMin - sleep.asleepMin;
    const note = [short > 5 ? `${hm(short)} short of ${hm(needMin)}` : "enough sleep", sleep.score ? `sleep score ${sleep.score}` : ""].filter(Boolean).join(" · ");
    return { key: "sleep", label: "Sleep", value: hm(sleep.asleepMin), note, score: round(score) };
}

/** COROS's recovery %, shown beside the score (never in it). */
export function corosRecovery(recovery) {
    return recovery?.percent == null ? null : { percent: recovery.percent, status: recovery.status || "" };
}

export function feelPart(checkin) {
    if (!checkin) return null;
    const bits = [];
    if (checkin.soreness) bits.push((5 - checkin.soreness) / 4 * 100);
    if (checkin.energy) bits.push((checkin.energy - 1) / 4 * 100);
    if (checkin.mood) bits.push((checkin.mood - 1) / 4 * 100);
    if (!bits.length) return null;
    const note = [checkin.soreness && `soreness ${checkin.soreness}/5`, checkin.energy && `energy ${checkin.energy}/5`, checkin.mood && `mood ${checkin.mood}/5`].filter(Boolean).join(" · ");
    return { key: "feel", label: "How you feel", value: "Check-in", note, score: round(bits.reduce((a, b) => a + b, 0) / bits.length) };
}

function weighted(parts) {
    const used = parts.filter(p => p && p.score != null);
    const total = used.reduce((t, p) => t + WEIGHTS[p.key], 0);
    return total ? used.reduce((t, p) => t + p.score * WEIGHTS[p.key], 0) / total : null;
}

/**
 * date + saved data -> { date, score, bodyScore, color, parts, coros, flags, needsCheckin }
 *   health:   { date: { hrv, rhr, sleep, stress } } (js/corosHealth.js)
 *   fitness:  { date: { recovery: { percent, status } } } (js/corosHistory.js)
 *   checkins: { date: { soreness, energy, mood, sick, pain, tags, note } }
 */
export function computeReadiness(date, { health = {}, fitness = {}, checkins = {}, settings = {} } = {}) {
    const day = health[date] || {};
    const previous = Array.from({ length: 30 }, (_, i) => health[addDays(date, -(i + 1))]?.rhr);
    const checkin = checkins[date] || null;
    const body = [hrvPart(day.hrv), rhrPart(day.rhr, previous), sleepPart(day.sleep, settings.sleepNeedMin || DEFAULT_SLEEP_NEED)].filter(Boolean);
    const feel = feelPart(checkin);
    const parts = feel ? [...body, feel] : body;
    const hasCore = body.some(p => (p.key === "hrv" || p.key === "sleep") && p.score != null);
    let score = hasCore ? weighted(parts) : null;
    const bodyScore = hasCore ? weighted(body) : null;
    const flags = [];
    if (checkin?.sick) { flags.push({ key: "sick", text: "You're feeling sick" }); if (score != null) score = Math.min(score, 30); }
    if (checkin?.pain) { flags.push({ key: "pain", text: `Pain: ${checkin.pain}` }); if (score != null) score = Math.min(score, 55); }
    if (day.hrv?.status && /low/i.test(day.hrv.status)) flags.push({ key: "hrv-low", text: "COROS rates last night's HRV low" });
    return {
        date,
        score: score == null ? null : round(score),
        bodyScore: bodyScore == null ? null : round(bodyScore),
        color: colorOf(score == null ? null : round(score)),
        parts,
        coros: corosRecovery(fitness[date]?.recovery),
        flags,
        needsCheckin: !checkin
    };
}

// ---------- why there's no score today ----------

const shortDay = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/**
 * No score today: say exactly why, and what to do.
 * { connected (COROS on this device), refreshing, error (last fetch's message or null),
 *   health (by wake-up day), history (readiness by day), today }
 * -> { text, latest: { date, score, color } | null, canRefresh }
 */
export function missingReason({ connected, refreshing = false, error = null, health = {}, history = {}, today }) {
    const latestDate = Object.keys(history).filter(d => d < today && history[d]?.score != null).sort().at(-1);
    const latest = latestDate ? { date: latestDate, ...history[latestDate] } : null;
    const lastNight = Object.keys(health).filter(d => health[d]?.hrv || health[d]?.sleep).sort().at(-1);
    if (refreshing) return { text: "Getting last night's sleep and HRV from COROS…", latest, canRefresh: false };
    if (!connected) {
        return {
            text: lastNight
                ? `COROS isn't connected on this device, so last night's sleep can't come in here. Connect it in Settings (or open Southbound where it is connected).`
                : "Connect COROS in Settings: your score comes from last night's HRV, resting heart rate and sleep.",
            latest, canRefresh: false
        };
    }
    if (error) return { text: `COROS didn't answer just now (${error}). Tap Refresh to try again.`, latest, canRefresh: true };
    if (!lastNight) return { text: "COROS hasn't sent any sleep or HRV yet. Wear your watch overnight, open the COROS app so it syncs, then tap Refresh.", latest, canRefresh: true };
    return {
        text: `COROS doesn't have last night's sleep yet (the newest is ${shortDay(lastNight)}). Open the COROS app so your watch syncs, then tap Refresh.`,
        latest, canRefresh: true
    };
}

// ---------- advice for today's workout ----------

/**
 * readiness + today's workout { kind: rest|easy|long|quality|race|none, title }
 * + the two days before (colors) -> { text, swap } (swap: offer to move a hard day).
 */
export function adviceFor(r, workout = { kind: "none" }, before = []) {
    const kind = workout.kind || "none";
    const title = workout.title || "today's workout";
    if (r?.flags?.some(f => f.key === "sick")) return { text: "Feeling sick: rest today. If it's mild and above the neck only, 20–30 minutes very easy at most.", swap: kind === "quality" || kind === "long" };
    const pain = r?.flags?.find(f => f.key === "pain");
    if (pain && (kind === "quality" || kind === "long" || kind === "race")) return { text: `You logged ${pain.text.toLowerCase()}. Swap ${title} for an easy run or cross-training, and tell your coach if it's still there tomorrow.`, swap: kind !== "race" };
    if (!r || r.score == null) return { text: "Sync your COROS watch to see today's readiness.", swap: false };
    const c = r.color;
    const yellowRun = c === "yellow" && before.length >= 2 && before.slice(0, 2).every(x => x === "yellow" || x === "red");
    if (kind === "race") return { text: c === "red" ? "Race day with low readiness: start conservatively and build into it." : "Race day: trust your training.", swap: false };
    if (kind === "rest") return { text: c === "green" ? "Rest day, and you're recovering well." : "Rest day: good timing. Sleep and eat well.", swap: false };
    if (kind === "quality" || kind === "long") {
        if (c === "green") return { text: `Go as planned: you're ready for ${title}.`, swap: false };
        if (c === "red" || yellowRun) return { text: `${c === "red" ? "Low readiness" : "Third day in the yellow"}: run easy today and move ${title} to your next easy day.`, swap: true };
        return kind === "long"
            ? { text: `Run ${title}, but keep the easy miles truly easy and skip any fast finish if you feel flat.`, swap: false }
            : { text: `Do ${title}, but run the reps at the slow end of the pace range, and drop the last rep if your heart rate drifts high.`, swap: false };
    }
    if (kind === "easy") return { text: c === "green" ? "Easy day: keep it easy, you're recovering well." : c === "yellow" ? "Easy day, and keep it genuinely easy." : "Low readiness: keep today's run short and very easy, or rest.", swap: false };
    return { text: c === "green" ? "You're ready to train." : c === "yellow" ? "Moderate readiness: train, but don't force it." : "Low readiness: an easy day or rest.", swap: false };
}

// ---------- sleep coach ----------

const toMin = t => { const m = String(t || "").match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const clock12 = min => { const m = ((Math.round(min) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };

/** Your usual wake-up time (median of the last 7 nights) -> bedtime for your sleep need, + this week's sleep debt. */
export function sleepCoach(health, today, needMin = DEFAULT_SLEEP_NEED) {
    const nights = Array.from({ length: 7 }, (_, i) => health[addDays(today, -i)]?.sleep).filter(Boolean);
    const wakes = nights.map(n => toMin(n.wake)).filter(v => v != null).sort((a, b) => a - b);
    const debt = nights.reduce((t, n) => t + Math.max(0, needMin - (n.asleepMin || needMin)), 0);
    if (!wakes.length) return null;
    const wake = wakes[Math.floor(wakes.length / 2)];
    return {
        wake: clock12(wake),
        bedtime: clock12(wake - needMin - 10),   // ~10 minutes to fall asleep
        needMin,
        debtMin: debt,
        text: `To get ${hm(needMin)} before your usual ${clock12(wake)} wake-up, be in bed by ${clock12(wake - needMin - 10)}.`
    };
}

// ---------- what's helping, what's hurting ----------

/**
 * Mornings after each "Yesterday, did you…" answer vs. mornings without it
 * (only mornings with a check-in count; the body part of the score, the last
 * 90 days). Needs 4 of each to say anything.
 */
export function insights(checkins, readinessByDay, today, { minEach = 4, days = 90 } = {}) {
    const from = addDays(today, -days);
    const mornings = Object.entries(checkins || {})
        .filter(([d]) => d >= from && d <= today && readinessByDay[d]?.bodyScore != null)
        .map(([d, c]) => ({ tags: new Set(c.tags || []), score: readinessByDay[d].bodyScore }));
    const out = [];
    for (const tag of TAGS) {
        const withIt = mornings.filter(m => m.tags.has(tag.id)).map(m => m.score);
        const without = mornings.filter(m => !m.tags.has(tag.id)).map(m => m.score);
        if (withIt.length < minEach || without.length < minEach) continue;
        const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
        const diff = Math.round(avg(withIt) - avg(without));
        out.push({ tag: tag.id, label: tag.label, diff, times: withIt.length, effect: diff >= 3 ? "helps" : diff <= -3 ? "hurts" : "none" });
    }
    return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/** How many check-ins until insights can start (4 with + 4 without for at least one answer). */
export function checkinsUntilInsights(checkins, minEach = 4) {
    const n = Object.keys(checkins || {}).length;
    return Math.max(0, minEach * 2 - n);
}

// ---------- today's workout kind (the coach's own marathon plan day) ----------

export function kindOfDay(day, planDay) {
    if (!day || !Number(day.miles)) return "rest";
    const label = String(day.pace || "").toLowerCase();
    if (day.race || label === "race") return "race";
    const hard = (planDay?.workout?.sets || []).some(s => s.parts || (s.effort !== "easy" && s.effort !== "recovery"));
    if (hard) return Number(day.miles) >= 12 ? "long" : "quality";
    if (/long/.test(label) || Number(day.miles) >= 12) return "long";
    return "easy";
}
