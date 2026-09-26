/* ==========================================
   Southbound — shared UI feedback

   One look for everything the app says back to a person, instead of
   the browser's grey alert()/confirm()/prompt() boxes and scattered
   one-off status text:

     toast(message, { type, duration })     "Saved" / "Couldn't save" pop-up
     sbAlert(message, { title })            -> Promise<void>
     sbConfirm(message, { title, confirmLabel, cancelLabel, danger })
                                            -> Promise<boolean>
     sbPrompt(message, { title, defaultValue, placeholder, confirmLabel,
                         multiline, maxLength })
                                            -> Promise<string | null>
     friendlyError(error, action)           plain-English message for a
                                            failed request (details stay
                                            in the console)
     loadingHtml(label) / emptyHtml({...})  designed loading / empty states

   Dialogs use the native <dialog> element (focus trap, Esc to close,
   always above every overlay). Styles: "UI FEEDBACK" in css/style.css.
   Inline (non-module) page scripts reach the same functions through
   window.SB, set up by js/loadHeader.js.
========================================== */

import { icon } from "./icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Toasts ----------

let toastHost = null;

function host() {
    if (toastHost && document.body.contains(toastHost)) return toastHost;
    toastHost = document.createElement("div");
    toastHost.className = "sb-toast-host";
    toastHost.setAttribute("role", "status");
    toastHost.setAttribute("aria-live", "polite");
    document.body.appendChild(toastHost);
    return toastHost;
}

const TOAST_ICONS = { success: "checkCircle", error: "alertTriangle", info: "info" };

// `action: { label, onClick }` adds a button (e.g. Undo); the toast then stays up longer.
export function toast(message, { type = "success", duration = 3200, action = null } = {}) {
    const el = document.createElement("div");
    el.className = `sb-toast is-${type}`;
    el.innerHTML = `<span class="sb-toast-icon">${icon(TOAST_ICONS[type] || "info")}</span><span class="sb-toast-text">${esc(message)}</span>${action ? `<button type="button" class="sb-toast-action">${esc(action.label)}</button>` : ""}`;
    host().appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-in"));
    const remove = () => {
        el.classList.remove("is-in");
        setTimeout(() => el.remove(), 250);
    };
    const timer = setTimeout(remove, type === "error" ? Math.max(duration, 5000) : action ? Math.max(duration, 7000) : duration);
    el.addEventListener("click", event => {
        clearTimeout(timer);
        remove();
        if (action && event.target.closest(".sb-toast-action")) action.onClick?.();
    });
    return el;
}

// ---------- Dialogs ----------

function openDialog({ title, message, body = "", actions, danger = false, onOpen }) {
    return new Promise(resolve => {
        const dialog = document.createElement("dialog");
        dialog.className = `sb-dialog${danger ? " is-danger" : ""}`;
        dialog.innerHTML = `
            <form method="dialog" class="sb-dialog-form">
                ${title ? `<h2 class="sb-dialog-title">${esc(title)}</h2>` : ""}
                ${message ? `<p class="sb-dialog-message">${esc(message)}</p>` : ""}
                ${body}
                <div class="sb-dialog-actions">
                    ${actions.map(a => `<button type="${a.submit ? "submit" : "button"}" value="${a.value}" class="sb-btn ${a.className}">${esc(a.label)}</button>`).join("")}
                </div>
            </form>`;
        document.body.appendChild(dialog);

        let result;
        dialog.querySelectorAll(".sb-dialog-actions button").forEach(btn => {
            btn.addEventListener("click", event => {
                event.preventDefault();
                result = btn.value;
                dialog.close();
            });
        });
        dialog.querySelector("form").addEventListener("submit", event => {
            event.preventDefault();
            result = "ok";
            dialog.close();
        });
        dialog.addEventListener("close", () => {
            const input = dialog.querySelector(".sb-dialog-input");
            resolve({ action: result || "cancel", value: input ? input.value : undefined });
            dialog.remove();
        });
        // Tapping the dimmed backdrop cancels, like a native sheet.
        dialog.addEventListener("click", event => {
            if (event.target === dialog) { result = "cancel"; dialog.close(); }
        });

        dialog.showModal();
        onOpen?.(dialog);
    });
}

