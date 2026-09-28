/* ==========================================
   Southbound — "Copy chatbot prompt" / "Paste chatbot plan" in the plan editor

   promptDialog({ clientUid, firstName, record, plan, done })
     A big box for everything the chatbot should know about the client,
     which dates to redo and whether strength may change. Copies the
     prompt (js/planPrompt.js); if the phone won't copy, shows it to select.
     The notes and choices are remembered per client ("coach-plan-prompts",
     cloud-synced to the coach's own private data, never the client's).
   pasteDialog({ clientUid, firstName, record, plan, done, onApply })
     Paste the chatbot's whole answer. Shows what it read, day by day, what
     it couldn't, and the safety checks; Apply puts it in the editor (Undo,
     then Review & publish as always). Nothing reaches the client until then.
========================================== */

import { buildPrompt, parseReply, applyReply, checkPlan } from "./planPrompt.js";
import { compactChange } from "./coachPlanGenerator.js";
import { shortDay, isoDate, planDateRange } from "./coachingPlanModel.js";
import { icon } from "./icons.js";

const KEY = "coach-plan-prompts";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function saved(uid) {
    try { return (JSON.parse(localStorage.getItem(KEY) || "{}") || {})[uid] || {}; } catch { return {}; }
}
function remember(uid, value) {
    try {
        const all = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
        all[uid] = { ...all[uid], ...value, at: Date.now() };
        localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* the prompt still works without it */ }
}

function dialog(html, extraClass = "") {
    const d = document.createElement("dialog");
    d.className = `sb-dialog pw-dialog pw-gen pw-chat ${extraClass}`.trim();
    d.innerHTML = html;
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.addEventListener("click", ev => { if (ev.target === d) d.close(); });
    d.showModal();
    return d;
}

// Where a redo can start: today, or the plan's start if that's later.
function range(plan, today) {
    const { startDate, endDate } = planDateRange(plan);
    return { first: today > startDate ? today : startDate, last: endDate };
}
const weekEnds = (plan, from) => (plan.weeks || []).map(w => w.days?.at(-1)?.date).filter(x => x && x >= from);

export function promptDialog({ clientUid, firstName, record, plan, done = new Set() }) {
    const today = isoDate(new Date());
    const { first, last } = range(plan, today);
    const s = saved(clientUid);
    const from = s.from && s.from >= first && s.from <= last ? s.from : first;
    const d = dialog(`
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">${icon("copy")} Copy a prompt for a chatbot</h2>
            <p class="sb-dialog-message">Write everything the chatbot should know about ${esc(firstName)}. The prompt adds their profile (first name only), this plan and the exact answer format, so the reply can be pasted straight back in.</p>
            <label class="pw-label">What should change, and why
                <textarea class="sb-dialog-input pw-chat-notes" name="notes" rows="8" maxlength="6000" placeholder="e.g. Sore left knee since Saturday: no hills or speed for 2 weeks. Travels Tue–Thu next week, hotel gym only. Wants Sundays off. Loves the long run, hates the treadmill.">${esc(s.notes || "")}</textarea>
            </label>
            <div class="pw-gen-grid">
                <label class="pw-label">From<input class="sb-dialog-input" type="date" name="from" min="${first}" max="${last}" value="${esc(from)}"></label>
                <label class="pw-label pw-gen-wide">Through<select class="sb-dialog-input" name="to">
                    <option value="">The end of the plan</option>
                    ${weekEnds(plan, first).map(dt => `<option value="${dt}"${s.to === dt ? " selected" : ""}>${esc(shortDay(dt))}</option>`).join("")}
                </select></label>
            </div>
            <fieldset class="pw-gen-what">
                <legend class="pw-label">It may change</legend>
                <label><input type="radio" name="scope" value="all"${s.scope !== "runs" ? " checked" : ""}><span>Runs and strength</span></label>
                <label><input type="radio" name="scope" value="runs"${s.scope === "runs" ? " checked" : ""}><span>Runs only</span></label>
            </fieldset>
            <div data-el="shown" hidden>
                <p class="pw-chat-ok" data-el="ok"></p>
                <label class="pw-label">The prompt<textarea class="sb-dialog-input pw-chat-out" data-el="out" rows="8" readonly></textarea></label>
            </div>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Close</button>
                <button type="submit" class="sb-btn sb-btn-primary">${icon("copy")} Copy prompt</button>
            </div>
        </form>`);
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    const form = d.querySelector("form");
    form.querySelector('[name="notes"]').addEventListener("input", ev => remember(clientUid, { notes: ev.target.value }));
    form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const f = new FormData(form);
        const choice = {
            notes: String(f.get("notes") || ""),
            from: String(f.get("from") || first) < first ? first : String(f.get("from") || first),
            to: String(f.get("to") || "") || null,
            scope: f.get("scope") === "runs" ? "runs" : "all"
        };
        remember(clientUid, choice);
        const text = buildPrompt({ firstName, record, notes: choice.notes, plan, from: choice.from, to: choice.to, scope: choice.scope, today });
        const out = d.querySelector('[data-el="out"]');
        out.value = text;
        d.querySelector('[data-el="shown"]').hidden = false;
        let copied = false;
        try { await navigator.clipboard.writeText(text); copied = true; } catch { copied = false; }
        const skipped = [...done].filter(x => x >= choice.from).length;
        d.querySelector('[data-el="ok"]').innerHTML = copied
            ? `${icon("check")} Copied. Paste it into ChatGPT, Claude or any chatbot. When it answers, copy its whole reply and choose <strong>Paste chatbot plan</strong>.${skipped ? ` Days ${esc(firstName)} already did stay as they are.` : ""}`
            : `Your browser wouldn't copy it. Select everything in the box below, copy it, and paste it into the chatbot.`;
        if (!copied) { out.focus(); out.select(); }
        d.querySelector('button[type="submit"]').innerHTML = `${icon("copy")} Copy again`;
    });
}

