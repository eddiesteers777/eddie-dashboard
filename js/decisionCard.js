/* ==========================================
   Southbound — the weekly decision's log and check on Analytics

   Athlete model step 6 (docs/PERFORMANCE_ENGINE_PLAN.md 3.9, 3.10, 4.5):
     Your dial-down numbers  the policy's percentages, editable, Reset
     Your log                every week's suggestion, what you chose and
                             what happened in the 7 days after it
     Looking back            a replay of the last 26 weeks: when would it
                             have said Ease / Recover / Check in, and did
                             trouble follow (2+ planned sessions missed or
                             off target, or new pain or sickness, in the
                             next 14 days: nothing the decision itself
                             reads)? Three settings show the trade-off,
                             next to the simple way to beat (easing off
                             after 2 weeks with that trouble). History
                             can't say whether following it would have
                             helped: only the log can.
========================================== */

import { outcomeOf, replayDecisions, DEFAULT_POLICY, LEVEL_WORDS, DECISION_VERSION } from "./weeklyDecision.js";
import { decisionInputs, decisionLog, loadPolicy, savePolicy, resetPolicy } from "./weeklyDecisionData.js";
import { toast } from "./ui.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const day = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const CHOICE = { applied: "Applied", declined: "Not this week", undone: "Applied, then undone" };
const FIELDS = [
    { key: "absorbEasy", label: "Absorb: easy runs", pct: true },
    { key: "easeEasy", label: "Ease: easy runs", pct: true },
    { key: "easeLong", label: "Ease: long run", pct: true },
    { key: "easeReps", label: "Ease: reps kept in one quality session", pct: true },
    { key: "recoverEasy", label: "Recover: runs", pct: true },
    { key: "recoverLong", label: "Recover: long run", pct: true },
    { key: "recoverDays", label: "Recover: easy days", pct: false }
];

let data = null, replay = null;

function policyHtml() {
    const p = loadPolicy();
    return `<form class="dc-policy" data-dc="policy">
        <p class="tr-note">Percent of the planned miles (or reps). The engine only ever dials down: anything over 100% is treated as 100%.</p>
        <div class="dc-fields">${FIELDS.map(f => `<label><span>${esc(f.label)}</span><input type="number" inputmode="numeric" name="${f.key}" min="${f.pct ? 30 : 1}" max="${f.pct ? 100 : 7}" step="${f.pct ? 5 : 1}" value="${f.pct ? Math.round(p[f.key] * 100) : p[f.key]}">${f.pct ? "<i>%</i>" : "<i>days</i>"}</label>`).join("")}</div>
        <div class="mc-actions"><button type="submit" class="sb-btn sb-btn-secondary">Save my numbers</button><button type="button" class="sb-btn sb-btn-tertiary" data-dc="reset">Back to the defaults</button></div>
    </form>`;
}

function logHtml(today) {
    const log = decisionLog().slice().reverse();
    if (!log.length) return `<p class="ar-empty">Nothing yet. When you Apply or skip a week on Today's "This week" card, it's kept here with what happened next.</p>`;
    return `<div class="mc-scroll"><table class="mc-table dc-log">
        <thead><tr><th scope="col">Week of</th><th scope="col">Said</th><th scope="col">You</th><th scope="col">The 7 days after</th></tr></thead>
        <tbody>${log.map(e => {
            const o = data ? outcomeOf(e, data, today) : { pending: true };
            const after = o.pending ? "Still to come" : `${o.miles} mi run${e.plannedMiles ? ` of ${Math.round(e.plannedMiles)} planned` : ""} · ${o.missed ? `${o.missed} ${o.missed === 1 ? "session" : "sessions"} missed or off target` : "nothing missed"}${o.flags ? ` · ${o.flags} new pain / sick ${o.flags === 1 ? "day" : "days"}` : ""}`;
            return `<tr><th scope="row">${esc(day(e.weekOf))}</th><td>${esc(LEVEL_WORDS[e.level] || e.level)}</td><td>${esc(CHOICE[e.choice] || e.choice)}${e.reason ? `<small>${esc(e.reason)}</small>` : ""}</td><td>${esc(after)}</td></tr>`;
        }).join("")}</tbody>
    </table></div>`;
}

