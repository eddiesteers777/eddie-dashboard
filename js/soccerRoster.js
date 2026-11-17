/* ==========================================
   Southbound — every soccer player, for every soccer coach (2026-11-15)

   The Players list on the Soccer page shows all active clients with a soccer
   service, not only the coach's own links. The roster comes from
   clientDirectory (every approved coach may already read it); homework from
   every coach comes from `homework` (a soccer coach and the admin may read
   it, never change it: firestore.rules isSoccerCoach). A player who is not
   yet this coach's is added to their players (assignClient) the first time
   they assign homework. Pure parts: tests/soccerRoster.test.mjs.
========================================== */

import { hasSoccerService } from "./services.js";

// Active soccer players from directory rows ({ uid, displayName, services, status }).
export function soccerRoster(directory = [], myLinks = []) {
    const mine = new Set((myLinks || []).map(l => l.clientUid));
    const links = [], profiles = new Map();
    for (const d of directory || []) {
        if (!d?.uid || d.status !== "active" || !hasSoccerService(d.services)) continue;
        links.push({ clientUid: d.uid, clientName: d.displayName || "" });
        profiles.set(d.uid, { uid: d.uid, displayName: d.displayName || "", services: d.services || [] });
    }
    // A link of mine the directory doesn't list stays out: no soccer service, nothing to show.
    return { links, profiles, mine };
}

// The database modules load on demand so the pure part above stays unit-testable.
const fs = () => Promise.all([import("./firebase.js"), import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")]).then(([f, m]) => ({ db: f.db, ...m }));

export async function loadSoccerRoster(myLinks) {
    const { db, collection, query, where, getDocs } = await fs();
    const snap = await getDocs(query(collection(db, "clientDirectory"), where("status", "==", "active")));
    return soccerRoster(snap.docs.map(d => ({ uid: d.id, ...d.data() })), myLinks);
}

// Every coach's soccer homework (read-only). Throws when the rules don't allow it.
export async function listAllSoccerHomework() {
    const { db, collection, getDocs } = await fs();
    const snap = await getDocs(collection(db, "homework"));
    return snap.docs.map(d => { const x = d.data(); return { id: d.id, ...x, logs: x.logs || [] }; });
}
