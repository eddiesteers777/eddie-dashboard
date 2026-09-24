/* Southbound COROS OAuth — current MCP-compatible implementation */

const MCP_URL = "https://mcpus.coros.com/mcp";
const CLIENT_ID =
    "https://southboundcoaching.com/oauth/client-metadata.json";

const TOKEN_KEY = "__eddieos_coros_oauth_v2";
const PENDING_KEY = "__eddieos_coros_oauth_pending_v2";

const $ = id => document.getElementById(id);

function randomString(length = 64) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(
        bytes,
        byte =>
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[
                byte % 62
            ]
    ).join("");
}

function base64Url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
    );
    return base64Url(new Uint8Array(digest));
}

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
    localStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({
            ...token,
            savedAt: Date.now()
        })
    );
}

function clearCorosToken() {
    localStorage.removeItem(TOKEN_KEY);
}

async function jsonRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: "application/json",
            ...(options.headers || {})
        }
    });

    const body = await response.text();

    if (!response.ok) {
        throw new Error(
            `${response.status} ${response.statusText}` +
            (body ? ` — ${body.slice(0, 240)}` : "")
        );
    }

    try {
        return JSON.parse(body);
    } catch {
        throw new Error("Expected JSON from COROS but received invalid JSON.");
    }
}

async function discoverOAuthMetadata() {
    const origin = new URL(MCP_URL).origin;

    const protectedResource =
        await jsonRequest(
            `${origin}/.well-known/oauth-protected-resource`
        );

    const issuer =
        protectedResource.authorization_servers?.[0];

    if (!issuer) {
        throw new Error(
            "COROS did not advertise an authorization server."
        );
    }

    const issuerBase = issuer.replace(/\/$/, "");

    const authorizationServer =
        await jsonRequest(
            `${issuerBase}/.well-known/oauth-authorization-server`
        );

    if (!authorizationServer.authorization_endpoint) {
        throw new Error(
            "COROS did not provide an authorization endpoint."
        );
    }

    if (!authorizationServer.token_endpoint) {
        throw new Error(
            "COROS did not provide a token endpoint."
        );
    }

    return {
        protectedResource,
        authorizationServer
    };
}

async function startOAuth() {
    setConnectionStatus("Connecting…", false);

    const {
        authorizationServer
    } = await discoverOAuthMetadata();

    const useCimd =
        authorizationServer.client_id_metadata_document_supported === true;

    let clientId = CLIENT_ID;

    if (!useCimd) {
        if (!authorizationServer.registration_endpoint) {
            throw new Error(
                "COROS supports OAuth here, but no Client ID Metadata Document or Dynamic Client Registration path was advertised."
            );
        }

        const registration =
            await jsonRequest(
                authorizationServer.registration_endpoint,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        client_name: "Southbound Coaching",
                        redirect_uris: [redirectUri()],
                        grant_types: [
                            "authorization_code",
                            "refresh_token"
                        ],
                        response_types: ["code"],
                        token_endpoint_auth_method: "none"
                    })
                }
            );

        clientId = registration.client_id;

        if (!clientId) {
            throw new Error(
                "COROS Dynamic Client Registration did not return a client ID."
            );
        }
    }

    const verifier = randomString(96);
    const challenge = await pkceChallenge(verifier);
    const state = randomString(48);

    sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({
            state,
            verifier,
            clientId,
            authorizationServer,
            createdAt: Date.now()
        })
    );

    const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri(),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: MCP_URL
    });

    window.location.assign(
        `${authorizationServer.authorization_endpoint}?${params.toString()}`
    );
}

async function finishOAuth() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error");

    if (!code && !oauthError) return false;

    let pending;

    try {
        pending = JSON.parse(
            sessionStorage.getItem(PENDING_KEY) || "null"
        );
    } catch {
        pending = null;
    }

    sessionStorage.removeItem(PENDING_KEY);

    if (!pending) {
        throw new Error(
            "COROS authorization state was not found."
        );
    }

    if (params.get("state") !== pending.state) {
        throw new Error(
            "COROS OAuth state validation failed."
        );
    }

    if (oauthError) {
        throw new Error(
            `COROS authorization failed: ${oauthError}` +
            (
                params.get("error_description")
                    ? ` — ${params.get("error_description")}`
                    : ""
            )
        );
    }

    const returnedIssuer = params.get("iss");
    const expectedIssuer = pending.authorizationServer.issuer;

    if (
        returnedIssuer &&
        expectedIssuer &&
        returnedIssuer !== expectedIssuer
    ) {
        throw new Error(
            "COROS OAuth issuer validation failed."
        );
    }

    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        client_id: pending.clientId,
        code_verifier: pending.verifier,
        resource: MCP_URL
    });

    const token =
        await jsonRequest(
            pending.authorizationServer.token_endpoint,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body
            }
        );

    if (!token.access_token) {
        throw new Error(
            "COROS did not return an access token."
        );
    }

    saveTokenRecord(token);
    setConnectionStatus("Connected to COROS", true);

    window.history.replaceState(
        {},
        document.title,
        redirectUri()
    );

    window.dispatchEvent(
        new CustomEvent(
            "eddieos:coros-auth-changed",
            {
                detail: { connected: true }
            }
        )
    );

    return true;
}

function setConnectionStatus(text, connected) {
    const textElement =
        $("corosConnectionStatusText");

    const dot =
        document.querySelector(".coros-status-dot");

    const button =
        $("connectCorosBtn");

    if (textElement) {
        textElement.textContent = text;
    }

    if (dot) {
        dot.style.background =
            connected ? "#22C55E" : "#94A3B8";

        dot.style.boxShadow =
            connected
                ? "0 0 10px rgba(34,197,94,.55)"
                : "none";
    }

    if (button) {
        button.textContent =
            connected
                ? "COROS Connected"
                : "Connect COROS";
    }
}

function init() {
    // Remove only the obsolete token key from the experimental version.
    localStorage.removeItem(
        "__eddieos_coros_oauth_token"
    );

    const button =
        $("connectCorosBtn");

    const existing =
        getTokenRecord();

    setConnectionStatus(
        existing?.access_token
            ? "Connected to COROS"
            : "Not connected",
        Boolean(existing?.access_token)
    );

    if (button) {
        button.addEventListener(
            "click",
            async () => {
                if (button.dataset.busy === "true") return;

                button.dataset.busy = "true";
                button.disabled = true;

                try {
                    await startOAuth();
                } catch (error) {
                    console.error(
                        "Southbound COROS OAuth:",
                        error
                    );

                    setConnectionStatus(
                        "Connection unavailable",
                        false
                    );

                    alert(
                        `Southbound could not start the COROS connection.\n\n${error.message}`
                    );

                    button.disabled = false;
                    button.dataset.busy = "false";
                }
            }
        );
    }

    finishOAuth().catch(error => {
        console.error(
            "Southbound COROS OAuth callback:",
            error
        );

        setConnectionStatus(
            "Authorization failed",
            false
        );

        alert(
            `COROS authorization did not finish successfully.\n\n${error.message}`
        );

        window.history.replaceState(
            {},
            document.title,
            redirectUri()
        );
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

export {
    MCP_URL,
    CLIENT_ID,
    getTokenRecord,
    saveTokenRecord,
    clearCorosToken,
    discoverOAuthMetadata
};
