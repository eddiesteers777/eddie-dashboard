/* ==========================================
   Southbound — client Stripe Checkout

   Only starts Checkout. Payment truth remains on the server/webhook.
========================================== */

import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js';
import { app } from './firebase.js';

const functions = getFunctions(app, 'us-central1');
const createCheckout = httpsCallable(functions, 'createStripeCheckoutSession');

export async function openStripeCustomerPortal() {
    const result = await httpsCallable(functions, 'createStripeCustomerPortalSession')();
    const url = result?.data?.url;
    if (typeof url !== 'string' || !/^https:\/\/billing\.stripe\.com\//.test(url)) {
        throw new Error('invalid-portal-url');
    }
    window.location.assign(url);
}

export async function startStripeCheckout(packageAssignmentId) {
    if (!packageAssignmentId) throw new Error('missing-package');
    const result = await createCheckout({ packageAssignmentId });
    const url = result?.data?.url;
    if (typeof url !== 'string' || !/^https:\/\/(checkout\.)?stripe\.com\//.test(url)) {
        throw new Error('invalid-checkout-url');
    }
    window.location.assign(url);
}
