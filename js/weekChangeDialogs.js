/* ==========================================
   Southbound — the dialogs for changing your week

   openChangeMenu(item, ctx)   the ⋮ on a workout: Move / Skip /
                               Undo skip / Put the original back
   openFeelDialog(ctx)         "Not feeling 100%?" for 1–7 days, with a
                               preview of every change first
   ctx = { week, inputs, today, onChange }
   Rules and words: js/weekChanges.js. Writes: js/weekChangeData.js.
   A coach plan's workout is never edited here: moving or adjusting it
   becomes a request to the coach, skipping it is logged as skipped.
========================================== */

import {
    SKIP_REASONS, FEEL_DAYS, FEEL_MODES, changeMode, itemActions, itemText,
    moveTargets, moveWarnings, feelChanges, coachMoveMessage, coachFeelMessage
} from "./weekChanges.js";
import { moveItem, skipItem, unskipItem, restoreItem, applyFeelChanges, coachFor } from "./weekChangeData.js";
import { buildDay } from "./weekModel.js";
import { addDays, shortDay } from "./coachingPlanModel.js";
import { icon } from "./icons.js";
import { toast, friendlyError } from "./ui.js";
import { QUEUED_NOTE } from "./offlineWrite.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const firstName = name => String(name || "your coach").split(" ")[0];

// A dialog that's a bottom sheet on phones. Resolves when closed.
function sheet(html, onOpen) {
    return new Promise(resolve => {
        const d = document.createElement("dialog");
        d.className = "sb-dialog wc-dialog";
        d.innerHTML = html;
        document.body.appendChild(d);
        let result = null;
        const done = value => { result = value; d.close(); };
        d.addEventListener("close", () => { d.remove(); resolve(result); });
        d.addEventListener("click", event => {
            if (event.target === d) d.close();
            if (event.target.closest("[data-cancel]")) d.close();
        });
        d.showModal();
        onOpen?.(d, done);
    });
}

function undoToast(message, undo, onChange) {
    toast(message, {
        action: {
            label: "Undo",
            onClick: async () => {
                try { await undo(); onChange?.(); toast("Put back."); }
                catch (error) { toast(error?.code === "stale-undo" ? error.message : friendlyError(error, "undo that"), { type: "error" }); }
            }
        }
    });
}

async function askCoach(item, { message, reason, date, title }) {
    const coach = coachFor(item);
    if (!coach?.coachUid) { toast("Couldn't find your coach for this plan.", { type: "error" }); return null; }
    const { openChangeRequestDialog } = await import("./changeRequestDialog.js");
    return openChangeRequestDialog({ coach: { coachUid: coach.coachUid, coachName: coach.coachName }, planId: coach.coachPlanId, date, dates: date ? [date] : [], message, reason, title });
}

// ---------- The ⋮ menu ----------

export async function openChangeMenu(item, ctx) {
    const actions = itemActions(item);
    if (!actions.length) return;
    const mode = changeMode(item);
    const coachName = firstName(coachFor(item)?.coachName);
    const canMove = moveTargets(ctx.week, item, ctx.today).length > 0;
    const rows = [
        actions.includes("move") && canMove ? { value: "move", iconName: "calendar", label: mode === "coach" ? `Ask ${coachName} to move it` : "Move to another day", hint: mode === "coach" ? "Your coach's plan: they make the change." : "Any day left this week." } : null,
        actions.includes("skip") ? { value: "skip", iconName: "close", label: "Skip it", hint: mode === "coach" ? `${coachName} sees it was skipped, and why.` : "On purpose, with a reason. Not counted as missed." } : null,
        actions.includes("unskip") ? { value: "unskip", iconName: "refresh", label: "Undo skip", hint: "Put it back on your week." } : null,
        actions.includes("restore") ? { value: "restore", iconName: "refresh", label: "Put the original back", hint: `It was ${item.adjusted}.` } : null
    ].filter(Boolean);
    if (!rows.length) return;
    const choice = await sheet(`
        <div class="sb-dialog-form">
            <h2 class="sb-dialog-title">${esc(itemText(item))}</h2>
            <p class="sb-dialog-message">${esc(shortDay(item.source.date))}${item.planName ? ` · ${esc(item.planName)}` : ""}</p>
            <div class="wc-menu">
                ${rows.map(r => `
                    <button type="button" class="wc-menu-row" data-pick="${r.value}">
                        <span class="wc-menu-icon">${icon(r.iconName)}</span>
                        <span class="wc-menu-text"><strong>${esc(r.label)}</strong><small>${esc(r.hint)}</small></span>
                        ${icon("chevronRight")}
                    </button>`).join("")}
            </div>
            <div class="sb-dialog-actions"><button type="button" class="sb-btn sb-btn-tertiary" data-cancel>Cancel</button></div>
        </div>`, (d, done) => d.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => done(b.dataset.pick))));
    if (choice === "move") return openMoveDialog(item, ctx);
    if (choice === "skip") return openSkipDialog(item, ctx);
    if (choice === "unskip") return run(() => unskipItem(item), `${item.title} is back on your week.`, ctx);
    if (choice === "restore") return run(() => restoreItem(item), `${item.title} is back to what it was.`, ctx);
}

