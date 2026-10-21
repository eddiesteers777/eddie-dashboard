/* ==========================================
   Southbound — session plans (sessionPlans/{coachUid}_{key}_{date})

   A practice plan the coach attaches to one session so the people booked
   on it can see what's coming. Model: js/sessionPlanModel.js. Rules:
   firestore.rules (validSessionPlan).
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    doc, setDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { cleanPlan, validPlan, planId } from "./sessionPlanModel.js";

// Coach: every plan they attached. Client: every plan for a session they are booked on.
export async function listMyPlans(role = "coach") {
    const user = await waitForUser();
    if (!user) return [];
    const q = role === "client"
        ? query(collection(db, "sessionPlans"), where("clientUids", "array-contains", user.uid))
        : query(collection(db, "sessionPlans"), where("coachUid", "==", user.uid));
    return (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function savePlan(input) {
    const user = await waitForUser();
    const plan = cleanPlan(input);
    const problem = validPlan(plan);
    if (problem) throw new Error(problem);
    const id = planId(user.uid, plan.key, plan.date);
    await setDoc(doc(db, "sessionPlans", id), { coachUid: user.uid, ...plan, updatedAt: serverTimestamp() });
    return { id, coachUid: user.uid, ...plan };
}

export async function deletePlan(key, date) {
    const user = await waitForUser();
    await deleteDoc(doc(db, "sessionPlans", planId(user.uid, key, date)));
}
