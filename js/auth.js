// ==========================================
// Southbound Authentication
// ==========================================

import { auth, clearOfflineCopy } from "./firebase.js";

import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

// ==========================================
// Login
// ==========================================

export async function login() {

    try {

        await signInWithPopup(auth, provider);

        return true;

    } catch (error) {

        console.error("Login Error:", error);

        return false;

    }

}

// ==========================================
// Logout
// ==========================================

export async function logout() {

    try {

        await signOut(auth);

    } catch (error) {

        console.error("Logout Error:", error);

    }

    // What this device kept for the account that just left: its offline
    // Firestore copy and what the nav / sync remembered about it.
    for (const key of ["sb-nav-access", "__cloudSyncVersion", "__cloudSyncFullPullAt"]) {
        try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    }
    await clearOfflineCopy();

}

// ==========================================
// Current User
// ==========================================

export function getCurrentUser() {

    return auth.currentUser;

}

// ==========================================
// Wait for Authentication
// ==========================================

export function waitForUser() {

    return new Promise((resolve) => {

        const unsubscribe = onAuthStateChanged(auth, (user) => {

            unsubscribe();
            resolve(user);

        });

    });

}

// ==========================================
// Protect Pages
// ==========================================

export async function requireLogin() {

    const user = await waitForUser();

    if (!user) {

        window.location.href = "login.html";

        return null;

    }

    return user;

}

// ==========================================
// Listen for Auth Changes
// ==========================================

export function listenForAuth(callback) {

    return onAuthStateChanged(auth, callback);

}

// ==========================================
// Update Header (Optional)
// ==========================================

export function setupHeader() {

    const userName = document.getElementById("user-name");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (!userName || !loginBtn || !logoutBtn) return;

    onAuthStateChanged(auth, (user) => {

        if (user) {

            userName.textContent = user.displayName || "Runner";

            loginBtn.style.display = "none";
            logoutBtn.style.display = "inline-block";

        } else {

            userName.textContent = "Guest";

            loginBtn.style.display = "inline-block";
            logoutBtn.style.display = "none";

        }

    });

}
