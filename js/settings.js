// ==============================
// EddieOS Settings
// ==============================

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

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
// Load User
// =====================================

onAuthStateChanged(auth, async (user) => {

    if (!user) {
        window.location.href = "login.html";
        return;
    }

    // User Info

    userName.textContent = user.displayName || "Runner";
    userEmail.textContent = user.email || "";

    displayName.textContent = user.displayName || "Runner";
    displayEmail.textContent = user.email || "";

    // Profile Picture

    if (user.photoURL) {

        avatar.innerHTML = "";

        avatar.style.backgroundImage = `url(${user.photoURL})`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";

    }

    // Load Saved Settings

    try {

        const settingsRef = doc(
            db,
            "users",
            user.uid,
            "settings",
            "preferences"
        );

        const snapshot = await getDoc(settingsRef);

        if (snapshot.exists()) {

            const data = snapshot.data();

            units.value = data.units || "Miles";
            weekStart.value = data.weekStart || "Sunday";

            goalTime.value = data.goalTime || "";
            weeklyMileage.value = data.weeklyMileage || "";

            checkboxes[0].checked = data.aiEnabled ?? true;
            checkboxes[1].checked = data.weeklyInsights ?? true;
            checkboxes[2].checked = data.dailyRecommendations ?? false;

        }

    } catch (error) {

        console.error("Error loading settings:", error);

    }

});

// =====================================
// Save Settings
// =====================================

async function saveSettings() {

    const user = auth.currentUser;

    if (!user) return;

    try {

        await setDoc(

            doc(
                db,
                "users",
                user.uid,
                "settings",
                "preferences"
            ),

            {

                units: units.value,

                weekStart: weekStart.value,

                goalTime: goalTime.value,

                weeklyMileage: Number(weeklyMileage.value) || 0,

                aiEnabled: checkboxes[0].checked,

                weeklyInsights: checkboxes[1].checked,

                dailyRecommendations: checkboxes[2].checked

            },

            {

                merge: true

            }

        );

        console.log("✅ Settings saved");

    } catch (error) {

        console.error("Error saving settings:", error);

    }

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

        window.location.href = "login.html";

    } catch (error) {

        console.error("Logout failed:", error);

    }

});
