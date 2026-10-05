/* ==========================================
   Southbound — Training load this week (Weekly Review)

   The athlete model's load for the current Monday–Sunday week, one row a
   day: each run's blended load (pace, heart rate and your effort on one
   scale, js/sessionDose.js), the week so far against your usual week
   (the median of the 4 before), effort load (minutes × effort 1–10), the
   easy / steady / hard mix, last week's monotony and strain against your
   usual, how runs felt for what they were (js/trainingResponse.js), and
   COROS's own Base Fitness / Load Impact next to ours. Runs of the week
   with no effort yet can be rated right here (js/effortCard.js).
   Coach only (Weekly Review is a coach page).
========================================== */

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayName = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const short = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const whole = n => Math.round(n).toLocaleString("en-US");
// (A run's load is rounded the way the day's total is, one decimal first, so a one-run day matches.)
const SOURCE_WORDS = { blend: "pace, heart rate and effort", pace: "pace", hr: "heart rate", effort: "your effort", miles: "miles only (easy)" };

/** "pace + heart rate + effort" from a dose's parts. */
function partsWords(d) {
    const names = { pace: "pace", hr: "heart rate", effort: "effort" };
    const keys = Object.keys(d.parts || {});
    return keys.length > 1 ? keys.map(k => `${names[k]} ${d.parts[k].weight}%`).join(" · ") : SOURCE_WORDS[d.source] || "";
}

function monotonyWords(m) {
    if (m == null) return "";
    if (m > 2) return "every day carried about the same load: little contrast between easy and hard days";
    if (m > 1.5) return "some contrast between easy and hard days";
    return "a clear mix of easy and hard days";
}

/** Everything the section shows, worked out on this device. */
async function compute(today) {
    const [{ loadModelInputs, loadLaps }, { sessionDoses }, ls, tr] = await Promise.all([
        import("./athleteData.js"), import("./sessionDose.js"), import("./loadState.js"), import("./trainingResponse.js")
    ]);
    const inputs = await loadModelInputs(today);
    const dr = sessionDoses(inputs.sessions, today, { laps: loadLaps(), health: inputs.health, fitness: inputs.fitness });
    const state = ls.loadState(dr.doses, today);
    const totals = ls.loadTotals(dr.doses, today);
    const coros = ls.corosComparison(state.series, inputs.fitness);
    const monday = totals.days[0].date;
    const rows = tr.effortResponse(inputs.sessions, dr.doses, today).rows.filter(r => r.date >= monday);
    const feel = rows.length ? { n: rows.length, mean: Math.round(rows.reduce((t, r) => t + r.residual, 0) / rows.length * 10) / 10 } : null;
    return { totals, coros, feel, today };
}

