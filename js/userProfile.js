/* ==========================================
   EddieOS — Account Profile

   The account/role data model described in
   docs/PRODUCT_ARCHITECTURE.md. This is deliberately the smallest
   possible first step: a profile document gets created the first
   time someone signs in, and nothing anywhere reads it to gate
   access yet. That comes later (the approval workflow + role-based
   nav), once there's something real to build it against.

   Critically: role is self-reported and grants nothing by itself.
   isCoachApproved can only ever be flipped by a write from an
   account that is ALREADY isCoachApproved (enforced in
   firestore.rules, not here) -- so a normal user picking "Coach"
   never gains coach access on their own. The very first coach has
   to be bootstrapped manually in the Firebase Console, since by
   definition no approved coach exists yet to approve them.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

function profileDoc(uid) {
    return doc(db, "userProfiles", uid);
}

// Creates this user's profile the first time it's missing (new
// sign-in), otherwise just returns the existing one. Always starts
// unapproved and pending -- see firestore.rules for why a create
// can't set anything else.
export async function ensureProfile() {
    const user = await waitForUser();
    if (!user) return null;

    const ref = profileDoc(user.uid);
    const existing = await getDoc(ref);
    if (existing.exists()) return { uid: user.uid, ...existing.data() };

    const profile = {
        uid: user.uid,
        role: "client",
        isCoachApproved: false,
        status: "pending",
        services: [],
        displayName: user.displayName || "",
        email: user.email || "",
        createdAt: serverTimestamp()
    };
    await setDoc(ref, profile);
    return profile;
}

export async function getMyProfile() {
    const user = await waitForUser();
    if (!user) return null;
    const snap = await getDoc(profileDoc(user.uid));
    return snap.exists() ? { uid: user.uid, ...snap.data() } : null;
}

export async function getProfile(uid) {
    const snap = await getDoc(profileDoc(uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function isApprovedCoach() {
    const profile = await getMyProfile();
    return Boolean(profile?.isCoachApproved);
}
