// ==========================================
// EddieOS Cloud Sync
//
// Login alone only authenticates you — it never made your
// data follow you between devices. Marathon progress, Nutrition,
// the 75-Day tracker, and Fueling all live in this browser's
// localStorage, which is per-device and has nothing to do with
// your Google account.
//
// This mirrors those localStorage keys to Firestore under your
// account, so signing in on a second device pulls down whatever
// was last saved on the first one.
// ==========================================

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Keys synced as-is.
const EXACT_KEYS = [
    "training-progress",
    "training-overrides",
    "habits",
    "entries"
];

// Any localStorage key starting with one of these is synced too —
// covers per-day Nutrition keys ("nutrition-2026-09-10") and every
// Fueling key ("fueling-library", "fueling-plans", etc.) without
// having to list each one by hand.
const KEY_PREFIXES = [
    "nutrition-",
    "fueling-"
];

function collectLocalKeys() {

    const keys = new Set(

        EXACT_KEYS.filter(k => localStorage.getItem(k) !== null)

    );

    for (let i = 0; i < localStorage.length; i++) {

        const key = localStorage.key(i);

        if (KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {

            keys.add(key);

        }

    }

    return [...keys];

}

async function getSyncDoc() {

    const user = await waitForUser();

    if (!user) return null;

    return doc(db, "users", user.uid, "sync", "localStorage");

}

// ==========================================
// Pull — bring this device's local data in line
// with whatever was last saved to the cloud.
// ==========================================

export async function pullFromCloud() {

    try {

        const docRef = await getSyncDoc();

        if (!docRef) return false;

        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) return false;

        const stored = snapshot.data().data || {};

        Object.keys(stored).forEach(key => {

            localStorage.setItem(key, stored[key]);

        });

        console.log(`☁️ Pulled ${Object.keys(stored).length} item(s) from the cloud.`);

        return true;

    } catch (error) {

        console.error("Cloud sync (pull) error:", error);

        return false;

    }

}

// ==========================================
// Push — upload this device's current data.
// Fire-and-forget by design; callers don't need to await it.
// ==========================================

export async function pushToCloud() {

    try {

        const docRef = await getSyncDoc();

        if (!docRef) return false;

        const keys = collectLocalKeys();

        const data = {};

        keys.forEach(key => {

            data[key] = localStorage.getItem(key);

        });

        await setDoc(docRef, {

            data,
            updatedAt: serverTimestamp()

        });

        console.log(`💾 Pushed ${keys.length} item(s) to the cloud.`);

        return true;

    } catch (error) {

        console.error("Cloud sync (push) error:", error);

        return false;

    }

}

// ==========================================
// Initialize — call this at the top of a page,
// before anything reads localStorage. It pulls the
// cloud copy down first, then arms background pushes
// so later edits get saved back up automatically.
// ==========================================

let autoPushArmed = false;

export async function initCloudSync() {

    await pullFromCloud();

    if (autoPushArmed) return;

    autoPushArmed = true;

    // Best-effort: not all browsers finish an async write
    // before the page actually unloads.
    window.addEventListener("beforeunload", () => { pushToCloud(); });

    // More reliable on mobile — fires when the tab/app is
    // backgrounded, well before it's likely to be killed.
    document.addEventListener("visibilitychange", () => {

        if (document.hidden) pushToCloud();

    });

    // Safety net so edits are never more than ~30s stale.
    setInterval(() => { pushToCloud(); }, 30000);

}
