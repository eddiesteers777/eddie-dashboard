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
import {
    doc, getDoc, setDoc, updateDoc,
    collection, query, where, getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export const SERVICES = [
    { value: "online_coaching", label: "Online Coaching" },
    { value: "running", label: "Running Coaching" },
    { value: "strength", label: "Strength Coaching" },
    { value: "soccer_1on1", label: "1-on-1 Soccer" },
    { value: "soccer_group", label: "Group Soccer" }
];

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

// ---- Coach-side approval (all writes here rely on firestore.rules
// actually enforcing that the caller is already isCoachApproved --
// these functions don't check that themselves, same as every other
// write in this app trusts the deployed rules as the real boundary) ----

export async function listPendingProfiles() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "userProfiles"), where("status", "==", "pending")));
    return snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(p => p.uid !== user.uid);
}

// The main approval action: activates the account as a client with
// whichever services the coach granted. Never touches
// isCoachApproved -- promoting someone to coach is a separate,
// deliberate action (see promoteToCoach) so it can't happen by
// accident while approving an ordinary client.
export async function approveClient(uid, services) {
    await updateDoc(profileDoc(uid), {
        status: "active",
        services: services || [],
        approvedAt: serverTimestamp()
    });
}

export async function denyProfile(uid) {
    await updateDoc(profileDoc(uid), { status: "archived" });
}

export async function promoteToCoach(uid) {
    await updateDoc(profileDoc(uid), {
        role: "coach",
        isCoachApproved: true,
        status: "active"
    });
}
