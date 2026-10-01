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
        const previousUid = auth.currentUser?.uid || null;

        // Finish any local changes for the current account before opening
        // Google's account picker. If the popup is cancelled, the same
        // account stays signed in and its local state remains intact.
        if (previousUid) {
            try {
                const { pushToCloud } = await import("./cloudSync.js");
                await pushToCloud({ force: true });
            } catch (error) {
                console.warn("Southbound: couldn't finish the previous account's cloud sync before login.", error);
            }
        }

        await signInWithPopup(auth, provider);

        const nextUid = auth.currentUser?.uid || null;
        if (previousUid && nextUid && nextUid !== previousUid) {
            // The popup actually switched accounts. Now remove the previous
            // account's browser state and Firestore persistence before the
            // new account can reload the app.
            clearAccountLocalData();
            clearAccountSessionData();
            setActiveAccountUid(null);
            await clearOfflineCopy();
        }

        if (nextUid) setActiveAccountUid(nextUid);

        // Any actual account change starts a fresh page with fresh in-memory state.
        if (nextUid && nextUid !== previousUid) window.location.reload();
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
let observedAccountUid = null;

async function prepareAccountIdentity(user) {
    if (!user) {
        const markerUid = getActiveAccountUid();
        if (observedAccountUid || markerUid) {
            clearAccountLocalData();
            clearAccountSessionData();
            await clearOfflineCopy();
        }
        observedAccountUid = null;
        setActiveAccountUid(null);
        return;
    }

    const markerUid = getActiveAccountUid();
    // Keep a tab-local observation as well as the shared marker. If another
    // tab changes the Firebase account first, the shared marker may already
    // contain the new UID by the time this tab's auth listener fires; the
    // tab-local UID still catches the in-memory account transition.
    const uidChanged = observedAccountUid !== null
        ? observedAccountUid !== user.uid
        : markerUid !== user.uid;

    if (uidChanged) {
        clearAccountLocalData();
        clearAccountSessionData();
        setActiveAccountUid(null);
        await clearOfflineCopy();
    }

    observedAccountUid = user.uid;
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
