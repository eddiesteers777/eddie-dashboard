/* ==========================================
   Southbound — a plan day as a Garmin workout file (pure)

   Garmin watches (and Wahoo / Hammerhead units) load structured workouts
   from FIT workout files: copied into the watch's GARMIN/NewFiles folder,
   the run shows under Training > Workouts. This turns a Southbound plan
   day into that file:
     - warm-up / reps / recovery / cool-down become workout steps
       (FIT intensity warmup / active / recovery / cooldown); a repeat is
       its steps plus a "repeat until steps complete" step
     - miles / km / m become a distance, minutes a time
     - an exact pace (8:05-8:15/mi) becomes a speed range the watch
       alerts on; an easy or long day is heart-rate zone 2; other effort
       words stay open, with the word on the step
   Written from Garmin's public FIT protocol description (file header,
   definition + data messages, CRC-16). Garmin's FIT SDK is NOT copied
   here: its license doesn't allow publishing it. It is a dev-only test
   dependency that checks these files decode (tests/fitWorkout.test.mjs).
========================================== */

import { parsePaceRange, paceRangeText } from "./runWorkout.js";

export const FIT_EPOCH = 631065600;            // 1989-12-31T00:00:00Z in Unix seconds
const METERS = { mi: 1609.344, km: 1000, m: 1 };
const INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4 };
const DURATION = { time: 0, distance: 1, open: 5, repeat: 6 };
const TARGET = { speed: 0, heartRate: 1, open: 2 };
const MAX_STEPS = 50;                          // what most Garmin watches hold

// Watch fonts are plain: dashes, times signs and accents become ASCII.
export const ascii = text => String(text ?? "")
    .replace(/[–—]/g, "-").replace(/×/g, "x").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();

const EASY = /easy|aerobic|conversation|base|long|recover/i;

function duration(step) {
    if (step.unit === "min") return { type: "time", s: Math.max(1, Math.round(step.amount * 60)) };
    return { type: "distance", m: Math.max(1, Math.round(step.amount * (METERS[step.unit] || METERS.mi) * 100) / 100) };
}

// "8:05-8:15" per mile -> a speed range (m/s), slow end first.
export function speedRange(pace) {
    const r = parsePaceRange(pace);
    if (!r) return null;
    return { type: "speed", low: 1609.344 / r.hi, high: 1609.344 / r.lo };
}

function workStep(part, name) {
    const pace = speedRange(part.pace);
    const effort = ascii(part.effort);
    return {
        name: ascii(name || (effort ? effort[0].toUpperCase() + effort.slice(1) : "Run")),
        intensity: "active",
        duration: duration(part),
        target: pace || (EASY.test(effort) ? { type: "hrZone", zone: 2 } : { type: "open" }),
        notes: ascii(pace ? `@ ${paceRangeText(part.pace)}` : effort ? `${effort} effort` : "")
    };
}

const easyStep = (step, name, intensity) => ({
    name, intensity, duration: duration(step),
    target: speedRange(step.pace) || { type: "open" },
    notes: ascii(step.pace ? `@ ${paceRangeText(step.pace)}` : step.note || "Easy")
});

const recoveryStep = step => ({ ...easyStep(step, "Recover", "recovery"), notes: ascii(step.note || "Easy jog") });

/**
 * day: a plan day ({ type, miles, session, workout }) -> the watch steps,
 * or [] when there's nothing a watch can run. A repeat is
 * { repeatFrom: index of its first step, times }.
 */
export function workoutSteps(day) {
    if (!day || day.type === "rest") return [];
    const w = day.workout;
    const steps = [];
    if (w && (w.warmup || w.sets?.length || w.cooldown)) {
        if (w.warmup) steps.push(easyStep(w.warmup, "Warm up", "warmup"));
        for (const set of w.sets || []) {
            const first = steps.length;
            if (set.parts?.length) {
                for (const p of set.parts) steps.push(p.recovery ? recoveryStep(p) : workStep(p));
            } else {
                steps.push(workStep(set, (set.repeat || 1) > 1 ? "Rep" : ""));
                if (set.recovery && (set.repeat || 1) > 1) steps.push(recoveryStep(set.recovery));
            }
            if ((set.repeat || 1) > 1) steps.push({ repeatFrom: first, times: set.repeat });
        }
        if (w.cooldown) steps.push(easyStep(w.cooldown, "Cool down", "cooldown"));
    } else {
        const miles = Number(day.miles) || 0;
        if (miles <= 0) return [];
        const easy = ["easy", "long", "recovery"].includes(day.type);
        steps.push({
            name: ascii(day.type === "long" ? "Long run" : day.type === "recovery" ? "Recovery run" : easy ? "Easy run" : "Run"),
            intensity: "active",
            duration: duration({ amount: miles, unit: "mi" }),
            target: easy ? { type: "hrZone", zone: 2 } : { type: "open" },
            notes: ascii(day.session || "")
        });
    }
    return steps.length > MAX_STEPS ? [] : steps;
}

// ---------- the FIT file ----------

const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
    0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];

