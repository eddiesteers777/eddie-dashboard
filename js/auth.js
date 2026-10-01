// ==========================================
// Southbound Authentication
// ==========================================

import { auth, clearOfflineCopy } from "./firebase.js";
import {
    clearAccountLocalData,
    clearAccountSessionData,
    getActiveAccountUid,
    setActiveAccountUid
} from "./accountStorage.js";

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
        // If a user is still signed in, this may be an account switch.
        // Give the current account one last cloud push when possible, then
        // remove its browser data before the next account can use this tab.
        if (auth.currentUser) {
            try {
                const { pushToCloud } = await import("./cloudSync.js");
                await pushToCloud({ force: true });
            } catch (error) {
                console.warn("Southbound: couldn't finish the previous account's cloud sync before login.", error);
            }
        }

        clearAccountLocalData();
        clearAccountSessionData();
        setActiveAccountUid(null);
        await clearOfflineCopy();

        await signInWithPopup(auth, provider);
        if (auth.currentUser) setActiveAccountUid(auth.currentUser.uid);

        // Start the newly signed-in account with fresh in-memory page state.
        window.location.reload();
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
        // Preserve anything that was entered since the last 30-second sync
        // when the network is available. Privacy cleanup below still runs
        // if this fails or the browser is offline.
        try {
            const { pushToCloud } = await import("./cloudSync.js");
            await pushToCloud({ force: true });
        } catch (error) {
            console.warn("Southbound: couldn't finish the current account's cloud sync before logout.", error);
        }

        clearAccountLocalData();
        clearAccountSessionData();
        setActiveAccountUid(null);
        await clearOfflineCopy();
        await signOut(auth);

        // Clear in-memory page state and initialize the next auth session
        // against a freshly initialized Firestore instance.
        window.location.reload();

    } catch (error) {

        console.error("Logout Error:", error);

    }

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

let accountIdentityPromise = Promise.resolve();

async function prepareAccountIdentity(user) {
    if (!user) {
        setActiveAccountUid(null);
        return;
    }

    const previousUid = getActiveAccountUid();
    const uidChanged = previousUid !== user.uid;

    if (uidChanged) {
        clearAccountLocalData();
        clearAccountSessionData();
        setActiveAccountUid(null);
        await clearOfflineCopy();
    }

    setActiveAccountUid(user.uid);
}

export function waitForUser() {

    return new Promise((resolve) => {

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            accountIdentityPromise = accountIdentityPromise
                .then(() => prepareAccountIdentity(user))
                .catch(error => {
                    console.error("Southbound: account transition cleanup failed.", error);
                })
                .then(() => {
                    unsubscribe();
                    resolve(user);
                });
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