function render(el, { totals, coros, feel, today }) {
    // (today: a day with no run yet says so instead of "Rest")
    const w = totals.thisWeek;
    const usual = totals.usualWeek;
    const lastWeek = totals.weeks.at(-2);
    const daysIn = totals.days.filter(d => !d.future).length;
    const pct = usual?.load ? Math.round(w.load / usual.load * 100) : null;
    const mix = w.load ? ["easy", "threshold", "hard"].map(k => Math.round(w.domains[k] / w.load * 100)) : null;
    const dayRows = totals.days.map(d => `
        <li class="wl-day${d.future ? " is-future" : ""}${d.runs ? "" : " is-rest"}">
            <span class="wl-date">${esc(dayName(d.date))}</span>
            <span class="wl-runs">${d.future ? "" : d.runs ? d.list.map(r => `<span class="wl-run"><strong>${r.miles.toFixed(1)} mi</strong> · load ${Math.round(Math.round(r.dose * 10) / 10)} · ${r.rpe != null ? `effort ${r.rpe}/10` : `<em>not rated</em>`}<small>${esc(partsWords(r))}</small></span>`).join("") : d.date === today ? "Nothing yet today" : "Rest"}</span>
            <span class="wl-load">${d.future ? "" : d.runs ? Math.round(d.load) : "—"}</span>
        </li>`).join("");
    el.hidden = false;
    el.querySelector(".wl-body").innerHTML = `
        <div class="wl-stats">
            <div class="wl-stat"><span>Load so far</span><strong>${whole(w.load)}</strong><small>${pct == null ? `${daysIn} of 7 days in` : `${pct}% of your usual week (${whole(usual.load)}), ${daysIn} of 7 days in`}</small></div>
            <div class="wl-stat"><span>Effort load</span><strong>${whole(w.effortLoad)}</strong><small>minutes × effort · ${w.rated} of ${w.runs} ${w.runs === 1 ? "run" : "runs"} rated${usual?.effortLoad ? ` · usual ${whole(usual.effortLoad)}` : ""}</small></div>
            <div class="wl-stat"><span>Miles</span><strong>${w.miles}</strong><small>${usual ? `usual ${usual.miles}` : "this week"}</small></div>
        </div>
        <ul class="wl-days">${dayRows}</ul>
        <ul class="wl-notes">
            ${mix ? `<li>Mix this week: <strong>${mix[0]}% easy</strong> · ${mix[1]}% steady / threshold · ${mix[2]}% hard.</li>` : ""}
            ${feel ? `<li>${feel.mean >= 1 ? `Runs this week felt <strong>${feel.mean} harder than usual</strong> for what they were (${feel.n} rated).` : feel.mean <= -1 ? `Runs this week felt <strong>${Math.abs(feel.mean)} easier than usual</strong> for what they were (${feel.n} rated).` : `Runs this week felt about as hard as usual for what they were (${feel.n} rated).`}</li>` : ""}
            ${lastWeek?.monotony != null ? `<li>Last week: monotony <strong>${lastWeek.monotony}</strong> (${esc(monotonyWords(lastWeek.monotony))}), strain <strong>${whole(lastWeek.strain)}</strong>${totals.strainUsual ? ` against your usual ${whole(totals.strainUsual)}${lastWeek.strain > totals.strainUsual * 1.3 ? ": well above it" : ""}` : ""}.</li>` : ""}
            ${coros ? `<li>COROS on ${esc(short(coros.latest.date))}: Base Fitness <strong>${coros.latest.coros.base ?? "—"}</strong>, Load Impact <strong>${coros.latest.coros.impact ?? "—"}</strong>. Ours: base ${coros.latest.ours.base}, recent ${coros.latest.ours.recent}${coros.rBase != null ? ` (they move together: r ${coros.rBase} for base, ${coros.rRecent ?? "–"} for recent, over ${coros.n} days)` : ""}. Different scales; it's the direction that compares.</li>` : ""}
        </ul>`;
}

/**
 * Draws the section into `el`, and again (numbers only) whenever an effort
 * is answered or new runs arrive. The "How hard was it?" list below the
 * numbers is mounted once and keeps itself up to date, so a redraw never
 * empties it.
 */
export function mountWeeklyLoad(el) {
    if (!el) return;
    const today = isoToday();
    el.innerHTML = `
        <h2 class="wr-section-title">Training Load This Week</h2>
        <div class="wl-body"></div>
        <div id="wlEffort" class="sb-effort" hidden></div>
        <p class="wl-foot">Each run's load blends its pace, heart rate and your effort on one scale (never added up). Effort load is minutes × your 1–10. More in <a href="analytics.html#loadPanel">Analytics → Load and response</a>.</p>`;
    // Runs of this week (Monday on) with no effort yet: rate them here.
    const monday = new Date(`${today}T12:00:00`);
    const sinceMonday = (monday.getDay() + 6) % 7;
    import("./effortCard.js").then(m => m.mountEffortCard(el.querySelector("#wlEffort"), { days: sinceMonday + 1, max: 7 }))
        .catch(error => console.error("Southbound: effort card failed to load.", error));
    let running = false, again = false;
    const draw = async () => {
        if (running) { again = true; return; }
        running = true;
        try {
            const data = await compute(isoToday());
            if (data.totals.weeks.some(w => w.runs)) render(el, data);
            else if (el.querySelector("#wlEffort").hidden) el.hidden = true;
        } catch (error) {
            console.error("Southbound: training load this week couldn't be worked out.", error);
        } finally {
            running = false;
            if (again) { again = false; draw(); }
        }
    };
    let timer = null;
    const soon = () => { clearTimeout(timer); timer = setTimeout(draw, 400); };
    for (const name of ["sb:athlete-answers", "sb:strava-updated", "eddieos:coros-history-updated"]) window.addEventListener(name, soon);
    // Let the rest of the page draw first; this is the heaviest part of it.
    setTimeout(draw, 50);
}

