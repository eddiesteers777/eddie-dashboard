/* Southbound COROS Diagnostic */

import {
    MCP_URL,
    CLIENT_ID,
    getTokenRecord,
    discoverOAuthMetadata
} from "./corosAuth.js";

import { icon } from "./icons.js";
import { corosToolsSummary, workoutToolDetails } from "./corosTools.js";
import { unwrapResult, findRecords, describeShape } from "./corosParse.js";

const $ = id => document.getElementById(id);

function row(name, status, message) {
    const statusIcon =
        status === "pass"
            ? icon("check")
            : status === "warn"
                ? icon("alertTriangle")
                : icon("close");

    return `
        <div class="coros-diagnostic-row ${status}">
            <span class="coros-diagnostic-icon">${statusIcon}</span>
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

function addCopyBlock(results, id, label, note, text) {
    results.insertAdjacentHTML("beforeend", `
        <div class="coros-diagnostic-copy">
            <button type="button" class="secondary-btn" id="${id}">${escapeHtml(label)}</button>
            <small>${escapeHtml(note)}</small>
            <textarea readonly rows="6" hidden aria-label="${escapeHtml(label)}">${escapeHtml(text)}</textarea>
        </div>`);
    const btn = $(id);
    btn?.addEventListener("click", async () => {
        const box = btn.parentElement.querySelector("textarea");
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = "Copied. Paste it into your message.";
        } catch {
            // No clipboard access: show the text, selected, to copy by hand.
            box.hidden = false;
            box.focus();
            box.select();
            btn.textContent = "Select all and copy the text below";
        }
    });
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
    let workoutTools = [];
    let sampleReply = "";

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
        getTokenRecord();

    checks.push(
        row(
            "OAuth token",
            token?.access_token
                ? "pass"
                : "fail",
            token?.access_token
                ? "A Southbound COROS access token is stored in this browser."
                : "No Southbound COROS access token is stored."
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
                `Found COROS authorization server: ${metadata.authorizationServer.issuer || "issuer not supplied"}`
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
                            "tools/call",
                        "Mcp-Name":
                            "querySportRecords"
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: 101,
                        method: "tools/call",
                        params: {
                            name:
                                "querySportRecords",
                            arguments: {
                                startDate:
                                    (() => {
                                        const d = new Date();
                                        d.setDate(
                                            d.getDate() - 6
                                        );

                                        return (
                                            d.getFullYear() +
                                            String(
                                                d.getMonth() + 1
                                            ).padStart(2, "0") +
                                            String(
                                                d.getDate()
                                            ).padStart(2, "0")
                                        );
                                    })(),

                                endDate:
                                    (() => {
                                        const d = new Date();

                                        return (
                                            d.getFullYear() +
                                            String(
                                                d.getMonth() + 1
                                            ).padStart(2, "0") +
                                            String(
                                                d.getDate()
                                            ).padStart(2, "0")
                                        );
                                    })(),

                                sportTypeCodes: [
                                    100,
                                    101,
                                    102,
                                    103
                                ],

                                limit: 20
                            }
                        }
                    })
                });

            const text =
                await response.text();
            sampleReply = text;

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${text.slice(0, 260)}`
                );
            }

            let payload = null;

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

                if (line) {
                    payload =
                        JSON.parse(
                            line.slice(5).trim()
                        );
                }
            }

            const contentText =
                Array.isArray(
                    payload?.result?.content
                )
                    ? payload.result.content
                        .map(
                            item =>
                                item?.text || ""
                        )
                        .join("\n")
                    : "";

            if (
                /Tool call anomalies detected/i
                    .test(contentText)
            ) {
                checks.push(
                    row(
                        "Sample activity query",
                        "fail",
                        "COROS still flagged the running-only query as a tool-call anomaly."
                    )
                );
            } else if (
                payload?.result?.isError === true
            ) {
                checks.push(
                    row(
                        "Sample activity query",
                        "fail",
                        contentText ||
                        "COROS returned an activity-query error."
                    )
                );
            } else {
                // Count what actually came back; when it's nothing, say
                // what the reply looked like so the cause is visible.
                const value = unwrapResult(payload?.result);
                const found = findRecords(value).length;
                checks.push(
                    row(
                        "Sample activity query",
                        found ? "pass" : "warn",
                        found
                            ? `COROS returned ${found} ${found === 1 ? "run" : "runs"} from the last 7 days.`
                            : `COROS answered but Southbound found no runs from the last 7 days. The reply looked like: ${describeShape(value)}`
                    )
                );
            }
        } catch (error) {
            checks.push(
                row(
                    "Sample activity query",
                    "fail",
                    error.message
                )
            );
        }
    }

    // What COROS lets Southbound do: can it only read runs, or could it
    // also send workouts to the watch? (js/corosTools.js)
    if (token?.access_token) {
        try {
            const response = await fetch(MCP_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    "Content-Type": "application/json",
                    Accept: "application/json, text/event-stream",
                    "MCP-Protocol-Version": "2026-07-28",
                    "Mcp-Method": "tools/list"
                },
                body: JSON.stringify({ jsonrpc: "2.0", id: 102, method: "tools/list", params: {} })
            });
            const text = await response.text();
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
            let payload = null;
            try { payload = JSON.parse(text); } catch {
                const line = text.split(/\r?\n/).find(x => x.startsWith("data:"));
                if (line) payload = JSON.parse(line.slice(5).trim());
            }
            const tools = payload?.result?.tools || [];
            workoutTools = workoutToolDetails(tools);
            const summary = corosToolsSummary(tools);
            checks.push(row("What COROS lets Southbound do", summary.status, summary.text));
            const activityTool = tools.find(t => t?.name === "querySportRecords");
            if (activityTool) {
                const fields = Object.keys(activityTool.inputSchema?.properties || {});
                checks.push(row("How COROS wants runs asked for", "pass", `querySportRecords takes: ${fields.join(", ") || "no settings"}.`));
            }
        } catch (error) {
            checks.push(row("What COROS lets Southbound do", "warn", `Couldn't list COROS's tools: ${error.message}`));
        }
    }

    results.innerHTML =
        checks.join("");

    // One tap copies something to paste to the developer: COROS's raw
    // reply to the run query (the athlete's own recent runs), and the
    // exact format of its workout tools (generic, nothing personal).
    if (sampleReply) addCopyBlock(results, "copyCorosReply", "Copy COROS's reply", "Copies what COROS sent back for your last 7 days of runs (dates, distances, times), to paste to your developer if runs are missing.", sampleReply.slice(0, 15000));
    if (workoutTools.length) addCopyBlock(results, "copyCorosWorkoutTools", "Copy COROS workout tool details", `Copies COROS's instructions for its ${workoutTools.length} workout and plan tools, to paste to your developer.`, JSON.stringify(workoutTools, null, 2));

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
