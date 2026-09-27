# Setting up the AI plan helper

"Describe it in your own words" (Client Hub → a client → Plan → New plan → Generate, and in Regenerate) lets you type what a client needs, and fills in the plan settings for you. It uses Claude, Anthropic's AI. Two free-to-open accounts make it work:

- **Anthropic**: the AI itself. You pay only for what you use: each "Fill in" costs a few cents at most.
- **Cloudflare**: a small private relay (a "Worker") that holds your Anthropic key. The key never goes into the public website, and the relay only answers approved Southbound coaches.

It takes about 15 minutes. Nothing breaks if you skip it: the Describe box just stays hidden, and the Coach Dashboard lists "AI plan helper" as Off.

## Part 1: Anthropic (the AI)

1. Go to **console.anthropic.com** and sign up (signing in with Google is fine).
2. Open **Settings → Billing**. Add a card and buy a small amount of credit. $5 is plenty to start.
3. Open **Settings → Limits** and set a **monthly spend limit** (for example $10), so it can never cost more than you expect.
4. Open **API keys** → **Create key**. Name it `Southbound`, create it, and **copy the key** (it starts with `sk-ant-`). Keep it handy for Part 2; Anthropic shows it only once.

## Part 2: Cloudflare (the private relay)

1. Go to **dash.cloudflare.com** and sign up (the free plan is enough).
2. In the left menu open **Workers & Pages** (it may be under **Compute**). Click **Create** → **Create Worker** (or "Start with Hello World"). Name it `southbound-ai` and click **Deploy**.
3. Click **Edit code**. Select everything in the code box and delete it.
4. In another tab open github.com/eddiesteers777/eddie-dashboard/blob/main/cloudflare-worker/ai-helper.js and click the **copy** button (two overlapping squares, top right of the file). Paste it into the Cloudflare code box and click **Deploy**.
5. Go back to the worker's page → **Settings** → **Variables and Secrets** → **Add**, and add these three (click **Deploy** or **Save** when done):

   | Type | Name | Value |
   |---|---|---|
   | Secret | `ANTHROPIC_API_KEY` | the key you copied in Part 1 |
   | Text | `FIREBASE_PROJECT` | `eddie-s-dashboard` |
   | Text | `ALLOWED_ORIGIN` | `https://southboundcoaching.com` |

   Leave out `MODEL`: the relay then uses the newest Claude Opus model by itself.
6. At the top of the worker's page, copy its address. It looks like `https://southbound-ai.YOUR-NAME.workers.dev`.
7. Send that address to your developer. It goes into `js/aiConfig.js`. It isn't a secret: the relay checks every request comes from a signed-in, approved coach.

## Checking it works

- The Coach Dashboard no longer lists **AI plan helper** under setup.
- Client Hub → a client → Plan → **New plan** → **Generate it from … profile**: a **Describe it in your own words** box sits at the top. Type a couple of sentences and tap **Fill in from my description**. The settings it changed are outlined; check them, then Generate.

## If something goes wrong

- **"Only a signed-in Southbound coach can use this."** Sign out and in again. Check `FIREBASE_PROJECT` is exactly `eddie-s-dashboard`.
- **"The AI key isn't set on the helper yet."** `ANTHROPIC_API_KEY` is missing or wasn't saved as a Secret.
- **"The AI is busy."** Anthropic was overloaded or your credit ran out. Check Billing, then try again in a minute.
- **Nothing happens, or "Couldn't reach the AI helper."** Check `ALLOWED_ORIGIN` is exactly `https://southboundcoaching.com` (no slash at the end), and that the address in `js/aiConfig.js` matches the worker's.

## What gets sent

Only the words you type in the Describe box and the plan settings on the form. Nothing else from the client's account goes out. Anthropic doesn't train its AI on data sent through its API. The privacy page says this too.
