/* ==========================================
   Southbound — "Need a change?" (client side)

   The client asks the coach instead of editing the coach's plan:
   a reason (work, feeling run down, travel, pain, race/event, other),
   optionally which day, and a short message. Saved with
   js/changeRequests.js; the coach gets an email and it tops their
   queue. Used on My Plan (plan.html) and a workout's page.

   Also the "Your requests" card: waiting ones (withdrawable) and the
   coach's answers.
========================================== */

import { askForChange, withdrawChangeRequest } from "./changeRequests.js";
import { CHANGE_REASONS, reasonLabel } from "./feedbackModel.js";
import { shortDay } from "./coachingPlanModel.js";
import { toast, sbConfirm, friendlyError } from "./ui.js";
import { icon } from "./icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = ts => { const ms = ts?.toMillis?.() ?? (typeof ts === "number" ? ts : null); return ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""; };

/**
 * coach: { coachUid, coachName }; planId: the coach plan it's about (or null);
 * date: preselected day; dates: [iso] the client can pick from.
 * Resolves to the saved request, or null if they cancelled.
 */
export function openChangeRequestDialog({ coach, planId = null, date = "", dates = [] }) {
    return new Promise(resolve => {
        const d = document.createElement("dialog");
        d.className = "sb-dialog cr-dialog";
        const coachName = coach.coachName || "your coach";
        d.innerHTML = `
            <form class="sb-dialog-form" novalidate>
                <h2 class="sb-dialog-title">Need a change?</h2>
                <p class="sb-dialog-message">Tell ${esc(coachName)} what's going on. They'll adjust your plan and reply here.</p>
                <span class="pw-label">What's up?</span>
                <div class="cr-reasons" role="radiogroup" aria-label="Reason">
                    ${CHANGE_REASONS.map((r, i) => `<label><input type="radio" name="reason" value="${r.value}"${i === 0 ? " checked" : ""}><span>${esc(r.label)}</span></label>`).join("")}
                </div>
                ${dates.length ? `
                <label class="pw-label">Which day? (optional)
                    <select class="sb-dialog-input" name="date">
                        <option value="">Not one day in particular</option>
                        ${dates.map(x => `<option value="${x}"${x === date ? " selected" : ""}>${esc(shortDay(x))}</option>`).join("")}
                    </select>
                </label>` : ""}
                <label class="pw-label">Message<textarea class="sb-dialog-input" name="message" rows="3" maxlength="1000" required placeholder="I can't do Tuesday's workout this week. Could it move to Wednesday?"></textarea></label>
                <p class="clients-msg clients-msg-error" data-error hidden></p>
                <div class="sb-dialog-actions">
                    <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                    <button type="submit" class="sb-btn sb-btn-primary">${icon("send")} Send to ${esc(coachName.split(" ")[0])}</button>
                </div>
            </form>`;
        document.body.appendChild(d);
        let result = null;
        d.addEventListener("close", () => { d.remove(); resolve(result); });
        d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
        d.querySelector('[name="message"]').addEventListener("input", () => { d.querySelector("[data-error]").hidden = true; });
        d.querySelector("form").addEventListener("submit", async event => {
            event.preventDefault();
            const f = new FormData(event.target);
            const message = String(f.get("message") || "").trim();
            const errorEl = d.querySelector("[data-error]");
            if (!message) {
                errorEl.textContent = "Add a short message so your coach knows what to change.";
                errorEl.hidden = false;
                d.querySelector('[name="message"]').focus();
                return;
            }
            const btn = d.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                result = await askForChange({ coachUid: coach.coachUid, planId, date: String(f.get("date") || date || ""), reason: String(f.get("reason")), message });
                toast(`Sent to ${coachName.split(" ")[0]}. They'll reply here and by email.`);
                d.close();
            } catch (error) {
                console.error("Couldn't send the change request:", error);
                errorEl.textContent = error?.code === "permission-denied"
                    ? "Change requests aren't switched on yet. Tell your coach in your weekly check-in for now."
                    : friendlyError(error, "send that");
                errorEl.hidden = false;
                btn.disabled = false;
            }
        });
        d.showModal();
        d.querySelector('[name="message"]').focus();
    });
}

// The client's recent requests: waiting ones first, then answers (30 days).
export function changeRequestsHtml(requests, coachName = "your coach") {
    const recent = (requests || []).filter(r => r.status === "open"
        || (r.resolvedAt?.toMillis?.() ?? r.resolvedAt ?? 0) > Date.now() - 30 * 86400000);
    if (!recent.length) return "";
    return `
        <section class="clients-card cr-list">
            <h2>Your change requests</h2>
            ${recent.map(r => `
            <div class="cr-item${r.status === "open" ? " is-open" : ""}">
                <div class="cr-item-head">
                    <strong>${esc(reasonLabel(r.reason))}${r.date ? ` · ${esc(shortDay(r.date))}` : ""}</strong>
                    <span class="cr-status">${r.status === "open" ? "Waiting for your coach" : `Answered ${esc(when(r.resolvedAt))}`}</span>
                </div>
                <p class="cr-message">"${esc(r.message)}"</p>
                ${r.coachReply ? `<div class="wo-reply cr-reply"><span>${icon("send")} ${esc(coachName)}</span><p>${esc(r.coachReply)}</p></div>` : ""}
                ${r.status === "open" ? `<button type="button" class="sb-btn sb-btn-tertiary cr-withdraw" data-withdraw="${esc(r.id)}">Withdraw</button>` : ""}
            </div>`).join("")}
        </section>`;
}

// Wire "Withdraw" inside a container; onChange(id) after one is withdrawn.
export function bindChangeRequestActions(container, onChange) {
    container.addEventListener("click", async event => {
        const btn = event.target.closest("[data-withdraw]");
        if (!btn) return;
        if (!(await sbConfirm("Your coach won't see it any more.", { title: "Withdraw this request?", confirmLabel: "Withdraw" }))) return;
        try {
            await withdrawChangeRequest(btn.dataset.withdraw);
            toast("Request withdrawn");
            onChange?.(btn.dataset.withdraw);
        } catch (error) {
            console.error(error);
            toast(friendlyError(error, "withdraw that"), { type: "error" });
        }
    });
}
