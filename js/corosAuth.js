/* ==========================================
   EddieOS COROS OAuth — Step 2
   Authorization only. No COROS data is pulled yet.
========================================== */

const COROS_MCP_URL = "https://mcpus.coros.com/mcp";
const OAUTH_STATE_KEY = "__eddieos_coros_oauth_state";
const OAUTH_TOKEN_KEY = "__eddieos_coros_oauth_token";

const $ = (id) => document.getElementById(id);

function randomString(length = 64) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[
            byte % 62
        ]
    ).join("");
}

function base64Url(bytes) {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

async function sha256Base64Url(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return base64Url(new Uint8Array(digest));
}

function redirectUri() {
    return `${window.location.origin}${window.location.pathname}`;
}

function setStatus(text, connected = false) {
    const textEl = $("corosConnectionStatusText");
    const dot = document.querySelector(".coros-status-dot");
    const button = $("connectCorosBtn");

    if (textEl) {
        textEl.textContent = text;
    }

    if (dot) {
        dot.style.background = connected ? "#22C55E" : "#94A3B8";
        dot.style.boxShadow = connected
            ? "0 0 10px rgba(34,197,94,.55)"
            : "none";
    }

    if (button) {
        button.textContent = connected ? "COROS Connected" : "Connect COROS";
    }
}

function getStoredToken() {
    try {
        return JSON.parse(localStorage.getItem(OAUTH_TOKEN_KEY) || "null");
    } catch {
        return null;
    }
}

function saveToken(token) {
    localStorage.setItem(
        OAUTH_TOKEN_KEY,
        JSON.stringify({
            ...token,
            savedAt: Date.now()
        })
    );
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
            `Request failed (${response.status})${body ? `: ${body}` : ""}`
        );
    }

    return response.json();
}

async function discoverOAuth() {
    const origin = new URL(COROS_MCP_URL).origin;

    // RFC 9728 protected-resource metadata first.
    let resourceMetadata = null;

    for (const path of [
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-protected-resource"
    ]) {
        try {
            resourceMetadata = await fetchJson(`${origin}${path}`, {
                headers: { Accept: "application/json" }
            });
            if (resourceMetadata) break;
        } catch {
            // Try the next standard location.
        }
    }

    const authorizationServers =
        resourceMetadata?.authorization_servers || [origin];

    for (const issuer of authorizationServers) {
        const base = issuer.replace(/\/$/, "");

        try {
            return await fetchJson(
                `${base}/.well-known/oauth-authorization-server`,
                {
                    headers: {
                        Accept: "application/json",
                        "MCP-Protocol-Version": "2025-11-25"
                    }
                }
            );
        } catch {
            // Try next advertised issuer.
        }
    }

    throw new Error(
        "EddieOS could not discover the COROS OAuth authorization server."
    );
}

async function registerPublicClient(metadata) {
    if (!metadata.registration_endpoint) {
        throw new Error(
            "COROS did not advertise dynamic client registration. EddieOS needs a COROS public client registration before it can safely start OAuth."
        );
    }

    const client = await fetchJson(metadata.registration_endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            client_name: "EddieOS",
            redirect_uris: [redirectUri()],
            grant_types: ["authorization_code"],
            response_types: ["code"],
            token_endpoint_auth_method: "none"
        })
    });

    if (!client.client_id) {
        throw new Error("COROS did not return a client ID.");
    }

    return client;
}

async function startOAuth() {
    setStatus("Connecting…");

    const metadata = await discoverOAuth();

    if (!Array.isArray(metadata.code_challenge_methods_supported) ||
        !metadata.code_challenge_methods_supported.includes("S256")) {
        throw new Error(
            "COROS did not advertise PKCE S256, so EddieOS stopped instead of using a weaker authorization flow."
        );
    }

    const client = await registerPublicClient(metadata);

    const state = randomString(48);
    const verifier = randomString(96);
    const challenge = await sha256Base64Url(verifier);

    sessionStorage.setItem(
        OAUTH_STATE_KEY,
        JSON.stringify({
            state,
            verifier,
            clientId: client.client_id,
            tokenEndpoint: metadata.token_endpoint,
            createdAt: Date.now()
        })
    );

    const params = new URLSearchParams({
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: redirectUri(),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: COROS_MCP_URL
    });

    window.location.assign(
        `${metadata.authorization_endpoint}?${params.toString()}`
    );
}

async function finishOAuth() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (!code && !error) {
        return;
    }

    let pending = null;

    try {
        pending = JSON.parse(
            sessionStorage.getItem(OAUTH_STATE_KEY) || "null"
        );
    } catch {
        pending = null;
    }

    sessionStorage.removeItem(OAUTH_STATE_KEY);

    if (!pending) {
        throw new Error("The COROS OAuth state could not be recovered.");
    }

    if (params.get("state") !== pending.state) {
        throw new Error("The COROS OAuth state validation failed.");
    }

    if (error) {
        throw new Error(`COROS authorization failed: ${error}`);
    }

    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        client_id: pending.clientId,
        code_verifier: pending.verifier,
        resource: COROS_MCP_URL
    });

    const token = await fetchJson(pending.tokenEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json"
        },
        body
    });

    if (!token.access_token) {
        throw new Error("COROS did not return an access token.");
    }

    saveToken(token);
    setStatus("Connected to COROS", true);

    window.dispatchEvent(
        new CustomEvent("eddieos:coros-auth-changed")
    );

    const cleanUrl =
        `${window.location.origin}${window.location.pathname}` +
        window.location.hash;

    window.history.replaceState({}, document.title, cleanUrl);
}

async function initCorosAuth() {
    const button = $("connectCorosBtn");
    if (!button) return;

    const existing = getStoredToken();

    if (existing?.access_token) {
        setStatus("Connected to COROS", true);
        return;
    }

    setStatus("Not connected");

    button.addEventListener("click", async () => {
        if (button.disabled) return;

        button.disabled = true;

        try {
            await startOAuth();
        } catch (error) {
            console.error("EddieOS COROS OAuth:", error);
            setStatus("Connection unavailable");
            alert(
                `EddieOS could not start the COROS connection.\n\n${error.message}`
            );
            button.disabled = false;
        }
    });

    try {
        await finishOAuth();
    } catch (error) {
        console.error("EddieOS COROS OAuth callback:", error);
        setStatus("Authorization failed");
        alert(
            `COROS authorization did not finish successfully.\n\n${error.message}`
        );

        const cleanUrl =
            `${window.location.origin}${window.location.pathname}` +
            window.location.hash;

        window.history.replaceState({}, document.title, cleanUrl);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCorosAuth);
} else {
    initCorosAuth();
}

export {
    getStoredToken,
    COROS_MCP_URL as MCP_URL,
    discoverOAuth as discoverOAuthMetadata
};
