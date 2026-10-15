/* ==========================================
   Settings: "Health stats on Today". On until turned off. It is the
   `showOnToday` field of the readiness settings (readiness-settings), which
   already syncs between devices and clears on sign-out; js/readinessCard.js
   reads it through js/bodyModel.js showHealthStats().
========================================== */

import { loadSettings, saveSettings } from "./readinessData.js";

const toggle = document.getElementById("healthStatsToggle");

if (toggle) {
    toggle.checked = loadSettings().showOnToday !== false;
    toggle.addEventListener("change", () => {
        saveSettings({ ...loadSettings(), showOnToday: toggle.checked });
        window.SB?.toast?.(toggle.checked ? "Health stats are on Today." : "Health stats are hidden from Today.");
    });
}
