/* ==========================================
   Southbound — the marathon plan screen (coach side)

   "Plan first" (Eddie picked option C, 2026-11-10): the coach sees the
   plan the engine (js/marathonEngine.js) drafts, with a one-line summary
   of the setup and "Edit setup" to change it. The setup comes from the
   client's profile, so most of the time it is: glance, then Create.

     marathonSetup({ firstName, record, plan?, done?, onCreate, onApply })

   New plan:  Create plan -> onCreate({ name, kind, plan, warnings, summary })
              (the same payload as generateDialog, so the editor takes over).
   Regenerate (plan was made by this engine): Update plan -> a preview of
   what changes -> onApply({ plan, kind, message }). Days the coach changed
   by hand, and days the client did, are kept (regeneratePlan).

   Nothing here saves or publishes. Fixed-up numbers come from
   generateMarathonPlan().fixes (one tap, e.g. "Set peak to 45 miles").
========================================== */

import { generateMarathonPlan, RULES, CODES, clockSeconds } from "./marathonEngine.js";
import { generateCoachPlan, regeneratePlan } from "./coachPlanGenerator.js";
import { raceSeconds, marathonSettingsFromProfile, clockText, isoToday } from "./marathonProfile.js";
import { workoutSummary } from "./runWorkout.js";
import { addDays } from "./coachingPlanModel.js";
import { sbConfirm, toast } from "./ui.js";
import { icon } from "./icons.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };
const RECENT = [["", "No recent race"], ["5K", "5K"], ["10K", "10K"], ["HALF", "Half marathon"], ["MARATHON", "Marathon"]];
const RECENT_M = { "5K": 5000, "10K": 10000, HALF: 21097.5, MARATHON: 42195 };
const longDate = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "");
const shortDate = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

function chart(plan) {
    const max = Math.max(...plan.weeks.map(w => w.miles), 1);
    const classes = new Map();
    plan.weeks.forEach(w => { if (!classes.has(w.stimulus)) classes.set(w.stimulus, `ms-b${classes.size % 7}`); });
    return `<div class="ms-chart" role="img" aria-label="Miles each week, week 1 to ${plan.weeks.length}">${plan.weeks.map(w =>
        `<span class="ms-bar ${classes.get(w.stimulus)}${w.down ? " is-down" : ""}${w.kind === "race" ? " is-race" : ""}" style="height:${Math.max(4, Math.round(w.miles / max * 100))}%" title="Week ${w.index}: ${w.miles} mi"></span>`).join("")}</div>
        <div class="ms-legend">${[...classes].map(([name, c]) => `<span><i class="${c}"></i>${esc(name)}</span>`).join("")}<span><i class="ms-b-down"></i>Down week</span></div>`;
}

function weeksHtml(plan) {
    return `<div class="ms-weeks">${plan.weeks.map((w, i) => `
        <details class="ms-wk"${i === 0 ? " open" : ""}>
            <summary><span class="ms-n">WK ${w.index}</span><span class="ms-name">${esc(w.stimulus)}</span>${w.down ? '<span class="ms-tag is-down">Down week</span>' : w.kind === "taper" ? '<span class="ms-tag">Taper</span>' : w.kind === "race" ? '<span class="ms-tag is-down">Race week</span>' : ""}<span class="ms-mi">${w.miles} mi</span></summary>
            ${w.days.filter(d => d.type !== "rest").map(d => `<div class="ms-day"><span class="ms-d">${DAY[d.day]}</span><span class="${d.key ? "is-key" : ""}">${esc(d.session)}${d.workout ? `<small>${esc(workoutSummary(d.workout))}</small>` : ""}</span><span class="ms-dmi">${d.miles} mi</span></div>`).join("")}
        </details>`).join("")}</div>`;
}

