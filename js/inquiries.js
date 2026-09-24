/* ==========================================
   Southbound — Website Questions (inquiries)

   The public Contact page lets anyone ask a question without signing
   in -- parents asking "do you train 12-year-olds?" shouldn't need a
   Google account first. Each question is saved to Firestore (so
   nothing is lost even if email isn't set up) and only approved
   coaches can read it. firestore.rules checks every field, since
   anyone on the internet can write here.
========================================== */

import { db } from "./firebase.js";
import {
    doc, addDoc, updateDoc, collection, query, orderBy, limit, getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Keep in step with the `interest` list in firestore.rules.
export const INTEREST_OPTIONS = [
    { value: "online_coaching", label: "Online Coaching" },
    { value: "running_strength", label: "Running or Strength" },
    { value: "soccer_1on1", label: "1-on-1 Soccer" },
    { value: "soccer_group", label: "Group Soccer" },
    { value: "other", label: "Something else" }
];

export function interestLabel(value) {
    return INTEREST_OPTIONS.find(o => o.value === value)?.label || "Something else";
}

// Limits match firestore.rules; the form enforces them too.
export const LIMITS = { name: 100, email: 200, phone: 40, athleteAge: 20, message: 2000 };

export async function submitInquiry({ name, email, phone, interest, who, athleteAge, message }) {
    await addDoc(collection(db, "inquiries"), {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        interest,
        who,
        athleteAge: who === "child" ? athleteAge.trim() : "",
        message: message.trim(),
        status: "new",
        createdAt: serverTimestamp()
    });
}

// Coach-only (rules): newest first.
export async function listInquiries() {
    const snap = await getDocs(query(collection(db, "inquiries"), orderBy("createdAt", "desc"), limit(100)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function setInquiryHandled(id, handled) {
    await updateDoc(doc(db, "inquiries", id), {
        status: handled ? "handled" : "new",
        handledAt: handled ? serverTimestamp() : null
    });
}
