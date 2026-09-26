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

const $ = id => document.getElementById(id);

function render() {
    const connected = Boolean(getTokenRecord()?.access_token);
    const off = $("disconnectCorosBtn");
    if (off) off.hidden = !connected;
    // Clients: automatic sending (js/corosAutoSend.js), on unless they turn it off.
    const row = $("corosAutoRow");
    if (row) row.hidden = !connected;
    const toggle = $("corosAutoToggle");
    if (toggle) toggle.checked = autoSendOn();
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

window.addEventListener("eddieos:coros-auth-changed", render);
render();
