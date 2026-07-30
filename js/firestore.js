// ==========================================
// EddieOS Firestore
// ==========================================

import { db, auth } from "./firebase.js";

import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { dashboardData } from "./dashboardData.js";

// ==========================================
// Authentication Helper
// ==========================================

function waitForUser() {

    return new Promise((resolve) => {

        const unsubscribe = onAuthStateChanged(auth, (user) => {

            unsubscribe();
            resolve(user);

        });

    });

}

// ==========================================
// Document Helpers
// ==========================================

async function getUser() {

    const user = await waitForUser();

    if (!user) {

        console.warn("No authenticated user.");

        return null;

    }

    return user;

}

async function getUserDoc() {

    const user = await getUser();

    if (!user) return null;

    return doc(db, "users", user.uid);

}

async function getSettingsDoc() {

    const user = await getUser();

    if (!user) return null;

    return doc(
        db,
        "users",
        user.uid,
        "settings",
        "preferences"
    );

}

// ==========================================
// Dashboard
// ==========================================

export async function loadDashboard() {

    const docRef = await getUserDoc();

    if (!docRef) return null;

    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {

        console.log("☁️ Dashboard loaded.");

        return snapshot.data();

    }

    console.log("🆕 Creating new dashboard.");

    await setDoc(docRef, dashboardData);

    return dashboardData;

}

export async function saveDashboard(data) {

    const docRef = await getUserDoc();

    if (!docRef) return;

    await setDoc(docRef, data);

    console.log("💾 Dashboard saved.");

}

// ==========================================
// Settings
// ==========================================

const defaultSettings = {

    units: "Miles",

    weekStart: "Sunday",

    goalTime: "",

    weeklyMileage: 0,

    aiEnabled: true,

    weeklyInsights: true,

    dailyRecommendations: false

};

export async function loadSettings() {

    const docRef = await getSettingsDoc();

    if (!docRef) return defaultSettings;

    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {

        console.log("⚙️ Settings loaded.");

        return {

            ...defaultSettings,
            ...snapshot.data()

        };

    }

    await setDoc(docRef, defaultSettings);

    console.log("🆕 Default settings created.");

    return defaultSettings;

}

export async function saveSettings(settings) {

    const docRef = await getSettingsDoc();

    if (!docRef) return;

    await setDoc(

        docRef,

        settings,

        {

            merge: true

        }

    );

    console.log("💾 Settings saved.");

}

// ==========================================
// Future Features
// ==========================================

// export async function loadShoes() {}
// export async function saveShoes() {}

// export async function loadWorkouts() {}
// export async function saveWorkout() {}

// export async function loadGoals() {}
// export async function saveGoals() {}

// export async function loadCoros() {}
// export async function saveCoros() {}
