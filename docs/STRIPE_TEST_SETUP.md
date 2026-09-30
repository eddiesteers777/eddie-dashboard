# Southbound — Stripe test-mode setup

Use this checklist only in Stripe Test mode until the full flow is verified.

## 1. Create the Southbound Products and Prices

Create one Stripe Product for each package ID in the canonical Southbound catalog:

online_monthly
soccer_1on1_single
soccer_1on1_5
soccer_1on1_10
soccer_group_drop_in
soccer_group_monthly

Create the matching Stripe Price for each Product.

online_monthly and soccer_group_monthly should be recurring Prices. The other packages should be one-time Prices.

Do not paste the Price IDs into client-side JavaScript. Copy each resulting price_... ID into the private Stripe configuration in the next step.

## 2. Put Stripe credentials in Firebase Secret Manager

The Firebase Functions expect one JSON secret named STRIPE_CONFIG:

{
  "secretKey": "sk_test_...",
  "webhookSecret": "whsec_...",
  "prices": {
    "online_monthly": "price_...",
    "soccer_1on1_single": "price_...",
    "soccer_1on1_5": "price_...",
    "soccer_1on1_10": "price_...",
    "soccer_group_drop_in": "price_...",
    "soccer_group_monthly": "price_..."
  }
}

Set it from the repository root:

firebase login
firebase use eddie-s-dashboard
firebase functions:secrets:set STRIPE_CONFIG

Never commit the JSON, Stripe secret key, webhook signing secret, or Price IDs into the repository.

## 3. Deploy the Functions

The Firebase project must be on the Blaze plan for Cloud Functions deployment.

firebase deploy --only functions

The deployment should create these functions:

createStripeCheckoutSession
createStripeCustomerPortalSession
stripeWebhook

## 4. Register the Stripe webhook

After deployment, copy the public HTTPS URL for stripeWebhook into Stripe Workbench → Webhooks.

Subscribe the endpoint to at least:

checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
invoice.paid
invoice.payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted

Copy the endpoint's whsec_... signing secret into STRIPE_CONFIG.

## 5. Test one-time checkout

Assign a test one-time package to a test client in Southbound.

From the client Today page: Your Package → Pay now

Complete Stripe Checkout with a Stripe test payment method.

Expected result:

1. Stripe Checkout completes.
2. The webhook reaches stripeWebhook.
3. The linked clientPackages record changes to paymentStatus: paid.
4. The Stripe Customer ID is stored in the client's billingAccounts record.
5. The client package card reflects Paid.

## 6. Test recurring subscription

Assign online_monthly to a test client.

Complete Checkout.

Expected result:

1. A Stripe subscription is created.
2. The subscription receives Southbound metadata identifying the client and package assignment.
3. Southbound stores stripeSubscriptionId and stripeSubscriptionStatus.
4. A Stripe Customer is stored for the client.
5. Settings → Billing shows Manage Billing.

Then use Stripe test tools to exercise subscription changes.

Expected behavior:

active/trialing → Southbound billing status Paid
past_due/unpaid → Southbound billing status Past due
incomplete/incomplete_expired → Southbound billing status Pending
subscription deleted → Southbound package status Cancelled

## 7. Test the duplicate-subscription protection

A recurring package that already has a stripeSubscriptionId must not create a second subscription.

The client should use Manage Billing for an existing past-due subscription.

## 8. Test Customer Portal

From Southbound: Settings → Billing → Manage Billing

Stripe should open the hosted Customer Portal.

## 9. Keep production disabled until this checklist passes

Do not switch the Stripe account or Price IDs to live mode until:

- one-time Checkout works
- recurring Checkout works
- webhook signatures are accepted
- payment success updates Southbound
- payment failures update Southbound
- subscription deletion updates Southbound
- Customer Portal opens
- duplicate subscription creation is blocked
