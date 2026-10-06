/* ==========================================
   Southbound — the Weekly Planning view

   Weekly planning P2 (docs/WEEKLY_PLANNING_AUDIT.md). One view for
   Eddie's own week (planning.html) and a client's (the Client Hub's
   Planning tab), fed by an adapter:

   mountPlanning(el, adapter)
     adapter = {
       who: "self" | "client", firstName, key (notes are remembered in
       "coach-plan-prompts"[key], shared with the hub's Copy chatbot prompt),
       scope: "runs" | "all" (may the chatbot change strength),
       load(today, { from, to }) -> { state, plan, done:Set, record, paces, noPlan }
       apply({ days, changed, checks, from, to }) -> { message, undo?, planRef }
       log?() -> [{ id, at, from, to, choice, days }]   (self: recent applies,
                 the fallback history when planning cycles can't be read)
       undo?(id)
       athleteUid: "self" | the client's uid (whose planning cycles)
     }

   The page: the week being planned (next 7 days / next Mon–Sun), what
   Southbound thinks matters (its reading, the coach decides), the
   Planning Brief, the coach's notes, Copy for a chatbot (the brief + the
   facts + the week + the answer format) or the brief alone, the week as
   it stands, and Paste the answer: every changed day with a tick box,
   before → after, what couldn't be read, and the safety checks on the
   ticked days. Apply writes only the ticked days (Eddie: straight into
   his plan with Undo; a client: into the plan editor as a draft, with
   Undo, unpublished). Nothing goes anywhere until the coach copies it.

   P3: each week is kept as a planning cycle (js/planningCycle.js, saved
   by js/planningCycles.js, coach only): the context when it's copied,
   the answer when it's read, and the coach's call on each changed day
   (taken / kept yours, with an optional one-tap reason) when it's
   applied. **Planned weeks** lists them.
========================================== */

import { planningContext, planWindow, defaultMode } from "./planningContext.js";
import { planningBrief, briefSections, chatbotPrompt } from "./planningBrief.js";
import { dayLine, parseReply, applyReply, checkPlan } from "./planPrompt.js";
import { compactChange } from "./coachPlanGenerator.js";
import { icon } from "./icons.js";
import { toast, loadingHtml } from "./ui.js";
import { newCycle, withContext, withProposal, withApproval, withUndo, cycleSummary, REASONS } from "./planningCycle.js";

const NOTES_KEY = "coach-plan-prompts";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shortDay = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const TYPE_WORDS = { workout: "Workout", tempo: "Workout", long: "Long run", easy: "Easy", recovery: "Recovery", race: "Race", rest: "Rest", cross: "Cross-training", strength: "Strength" };

function savedNotes(key) {
    try { return ((JSON.parse(localStorage.getItem(NOTES_KEY) || "{}") || {})[key] || {}).notes || ""; } catch { return ""; }
}
function rememberNotes(key, notes) {
    try {
        const all = JSON.parse(localStorage.getItem(NOTES_KEY) || "{}") || {};
        all[key] = { ...all[key], notes, at: Date.now() };
        localStorage.setItem(NOTES_KEY, JSON.stringify(all));
    } catch { /* the notes still go into this copy */ }
}
async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
const daysOf = plan => (plan?.weeks || []).flatMap(w => w.days || []);

