import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineJsonSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';
import { checkoutModeForPackage, priceIdForPackage, stripeMetadata, STRIPE_PACKAGE_IDS, lifecycleUpdateForSubscriptionEvent, checkoutBlockedReason, stripeConfigSummary } from './billingModel.js';

initializeApp();
const db = getFirestore();
const stripeConfig = defineJsonSecret('STRIPE_CONFIG');
const appOrigin = defineString('APP_ORIGIN', { default: 'https://southboundcoaching.com' });

function getStripe() {
    const config = stripeConfig.value();
    if (!config?.secretKey) throw new Error('Stripe secret key is not configured.');
    return new Stripe(config.secretKey);
}

function requireAuth(request) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to pay for a package.');
    return request.auth.uid;
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

async function loadClientPackage(clientUid, packageAssignmentId) {
    const ref = db.collection('clientPackages').doc(packageAssignmentId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'That package assignment no longer exists.');
    const pkg = snap.data();
    if (pkg.clientUid !== clientUid) throw new HttpsError('permission-denied', 'That package does not belong to this account.');
    if (pkg.status !== 'active') throw new HttpsError('failed-precondition', 'That package is not currently active.');
    if (pkg.endsAt && String(pkg.endsAt) < todayIso()) throw new HttpsError('failed-precondition', 'That package has ended.');
    const mode = checkoutModeForPackage(pkg);
    if (!mode) throw new HttpsError('failed-precondition', 'That package cannot be purchased through Stripe.');
    const blockedReason = checkoutBlockedReason(pkg, mode);
    if (blockedReason === 'already-paid') {
        throw new HttpsError('already-exists', 'That package is already marked paid.');
    }
    if (blockedReason === 'existing-subscription') {
        throw new HttpsError('failed-precondition', 'This package already has a Stripe subscription. Use Manage Billing to update it.');
    }
    if (!STRIPE_PACKAGE_IDS.includes(pkg.packageId)) throw new HttpsError('failed-precondition', 'That package is not in the Stripe catalog.');
    return { ref, pkg, mode };
}

export const getStripeBillingReadiness = onCall(
    { region: 'us-central1', secrets: [stripeConfig] },
    async request => {
        const uid = requireAuth(request);
        const profileSnap = await db.collection('userProfiles').doc(uid).get();
        const profile = profileSnap.data();

        if (!profileSnap.exists || profile?.role !== 'coach' || profile?.isCoachApproved !== true) {
            throw new HttpsError('permission-denied', 'Only an approved coach can check Stripe setup.');
        }

        let config = null;
        try {
            config = stripeConfig.value();
        } catch {
            config = null;
        }

        return stripeConfigSummary(config);
    }
);

