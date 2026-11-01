// Conditioning block (pure). The coach sets every number; nothing here is a standard or a
// suggested load. A block is a list of exercises, each: name, rounds, work seconds, rest seconds.
// Conditioning is exempt from the AHSAA out-of-season limits, so a block carries no soccer skill
// drills: it is only timed work and rest.

export const MAX_EXERCISES = 12;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const int = (v, lo, hi, fallback) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? clamp(n, lo, hi) : fallback; };

// -> a clean exercise, or null while it has no name or no work time (not ready to run).
export function cleanExercise(x) {
    const name = String(x?.name || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const work = int(x?.work, 0, 600, 0);
    if (!name || work < 1) return null;
    return { name, rounds: int(x?.rounds, 1, 30, 1), work, rest: int(x?.rest, 0, 600, 0) };
}
export const cleanBlock = list => (Array.isArray(list) ? list : []).map(cleanExercise).filter(Boolean).slice(0, MAX_EXERCISES);

// The timed sequence: [{ label, kind: "work"|"rest", seconds, round, rounds }]. The last rest of an
// exercise is kept (it is the break before the next one) except after the very last round.
export function phases(block) {
    const out = [];
    const list = cleanBlock(block);
    list.forEach((e, ei) => {
        for (let r = 1; r <= e.rounds; r++) {
            out.push({ label: e.name, kind: "work", seconds: e.work, round: r, rounds: e.rounds });
            const last = ei === list.length - 1 && r === e.rounds;
            if (e.rest > 0 && !last) out.push({ label: "Rest", kind: "rest", seconds: e.rest, round: r, rounds: e.rounds });
        }
    });
    return out;
}
export const totalSeconds = block => phases(block).reduce((a, p) => a + p.seconds, 0);

// Where we are `elapsed` seconds in: { index, phase, left, done }.
export function at(elapsed, ph) {
    let t = 0;
    for (let i = 0; i < ph.length; i++) {
        if (elapsed < t + ph[i].seconds) return { index: i, phase: ph[i], left: Math.ceil(t + ph[i].seconds - elapsed), done: false };
        t += ph[i].seconds;
    }
    return { index: ph.length, phase: null, left: 0, done: true };
}
export const clock = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export const serialize = block => JSON.stringify({ app: "playbook-conditioning", v: 1, block: cleanBlock(block) });
export function parse(text) {
    try { const o = JSON.parse(text); return o && o.app === "playbook-conditioning" ? cleanBlock(o.block) : []; } catch { return []; }
}

// Day 1: the first practice as a Run practice checklist. Minutes are only time slots the coach can
// change in the planner; the tests are the ones the coach chose (see fitnessModel.js).
export const DAY_ONE_ITEMS = [
    { name: "Arrive, attendance and water check", minutes: 10, note: "First names. Check the weather." },
    { name: "Equipment check", minutes: 5, note: "" },
    { name: "School forms", minutes: 5, note: "Use the school's own list." },
    { name: "Expectations talk", minutes: 10, note: "Your words." },
    { name: "Warm-up", minutes: 10, note: "" },
    { name: "1 mile without stopping", minutes: 20, note: "Open Fitness check to save each time." },
    { name: "Beep test", minutes: 20, note: "Open Fitness check. Tap a name when they miss the line twice." },
    { name: "Cool-down and what to bring next time", minutes: 10, note: "" }
];
