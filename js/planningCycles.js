/* ==========================================
   Southbound — planning cycles in Firestore (coach only)

   Weekly planning P3. planningCycles/{coachUid}_{athleteUid}_{weekOf}:
   the record of one planned week (js/planningCycle.js). The rule has no
   client clause: only the coach who wrote a cycle reads it.

   listCycles(athleteUid)   the coach's cycles for one athlete ("self" =
                            the coach's own training), newest first
   saveCycle(cycle)         merge-writes it (never reads first: a doc that
                            doesn't exist yet reads as permission-denied)
   markPublished(athleteUid, header)
                            after a client plan is published: the cycles
                            whose approved days went into that plan's draft
                            get what was actually published
   myUid()                  the signed-in coach's uid
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    collection, doc, getDocs, setDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { toDoc, fromDoc, withPublished } from "./planningCycle.js";

export async function myUid() {
    const user = await waitForUser();
    if (!user) throw new Error("Not signed in.");
    return user.uid;
}

const resolve = async athleteUid => (athleteUid === "self" ? myUid() : athleteUid);

export async function listCycles(athleteUid) {
    const uid = await myUid();
    const athlete = await resolve(athleteUid);
    const snap = await getDocs(query(collection(db, "planningCycles"), where("coachUid", "==", uid), where("athleteUid", "==", athlete)));
    return snap.docs.map(d => fromDoc(d.id, d.data())).sort((a, b) => b.weekOf.localeCompare(a.weekOf));
}

export async function saveCycle(cycle) {
    const data = { ...toDoc(cycle), updatedAt: serverTimestamp() };
    // The first save of a cycle stamps when it started.
    if (!cycle.createdAt) data.createdAt = serverTimestamp();
    await setDoc(doc(db, "planningCycles", cycle.id), data, { merge: true });
    if (!cycle.createdAt) cycle.createdAt = Date.now();
    return cycle;
}

export async function markPublished(athleteUid, header) {
    if (!header?.id || !header.plan) return 0;
    const cycles = await listCycles(athleteUid);
    let n = 0;
    for (const c of cycles) {
        if (c.status !== "approved") continue;
        const next = withPublished(c, { planId: header.id, version: header.version, plan: header.plan });
        if (next === c) continue;
        await saveCycle(next);
        n++;
    }
    return n;
}
