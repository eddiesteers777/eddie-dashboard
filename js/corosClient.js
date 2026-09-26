/* ==========================================
   Southbound — talking to COROS (its MCP connection)

   One place for every COROS call, with no side effects on import, so
   any page can use it: Analytics (js/corosData.js), the diagnostic,
   and "Send to COROS" (js/corosSend.js).
     mcpRequest(method, params, name)   raw call
     callTool(name, args)               tools/call -> the result
     isCorosConnected()
   An expired sign-in is renewed once with the refresh token before
   giving up with "Reconnect COROS".
========================================== */

import { MCP_URL, CLIENT_ID, getTokenRecord, saveTokenRecord, discoverOAuthMetadata } from "./corosAuth.js";

const MCP_VERSION = "2026-07-28";
let requestId = 1;

function accessToken() {
    return getTokenRecord()?.access_token || null;
}

export const isCorosConnected = () => Boolean(accessToken());

// Trade the refresh token for a new access token. -> true when renewed.
async function refreshToken() {
    const record = getTokenRecord();
    if (!record?.refresh_token) return false;
    try {
        const { authorizationServer } = await discoverOAuthMetadata();
        const response = await fetch(authorizationServer.token_endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: record.refresh_token, client_id: record.client_id || CLIENT_ID, resource: MCP_URL })
        });
        if (!response.ok) return false;
        const token = await response.json();
        if (!token?.access_token) return false;
        saveTokenRecord({ ...token, client_id: record.client_id, refresh_token: token.refresh_token || record.refresh_token });
        return true;
    } catch {
        return false;
    }
}

function parseBody(text, contentType) {
    let payload = null;

    if (contentType.includes("text/event-stream")) {
        const lines = text
            .split(/\r?\n/)
            .filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).trim())
            .filter(Boolean);

        for (let i = lines.length - 1; i >= 0; i--) {
            try {
                payload = JSON.parse(lines[i]);
                break;
            } catch {}
        }

        if (!payload) {
            throw new Error(
                "COROS returned an unreadable MCP event stream."
            );
        }
    } else {
        try {
            payload = JSON.parse(text);
        } catch {
            throw new Error("COROS returned invalid JSON.");
        }
    }

    const contentText =
        Array.isArray(payload?.result?.content)
            ? payload.result.content
                .map(item => item?.text || "")
                .join("\n")
            : "";

    if (payload?.result?.isError === true) {
        throw new Error(
            contentText || "COROS reported a tool error."
        );
    }

    if (/Tool call anomalies detected/i.test(contentText)) {
        throw new Error(
            "COROS flagged the activity query as a tool-call anomaly. Southbound is using the narrower running-only query format now."
        );
    }

    return payload;
}

async function mcpRequest(method, params = {}, name = method, retried = false) {
    const token = accessToken();

    if (!token) {
        throw new Error("COROS is not connected.");
    }

    const body = {
        jsonrpc: "2.0",
        id: requestId++,
        method,
        params: {
            ...params,
            _meta: {
                "io.modelcontextprotocol/clientInfo": {
                    name: "Southbound Coaching",
                    version: "1.0.0"
                }
            }
        }
    };

    const response = await fetch(MCP_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": MCP_VERSION,
            "Mcp-Method": method,
            "Mcp-Name": name
        },
        body: JSON.stringify(body)
    });

    const text = await response.text();

    if (response.status === 401) {
        if (!retried && await refreshToken()) {
            return mcpRequest(method, params, name, true);
        }
        throw new Error(
            "COROS returned HTTP 401. Reconnect COROS."
        );
    }

    if (!response.ok) {
        throw new Error(
            `COROS MCP returned HTTP ${response.status}: ${text.slice(0, 300)}`
        );
    }

    const payload = parseBody(
        text,
        response.headers.get("content-type") || ""
    );

    if (payload.error) {
        throw new Error(
            payload.error.message ||
            `COROS MCP ${method} returned an error.`
        );
    }

    return payload.result ?? payload;
}

export async function callTool(name, args = {}) {
    return mcpRequest("tools/call", { name, arguments: args }, name);
}

export { mcpRequest };
