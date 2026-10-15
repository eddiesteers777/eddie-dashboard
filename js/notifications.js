/* ==========================================
   Notifications (the bell in the top bar)

   Draws the count on the bell and the dialog it opens. What goes in the
   list is decided in js/notificationsModel.js, from the same lists the
   Today "From Your Coach" card reads.
========================================== */

import { notificationItems, localIso } from "./notificationsModel.js";
import { icon } from "./icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Reads the client's lists (each one falls back to empty, like the Today card) and returns the items.
export async function loadNotifications() {
    const [{ listMyCoaches }, { listMyCheckins }, { listMyUpdates }, { listMyMessages }, { listMyPlans }, { profileAccess, meets }] = await Promise.all([
        import("./coachAccess.js"), import("./checkins.js"), import("./clientNotes.js"),
        import("./messages.js"), import("./coachingPlans.js"), import("./navAccess.js")
    ]);
    const [coaches, checkins, updates, messages, plans, access] = await Promise.all([
        listMyCoaches().catch(() => []),
        listMyCheckins().catch(() => []),
        listMyUpdates().catch(() => []),
        listMyMessages().catch(() => []),
        listMyPlans().catch(() => []),
        profileAccess().catch(() => null)
    ]);
    return notificationItems({
        plans, messages, updates, checkins,
        today: localIso(),
        hasCoach: coaches.length > 0,
        canCheckins: access ? meets("checkins", access) : false
    });
}

function openSheet(items) {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.createElement("dialog");
    dialog.className = "sb-dialog sb-notes";
    dialog.setAttribute("aria-labelledby", "sbNotesTitle");
    dialog.innerHTML = `
        <div class="sb-dialog-form">
            <h2 class="sb-dialog-title" id="sbNotesTitle">Notifications</h2>
            <p class="sb-dialog-message">${items.length ? `${items.length} new from your coach and your plan.` : "You’re all caught up. New messages, updates and check-ins show up here."}</p>
            ${items.length ? `<div class="sb-notes-list">${items.map(n => `
                <a class="sb-note" href="${esc(n.link)}">
                    <span class="sb-note-icon">${icon(n.icon)}</span>
                    <span class="sb-note-text"><strong>${esc(n.title)}</strong>${n.detail ? `<span>${esc(n.detail)}</span>` : ""}</span>
                    <span class="sb-note-chevron">${icon("chevronRight")}</span>
                </a>`).join("")}</div>` : ""}
            <div class="sb-dialog-actions"><button type="button" class="sb-btn sb-btn-secondary" data-close>Close</button></div>
        </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
    // Tapping the dimmed backdrop closes it, like the other dialogs (js/ui.js).
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("close", () => { dialog.remove(); opener?.focus(); });
    dialog.showModal();
    dialog.querySelector(".sb-note, [data-close]")?.focus();
}

// Wires every bell on the page (the phone bar's and the computer bar's).
export function initNotifications() {
    const bells = [...document.querySelectorAll("[data-bell]")];
    if (!bells.length) return;
    let items = [];

    const paint = () => {
        const count = items.length;
        for (const bell of bells) {
            const dot = bell.querySelector(".bell-dot");
            if (dot) {
                dot.hidden = count === 0;
                dot.textContent = count > 9 ? "9+" : String(count);
            }
            bell.setAttribute("aria-label", count ? `Notifications, ${count} new` : "Notifications");
        }
    };

    for (const bell of bells) bell.addEventListener("click", () => openSheet(items));
    // Offline or signed out: the lists come back empty and the bell just stays quiet.
    loadNotifications().then(list => { items = list; paint(); }).catch(() => {});
}