function planView(st, plan, mode, first) {
    const s = st;
    const summaryBits = [
        s.raceDate ? `Race ${shortDate(s.raceDate)}` : "", s.goalTime ? `${s.goalTime} goal` : "",
        s.currentMiles ? `${s.currentMiles} mi/wk now` : "", s.peakMiles ? `peak ${s.peakMiles}` : "",
        s.runDays?.length ? `${s.runDays.length} run days` : "", s.runDays?.length ? `long run ${DAY[s.longRunDay] || ""}` : ""
    ].filter(Boolean);
    const head = `<div class="ms-setup"><div><span class="ms-kick">Setup</span><p>${summaryBits.length ? esc(summaryBits.join(" · ")) : `Nothing yet. Tell me about ${esc(first)}'s race and training.`}</p></div><button type="button" class="sb-btn sb-btn-secondary" data-act="edit">${summaryBits.length ? "Edit setup" : "Set up"}</button></div>`;
    if (!plan || plan.problems.length) {
        const need = plan?.problems?.[0] || "";
        return `${head}<section class="ms-panel"><div class="ms-ghost" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="height:${28 + (i % 4 === 3 ? -8 : i * 3)}%"></i>`).join("")}</div>
            <div class="ms-empty"><strong>The plan appears here</strong><p>${need ? esc(need) : "Add the race date, miles a week now and run days."} Everything else has a sensible default.</p></div></section>`;
    }
    const sm = plan.summary;
    const fixFor = plan.fixes || [];
    return `${head}
        <section class="ms-panel">
            <div class="ms-stats"><div><b>${sm.weeks}</b><i>Weeks</i></div><div><b>${sm.startMiles}→${sm.peakMiles}</b><i>Miles / week</i></div><div><b>${sm.longestRun}</b><i>Longest run</i></div><div><b>${esc((sm.racePace || "").split("-")[0] || "–")}</b><i>Race pace</i></div></div>
            ${chart(plan)}
            ${fixFor.length ? `<div class="ms-fixes"><span class="ms-kick">Quick fix</span>${fixFor.map((f, i) => `<button type="button" class="sb-btn sb-btn-secondary" data-act="fix" data-i="${i}">${esc(f.label)}</button>`).join("")}</div>` : ""}
            ${plan.warnings.map(w => `<p class="ms-warn"><strong>Worth a look.</strong> ${esc(w)}</p>`).join("")}
        </section>
        <section class="ms-panel"><h3>Weeks</h3>${weeksHtml(plan)}
            ${s.strengthDays > 0 ? `<p class="ms-note">${s.strengthDays} strength session${s.strengthDays === 1 ? "" : "s"} a week are added when you ${mode === "regen" ? "update" : "create"} the plan.</p>` : ""}</section>`;
}

function field(label, control, wide = false) { return `<label class="ms-f${wide ? " is-wide" : ""}"><span>${esc(label)}</span>${control}</label>`; }
const input = (name, value, attrs = "") => `<input class="sb-dialog-input" name="${name}" value="${esc(value ?? "")}" ${attrs}>`;
const select = (name, list, value) => `<select class="sb-dialog-input" name="${name}">${list.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;

function setupView(st) {
    const recentDist = st.recentRace ? (Object.entries(RECENT_M).find(([, m]) => Math.abs(m - st.recentRace.meters) < 1)?.[0] || "") : "";
    const recentTime = st.recentRace ? clockText(st.recentRace.seconds) : "";
    const tier = st.tierAsked || "";
    return `<form class="ms-form" novalidate>
        <div class="ms-grid">
            ${field("Race date", input("raceDate", st.raceDate, 'type="date"'))}
            ${field("Goal time", input("goalTime", st.goalTime, 'placeholder="3:45:00" inputmode="numeric" autocomplete="off"'))}
            ${field("Recent race", select("recentDist", RECENT, recentDist))}
            ${field("Its time", input("recentTime", recentTime, 'placeholder="1:45:00" inputmode="numeric" autocomplete="off"'))}
            ${field("Miles / week now", input("currentMiles", st.currentMiles || "", 'type="number" min="0" max="150" step="1" inputmode="numeric" placeholder="30"'))}
            ${field("Longest recent run (mi)", input("longestRun", st.longestRun || "", 'type="number" min="0" max="30" step="0.5" inputmode="decimal" placeholder="10"'))}
            ${field("Peak miles / week", input("peakMiles", st.peakMiles || "", 'type="number" min="10" max="120" step="1" inputmode="numeric" placeholder="Auto"'))}
            ${field("Starts", input("startDate", st.startDate, 'type="date"'))}
        </div>
        <fieldset class="ms-days"><legend class="ms-label">Run days</legend><div>${CODES.map(c => `<label><input type="checkbox" name="runDays" value="${c}"${(st.runDays || []).includes(c) ? " checked" : ""}><span>${DAY[c]}</span></label>`).join("")}</div></fieldset>
        <div class="ms-grid">${field("Long run day", select("longRunDay", CODES.map(c => [c, DAY[c]]), st.longRunDay))}</div>
        <details class="ms-more"><summary>More options</summary>
            <div class="ms-grid">
                ${field("Ramp", select("tier", [["", "Automatic"], ["CAREFUL", "Careful"], ["NORMAL", "Normal"], ["EXPERIENCED", "Experienced"]], tier))}
                ${field("Key sessions", select("keySessions", [["", "Automatic"], ["BOTH", "Speed and long run every week"], ["ALTERNATE", "Take turns"]], st.keySessions || ""))}
                ${field("Long run target (mi)", input("longTarget", st.longTarget || RULES.longCapMiles, `type="number" min="8" max="${RULES.longCapMiles}" step="0.5" inputmode="decimal"`))}
                ${field("Strength a week", select("strengthDays", [[0, "None"], [1, "1"], [2, "2"], [3, "3"]], st.strengthDays || 0))}
                ${field("800s test: reps", select("reps800", [["", "Automatic"], ...[8, 9, 10].map(n => [n, String(n)])], st.reps800 || ""))}
                ${field("800s test: rest", select("rest800", [["", "Automatic"], [60, "1:00 jog"], [90, "1:30 jog"], [120, "2:00 jog"]], st.rest800 || ""))}
            </div>
            <label class="ms-check"><input type="checkbox" name="injuryHistory"${st.injuryHistory ? " checked" : ""}><span>Injury history (uses the careful ramp)</span></label>
            <label class="ms-check"><input type="checkbox" name="firstMarathon"${st.firstMarathon ? " checked" : ""}><span>First marathon (one key session a week)</span></label>
        </details>
        <p class="ms-error" data-el="error" role="alert" hidden></p>
    </form>`;
}

function readSetup(form, base) {
    const f = new FormData(form);
    const num = k => Number(f.get(k)) || 0;
    const dist = String(f.get("recentDist") || ""), seconds = raceSeconds(f.get("recentTime"));
    const goal = String(f.get("goalTime") || "").trim();
    const goalSec = clockSeconds(goal);
    const runDays = CODES.filter(c => f.getAll("runDays").includes(c));
    const out = {
        ...base,
        raceDate: String(f.get("raceDate") || ""), startDate: String(f.get("startDate") || ""),
        goalTime: goalSec ? clockText(goalSec) : "",
        recentRace: dist && seconds ? { meters: RECENT_M[dist], seconds } : null,
        currentMiles: num("currentMiles"), longestRun: num("longestRun"), peakMiles: num("peakMiles"),
        runDays, trainDays: CODES.filter(c => runDays.includes(c) || (base.trainDays || []).includes(c)),
        longRunDay: String(f.get("longRunDay") || ""),
        longTarget: num("longTarget") || RULES.longCapMiles,
        strengthDays: num("strengthDays"),
        injuryHistory: f.get("injuryHistory") === "on", firstMarathon: f.get("firstMarathon") === "on",
        tierAsked: String(f.get("tier") || ""), tier: String(f.get("tier") || "") || undefined,
        keySessions: String(f.get("keySessions") || "") || undefined,
        reps800: num("reps800") || undefined, rest800: num("rest800") || undefined
    };
    if (!out.tier) delete out.tier;
    return out;
}

/** The engine's plan for these settings, or { problems } while the setup is still short. */
export function previewFor(st) {
    try { return generateMarathonPlan(st); } catch { return { problems: ["Check the setup."], weeks: [], warnings: [], fixes: [] }; }
}

export function marathonSetup({ firstName, record, plan = null, done = new Set(), onCreate, onApply }) {
    const today = isoToday();
    const regen = Boolean(plan?.generator?.settings?.engine === "marathon");
    let st = regen ? { ...plan.generator.settings } : marathonSettingsFromProfile(record, today);
    let view = "plan";
    const first = firstName || "the runner";

    const d = document.createElement("dialog");
    d.className = "sb-dialog ms-dialog";
    d.setAttribute("aria-label", regen ? "Update the marathon plan" : "New marathon plan");
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.addEventListener("click", ev => { if (ev.target === d) d.close(); });

    const draw = () => {
        const prev = previewFor(st);
        const ready = prev && !prev.problems.length;
        d.innerHTML = `
        <div class="ms-wrap">
            <header class="ms-head">
                <div><span class="ms-kick">${regen ? "Update the plan" : "New marathon plan"}</span><h2>${view === "setup" ? "Setup" : `Plan for ${esc(first)}`}</h2></div>
                <button type="button" class="sb-btn sb-btn-icon" data-act="close" aria-label="Close">${icon("close")}</button>
            </header>
            ${view === "setup" ? setupView(st) : planView(st, ready ? prev : null, regen ? "regen" : "new", first)}
            <footer class="ms-foot">
                ${view === "setup"
                    ? `<span class="ms-kick">The plan updates when you go back</span><span class="ms-btns"><button type="button" class="sb-btn sb-btn-secondary" data-act="back">Back</button><button type="button" class="sb-btn sb-btn-primary" data-act="apply">Show the plan</button></span>`
                    : `<span class="ms-kick">${regen ? "You'll see what changes before it does" : "Nothing is saved until you create it"}</span><span class="ms-btns"><button type="button" class="sb-btn sb-btn-secondary" data-act="close">Cancel</button><button type="button" class="sb-btn sb-btn-primary" data-act="go"${ready ? "" : " disabled"}>${regen ? "Update plan" : "Create plan"}</button></span>`}
            </footer>
        </div>`;
        d.scrollTop = 0;
        return prev;
    };

    const apply = () => {
        const form = d.querySelector(".ms-form");
        if (form) st = readSetup(form, st);
    };

    d.addEventListener("click", async ev => {
        const btn = ev.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === "close") return d.close();
        if (act === "edit") { view = "setup"; draw(); return; }
        if (act === "back" || act === "apply") { apply(); view = "plan"; draw(); return; }
        if (act === "fix") {
            const fix = previewFor(st).fixes?.[Number(btn.dataset.i)];
            if (fix) { st = { ...st, ...fix.patch }; draw(); toast("Updated. The plan is redrawn.", { type: "info" }); }
            return;
        }
        if (act === "go") {
            const prev = previewFor(st);
            if (prev.problems.length) return;
            try {
                if (!regen) {
                    const result = generateCoachPlan(st);
                    d.close();
                    return onCreate({ name: `Marathon plan, ${shortDate(st.raceDate)}`, kind: "race", ...result });
                }
                const from = st.startDate > today ? st.startDate : today;
                const result = regeneratePlan(plan, st, { from, scope: "all", replaceEdits: false, today, done });
                const days = result.changes.length;
                const kept = result.keptEdited.length;
                const ok = await sbConfirm(`${days} day${days === 1 ? "" : "s"} change from ${shortDate(from)} on.${kept ? ` ${kept} day${kept === 1 ? "" : "s"} you changed by hand ${kept === 1 ? "is" : "are"} kept.` : ""}\n\nIt goes into your editor (you can undo). ${first} sees it when you publish.`, { title: "Update the plan?", confirmLabel: "Update plan" });
                if (!ok) return;
                d.close();
                onApply({ plan: result.plan, kind: "race", message: `Marathon plan updated: ${days} day${days === 1 ? "" : "s"} changed.` });
            } catch (error) {
                toast(error.message || "Couldn't build that plan. Check the setup.", { type: "error" });
            }
        }
    });

    // First time with nothing to go on: open the setup, so the first thing they see is what to fill in.
    const first1 = previewFor(st);
    if (!regen && first1.problems?.length) view = "setup";
    draw();
    d.showModal();
    return d;
}

export default { marathonSetup, previewFor };
