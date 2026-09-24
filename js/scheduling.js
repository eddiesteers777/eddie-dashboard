/* ==========================================
   Southbound — Scheduling

   Lets a coach publish recurring weekly availability (day, time,
   session type, capacity -- 1 for 1:1, more for group) and lets a
   linked client request time on it, single-date or recurring across
   a chosen number of weeks. Every request needs the coach's manual
   approval -- there's no instant-book here.

   Reuses the same coachLinks trust relationship plan-sharing already
   established: a client can only see or book a coach's availability
   once that coach has accepted their invite code. See
   firestore.rules for the actual enforcement.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    doc, getDoc, setDoc,
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export const SESSION_TYPES = [
    { value: "soccer", label: "Soccer" },
    { value: "running", label: "Running" },
    { value: "strength", label: "Strength" },
    { value: "general", label: "General" }
];

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function availabilityDoc(coachUid) {
    return doc(db, "coachAvailability", coachUid);
}

function uid() {
    return window.crypto?.randomUUID ? window.crypto.randomUUID() : `slot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Coach availability ----

export async function getCoachAvailability(coachUid) {
    const snap = await getDoc(availabilityDoc(coachUid));
    if (!snap.exists()) return { slots: [], blackoutDates: [] };
    const data = snap.data();
    return { slots: data.slots || [], blackoutDates: data.blackoutDates || [] };
}

export async function saveCoachAvailability(slots, blackoutDates) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    await setDoc(availabilityDoc(user.uid), { slots, blackoutDates, updatedAt: serverTimestamp() }, { merge: true });
}

export async function addAvailabilitySlot(slot) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    const current = await getCoachAvailability(user.uid);
    const newSlot = { id: uid(), active: true, capacity: 1, ...slot };
    await saveCoachAvailability([...current.slots, newSlot], current.blackoutDates);
    return newSlot;
}

export async function removeAvailabilitySlot(slotId) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    const current = await getCoachAvailability(user.uid);
    await saveCoachAvailability(current.slots.filter(s => s.id !== slotId), current.blackoutDates);
}

export async function toggleAvailabilitySlot(slotId, active) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    const current = await getCoachAvailability(user.uid);
    await saveCoachAvailability(
        current.slots.map(s => s.id === slotId ? { ...s, active } : s),
        current.blackoutDates
    );
}

export async function addBlackoutDate(dateStr) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    const current = await getCoachAvailability(user.uid);
    if (current.blackoutDates.includes(dateStr)) return;
    await saveCoachAvailability(current.slots, [...current.blackoutDates, dateStr]);
}

export async function removeBlackoutDate(dateStr) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    const current = await getCoachAvailability(user.uid);
    await saveCoachAvailability(current.slots, current.blackoutDates.filter(d => d !== dateStr));
}

// ---- Date math ----

// Builds `count` date strings (YYYY-MM-DD), one per week, starting
// from the first occurrence of `dayOfWeek` on or after `fromDate`.
export function generateWeeklyDates(fromDate, dayOfWeek, count) {
    const start = new Date(`${fromDate}T00:00:00`);
    const offset = (dayOfWeek - start.getDay() + 7) % 7;
    start.setDate(start.getDate() + offset);

    const dates = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${day}`);
    }
    return dates;
}

// ---- Booking requests ----

export async function requestBooking({ coachUid, coachName, slot, dates, weeks, clientNote }) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    if (!dates?.length) throw new Error("no-dates");

    const payload = {
        coachUid,
        coachName: coachName || "Coach",
        clientUid: user.uid,
        clientName: user.displayName || "Client",
        clientEmail: user.email || "",
        slotId: slot.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        sessionType: slot.sessionType,
        label: slot.label || "",
        capacity: slot.capacity || 1,
        recurring: weeks > 1 ? { weeks } : false,
        dates,
        status: "requested",
        clientNote: clientNote || "",
        coachNote: "",
        createdAt: serverTimestamp(),
        respondedAt: null
    };
    const ref = await addDoc(collection(db, "bookingRequests"), payload);
    return { id: ref.id, ...payload };
}

export async function listMyBookingRequests() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "bookingRequests"), where("clientUid", "==", user.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listRequestsForMyClients() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "bookingRequests"), where("coachUid", "==", user.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function respondToRequest(requestId, status, coachNote) {
    await updateDoc(doc(db, "bookingRequests", requestId), {
        status,
        coachNote: coachNote || "",
        respondedAt: serverTimestamp()
    });
}

export async function cancelBookingRequest(requestId) {
    await updateDoc(doc(db, "bookingRequests", requestId), { status: "cancelled", respondedAt: serverTimestamp() });
}

// Informational only (not a hard capacity lock) -- returns how many
// spots in a group slot are already approved for a given date, so a
// coach can make an informed call before approving another request
// into the same slot. Safe to run at this scale (one coach, manual
// approval) without a transaction; see js/scheduling.js module
// comment in schedule.js for why a hard lock isn't worth the
// complexity here.
export async function getApprovedCountForSlotDate(coachUid, slotId, dateStr) {
    const snap = await getDocs(query(
        collection(db, "bookingRequests"),
        where("coachUid", "==", coachUid),
        where("slotId", "==", slotId),
        where("status", "==", "approved")
    ));
    let count = 0;
    for (const docSnap of snap.docs) {
        const dates = docSnap.data().dates || [];
        if (dates.includes(dateStr)) count++;
    }
    return count;
}