export function pasteDialog({ clientUid, firstName, record, plan, done = new Set(), onApply }) {
    const today = isoDate(new Date());
    const { first } = range(plan, today);
    const s = saved(clientUid);
    const from = s.from && s.from >= first ? s.from : first;
    const opts = { plan, from, to: s.to || null, done, scope: s.scope === "runs" ? "runs" : "all" };
    const d = dialog(`
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">${icon("clipboard")} Paste the chatbot's plan</h2>
            <p class="sb-dialog-message">Copy the chatbot's whole answer and paste it here. Southbound reads every dated line; everything else is ignored. You'll see what changes before anything does.</p>
            <label class="pw-label">The chatbot's answer
                <textarea class="sb-dialog-input pw-chat-reply" name="reply" rows="10" placeholder="2026-10-06 Tue | workout | 6 | 1.5mi WU; 5x3min @ 5K; 2min jog; 1.5mi CD | none | …"></textarea>
            </label>
            <p class="pw-gen-error" data-el="error" role="alert" hidden></p>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">Read it</button>
            </div>
        </form>`);
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.querySelector("form").addEventListener("submit", ev => {
        ev.preventDefault();
        const text = String(new FormData(ev.target).get("reply") || "");
        const read = parseReply(text, opts);
        const err = d.querySelector('[data-el="error"]');
        if (!read.days.length) {
            err.textContent = read.same && !read.unread.length ? `The answer has the same ${read.same} day${read.same === 1 ? "" : "s"} as the plan now: nothing to change.` : read.unread.length
                ? `No day could be read. The first problem: ${read.unread[0].why} ("${read.unread[0].line.slice(0, 80)}").`
                : read.skipped.length ? `The days in it can't change here: ${read.skipped[0].why}.` : "There are no dated plan lines in that. Paste the chatbot's whole answer.";
            err.hidden = false;
            return;
        }
        d.close();
        preview(read);
    });

    function preview(read) {
        const next = applyReply(plan, read.days);
        const before = new Map(plan.weeks.flatMap(w => w.days).map(x => [x.date, x]));
        const changed = next.weeks.flatMap(w => w.days).filter(x => {
            const b = before.get(x.date);
            return read.days.some(r => r.date === x.date) && JSON.stringify(b) !== JSON.stringify(x);
        });
        const checks = checkPlan(next, { from, record });
        const lines = changed.map(x => `<li><strong>${esc(shortDay(x.date))}</strong> · ${esc(compactChange(before.get(x.date), x))}</li>`);
        const probs = read.problems.map(p => `<li><strong>${esc(shortDay(p.date))}</strong>: ${esc(p.why)}</li>`);
        const unread = read.unread.map(u => `<li><code>${esc(u.line.slice(0, 120))}</code> — ${esc(u.why)}</li>`);
        const skippedDone = read.skipped.filter(x => /done/.test(x.why)).length;
        const skippedOther = read.skipped.length - skippedDone;
        const p = dialog(`
            <div class="sb-dialog-form">
                <h2 class="sb-dialog-title">${changed.length} day${changed.length === 1 ? "" : "s"} change</h2>
                <p class="sb-dialog-message">Read ${read.days.length + read.same} day${read.days.length + read.same === 1 ? "" : "s"} from the answer${read.same + read.days.length - changed.length ? `; ${read.same + read.days.length - changed.length} ${read.same + read.days.length - changed.length === 1 ? "is" : "are"} the same as now` : ""}.${skippedDone ? ` ${skippedDone} day${skippedDone === 1 ? "" : "s"} ${esc(firstName)} already did ${skippedDone === 1 ? "stays" : "stay"} as ${skippedDone === 1 ? "it was" : "they were"}.` : ""}${skippedOther ? ` ${skippedOther} line${skippedOther === 1 ? " was" : "s were"} outside these dates and left out.` : ""}</p>
                ${checks.length ? `<div class="pw-gen-notes"><strong>${icon("alertTriangle")} Worth a look</strong><ul>${checks.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
                ${probs.length || unread.length ? `<div class="pw-gen-notes pw-chat-problems"><strong>${icon("info")} Not read exactly</strong><ul>${[...probs, ...unread].join("")}</ul><p class="pw-meta">These days keep what could be read; fix them in the editor after applying.</p></div>` : ""}
                ${lines.length ? `<ul class="pw-chat-changes">${lines.join("")}</ul>` : `<p class="sb-dialog-message">Nothing in the answer differs from the plan.</p>`}
                <p class="sb-dialog-message">It goes into your editor (you can undo). ${esc(firstName)} sees it when you publish.</p>
                <div class="sb-dialog-actions">
                    <button type="button" class="sb-btn sb-btn-secondary" data-act="back">Back</button>
                    <button type="button" class="sb-btn sb-btn-primary" data-act="apply"${changed.length ? "" : " disabled"}>Apply ${changed.length} change${changed.length === 1 ? "" : "s"}</button>
                </div>
            </div>`, "pw-chat-preview");
        p.querySelector('[data-act="back"]').addEventListener("click", () => { p.close(); pasteDialog({ clientUid, firstName, record, plan, done, onApply }); });
        p.querySelector('[data-act="apply"]').addEventListener("click", () => {
            p.close();
            onApply({
                plan: next,
                message: `${changed.length} day${changed.length === 1 ? "" : "s"} from the chatbot's plan`,
                notes: [...checks, ...read.problems.map(x => `${shortDay(x.date)}: ${x.why}.`)]
            });
        });
    }
}
