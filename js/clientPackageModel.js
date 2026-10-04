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

    
// Online payments (Stripe Checkout, functions/) need the Firebase Blaze plan,
// deployed functions and the prices set (functions/README.md). Until then the
// client's package card shows no Pay button: it would only fail. Switch this
// on in the same change that deploys them.
export const ONLINE_PAYMENTS = false;

// The client's pay button for a package, or null.
export function paymentAction(pkg, { online = ONLINE_PAYMENTS } = {}) {
    if (!online) return null;
    if (pkg?.status !== "active") return null;
    if (pkg.paymentStatus === "comped" || pkg.paymentStatus === "paid") return null;
    if (pkg.billingModel === "subscription" && pkg.paymentStatus === "past_due" && pkg.stripeSubscriptionId) {
        return "Manage Billing";
    }
    return pkg.billingModel === "subscription"
        ? (pkg.paymentStatus === "past_due" ? "Retry payment" : "Subscribe")
        : (pkg.paymentStatus === "past_due" ? "Retry payment" : "Pay now");
}

export function paymentActionType(pkg) {
    return pkg?.billingModel === "subscription" && pkg.paymentStatus === "past_due" && pkg.stripeSubscriptionId
        ? "portal"
        : "checkout";
}

// Once Stripe has created checkout/customer/subscription state, billing is
// server-managed and the coach UI should not offer a manual override.
export function isStripeManagedPackage(pkg) {
    return Boolean(
        typeof pkg?.stripeCheckoutSessionId === "string" && pkg.stripeCheckoutSessionId.trim()
    ) || Boolean(
        typeof pkg?.stripeSubscriptionId === "string" && pkg.stripeSubscriptionId.trim()
    ) || Boolean(
        typeof pkg?.stripeCustomerId === "string" && pkg.stripeCustomerId.trim()
    );
}

// ---- Reminders for the coach (Phase 11 step 5) ----

const DAY = 86400000;
const niceDay = iso => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return String(iso || "");
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const addDaysIso = (iso, n) => {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const millis = v => typeof v === "number" ? v : v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : v ? Date.parse(v) || 0 : 0;

// What the coach should do about a client's packages, one line each, most
// pressing first: payment past due, sessions used up, package ended
// (still active), 1 session left, ends within a week, payment pending a
// week or more. `sessions` = sessionList(...) (each with its log).
// -> [{ kind: "package", text, tab: "overview", at? }]
export function packageAttention(packages = [], sessions = [], today = "", now = Date.now()) {
    const items = [];
    for (const pkg of packages || []) {
        if (!pkg || !["active", "paused"].includes(pkg.status)) continue;
        const name = pkg.packageName || "Package";
        const lines = [];
        if (pkg.paymentStatus === "past_due") lines.push({ rank: 0, text: `${name}: payment past due` });
        if (pkg.status === "active" && isFiniteSessionPackage(pkg)) {
            const left = packageRemainingSessions(pkg, countCompletedPackageSessions(pkg.id, sessions));
            if (left === 0) lines.push({ rank: 1, text: `${name}: all ${pkg.sessionAllowance} sessions used. Renew it or mark it complete` });
            else if (left === 1) lines.push({ rank: 3, text: `${name}: 1 session left` });
        }
        if (pkg.status === "active" && pkg.endsAt && today) {
            if (pkg.endsAt < today) lines.push({ rank: 2, text: `${name} ended ${niceDay(pkg.endsAt)}. Renew it or mark it complete` });
            else if (pkg.endsAt <= addDaysIso(today, 7)) lines.push({ rank: 4, text: `${name} ends ${niceDay(pkg.endsAt)}` });
        }
        const created = millis(pkg.createdAt);
        if ((pkg.paymentStatus || "pending") === "pending" && created && now - created >= 7 * DAY) {
            lines.push({ rank: 5, text: `${name}: payment still pending (${Math.floor((now - created) / DAY)} days)`, at: created });
        }
        if (lines.length) {
            lines.sort((a, b) => a.rank - b.rank);
            items.push({ kind: "package", text: lines[0].text, tab: "overview", rank: lines[0].rank, ...(lines[0].at ? { at: lines[0].at } : {}) });
        }
    }
    // `priority` orders them on the coach's dashboard (js/coachToday.js).
    return items.sort((a, b) => a.rank - b.rank).map(({ rank, ...item }) => ({ ...item, priority: rank }));
}
