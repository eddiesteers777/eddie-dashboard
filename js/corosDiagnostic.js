/* EddieOS COROS Diagnostic */

import {
    MCP_URL,
    getStoredToken,
    discoverOAuthMetadata
} from "./corosAuth.js";

const CLIENT_ID =
    "https://eddiesteers777.github.io/eddie-dashboard/oauth/client-metadata.json";

const $ = id => document.getElementById(id);

function row(name, status, message) {
    const icon =
        status === "pass"
            ? "✓"
            : status === "warn"
                ? "!"
                : "×";

    return `
        <div class="coros-diagnostic-row ${status}">
            <span class="coros-diagnostic-icon">${icon}</span>
            <div>
                <strong>${escapeHtml(name)}</strong>
                <small>${escapeHtml(message)}</small>
            </div>
        </div>
    `;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function rawRow(name, status, message, raw) {
    const icon =
        status === "pass"
            ? "✓"
            : status === "warn"
                ? "!"
                : "×";

    const shown =
        raw.length > 4000
            ? `${raw.slice(0, 4000)}\n\n… (truncated, ${raw.length} chars total)`
            : raw;

    return `
        <div class="coros-diagnostic-row ${status}">
            <span class="coros-diagnostic-icon">${icon}</span>
            <div>
                <strong>${escapeHtml(name)}</strong>
                <small>${escapeHtml(message)}</small>
                <pre style="white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;margin-top:8px;padding:10px;background:rgba(0,0,0,.25);border-radius:6px;font-size:12px;">${escapeHtml(shown)}</pre>
            </div>
        </div>
    `;
}

async function runCorosDiagnostic() {
    const results =
        $("corosDiagnosticResults");

    const status =
        $("corosDiagnosticStatus");

    if (!results || !status) return;

    results.innerHTML = "";
    status.textContent =
        "Running diagnostic…";

    const checks = [];

    // Client metadata.
    try {
        const response =
            await fetch(CLIENT_ID, {
                headers: {
                    Accept: "application/json"
                },
                cache: "no-store"
            });

        if (!response.ok) {
            throw new Error(
                `${response.status} ${response.statusText}`
            );
        }

        const metadata =
            await response.json();

        if (
            metadata.client_id !==
            CLIENT_ID
        ) {
            throw new Error(
                "client_id does not match the metadata URL."
            );
        }

        checks.push(
            row(
                "Client metadata",
                "pass",
                "GitHub Pages is serving the OAuth metadata document."
            )
        );
    } catch (error) {
        checks.push(
            row(
                "Client metadata",
                "fail",
                error.message
            )
        );
    }

    // Token.
    const token =
        getStoredToken();

    checks.push(
        row(
            "OAuth token",
            token?.access_token
                ? "pass"
                : "fail",
            token?.access_token
                ? "An EddieOS COROS access token is stored in this browser."
                : "No EddieOS COROS access token is stored."
        )
    );

    // OAuth discovery.
    try {
        const metadata =
            await discoverOAuthMetadata();

        checks.push(
            row(
                "OAuth discovery",
                "pass",
                `Found COROS authorization server: ${metadata.issuer || "issuer not supplied"}`
            )
        );
    } catch (error) {
        checks.push(
            row(
                "OAuth discovery",
                "fail",
                error.message
            )
        );
    }

    // MCP tools/list.
    let tools = [];

    if (token?.access_token) {
        try {
            const response =
                await fetch(MCP_URL, {
                    method: "POST",
                    headers: {
                        Authorization:
                            `Bearer ${token.access_token}`,
                        "Content-Type":
                            "application/json",
                        Accept:
                            "application/json, text/event-stream",
                        "MCP-Protocol-Version":
                            "2026-07-28",
                        "Mcp-Method":
                            "tools/list",
                        "Mcp-Name":
                            "tools/list"
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: 1,
                        method: "tools/list",
                        params: {
                            _meta: {
                                "io.modelcontextprotocol/clientInfo": {
                                    name: "EddieOS",
                                    version: "diagnostic-1"
                                }
                            }
                        }
                    })
                });

            const text =
                await response.text();

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${text.slice(0, 260)}`
                );
            }

            let payload;

            try {
                payload =
                    JSON.parse(text);
            } catch {
                const line =
                    text
                        .split(/\r?\n/)
                        .find(
                            x =>
                                x.startsWith(
                                    "data:"
                                )
                        );

                payload =
                    line
                        ? JSON.parse(
                            line.slice(5).trim()
                        )
                        : null;
            }

            tools =
                payload?.result?.tools ||
                [];

            const needed = [
                "querySportRecords",
                "getActivityDetail",
                "queryRecoveryStatus",
                "queryTrainingLoadAssessment",
                "queryFitnessAssessmentOverview"
            ];

            const missing =
                needed.filter(
                    name =>
                        !tools.some(
                            tool =>
                                tool.name === name
                        )
                );

            checks.push(
                row(
                    "MCP tools",
                    missing.length
                        ? "warn"
                        : "pass",
                    missing.length
                        ? `MCP responded, but missing: ${missing.join(", ")}`
                        : `${tools.length} tools returned; all required EddieOS tools are available.`
                )
            );
        } catch (error) {
            checks.push(
                row(
                    "MCP endpoint",
                    "fail",
                    error.message
                )
            );
        }
    }

    // Sample querySportRecords call — shows the raw live response.
    if (token?.access_token && tools.length) {
        try {
            const sportTool =
                tools.find(
                    t => t.name === "querySportRecords"
                );

            if (!sportTool) {
                throw new Error(
                    "querySportRecords was not in the tools/list response."
                );
            }

            const schema =
                sportTool.inputSchema?.properties || {};

            const args = {};

            const end = new Date();
            const start = new Date(end);
            start.setDate(start.getDate() - 6);

            if (Object.prototype.hasOwnProperty.call(schema, "startDate")) {
                args.startDate = start.toISOString().slice(0, 10);
            }

            if (Object.prototype.hasOwnProperty.call(schema, "endDate")) {
                args.endDate = end.toISOString().slice(0, 10);
            }

            if (Object.prototype.hasOwnProperty.call(schema, "timezone")) {
                args.timezone =
                    Intl.DateTimeFormat().resolvedOptions().timeZone;
            }

            if (Object.prototype.hasOwnProperty.call(schema, "limit")) {
                args.limit = 20;
            }

            const response =
                await fetch(MCP_URL, {
                    method: "POST",
                    headers: {
                        Authorization:
                            `Bearer ${token.access_token}`,
                        "Content-Type":
                            "application/json",
                        Accept:
                            "application/json, text/event-stream",
                        "MCP-Protocol-Version":
                            "2026-07-28",
                        "Mcp-Method":
                            "tools/call",
                        "Mcp-Name":
                            "querySportRecords"
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: 2,
                        method: "tools/call",
                        params: {
                            name: "querySportRecords",
                            arguments: args,
                            _meta: {
                                "io.modelcontextprotocol/clientInfo": {
                                    name: "EddieOS",
                                    version: "diagnostic-1"
                                }
                            }
                        }
                    })
                });

            const text =
                await response.text();

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${text.slice(0, 300)}`
                );
            }

            checks.push(
                rawRow(
                    "Sample querySportRecords call (last 7 days)",
                    "pass",
                    `Arguments sent: ${JSON.stringify(args)}`,
                    text
                )
            );
        } catch (error) {
            checks.push(
                row(
                    "Sample querySportRecords call",
                    "fail",
                    error.message
                )
            );
        }
    }

    results.innerHTML =
        checks.join("");

    const failures =
        checks.filter(
            x =>
                x.includes(
                    'coros-diagnostic-row fail'
                )
        ).length;

    const warnings =
        checks.filter(
            x =>
                x.includes(
                    'coros-diagnostic-row warn'
                )
        ).length;

    status.textContent =
        failures
            ? `${failures} check(s) failed.`
            : warnings
                ? `${warnings} check(s) need attention.`
                : "All COROS checks passed.";

    status.dataset.status =
        failures
            ? "error"
            : warnings
                ? "warning"
                : "success";
}

function init() {
    const button =
        $("runCorosDiagnosticBtn");

    if (button) {
        button.addEventListener(
            "click",
            async () => {
                button.disabled = true;
                button.textContent =
                    "Running…";

                try {
                    await runCorosDiagnostic();
                } finally {
                    button.disabled = false;
                    button.textContent =
                        "Run COROS Diagnostic";
                }
            }
        );
    }

    window.addEventListener(
        "eddieos:coros-auth-changed",
        () =>
            setTimeout(
                runCorosDiagnostic,
                500
            )
    );
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        init
    );
} else {
    init();
}

export { runCorosDiagnostic };
