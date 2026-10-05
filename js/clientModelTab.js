/* ==========================================
   Southbound — the Client Hub's Model tab (coach only)

   Athlete model step 7. The engines run on this device from what the
   coach can read (js/clientModel.js): the client's shared athlete-model
   history when they share it (js/athleteShare.js), else their logged
   plan workouts. Shows, for this client:
     This week    the weekly decision on the next 7 days of the coach's
                  plan; Apply as draft puts the changes into the plan
                  workspace (unpublished, with Undo) — the client sees
                  them only when the coach publishes
     Race fitness race capability for their target distance (or any)
     Load and response, Readiness (with shared nights)
     Races        "Is this a race?" for their runs, answered by the coach
   The coach's answers and choices for each client are kept in the
   coach's own private, cloud-synced "coach-athlete-model"
   ({ clientUid: { races, decisions, snapshots } }); nothing is written
   anywhere the client can read.
========================================== */

import { decodeShare } from "./athleteShare.js";
import { clientModel, currentPlan, applyDecisionToPlan, workoutLabel } from "./clientModel.js";
import { raceRecord, notRaceRecord, milesText, clockText } from "./athleteLedger.js";
import { clock, distanceLabel } from "./raceCapability.js";
import { LEVEL_WORDS, DOMAIN_NAMES } from "./weeklyDecision.js";
import { toast, sbChoose } from "./ui.js";

