/* ==========================================
   Southbound — client home progress

   Loads the existing workout-results source for a signed-in client,
   then hands presentation to the pure clientProgressModel module.
========================================== */

import { waitForUser } from "./auth.js";
import { listMyResults } from "./workoutResults.js";
import { summarizeProgress, isoDate } from "./clientSummary.js";
import { renderClientProgress } from "./clientProgressModel.js";

export async function initClientProgress() {
    const section = document.getElementById("clientProgressSection");
    const body = document.getElementById("clientProgressBody");
    if (!section || !body) return;

    try {
        const user = await waitForUser();
        if (!user) {
            section.hidden = true;
            return;
        }

        section.hidden = false;
        body.innerHTML = `<div class="sb-loading" role="status"><span class="sr-only">Loading progress…</span><span class="sb-skeleton" style="width:78%"></span><span class="sb-skeleton" style="width:58%"></span><span class="sb-skeleton" style="width:86%"></span></div>`;

        const results = await listMyResults();
        const progress = summarizeProgress({ results, today: isoDate(new Date()) });
        renderClientProgress(body, progress);
    } catch (error) {
        console.warn("Southbound: couldn't load client progress.", error);
        section.hidden = false;
        body.innerHTML = `
            <div class="eos-progress-empty">
                <strong>Progress is unavailable right now</strong>
                <span>Try again after your connection is back.</span>
            </div>`;
    }
}
