# Southbound Stripe Functions

This backend is separate from the static GitHub Pages site.

## Functions

- `createStripeCheckoutSession` — authenticated callable function that validates a client package assignment and creates a Stripe-hosted Checkout Session.
- `stripeWebhook` — public HTTPS webhook that verifies Stripe signatures and updates Southbound package billing state after Stripe confirms payment events.

## Secret configuration

Use Firebase Secret Manager. Never commit Stripe keys.

Create one JSON secret named `STRIPE_CONFIG`:

~~~json
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
~~~

## Deployment prerequisites

Firebase Cloud Functions deployment requires the Firebase project to use the Blaze plan. Node 22 is supported by the current Firebase Functions tooling.

From the repository root:

~~~bash
firebase login
firebase use eddie-s-dashboard
firebase functions:secrets:set STRIPE_CONFIG
firebase deploy --only functions
~~~

`APP_ORIGIN` defaults to `https://southboundcoaching.com`.

After deployment, register the `stripeWebhook` HTTPS URL in Stripe Workbench and use its `whsec_...` signing secret in `STRIPE_CONFIG`.

Keep the Stripe account in test mode until checkout and webhook behavior has been verified end-to-end.
