/* ==========================================
   Southbound — client package card

   Read-only client view of the coach-assigned package entitlement.
   Session usage comes from the same session logs used by the coach;
   this card never exposes coach notes or management controls.
========================================== */

import { listMyPackages } from "./clientPackages.js";
import { listSessionLogs } from "./sessionLogs.js";
import { countCompletedPackageSessions, packageRemainingSessions } from "./clientPackageModel.js";
import { openStripeCustomerPortal, startStripeCheckout } from "./stripeBilling.js";
import { friendlyError, toast } from "./ui.js";

const esc = value => String(value ?? "").replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"' : "&quot;" }[c])
);

function statusLabel(status) {
    return status === "paused" ? "Paused" : status === "completed" ? "Completed" : status === "cancelled" ? "Cancelled" : "Active";
}

function paymentStatusLabel(status) {
    return status === "paid" ? "Paid" : status === "past_due" ? "Past due" : status === "comped" ? "Comped" : "Pending";
}

export function paymentAction(pkg) {
    if (pkg.status !== "active") return null;
    if (pkg.paymentStatus === "comped" || pkg.paymentStatus === "paid") return null;
    if (pkg.billingModel === "subscription" && pkg.paymentStatus === "past_due" && pkg.stripeSubscriptionId) {
        return "Manage Billing";
    }
    return pkg.billingModel === "subscription"
        ? (pkg.paymentStatus === "past_due" ? "Retry payment" : "Subscribe")
        : (pkg.paymentStatus === "past_due" ? "Retry payment" : "Pay now");
}

export function paymentActionType(pkg) {
    return pkg.billingModel === "subscription" && pkg.paymentStatus === "past_due" && pkg.stripeSubscriptionId
        ? "portal"
        : "checkout";
}

function handleStripeReturn() {
    const params = new URLSearchParams(location.search);
    const result = params.get("stripe");
    if (!result) return;
    if (result === "success") {
        toast("Payment submitted. Stripe is confirming it now. Your package will update after Stripe confirms payment.");
    } else if (result === "cancelled") {
        toast("Payment cancelled. Your package was not marked paid.", { type: "info" });
    }
    params.delete("stripe");
    params.delete("session_id");
    const next = params.toString();
    const cleanUrl = location.pathname + (next ? "?" + next : "") + location.hash;
    history.replaceState(null, "", cleanUrl);
}

function packageLink(pkg) {
    return ["soccer_1on1", "soccer_group"].includes(pkg?.service) ? "schedule.html" : "plan.html";
}

function dateRange(pkg) {
    const parts = [];
    if (pkg?.startsAt) parts.push(`Starts ${new Date(`${pkg.startsAt}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    if (pkg?.endsAt) parts.push(`Ends ${new Date(`${pkg.endsAt}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    return parts.join(" · ");
}

export async function renderClientPackageCard() {
    handleStripeReturn();
    const section = document.getElementById("clientPackageSection");
    const body = document.getElementById("clientPackageBody");
    if (!section || !body) return;

    try {
        const [packages, logs] = await Promise.all([
            listMyPackages(),
            listSessionLogs("client")
        ]);

        const visible = (packages || [])
            .filter(pkg => pkg.status === "active" || pkg.status === "paused")
            .sort((a, b) => String(b.startsAt || "").localeCompare(String(a.startsAt || "")));

        if (!visible.length) {
            section.hidden = true;
            return;
        }

        const wrappedLogs = (logs || []).map(log => ({ log }));
        body.innerHTML = visible.map(pkg => {
            const used = countCompletedPackageSessions(pkg.id, wrappedLogs);
            const remaining = packageRemainingSessions(pkg, used);
            const allowance = Number.isFinite(pkg.sessionAllowance)
                ? `${used} of ${pkg.sessionAllowance} sessions completed · ${remaining} remaining`
                : pkg.cadence === "monthly"
                    ? "Monthly coaching"
                    : pkg.cadence === "weekly"
                        ? "Weekly coaching"
                        : "Ongoing coaching";
            const range = dateRange(pkg);
            const destination = packageLink(pkg);
            const linkLabel = ["soccer_1on1", "soccer_group"].includes(pkg.service) ? "View Sessions" : "View Plan";
            const payLabel = paymentAction(pkg);
            return `
                <div class="eos-package-row">
                    <div class="eos-package-main">
                        <div class="eos-package-head">
                            <strong>${esc(pkg.packageName || pkg.packageId)}</strong>
                            <span class="eos-package-status ${pkg.status === "paused" ? "is-paused" : ""}">${esc(statusLabel(pkg.status))}</span>
                        </div>
                        <span class="eos-package-detail">${esc(allowance)}${range ? ` · ${esc(range)}` : ""} · Billing: ${esc(paymentStatusLabel(pkg.paymentStatus))}</span>
                    </div>
                    <div class="eos-package-actions">
                        <a class="eos-package-link" href="${destination}">${linkLabel} <span aria-hidden="true">→</span></a>
                        ${payLabel ? `<button type="button" class="eos-package-pay" data-pay-package="${esc(pkg.id)}" data-pay-action="${paymentActionType(pkg)}">${payLabel}</button>` : ""}
                    </div>
                </div>`;
        }).join("");

        section.hidden = false;
        body.querySelectorAll("[data-pay-package]").forEach(button => {
            button.addEventListener("click", async () => {
                const id = button.dataset.payPackage;
                const action = button.dataset.payAction;
                button.disabled = true;
                button.textContent = "Opening…";
                try {
                    if (action === "portal") {
                        await openStripeCustomerPortal();
                    } else {
                        await startStripeCheckout(id);
                    }
                } catch (error) {
                    button.disabled = false;
                    button.textContent = paymentAction(visible.find(pkg => pkg.id === id)) || "Pay";
                    toast(friendlyError(error, "start payment"), { type: "error" });
                }
            });
        });
    } catch (error) {
        console.warn("Southbound: client package card unavailable.", error);
        section.hidden = true;
    }
}
