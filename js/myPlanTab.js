/* ==========================================
   Southbound — "My plan" tab on the Running page (coach only)

   Eddie's own marathon plan, built by the same engine as a client's
   (js/marathonEngine.js) and kept on his own account (js/ownPlan.js).
   Nothing here reaches a client.
========================================== */

import { loadOwn, saveOwn, removeOwn, corosPrefill, prefillNote, applyPrefill, doneDates, whereInPlan, weekBars, weekMiles } from "./ownPlan.js";
import { marathonSetup } from "./marathonSetup.js";
import { marathonSettingsFromProfile, isoToday, clockText } from "./marathonProfile.js";
import { sbConfirm, toast } from "./ui.js";

const root = document.getElementById("myPlanRoot");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };
const nice = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const TYPE = { rest: "Rest", easy: "Easy", recovery: "Recovery", long: "Long run", workout: "Workout", race: "Race day", strength: "Strength", cross: "Cross" };

let record = null;

async function prefill(today) {
    try {
        const { loadLedger } = await import("./athleteData.js");
        const ledger = await loadLedger(today, { plan: false });
        return corosPrefill(ledger, today);
    } catch { return { runs: 0 }; }
}

async function profileRecord() {
    try { return await (await import("./userProfile.js")).getMyProfile(); } catch { return null; }
}

async function openSetup() {
    const today = isoToday();
    const pre = await prefill(today);
    const plan = record?.generatedPlan?.generator?.settings?.engine === "marathon" ? record.generatedPlan : null;
    const base = plan ? null : applyPrefill({ ...marathonSettingsFromProfile(await profileRecord(), today), strengthDays: 0 }, pre);
    marathonSetup({
        me: true, record: null, plan, settings: base, done: plan ? doneDates(plan) : new Set(),
        note: prefillNote(pre, clockText),
        onCreate: async ({ plan: made }) => { record = await saveOwn({ plan: made }); toast("Your plan is saved.", { type: "success" }); render(); },
        onApply: async ({ plan: next, message }) => { record = await saveOwn({ plan: next }); toast(message || "Your plan is updated.", { type: "success" }); render(); }
    });
}

function chart(bars, index) {
    const max = Math.max(1, ...bars.map(b => b.miles));
    return `<div class="mp-chart" role="img" aria-label="Miles each week, ${bars.length} weeks">${bars.map((b, i) =>
        `<i class="${b.down ? "is-down " : ""}${b.race ? "is-race " : ""}${i === index ? "is-now" : ""}" style="height:${Math.max(6, Math.round(b.miles / max * 100))}%"></i>`).join("")}</div>`;
}

function dayRow(d, today) {
    const run = d.type !== "rest";
    const dow = DAY[d.day] || d.day || "";
    return `<li class="mp-day${d.date === today ? " is-today" : ""}${d.completed ? " is-done" : ""}">
        <b>${esc(dow)}</b><span>${nice(d.date)}</span>
        <div><strong>${esc(TYPE[d.type] || d.type)}${run && d.miles ? ` · ${esc(d.miles)} mi` : ""}</strong>${d.session ? `<em>${esc(d.session)}</em>` : ""}</div>
        ${d.completed ? '<i class="mp-tick" aria-label="Done">Done</i>' : ""}</li>`;
}

function render() {
    if (!root) return;
    const today = isoToday();
    const plan = record?.generatedPlan;
    const at = whereInPlan(plan, today);
    if (!plan || at.state === "none") {
        root.innerHTML = `<section class="mp-card mp-empty"><div class="mp-ghost" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="height:${26 + (i % 4 === 3 ? -8 : i * 3)}%"></i>`).join("")}</div>
            <h2>No plan for you yet</h2>
            <p>Build your own marathon plan the same way you build a client's. Your COROS runs fill in where you are now.</p>
            <button type="button" class="sb-btn sb-btn-primary" data-act="build">Build my marathon plan</button>
            <p class="mp-fine">Saved on your account. Nothing goes to a client.</p></section>`;
        return;
    }
    const bars = weekBars(plan);
    const wk = at.week;
    const label = at.state === "before" ? `Starts ${nice(at.startsOn)}` : at.state === "after" ? "Plan finished" : `Week ${at.index + 1} of ${at.total}`;
    const peak = Math.max(...bars.map(b => b.miles));
    const race = at.raceDate ? `Race ${nice(at.raceDate)}` : "";
    const todayDay = at.state === "in" ? at.today : null;
    root.innerHTML = `
        <section class="mp-card">
            <div class="mp-head"><div><span class="mp-kick">${esc(label)}${wk.phase ? ` · ${esc(wk.phase)}` : ""}</span><h2>${weekMiles(wk)} miles this week</h2></div>
            <p class="mp-meta">${esc(race)}${race ? " · " : ""}Peak ${Math.round(peak)} mi</p></div>
            ${chart(bars, at.index)}
            ${todayDay && todayDay.type !== "rest" ? `<div class="mp-today"><span class="mp-kick">Today</span><strong>${esc(TYPE[todayDay.type] || todayDay.type)}${todayDay.miles ? ` · ${esc(todayDay.miles)} mi` : ""}</strong>${todayDay.session ? `<p>${esc(todayDay.session)}</p>` : ""}</div>` : todayDay ? `<div class="mp-today"><span class="mp-kick">Today</span><strong>Rest day</strong></div>` : ""}
            <ul class="mp-days">${(wk.days || []).map(d => dayRow(d, today)).join("")}</ul>
            <div class="mp-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-act="edit">Edit setup</button>
                <button type="button" class="sb-btn sb-btn-secondary" data-act="weeks">See all weeks</button>
                <button type="button" class="sb-btn sb-btn-tertiary" data-act="remove">Remove plan</button>
            </div>
            <p class="mp-fine">Saved on your account. Nothing goes to a client. Days you edit by hand stay as you set them.</p>
        </section>
        <section class="mp-card mp-weeks" id="mpWeeks" hidden>
            <h3>All weeks</h3>
            <ol>${plan.weeks.map((w, i) => `<li${i === at.index && at.state === "in" ? ' class="is-now"' : ""}><b>${i + 1}</b><span>${nice(w.startDate)}</span><em>${esc(w.phase || "")}${w.cutback ? " · down week" : ""}</em><strong>${weekMiles(w)} mi</strong></li>`).join("")}</ol>
        </section>`;
}

root?.addEventListener("click", async ev => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "build" || act === "edit") return openSetup();
    if (act === "weeks") { const w = root.querySelector("#mpWeeks"); if (w) { w.hidden = !w.hidden; if (!w.hidden) w.scrollIntoView({ block: "nearest", behavior: "smooth" }); } return; }
    if (act === "remove") {
        if (!await sbConfirm("Remove your marathon plan from the calendar? Days you ticked done stay in your run history.", { title: "Remove my plan?", confirmLabel: "Remove plan", danger: true })) return;
        await removeOwn(); record = null; render();
    }
});

(async () => { record = await loadOwn(); render(); })();
window.addEventListener("storage", async () => { record = await loadOwn(); render(); });
