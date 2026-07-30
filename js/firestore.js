// ==========================================
// EddieOS Firestore
// ==========================================

import { db, auth } from "./firebase.js";

import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { dashboardData } from "./dashboardData.js";

// ==========================================
// Load Dashboard
// ==========================================

export async function loadDashboard() {

    const user = auth.currentUser;

    if (!user) return null;

    const docRef = doc(db, "users", user.uid);

    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {

        return snapshot.data();

    }

    // First login - create default dashboard

    await setDoc(docRef, dashboardData);

    return dashboardData;

}

// ==========================================
// Save Dashboard
// ==========================================

export async function saveDashboard(data) {

    const user = auth.currentUser;

    if (!user) return;

    const docRef = doc(db, "users", user.uid);

    await setDoc(docRef, data);

}
