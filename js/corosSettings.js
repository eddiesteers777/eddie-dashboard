/* ==========================================
   Southbound — COROS on the Settings page

   Connect (js/corosAuth.js does the sign-in and brings them back
   here; settings.html is a registered return address in
   oauth/client-metadata.json) and Disconnect. Once connected, My Plan
   and workout pages offer "Send to COROS" (js/corosSend.js).
========================================== */

import { getTokenRecord, clearCorosToken } from "./corosAuth.js";

const $ = id => document.getElementById(id);

function render() {
    const connected = Boolean(getTokenRecord()?.access_token);
    const off = $("disconnectCorosBtn");
    if (off) off.hidden = !connected;
}

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
