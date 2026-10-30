/* ==========================================
   Southbound — Fuel Clock (pure, tested in tests/fuelClockModel.test.mjs)

   Turns a built fueling schedule (js/fuelSchedule.js buildSchedule) into
   the things to take, in order, and says what is next, how long until it,
   and how much is left to drink. Amounts are the plan's own: nothing here
   invents a gel or a number. The view is js/fuelClock.js.
========================================== */

/**
 * The schedule's gels, sipped drinks and bottles, in the order they are due. Fluid in oz, as stored.
 * A gel is due at its minute. A bottle or sipped drink is sipped across its stretch, so it is due when it
 * should be finished (`at` = its end, `from` = its start): marking it done means it is empty.
 */
export function clockItems(schedule) {
    if (!schedule) return [];
    const items = [];
    (schedule.bottles || []).forEach(b => items.push({
        id: `b${b.n}`, kind: "bottle", n: b.n, at: b.endMin, from: b.startMin, mile: b.endMile ?? null,
        name: `Bottle ${b.n}`, carbs: Number(b.carbs) || 0, fluid: Number(b.oz) || 0, caffeineMg: Number(b.caffeineMg) || 0
    }));
    (schedule.sips || []).forEach(d => items.push({
        id: `s${d.n}`, kind: "drink", n: d.n, at: d.endMin, from: d.startMin, mile: d.endMile ?? null,
        name: d.name || "Drink", carbs: Number(d.carbs) || 0, fluid: Number(d.fluid) || 0, caffeineMg: Number(d.caffeineMg) || 0
    }));
    (schedule.gels || []).forEach(g => items.push({
        id: `g${g.n}`, kind: "gel", n: g.n, at: g.min, from: null, mile: g.mile ?? null,
        name: g.name || "Gel", carbs: Number(g.carbs) || 0, fluid: Number(g.fluid) || 0, caffeineMg: Number(g.caffeineMg) || 0
    }));
    const order = { gel: 0, drink: 1, bottle: 2 };
    return items.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind] || a.n - b.n);
}

/** Where the run is: what is done, what is next, the fill, and what is left to drink. */
export function clockState(items, { done = [], elapsedSec = null } = {}) {
    const doneSet = new Set(done);
    const sum = (list, key) => list.reduce((s, i) => s + i[key], 0);
    const taken = items.filter(i => doneSet.has(i.id));
    const next = items.find(i => !doneSet.has(i.id)) || null;
    const carbsTotal = Math.round(sum(items, "carbs"));
    const carbsTaken = Math.round(sum(taken, "carbs"));
    const fluidTotal = sum(items, "fluid");
    const fluidLeft = Math.max(0, fluidTotal - sum(taken, "fluid"));
    const started = elapsedSec != null && isFinite(elapsedSec);
    const dueInSec = next && started ? Math.round(next.at * 60 - elapsedSec) : null;
    return {
        next,
        dueInSec,
        overdue: dueInSec != null && dueInSec <= 0,
        carbsTotal,
        carbsTaken,
        fluidTotal,
        fluidLeft,
        // The fill follows carbs taken; a plan of water only follows fluid.
        fill: carbsTotal > 0 ? Math.min(1, carbsTaken / carbsTotal)
            : fluidTotal > 0 ? Math.min(1, (fluidTotal - fluidLeft) / fluidTotal) : 0,
        allDone: items.length > 0 && !next,
        doneCount: taken.length
    };
}

/** 754 -> "12:34"; 3725 -> "1:02:05". Never negative. */
export function countdownText(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const pad = n => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Minutes into the run, as words for before the clock starts: 30 -> "30 min in", 95 -> "1 h 35 min in", 0 -> "at the start". */
export function atText(min) {
    const m = Math.max(0, Math.round(Number(min) || 0));
    if (!m) return "at the start";
    const h = Math.floor(m / 60), r = m % 60;
    return h ? `${h} h${r ? ` ${r} min` : ""} in` : `${m} min in`;
}

/** What to say for one item: "Gel 2 · Maurten 100", "Finish bottle 1", "Finish Tailwind". */
export function itemLabel(item) {
    if (!item) return "";
    if (item.kind === "bottle") return `Finish bottle ${item.n}`;
    if (item.kind === "drink") return `Finish ${item.name}`;
    return `Gel ${item.n} · ${item.name}`;
}

/** Today as YYYY-MM-DD on this device. */
export function dayKey(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The saved clock (done marks, start time) only counts for the same plan on the same day. */
export function freshState(saved, planKey, today = dayKey()) {
    const ok = saved && typeof saved === "object" && saved.planKey === planKey && saved.day === today;
    return {
        planKey,
        day: today,
        startedAt: ok && Number.isFinite(saved.startedAt) ? saved.startedAt : null,
        done: ok && Array.isArray(saved.done) ? saved.done.filter(x => typeof x === "string") : []
    };
}

/** Mon=0 … Sun=6, and the marathon week/day key for a date, from the plan's week starts. */
export function marathonDayFor(date, { weeks, weekStart, days }) {
    const d = new Date(date); d.setHours(12, 0, 0, 0);
    for (let w = 1; w <= weeks; w++) {
        const start = new Date(weekStart(w)); start.setHours(0, 0, 0, 0);
        const idx = Math.floor((d - start) / 86400000);
        if (idx >= 0 && idx < 7) return { week: w, dayKey: days[idx], index: idx };
    }
    return null;
}

/** A marathon week with no running days is a gap to say out loud, not a list to fake. */
export function weekHasWorkouts(days) {
    return Array.isArray(days) && days.some(d => Number(d?.miles) > 0);
}
