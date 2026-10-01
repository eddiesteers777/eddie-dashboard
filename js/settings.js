// ==============================
// Southbound Settings
// ==============================

import { toast, friendlyError } from "./ui.js";
import { listMyPackages } from "./clientPackages.js";
import { openStripeCustomerPortal } from "./stripeBilling.js";

import { logout, listenForAuth } from "./auth.js";

import { getUserSettings, saveUserSettings } from "./userSettings.js";

// =====================================
// DOM Elements
// =====================================

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");

const displayName = document.getElementById("displayName");
const displayEmail = document.getElementById("displayEmail");

const avatar = document.getElementById("settingsAvatar");

const logoutBtn = document.getElementById("logoutBtn");
const billingCard = document.getElementById("billingCard");
const manageBillingBtn = document.getElementById("manageBillingBtn");

// Units, week start, goal time, weekly mileage and the "AI Coach"
// switches used to live here too; nothing ever read them, so they were
// removed (2026-09-25) rather than left as switches that do nothing.
// Old saved values stay in user-settings untouched.
const usdaApiKey = document.getElementById("usdaApiKey");

// =====================================
// Load User + Settings
// =====================================

listenForAuth(async (user) => {

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // User Info (from the Google account itself — unrelated to the
    // goals/preferences data below, still comes straight from auth)

    userName.textContent = user.displayName || "Your account";
    userEmail.textContent = user.email || "";

    displayName.textContent = user.displayName || "Your account";
    displayEmail.textContent = user.email || "";

    const initials = (user.displayName || user.email || "?")
        .split(/[\s@.]+/).filter(Boolean).slice(0, 2)
        .map(part => part[0].toUpperCase()).join("");
    avatar.textContent = initials;

    if (user.photoURL) {

        avatar.innerHTML = "";

        avatar.style.backgroundImage = `url(${user.photoURL})`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";

    }

    // Load Saved Settings — pull from the cloud first (in case another
    // device saved something more recent than what's local here yet),
    // then read through the shared module every other page also uses.

    try {

        const { initCloudSync } = await import("./cloudSync.js");

        await initCloudSync();

    } catch (error) {

        console.error("Settings: cloud sync unavailable, using local data", error);

    }

    const saved = getUserSettings();

    // Stripe Customer Portal is available only after the server/webhook
    // has established a Stripe customer for at least one package.
    if (billingCard) {
        try {
            const packages = await listMyPackages();
            const hasStripeCustomer = (packages || []).some(pkg =>
                typeof pkg.stripeCustomerId === "string" && pkg.stripeCustomerId.trim()
            );
            billingCard.hidden = !hasStripeCustomer;
        } catch (error) {
            console.warn("Southbound: billing status unavailable.", error);
            billingCard.hidden = true;
        }
    }

    usdaApiKey.value = saved.usdaApiKey || "";

});

// =====================================
// Save Settings
// =====================================

function saveSettings() {

    saveUserSettings({

        usdaApiKey: usdaApiKey.value.trim()

    });

    console.log("✅ Settings saved");

}

// =====================================
// Event Listeners
// =====================================

usdaApiKey.addEventListener("change", saveSettings);

// =====================================
// Billing
// =====================================

manageBillingBtn?.addEventListener("click", async () => {
    if (!manageBillingBtn) return;
    manageBillingBtn.disabled = true;
    manageBillingBtn.textContent = "Opening…";
    try {
        await openStripeCustomerPortal();
    } catch (error) {
        manageBillingBtn.disabled = false;
        manageBillingBtn.textContent = "Manage Billing";
        toast(friendlyError(error, "open billing management"), { type: "error" });
    }
});

// =====================================
// Logout
// =====================================

logoutBtn.addEventListener("click", async () => {

    try {

        await logout();

        window.location.href = "index.html";

    } catch (error) {

        console.error("Logout failed:", error);

    }

});

// =====================================
// Export All Data
// =====================================

document.getElementById("exportDataBtn")?.addEventListener("click", async () => {

    try {

        const { exportAllData } = await import("./cloudSync.js");

        const bundle = exportAllData();

        const blob = new Blob(
            [JSON.stringify(bundle, null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);
        const dateStamp = new Date().toISOString().slice(0, 10);

        const link = document.createElement("a");
        link.href = url;
        link.download = `eddieos-backup-${dateStamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

    } catch (error) {

        console.error("Export failed:", error);
        toast("Couldn't export your data. Try again in a moment.", { type: "error" });

    }

});
