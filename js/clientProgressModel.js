/* ==========================================
   Southbound — client progress presentation model

   Pure formatting / view-model helpers for the client home.
   No Firestore, DOM, or browser-only dependencies.
========================================== */

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function formatMiles(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return (Math.round(n * 10) / 10).toString();
}

export function buildClientProgressModel(progress = {}) {
    const activity = progress.activity || {};
    const trend = progress.trend || {};
    const training = progress.trainingTrends || {};
    const weeks = Array.isArray(training.weeks) ? training.weeks.slice(-6) : [];

    return {
        completedWorkouts: Number(activity.completedWorkouts) || 0,
        runMiles: Number(activity.runMiles) || 0,
        recent14Miles: Number(trend.recentMiles) || 0,
        prior14Miles: Number(trend.priorMiles) || 0,
        milesChangePct: Number.isFinite(Number(trend.milesChangePct)) ? Number(trend.milesChangePct) : null,
        weeks: weeks.map(week => ({
            start: String(week.start || ""),
            runMiles: Number(week.runMiles) || 0,
            completedWorkouts: Number(week.completedWorkouts) || 0,
            skippedWorkouts: Number(week.skippedWorkouts) || 0
        })),
        hasData: Boolean(progress.hasActivity || activity.completedWorkouts || activity.runMiles)
    };
}

function weekLabel(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function renderClientProgress(body, progress) {
    if (!body) return;
    const model = buildClientProgressModel(progress);

    if (!model.hasData) {
        body.innerHTML = `
            <div class="eos-progress-empty">
                <strong>Your progress will build here</strong>
                <span>Complete a planned workout and Southbound will keep a simple six-week history for you.</span>
                <a href="plan.html">Open My Plan →</a>
            </div>`;
        return;
    }

    const comparison = model.milesChangePct == null
        ? "Not enough earlier running data for a 14-day comparison yet."
        : `${Math.abs(model.milesChangePct)}% ${model.milesChangePct >= 0 ? "more" : "less"} run miles than the previous 14 days.`;

    const weekRows = model.weeks.map(week => `
        <div class="eos-progress-week">
            <span>${esc(weekLabel(week.start))}</span>
            <strong>${formatMiles(week.runMiles)} mi</strong>
            <small>${week.completedWorkouts} workout${week.completedWorkouts === 1 ? "" : "s"}${week.skippedWorkouts ? ` · ${week.skippedWorkouts} skipped` : ""}</small>
        </div>`).join("");

    body.innerHTML = `
        <div class="eos-progress-summary">
            <div>
                <strong>${model.completedWorkouts}</strong>
                <span>completed workouts · 28 days</span>
            </div>
            ${model.runMiles > 0 ? `
                <div>
                    <strong>${formatMiles(model.runMiles)} mi</strong>
                    <span>run miles · 28 days</span>
                </div>` : ""}
        </div>
        <p class="eos-progress-comparison">${esc(comparison)}</p>
        <div class="eos-progress-weeks" aria-label="Six-week training history">${weekRows}</div>
        <div class="eos-progress-footer">
            <span>Tracked from workouts you log in Southbound.</span>
            <a href="plan.html">Open My Plan →</a>
        </div>`;
}
