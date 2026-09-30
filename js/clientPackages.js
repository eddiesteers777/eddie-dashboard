/* ==========================================
   Southbound — client package entitlements

   A package assignment is a coaching entitlement, not proof of payment.
   Payment provider data is deliberately not stored here yet.

   clientPackages/{id}
   - coachUid / clientUid: ownership and link
   - packageId: canonical packageCatalog id
   - packageName / sessionAllowance: snapshot for stable history
   - status: active, paused, completed or cancelled
   - startsAt / endsAt: optional entitlement window (ISO date strings)
   - coachNote: internal coach-facing context
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import { getPackage, isFiniteSessionPackage } from "./packageCatalog.js";
export { packageRemainingSessions, packageCatalogOptions } from "./clientPackageModel.js";
import {
    collection, doc, getDocs, query, where, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const withId = snap => ({ id: snap.id, ...snap.data() });
const clean = (text, max = 500) => String(text || "").trim().slice(0, max);

export const PACKAGE_STATUSES = Object.freeze([
    "active",
    "paused",
    "completed",
    "cancelled"
]);

function packageDocId() {
    return window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeDates({ startsAt = null, endsAt = null } = {}) {
    return {
        startsAt: startsAt ? String(startsAt).slice(0, 10) : null,
        endsAt: endsAt ? String(endsAt).slice(0, 10) : null
    };
}

function snapshotPackage(pkg) {
    return {
        packageId: pkg.id,
        packageName: pkg.name,
        service: pkg.service,
        billingModel: pkg.billingModel,
        cadence: pkg.cadence,
        sessionAllowance: isFiniteSessionPackage(pkg) ? pkg.sessionAllowance : null
    };
}

function findPackageOrThrow(packageId) {
    const pkg = getPackage(packageId);
    if (!pkg || !pkg.active) throw new Error("unknown-package");
    return pkg;
}

// Client: every package entitlement assigned to my account.
export async function listMyPackages() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(
        collection(db, "clientPackages"),
        where("clientUid", "==", user.uid)
    ));
    return snap.docs.map(withId).sort((a, b) =>
        String(b.startsAt || b.createdAt || "").localeCompare(String(a.startsAt || a.createdAt || ""))
    );
}

// Coach: every package entitlement assigned to one linked client.
export async function listPackagesForClient(clientUid) {
    const user = await waitForUser();
    if (!user || !clientUid) return [];
    const snap = await getDocs(query(
        collection(db, "clientPackages"),
        where("coachUid", "==", user.uid),
        where("clientUid", "==", clientUid)
    ));
    return snap.docs.map(withId).sort((a, b) =>
        String(b.startsAt || b.createdAt || "").localeCompare(String(a.startsAt || a.createdAt || ""))
    );
}

// Coach: assign one catalog package to one linked client.
export async function createPackageForClient(clientUid, packageId, options = {}) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    if (!clientUid) throw new Error("missing-client");
    const pkg = findPackageOrThrow(packageId);
    const dates = normalizeDates(options);

    const id = packageDocId();
    const ref = doc(db, "clientPackages", id);
    const payload = {
        coachUid: user.uid,
        clientUid,
        ...snapshotPackage(pkg),
        status: PACKAGE_STATUSES.includes(options.status) ? options.status : "active",
        startsAt: dates.startsAt,
        endsAt: dates.endsAt,
        coachNote: clean(options.coachNote),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    await setDoc(ref, payload);
    return { id, ...payload };
}

// Coach: change the lifecycle/window/note, but never change package identity.
export async function updateClientPackage(id, changes = {}) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    if (!id) throw new Error("missing-package");

    const next = {};
    if (PACKAGE_STATUSES.includes(changes.status)) next.status = changes.status;
    if ("startsAt" in changes || "endsAt" in changes) {
        const dates = normalizeDates(changes);
        next.startsAt = dates.startsAt;
        next.endsAt = dates.endsAt;
    }
    if ("coachNote" in changes) next.coachNote = clean(changes.coachNote);
    if (!Object.keys(next).length) return null;

    next.updatedAt = serverTimestamp();
    await updateDoc(doc(db, "clientPackages", id), next);
    return next;
}
