/* ==========================================
   Southbound — Stripe billing model (pure)

   Browser- and Firebase-independent checkout contracts.
========================================== */

export const STRIPE_PACKAGE_IDS = Object.freeze([
    'online_monthly',
    'soccer_1on1_single',
    'soccer_1on1_5',
    'soccer_1on1_10',
    'soccer_group_drop_in',
    'soccer_group_monthly'
]);

export function checkoutModeForPackage(pkg) {
    if (pkg?.billingModel === 'subscription') return 'subscription';
    if (pkg?.billingModel === 'single' || pkg?.billingModel === 'session_pack') return 'payment';
    return null;
}

export function priceIdForPackage(packageId, config = {}) {
    if (!STRIPE_PACKAGE_IDS.includes(packageId)) return null;
    const priceId = config?.prices?.[packageId];
    return typeof priceId === 'string' && /^price_[A-Za-z0-9]+$/.test(priceId) ? priceId : null;
}

export function stripeMetadata({ clientUid, packageAssignmentId, packageId }) {
    return {
        clientUid: String(clientUid || ''),
        packageAssignmentId: String(packageAssignmentId || ''),
        packageId: String(packageId || '')
    };
}

export function paymentStatusForSubscriptionStatus(status) {
    if (status === 'past_due' || status === 'unpaid') return 'past_due';
    if (status === 'incomplete' || status === 'incomplete_expired') return 'pending';
    if (status === 'active' || status === 'trialing') return 'paid';
    return null;
}

export function lifecycleUpdateForSubscriptionEvent(eventType, status) {
    if (eventType === 'customer.subscription.deleted') {
        return { status: 'cancelled' };
    }

    const paymentStatus = paymentStatusForSubscriptionStatus(status);
    return paymentStatus ? { paymentStatus } : {};
}

export function validateStripeConfig(config = {}) {
    const secretKey = config?.secretKey;
    const webhookSecret = config?.webhookSecret;
    if (typeof secretKey !== 'string' || !/^sk_(test|live)_[A-Za-z0-9_]+$/.test(secretKey)) {
        return { ok: false, reason: 'invalid-secret-key' };
    }
    if (typeof webhookSecret !== 'string' || !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)) {
        return { ok: false, reason: 'invalid-webhook-secret' };
    }

    const prices = config?.prices;
    if (!prices || typeof prices !== 'object') {
        return { ok: false, reason: 'missing-prices' };
    }

    for (const packageId of STRIPE_PACKAGE_IDS) {
        const priceId = prices[packageId];
        if (typeof priceId !== 'string' || !/^price_[A-Za-z0-9]+$/.test(priceId)) {
            return { ok: false, reason: 'missing-price-' + packageId };
        }
    }

    return { ok: true };
}
