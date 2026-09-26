/* ==========================================
   Southbound — the coach's own marathon plan as COROS workouts (pure)

   Eddie's plan (js/marathonData.js, plus his edits on the Marathon page)
   writes each day as text, a mileage and a pace label. This reads the
   text into the structured workout shape of js/runWorkout.js (warm-up,
   sets, cool-down), which js/corosWorkout.js sends to COROS.

   The text is split into parts at "," ";" "+" "/" " - " "then" "w/", and
   each part is one of:
     warm-up      "2mi WU", "warm up 1.5", "WU 2 mi"
     cool-down    "2mi CD", "1.5 cool-down"
     reps         "8x800", "8x800m", "6x1mi", "6x1K", "5x6min", "8x45s",
                  with a target after "@"
     recovery     after reps: "400m jog", "90s jog", "2min rest", "1min
                  float", "short jog recovery" (90s jog when unsaid)
     a block      "4mi easy", "2mi @ 6:45", "20min @ threshold",
                  "7-8mi continuous Marathon Pace" (the first number)
     a finish     "last 3 @ MP", "last 3mi hard"
     the total    "19mi", "20-mile long run" (as long as the whole day)
   Targets: an exact pace ("@ 6:45", "@ 6:40-6:50", "@ 4:10/km"), a rep
   time ("8x800 @ 2:55" = 2:55 per 800, sent as that pace per mile), or a
   word: MP / marathon pace, half, threshold / tempo / cruise, 10K, 5K /
   VO2, steady / progression, easy, recovery, hill / strong, hard / surge /
   fast. Words get the plan's own pace ranges (PACES); easy and recovery
   go by heart-rate zone; hills and surges by COROS effort zone.
   Whatever the parts don't cover of the day's miles becomes warm-up and
   cool-down (or the easy start of a "last N" finish). Parts with numbers
   it can't read are listed in `unread`, and `notes` says when the parts
   don't add up to the day's miles, so the Marathon page can say so.
   Races: 10K / half tune-ups get warm-up + race + cool-down; race day is
   the marathon at marathon pace. Unit-tested in tests/marathonCoros.test.mjs.
========================================== */

import { courseFromDay, effortZone } from "./corosWorkout.js";
import { amountText, paceRangeText } from "./runWorkout.js";

// Plan pace table label -> "6:58-7:05" (per mile), from PACES.
function paceTable(paces) {
    const out = {};
    for (const [label, range] of paces || []) {
        const m = String(range).match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
        if (m) out[label.toLowerCase()] = `${m[1]}-${m[2]}`;
    }
    return out;
}

// Words -> which pace (or effort) a part runs at. First match wins.
const TARGETS = [
    [/marathon pace|\bmp\b|race pace/i, "marathon pace"],
    [/half/i, "half"],
    [/threshold|tempo|cruise|\blt\b/i, "threshold"],
    [/10k/i, "10k pace"],
    [/5k|vo2/i, "5k / vo₂max"],
    [/steady|progress|toward/i, "steady"],
    [/hill|strong/i, "@hill"],
    [/stride/i, "@strides"],
    [/surge|fartlek|hard|fast/i, "@hard"],
    [/recovery|shakeout/i, "@recovery"],
    [/easy|aerobic|comfortable|conversational|relaxed|\bez\b/i, "@easy"]
];