/** FIT's CRC-16 over bytes (Uint8Array or array). */
export function fitCrc(bytes, crc = 0) {
    for (const byte of bytes) {
        let tmp = CRC_TABLE[crc & 0xF];
        crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ CRC_TABLE[byte & 0xF];
        tmp = CRC_TABLE[crc & 0xF];
        crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xF];
    }
    return crc;
}

// base types: [id, bytes, invalid]
const ENUM = [0x00, 1, 0xFF], U16 = [0x84, 2, 0xFFFF], U32 = [0x86, 4, 0xFFFFFFFF];
const STR = size => [0x07, size, null];

const utf8 = text => new TextEncoder().encode(text);
// A string cut to fit `max` bytes with its closing zero.
const cut = (text, max) => { const b = utf8(ascii(text)); return b.slice(0, Math.max(0, max - 1)); };

function writer() {
    const out = [];
    const put = (value, [, size, invalid]) => {
        const v = value == null || !Number.isFinite(value) ? invalid : Math.round(value);
        for (let i = 0; i < size; i++) out.push(Number((BigInt(v) >> BigInt(8 * i)) & 0xFFn));
    };
    const text = (value, size) => { const b = cut(value, size); for (let i = 0; i < size; i++) out.push(b[i] ?? 0); };
    const define = (local, global, fields) => {
        out.push(0x40 | local, 0, 0, global & 0xFF, global >> 8, fields.length);
        for (const [num, [type, size]] of fields) out.push(num, size, type);
    };
    const data = (local, fields, values) => {
        out.push(local);
        fields.forEach(([, type], i) => (type[0] === 0x07 ? text(values[i], type[1]) : put(values[i], type)));
    };
    return { out, define, data };
}

// The longest string in the list (+ its zero), at least 2 and at most `max` bytes.
const strSize = (list, max) => Math.min(max, Math.max(2, ...list.map(s => cut(s, max).length + 1)));

/**
 * { name, steps (workoutSteps format), createdSec (Unix) } -> FIT workout file bytes.
 */
export function encodeWorkout({ name, steps, createdSec = Math.floor(Date.now() / 1000) }) {
    const w = writer();
    const fileId = [[0, ENUM], [1, U16], [2, U16], [4, U32]];
    w.define(0, 0, fileId);
    // type 5 = workout; manufacturer 255 = development.
    w.data(0, fileId, [5, 255, 0, createdSec - FIT_EPOCH]);

    const workout = [[4, ENUM], [6, U16], [8, STR(strSize([name], 40))], [11, ENUM]];
    w.define(1, 26, workout);
    w.data(1, workout, [1, steps.length, name, 0]);              // sport 1 = running, sub sport generic

    const names = steps.map(s => s.name || ""), notes = steps.map(s => s.notes || "");
    const step = [[254, U16], [0, STR(strSize(names, 24))], [1, ENUM], [2, U32], [3, ENUM], [4, U32], [5, U32], [6, U32], [7, ENUM], [8, STR(strSize(notes, 48))]];
    w.define(2, 27, step);
    steps.forEach((s, i) => {
        if (s.repeatFrom != null) {
            w.data(2, step, [i, "", DURATION.repeat, s.repeatFrom, null, s.times, null, null, null, ""]);
            return;
        }
        const dur = s.duration.type === "time" ? [DURATION.time, s.duration.s * 1000] : [DURATION.distance, s.duration.m * 100];
        const t = s.target;
        const target = t.type === "speed" ? [TARGET.speed, 0, t.low * 1000, t.high * 1000]
            : t.type === "hrZone" ? [TARGET.heartRate, t.zone, null, null]
                : [TARGET.open, null, null, null];
        w.data(2, step, [i, s.name, ...dur, ...target, INTENSITY[s.intensity] ?? 0, s.notes]);
    });

    const header = [14, 0x20, ...[2132 & 0xFF, 2132 >> 8], 0, 0, 0, 0, 0x2E, 0x46, 0x49, 0x54];
    const size = w.out.length;
    for (let i = 0; i < 4; i++) header[4 + i] = (size >> (8 * i)) & 0xFF;
    const hcrc = fitCrc(header);
    header.push(hcrc & 0xFF, hcrc >> 8);
    const crc = fitCrc(w.out, fitCrc(header));
    return new Uint8Array([...header, ...w.out, crc & 0xFF, crc >> 8]);
}

/**
 * day + { title } -> { name, steps, bytes } for "Save for Garmin",
 * or null when the day has nothing a watch can run.
 */
export function garminWorkout(day, { title = "Run", createdSec } = {}) {
    const steps = workoutSteps(day);
    if (!steps.length) return null;
    const miles = Number(day.miles) || 0;
    const name = ascii(`${title}${miles ? ` ${miles} mi` : ""}`).slice(0, 39) || "Southbound run";
    return { name, steps, bytes: encodeWorkout({ name, steps, createdSec }) };
}

// "Tempo run 6 mi" on 2026-10-21 -> "southbound-2026-10-21-tempo-run.fit"
export const fitFilename = (date, title) =>
    `southbound-${date}-${ascii(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "run"}.fit`;
