// ==============================
// EddieOS Settings
// ==============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// =====================================
// Firebase Config
// =====================================

const firebaseConfig = {

    apiKey: "YOUR_API_KEY",

    authDomain: "YOUR_PROJECT.firebaseapp.com",

    projectId: "YOUR_PROJECT_ID",

    storageBucket: "YOUR_PROJECT.appspot.com",

    messagingSenderId: "XXXXXXXX",

    appId: "XXXXXXXX"

};

// =====================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

// =====================================

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");

const displayName = document.getElementById("displayName");
const displayEmail = document.getElementById("displayEmail");

const avatar = document.querySelector(".avatar");

const logoutBtn = document.getElementById("logoutBtn");

// Preferences

const units = document.getElementById("units");
const weekStart = document.getElementById("weekStart");

const goalTime = document.querySelector('input[type="text"]');
const weeklyMileage = document.querySelector('input[type="number"]');

const checkboxes = document.querySelectorAll('input[type="checkbox"]');

// =====================================

onAuthStateChanged(auth, async (user) => {

    if (!user) {

        window.location.href = "login.html";

        return;

    }

    // User Info

    userName.textContent = user.displayName || "Runner";

    userEmail.textContent = user.email;

    displayName.textContent = user.displayName || "Runner";

    displayEmail.textContent = user.email;

    // Google Profile Picture

    if (user.photoURL) {

        avatar.innerHTML = "";

        avatar.style.backgroundImage = `url(${user.photoURL})`;
        avatar.style.backgroundSize = "cover";
        avatar.style.backgroundPosition = "center";

    }

    // Load Settings

    const settingsRef = doc(db, "users", user.uid, "settings", "preferences");

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

});

// =====================================
// Auto Save
// =====================================

async function saveSettings() {

    const user = auth.currentUser;

    if (!user) return;

    await setDoc(

        doc(db, "users", user.uid, "settings", "preferences"),

        {

            units: units.value,

            weekStart: weekStart.value,

            goalTime: goalTime.value,

            weeklyMileage: weeklyMileage.value,

            aiEnabled: checkboxes[0].checked,

            weeklyInsights: checkboxes[1].checked,

            dailyRecommendations: checkboxes[2].checked

        },

        {

            merge: true

        }

    );

    console.log("Settings Saved");

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

    await signOut(auth);

    window.location.href = "login.html";

});
