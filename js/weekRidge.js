/* ==========================================
   The week as a ridge (premium shell, step 4): My Plan's picture of the week.
   One peak per day, as tall as that day's planned run miles; a strength,
   cross-training or session day is a low step; a rest day is the baseline.
   The fill says where the day is: done (sage), today (sand), or still to come.

   Pure: no DOM reads, so it is unit tested (tests/weekRidge.test.mjs). The
   same grammar as the Today contour (js/workoutContour.js): a flat step per
   day with rounded shoulders between them.
========================================== */

const W = 700, H = 170, BASE = 156, TOP = 24, MAX_MILES = 12, SEG = W / 7;
const LOW = 0.9; // a non-run day's step, in miles' worth of height

const WORD = { run: "Run", strength: "Lift", cross: "Bike", session: "Session" };

// Planned run miles of a day: the plan's runs only (a logged run is what she did, not what was planned).
function plannedMilesOf(day) {
    return day.items
        .filter(item => item.kind === "run" && item.source?.type !== "log")
        .reduce((total, item) => total + (Number(item.miles) || 0), 0);
}

// The seven days, Monday first: { label, date, miles, level, kind, done, today, status }.
// kind: rest | run | strength | cross | session (the day's main kind; a mixed day shows its run).
export function ridgeDays(week) {
    return week.days.map(day => {
        const workouts = day.items.filter(item => item.source?.type !== "log");
        const miles = plannedMilesOf(day);
        const main = workouts.find(item => item.kind === "run") || workouts[0];
        const kind = !workouts.length ? "rest" : main.kind;
        const level = Math.min(MAX_MILES, miles > 0 ? miles : workouts.length ? LOW : 0);
        const status = day.status === "done" ? "done" : day.isToday ? "today" : "upcoming";
        return {
            label: new Date(`${day.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }),
            date: new Date(`${day.date}T12:00:00`).getDate(),
            miles: Math.round(miles * 10) / 10,
            level,
            kind,
            done: status === "done",
            today: Boolean(day.isToday),
            status,
        };
    });
}

const yOf = level => BASE - (level / MAX_MILES) * (BASE - TOP);

// The outline across the seven days: a flat run per day, a rounded shoulder where the height changes.
function outlineOf(days) {
    const ys = days.map(d => yOf(d.level));
    let d = `M0 ${ys[0].toFixed(1)}`;
    for (let i = 1; i < days.length; i++) {
        const x = i * SEG, a = ys[i - 1], b = ys[i];
        if (Math.abs(a - b) < 0.5) { d += ` L${x.toFixed(1)} ${b.toFixed(1)}`; continue; }
        const r = Math.min(16, SEG * 0.32);
        d += ` L${(x - r).toFixed(1)} ${a.toFixed(1)} C${x.toFixed(1)} ${a.toFixed(1)} ${x.toFixed(1)} ${b.toFixed(1)} ${(x + r).toFixed(1)} ${b.toFixed(1)}`;
    }
    d += ` L${W} ${ys[ys.length - 1].toFixed(1)}`;
    return d;
}

// "Thu 15: 6 mi run" for a screen reader, "Wed 14: rest" for a rest day.
const DESCRIBE = d => `${d.label} ${d.date}: ${d.kind === "rest" ? "rest" : `${d.miles ? `${d.miles} mi ` : ""}${WORD[d.kind].toLowerCase()}`}`;

// The ridge with its day labels under it: "Mon 12 / 4 mi". Ids are unique per page (`id`).
export function weekRidgeHtml(week, { id = "wr" } = {}) {
    const days = ridgeDays(week);
    const top = outlineOf(days);
    const status = d => (d.status === "done" ? "S" : d.status === "today" ? "T" : "U");
    const rects = days.map((d, i) => `<rect x="${(i * SEG).toFixed(1)}" y="0" width="${(SEG + 0.6).toFixed(1)}" height="${H}" fill="url(#${id}-${status(d)})"/>`).join("");
    const dots = days.map((d, i) => {
        if (d.kind === "rest") return "";
        const x = (i + 0.5) * SEG, y = yOf(d.level);
        const fill = d.done ? "#A0BB9C" : d.today ? "#ECD6B0" : "#0B1A14";
        const stroke = d.done ? "#0B1A14" : d.today ? "#0B1A14" : "#93A08F";
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>`;
    }).join("");
    const labels = days.map(d => {
        const sub = d.kind === "rest" ? "Rest" : d.miles ? `${d.miles} mi` : WORD[d.kind];
        return `<span class="${d.today ? "now" : ""}"><b>${d.label} ${d.date}</b><em>${sub}</em></span>`;
    }).join("");
    const label = `This week as a profile, one peak per day by planned miles. ${days.map(DESCRIBE).join(", ")}.`;
    return `<div class="ridge">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label.replace(/"/g, "&quot;")}">
            <defs>
                <linearGradient id="${id}-S" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(176,204,170,.55)"/><stop offset="1" stop-color="rgba(160,187,156,.04)"/></linearGradient>
                <linearGradient id="${id}-T" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(244,226,192,.7)"/><stop offset="1" stop-color="rgba(214,185,142,.06)"/></linearGradient>
                <linearGradient id="${id}-U" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(236,230,212,.2)"/><stop offset="1" stop-color="rgba(236,230,212,.02)"/></linearGradient>
                <clipPath id="${id}-clip"><path d="${top} L${W} ${BASE} L0 ${BASE} Z"/></clipPath>
            </defs>
            <line x1="0" x2="${W}" y1="${BASE}" y2="${BASE}" stroke="rgba(236,230,212,.16)"/>
            <g clip-path="url(#${id}-clip)">${rects}</g>
            <path d="${top}" fill="none" stroke="#F2EDE1" stroke-width="2.2" stroke-linejoin="round"/>
            ${dots}
        </svg>
        <div class="ridge-days">${labels}</div>
    </div>`;
}
