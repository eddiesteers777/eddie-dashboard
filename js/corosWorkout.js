/* ==========================================
   Southbound — a plan day as a COROS workout (pure)

   COROS's createScheduledWorkout puts one structured run on a date in
   the athlete's COROS schedule, and COROS syncs it to the watch. This
   turns a Southbound plan day into the "course" it takes:
     - warm-up / reps / recovery / cool-down become sections
       (1 warm-up, 2 training, 3 recovery, 4 cool-down); repeats become
       interval groups (at most 20 repeats each, so bigger sets split)
     - miles / km / m become meters, minutes become seconds
     - an exact pace (8:05-8:15/mi) is sent as that pace range, per km
     - an effort word becomes a COROS zone, from the athlete's own COROS
       thresholds: easy = heart-rate zone 2, marathon = pace zone 3,
       tempo / threshold = pace zone 4, 5K / hills = pace zone 5,
       mile / strides = pace zone 6
     - a plain "6 mi easy" day is one section, zoned by its run type
   Only runs: COROS can't take strength sessions this way.
   Unit-tested in tests/corosWorkout.test.mjs.
========================================== */

import { parsePaceRange, setText, amountText } from "./runWorkout.js";

const METERS = { mi: 1609.344, km: 1000, m: 1 };
const HR = z => ({ intensityType: 1, sectionIntensity: z });
const PACE = z => ({ intensityType: 2, sectionIntensity: z });

// Effort words -> a COROS zone. First match wins, so "mile to 3K" is
// speed (zone 6) and "half marathon" is threshold (zone 4).
const EFFORTS = [
    [/recover|walk|jog|shake/i, HR(1)],
    [/easy|aerobic|conversation|base/i, HR(2)],
    [/mile|3k|1500|800|sprint|stride|fast|speed|repetition/i, PACE(6)],
    [/5k|10k|vo2|interval|hard|hill/i, PACE(5)],
    [/tempo|threshold|half|lactate|cruise|race/i, PACE(4)],
    [/marathon|\bmp\b|steady|moderate|progress/i, PACE(3)],
    [/long/i, HR(2)]
];

export function effortZone(text, fallback) {
    const hit = EFFORTS.find(([re]) => re.test(String(text || "")));
    return hit ? { ...hit[1] } : { ...fallback };
}

// Plain day types -> a zone for a one-section run.
const TYPE_ZONE = { recovery: HR(1), easy: HR(2), long: HR(2), workout: PACE(4), tempo: PACE(4), race: PACE(4) };

// "8:05-8:15" per mile -> an absolute pace range in seconds per km.
export function paceRangePerKm(text) {
    const r = parsePaceRange(text);
    if (!r) return null;
    const perKm = s => Math.min(1499, Math.max(120, Math.round(s / 1.609344)));
    return { intensityType: 2, intensityValueStart: perKm(r.lo), intensityValueEnd: perKm(r.hi) };
}

function target(step) {
    if (step.unit === "min") return { targetType: 2, targetValue: Math.max(1, Math.round(step.amount * 60)) };
    return { targetType: 1, targetValue: Math.max(1, Math.round(step.amount * (METERS[step.unit] || METERS.mi))) };
}

const section = (sectionType, step, intensity) => ({ sectionType, ...target(step), ...intensity });

function structuredSections(w) {
    const out = [];
    if (w.warmup) out.push(section(1, w.warmup, effortZone(w.warmup.note, HR(2))));
    for (const set of w.sets || []) {
        const work = section(2, set, paceRangePerKm(set.pace) || effortZone(set.effort, PACE(3)));
        const rec = set.recovery ? section(3, set.recovery, effortZone(set.recovery.note, HR(1))) : null;
        const members = rec ? [work, rec] : [work];
        if ((set.repeat || 1) > 1) {
            for (let left = set.repeat; left > 0; left -= 20) {
                out.push({ intervalGroup: true, repeats: Math.min(20, left), sets: members.map(m => ({ ...m })) });
            }
        } else {
            out.push(...members);
        }
    }
    if (w.cooldown) out.push(section(4, w.cooldown, effortZone(w.cooldown.note, HR(2))));
    return out;
}

const usesPaceZone = sections => sections.some(s => s.intervalGroup ? usesPaceZone(s.sets) : s.intensityType === 2 && s.sectionIntensity);
const usesPaceRange = sections => sections.some(s => s.intervalGroup ? usesPaceRange(s.sets) : s.intensityValueStart);

/**
 * day: a plan day ({ type, miles, session, workout }); title: "Tempo run".
 * -> the COROS course, or null when there's nothing a watch can run.
 */
export function courseFromDay(day, { title = "Run", coachName = "" } = {}) {
    if (!day) return null;
    const w = day.workout;
    const miles = Number(day.miles) || 0;
    let sections = [];
    if (w && (w.warmup || w.sets?.length || w.cooldown)) sections = structuredSections(w);
    else if (miles > 0) sections = [section(2, { amount: miles, unit: "mi" }, { ...(TYPE_ZONE[day.type] || HR(2)) })];
    if (!sections.length) return null;

    const steps = w?.sets?.length
        ? [w.warmup ? `Warm up ${amountText(w.warmup)}` : "", ...w.sets.map(setText), w.cooldown ? `Cool down ${amountText(w.cooldown)}` : ""].filter(Boolean).join(", ")
        : String(day.session || "").trim();
    const targets = [
        sections.some(function hr(s) { return s.intervalGroup ? s.sets.some(hr) : s.intensityType === 1; }) ? "easy parts by heart-rate zone" : "",
        usesPaceZone(sections) ? "harder parts by pace zone" : "",
        usesPaceRange(sections) ? "the paces your coach set" : ""
    ].filter(Boolean);
    const description = [
        steps,
        w?.why || "",
        w?.cue ? `Cue: ${w.cue}` : "",
        targets.length ? `Targets: ${targets.join(", ")}, from your COROS zones.` : "",
        `From ${coachName || "your coach"} · Southbound Coaching`
    ].filter(Boolean).join("\n\n");

    return {
        sportType: 1,
        courseName: `${title}${miles ? ` · ${miles} mi` : ""}`.slice(0, 100),
        courseDescription: description.slice(0, 2000),
        sections
    };
}

// A short fingerprint, to tell whether a sent workout has changed since.
export function courseHash(course) {
    const text = JSON.stringify(course);
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

// COROS takes dates from today through 90 days out.
export function sendableDate(date, today) {
    const d = s => new Date(`${s}T00:00:00Z`).getTime();
    const days = Math.round((d(date) - d(today)) / 86400000);
    return days >= 0 && days <= 90;
}

// idInPlan from a create result, wherever COROS put it.
export function idInPlanFrom(result) {
    const text = typeof result === "string" ? result : JSON.stringify(result ?? "");
    const m = /idInPlan\\?"?\s*[:=]\s*\\?"?(\d{3,})/i.exec(text);
    return m ? m[1] : null;
}