export function mountPlanning(el, adapter) {
    if (!el) return null;
    const self = adapter.who === "self";
    const name = self ? "you" : adapter.firstName || "them";
    let mode = null;
    let data = null;      // what load() gave
    let context = null;
    let win = null;
    let read = null;      // the pasted answer, read
    let ticked = new Set();
    let reasons = {};     // { date: { key, words } } for days the coach didn't take
    let proposalId = "";
    // Planning cycles (P3): this athlete's saved weeks, the one being planned, and why saving failed.
    let store = null;     // js/planningCycles.js, once loaded
    let uid = null;
    let cycles = null;
    let cycleError = "";
    let saving = Promise.resolve();
    let ready = null;     // loadCycles() in flight

    const notes = () => el.querySelector('[data-pl="notes"]')?.value ?? savedNotes(adapter.key);

    async function refresh({ keepPaste = false } = {}) {
        const today = iso(new Date());
        mode = mode || defaultMode(today);
        win = planWindow(today, mode);
        const pasted = keepPaste ? el.querySelector('[data-pl="reply"]')?.value || "" : "";
        el.innerHTML = `<div class="pl">${loadingHtml("Reading everything Southbound knows", { lines: 4 })}</div>`;
        try {
            data = await adapter.load(today, win);
        } catch (error) {
            console.error("Southbound: weekly planning couldn't load.", error);
            el.innerHTML = `<div class="pl"><p class="pl-note">Weekly planning couldn't load. Try reloading the page.</p></div>`;
            return;
        }
        const lines = daysOf(data.plan).filter(d => d.date >= win.from && d.date <= win.to).map(dayLine);
        context = planningContext(data.state, { from: win.from, to: win.to, notes: savedNotes(adapter.key), planLines: lines });
        read = null;
        render(pasted);
        loadCycles();
    }

    // ---------- planning cycles ----------

    const athleteId = () => (adapter.athleteUid === "self" || !adapter.athleteUid ? uid : adapter.athleteUid);
    const current = () => (cycles || []).find(c => c.weekOf === win.from) || null;

    function loadCycles() {
        ready = readCycles();
        return ready;
    }
    async function readCycles() {
        try {
            store = store || await import("./planningCycles.js");
            uid = uid || await store.myUid();
            cycles = await store.listCycles(adapter.athleteUid || "self");
            cycleError = "";
        } catch (error) {
            console.warn("Southbound: planned weeks couldn't be read.", error?.code || error);
            cycleError = error?.code === "permission-denied" ? "rules" : "other";
            cycles = cycles || null;
        }
        drawHistory();
    }

    // Change one cycle (default: this week's) and save it, one save at a time.
    function record(change, target = null) {
        // Still loading: save it once the store is there.
        if (!uid || !store) { ready?.then(() => uid && store && record(change, target)); return null; }
        const base = target || current() || newCycle({ coachUid: uid, athleteUid: athleteId(), from: win.from, to: win.to });
        const next = change(base);
        if (!next || next === base) return base;
        if (base.createdAt) next.createdAt = base.createdAt;
        cycles = [...(cycles || []).filter(c => c.id !== next.id), next].sort((a, b) => b.weekOf.localeCompare(a.weekOf));
        saving = saving.then(() => store.saveCycle(next)).then(() => {
            if (cycleError) { cycleError = ""; drawHistory(); }
        }).catch(error => {
            console.warn("Southbound: this planned week couldn't be saved.", error?.code || error);
            cycleError = error?.code === "permission-denied" ? "rules" : "other";
            drawHistory();
        });
        drawHistory();
        return next;
    }
    const contextNow = () => ({ ...context, notes: String(notes()).trim().slice(0, 2000) });

    function fullPrompt() {
        const ctx = { ...context, notes: String(notes()).trim().slice(0, 2000) };
        return chatbotPrompt(ctx, { runsOnly: adapter.scope === "runs", paces: data.paces || "" });
    }

    function render(pasted = "") {
        const weekDays = daysOf(data.plan).filter(d => d.date >= win.from && d.date <= win.to);
        const today = iso(new Date());
        const other = mode === "next7" ? "nextWeek" : "next7";
        const otherLabel = planWindow(today, other).label.split(" · ")[0];
        el.innerHTML = `
            <div class="pl">
                <div class="pl-range">
                    <div class="pl-chips" role="group" aria-label="Which week">
                        ${["next7", "nextWeek"].map(m => `<button type="button" class="pl-chip${m === mode ? " is-on" : ""}" data-pl-mode="${m}" aria-pressed="${m === mode}">${esc(planWindow(today, m).label.split(" · ")[0])}</button>`).join("")}
                    </div>
                    <p class="pl-dates">${esc(shortDay(win.from))} – ${esc(shortDay(win.to))}</p>
                </div>
                ${data.noPlan ? `<p class="pl-warn">${icon("info")} ${esc(data.noPlan)}</p>` : ""}

                <section class="pl-card" data-pl-section="priorities">
                    <h2 class="pl-h">What matters this week</h2>
                    <p class="pl-sub">Southbound's reading of the facts, most important first. You decide.</p>
                    ${context.priorities.length ? `<ol class="pl-pri">${context.priorities.map(p => `
                        <li class="pl-pri-item" data-key="${esc(p.key)}">
                            <strong>${esc(p.title)}</strong>
                            <p>${esc(p.text)}</p>
                            ${p.evidence.length ? `<ul class="pl-ev">${p.evidence.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
                        </li>`).join("")}</ol>` : `<p class="pl-note">Nothing stands out: the plan as written looks right for this week.</p>`}
                </section>

                <section class="pl-card" data-pl-section="brief">
                    <h2 class="pl-h">The brief</h2>
                    <p class="pl-sub">Eight questions, answered from ${self ? "your" : `${esc(name)}'s`} own data. Each fact says how sure Southbound is.</p>
                    <ol class="pl-brief">${briefSections(context).map(s => `<li><strong>${esc(s.q)}</strong><p>${esc(s.a)}</p></li>`).join("")}</ol>
                </section>

                <section class="pl-card" data-pl-section="copy">
                    <h2 class="pl-h">Ask a chatbot</h2>
                    <label class="pl-label">Your notes for this week ${self ? "" : `(only in the prompt; ${esc(name)} never sees them)`}
                        <textarea class="pl-input" data-pl="notes" rows="4" maxlength="2000" placeholder="${self ? "e.g. Legs heavy after 53 miles, no race to peak for now: tone down the long run, keep one workout." : "e.g. Travels Tue–Thu, hotel treadmill only. Wants the long run on Sunday."}">${esc(savedNotes(adapter.key))}</textarea>
                    </label>
                    <div class="pl-actions">
                        <button type="button" class="sb-btn sb-btn-primary" data-pl-act="copy">${icon("copy")} Copy for a chatbot</button>
                        <button type="button" class="sb-btn sb-btn-secondary" data-pl-act="copy-brief">Copy brief only</button>
                    </div>
                    <p class="pl-ok" data-pl="ok" role="status" hidden></p>
                    <details class="pl-fold" data-pl="fold">
                        <summary>See exactly what's copied</summary>
                        <p class="pl-note">The brief, Southbound's facts (what kind and how sure), your notes, the week as it stands and the answer format. ${self ? "" : `First name and an age range only: no contacts, health answers, private notes or the words of check-ins.`}</p>
                        <textarea class="pl-input pl-out" data-pl="out" rows="10" readonly></textarea>
                    </details>
                </section>

                <section class="pl-card" data-pl-section="week">
                    <h2 class="pl-h">The week as it stands</h2>
                    ${weekDays.length ? `<ul class="pl-week">${weekDays.map(d => `
                        <li class="pl-day${d.type === "rest" ? " is-rest" : ""}${data.done?.has(d.date) ? " is-done" : ""}">
                            <span class="pl-day-date">${esc(shortDay(d.date))}</span>
                            <span class="pl-day-type">${esc(TYPE_WORDS[d.type] || d.type || "Rest")}${Number(d.miles) ? ` · ${esc(d.miles)} mi` : ""}${data.done?.has(d.date) ? ` · done` : ""}</span>
                            <span class="pl-day-text">${esc(d.type === "rest" ? "" : d.session || "")}</span>
                        </li>`).join("")}</ul>` : `<p class="pl-note">No plan days in these dates.</p>`}
                </section>

                <section class="pl-card" data-pl-section="paste"${data.noPlan ? " hidden" : ""}>
                    <h2 class="pl-h">Paste the answer</h2>
                    <p class="pl-sub">Copy the chatbot's whole reply and paste it here. Southbound reads every dated line; you see each change before anything happens.</p>
                    <textarea class="pl-input" data-pl="reply" rows="7" placeholder="${esc(win.from)} ${esc(shortDay(win.from).slice(0, 3))} | easy | 6 | Easy run | none | …">${esc(pasted)}</textarea>
                    <p class="pl-error" data-pl="error" role="alert" hidden></p>
                    <div class="pl-actions"><button type="button" class="sb-btn sb-btn-secondary" data-pl-act="read">Read it</button></div>
                    <div data-pl="preview"></div>
                </section>

                <section class="pl-card" data-pl-section="history" data-pl="history"></section>
            </div>`;
        import("./icons.js").then(m => m.hydrate()).catch(() => {});
    }

    // The device's own log of Eddie's applies: the history when cycles can't be read.
    function logItems() {
        const log = (adapter.log?.() || []).slice(-5).reverse();
        return log.map(e => `
            <li><span>${esc(new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }))} · ${esc(plural(e.days.length, "day"))} changed (${esc(shortDay(e.from))} – ${esc(shortDay(e.to))})${e.choice === "undone" ? " · undone" : ""}</span>
                ${e.choice === "applied" ? `<button type="button" class="sb-btn sb-btn-tertiary" data-pl-undo="${esc(e.id)}">Undo</button>` : ""}</li>`).join("");
    }

    const CYCLE_STATE = { "applied": "applied to your plan", "in a draft": "in a draft, not published yet", "published": "published", "undone": "undone", "answer read, not applied": "answer read, nothing applied", "brief copied": "brief copied" };

    function drawHistory() {
        const box = el.querySelector('[data-pl="history"]');
        if (!box) return;
        const applied = new Set((adapter.log?.() || []).filter(e => e.choice === "applied").map(e => e.id));
        const list = (cycles || []).slice(0, 8);
        const note = cycleError === "rules"
            ? `<p class="pl-warn">${icon("info")} Planned weeks aren't being saved yet: the Firebase rules need the latest update published.</p>`
            : cycleError ? `<p class="pl-note">Planned weeks couldn't be ${cycles ? "saved" : "read"} just now. Everything else works.</p>` : "";
        const rows = list.map(c => {
            const sm = cycleSummary(c);
            const pub = c.approved?.published;
            const bits = [CYCLE_STATE[sm.state] || sm.state];
            if (pub) bits[0] = `published${pub.edited ? ` (${plural(pub.edited, "day")} edited after)` : ""}`;
            if (sm.accepted || sm.kept) bits.push(`${sm.accepted} taken${sm.kept ? `, ${sm.kept} kept ${self ? "yours" : "as you had them"}` : ""}`);
            if (sm.reasons.length) bits.push(sm.reasons.join(", "));
            const logId = c.approved?.planRef?.store === "self" ? c.approved.planRef.logId : "";
            return `<li data-cycle="${esc(c.id)}"><span><strong>${esc(shortDay(c.weekOf))} – ${esc(shortDay(c.weekTo))}</strong> · ${esc(bits.join(" · "))}</span>
                ${c.status === "approved" && logId && applied.has(logId) ? `<button type="button" class="sb-btn sb-btn-tertiary" data-pl-undo="${esc(logId)}">Undo</button>` : ""}</li>`;
        }).join("");
        const fallback = !cycles && self ? logItems() : "";
        box.hidden = !rows && !fallback && !note;
        box.innerHTML = `
            <h2 class="pl-h">Planned weeks</h2>
            <p class="pl-sub">Each week you plan here is kept: what Southbound knew, the answer you pasted, and which days you took. ${self ? "" : `Only you see this; ${esc(name)} never does.`}</p>
            ${note}
            ${rows || fallback ? `<ul class="pl-log">${rows || fallback}</ul>` : ""}`;
        import("./icons.js").then(m => m.hydrate()).catch(() => {});
    }

    // ---------- the pasted answer ----------

    function readAnswer() {
        const text = el.querySelector('[data-pl="reply"]').value;
        const err = el.querySelector('[data-pl="error"]');
        err.hidden = true;
        read = parseReply(text, { plan: data.plan, from: win.from, to: win.to, done: data.done || new Set(), scope: adapter.scope });
        if (!read.days.length) {
            err.textContent = read.same && !read.unread.length ? `The answer has the same ${plural(read.same, "day")} as the plan now: nothing to change.`
                : read.unread.length ? `No day could be read. The first problem: ${read.unread[0].why} ("${read.unread[0].line.slice(0, 80)}").`
                : read.skipped.length ? `The days in it can't change here: ${read.skipped[0].why}.`
                : "There are no dated plan lines in that. Paste the chatbot's whole answer.";
            err.hidden = false;
            el.querySelector('[data-pl="preview"]').innerHTML = "";
            return;
        }
        const before = new Map(daysOf(data.plan).map(d => [d.date, d]));
        const after = new Map(daysOf(applyReply(data.plan, read.days)).map(d => [d.date, d]));
        read.changed = read.days.filter(d => JSON.stringify(before.get(d.date)) !== JSON.stringify(after.get(d.date)))
            .map(d => ({ ...d, before: before.get(d.date), after: after.get(d.date) }));
        ticked = new Set(read.changed.map(d => d.date));
        reasons = {};
        const at = Date.now();
        proposalId = `a${at.toString(36)}`;
        record(c => withProposal(c.context ? c : withContext(c, contextNow()), read, { text, at }).cycle);
        drawPreview();
    }

    // Only what the answer adds: a plan that never has a rest day shouldn't be flagged for it every week.
    function newChecks(accepted) {
        const opts = { from: win.from, record: data.record || null };
        const already = new Set(checkPlan(data.plan, opts));
        return checkPlan(applyReply(data.plan, accepted), opts).filter(c => !already.has(c));
    }

    function drawPreview() {
        const box = el.querySelector('[data-pl="preview"]');
        const accepted = read.changed.filter(d => ticked.has(d.date));
        const checks = newChecks(accepted);
        const same = read.same + read.days.length - read.changed.length;
        const probs = [...read.problems.map(p => `<li><strong>${esc(shortDay(p.date))}</strong>: ${esc(p.why)}</li>`),
            ...read.unread.map(u => `<li><code>${esc(u.line.slice(0, 120))}</code> — ${esc(u.why)}</li>`)];
        const skippedDone = read.skipped.filter(x => /done/.test(x.why)).length;
        const skippedOther = read.skipped.length - skippedDone;
        box.innerHTML = `
            <div class="pl-preview">
                <h3 class="pl-h3">${read.changed.length ? `${plural(read.changed.length, "day")} would change` : "Nothing would change"}</h3>
                <p class="pl-note">${same ? `${plural(same, "day")} came back the same as now. ` : ""}${skippedDone ? `${plural(skippedDone, "day")} already done ${skippedDone === 1 ? "stays" : "stay"} as ${skippedDone === 1 ? "it was" : "they were"}. ` : ""}${skippedOther ? `${plural(skippedOther, "line")} outside these dates left out. ` : ""}Untick any day to keep it as it is.</p>
                <ul class="pl-changes">${read.changed.map(d => `
                    <li class="pl-change">
                        <label><input type="checkbox" data-pl-tick="${esc(d.date)}"${ticked.has(d.date) ? " checked" : ""}>
                            <span><strong>${esc(shortDay(d.date))}</strong> · ${esc(compactChange(d.before, d.after))}
                            <small>Now: ${esc(d.before?.type === "rest" ? "Rest" : `${Number(d.before?.miles) ? `${d.before.miles} mi ` : ""}${d.before?.session || ""}`)}<br>New: ${esc(d.after?.type === "rest" ? "Rest" : `${Number(d.after?.miles) ? `${d.after.miles} mi ` : ""}${d.text || d.after?.session || ""}`)}${d.note ? ` <em>(${esc(d.note)})</em>` : ""}${read.why?.[d.date] ? `<br>Why: ${esc(read.why[d.date])}` : ""}</small></span>
                        </label>
                        ${ticked.has(d.date) ? "" : reasonChips(d.date)}
                    </li>`).join("")}</ul>
                ${checks.length ? `<div class="pl-checks"><strong>${icon("alertTriangle")} Worth a look</strong><ul>${checks.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
                ${probs.length ? `<div class="pl-checks is-info"><strong>${icon("info")} Not read exactly</strong><ul>${probs.join("")}</ul></div>` : ""}
                <p class="pl-note">${self ? "Applying changes your plan now (Marathon page, Today, the watch); you can undo it." : `It goes into ${esc(name)}'s plan editor as a draft you can undo. ${esc(name)} sees it only when you publish.`}</p>
                <div class="pl-actions">
                    <button type="button" class="sb-btn sb-btn-primary" data-pl-act="apply"${accepted.length ? "" : " disabled"}>${self ? `Apply ${plural(accepted.length, "change")}` : `Put ${plural(accepted.length, "change")} in a draft`}</button>
                    <button type="button" class="sb-btn sb-btn-tertiary" data-pl-act="clear">Clear</button>
                </div>
            </div>`;
        import("./icons.js").then(m => m.hydrate()).catch(() => {});
    }

    // Why the coach kept their day: one tap, optional, saved with the week.
    function reasonChips(date) {
        const r = reasons[date] || {};
        return `<div class="pl-reasons" role="group" aria-label="Why keep ${esc(shortDay(date))} as it is">
            <span class="pl-reasons-q">Why keep it? <small>(optional)</small></span>
            ${REASONS.map(x => `<button type="button" class="pl-reason${r.key === x.key ? " is-on" : ""}" data-pl-reason="${esc(x.key)}" data-date="${esc(date)}" aria-pressed="${r.key === x.key}">${esc(x.label)}</button>`).join("")}
            ${r.key === "other" ? `<input class="pl-input pl-reason-words" data-pl-words="${esc(date)}" maxlength="200" placeholder="In a few words" value="${esc(r.words || "")}">` : ""}
        </div>`;
    }

    async function apply() {
        const accepted = read.changed.filter(d => ticked.has(d.date));
        if (!accepted.length) return;
        const checks = newChecks(accepted);
        const btn = el.querySelector('[data-pl-act="apply"]');
        btn.disabled = true;
        try {
            const result = await adapter.apply({ days: accepted, checks, from: win.from, to: win.to });
            if (!result) { btn.disabled = false; return; }
            if (!result.failed) record(c => withApproval(c, { proposalId, taken: new Set(ticked), reasons, planRef: result.planRef || { store: self ? "self" : "coachingPlans" } }));
            // A client's draft: the plan editor shows its own toast with Undo.
            if (result.message) toast(result.message, result.undo ? { action: { label: "Undo", onClick: async () => { await undoApply(result.planRef?.logId, result.undo); toast("Put back the way it was."); if (self) refresh(); } } } : {});
            if (self) refresh();
            else {
                el.querySelector('[data-pl="reply"]').value = "";
                el.querySelector('[data-pl="preview"]').innerHTML = "";
                read = null;
            }
        } catch (error) {
            console.error("Southbound: applying the planned week failed.", error);
            btn.disabled = false;
            toast("Couldn't apply those changes. Nothing was changed.", { type: "error" });
        }
    }

    // Eddie's Undo: the plan goes back, and the week's record says so.
    async function undoApply(logId, run) {
        const ok = await run();
        const c = (cycles || []).find(x => x.approved?.planRef?.logId === logId);
        if (ok !== false && c) record(x => withUndo(x), c);
        return ok;
    }

    el.addEventListener("input", ev => {
        const words = ev.target.closest?.("[data-pl-words]");
        if (words) { reasons[words.dataset.plWords] = { key: "other", words: words.value }; return; }
        if (ev.target.matches('[data-pl="notes"]')) {
            rememberNotes(adapter.key, ev.target.value);
            const out = el.querySelector('[data-pl="out"]');
            if (out && out.dataset.kind !== "brief" && el.querySelector('[data-pl="fold"]')?.open) out.value = fullPrompt();
        }
    });
    el.addEventListener("toggle", ev => {
        const out = el.querySelector('[data-pl="out"]');
        if (ev.target.matches?.('[data-pl="fold"]') && ev.target.open && out.dataset.kind !== "brief") out.value = fullPrompt();
    }, true);
    el.addEventListener("change", ev => {
        const tick = ev.target.closest("[data-pl-tick]");
        if (!tick || !read) return;
        if (tick.checked) ticked.add(tick.dataset.plTick); else ticked.delete(tick.dataset.plTick);
        drawPreview();
    });
    el.addEventListener("click", async ev => {
        const m = ev.target.closest("[data-pl-mode]");
        if (m && m.dataset.plMode !== mode) { mode = m.dataset.plMode; return refresh(); }
        const undo = ev.target.closest("[data-pl-undo]");
        if (undo && adapter.undo) {
            undo.disabled = true;
            if (await undoApply(undo.dataset.plUndo, () => adapter.undo(undo.dataset.plUndo))) toast("Put back the way it was.");
            return refresh();
        }
        const reason = ev.target.closest("[data-pl-reason]");
        if (reason && read) {
            const date = reason.dataset.date;
            reasons[date] = reasons[date]?.key === reason.dataset.plReason ? undefined : { key: reason.dataset.plReason, words: reasons[date]?.words || "" };
            if (!reasons[date]) delete reasons[date];
            drawPreview();
            if (reasons[date]?.key === "other") el.querySelector(`[data-pl-words="${date}"]`)?.focus();
            return;
        }
        const act = ev.target.closest("[data-pl-act]")?.dataset.plAct;
        if (!act) return;
        if (act === "copy" || act === "copy-brief") {
            const text = act === "copy" ? fullPrompt() : planningBrief({ ...context });
            const ok = el.querySelector('[data-pl="ok"]');
            const fold = el.querySelector('[data-pl="fold"]');
            const out = el.querySelector('[data-pl="out"]');
            out.value = text;
            out.dataset.kind = act === "copy" ? "prompt" : "brief";
            record(c => withContext(c, contextNow()));
            const copied = await copyText(text);
            ok.hidden = false;
            ok.innerHTML = copied
                ? `${icon("check")} ${act === "copy" ? "Copied. Paste it into ChatGPT, Claude or any chatbot, then paste its whole answer below." : "Brief copied."}`
                : "Your browser wouldn't copy it. Select everything in the box below and copy it.";
            if (!copied) { fold.open = true; out.focus(); out.select(); }
            return;
        }
        if (act === "read") return readAnswer();
        if (act === "apply") return apply();
        if (act === "clear") {
            el.querySelector('[data-pl="reply"]').value = "";
            el.querySelector('[data-pl="preview"]').innerHTML = "";
            read = null;
        }
    });

    refresh();
    return { refresh, refreshHistory: loadCycles };
}
