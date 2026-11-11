/* ==========================================
   Southbound — the plan screen's numbers (pure, unit-tested)

   The plan screen (js/planScreen.js) is the Marathon page's design for any
   plan the race plan generator makes: 5K, 10K, half marathon or marathon.
   This file turns a stored plan into what the screen draws, and nothing here
   touches the page.

   A stored plan (coach-plan shape) holds each day's run, miles and workout.
   What it does not hold is which days are the key sessions, the 800s test
   and tune-up races, or the block a week belongs to. Those come from running
   the engine again on the plan's own saved settings (it is deterministic) and
   matching by date. If that fails, the screen still works from the stored
   plan alone.
========================================== */

const DAY_MS = 86400000;
const D = iso => new Date(`${iso}T12:00:00`);
const gap = (a, b) => Math.round((D(b) - D(a)) / DAY_MS);
const addDays = (iso, n) => { const t = D(iso); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const miles = w => Math.round((w.days || []).reduce((t, d) => t + (d.type === "race" ? 0 : Number(d.miles) || 0), 0) * 10) / 10;

export const RACE_LABEL = { "5K": "5K", "10K": "10K", HALF: "Half marathon", MARATHON: "Marathon" };

// The block colours, first block to last. Peak is gold, taper and race week brick.
export const PALETTE = ["#4c8b6e", "#6fa08a", "#87b5ae", "#b9c7c9", "#e3ddd0"];
export const PEAK_COLOUR = "#d4aa62";
export const TAPER_COLOUR = "#c2694a";

// One line for each block, in plain words.
export const BLOCK_TEXT = {
    "Base": "Easy volume, strides and fartlek.",
    "Hills": "Hill repeats for strength.",
    "Strength": "Threshold and hill sprints.",
    "VO2max": "800s, 1K and 1200s at 3K to 5K pace.",
    "Speed": "400s, 1K and 1200s at 5K pace.",
    "Threshold": "Mile repeats, cruise intervals, tempo.",
    "Threshold strength": "Longer threshold, race-pace finishes.",
    "5K specific": "5K-pace reps and mile-pace 400s.",
    "10K specific": "10K-pace miles and 2-mile repeats.",
    "Marathon specific": "Race-pace long runs.",
    "Half-marathon specific": "Half-pace reps and race-pace finishes.",
    "Settle in": "Current miles while the plan starts.",
    "Peak and taper": "The biggest week, then the miles come down."
};

const kindOf = (phase, rich, days) => {
    if (rich?.kind) return rich.kind;
    if ((days || []).some(d => d.type === "race")) return "race";
    if (/taper/i.test(phase)) return "taper";
    if (/peak/i.test(phase)) return "peak";
    return "build";
};

/** Where today falls: "before", "in" or "after" the plan, and the week to open on. */
export function openWeek(weeks, today) {
    if (!weeks.length) return { state: "none", index: 0 };
    if (today < weeks[0].startDate) return { state: "before", index: 0 };
    const last = weeks[weeks.length - 1];
    if (today > addDays(last.startDate, 6)) return { state: "after", index: weeks.length - 1 };
    const index = weeks.findIndex(w => today >= w.startDate && today <= addDays(w.startDate, 6));
    return { state: "in", index: Math.max(0, index) };
}

/**
 * Everything the screen draws.
 *   plan      a stored plan ({ weeks, generator: { settings }, raceDate })
 *   today     "YYYY-MM-DD"
 *   generate  the engine's generateMarathonPlan (passed in, so this file stays pure)
 * Returns null when there is no plan to show.
 */
export function buildPlanView(plan, today, { generate = null } = {}) {
    const stored = plan?.weeks || [];
    if (!stored.length) return null;
    const settings = plan.generator?.settings || {};
    let rich = null;
    try { rich = generate && settings.raceType ? generate(settings) : null; } catch { rich = null; }
    if (rich && rich.problems?.length) rich = null;
    const richWeek = new Map((rich?.weeks || []).map(w => [w.startDate, w]));
    const richDay = new Map((rich?.weeks || []).flatMap(w => (w.days || []).map(d => [d.date, d])));

    const raceDay = stored.flatMap(w => w.days || []).find(d => d.type === "race");
    const raceDate = raceDay?.date || plan.raceDate || settings.raceDate || "";
    const startDate = stored[0].startDate;
    const weeks = stored.map((w, i) => {
        const rw = richWeek.get(w.startDate);
        const phase = w.phase || rw?.stimulus || "";
        const kind = kindOf(phase, rw, w.days);
        const days = (w.days || []).map(d => {
            const r = richDay.get(d.date);
            const run = d.type !== "rest" && d.type !== "strength" && d.type !== "cross";
            return {
                ...d,
                key: Boolean(r?.key) || (!rich && (d.type === "workout" || d.type === "long")),
                benchmark: Boolean(r?.benchmark),
                tuneUp: Boolean(r?.tuneUp),
                why: d.workout?.why || r?.workout?.why || "",
                cue: d.workout?.cue || r?.workout?.cue || "",
                run
            };
        });
        return {
            index: i, startDate: w.startDate, endDate: addDays(w.startDate, 6),
            miles: miles(w), phase, kind, down: Boolean(w.cutback || rw?.down),
            test: days.some(d => d.benchmark), tune: days.some(d => d.tuneUp), days
        };
    });

    // Blocks, in order, with a colour each. Peak, taper and race weeks are never a block of their own.
    const names = [...new Set(weeks.filter(w => !["peak", "taper", "race"].includes(w.kind)).map(w => w.phase).filter(Boolean))];
    const colourFor = w => {
        if (w.kind === "peak") return PEAK_COLOUR;
        if (w.kind === "taper" || w.kind === "race") return TAPER_COLOUR;
        const at = names.indexOf(w.phase);
        if (names.length < 2 || at < 0) return PALETTE[2];
        return PALETTE[Math.round(at * (PALETTE.length - 1) / (names.length - 1))];
    };
    weeks.forEach(w => { w.colour = colourFor(w); });
    const legend = [
        ...names.map(n => ({ name: n, colour: colourFor(weeks.find(w => w.phase === n)) })),
        ...(weeks.some(w => w.kind === "peak") ? [{ name: "Peak", colour: PEAK_COLOUR }] : []),
        ...(weeks.some(w => w.kind === "taper" || w.kind === "race") ? [{ name: "Taper", colour: TAPER_COLOUR }] : [])
    ];

    const at = openWeek(weeks, today);
    const wi = at.index;
    const total = weeks.length;
    const toRace = raceDate ? gap(today, raceDate) : null;
    const totalDays = raceDate ? Math.max(1, gap(startDate, raceDate)) : 1;
    const ring = toRace == null ? 0 : Math.max(0, Math.min(1, 1 - toRace / totalDays));
    const peak = Math.max(...weeks.map(w => w.miles));
    const runDays = weeks.flatMap(w => w.days).filter(d => d.run);
    const nextDown = weeks.findIndex((w, i) => i > wi && w.down);

    const blocks = (rich?.summary?.blocks || []).map(b => ({
        name: b.name, from: b.from, to: b.to,
        now: at.state === "in" && wi + 1 >= b.from && wi + 1 <= b.to,
        colour: weeks[Math.min(weeks.length, b.from) - 1]?.colour || PALETTE[2],
        text: BLOCK_TEXT[b.name] || ""
    }));

    const chips = [];
    if (rich?.summary?.tier) chips.push({ text: rich.summary.tier });
    if (rich?.summary?.racePace) chips.push({ text: `Race pace ${String(rich.summary.racePace).split("-")[0]}` });
    if (at.state === "in" && nextDown > 0) chips.push({ text: `Down week in ${nextDown - wi} wk`, gold: true });

    return {
        state: at.state, index: wi, total, weeks, legend, blocks, chips,
        raceType: settings.raceType || rich?.summary?.distance || "",
        raceLabel: RACE_LABEL[settings.raceType] || "Race",
        raceDate, goalTime: settings.goalTime || "",
        toRace, ring, startDate,
        cycle: Math.round(weeks.reduce((t, w) => t + w.miles, 0)),
        peak: Math.round(peak),
        donePct: at.state === "after" ? 100 : at.state === "before" ? 0 : Math.round(wi / total * 100),
        doneRuns: runDays.filter(d => d.completed).length, totalRuns: runDays.length,
        paces: rich?.paces || null,
        tier: rich?.summary?.tier || "",
        warnings: rich?.warnings || [],
        hasTune: weeks.some(w => w.tune), hasTest: weeks.some(w => w.test),
        richOk: Boolean(rich)
    };
}

/** The day to open on in a week: today if it is in the week, else the first run. */
export function pickDay(week, today) {
    if (!week) return null;
    return week.days.find(d => d.date === today) || week.days.find(d => d.run) || week.days[0] || null;
}

/** Plain label for the chip on a day card. */
export function dayChip(d) {
    if (d.benchmark) return "800s test";
    if (d.tuneUp) return "Tune-up race";
    if (d.type === "race") return "Race day";
    return { workout: "Workout", long: "Long run", recovery: "Recovery", easy: "Easy", strength: "Strength", cross: "Cross", rest: "Rest" }[d.type] || "Easy";
}
