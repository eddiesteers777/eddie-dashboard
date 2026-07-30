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
// Wait for Authentication
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
// Load Dashboard
// ==========================================

export async function loadDashboard() {

    const user = await waitForUser();

    if (!user) return null;

    const docRef = doc(db, "users", user.uid);

    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {

        console.log("☁️ Dashboard loaded from Firestore.");

        return snapshot.data();

    }

    console.log("🆕 Creating dashboard in Firestore.");

    await setDoc(docRef, dashboardData);

    return dashboardData;

}

// ==========================================
// Save Dashboard
// ==========================================

export async function saveDashboard(data) {

    const user = await waitForUser();

    if (!user) return;

    const docRef = doc(db, "users", user.uid);

    await setDoc(docRef, data);

}
