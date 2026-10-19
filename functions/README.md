# Southbound Stripe Functions

This backend is separate from the static GitHub Pages site.

## Functions

- `createStripeCheckoutSession` — authenticated callable function that validates a client package assignment and creates a Stripe-hosted Checkout Session.
- `stripeWebhook` — public HTTPS webhook that verifies Stripe signatures and updates Southbound package billing state after Stripe confirms payment events.
- `createStripeCustomerPortalSession` — authenticated callable function that creates a short-lived Stripe Customer Portal session for a client with an established Stripe Customer.

The webhook also listens for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted` so recurring subscription status stays synchronized with the linked Southbound package.

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

## Webhook idempotency

Stripe webhook deliveries are tracked in the server-only stripeWebhookEvents/{eventId} collection. A processed event is acknowledged without running its business logic again; a failed or stale in-progress event can be retried. Clients have no Firestore access to this collection.

# Exercise videos (MuscleWiki)

`getExerciseDemo` — authenticated callable function for the "How to" sheet. Active clients and approved coaches only (pending sign-ups can't spend the quota). It looks an exercise up on the MuscleWiki API with the server's key, caches the text in the server-only `exerciseDemoCache/{name}` collection (30 days; a "no match" for 7), and returns stream URLs carrying a 15-minute MuscleWiki media token. The key never reaches the app. Logic and tests: `exerciseDemoModel.js`, `tests/exerciseDemoModel.test.mjs`; the provider's rules we follow: `.claude/skills/exercise-demo-integration/SKILL.md`.

Setup (needs the Blaze plan and a MuscleWiki API subscription, TESTING or higher):

~~~bash
firebase functions:secrets:set MUSCLEWIKI_API_KEY   # paste the mw_... key from the MuscleWiki dashboard
firebase deploy --only functions:getExerciseDemo
~~~

Then set `REMOTE_DEMOS_ENABLED = true` in `js/exerciseDemoConfig.js` and publish the site. Until then the app uses its own 3D clips and drawn figures.
