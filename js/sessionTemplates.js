/* ==========================================
   Southbound — session templates (sessionTemplates/{coachUid}_{id})

   A session plan saved to start from again: focus, what to bring and the
   parts with their private notes. Coach only. Pure cleaning lives in
   js/sessionBuild.js (cleanTemplate). Rules: firestore.rules.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import { doc, setDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { cleanTemplate, validTemplate } from "./sessionBuild.js";

export async function listTemplates() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "sessionTemplates"), where("coachUid", "==", user.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function saveTemplate(input) {
    const user = await waitForUser();
    const t = cleanTemplate(input);
    const problem = validTemplate(t);
    if (problem) throw new Error(problem);
    const id = `${user.uid}_${Date.now().toString(36)}`;
    await setDoc(doc(db, "sessionTemplates", id), { coachUid: user.uid, ...t, updatedAt: serverTimestamp() });
    return { id, coachUid: user.uid, ...t };
}

export async function deleteTemplate(id) {
    await deleteDoc(doc(db, "sessionTemplates", id));
}
