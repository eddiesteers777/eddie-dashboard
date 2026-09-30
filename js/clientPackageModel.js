/* ==========================================
   Southbound — pure client package helpers

   No browser or Firestore dependencies. This keeps package accounting
   logic testable in Node and reusable by future client-facing views.
========================================== */

import { PACKAGE_CATALOG, isFiniteSessionPackage } from "./packageCatalog.js";

export const PACKAGE_STATUSES = Object.freeze(["active", "paused", "completed", "cancelled"]);

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
