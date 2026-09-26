/* ==========================================
   Southbound — one check-in's details (shared view)

   The week it was about (the snapshot their app saved), the wellbeing
   answers with anything low highlighted, pain, what went well, what to
   change and any other notes. Used by the client's history and the
   coach's review queue (checkin.html) and the Client Hub's Check-ins tab.
========================================== */

import { snapshotLines, WELLBEING } from "./feedbackModel.js";
import { icon } from "./icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function checkinDetailsHtml(c) {
    const lines = snapshotLines(c.week);
    const scores = WELLBEING.filter(w => Number(c[w.key]));
    const said = [
        ["What went well", c.wentWell],
        ["What to change", c.change],
        ["Anything else", c.notes]
    ].filter(([, text]) => text);
    return `
        ${lines.length ? `<ul class="ck-week">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
        ${scores.length ? `<div class="ck-scores">${scores.map(w => `<span class="ck-score${Number(c[w.key]) <= 2 ? " is-low" : ""}">${esc(w.label)} <b>${c[w.key]}/5</b></span>`).join("")}</div>` : ""}
        ${c.pain ? `<p class="ck-pain">${icon("alertTriangle")} Pain or discomfort${c.painNote ? `: ${esc(c.painNote)}` : ""}</p>` : ""}
        ${said.map(([label, text]) => `<div class="ck-said"><span>${esc(label)}</span><p>${esc(text)}</p></div>`).join("")}`;
}
