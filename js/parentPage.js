/* ==========================================
   Southbound — the parent page (parent.html?t=<token>)

   Opens with no sign-in. Shows one snapshot a coach shared
   (js/parentLink.js): first name, the last session summary and open homework.
   Read-only. Missing or switched off: "This link isn't active."
========================================== */

import { readParentLink, homeworkLines } from "./parentLink.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dateLong = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
const when = t => { const ms = t?.toMillis ? t.toMillis() : 0; return ms ? new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : ""; };

function gone() { $("prLoading").hidden = true; $("prGone").hidden = false; }

(async () => {
    try {
        const link = await readParentLink(new URLSearchParams(location.search).get("t"));
        if (!link) return gone();
        document.title = `${link.firstName}'s soccer update | Southbound Coaching`;
        $("prTitle").textContent = `${link.firstName}'s soccer update`;
        $("prSub").textContent = `From ${link.coachFirst}${when(link.updatedAt) ? ` · updated ${when(link.updatedAt)}` : ""}`;
        const last = link.last;
        if (last && (last.workedOn || last.focus || last.nextTime)) {
            $("prLast").innerHTML = `<div class="pr-kick">Last session${dateLong(last.date) ? ` · ${esc(dateLong(last.date))}` : ""}</div>
                ${last.focus ? `<h2 class="pr-focus">${esc(last.focus)}</h2>` : ""}
                ${last.workedOn ? `<p>${esc(last.workedOn)}</p>` : ""}
                ${last.nextTime ? `<div class="pr-kick pr-sage">Next time</div><p>${esc(last.nextTime)}</p>` : ""}`;
            $("prLast").hidden = false;
        }
        const hw = homeworkLines(link);
        if (hw.length) {
            $("prHwList").innerHTML = hw.map(h => `<div class="pr-row"><b>${esc(h.title)}</b><span class="pr-kick pr-sage">${esc(h.label)}</span></div>`).join("");
            $("prHw").hidden = false;
        }
        $("prLoading").hidden = true;
        $("prBody").hidden = false;
    } catch (error) {
        console.warn("Southbound: couldn't open the parent page.", error?.code || error);
        gone();
    }
})();