async function run(fn, message, ctx) {
    try {
        const undo = await fn();
        ctx.onChange?.();
        undoToast(message, undo, ctx.onChange);
    } catch (error) {
        console.error("Changing the week failed:", error);
        toast(friendlyError(error, "change that"), { type: "error" });
    }
}

// ---------- Move ----------

export async function openMoveDialog(item, ctx) {
    const mode = changeMode(item);
    const targets = moveTargets(ctx.week, item, ctx.today);
    const first = targets.find(t => !t.blocked);
    const chosen = await sheet(`
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">Move ${esc(itemText(item))}</h2>
            <p class="sb-dialog-message">${mode === "coach"
                ? `From ${esc(shortDay(item.source.date))}. Pick a day and ${esc(firstName(coachFor(item)?.coachName))} gets the request.`
                : `From ${esc(shortDay(item.source.date))} to:`}</p>
            <div class="wc-days" role="radiogroup" aria-label="New day">
                ${targets.map(t => `
                    <label class="wc-day${t.blocked ? " is-blocked" : ""}">
                        <input type="radio" name="to" value="${t.date}"${t === first ? " checked" : ""}${t.blocked ? " disabled" : ""}>
                        <span class="wc-day-text">
                            <strong>${esc(t.label)}</strong>
                            <small>${t.blocked ? esc(t.blocked) : t.swap ? `Swaps: ${esc(t.swap)} moves to ${esc(shortDay(item.source.date).split(",")[0])}` : mode === "self" && t.there !== "Rest" ? `Also on: ${esc(t.there)}` : esc(t.there)}</small>
                        </span>
                    </label>`).join("")}
            </div>
            <p class="wc-warn" data-warn hidden></p>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary"${first ? "" : " disabled"}>${mode === "coach" ? "Next" : "Move it"}</button>
            </div>
        </form>`, (d, done) => {
        const warnEl = d.querySelector("[data-warn]");
        const showWarnings = () => {
            const to = d.querySelector('input[name="to"]:checked')?.value;
            const warnings = to ? moveWarnings(ctx.week, item, to) : [];
            warnEl.hidden = !warnings.length;
            warnEl.innerHTML = warnings.map(w => `${icon("alertTriangle")} ${esc(w)}`).join("<br>");
        };
        d.addEventListener("change", showWarnings);
        showWarnings();
        d.querySelector("form").addEventListener("submit", event => {
            event.preventDefault();
            const to = d.querySelector('input[name="to"]:checked')?.value;
            if (to) done(to);
        });
    });
    if (!chosen) return;
    if (mode === "coach") {
        const saved = await askCoach(item, { message: coachMoveMessage(item, chosen), reason: "work", date: item.source.date, title: "Ask to move it" });
        if (saved) ctx.onRequest?.(saved);
        return;
    }
    return run(() => moveItem(item, chosen), `${item.title} moved to ${shortDay(chosen).split(",")[0]}.`, ctx);
}

// ---------- Skip ----------

export async function openSkipDialog(item, ctx) {
    const mode = changeMode(item);
    const answer = await sheet(`
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">Skip ${esc(itemText(item))}?</h2>
            <p class="sb-dialog-message">${mode === "coach"
                ? `${esc(firstName(coachFor(item)?.coachName))} will see it was skipped and why.`
                : "Skipping on purpose is fine. It shows as skipped, not missed."}</p>
            <span class="pw-label">Why?</span>
            <div class="cr-reasons" role="radiogroup" aria-label="Reason">
                ${SKIP_REASONS.map((r, i) => `<label><input type="radio" name="reason" value="${r.value}"${i === 0 ? " checked" : ""}><span>${esc(r.label)}</span></label>`).join("")}
            </div>
            <label class="pw-label">Anything else? (optional)<textarea class="sb-dialog-input" name="note" rows="2" maxlength="300"></textarea></label>
            <p class="clients-msg clients-msg-error" data-error hidden></p>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">Skip it</button>
            </div>
        </form>`, (d, done) => {
        d.querySelector("form").addEventListener("submit", event => {
            event.preventDefault();
            const f = new FormData(event.target);
            done({ reason: String(f.get("reason") || ""), note: String(f.get("note") || "") });
        });
    });
    if (!answer) return;
    try {
        const out = await skipItem(item, answer);
        ctx.onChange?.();
        if (out.undo) undoToast(`${item.title} skipped.`, out.undo, ctx.onChange);
        else toast(out.result?.pendingSync ? QUEUED_NOTE : `Skipped. ${firstName(coachFor(item)?.coachName)} will see it.`);
    } catch (error) {
        console.error("Skipping failed:", error);
        toast(friendlyError(error, "skip that"), { type: "error" });
    }
}