function replayHtml() {
    if (!replay) return `<p class="ar-empty sb-wait"></p>`;
    const rows = replay.settings;
    if (rows.every(s => !s.flagged && !s.troubleWeeks)) return `<p class="ar-empty">Needs a few months of your plan, runs and the morning numbers to replay.</p>`;
    const pct = x => (x == null ? "–" : `${x}%`);
    const def = rows.find(s => s.key === "default");
    const simple = rows.find(s => s.key === "simple");
    const beat = simple && simple.troubleWeeks && def.flagged
        ? (def.hits > simple.hits && def.falseAlarms <= simple.falseAlarms) || (def.hits >= simple.hits && def.falseAlarms < simple.falseAlarms)
            ? "It does better than the simple way (more trouble seen, or fewer false alarms)."
            : (simple.hits > def.hits && simple.falseAlarms <= def.falseAlarms) || (simple.hits >= def.hits && simple.falseAlarms < def.falseAlarms)
                ? "The simple way (easing off after 2 weeks with missed sessions or pain) did better than the engine here."
                : "Neither clearly beats the other yet: one sees more, the other raises fewer false alarms."
        : "";
    return `<div class="mc-scroll"><table class="mc-table dc-replay">
            <thead><tr><th scope="col">Setting</th><th scope="col">Weeks it would have eased</th><th scope="col">Then trouble</th><th scope="col">Then nothing</th><th scope="col">Trouble it missed</th></tr></thead>
            <tbody>${rows.map(s => `<tr${s.key === "simple" ? ' class="mc-base"' : ""}><th scope="row">${esc(s.label)}</th><td>${s.flagged}</td><td>${s.hits} (${pct(s.hitRate)})</td><td>${s.falseAlarms} (${pct(s.falseRate)})</td><td>${s.misses} of ${s.troubleWeeks} (${pct(s.missRate)})</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="lc-line">${def.flagged ? `On the default setting it would have eased off ${def.flagged} of the last ${replay.weeks} weeks; trouble followed ${def.hits} of them${def.troubleWeeks ? `, and it missed ${def.misses} of ${def.troubleWeeks} troubled weeks` : ""}.` : `On the default setting it wouldn't have eased off in the last ${replay.weeks} weeks${def.troubleWeeks ? `, and ${def.troubleWeeks} ${def.troubleWeeks === 1 ? "week" : "weeks"} had trouble it didn't see coming` : ""}.`} ${esc(beat)} Sensitive eases more often (fewer misses, more false alarms); Cautious the other way.</p>
        <p class="tr-note">Trouble = 2 or more planned sessions skipped, cut short or off target, or new pain or sickness, in the 14 days after. Runs that just felt harder don't count here: that's one of the signals it reads. This only shows whether the warnings came before trouble. Whether easing off would have helped can only come from your log, week by week, from now on.</p>`;
}

function render() {
    const el = $("decisionPanel");
    if (!el) return;
    const today = isoToday();
    el.dataset.version = DECISION_VERSION;
    el.innerHTML = `
        <div class="panel-header"><div>
            <h2>This week's decision: your log</h2>
            <p>What the engine suggested each week on Today, what you chose, and what happened next. It only ever dials your plan down, never up.</p>
        </div></div>
        ${logHtml(today)}
        <p class="rc-sub-h">Looking back: would it have warned you?</p>
        ${replayHtml()}
        <details class="rc-details"><summary>Your dial-down numbers</summary>${policyHtml()}</details>`;
}

async function refresh() {
    const today = isoToday();
    data = await decisionInputs(today);
    render();
    setTimeout(() => { replay = replayDecisions(data, today); render(); }, 30);
}

function bind() {
    const el = $("decisionPanel");
    el.addEventListener("submit", event => {
        if (!event.target.matches('[data-dc="policy"]')) return;
        event.preventDefault();
        const f = new FormData(event.target);
        const next = {};
        for (const x of FIELDS) {
            const v = Number(f.get(x.key));
            next[x.key] = x.pct ? Math.max(0.3, Math.min(1, v / 100)) : Math.max(1, Math.min(7, Math.round(v)));
            if (!Number.isFinite(next[x.key])) next[x.key] = DEFAULT_POLICY[x.key];
        }
        savePolicy(next);
        render();
        toast("Saved. Next week's suggestion uses your numbers.");
    });
    el.addEventListener("click", event => {
        if (event.target.closest('[data-dc="reset"]')) { resetPolicy(); render(); toast("Back to the default numbers."); }
    });
    window.addEventListener("sb:athlete-answers", () => render());
}

function mount() {
    if (!$("decisionPanel")) return;
    bind();
    refresh().catch(error => console.error("Southbound: the decision log couldn't load.", error));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
