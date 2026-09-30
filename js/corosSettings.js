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
import { isCorosConnected } from "./corosClient.js";
import { syncWearableActivityForCoach, revokeWearableActivitySharing } from "./wearableActivitySync.js";

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
        return '<div class="wearable-share-row" data-coach-uid="' + esc(link.coachUid) + '" data-activity-shared="' + (p.activity ? "true" : "false") + '" data-coros-connected="' + (isCorosConnected() ? "true" : "false") + '">' +
            '<div class="wearable-share-head"><div><strong>' + esc(link.coachName || "Your coach") + '</strong>' +
            '<span>' + (active ? "Sharing " + labels.join(", ") : "Not shared") + '</span></div>' +
            '<span class="wearable-share-status">' + (active ? "Active" : "Off") + '</span></div>' +
            '<label><span><strong>Training activity</strong><small>Dates, distance, and duration</small></span><input type="checkbox" data-share="activity" ' + (p.activity ? "checked" : "") + '></label>' +
            '<label><span><strong>Performance</strong><small>Pace, heart rate, load, and fitness metrics · available in a later step</small></span><input type="checkbox" data-share="performance" ' + (p.performance ? "checked" : "") + '></label>' +
            '<label><span><strong>Recovery &amp; sleep</strong><small>Sleep, HRV, resting heart rate, and recovery/stress · available in a later step</small></span><input type="checkbox" data-share="recovery" ' + (p.recovery ? "checked" : "") + '></label>' +
            '<div class="wearable-share-actions"><button type="button" class="settings-btn" data-share-save>Save sharing</button>' +
            (p.activity ? '<button type="button" class="settings-btn" data-share-sync ' + (isCorosConnected() ? "" : "disabled") + '>' + (isCorosConnected() ? "Sync COROS activity" : "Connect COROS to sync") + '</button>' : "") +
            (active ? '<button type="button" class="settings-btn wearable-share-revoke" data-share-revoke>Stop sharing</button>' : '') +
            '</div></div>';
    }).join("");
}

$("wearableSharingList")?.addEventListener("click", async event => {
    const save = event.target.closest("[data-share-save]");
    const sync = event.target.closest("[data-share-sync]");
    const revoke = event.target.closest("[data-share-revoke]");
    const row = event.target.closest("[data-coach-uid]");
    if (!row || (!save && !sync && !revoke)) return;

    const coachUid = row.dataset.coachUid;
    if (sync) {
        sync.disabled = true;
        try {
            const result = await syncWearableActivityForCoach(coachUid);
            window.SB?.toast?.("Shared " + result.count + " COROS activities with your coach.");
            await renderWearableSharing();
        } catch (error) {
            console.error("COROS activity sync failed:", error);
            window.SB?.toast?.(error.message || "Couldn't sync COROS activity. Try again.", { type: "error" });
            sync.disabled = false;
        }
        return;
    }

    const permissions = revoke
        ? { activity: false, performance: false, recovery: false }
        : Object.fromEntries([...row.querySelectorAll("[data-share]")].map(input => [input.dataset.share, input.checked]));

    const button = save || revoke;
    button.disabled = true;
    try {
        const activityWasShared = row.dataset.activityShared === "true";
        if (activityWasShared && !permissions.activity) {
            await revokeWearableActivitySharing(coachUid);
        }
        await saveWearableShare(coachUid, permissions);
        let message = revoke ? "Wearable sharing stopped." : "Wearable sharing settings saved.";
        if (permissions.activity && isCorosConnected()) {
            const result = await syncWearableActivityForCoach(coachUid);
            message += " Shared " + result.count + " COROS activities.";
        } else if (permissions.activity && !isCorosConnected()) {
            message += " Connect COROS to sync activity.";
        }
        window.SB?.toast?.(message);
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
