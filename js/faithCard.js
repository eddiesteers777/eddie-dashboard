/* ==========================================
   Southbound — the Faith block on the Habits page (#habitsFaith)

   Two rows, Prayer and Bible, each opening its own page (prayer.html, bible.html), plus quick links to edit the
   prayer map and the reading plan. Only shows for someone who has the Prayer or Bible habit.
========================================== */

import * as R from "./prayerRequests.js";
import * as P from "./prayerModel.js";
import * as B from "./biblePlan.js";
import { esc, read, today, prayerHabit, bibleHabit } from "./faithStore.js";

const el = document.getElementById("habitsFaith");

function draw() {
    if (!el) return;
    const hasP = Boolean(prayerHabit()), hasB = Boolean(bibleHabit());
    if (!hasP && !hasB) { el.hidden = true; el.innerHTML = ""; return; }
    const t = today();
    const open = R.openRequests(R.loadAll(localStorage)).length;
    const p = P.progress(P.cleanList(read(P.PRAYER_LIST_KEY, null)), read(P.PRAYER_CHECKS_KEY, {}), t);
    const plan = B.cleanPlan(read(B.BIBLE_PLAN_KEY, null));
    const day = plan ? B.dayFor(plan, t) : 0;
    const prayerLine = `${open} open request${open === 1 ? "" : "s"}${p.total ? ` · ${p.done} of ${p.total} today` : ""}`;
    const bibleLine = plan ? `Day ${day + 1} · ${B.chaptersOn(plan, day).join(", ")}` : "No reading plan yet";
    el.hidden = false;
    el.innerHTML = `<h2 class="fc-h">Faith</h2>
        ${hasP ? `<a class="fc-row" href="prayer.html"><span class="fc-ico" aria-hidden="true">🕯</span><span class="fc-t"><strong>Prayer</strong><span>${esc(prayerLine)}</span></span><span class="fc-go">Open</span></a>` : ""}
        ${hasB ? `<a class="fc-row" href="bible.html"><span class="fc-ico" aria-hidden="true">📖</span><span class="fc-t"><strong>Bible</strong><span>${esc(bibleLine)}</span></span><span class="fc-go">Open</span></a>` : ""}
        <div class="fc-edit">${hasP ? `<button type="button" class="fc-link" data-edit="prayer">Edit prayer map</button>` : ""}${hasB ? `<button type="button" class="fc-link" data-edit="bible">Change reading plan</button>` : ""}</div>`;
}

el?.addEventListener("click", async e => {
    const b = e.target.closest("[data-edit]");
    if (!b) return;
    const m = await import("./faithSheets.js");
    await (b.dataset.edit === "prayer" ? m.openPrayerSheet : m.openBibleSheet)({ habit: b.dataset.edit === "prayer" ? prayerHabit() : bibleHabit(), onChange: draw });
    draw(); window.dispatchEvent(new CustomEvent("sb:habits-changed"));
});
for (const ev of ["pageshow", "sb:habits-changed", "focus"]) window.addEventListener(ev, draw);
draw();
