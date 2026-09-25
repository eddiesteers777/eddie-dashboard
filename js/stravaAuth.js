/* ==========================================
   Southbound Strava — OAuth connection

   Strava's token exchange requires a client_secret, which can't
   live in this static site's JS (it'd be public in the repo). A
   small serverless broker (see /cloudflare-worker) holds the
   secret and does the exchange/refresh on our behalf; this file
   only ever sends it an authorization code or a refresh token,
   never the secret itself.
========================================== */

import { sbAlert } from "./ui.js";
import { STRAVA_CLIENT_ID, STRAVA_BROKER_URL, isStravaConfigured } from "./stravaConfig.js";

const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_KEY = "__eddieos_strava_oauth_v1";
const PENDING_KEY = "__eddieos_strava_oauth_pending_v1";
const SCOPE = "read,activity:read_all";

// Client ID and broker URL live in js/stravaConfig.js.
const CLIENT_ID = STRAVA_CLIENT_ID;
const BROKER_URL = STRAVA_BROKER_URL;

const $ = id => document.getElementById(id);

function redirectUri() {
    return `${window.location.origin}${window.location.pathname}`;
}

function getTokenRecord() {
    try {
        return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    } catch {
        return null;
    }
}

function saveTokenRecord(token) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

function clearTokenRecord() {
    localStorage.removeItem(TOKEN_KEY);
}

function setConnectionStatus(text, connected) {
    const textEl = $("stravaConnectionStatusText");
    const dot = document.querySelector(".strava-status-dot");
    const button = $("connectStravaBtn");

    if (textEl) {
        textEl.textContent = text;
    }

    if (dot) {
        dot.style.background = connected ? "var(--green)" : "";
        dot.style.boxShadow = connected ? "0 0 0 4px rgba(34,197,94,.15)" : "";
    }

    if (button) {
        button.textContent = connected ? "Strava Connected" : "Connect Strava";
    }
}

function startOAuth() {
    if (!isStravaConfigured()) {
        throw new Error(
            "Strava isn't configured yet. Fill in the client ID and broker URL in js/stravaConfig.js first."
        );
    }

    const state = crypto.randomUUID();
    sessionStorage.setItem(PENDING_KEY, state);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: redirectUri(),
        approval_prompt: "auto",
        scope: SCOPE,
        state
    });

    window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

async function brokerRequest(body) {
    const response = await fetch(BROKER_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload || payload.errors) {
        const message =
            payload?.message ||
            `Strava token request failed (HTTP ${response.status}).`;

        throw new Error(message);
    }

    return payload;
}

async function ensureFreshToken() {
    const token = getTokenRecord();

    if (!token) {
        return null;
    }

    const expiresInMs = Number(token.expires_at) * 1000 - Date.now();

    if (expiresInMs > 5 * 60 * 1000) {
        return token.access_token;
    }

    const refreshed = await brokerRequest({ refresh_token: token.refresh_token });
    saveTokenRecord({ ...token, ...refreshed });

    return refreshed.access_token;
}

async function finishOAuth() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const state = url.searchParams.get("state");

    if (!code && !error) {
        return;
    }

    const pendingState = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);

    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("scope");
    url.searchParams.delete("error");
    history.replaceState({}, "", url.toString());

    if (error) {
        throw new Error(`Strava denied the connection: ${error}`);
    }

    if (state !== pendingState) {
        throw new Error("Strava authorization state did not match. Please try connecting again.");
    }

    const token = await brokerRequest({ code });
    saveTokenRecord(token);

    setConnectionStatus(
        token.athlete?.firstname ? `Connected as ${token.athlete.firstname}` : "Strava Connected",
        true
    );

    window.dispatchEvent(new CustomEvent("eddieos:strava-auth-changed"));
}

function init() {
    // Strava is shelved: since mid-2026 creating a Strava API app needs
    // a paid subscription. Until stravaConfig.js is filled in, the
    // Strava panels stay out of Analytics instead of offering a
    // Connect button that can't work.
    if (!isStravaConfigured()) {
        ["stravaConnectionPanel", "stravaDataPanel"].forEach(id => {
            const panel = $(id);
            if (panel) panel.style.display = "none";
        });
        return;
    }

    const button = $("connectStravaBtn");
    const existing = getTokenRecord();

    setConnectionStatus(
        existing ? "Strava Connected" : "Not connected",
        Boolean(existing)
    );

    if (button) {
        button.addEventListener("click", () => {
            if (button.dataset.busy === "true") {
                return;
            }

            button.dataset.busy = "true";

            try {
                startOAuth();
            } catch (error) {
                button.dataset.busy = "false";
                sbAlert(error.message, { title: "Couldn't start the Strava connection" });
            }
        });
    }

    finishOAuth().catch(error => {
        sbAlert(error.message, { title: "Strava didn't finish connecting" });
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

export {
    getTokenRecord,
    saveTokenRecord,
    clearTokenRecord,
    ensureFreshToken
};
