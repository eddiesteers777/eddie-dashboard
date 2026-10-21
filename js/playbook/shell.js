// Southbound Playbook: shared page bits (theme switch, clear-this-device button).
import { migrateOldKeys, applyTheme, toggleTheme, clearAll } from "./store.js";

migrateOldKeys();
applyTheme();
const label = () => {
    const light = document.documentElement.classList.contains("pb-light");
    document.querySelectorAll("[data-pb-theme]").forEach(b => { b.textContent = light ? "Dark" : "Light"; });
};
label();
document.querySelectorAll("[data-pb-theme]").forEach(b => b.addEventListener("click", () => { toggleTheme(); label(); }));
const clear = document.getElementById("pbClear");
if (clear) clear.addEventListener("click", async () => {
    if (clear.dataset.arm !== "1") {
        clear.dataset.arm = "1"; clear.textContent = "Tap again to erase everything";
        setTimeout(() => { clear.dataset.arm = ""; clear.textContent = "Clear everything on this device"; }, 3500);
        return;
    }
    clearAll();
    clear.dataset.arm = ""; clear.textContent = "Cleared";
    setTimeout(() => { clear.textContent = "Clear everything on this device"; }, 2000);
});
