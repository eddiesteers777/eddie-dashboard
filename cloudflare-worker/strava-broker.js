/* ==========================================
   Southbound Strava token broker (Cloudflare Worker)

   The only piece of Strava's OAuth flow that needs a
   client_secret. Everything else -- building the authorize URL,
   redirecting, reading activities with the access token -- happens
   directly in the static site's own JS. This worker exists solely
   so the secret never has to live in that public repo.

   Deploy: see the setup notes at the bottom of this file.
========================================== */

const ALLOWED_ORIGIN = "https://eddiesteers777.github.io";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders()
        }
    });
}

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders() });
        }

        if (request.method !== "POST") {
            return json({ message: "Method not allowed" }, 405);
        }

        let body;

        try {
            body = await request.json();
        } catch {
            return json({ message: "Invalid JSON body" }, 400);
        }

        const params = new URLSearchParams({
            client_id: env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET
        });

        if (body.code) {
            params.set("grant_type", "authorization_code");
            params.set("code", body.code);
        } else if (body.refresh_token) {
            params.set("grant_type", "refresh_token");
            params.set("refresh_token", body.refresh_token);
        } else {
            return json({ message: "Expected a 'code' or 'refresh_token' field" }, 400);
        }

        const stravaResponse = await fetch(STRAVA_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString()
        });

        const text = await stravaResponse.text();

        return new Response(text, {
            status: stravaResponse.status,
            headers: {
                "Content-Type": "application/json",
                ...corsHeaders()
            }
        });
    }
};

/* ==========================================
   Setup (one-time)

   1. Install wrangler if you don't have it: npm install -g wrangler
   2. From this cloudflare-worker/ folder: wrangler deploy
      (first run will prompt you to log into your Cloudflare account)
   3. Set the two secrets -- Cloudflare stores these encrypted, they
      never touch this repo:
        wrangler secret put STRAVA_CLIENT_ID
        wrangler secret put STRAVA_CLIENT_SECRET
      (values come from your Strava API app at strava.com/settings/api)
   4. wrangler deploy prints a URL like
      https://eddieos-strava-broker.<your-subdomain>.workers.dev
      -- paste that into STRAVA_BROKER_URL in js/stravaConfig.js, and put
      your Strava app's Client ID (not the secret) into STRAVA_CLIENT_ID
      in that same file.
   5. In your Strava API app settings, set "Authorization Callback
      Domain" to eddiesteers777.github.io.
========================================== */
