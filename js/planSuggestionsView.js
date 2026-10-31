/* ==========================================
   Southbound — plan suggestions card (Client Hub, Plan tab, coach only)

   Option B from the mock-up: a compact list, tap a row to open it. The
   rules are js/planRules.js, the data js/planSuggestions.js. Nothing here
   changes a plan: "Open plan editor" scrolls to the editor below, and
   "Dismiss" hides that suggestion for this week on this device.
========================================== */

import { buildSuggestions } from "./planSuggestions.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const keyFor = uid => `sb-plan-dismissed:${uid}`;
const readDismissed = uid => { try { const v = JSON.parse(localStorage.getItem(keyFor(uid)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeDismissed = (uid, list) => { try { localStorage.setItem(keyFor(uid), JSON.stringify(list.slice(-40))); } catch { /* storage unavailable */ } };

let openId = null;

/** Draws the card into `host`. `data` is { week, primary, results, today }. */
export function renderPlanSuggestions(host, { clientUid, data, onOpenEditor }) {
    if (!host) return;
    const items = buildSuggestions({ ...data, dismissed: readDismissed(clientUid) });
    if (!items.length) {
        host.innerHTML = `<section class="clients-card ps-card" aria-labelledby="psTitle">
            <div class="ps-head"><h2 id="psTitle">Suggestions</h2></div>
            <div class="ps-empty"><strong>Nothing to suggest</strong>The week is on track. Suggestions show up here when sessions are missed or a pace pattern repeats.</div></section>`;
        return;
    }
    if (!items.some(i => i.id === openId)) openId = items[0].id;
    host.innerHTML = `<section class="clients-card ps-card" aria-labelledby="psTitle">
        <div class="ps-head"><h2 id="psTitle">Suggestions · ${items.length}</h2><span class="ps-meta">Only you see these</span></div>
        <div class="ps-list">${items.map(i => {
            const open = i.id === openId;
            return `<div class="ps-item${open ? " is-open" : ""}">
                <button type="button" class="ps-row" data-ps="${esc(i.id)}" aria-expanded="${open}" aria-controls="ps-${esc(i.id.replace(/\W/g, "-"))}">
                    <span class="ps-dot ps-${i.tone}" aria-hidden="true"></span>
                    <span class="ps-t"><b>${esc(i.title)}</b><span>${esc(i.chip)}</span></span>
                    <span class="ps-go" aria-hidden="true">›</span>
                </button>
                <div class="ps-detail" id="ps-${esc(i.id.replace(/\W/g, "-"))}" ${open ? "" : "hidden"}>
                    <p>${esc(i.text)}</p>
                    <p>${esc(i.detail)}</p>
                    <div class="ps-actions">
                        ${i.tone === "hold" ? "" : `<button type="button" class="sb-btn sb-btn-primary" data-ps-edit>Open plan editor</button>`}
                        <button type="button" class="sb-btn sb-btn-secondary" data-ps-dismiss="${esc(i.id)}">${i.tone === "hold" ? "Got it" : "Dismiss"}</button>
                    </div>
                    <p class="ps-note">${i.tone === "hold" ? "Held: nothing is added or rebuilt." : "Advice only. Nothing changes until you edit the plan and publish."}</p>
                </div></div>`;
        }).join("")}</div></section>`;
    host.querySelectorAll("[data-ps]").forEach(b => b.addEventListener("click", () => {
        openId = openId === b.dataset.ps ? null : b.dataset.ps;
        renderPlanSuggestions(host, { clientUid, data, onOpenEditor });
    }));
    host.querySelectorAll("[data-ps-edit]").forEach(b => b.addEventListener("click", () => onOpenEditor?.()));
    host.querySelectorAll("[data-ps-dismiss]").forEach(b => b.addEventListener("click", () => {
        writeDismissed(clientUid, [...readDismissed(clientUid), b.dataset.psDismiss]);
        renderPlanSuggestions(host, { clientUid, data, onOpenEditor });
    }));
}