export async function sbAlert(message, { title = "", okLabel = "OK" } = {}) {
    await openDialog({
        title, message,
        actions: [{ label: okLabel, value: "ok", className: "sb-btn-primary", submit: true }],
        onOpen: d => d.querySelector(".sb-btn-primary").focus()
    });
}

export async function sbConfirm(message, { title = "", confirmLabel = "OK", cancelLabel = "Cancel", danger = false } = {}) {
    const { action } = await openDialog({
        title, message, danger,
        actions: [
            { label: cancelLabel, value: "cancel", className: "sb-btn-secondary" },
            { label: confirmLabel, value: "ok", className: danger ? "sb-btn-danger" : "sb-btn-primary", submit: true }
        ],
        onOpen: d => d.querySelector(danger ? ".sb-btn-secondary" : ".sb-btn-primary").focus()
    });
    return action === "ok";
}

export async function sbPrompt(message, { title = "", defaultValue = "", placeholder = "", confirmLabel = "Save", cancelLabel = "Cancel", multiline = false, maxLength = 500 } = {}) {
    const field = multiline
        ? `<textarea class="sb-dialog-input" rows="3" maxlength="${maxLength}" placeholder="${esc(placeholder)}" aria-label="${esc(title || message)}">${esc(defaultValue)}</textarea>`
        : `<input class="sb-dialog-input" type="text" maxlength="${maxLength}" value="${esc(defaultValue)}" placeholder="${esc(placeholder)}" aria-label="${esc(title || message)}">`;
    const { action, value } = await openDialog({
        title, message, body: field,
        actions: [
            { label: cancelLabel, value: "cancel", className: "sb-btn-secondary" },
            { label: confirmLabel, value: "ok", className: "sb-btn-primary", submit: true }
        ],
        onOpen: d => { const input = d.querySelector(".sb-dialog-input"); input.focus(); input.select?.(); }
    });
    return action === "ok" ? value : null;
}

// ---------- Messages ----------

// A failed request, in words a client understands. The raw error still
// goes to the console for debugging.
export function friendlyError(error, action = "save that") {
    const code = String(error?.code || error?.message || "");
    if (!navigator.onLine || /unavailable|network|offline|timeout/i.test(code)) {
        return `Couldn't ${action} — you look offline. Check your connection and try again.`;
    }
    if (/permission-denied|unauthenticated/i.test(code)) {
        return `Couldn't ${action} — this isn't switched on for your account yet.`;
    }
    return `Couldn't ${action}. Try again in a moment.`;
}

// ---------- Loading / empty states ----------

// Card-shaped shimmer lines, sized like the content they stand in for.
export function loadingHtml(label = "Loading", { lines = 3 } = {}) {
    return `
        <div class="sb-loading" role="status" aria-live="polite">
            <span class="sr-only">${esc(label)}…</span>
            ${Array.from({ length: lines }, (_, i) => `<span class="sb-skeleton" style="width:${[92, 76, 58, 84][i % 4]}%"></span>`).join("")}
        </div>`;
}

export function emptyHtml({ iconName = "info", title = "", text = "", actionHref = "", actionLabel = "" } = {}) {
    return `
        <div class="sb-empty">
            <span class="sb-empty-icon">${icon(iconName)}</span>
            ${title ? `<strong class="sb-empty-title">${esc(title)}</strong>` : ""}
            ${text ? `<p class="sb-empty-text">${text}</p>` : ""}
            ${actionHref ? `<a class="sb-btn sb-btn-secondary" href="${esc(actionHref)}">${esc(actionLabel)}</a>` : ""}
        </div>`;
}

// For inline (non-module) page scripts.
if (typeof window !== "undefined") {
    window.SB = { toast, alert: sbAlert, confirm: sbConfirm, prompt: sbPrompt, friendlyError };
}
