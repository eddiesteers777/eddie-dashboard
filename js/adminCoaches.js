/* ==========================================
   Southbound — My Coaches (admin) data

   The admin coach finds the coaches among the people linked to them
   (soccer / online scope on the profile), then reads one coach's links,
   bookings and homework. The rules let only the admin read another
   coach's data (firestore.rules: isAdminCoach on coachLinks,
   bookingRequests, homework). Read-only.
========================================== */

import { db } from "./firebase.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { waitForUser } from "./auth.js";

// Every approved coach except the admin. A coach with no coachScope (made a
// coach before roles existed) shows as "admin" with noRole, so the admin can
// give them a role.
export async function listMyCoachAccounts() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "userProfiles"), where("isCoachApproved", "==", true)));
    return snap.docs
        .filter(d => d.id !== user.uid)
        .map(d => { const p = d.data(); return { uid: d.id, name: p.displayName || "Coach", scope: p.coachScope || "admin", noRole: !p.coachScope, services: p.services || [] }; })
        .sort((a, b) => a.name.localeCompare(b.name));
}

const rows = async (name, coachUid) => {
    const snap = await getDocs(query(collection(db, name), where("coachUid", "==", coachUid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export async function loadCoachData(coachUid) {
    const [links, requests, homework] = await Promise.all([
        rows("coachLinks", coachUid), rows("bookingRequests", coachUid), rows("homework", coachUid)
    ]);
    const millis = t => (t && typeof t.toMillis === "function" ? t.toMillis() : Number(t) || 0);
    return {
        links,
        requests,
        homework: homework.map(h => ({ ...h, logs: h.logs || [], reviewedMs: millis(h.reviewedAt) }))
    };
}
