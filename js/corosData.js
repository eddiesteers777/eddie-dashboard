/* Southbound COROS Data — rebuilt for current stateless MCP */

import {
    MCP_URL,
    getTokenRecord,
    saveTokenRecord,
    discoverOAuthMetadata
} from "./corosAuth.js";
import { unwrapResult, findRecords } from "./corosParse.js";

const SNAPSHOT_KEY = "__eddieos_coros_data_snapshot_v2";
const CLIENT_ID =
    "https://southboundcoaching.com/oauth/client-metadata.json";
const MCP_VERSION = "2026-07-28";

let requestId = 1;

const $ = id => document.getElementById(id);

function accessToken() {
    return getTokenRecord()?.access_token || null;
}

function setStatus(text, type = "neutral") {
    const el = $("corosDataStatus");
    if (!el) return;
    el.textContent = text;
    el.dataset.status = type;
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
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

async function mcpRequest(method, params = {}, name = method) {
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
                    name: "EddieOS",
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

async function listTools() {
    const result =
        await mcpRequest("tools/list");

    return result?.tools || [];
}

function tool(tools, name) {
    return tools.find(
        item => item?.name === name
    );
}

function supported(schema, key) {
    return Boolean(
        schema?.properties &&
        Object.prototype.hasOwnProperty.call(
            schema.properties,
            key
        )
    );
}

function formatCorosDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}${month}${day}`;
}

function buildArgs(toolDefinition, start, end) {
    const schema =
        toolDefinition?.inputSchema || {};

    const args = {};

    if (supported(schema, "startDate")) {
        args.startDate =
            formatCorosDate(start);
    }

    if (supported(schema, "endDate")) {
        args.endDate =
            formatCorosDate(end);
    }

    if (supported(schema, "sportTypeCodes")) {
        args.sportTypeCodes = [
            100, // Outdoor Run
            101, // Indoor Run
            102, // Trail Run
            103  // Track Run
        ];
    }

    if (supported(schema, "timezone")) {
        args.timezone =
            Intl.DateTimeFormat()
                .resolvedOptions()
                .timeZone;
    }

    if (supported(schema, "limit")) {
        args.limit = 20;
    }

    return args;
}

// COROS replies: js/corosParse.js reads them (and finds the activity list wherever it is).
const unwrap = unwrapResult;

function parseRecords(result) {
    return findRecords(unwrapResult(result));
}

function recordId(activity) {
    return (
        activity?.labelId ??
        activity?.label_id ??
        activity?.labelid ??
        activity?.activityId ??
        activity?.activityid ??
        activity?.activity_id ??
        activity?.id ??
        null
    );
}

function recordSportType(activity) {
    return (
        activity?.sportType ??
        activity?.sport_type ??
        activity?.sporttype ??
        activity?.sportTypeCode ??
        activity?.sport_type_code ??
        null
    );
}

function activityDate(activity) {
    return (
        activity?.startTime ??
        activity?.start_time ??
        activity?.starttime ??
        activity?.startDate ??
        activity?.start_date ??
        activity?.date ??
        ""
    );
}

function activityMeters(activity) {
    const raw =
        activity?.distanceMeters ??
        activity?.distance_meters ??
        activity?.distancemeters ??
        activity?.distance ??
        0;

    const value =
        Number(raw);

    if (!Number.isFinite(value)) return 0;

    const unit =
        String(
            activity?.distanceUnit ??
            activity?.distance_unit ??
            ""
        ).toLowerCase();

    return unit.includes("mile")
        ? value * 1609.344
        : value;
}

// COROS sport-type codes for the running disciplines Southbound
// queries for (see buildArgs' sportTypeCodes). Activities often
// come back with only a numeric code and no textual sport name,
// so the code check has to come first -- relying on the substring
// match alone silently drops every real run.
const RUNNING_SPORT_CODES = new Set([100, 101, 102, 103]);

function isRun(activity) {
    const code = Number(recordSportType(activity));

    if (Number.isFinite(code) && RUNNING_SPORT_CODES.has(code)) {
        return true;
    }

    const text = [
        activity?.sport,
        activity?.sport_type,
        activity?.sportType,
        activity?.sport_name,
        activity?.sportName,
        activity?.name,
        activity?.activity_name
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
        text.includes("run") ||
        text.includes("running") ||
        text.includes("trail")
    );
}

function dedupe(items) {
    const seen = new Set();

    return items.filter(item => {
        const key =
            recordId(item) ||
            `${activityDate(item)}|${activityMeters(item)}`;

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
    });
}

async function queryRecords(toolDefinition) {
    const today = new Date();
    const all = [];

    // COROS documents a maximum 7-day window for the activity-record query.
    for (let chunk = 0; chunk < 4; chunk++) {
        const end = new Date(today);
        end.setDate(
            end.getDate() - chunk * 7
        );

        const start = new Date(end);
        start.setDate(
            start.getDate() - 6
        );

        // Small retry protects against transient server errors.
        let lastError;

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const result =
                    await mcpRequest(
                        "tools/call",
                        {
                            name: toolDefinition.name,
                            arguments:
                                buildArgs(
                                    toolDefinition,
                                    start,
                                    end
                                )
                        },
                        toolDefinition.name
                    );

                all.push(...parseRecords(result));
                lastError = null;
                break;
            } catch (error) {
                lastError = error;

                if (attempt < 2) {
                    await new Promise(resolve =>
                        setTimeout(
                            resolve,
                            500 * (attempt + 1)
                        )
                    );
                }
            }
        }

        if (lastError) {
            throw lastError;
        }
    }

    return dedupe(all);
}

function parseDetail(result) {
    const value = unwrap(result);
    return value && typeof value === "object"
        ? value
        : {};
}

async function enrichActivities(
    summaries,
    detailTool
) {
    const schema =
        detailTool.inputSchema || {};

    const enriched = [];

    for (
        const summary
        of summaries.filter(isRun).slice(0, 25)
    ) {
        const id =
            recordId(summary);

        if (!id) {
            enriched.push(summary);
            continue;
        }

        const args = {};

        if (supported(schema, "labelId")) {
            args.labelId = id;
        }

        if (supported(schema, "sportType")) {
            args.sportType =
                recordSportType(summary);
        }

        try {
            const result =
                await mcpRequest(
                    "tools/call",
                    {
                        name: detailTool.name,
                        arguments: args
                    },
                    detailTool.name
                );

            enriched.push({
                ...summary,
                ...parseDetail(result),
                _corosLabelId: id,
                _corosSportType:
                    recordSportType(summary)
            });
        } catch (error) {
            console.warn(
                "COROS detail lookup failed:",
                id,
                error
            );

            enriched.push(summary);
        }
    }

    return enriched;
}

async function loadRecentData() {
    const tools =
        await listTools();

    const sportTool =
        tool(tools, "querySportRecords");

    const detailTool =
        tool(tools, "getActivityDetail");

    const recoveryTool =
        tool(tools, "queryRecoveryStatus");

    const loadTool =
        tool(tools, "queryTrainingLoadAssessment");

    const fitnessTool =
        tool(tools, "queryFitnessAssessmentOverview");

    const required = [
        ["querySportRecords", sportTool],
        ["getActivityDetail", detailTool],
        ["queryRecoveryStatus", recoveryTool],
        ["queryTrainingLoadAssessment", loadTool],
        ["queryFitnessAssessmentOverview", fitnessTool]
    ];

    const missing =
        required
            .filter(
                ([, item]) => !item
            )
            .map(
                ([name]) => name
            );

    if (missing.length) {
        throw new Error(
            `COROS did not expose: ${missing.join(", ")}`
        );
    }

    const summaries =
        await queryRecords(sportTool);

    const activities =
        await enrichActivities(
            summaries,
            detailTool
        );

    const [
        recovery,
        trainingLoad,
        fitness
    ] = await Promise.all([
        mcpRequest(
            "tools/call",
            {
                name:
                    recoveryTool.name,
                arguments: {}
            },
            recoveryTool.name
        ),
        mcpRequest(
            "tools/call",
            {
                name:
                    loadTool.name,
                arguments: {
                    days: 28
                }
            },
            loadTool.name
        ),
        mcpRequest(
            "tools/call",
            {
                name:
                    fitnessTool.name,
                arguments: {}
            },
            fitnessTool.name
        )
    ]);

    const snapshot = {
        version: 3,
        fetchedAt: Date.now(),
        activities,
        rawActivityCount: summaries.length,
        recovery: unwrap(recovery),
        trainingLoad: unwrap(trainingLoad),
        fitness: unwrap(fitness)
    };

    localStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify(snapshot)
    );

    renderSnapshot(snapshot);

    window.dispatchEvent(
        new CustomEvent(
            "eddieos:coros-data-updated",
            {
                detail: snapshot
            }
        )
    );

    return snapshot;
}

function renderSnapshot(snapshot) {
    if (!snapshot) return;

    const activities =
        Array.isArray(snapshot.activities)
            ? snapshot.activities.filter(isRun)
            : [];

    const totalMeters =
        activities.reduce(
            (sum, item) =>
                sum + activityMeters(item),
            0
        );

    setText(
        "corosActivityCount",
        String(activities.length)
    );

    setText(
        "corosMileage",
        `${(totalMeters / 1609.344).toFixed(1)} mi`
    );

    setText(
        "corosActivitySummary",
        `${activities.length} running activities • last 28 days`
    );

    setText(
        "corosDataLastSync",
        `Synced ${new Date(
            snapshot.fetchedAt
        ).toLocaleTimeString(
            [],
            {
                hour: "numeric",
                minute: "2-digit"
            }
        )}`
    );

    const rawCount =
        Number(snapshot.rawActivityCount) || 0;

    setStatus(
        activities.length
            ? "COROS data loaded successfully."
            : rawCount
                ? `COROS returned ${rawCount} activities in the last 28 days, but none matched the running filter. Try Refresh COROS to re-check.`
                : "COROS connected, but no activities of any kind were returned for the last 28 days.",
        activities.length
            ? "success"
            : "warning"
    );
}

function init() {
    const refresh =
        $("refreshCorosDataBtn");

    if (refresh) {
        refresh.addEventListener(
            "click",
            async () => {
                refresh.disabled = true;
                refresh.textContent =
                    "Refreshing…";

                try {
                    await loadRecentData();
                } catch (error) {
                    console.error(
                        "Southbound COROS data:",
                        error
                    );
                    setStatus(
                        error.message,
                        "error"
                    );
                } finally {
                    refresh.disabled = false;
                    refresh.textContent =
                        "Refresh COROS";
                }
            }
        );
    }

    try {
        const cached =
            JSON.parse(
                localStorage.getItem(
                    SNAPSHOT_KEY
                ) || "null"
            );

        renderSnapshot(cached);
    } catch {}

    if (accessToken()) {
        loadRecentData().catch(error => {
            console.error(
                "Initial COROS load:",
                error
            );
            setStatus(
                error.message,
                "error"
            );
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

export {
    loadRecentData,
    listTools,
    mcpRequest
};
