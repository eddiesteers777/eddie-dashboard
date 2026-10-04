/* ==========================================
   Southbound — COROS on the Settings page

   Connect (js/corosAuth.js does the sign-in and brings them back
   here; settings.html is a registered return address in
   oauth/client-metadata.json) and Disconnect. Once connected, My Plan
   and workout pages offer "Send to COROS" (js/corosSend.js), and a
   client can have the coach's workouts sent automatically
   (js/corosAutoSend.js, the toggle here).
========================================== */

import { getTokenRecord, clearCorosToken } from "./corosAuth.js";
import { autoSendOn, setAutoSend, runCorosAutoSend } from "./corosAutoSend.js";
import { listMyWearableShares, saveWearableShare } from "./coachAccess.js";
import { syncSharedWearableActivity } from "./wearableActivity.js";
import { syncSharedWearablePerformance } from "./wearablePerformance.js";
import { syncSharedWearableRecovery } from "./wearableRecovery.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"\']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function renderWearableSharing() {
    const list = $("wearableSharingList");
    if (!list) return;

    const rows = await listMyWearableShares().catch(error => {
        console.warn("Southbound: wearable sharing unavailable.", error?.code || error);
        return [];
    });
    if (!rows.length) {
        list.innerHTML = '<div class="settings-sharing-empty">Connect a coach first. Once you have a linked coach, you can choose exactly which wearable categories to share.</div>';
        return;
    }

    list.innerHTML = rows.map(({ link, share }) => {
        const p = share?.permissions || {};
        const active = share?.status === "active";
        const labels = [p.activity ? "training activity" : "", p.performance ? "performance" : "", p.recovery ? "recovery & sleep" : ""].filter(Boolean);
        return '<div class="wearable-share-row" data-coach-uid="' + esc(link.coachUid) + '">' +
            '<div class="wearable-share-head"><div><strong>' + esc(link.coachName || "Your coach") + '</strong>' +
            '<span>' + (active ? "Sharing " + labels.join(", ") : "Not shared") + '</span></div>' +
            '<span class="wearable-share-status">' + (active ? "Active" : "Off") + '</span></div>' +
            '<label><span><strong>Training activity</strong><small>Dates, distance, and duration</small></span><input type="checkbox" data-share="activity" ' + (p.activity ? "checked" : "") + '></label>' +
            '<label><span><strong>Performance</strong><small>Pace, heart rate, load, and fitness metrics</small></span><input type="checkbox" data-share="performance" ' + (p.performance ? "checked" : "") + '></label>' +
            '<label><span><strong>Recovery &amp; sleep</strong><small>Sleep, HRV, resting heart rate, and recovery/stress</small></span><input type="checkbox" data-share="recovery" ' + (p.recovery ? "checked" : "") + '></label>' +
            '<div class="wearable-share-actions"><button type="button" class="settings-btn" data-share-save>Save sharing</button>' +
            (active ? '<button type="button" class="settings-btn wearable-share-revoke" data-share-revoke>Stop sharing</button>' : '') +
            '</div></div>';
    }).join("");
}

$("wearableSharingList")?.addEventListener("click", async event => {
    const save = event.target.closest("[data-share-save]");
    const revoke = event.target.closest("[data-share-revoke]");
    const row = event.target.closest("[data-coach-uid]");
    if (!row || (!save && !revoke)) return;

    const coachUid = row.dataset.coachUid;
    const permissions = revoke
        ? { activity: false, performance: false, recovery: false }
        : Object.fromEntries([...row.querySelectorAll("[data-share]")].map(input => [input.dataset.share, input.checked]));

    const button = save || revoke;
    button.disabled = true;
    try {
        await saveWearableShare(coachUid, permissions);
        // All three summaries follow the new choices at once (each one
        // writes when allowed and clears itself when not).
        await Promise.allSettled([syncSharedWearableActivity(), syncSharedWearablePerformance(), syncSharedWearableRecovery()]);
        window.SB?.toast?.(revoke ? "Wearable sharing stopped." : "Wearable sharing settings saved.");
        await renderWearableSharing();
    } catch (error) {
        console.error("Wearable sharing save failed:", error);
        window.SB?.toast?.("Couldn't save wearable sharing. Try again.", { type: "error" });
        button.disabled = false;
    }
});

async function render() {
    const connected = Boolean(getTokenRecord()?.access_token);
    const off = $("disconnectCorosBtn");
    if (off) off.hidden = !connected;
    // Clients: automatic sending (js/corosAutoSend.js), on unless they turn it off.
    const row = $("corosAutoRow");
    if (row) row.hidden = !connected;
    const toggle = $("corosAutoToggle");
    if (toggle) toggle.checked = autoSendOn();
    await renderWearableSharing();
}

$("corosAutoToggle")?.addEventListener("change", event => {
    setAutoSend(event.target.checked);
    if (event.target.checked) {
        window.SB?.toast?.("Your coach's workouts will go to COROS automatically.");
        runCorosAutoSend();
    } else {
        window.SB?.toast?.("Automatic sending is off. You can still send from My Plan.");
    }
});

$("disconnectCorosBtn")?.addEventListener("click", async () => {
    const ok = window.SB?.confirm
        ? await window.SB.confirm("Southbound will stop sending workouts to your COROS watch. Workouts already there stay until you remove them in the COROS app.", { title: "Disconnect COROS?", confirmLabel: "Disconnect", danger: true })
        : false;
    if (!ok) return;
    clearCorosToken();
    const text = $("corosConnectionStatusText");
    if (text) text.textContent = "Not connected";
    const btn = $("connectCorosBtn");
    if (btn) { btn.textContent = "Connect COROS"; btn.disabled = false; btn.dataset.busy = "false"; }
    render();
    window.SB?.toast?.("COROS disconnected.");
});

window.addEventListener("eddieos:coros-auth-changed", () => { render(); renderWearableSharing(); });
render();
