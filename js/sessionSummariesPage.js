/* ==========================================
   Southbound — session summaries (session-summaries.html)

   The player's own finished sessions with what the coach wrote, newest
   first (js/sessionSummaries.js). Read-only; the data is the player's own
   booking requests, so no rules change.
========================================== */

import { listenForAuth } from "./auth.js";
import { listMyBookingRequests } from "./scheduling.js";
import { summaries, kindLabel } from "./sessionSummaries.js";
import { reportHtml, hasReport } from "./sessionReport.js";
import { esc } from "./homeworkView.js";
import { friendlyError } from "./ui.js";

const $ = id => document.getElementById(id);
const today = new Date().toLocaleDateString("en-CA");
const dateLong = d => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

listenForAuth(async user => {
    if (!user) return;
    try {
        const list = summaries(await listMyBookingRequests(), today);
        $("smLoading").hidden = true;
        if (!list.length) { $("smEmpty").hidden = false; return; }
        $("smList").innerHTML = list.map((s, i) => `<div class="ssum-item">
            <div class="sb-kick tan">${esc(dateLong(s.date))} · ${esc(kindLabel(s))}</div>
            <div class="ssum-card">
                ${hasReport(s.log) ? `<div class="rep">${reportHtml(s.log, list.slice(i + 1).map(x => x.log))}</div>` : ""}
                ${s.workedOn ? `<p><b>Worked on</b><br>${esc(s.workedOn)}</p>` : ""}
                ${s.nextTime ? `<p><b class="ssum-next">Next time</b><br>${esc(s.nextTime)}</p>` : ""}
            </div></div>`).join("");
        $("smList").hidden = false;
    } catch (error) {
        console.warn("Southbound: couldn't load session summaries.", error);
        $("smLoading").hidden = true;
        $("smError").hidden = false;
        $("smError").innerHTML = `<p>${esc(friendlyError(error, "open your summaries"))}</p><button type="button" class="clients-btn-primary" onclick="location.reload()">Try again</button>`;
    }
});