export const createStripeCheckoutSession = onCall(
    { region: 'us-central1', secrets: [stripeConfig] },
    async request => {
        const clientUid = requireAuth(request);
        const packageAssignmentId = String(request.data?.packageAssignmentId || '').trim();
        if (!packageAssignmentId || packageAssignmentId.length > 200) {
            throw new HttpsError('invalid-argument', 'A valid package assignment is required.');
        }

        const { pkg, mode } = await loadClientPackage(clientUid, packageAssignmentId);
        const priceId = priceIdForPackage(pkg.packageId, stripeConfig.value());
        if (!priceId) {
            throw new HttpsError('failed-precondition', 'This Southbound package has not been connected to a Stripe price yet.');
        }

        const stripe = getStripe();
        const email = typeof request.auth.token?.email === 'string' ? request.auth.token.email : undefined;
        const metadata = stripeMetadata({ clientUid, packageAssignmentId, packageId: pkg.packageId });
        const origin = appOrigin.value().replace(/\/$/, '');
        const params = {
            mode,
            line_items: [{ price: priceId, quantity: 1 }],
            client_reference_id: clientUid + ':' + packageAssignmentId,
            metadata,
            success_url: origin + '/index.html?stripe=success&session_id={CHECKOUT_SESSION_ID}',
            cancel_url: origin + '/index.html?stripe=cancelled',
            ...(email ? { customer_email: email } : {})
        };
        if (mode === 'subscription') {
            params.subscription_data = { metadata };
        } else {
            params.customer_creation = 'always';
        }

        try {
            const session = await stripe.checkout.sessions.create(params);
            await db.collection('clientPackages').doc(packageAssignmentId).set({
                stripeCheckoutSessionId: session.id,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            return { url: session.url, sessionId: session.id };
        } catch (error) {
            console.error('Southbound Stripe Checkout creation failed.', error);
            throw new HttpsError('internal', 'Southbound could not start checkout.');
        }
    }
);

async function markPackagePaid({ clientUid, packageAssignmentId, customerId = null, subscriptionId = null, checkoutSessionId = null }) {
    if (!clientUid || !packageAssignmentId) return;
    const ref = db.collection('clientPackages').doc(packageAssignmentId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().clientUid !== clientUid) return;
    const update = { paymentStatus: 'paid', updatedAt: FieldValue.serverTimestamp() };
    if (customerId) update.stripeCustomerId = customerId;
    if (subscriptionId) update.stripeSubscriptionId = subscriptionId;
    if (checkoutSessionId) update.stripeCheckoutSessionId = checkoutSessionId;
    await ref.set(update, { merge: true });
    if (customerId) {
        await db.collection('billingAccounts').doc(clientUid).set({
            clientUid,
            stripeCustomerId: customerId,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    }
}

async function markPackagePastDue({ clientUid, packageAssignmentId }) {
    if (!clientUid || !packageAssignmentId) return;
    const ref = db.collection('clientPackages').doc(packageAssignmentId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().clientUid !== clientUid) return;
    await ref.set({ paymentStatus: 'past_due', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function subscriptionTarget(stripe, subscriptionId) {
    if (!subscriptionId) return null;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return {
        clientUid: subscription.metadata?.clientUid || '',
        packageAssignmentId: subscription.metadata?.packageAssignmentId || '',
        packageId: subscription.metadata?.packageId || ''
    };
}

export const createStripeCustomerPortalSession = onCall(
    { region: 'us-central1', secrets: [stripeConfig] },
    async request => {
        const clientUid = requireAuth(request);
        const billingRef = db.collection('billingAccounts').doc(clientUid);
        const billingSnap = await billingRef.get();
        const billing = billingSnap.data();

        if (!billingSnap.exists || !billing?.stripeCustomerId) {
            throw new HttpsError('failed-precondition', 'Stripe billing is not available for this account yet.');
        }

        const stripe = getStripe();
        const origin = appOrigin.value().replace(/\/$/, '');

        try {
            const session = await stripe.billingPortal.sessions.create({
                customer: billing.stripeCustomerId,
                return_url: origin + '/settings.html'
            });
            return { url: session.url };
        } catch (error) {
            console.error('Southbound Stripe Customer Portal session creation failed.', error);
            throw new HttpsError('internal', 'Southbound could not open billing management.');
        }
    }
);

export const stripeWebhook = onRequest(
    { region: 'us-central1', secrets: [stripeConfig], timeoutSeconds: 60 },
    async (req, res) => {
        if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
        const config = stripeConfig.value();
        if (!config?.webhookSecret) { res.status(500).send('Stripe webhook is not configured'); return; }
        const signature = req.headers['stripe-signature'];
        if (typeof signature !== 'string') { res.status(400).send('Missing Stripe signature'); return; }

        let event;
        try {
            event = Stripe.webhooks.constructEvent(req.rawBody, signature, config.webhookSecret);
        } catch (error) {
            console.error('Southbound Stripe webhook signature failed.', error);
            res.status(400).send('Invalid signature');
            return;
        }

        try {
            switch (event.type) {
                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                case 'customer.subscription.deleted': {
                    const subscription = event.data.object;
                    const clientUid = subscription.metadata?.clientUid || '';
                    const packageAssignmentId = subscription.metadata?.packageAssignmentId || '';
                    if (clientUid && packageAssignmentId) {
                        const lifecycleUpdate = lifecycleUpdateForSubscriptionEvent(event.type, subscription.status);
                        const ref = db.collection('clientPackages').doc(packageAssignmentId);
                        const snap = await ref.get();
                        if (snap.exists && snap.data().clientUid === clientUid) {
                            await ref.set({
                                stripeSubscriptionId: subscription.id,
                                stripeSubscriptionStatus: subscription.status || null,
                                ...(typeof subscription.customer === 'string' ? { stripeCustomerId: subscription.customer } : {}),
                                ...lifecycleUpdate,
                                updatedAt: FieldValue.serverTimestamp()
                            }, { merge: true });

                            if (typeof subscription.customer === 'string') {
                                await db.collection('billingAccounts').doc(clientUid).set({
                                    clientUid,
                                    stripeCustomerId: subscription.customer,
                                    updatedAt: FieldValue.serverTimestamp()
                                }, { merge: true });
                            }
                        }
                    }
                    break;
                }
                case 'checkout.session.completed':
                case 'checkout.session.async_payment_succeeded': {
                    const session = event.data.object;
                    await markPackagePaid({
                        clientUid: session.metadata?.clientUid,
                        packageAssignmentId: session.metadata?.packageAssignmentId,
                        customerId: typeof session.customer === 'string' ? session.customer : null,
                        subscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
                        checkoutSessionId: session.id
                    });
                    break;
                }
                case 'checkout.session.async_payment_failed': {
                    const session = event.data.object;
                    await markPackagePastDue({
                        clientUid: session.metadata?.clientUid,
                        packageAssignmentId: session.metadata?.packageAssignmentId
                    });
                    break;
                }
                case 'invoice.paid':
                case 'invoice.payment_failed': {
                    const invoice = event.data.object;
                    const subscriptionId = typeof invoice.subscription === 'string'
                        ? invoice.subscription
                        : invoice.subscription?.id;
                    if (subscriptionId) {
                        const target = await subscriptionTarget(getStripe(), subscriptionId);
                        if (event.type === 'invoice.paid') {
                            await markPackagePaid({
                                clientUid: target?.clientUid,
                                packageAssignmentId: target?.packageAssignmentId,
                                customerId: typeof invoice.customer === 'string' ? invoice.customer : null,
                                subscriptionId
                            });
                        } else {
                            await markPackagePastDue({
                                clientUid: target?.clientUid,
                                packageAssignmentId: target?.packageAssignmentId
                            });
                        }
                    }
                    break;
                }
                default:
                    break;
            }
            res.status(200).json({ received: true });
        } catch (error) {
            console.error('Southbound Stripe webhook processing failed.', error);
            res.status(500).send('Webhook processing failed');
        }
    }
);
