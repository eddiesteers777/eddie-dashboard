/* ==========================================
   Southbound — "Recovery" side of Build my plan (Running > My plan)

   recoverySetup({ plan, onCreate, onApply, onRace })
     onCreate({ plan, name }) / onApply({ plan, name }): the caller saves it
     (js/ownPlan.js saveOwn). onRace(): the "Race plan" side of the switch.
   The rules live in js/recoveryPlan.js; nothing here is saved by itself.
========================================== */

import { recoveryPlan, cleanSettings, mondayOf } from "./recoveryPlan.js";
import { mergeRuntimeByDate } from "./coachingPlanModel.js";
import { sbConfirm, toast } from "./ui.js";
import { icon } from "./icons.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const longDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

const RULES = [
    ["Week 1", "Walking and easy bike or swim. No running."],
    ["Weeks 2 to 4", "Easy runs only. The miles stay the same, they don't build."],
    ["Strength", "Back in week 2, very light: 1 set, then 2 sets, then 2 sessions in week 4."]
];

function panelHtml(made, weeks, max) {
    return `<section class="ms-panel">
                <h3>${esc(made.name || "Post Marathon Recovery")}</h3>
                ${weeks.length ? `<div class="ms-chart" role="img" aria-label="Miles each week">${weeks.map(w => `<span class="ms-bar ms-b${w.week === 1 ? 0 : 2}" style="height:${Math.max(4, Math.round(w.plannedMiles / max * 100))}%" title="Week ${w.week}: ${w.plannedMiles} mi"></span>`).join("")}</div>
                <p class="ms-note">${esc(longDate(weeks[0].startDate))} to ${esc(longDate(weeks[3].days[6].date))}. Miles a week: ${weeks.map(w => w.plannedMiles).join(", ")}.</p>` : `<p class="ms-note">${esc(made.problems[0] || "")}</p>`}
                <ul class="ms-rules">${RULES.map(([a, b]) => `<li><b>${esc(a)}.</b> ${esc(b)}</li>`).join("")}</ul>
                <p class="ms-note">Edit any day afterwards from the plan screen.</p>
            </section>`;
}

export function recoverySetup({ plan = null, onCreate, onApply, onRace }) {
    const existing = plan?.generator?.settings?.engine === "recovery";
    let st = existing ? cleanSettings(plan.generator.settings) : cleanSettings({ startDate: mondayOf(today()), easyMiles: 3, runsPerWeek: 3 });

    const d = document.createElement("dialog");
    d.className = "sb-dialog ms-dialog";
    d.setAttribute("aria-label", "Recovery plan");
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.addEventListener("click", ev => { if (ev.target === d) d.close(); });

    const read = () => {
        const f = new FormData(d.querySelector(".ms-form"));
        st = cleanSettings({ startDate: f.get("startDate"), raceName: f.get("raceName"), easyMiles: f.get("easyMiles"), runsPerWeek: f.get("runsPerWeek") });
    };

    const draw = () => {
        const made = recoveryPlan(st);
        const weeks = made.plan?.weeks || [];
        const max = Math.max(...weeks.map(w => w.plannedMiles), 1);
        d.innerHTML = `<div class="ms-wrap">
            <header class="ms-head">
                <div><span class="ms-kick">My plan</span><h2>${existing ? "Recovery plan" : "Plan for me"}</h2></div>
                <button type="button" class="sb-btn sb-btn-icon" data-act="close" aria-label="Close">${icon("close")}</button>
            </header>
            ${existing ? "" : `<div class="ms-switch" role="group" aria-label="Plan type"><button type="button" data-act="race" aria-pressed="false">Race plan</button><button type="button" aria-pressed="true" class="is-on">Recovery</button></div>`}
            <form class="ms-form" novalidate>
                <div class="ms-grid">
                    <label class="ms-f"><span>Race you're recovering from</span><input class="sb-dialog-input" name="raceName" value="${esc(st.raceName)}" placeholder="Optional" autocomplete="off"></label>
                    <label class="ms-f"><span>Starts (Monday)</span><input class="sb-dialog-input" name="startDate" type="date" value="${esc(st.startDate)}"></label>
                    <label class="ms-f"><span>Easy miles per run</span><input class="sb-dialog-input" name="easyMiles" type="number" min="1" max="8" step="0.5" inputmode="decimal" value="${esc(st.easyMiles)}"></label>
                    <label class="ms-f"><span>Runs a week (weeks 2 to 4)</span><select class="sb-dialog-input" name="runsPerWeek">${[2, 3, 4].map(n => `<option value="${n}"${n === st.runsPerWeek ? " selected" : ""}>${n}</option>`).join("")}</select></label>
                </div>
            </form>
            ${panelHtml(made, weeks, max)}
            <footer class="ms-foot">
                <span class="ms-kick">Saved on your account. Nothing goes to a client.</span>
                <span class="ms-btns"><button type="button" class="sb-btn sb-btn-primary" data-act="go"${made.plan ? "" : " disabled"}>${existing ? "Update plan" : "Create Post Marathon Recovery"}</button></span>
            </footer>
        </div>`;
    };

    d.addEventListener("input", () => { if (d.querySelector(".ms-form")) { read(); } });
    // Only the preview redraws on a change, so a tap on the button is never lost to a redraw.
    d.addEventListener("change", () => {
        read();
        const made = recoveryPlan(st), weeks = made.plan?.weeks || [];
        d.querySelector(".ms-panel").outerHTML = panelHtml(made, weeks, Math.max(...weeks.map(w => w.plannedMiles), 1));
        const go = d.querySelector('[data-act="go"]');
        if (go) go.disabled = !made.plan;
        go?.replaceChildren(existing ? "Update plan" : "Create Post Marathon Recovery");
    });
    d.addEventListener("click", async ev => {
        const btn = ev.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "close") return d.close();
        if (act === "race") { d.close(); onRace?.(); return; }
        if (act !== "go") return;
        read();
        const made = recoveryPlan(st);
        if (!made.plan) return toast(made.problems[0] || "Check the setup.", { type: "error" });
        if (existing) {
            if (!await sbConfirm("It rebuilds the four weeks from these settings. Days you ticked done stay ticked. Days you changed by hand are replaced.", { title: "Update the recovery plan?", confirmLabel: "Update plan" })) return;
            d.close();
            return onApply({ plan: mergeRuntimeByDate(plan, made.plan), name: made.name });
        }
        d.close();
        onCreate({ plan: made.plan, name: made.name });
    });

    draw();
    d.showModal();
    return d;
}

export default { recoverySetup };
