/* ==========================================
   Southbound — swap two days of a marathon week (pure)

   Moving a workout to another day of the same week is a swap: the two
   days trade places. Everything that belongs to the workout goes with
   it: session, miles, pace, race flag and the strength / mobility /
   recovery / cross-training / notes lists. A fueling plan built for a
   day is tied to it by marathonRef {week, dayKey} (and an id
   "w<week>-<dayKey>"), so it is re-pointed to the day its run moved to.
   "Done" marks stay with the date, not the workout.

   No DOM or storage. Unit-tested in tests/marathonSwap.test.mjs.
========================================== */

export const SWAP_FIELDS = ["session", "miles", "pace", "race", "strength", "mobility", "recovery", "crossTraining", "notes"];

// Why two days can't be swapped, or "" when they can. `days` are the
// week's seven resolved days, `keys` their names (Mon..Sun).
export function swapBlocker(days, keys, a, b) {
    const i = keys.indexOf(a), j = keys.indexOf(b);
    if (i < 0 || j < 0 || i === j) return "same";
    if (days[i]?.race || days[j]?.race) return "race";
    return "";
}

const copy = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// A new overrides object where day `a` holds b's workout and the other way round.
export function swapOverrides(overrides, days, keys, week, a, b) {
    const i = keys.indexOf(a), j = keys.indexOf(b);
    const out = JSON.parse(JSON.stringify(overrides || {}));
    const wk = out[week] = out[week] || {};
    const from = { [a]: days[i], [b]: days[j] };
    const to = { [a]: from[b], [b]: from[a] };
    for (const key of [a, b]) {
        const entry = wk[key] = wk[key] || {};
        for (const f of SWAP_FIELDS) entry[f] = copy(to[key][f]);
    }
    return out;
}

// A new plans list where plans tied to day a now point at b, and b's at a.
export function swapFuelPlans(plans, week, a, b, now = Date.now()) {
    const list = Array.isArray(plans) ? plans : [];
    return list.map(p => {
        const ref = p?.marathonRef;
        if (!ref || Number(ref.week) !== Number(week) || (ref.dayKey !== a && ref.dayKey !== b)) return p;
        const dayKey = ref.dayKey === a ? b : a;
        const id = p.id === `w${week}-${ref.dayKey}` ? `w${week}-${dayKey}` : p.id;
        return { ...p, id, marathonRef: { ...ref, dayKey }, updatedAt: now };
    });
}

export function fuelPlansOn(plans, week, key) {
    return (Array.isArray(plans) ? plans : []).filter(p => p?.marathonRef && Number(p.marathonRef.week) === Number(week) && p.marathonRef.dayKey === key);
}
