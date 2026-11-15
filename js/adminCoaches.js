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
import { listMyClients } from "./coachAccess.js";
import { getProfile } from "./userProfile.js";

export async function listMyCoachAccounts() {
    const links = await listMyClients();
    const profiles = await Promise.all(links.map(l => getProfile(l.clientUid).catch(() => null)));
    return profiles
        .map((p, i) => p && p.isCoachApproved === true && (p.coachScope === "soccer" || p.coachScope === "online")
            ? { uid: links[i].clientUid, name: p.displayName || links[i].clientName || "Coach", scope: p.coachScope, services: p.services || [] }
            : null)
        .filter(Boolean);
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
