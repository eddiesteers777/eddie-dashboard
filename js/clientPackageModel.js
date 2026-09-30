/* ==========================================
   Southbound — pure client package helpers

   No browser or Firestore dependencies. This keeps package accounting
   logic testable in Node and reusable by future client-facing views.
========================================== */

import { PACKAGE_CATALOG, isFiniteSessionPackage } from "./packageCatalog.js";

export const PACKAGE_STATUSES = Object.freeze(["active", "paused", "completed", "cancelled"]);
export const PAYMENT_STATUSES = Object.freeze(["pending", "paid", "past_due", "comped"]);

export function packageRemainingSessions(pkg, countedSessions = 0) {
    if (!isFiniteSessionPackage(pkg)) return null;
    return Math.max(0, pkg.sessionAllowance - Math.max(0, Number(countedSessions) || 0));
}

export function packageCatalogOptions() {
    return PACKAGE_CATALOG.filter(pkg => pkg.active).map(pkg => ({
        id: pkg.id,
        name: pkg.name,
        service: pkg.service,
        sessionAllowance: pkg.sessionAllowance
    }));
}

export function countCompletedPackageSessions(packageId, sessions = []) {
    if (!packageId) return 0;
    return (sessions || []).filter(s =>
        s?.log?.status === "completed" && s.log.packageAssignmentId === packageId
    ).length;
}

// A finite package can consume a session only while it is active, inside
// its optional date window, and still has a credit available. This is a
// UI/domain guardrail; Firestore independently validates the package
// relationship and active date window for new assignments.
export function packageDateInWindow(pkg, date) {
    if (!pkg || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return false;
    return (!pkg.startsAt || String(date) >= String(pkg.startsAt))
        && (!pkg.endsAt || String(date) <= String(pkg.endsAt));
}

export function packageCanConsumeSession(pkg, date, countedSessions = 0) {
    if (!isFiniteSessionPackage(pkg) || pkg.status !== "active") return false;
    if (!packageDateInWindow(pkg, date)) return false;
    return packageRemainingSessions(pkg, countedSessions) > 0;
}
