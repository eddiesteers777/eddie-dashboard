/* ==========================================
   Southbound — canonical package catalog

   Phase 9 starts with the package shapes the business already advertises.
   Prices stay unset until the business decides them. This module is the
   single source future package assignment, session accounting and billing
   features should reuse instead of each page inventing its own labels.
========================================== */

export const PACKAGE_CATALOG = Object.freeze([
    {
        id: "online_monthly",
        name: "Online Coaching",
        service: "online_coaching",
        family: "online",
        billingModel: "subscription",
        cadence: "monthly",
        sessionAllowance: null,
        priceCents: null,
        active: true
    },
    {
        id: "soccer_1on1_single",
        name: "1-on-1 Soccer — Single Session",
        service: "soccer_1on1",
        family: "soccer_1on1",
        billingModel: "single",
        cadence: "one_time",
        sessionAllowance: 1,
        priceCents: null,
        active: true
    },
    {
        id: "soccer_1on1_5",
        name: "1-on-1 Soccer — 5 Sessions",
        service: "soccer_1on1",
        family: "soccer_1on1",
        billingModel: "session_pack",
        cadence: "one_time",
        sessionAllowance: 5,
        priceCents: null,
        active: true
    },
    {
        id: "soccer_1on1_10",
        name: "1-on-1 Soccer — 10 Sessions",
        service: "soccer_1on1",
        family: "soccer_1on1",
        billingModel: "session_pack",
        cadence: "one_time",
        sessionAllowance: 10,
        priceCents: null,
        active: true
    },
    {
        id: "soccer_group_drop_in",
        name: "Group Soccer — Drop In",
        service: "soccer_group",
        family: "soccer_group",
        billingModel: "single",
        cadence: "one_time",
        sessionAllowance: 1,
        priceCents: null,
        active: true
    },
    {
        id: "soccer_group_monthly",
        name: "Group Soccer — Monthly",
        service: "soccer_group",
        family: "soccer_group",
        billingModel: "subscription",
        cadence: "weekly",
        sessionAllowance: null,
        priceCents: null,
        active: true
    }
]);

export const PACKAGE_IDS = Object.freeze(PACKAGE_CATALOG.map(pkg => pkg.id));

export function getPackage(id) {
    return PACKAGE_CATALOG.find(pkg => pkg.id === id) || null;
}

export function packageSessionLabel(pkg) {
    if (!pkg) return "";
    if (Number.isFinite(pkg.sessionAllowance)) {
        return `${pkg.sessionAllowance} session${pkg.sessionAllowance === 1 ? "" : "s"}`;
    }
    if (pkg.cadence === "monthly") return "Monthly";
    if (pkg.cadence === "weekly") return "Weekly";
    return "";
}

export function isFiniteSessionPackage(pkg) {
    return Number.isFinite(pkg?.sessionAllowance);
}