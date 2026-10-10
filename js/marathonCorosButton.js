/* ==========================================
   Southbound — Send to COROS for the coach's own marathon plan

   One "Send to COROS" button (Today and the Marathon page, coach only):
   today's run, the next 7 days, or the rest of the plan go onto the
   coach's own COROS schedule, which the watch syncs. Days come from
   js/marathonData.js (with his edits), are turned into structured COROS
   workouts by js/marathonCoros.js, and are sent / updated / remembered
   by js/corosSend.js exactly like a client's plan ("marathon|date" keys
   in "coros-sent"). COROS takes dates from today to 90 days out.
========================================== */

import { WEEKS, PACES, DAYS, weekStart, getAdjustedWeekDays } from "./marathonData.js";
import { marathonCourse, marathonPreview } from "./marathonCoros.js";
import { sendToCoros, sendState, sendSummary, isCorosConnected, loadSent } from "./corosSend.js";
import { sendableDate } from "./corosWorkout.js";
import { toast, sbChoose, sbAlert, friendlyError } from "./ui.js";
import { icon } from "./icons.js";

const pad = n => String(n).padStart(2, "0");
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Every plan day from `from` on (sendable or already sent), as send entries.
export function marathonEntries(from) {
    const out = [];
    const sent = loadSent();
    WEEKS.forEach((_, wi) => {
        const days = getAdjustedWeekDays(wi + 1);
        days.forEach((day, di) => {
            const d = new Date(weekStart(wi + 1));
            d.setDate(d.getDate() + di);
            const date = isoDate(d);
            if (date < from || !sendableDate(date, from)) return;
            const key = `marathon|${date}`;
            const course = marathonCourse(day, PACES);
            if (course || sent[key]) out.push({ key, date, course, day: DAYS[di] });
        });
    });
    return out;
}

function statusLine(entries, today) {
    const todays = entries.find(e => e.date === today);
    const st = todays ? sendState(todays) : "empty";
    if (st === "sent") return `${icon("checkCircle")} Today's run is on your COROS schedule.`;
    if (st === "changed") return "Today's run changed since you sent it. Send again to update it on COROS.";
    const sent = loadSent();
    const upcoming = entries.filter(e => e.course && sent[e.key]).length;
    return upcoming ? `${upcoming} upcoming ${upcoming === 1 ? "run is" : "runs are"} on your COROS schedule.` : "Send your runs to your watch.";
}

export function mountMarathonCoros(el) {
    if (!el) return;
    const render = () => {
        const today = isoDate(new Date());
        const entries = marathonEntries(today);
        if (!entries.some(e => e.course)) { el.hidden = true; return; }
        el.hidden = false;
        el.innerHTML = `
            <p class="sb-coros-bar-text">${statusLine(entries, today)}</p>
            <button type="button" class="sb-btn sb-btn-secondary sb-coros-bar-btn">${icon("send")} Send to COROS</button>`;
        el.querySelector("button").addEventListener("click", event => send(event.currentTarget, render));
    };
    render();
}

async function send(btn, render) {
    if (!isCorosConnected()) {
        await sbAlert("Connect your COROS account first: Progress → Analytics → Connect COROS (or Settings → Connections). Then come back and tap Send to COROS.", { title: "Connect COROS" });
        return;
    }
    const today = isoDate(new Date());
    const entries = marathonEntries(today);
    const runs = list => list.filter(e => e.course).length;
    const todays = entries.filter(e => e.date === today);
    const week = entries.filter(e => e.date <= isoDate(new Date(Date.now() + 6 * 86400000)));
    const choices = [];
    if (runs(todays)) choices.push({ value: "today", label: "Today's run" });
    if (runs(week) > runs(todays)) choices.push({ value: "week", label: `Next 7 days (${runs(week)} runs)`, primary: true });
    if (runs(entries) > runs(week)) choices.push({ value: "plan", label: `Rest of the plan (${runs(entries)} runs)` });
    if (!choices.some(c => c.primary) && choices.length) choices[choices.length - 1].primary = true;
    const choice = await sbChoose("Your runs go onto your COROS training schedule as structured workouts (warm-up, reps at your plan's paces, cool-down). Your watch picks them up when it syncs. Runs you already sent are only sent again if you changed them.", { title: "Send to COROS", choices });
    if (!choice) return;
    const pick = choice === "today" ? todays : choice === "week" ? week : entries;

    btn.disabled = true;
    const label = btn.innerHTML;
    const todo = pick.filter(e => e.course && sendState(e) !== "sent").length;
    btn.textContent = todo ? `Sending ${todo} ${todo === 1 ? "run" : "runs"} to COROS…` : "Checking COROS…";
    try {
        const r = await sendToCoros(pick, { today });
        const summary = sendSummary(r);
        if (r.notes.length) await sbAlert([summary, ...r.notes].filter(Boolean).join("\n\n"), { title: "COROS" });
        else toast(summary || "Nothing new to send.");
    } catch (error) {
        toast(friendlyError(error, "send that to COROS"), { type: "error" });
    } finally {
        btn.disabled = false;
        btn.innerHTML = label;
        render();
        window.dispatchEvent(new CustomEvent("sb:coros-sent"));
    }
}

// ---------- What the watch will get, under each day on the Marathon page ----------

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function previewHtml(day, date, today) {
    const p = marathonPreview(day, PACES);
    if (!p) return "";
    const entry = { key: `marathon|${date}`, date, course: marathonCourse(day, PACES) };
    const st = date >= today ? sendState(entry) : "empty";
    const status = st === "sent" ? `<span class="mp-coros-status is-sent">${icon("checkCircle")} On COROS</span>`
        : st === "changed" ? `<span class="mp-coros-status is-changed">Changed since sent: send again</span>` : "";
    const warn = [
        ...p.unread.map(u => `Couldn't read “${esc(u)}”, so it's left out. Try e.g. “6x800 @ 2:55, 400m jog”.`),
        ...p.notes.map(esc)
    ];
    return `<div class="mp-coros-preview${warn.length ? " has-warning" : ""}">
        <span class="mp-coros-preview-icon" title="What your COROS watch gets">${icon("watch")}</span>
        <div class="mp-coros-preview-body">
            <div class="mp-coros-steps">${p.steps.map(esc).join(`<span class="mp-coros-arrow"> → </span>`)}${status}</div>
            ${warn.map(w => `<div class="mp-coros-warn">${icon("alertTriangle")} ${w}</div>`).join("")}
        </div>
    </div>`;
}

// Fill a preview line under each day row whenever the page redraws the week.
export function watchMarathonPreviews(detail) {
    if (!detail) return;
    const fill = () => {
        const week = Number(detail.dataset.week);
        if (!week || !WEEKS[week - 1]) return;
        const today = isoDate(new Date());
        const days = getAdjustedWeekDays(week);
        detail.querySelectorAll(".mp-day-row[data-day]").forEach(row => {
            const i = DAYS.indexOf(row.dataset.day);
            if (i < 0 || row.nextElementSibling?.classList.contains("mp-coros-preview")) return;
            const d = new Date(weekStart(week));
            d.setDate(d.getDate() + i);
            const html = previewHtml(days[i], isoDate(d), today);
            if (html) row.insertAdjacentHTML("afterend", html);
        });
    };
    new MutationObserver(fill).observe(detail, { childList: true });
    // After a send, the "On COROS" marks change: draw the previews again.
    window.addEventListener("sb:coros-sent", () => {
        detail.querySelectorAll(".mp-coros-preview").forEach(el => el.remove());
        fill();
    });
    fill();
}
