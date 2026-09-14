// ==============================
// EddieOS Settings
// ==============================

import { auth } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { getUserSettings, saveUserSettings } from "./userSettings.js";

// =====================================
// DOM Elements
// =====================================

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");

const displayName = document.getElementById("displayName");
const displayEmail = document.getElementById("displayEmail");

const avatar = document.querySelector(".avatar");

const logoutBtn = document.getElementById("logoutBtn");

const units = document.getElementById("units");
const weekStart = document.getElementById("weekStart");

const goalTime = document.querySelector('input[type="text"]');
const weeklyMileage = document.querySelector('input[type="number"]');

const checkboxes = document.querySelectorAll('input[type="checkbox"]');

// =====================================
// Load User + Settings
// =====================================

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    // User Info (from the Google account itself — unrelated to the
    // goals/preferences data below, still comes straight from auth)

    userName.textContent = user.displayName || "Runner";
    userEmail.textContent = user.email || "";

    displayName.textContent = user.displayName || "Runner";
    displayEmail.textContent = user.email || "";

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

    units.value = saved.units;
    weekStart.value = saved.weekStart;

    goalTime.value = saved.goalTime;
    weeklyMileage.value = saved.weeklyMileage || "";

    checkboxes[0].checked = saved.aiEnabled;
    checkboxes[1].checked = saved.weeklyInsights;
    checkboxes[2].checked = saved.dailyRecommendations;

});

// =====================================
// Save Settings
// =====================================

function saveSettings() {

    saveUserSettings({

        units: units.value,
        weekStart: weekStart.value,

        goalTime: goalTime.value.trim(),
        weeklyMileage: Number(weeklyMileage.value) || 0,

        aiEnabled: checkboxes[0].checked,
        weeklyInsights: checkboxes[1].checked,
        dailyRecommendations: checkboxes[2].checked

    });

    console.log("✅ Settings saved");

}

// =====================================
// Event Listeners
// =====================================

[
    units,
    weekStart,
    goalTime,
    weeklyMileage,
    ...checkboxes

].forEach(element => {

    element.addEventListener("change", saveSettings);

});

// =====================================
// Logout
// =====================================

logoutBtn.addEventListener("click", async () => {

    try {

        await signOut(auth);

        window.location.href = "index.html";

    } catch (error) {

        console.error("Logout failed:", error);

    }

});
