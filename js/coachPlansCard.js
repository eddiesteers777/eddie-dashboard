/* ==========================================
   Southbound — "Plans from a coach" card on Programs

   Lists this account's copies of coach plans (coach-plans) so one can
   be taken off the calendar by hand (js/coachPlanRemoval.js). A coach
   account also sees "Plans you've published", every coachingPlans
   header it wrote, with Unassign / Restore (setPlanArchived), the same
   archive the Client Hub Plan tab uses.
========================================== */

import { loadCoachPlans, saveCoachPlans } from "./coachPlanStore.js";
import { planRange, canRemove, removeCoachPlan, restoreCoachPlan, archiveByCoachPlanId } from "./coachPlanRemoval.js";
import { cachedRole } from "./role.js";
import { toast, sbConfirm, friendlyError } from "./ui.js";

const card = document.getElementById("pgCoachPlans");
let published = null; // null = not loaded (or not a coach)

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function shortDate(iso) {
    if (!iso) return "";
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function rangeText(entry) {
    const { start, end } = planRange(entry);
    return start ? `${shortDate(start)} – ${shortDate(end)}` : "No dates";
}

function myCopyRow(entry, role) {
    const on = entry.status === "active";
    const removable = canRemove(entry, role);
    const meta = [`From ${entry.coachName || "your coach"}`, rangeText(entry)].join(" · ");
    const action = on
        ? (removable ? `<button type="button" class="sb-btn sb-btn-secondary" data-cp-remove="${esc(entry.id)}">Remove</button>` : "")
        : (entry.removedByClient ? `<button type="button" class="sb-btn sb-btn-tertiary" data-cp-restore="${esc(entry.id)}">Put back</button>` : "");
    return `<div class="pg-cp-row">
        <span class="pg-item-main"><strong>${esc(entry.name || "Coach plan")}</strong><span class="pg-data">${esc(meta)}</span></span>
        <span class="pg-chip${on ? " is-sage" : ""}">${on ? "On calendar" : entry.removedByClient ? "Removed" : "Archived"}</span>
        ${action}
    </div>`;
}

function publishedRow(header) {
    const on = header.status !== "archived";
    const who = header.clientName || "Client";
    return `<div class="pg-cp-row">
        <span class="pg-item-main"><strong>${esc(header.name || "Plan")}</strong><span class="pg-data">${esc(`For ${who} · version ${header.version || 1}`)}</span></span>
        <span class="pg-chip${on ? " is-sage" : ""}">${on ? "Assigned" : "Unassigned"}</span>
        <button type="button" class="sb-btn ${on ? "sb-btn-secondary" : "sb-btn-tertiary"}" data-cp-${on ? "unassign" : "reassign"}="${esc(header.id)}">${on ? "Unassign" : "Restore"}</button>
    </div>`;
}

function render() {
    if (!card) return;
    const role = cachedRole();
    const mine = loadCoachPlans().filter(p => p.source === "coach");
    const parts = [];
    if (mine.length) {
        parts.push(`<div class="pg-card-head"><span class="pg-kicker">Plans from a coach</span></div>
            <p class="pg-p">These show on your Running calendar and Today. Removing one takes it off this calendar only.</p>
            ${mine.map(e => myCopyRow(e, role)).join("")}`);
    }
    if (role === "coach" && published?.length) {
        parts.push(`<div class="pg-card-head pg-cp-gap"><span class="pg-kicker">Plans you've published</span></div>
            <p class="pg-p">Unassign takes a plan off that client's calendar. Its history is kept and you can restore it.</p>
            ${published.map(publishedRow).join("")}`);
    }
    card.innerHTML = parts.join("");
    card.hidden = !parts.length;
}

async function loadPublished() {
    if (cachedRole() !== "coach") return;
    try {
        const { listMyCoachPlans } = await import("./coachingPlans.js");
        published = (await listMyCoachPlans()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    } catch (error) {
        console.warn("Southbound: published plans unavailable.", error?.code || error);
        published = null;
    }
    render();
}

card?.addEventListener("click", async event => {
    const btn = event.target.closest("button");
    if (!btn) return;
    try {
        if (btn.dataset.cpRemove) {
            const entry = loadCoachPlans().find(p => p.id === btn.dataset.cpRemove);
            if (!(await sbConfirm(`${entry?.name || "This plan"} comes off your Running calendar and Today. The coach's plan isn't changed, and you can put it back.`, { title: "Remove this plan?", confirmLabel: "Remove", danger: true }))) return;
            await saveCoachPlans(removeCoachPlan(loadCoachPlans(), btn.dataset.cpRemove));
            toast("Plan removed from your calendar");
        } else if (btn.dataset.cpRestore) {
            await saveCoachPlans(restoreCoachPlan(loadCoachPlans(), btn.dataset.cpRestore));
            toast("Plan is back on your calendar");
        } else if (btn.dataset.cpUnassign || btn.dataset.cpReassign) {
            const id = btn.dataset.cpUnassign || btn.dataset.cpReassign;
            const archive = Boolean(btn.dataset.cpUnassign);
            const header = published?.find(h => h.id === id);
            if (archive && !(await sbConfirm(`${header?.name || "This plan"} comes off ${header?.clientName || "the client"}'s calendar. Its history is kept and you can restore it.`, { title: "Unassign this plan?", confirmLabel: "Unassign", danger: true }))) return;
            const { setPlanArchived } = await import("./coachingPlans.js");
            await setPlanArchived(id, archive);
            if (header) header.status = archive ? "archived" : "active";
            // A plan addressed to this same account: its copy here follows.
            const local = loadCoachPlans();
            if (local.some(p => p.coachPlanId === id)) await saveCoachPlans(archiveByCoachPlanId(local, id, archive));
            toast(archive ? "Plan unassigned" : "Plan restored");
        } else return;
        window.dispatchEvent(new CustomEvent("eddieos:running-programs-changed"));
        render();
    } catch (error) {
        toast(friendlyError(error, "change that plan"));
    }
});

render();
loadPublished();
