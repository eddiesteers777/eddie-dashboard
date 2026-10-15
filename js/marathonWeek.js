/* ==========================================
   The coach's marathon week, as a week the Today trail can draw (premium shell).
   The marathon plan (js/marathonData.js) keeps a week as seven days with a run
   each and a separate "done" record (training-progress); the trail
   (js/weekTrail.js) draws the shape js/weekModel.js gives a client. This turns
   one into the other: a day with miles is one run item; a day without is rest.
   Pure: no DOM, no storage, so it is unit tested (tests/marathonWeek.test.mjs).
========================================== */

const pad = n => String(n).padStart(2, "0");
const round1 = n => Math.round(n * 10) / 10;

export const isoOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// week: the plan's week number; monday: that week's Monday (a Date); days: the plan's seven days
// ({ session, miles, pace }); keys: the day names ("Mon"...); progress: { [week]: { Mon: true } };
// today: "YYYY-MM-DD". titleOf(day) names the run; workoutOf(day) gives its steps (or null).
export function marathonWeekModel({ week, monday, days, keys, progress = {}, today, titleOf = d => d.session || "Run", workoutOf = () => null }) {
    const out = days.map((day, i) => {
        const date = new Date(monday);
        date.setDate(date.getDate() + i);
        const iso = isoOf(date);
        const miles = Number(day.miles) || 0;
        const done = Boolean(progress?.[week]?.[keys[i]]);
        const items = miles > 0 ? [{
            id: `m-${week}-${keys[i]}`,
            kind: "run",
            title: titleOf(day),
            miles,
            done,
            source: { type: "marathon" },
            week,
            dayKey: keys[i],
            workout: workoutOf(day)
        }] : [];
        const status = !items.length ? "rest" : done ? "done" : iso < today ? "missed" : iso === today ? "today" : "upcoming";
        return { date: iso, isToday: iso === today, items, status };
    });
    const runs = out.flatMap(d => d.items);
    return {
        monday: out[0]?.date || "",
        days: out,
        summary: {
            planned: runs.length,
            done: runs.filter(r => r.done).length,
            missed: out.filter(d => d.status === "missed").length,
            miles: round1(runs.reduce((t, r) => t + r.miles, 0)),
            milesDone: round1(runs.filter(r => r.done).reduce((t, r) => t + r.miles, 0)),
            loggedMiles: 0,
            strength: { planned: 0, done: 0 },
            sessions: 0
        }
    };
}