const round1 = n => Math.round(n * 10) / 10;
const mmss = s => { const r = Math.round(s); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`; };

function wordTarget(text, table) {
    const hit = TARGETS.find(([re]) => re.test(text));
    if (!hit) return null;
    const key = hit[1];
    if (key.startsWith("@")) return { effort: key.slice(1) };
    if (key === "half") {
        // Half-marathon pace: between threshold and marathon pace.
        const t = table.threshold, mp = table["marathon pace"];
        return t && mp ? { pace: `${t.split("-")[1]}-${mp.split("-")[0]}` } : { effort: "half marathon" };
    }
    if (key === "threshold") return table.threshold ? { pace: table.threshold } : table["cruise intervals"] ? { pace: table["cruise intervals"] } : { effort: "threshold" };
    return table[key] ? { pace: table[key] } : { effort: key };
}

// An exact pace or rep time in the text -> { pace: "m:ss[-m:ss]" } per mile.
function exactTarget(text, repMiles) {
    const m = text.match(/(\d{1,2}):(\d{2})(?:\s*[-–]\s*(\d{1,2}):(\d{2}))?\s*(?:\/\s*(km|k|mi|mile))?/i);
    const secsOnly = !m && text.match(/^\s*(\d{2,3})\s*(?:s|sec|secs|seconds)\b/i);
    if (!m && !secsOnly) return null;
    let lo = m ? Number(m[1]) * 60 + Number(m[2]) : Number(secsOnly[1]);
    let hi = m && m[3] ? Number(m[3]) * 60 + Number(m[4]) : lo;
    const perKm = m && /^k/i.test(m[5] || "");
    if (perKm) { lo *= 1.609344; hi *= 1.609344; }
    // Under 4:00 can't be a per-mile pace here: it's the time for one rep.
    else if (repMiles && repMiles < 1 && lo < 240) { lo /= repMiles; hi /= repMiles; }
    if (lo < 180 || hi > 1500) return null;
    return { pace: Math.round(lo) === Math.round(hi) ? mmss(lo) : `${mmss(Math.min(lo, hi))}-${mmss(Math.max(lo, hi))}` };
}

function targetFor(text, table, repMiles) {
    const at = text.includes("@") ? text.slice(text.indexOf("@") + 1) : text;
    return exactTarget(at, repMiles) || wordTarget(at, table) || (at !== text ? wordTarget(text, table) : null);
}

// ---------- amounts ----------

const UNIT = String.raw`(miles?|mi|km|k|meters?|m|minutes?|mins?|min|seconds?|secs?|sec|s)`;
function unitOf(u, n, fallback) {
    const x = String(u || "").toLowerCase();
    if (!x) return fallback(n);
    if (/^min/.test(x)) return "min";
    if (/^mi/.test(x)) return "mi";
    if (/^k/.test(x)) return "km";
    if (/^s/.test(x)) return "s";
    return "m";
}
function step(n, unit) {
    const amount = Number(n);
    return unit === "s" ? { amount: amount / 60, unit: "min" } : { amount, unit };
}
// About how many miles a step is (timed steps at a typical pace).
function miles(s, secsPerMile = 450) {
    if (!s) return 0;
    if (s.unit === "min") return (s.amount * 60) / secsPerMile;
    return s.amount * (s.unit === "mi" ? 1 : s.unit === "km" ? 0.621371 : 1 / 1609.344);
}
const easy = (m, note = "easy") => ({ amount: round1(m), unit: "mi", note });

// ---------- parts ----------

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const RE = {
    warm: /\b(wu|warm[\s-]*up)\b/i,
    cool: /\b(cd|cool[\s-]*down)\b/i,
    reps: new RegExp(String.raw`(\d+)\s*[x×]\s*` + NUM + String.raw`\s*` + UNIT + "?\\b", "i"),
    rec: new RegExp("^" + NUM + String.raw`\s*` + UNIT + String.raw`?\s*(jog|float|walk|rest|recovery|easy|standing)\b`, "i"),
    recWord: /^(?:short\s+|easy\s+)?(jog|float|walk)(?:\s+recovery)?$|^(?:short\s+)?recovery(?:\s+jog)?$|^short\s+jog\s+recovery$/i,
    last: new RegExp(String.raw`\blast\s+` + NUM + String.raw`\s*` + UNIT + String.raw`?\s*(.*)$`, "i"),
    block: new RegExp("^" + NUM + String.raw`(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*-?\s*` + UNIT + String.raw`?\b\s*(?:@|at\b|continuous\b|of\b)?\s*(.*)$`, "i"),
    amount: new RegExp(NUM + String.raw`\s*` + UNIT + "?\\b", "i")
};

// "4x(1mi @ MP, 1mi @ threshold)" is kept whole as a group token; other (notes) go.
function splitParts(text, groups) {
    return text
        .replace(/(\d+)\s*[x×]\s*\(([^)]*)\)/gi, (_, n, inner) => { groups.push({ n: Number(n), inner }); return ` §${groups.length - 1}§ `; })
        .replace(/\([^)]*\)/g, " ")
        .split(/\s*(?:,|;|\+|\/(?=\s*\d)|\s[-–—]\s|\bthen\b|\bw\/|\bwith\b|\band\b(?=\s*\d))\s*/i)
        .map(p => p.trim())
        .filter(Boolean);
}

/**
 * The day's text -> { items, unread } where items are
 * { kind: "warm"|"cool"|"set"|"finish"|"total", step?, set? }.
 */
function readParts(session, dayMiles, table, context) {
    const items = [];
    const unread = [];
    const groups = [];
    for (const part of splitParts(session, groups)) {
        const prev = items[items.length - 1];
        let m;
        if ((m = part.match(/§(\d+)§/))) {
            const g = groups[Number(m[1])];
            const parts = readGroup(g.inner, table);
            if (parts) items.push({ kind: "set", set: { repeat: g.n, amount: 0, unit: "mi", parts, recovery: null } });
            else unread.push(`${g.n}x(${g.inner})`);
        } else if (RE.warm.test(part) || RE.cool.test(part)) {
            const n = part.replace(RE.warm, " ").replace(RE.cool, " ").match(RE.amount);
            if (!n) continue;                                     // "warm-up/cooldown" with no distance
            const s = step(n[1], unitOf(n[2], n[1], () => "mi"));
            items.push({ kind: RE.warm.test(part) ? "warm" : "cool", step: { ...s, note: "easy" } });
        } else if ((m = part.match(RE.reps))) {
            const [, reps, n, u] = m;
            const unit = unitOf(u, n, x => (Number(x) >= 100 ? "m" : "mi"));
            const work = step(n, unit);
            const aim = targetFor(part.slice(m.index + m[0].length), table, miles(work)) || wordTarget(context, table) || { effort: "hard" };
            items.push({ kind: "set", set: { repeat: Number(reps), ...work, ...aim, recovery: null }, reps: true });
        } else if (prev?.reps && !prev.set.recovery && ((m = part.match(RE.rec)) || RE.recWord.test(part))) {
            if (m) {
                const n = Number(m[1]);
                const unit = unitOf(m[2], n, x => (x >= 100 ? "m" : x < 10 ? "min" : "s"));
                prev.set.recovery = { ...step(n, unit), note: m[3].toLowerCase() === "recovery" ? "jog" : m[3].toLowerCase() };
            } else {
                const word = part.match(/jog|float|walk/i);
                prev.set.recovery = { amount: 1.5, unit: "min", note: word ? word[0].toLowerCase() : "jog" };
            }
        } else if ((m = part.match(RE.last))) {
            const [, n, u, rest] = m;
            const s = step(n, unitOf(u, n, () => "mi"));
            items.push({ kind: "finish", set: { repeat: 1, ...s, ...(targetFor(rest, table) || { effort: "steady" }), recovery: null } });
        } else if ((m = part.match(RE.block))) {
            const [, n, u, rest] = m;
            const s = step(n, unitOf(u, n, () => "mi"));
            const aim = targetFor(rest, table);
            if (!aim && s.unit === "mi" && s.amount >= dayMiles - 0.05) { items.push({ kind: "total" }); continue; }
            items.push({ kind: "set", set: { repeat: 1, ...s, ...(aim || { effort: "easy" }), recovery: null } });
        } else if (/\d/.test(part)) {
            unread.push(part);
        }
    }
    // Reps with no recovery written: 90s jog (strides and other short reps: 60s).
    for (const it of items) {
        if (it.reps && !it.set.recovery) {
            const short = it.set.unit === "min" && it.set.amount <= 0.5;
            it.set.recovery = { amount: short ? 1 : 1.5, unit: "min", note: "jog" };
        }
    }
    return { items, unread };
}

// The inside of "4x(1mi @ MP, 1mi @ threshold, 2min jog)" -> its parts, or null.
function readGroup(inner, table) {
    const parts = [];
    for (const bit of inner.split(/\s*(?:,|;|\+|\/(?=\s*\d)|\bthen\b)\s*/i).map(x => x.trim()).filter(Boolean)) {
        let m;
        if ((m = bit.match(RE.rec))) {
            const n = Number(m[1]);
            parts.push({ ...step(n, unitOf(m[2], n, x => (x >= 100 ? "m" : x < 10 ? "min" : "s"))), recovery: true, note: m[3].toLowerCase() === "recovery" ? "jog" : m[3].toLowerCase() });
        } else if ((m = bit.match(RE.block))) {
            const s = step(m[1], unitOf(m[2], m[1], x => (Number(x) >= 100 ? "m" : "mi")));
            parts.push({ ...s, ...(targetFor(m[3], table, miles(s)) || { effort: "easy" }) });
        } else return null;
    }
    return parts.length ? parts : null;
}

const paceSecs = pace => { const m = String(pace || "").match(/(\d+):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const isEasy = set => set.effort === "easy" || set.effort === "recovery";
const partMiles = p => miles(p, p.recovery ? 540 : paceSecs(p.pace) || (isEasy(p) ? 540 : 450));
const setMiles = set => set.parts
    ? set.repeat * set.parts.reduce((t, p) => t + partMiles(p), 0)
    : set.repeat * (miles(set, paceSecs(set.pace) || (isEasy(set) ? 540 : 450)) + miles(set.recovery, 540));

function race(session, dayMiles, table) {
    const dist = /marathon/i.test(session) && !/half/i.test(session) ? 26.2 : /half/i.test(session) ? 13.1 : /10k/i.test(session) ? 6.2 : /5k/i.test(session) ? 3.1 : null;
    if (!dist) return null;
    const aim = wordTarget(dist === 26.2 ? "marathon pace" : dist === 13.1 ? "half" : dist === 6.2 ? "10k" : "5k", table);
    const set = { repeat: 1, amount: dist, unit: "mi", ...aim, recovery: null };
    const around = round1(dayMiles - dist);
    if (around < 1) return { sets: [set] };
    return { warmup: easy(Math.max(0.5, around * 0.6), "easy + strides"), sets: [set], cooldown: easy(Math.max(0.5, around * 0.4)) };
}

const TYPE_OF = { recovery: "recovery", easy: "easy", "long run": "long", race: "race" };

/**
 * A marathon plan day ({ session, miles, pace, race }) + the plan's PACES
 * -> { type, miles, session, workout, unread: [part], notes: [text] }.
 * workout is null for a plain run (it goes as one section by its label).
 */
export function planDayFromMarathon(day, paces) {
    if (!day) return null;
    const dayMiles = Number(day.miles) || 0;
    const session = String(day.session || "").trim();
    const label = String(day.pace || "").toLowerCase();
    const table = paceTable(paces);
    const type = TYPE_OF[label] || (day.race ? "race" : /long run/i.test(session) ? "long" : "workout");
    const out = { type, miles: dayMiles, session, workout: null, unread: [], notes: [] };
    if (!dayMiles) return { ...out, type: "rest", miles: 0 };

    const isRace = Boolean(day.race) || label === "race" || /^race\b/i.test(session);
    if (isRace) { out.workout = race(session, dayMiles, table); if (out.workout) return out; }

    // "Mile repeats: 6x1mi ..." -> the label is context, the rest is the workout.
    const colon = session.match(/^([^:]{0,39}[^:\d\s])\s*:\s*(.+)$/);
    const body = colon ? colon[2] : session;
    const context = `${colon ? colon[1] : ""} ${label}`;
    const { items, unread } = readParts(body, dayMiles, table, context);
    out.unread = unread;

    const warm = items.find(i => i.kind === "warm");
    const cool = items.find(i => i.kind === "cool");
    const sets = items.filter(i => i.kind === "set" || i.kind === "finish").map(i => i.set);
    const finish = items.some(i => i.kind === "finish");
    const quality = sets.filter(s => !isEasy(s));

    if (!quality.length && !warm && !cool && sets.length <= 1) {
        // A plain run ("Easy aerobic", "Recovery jog"), or a hard label with no numbers
        // ("Progression tempo - steady into threshold"): warm-up, the effort, cool-down.
        const aim = type === "workout" && dayMiles >= 5 ? wordTarget(`${label} ${session}`, table) : null;
        if (aim && !isEasy(aim)) out.workout = { warmup: easy(1.5), sets: [{ repeat: 1, amount: round1(dayMiles - 3), unit: "mi", ...aim, recovery: null }], cooldown: easy(1.5) };
        return out;
    }

    const explicit = sets.reduce((t, s) => t + setMiles(s), 0) + miles(warm?.step) + miles(cool?.step);
    const rem = round1(dayMiles - explicit);
    let warmup = warm ? warm.step : null;
    let cooldown = cool ? cool.step : null;
    const adds = () => out.notes.push(`These parts add up to about ${round1(explicit)} mi; the day says ${dayMiles} mi.`);
    if (rem >= 0.3) {
        if (finish && !warm) sets.unshift({ repeat: 1, amount: round1(rem), unit: "mi", effort: "easy", recovery: null });
        else if (!warm && !cool) {
            const single = quality.length === 1 && quality[0].repeat === 1;
            const longRun = type === "long" || /long run|long\b/i.test(session) || dayMiles >= 12;
            const c = single ? (longRun ? Math.min(2, Math.max(1, rem / 4)) : Math.min(1.5, rem / 2)) : rem / 2;
            warmup = easy(Math.max(0.5, rem - c));
            cooldown = easy(Math.max(0.5, c));
        } else if (!warm) warmup = easy(rem);
        else if (!cool) cooldown = easy(rem);
        else if (rem > 0.5) adds();
    } else if (rem < -0.5) adds();
    out.workout = { warmup, sets, cooldown };
    return out;
}

// "Mile repeats: 6x1mi @ Threshold" -> "Mile repeats"; "RACE: 10K Tune-Up (Sun Sep 13)"
// -> "10K Tune-Up"; "PEAK: 20-mile long run w/ ..." -> "20-mile long run".
export function marathonTitle(session, dayMiles = 0) {
    let text = String(session || "").trim();
    const colon = text.match(/^([^:]{0,29}[^:\d\s])\s*:\s*(.+)$/);
    if (colon) text = /^[A-Z ]+$/.test(colon[1]) ? colon[2] : colon[1];
    text = text.split(/\s+\(|\s+[-–—]\s+|\s+w\/\s|\s*\+\s*|,\s*/)[0].trim();
    if (/^\d+(?:\.\d+)?\s*mi$/i.test(text)) text = dayMiles >= 12 ? "Long run" : "Run";  // "19mi w/ ..." -> "Long run"
    return (text || "Run").slice(0, 60);
}

/** A marathon plan day -> the COROS course, or null (rest days). */
export function marathonCourse(day, paces) {
    const planDay = planDayFromMarathon(day, paces);
    if (!planDay || !planDay.miles) return null;
    const course = courseFromDay(planDay, { title: marathonTitle(day.session, planDay.miles), coachName: "" });
    if (!course) return null;
    // Eddie's own plan: the day as he wrote it first, signed as his plan.
    course.courseDescription = [String(day.session || "").trim(), course.courseDescription]
        .filter(Boolean).join("\n\n")
        .replace("the paces your coach set", "your plan's paces")
        .replace(/From your coach · Southbound Coaching$/, "Southbound Coaching · marathon plan")
        .slice(0, 2000);
    return course;
}

// One part, in words, with the zone the watch will use when it isn't a pace.
function targetWords(x) {
    const pace = paceRangeText(x.pace);
    if (pace) return pace;
    const z = effortZone(x.effort || "", { intensityType: 2, sectionIntensity: 3 });
    return `${x.effort || "steady"} (${z.intensityType === 1 ? "heart-rate" : "pace"} zone ${z.sectionIntensity})`;
}
function setWords(set) {
    const reps = set.repeat > 1 ? `${set.repeat} × ` : "";
    if (set.parts) return `${reps}(${set.parts.map(p => p.recovery ? `${amountText(p)} ${p.note}` : `${amountText(p)} @ ${targetWords(p)}`).join(", ")})`;
    const rec = set.recovery ? ` with ${amountText(set.recovery)} ${set.recovery.note || "recovery"}` : "";
    return `${reps}${amountText(set)}${isEasy(set) ? " " : " @ "}${targetWords(set)}${rec}`;
}

/**
 * What the watch will get, in words, for the Marathon page:
 * { steps: ["2 mi warm-up", "8 × 800 m @ 5:52/mi with 400 m jog", "1.5 mi cool-down"],
 *   unread: [...], notes: [...] }, or null for a rest day.
 */
export function marathonPreview(day, paces) {
    const planDay = planDayFromMarathon(day, paces);
    if (!planDay || !planDay.miles) return null;
    const w = planDay.workout;
    const zone = planDay.type === "recovery" ? "recovery (heart-rate zone 1)" : "easy (heart-rate zone 2)";
    const steps = w
        ? [w.warmup ? `${amountText(w.warmup)} warm-up` : "", ...(w.sets || []).map(setWords), w.cooldown ? `${amountText(w.cooldown)} cool-down` : ""].filter(Boolean)
        : [`${planDay.miles} mi ${zone}`];
    return { steps, unread: planDay.unread, notes: planDay.notes };
}