export const COACH_MODEL_KEY = "coach-athlete-model";
const KEEP = 52;

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const shortDate = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const LEVEL_HINT = {
    proceed: "Train as planned.",
    absorb: "A small trim: easy runs a little shorter, quality at the slow end of the range.",
    ease: "Ease off: shorter easy runs and long run, one quality session with fewer reps.",
    recover: "A few easy days, then back to the plan.",
    checkin: "Something needs a look before the plan changes. Talk to them first; nothing is suggested."
};
const REASONS = [
    { label: "They feel fine", value: "They feel fine" },
    { label: "Race or event coming", value: "Race or event coming" },
    { label: "I've already adjusted it", value: "Already adjusted" },
    { label: "The numbers look wrong", value: "The numbers look wrong" }
];
// The engines speak to the athlete ("your normal"); here the coach reads about the client.
const their = t => String(t ?? "").replace(/\bYou're\b/g, "They're").replace(/\byou're\b/g, "they're").replace(/\byour\b/g, "their").replace(/\bYour\b/g, "Their").replace(/\bYou\b/g, "They").replace(/\byou\b/g, "they");
/** One suggested change, short: a quality day turned easy names the workout, not its whole text. */
function changeText(c) {
    if (/^Easy run \(was:/.test(c.after.session)) return `Easy run instead of ${workoutLabel(c.before.session)} · ${c.before.miles} → ${c.after.miles} mi`;
    const b = workoutLabel(c.before.session), a = workoutLabel(c.after.session);
    if (c.before.session !== c.after.session && /slower end/.test(c.after.session) && !/slower end/.test(c.before.session)) return `${b}: the slower end of the pace range`;
    if (c.before.session !== c.after.session) return `${b} → ${a}${c.after.miles !== c.before.miles ? ` · ${c.before.miles} → ${c.after.miles} mi` : ""}`;
    return `${b}: ${c.before.miles} → ${c.after.miles} mi`;
}
const CHIPS = [{ m: 5000, label: "5K" }, { m: 10000, label: "10K" }, { m: 21097.5, label: "Half" }, { m: 42195, label: "Marathon" }];

// ---------- the coach's own record per client ----------

function readAll() {
    try { return JSON.parse(localStorage.getItem(COACH_MODEL_KEY) || "null") || {}; } catch { return {}; }
}
export function clientEntry(uid) {
    const e = readAll()[uid] || {};
    return { races: e.races || {}, decisions: e.decisions || [], snapshots: e.snapshots || [] };
}
function updateEntry(uid, change) {
    const all = readAll();
    const e = { races: {}, decisions: [], snapshots: [], ...(all[uid] || {}) };
    change(e);
    all[uid] = e;
    localStorage.setItem(COACH_MODEL_KEY, JSON.stringify(all));
    import("./cloudSync.js").then(m => m.pushToCloud()).catch(() => {});
}

// ---------- rendering ----------

function sharedLine(m, first) {
    if (m.tier === "shared") {
        return `${esc(first)} shares the athlete model: ${m.counts.runs} runs over the last year, ${m.counts.nights} nights of sleep / HRV, ${m.counts.mornings} morning check-ins${m.through ? ` · sent ${esc(shortDate(m.through))}` : ""}.`;
    }
    const ask = `For heart rate, sleep and HRV, ask ${esc(first)} to turn on <strong>Settings → Wearable sharing → Athlete model</strong>.`;
    if (m.tier === "plan-logs") return `${esc(first)} doesn't share the athlete model, so this reads only their ${m.counts.planLogs} logged plan workouts (distance, time and effort). ${ask}`;
    return `Nothing to read yet: ${esc(first)} hasn't logged a plan workout and doesn't share the athlete model. ${ask}`;
}

function decisionHtml(m, entry, plan, first) {
    const d = m.decision;
    const logged = entry.decisions.find(x => x.weekOf === m.weekOf);
    const chips = d.domains.map(x => `<li class="sev-${x.severity}"><b>${esc(DOMAIN_NAMES[x.key] || x.label)}</b> ${esc(["fine", "mild", "moderate", "strong"][x.severity])}</li>`).join("");
    const changes = d.changes.length ? `
        <p class="cm-sub">Suggested for the next 7 days</p>
        <ul class="cm-changes">${d.changes.map(c => `<li><strong>${esc(dayLabel(c.date))}</strong><span>${esc(changeText(c))}</span></li>`).join("")}</ul>` : "";
    const notes = d.notes.length ? `<ul class="cm-notes">${d.notes.map(n => `<li>${esc(their(n))}</li>`).join("")}</ul>` : "";
    let actions = "";
    if (logged) {
        actions = `<div class="cm-done"><span>${logged.choice === "draft"
            ? `Put into ${esc(first)}'s plan as unpublished changes ${esc(shortDate(new Date(logged.at).toISOString().slice(0, 10)))}. Review & publish it on the Plan tab when you're happy.`
            : `Not this week (${esc(logged.reason || "no reason")}).`}</span>
            <button type="button" class="sb-btn sb-btn-tertiary" data-cm="reopen">Change my mind</button></div>`;
    } else if (d.changes.length && plan) {
        actions = `<div class="cm-actions">
            <button type="button" class="sb-btn sb-btn-primary" data-cm="apply">Apply as draft</button>
            <button type="button" class="sb-btn sb-btn-secondary" data-cm="decline">Not this week</button></div>`;
    } else if (!plan && m.decision.level !== "proceed" && m.decision.level !== "checkin") {
        actions = `<p class="cm-note">No active plan from you to adjust. Publish a plan on the Plan tab and the suggestions will fill in here.</p>`;
    }
    return `
        <section class="clients-card cm-card cm-week is-${esc(d.level)}">
            <p class="cm-eyebrow">This week</p>
            <div class="cm-head"><h3 class="cm-level">${esc(LEVEL_WORDS[d.level])}</h3><p class="cm-hint">${esc(LEVEL_HINT[d.level])}</p></div>
            <p class="cm-summary">${esc(their(d.summary))}</p>
            ${chips ? `<ul class="cm-domains">${chips}</ul>` : ""}
            ${changes}${notes}${actions}
        </section>`;
}

function raceHtml(m) {
    const r = m.race;
    const chips = CHIPS.map(c => `<button type="button" class="cm-chip${Math.abs(c.m - m.target) < 1 ? " is-on" : ""}" data-cm-target="${c.m}">${c.label}</button>`).join("");
    const body = !r || !r.sec
        ? `<p class="cm-note">${esc(r?.sec === null ? "Not enough to go on yet: confirm a race below, or a few more weeks of runs with a watch." : "Not enough runs to go on yet.")}</p>`
        : `<p class="cm-big">${esc(clock(r.sec))}</p>
           <p class="cm-meta">80% range ${esc(clock(r.lo))}–${esc(clock(r.hi))} · ${esc(r.confidence)} confidence · data grade ${esc(r.quality?.grade || "—")}</p>
           <ul class="cm-lines">${(r.lenses || []).map(l => `<li><strong>${esc(their(l.label))}</strong> ${esc(clock(l.sec))} <span>${esc(their(l.note))}</span></li>`).join("")}</ul>
           ${(r.explanation || []).slice(0, 2).map(t => `<p class="cm-note">${esc(their(t))}</p>`).join("")}`;
    return `
        <section class="clients-card cm-card">
            <p class="cm-eyebrow">Race fitness · ${esc(distanceLabel(m.target))}</p>
            <div class="cm-chips" role="group" aria-label="Race distance">${chips}</div>
            ${body}
        </section>`;
}

function loadHtml(m, first) {
    const t = m.load.today;
    const rd = m.response.reading;
    const eff = m.response.effort;
    if (!t) return "";
    return `
        <section class="clients-card cm-card">
            <p class="cm-eyebrow">Load and response</p>
            <div class="cm-stats">
                <div><span>Training base</span><strong>${esc(t.base)}</strong></div>
                <div><span>Recent load</span><strong>${esc(t.recent)}</strong></div>
                <div><span>Balance</span><strong>${t.balance > 0 ? "+" : ""}${esc(t.balance)}</strong></div>
            </div>
            ${m.loadWords ? `<p class="cm-note">Recent load is ${esc(their(m.loadWords))}. That's a comparison with ${esc(first)}'s own year, not a safe zone.</p>` : `<p class="cm-note">Needs 4 weeks of runs before recent load can be compared with ${esc(first)}'s usual.</p>`}
            <p class="cm-sub">How they're responding: ${esc(rd.title)}</p>
            ${rd.text ? `<p class="cm-note">${esc(their(rd.text))}</p>` : ""}
            ${eff && eff.verdict !== "few" ? `<p class="cm-note">Effort vs expected over the last ${eff.n} answered runs: ${eff.mean > 0 ? "+" : ""}${esc(eff.mean)}.</p>` : ""}
            <p class="cm-note">${m.counts.answered} of ${m.counts.recent} runs in the last 4 weeks have an effort answer.</p>
        </section>`;
}

function readinessHtml(m) {
    const r = m.readiness;
    if (!r) return "";
    return `
        <section class="clients-card cm-card">
            <p class="cm-eyebrow">Readiness today</p>
            ${r.score == null ? `<p class="cm-note">No score today: needs last night's HRV or sleep.</p>` : `<p class="cm-big cm-${esc(r.color)}">${esc(r.score)}</p>`}
            <ul class="cm-lines">${r.domains.map(x => `<li><strong>${esc(x.label)}</strong> ${esc(x.score)} <span>${esc(their(x.note))}</span></li>`).join("")}</ul>
            ${r.flags.map(f => `<p class="cm-flag">${esc(their(f.text))}</p>`).join("")}
        </section>`;
}

function racesHtml(m, first) {
    const cands = m.candidates.map(c => `
        <li data-cm-session="${esc(c.session.id)}">
            <span><strong>${esc(dayLabel(c.session.date))} · ${esc(milesText(c.session.distance))} in ${esc(clockText(c.session.elapsedSec || c.session.movingSec))}</strong><small>${esc(c.reasons.map(x => x.replace(/^Named "Race"$/, "Its name sounds like a race").replace(/^Your plan's race day$/, "Race day on the plan")).map(their).join(" · "))}</small></span>
            <span class="cm-race-btns"><button type="button" class="sb-btn sb-btn-secondary" data-cm="race">Race</button><button type="button" class="sb-btn sb-btn-tertiary" data-cm="notrace">Not a race</button></span>
        </li>`).join("");
    const done = m.confirmed.map(({ session, race }) => `
        <li data-cm-session="${esc(session.id)}">
            <span><strong>${esc(dayLabel(session.date))} · ${esc(distanceLabel(race.meters))} in ${esc(clockText(race.timeSec))}</strong>${race.allOut === false ? "<small>Not all-out</small>" : ""}</span>
            <span class="cm-race-btns"><button type="button" class="sb-btn sb-btn-tertiary" data-cm="unrace">Remove</button></span>
        </li>`).join("");
    if (!cands && !done) return "";
    return `
        <section class="clients-card cm-card">
            <p class="cm-eyebrow">${esc(first)}'s races</p>
            ${cands ? `<p class="cm-sub">Is this a race?</p><ul class="cm-races">${cands}</ul>` : ""}
            ${done ? `<p class="cm-sub">Confirmed</p><ul class="cm-races">${done}</ul>` : ""}
            <p class="cm-note">Only you see these answers. Confirmed all-out races are what race fitness trusts most.</p>
        </section>`;
}

/**
 * Mounts the tab.
 *   data       the hub's client record (js/clientDirectory.js loadClientRecord)
 *   openDraft  (planId, mutate(plan), message) -> puts changes into the plan workspace
 */
export function mountClientModel(el, { data, clientUid, firstName = "your client", openDraft }) {
    if (!el) return;
    let target = null;
    let current = null;
    const first = firstName;

    function compute() {
        const today = isoToday();
        const entry = clientEntry(clientUid);
        const header = currentPlan(data.coachingPlans || [], today);
        // The published plan: a draft may already hold this week's changes,
        // and suggesting from it would cut them twice.
        const plan = header?.plan || null;
        const lastWeek = entry.snapshots.find(s => s.weekOf === addDays(mondayOf(today), -7));
        const m = clientModel({
            shared: data.sharedAthleteModel ? decodeShare(data.sharedAthleteModel) : null,
            results: data.results || [], races: entry.races, plan, record: data.record || null,
            today, meters: target, previous: lastWeek?.level || null
        });
        // What it said the first time the week was seen (to judge it on later).
        if (m.decision.domains.length && !entry.snapshots.some(s => s.weekOf === m.weekOf)) {
            updateEntry(clientUid, e => {
                e.snapshots = [...e.snapshots, { weekOf: m.weekOf, asOf: today, level: m.decision.level, version: m.decision.version, domains: Object.fromEntries(m.decision.domains.map(x => [x.key, x.severity])) }].slice(-KEEP);
            });
        }
        return { m, entry, header, plan };
    }

    function render() {
        try {
            current = compute();
        } catch (error) {
            console.error("Southbound: the model couldn't run for this client.", error);
            el.innerHTML = `<div class="clients-card"><p class="cm-note">The model couldn't run on this client's data. Try reloading the page.</p></div>`;
            return;
        }
        const { m, entry, header } = current;
        el.innerHTML = `
            <div class="cm">
                <div class="cm-intro clients-card">
                    <p class="cm-note">${sharedLine(m, first)}</p>
                    <p class="cm-note cm-private">Worked out on your device. Only you see this tab; ${esc(first)} never does.</p>
                </div>
                ${m.tier === "none" ? "" : `
                ${decisionHtml(m, entry, header, first)}
                <div class="cm-grid">${raceHtml(m)}${loadHtml(m, first)}${readinessHtml(m)}</div>
                ${racesHtml(m, first)}`}
            </div>`;
    }

    el.addEventListener("click", async event => {
        const chip = event.target.closest("[data-cm-target]");
        if (chip) { target = Number(chip.dataset.cmTarget); render(); return; }
        const btn = event.target.closest("[data-cm]");
        if (!btn || !current) return;
        const act = btn.dataset.cm;
        const { m, header } = current;
        const sessionId = btn.closest("[data-cm-session]")?.dataset.cmSession;
        const session = m.sessions.find(s => s.id === sessionId);
        if (act === "race" && session) {
            updateEntry(clientUid, e => { e.races[session.id] = raceRecord(session); });
            toast("Saved as a race", { action: { label: "Undo", onClick: () => { updateEntry(clientUid, e => { delete e.races[session.id]; }); render(); } } });
            return render();
        }
        if ((act === "notrace" || act === "unrace") && session) {
            const before = clientEntry(clientUid).races[session.id] || null;
            updateEntry(clientUid, e => { e.races[session.id] = notRaceRecord(); });
            toast(act === "notrace" ? "Not a race" : "Removed from races", { action: { label: "Undo", onClick: () => { updateEntry(clientUid, e => { if (before) e.races[session.id] = before; else delete e.races[session.id]; }); render(); } } });
            return render();
        }
        if (act === "apply" && header) {
            const decision = m.decision;
            const lines = applyDecisionToPlan(current.plan, decision).lines;
            if (!lines.length) { toast("Nothing left to change on those days.", { type: "info" }); return; }
            updateEntry(clientUid, e => {
                e.decisions = [...e.decisions.filter(x => x.weekOf !== m.weekOf), { weekOf: m.weekOf, asOf: m.today, level: decision.level, version: decision.version, choice: "draft", lines, planId: header.id, at: Date.now() }].slice(-KEEP);
            });
            render();
            await openDraft?.(header.id, plan => { plan.weeks = applyDecisionToPlan(plan, decision).plan.weeks; }, `${LEVEL_WORDS[decision.level]}: ${lines.length} ${lines.length === 1 ? "day" : "days"} changed. Not published yet.`);
            return;
        }
        if (act === "decline") {
            const reason = await sbChoose(`Why not this week? It's kept in your notes for ${first}, so later you can see whether skipping it was right.`, { title: "Not this week", choices: REASONS });
            if (reason == null) return;
            updateEntry(clientUid, e => {
                e.decisions = [...e.decisions.filter(x => x.weekOf !== m.weekOf), { weekOf: m.weekOf, asOf: m.today, level: m.decision.level, version: m.decision.version, choice: "declined", reason, at: Date.now() }].slice(-KEEP);
            });
            return render();
        }
        if (act === "reopen") {
            updateEntry(clientUid, e => { e.decisions = e.decisions.filter(x => x.weekOf !== m.weekOf); });
            return render();
        }
    });
    render();
    return { refresh: render };
}

const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d); return addDays(date, -((t.getDay() + 6) % 7)); };