// ---------- Not feeling 100% ----------

function feelDays(ctx, count) {
    const days = [];
    for (let i = 0; i < count; i++) days.push(buildDay(addDays(ctx.today, i), ctx.inputs, ctx.today));
    return days;
}

function previewHtml(changes) {
    const shown = changes.filter(c => c.action !== "keep" || c.after);
    if (!shown.length) return `<p class="wc-empty">Nothing to change: no runs or strength to adjust in those days.</p>`;
    return `<ul class="wc-preview">${shown.map(c => `
        <li class="is-${c.action}">
            <span class="wc-preview-day">${esc(shortDay(c.date).split(",")[0])}</span>
            <span class="wc-preview-text"><span>${esc(c.before)}</span> ${icon("chevronRight")} <strong>${esc(c.action === "skip" ? (c.kind === "run" ? "Rest" : "Skip") : c.after)}</strong>${c.mode === "coach" ? `<small>Your coach's plan: sent as a request</small>` : ""}</span>
        </li>`).join("")}</ul>`;
}

/**
 * "Not feeling 100%?" — ctx = { inputs, today, onChange, onRequest }.
 */
export async function openFeelDialog(ctx) {
    const state = { days: 3, mode: "easy", strength: "keep" };
    const compute = () => {
        const days = feelDays(ctx, state.days);
        const items = new Map(days.flatMap(d => d.items).map(i => [i.id, i]));
        return { days, items, changes: feelChanges(days, state) };
    };
    const answer = await sheet(`
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">Not feeling 100%?</h2>
            <p class="sb-dialog-message">Ease off for a few days. You'll see every change before anything moves, and race days stay as they are.</p>
            <span class="pw-label">For how long?</span>
            <div class="cr-reasons" role="radiogroup" aria-label="How long">
                ${FEEL_DAYS.map(n => `<label><input type="radio" name="days" value="${n}"${n === state.days ? " checked" : ""}><span>${n === 1 ? "Just today" : n === 7 ? "A week" : `${n} days`}</span></label>`).join("")}
            </div>
            <span class="pw-label">Runs</span>
            <div class="wc-modes" role="radiogroup" aria-label="Runs">
                ${FEEL_MODES.map(m => `<label class="wc-mode"><input type="radio" name="mode" value="${m.value}"${m.value === state.mode ? " checked" : ""}><span><strong>${esc(m.label)}</strong><small>${esc(m.hint)}</small></span></label>`).join("")}
            </div>
            <span class="pw-label">Strength</span>
            <div class="cr-reasons" role="radiogroup" aria-label="Strength">
                <label><input type="radio" name="strength" value="keep" checked><span>Keep it</span></label>
                <label><input type="radio" name="strength" value="skip"><span>Skip it</span></label>
            </div>
            <span class="pw-label">What changes</span>
            <div data-preview aria-live="polite"></div>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary" data-apply>Change my plan</button>
            </div>
        </form>`, (d, done) => {
        const draw = () => {
            const f = new FormData(d.querySelector("form"));
            state.days = Number(f.get("days")) || 3;
            state.mode = String(f.get("mode") || "easy");
            state.strength = String(f.get("strength") || "keep");
            const { changes } = compute();
            d.querySelector("[data-preview]").innerHTML = previewHtml(changes);
            const real = changes.filter(c => c.action !== "keep");
            const self = real.some(c => c.mode === "self");
            const coach = real.some(c => c.mode === "coach");
            const btn = d.querySelector("[data-apply]");
            btn.disabled = !real.length;
            btn.textContent = self && coach ? "Change mine, ask my coach" : coach ? "Ask my coach" : "Change my plan";
        };
        d.addEventListener("change", draw);
        draw();
        d.querySelector("form").addEventListener("submit", event => { event.preventDefault(); done({ ...state }); });
    });
    if (!answer) return;
    const { items, changes } = compute();
    const real = changes.filter(c => c.action !== "keep");
    let undo = null;
    try {
        if (real.some(c => c.mode === "self")) {
            const out = await applyFeelChanges(real, items);
            undo = out.undo;
            ctx.onChange?.();
        }
    } catch (error) {
        console.error("Adjusting the plan failed:", error);
        toast(friendlyError(error, "change your plan"), { type: "error" });
        return;
    }
    const coachChanges = real.filter(c => c.mode === "coach");
    if (coachChanges.length) {
        const item = items.get(coachChanges[0].itemId);
        const to = addDays(ctx.today, answer.days - 1);
        const saved = await askCoach(item, {
            message: coachFeelMessage(coachChanges, { from: ctx.today, to, mode: answer.mode }),
            reason: "fatigue",
            date: coachChanges[0].date,
            title: "Not feeling 100%"
        });
        if (saved) ctx.onRequest?.(saved);
    }
    if (undo) undoToast("Your plan is eased off. Feel better.", undo, ctx.onChange);
}
