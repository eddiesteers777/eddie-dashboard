# Card payments with Stripe: what's needed (later)

Until this is done, clients pay you outside the app (Venmo, Zelle, cash): you write **How clients pay you** once in **Settings**, clients see it on their package card while a payment is due, and you tap **Mark paid** in their Client Hub when the money arrives. Nothing below is needed for that.

The Stripe code is already written (`functions/` on the server side, `js/stripeBilling.js` in the app). It's switched off (`ONLINE_PAYMENTS` in `js/clientPackageModel.js`) because it can't run yet. To switch it on:

## 1. Your prices (you)

Stripe charges a fixed price per package, so this comes first. Decide:

- Online Coaching, per month
- 1-on-1 Soccer: single session, 5 sessions, 10 sessions
- Group Soccer: drop-in, per month

## 2. Firebase Blaze plan (you, about 5 minutes)

The payment code runs on Google's servers, which Firebase only allows on its pay-as-you-go plan. At Southbound's size it should cost $0 a month (there's a free allowance), but it needs a card on file.

1. Go to **console.firebase.google.com** and open **eddie-s-dashboard**.
2. Bottom left, click **Spark** (next to "Upgrade") → **Upgrade** → **Blaze**.
3. Add a card and finish.
4. Recommended: **Set a budget alert**. Firebase offers it during the upgrade. Pick something like $5 so you'd get an email long before any real charge.

## 3. A Stripe account (you, about 15 minutes)

1. Go to **stripe.com** → **Start now**, and sign up with your business email.
2. Fill in the business details Stripe asks for (name, address, bank account for payouts). Stripe takes about 2.9% + 30¢ per card payment.
3. Leave it in **Test mode** (toggle top right) for now.
4. In **Product catalog**, add one product per package from step 1 with its price. Monthly ones are **Recurring, monthly**; the rest are **One-off**.

## 4. Connecting them (one session together, on your computer)

This part needs your logins, so it happens on your computer with the Firebase command-line tool, not in chat. **Never paste a Stripe secret key into a chat, an email or the code.** It goes straight into Google's secret store:

1. `firebase login` (your Google account)
2. `firebase functions:secrets:set STRIPE_CONFIG` (paste the keys and price IDs when it asks; the format is in `functions/README.md`)
3. `firebase deploy --only functions`
4. In Stripe → **Developers → Webhooks**, add the address the deploy prints for `stripeWebhook`, then add its signing secret to `STRIPE_CONFIG` and deploy again.

Then the app change: switch `ONLINE_PAYMENTS` on, test with Stripe's test cards (4242 4242 4242 4242) from a test client account, and only then switch Stripe out of Test mode.
