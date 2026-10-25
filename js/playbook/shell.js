// Southbound Playbook: shared page bits (theme switch, sync, clear button).
// Each tool page imports this first, so signed-in work is pulled before the tool reads it.
import { migrateOldKeys, applyTheme, toggleTheme, clearAll } from "./store.js";
import { startSync, afterClear, isSignedIn } from "./cloud.js";

migrateOldKeys();
applyTheme();
const label = () => {
    const light = document.documentElement.classList.contains("pb-light");
    document.querySelectorAll("[data-pb-theme]").forEach(b => { b.textContent = light ? "Dark" : "Light"; });
};
label();
document.querySelectorAll("[data-pb-theme]").forEach(b => b.addEventListener("click", () => { toggleTheme(); label(); }));

// Sync status in the tab row: a plain label when signed in, a Sign in button for guests.
const tabs = document.querySelector(".pb-tabs");
if (tabs && !tabs.querySelector("[data-pb-sync]")) {
    const s = document.createElement("button");
    s.type = "button"; s.className = "pb-tab pb-syncstat"; s.dataset.pbSync = "";
    s.setAttribute("aria-live", "polite");
    tabs.insertBefore(s, tabs.querySelector("[data-pb-theme]"));
}

const clear = document.getElementById("pbClear");
const clearText = () => (isSignedIn() ? "Clear everything (device and account)" : "Clear everything on this device");
if (clear) clear.addEventListener("click", async () => {
    if (clear.dataset.arm !== "1") {
        clear.dataset.arm = "1"; clear.textContent = "Tap again to erase everything";
        setTimeout(() => { clear.dataset.arm = ""; clear.textContent = clearText(); }, 3500);
        return;
    }
    clearAll();
    clear.dataset.arm = ""; clear.textContent = "Clearing…";
    await afterClear();
    clear.textContent = "Cleared";
    setTimeout(() => { clear.textContent = clearText(); }, 2000);
});


// Printed pages wear the Southbound masthead (logo, kicker, title, date). It is filled just before
// printing from whatever the page already shows, and is hidden on screen (css/playbook.css, print block).
(() => {
    const shell = document.querySelector(".pb-shell");
    if (!shell) return;
    const mast = document.createElement("div");
    mast.className = "pb-printmast"; mast.setAttribute("aria-hidden", "true");
    mast.innerHTML = '<div><div class="pm-kick"></div><div class="pm-title"></div></div><div class="pm-side"><img src="brand/sb-mark-forest.svg" alt=""><div class="pm-sub"></div></div>';
    shell.prepend(mast);
    const text = sel => (document.querySelector(sel)?.textContent || "").trim();
    window.addEventListener("beforeprint", () => {
        const h1 = text(".pb-head h1");
        const card = text("#card h2");
        const title = text("#phTitle") || text("#shTitle") || card || h1 || "Playbook";
        const sub = text("#phMeta") || text("#shMeta") || text("#printTitle") || new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        mast.querySelector(".pm-kick").textContent = "Southbound Playbook" + (h1 && h1 !== title ? " · " + h1 : "");
        mast.querySelector(".pm-title").textContent = title;
        mast.querySelector(".pm-sub").textContent = sub;
    });
})();

await startSync();
if (clear) clear.textContent = clearText();
