// Pure helpers for the server-side client-directory backfill.
// Keeping the projection shape here makes it testable without credentials
// and makes it explicit that no private profile fields cross this boundary.

export function isActiveClientProfile(profile) {
    return Boolean(
        profile
        && profile.status === "active"
        && profile.role === "client"
        && profile.isCoachApproved !== true
    );
}

export function clientDirectoryFields(profile) {
    if (!isActiveClientProfile(profile)) return null;
    return {
        uid: String(profile.uid || ""),
        displayName: String(profile.displayName || ""),
        email: String(profile.email || ""),
        services: Array.isArray(profile.services) ? [...profile.services] : [],
        status: "active"
    };
}
