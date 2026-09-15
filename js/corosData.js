/* ==========================================
   EddieOS COROS Data — Step 3

   Reads COROS data through the official COROS MCP
   HTTP endpoint after OAuth authorization.

   Step 3 scope:
   - recent activity records
   - recent running mileage
   - training-load assessment
   - recovery status
   - fitness assessment / race prediction
   - recent activity list

   This module is read-only. No COROS workouts or
   plans are written.
========================================== */

const COROS_MCP_URL = "https://mcpus.coros.com/mcp";
const TOKEN_KEY = "__eddieos_coros_oauth_token";
const SNAPSHOT_KEY = "__eddieos_coros_data_snapshot";

let requestId = 1;

function $(id) {
    return document.getElementById(id);
}

function getToken() {
    try {
        const token = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
        return token?.access_token || null;
    } catch {
        return null;
    }
}

function getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);

    return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function formatMiles(meters) {
    const miles = Number(meters || 0) / 1609.344;

    return Number.isFinite(miles)
        ? miles.toFixed(1)
        : "0.0";
}

function formatDuration(seconds) {
    const totalSeconds = Number(seconds || 0);

    if (!Number.isFinite(totalSeconds)) {
        return "—";
    }

    const minutes = Math.round(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
        return `${hours}h ${String(mins).padStart(2, "0")}m`;
    }

    return `${mins}m`;
}

function formatPace(distanceMeters, durationSeconds) {
    const distanceMiles = Number(distanceMeters || 0) / 1609.344;
    const seconds = Number(durationSeconds || 0);

    if (!distanceMiles || !seconds) {
        return "—";
    }

    const secPerMile = seconds / distanceMiles;
    const minutes = Math.floor(secPerMile / 60);
    const secs = Math.round(secPerMile % 60);

    return `${minutes}:${String(secs).padStart(2, "0")}/mi`;
}

function setStatus(text, type = "neutral") {
    const el = $("corosDataStatus");
    if (!el) return;

    el.textContent = text;
    el.dataset.status = type;
}

function setText(id, value) {
    const el = $(id);

    if (el) {
        el.textContent = value;
    }
}

function parseToolResult(result) {
    if (!result) {
        return null;
    }

    if (result.structuredContent) {
        return result.structuredContent;
    }

    const contents = Array.isArray(result.content)
        ? result.content
        : [];

    for (const item of contents) {
        if (item?.json) {
            return item.json;
        }

        if (item?.text) {
            try {
                return JSON.parse(item.text);
            } catch {
                // Some COROS MCP results are formatted text.
                return {
                    text: item.text
                };
            }
        }
    }

    return result;
}

async function readResponse(response) {
    const contentType =
        response.headers.get("content-type") || "";

    if (contentType.includes("text/event-stream")) {
        const text = await response.text();

        const dataLines = text
            .split(/\r?\n/)
            .filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).trim())
            .filter(Boolean);

        for (let i = dataLines.length - 1; i >= 0; i--) {
            try {
                return JSON.parse(dataLines[i]);
            } catch {
                // Keep searching for a JSON event.
            }
        }

        throw new Error("COROS returned an unreadable MCP event stream.");
    }

    return response.json();
}

async function mcpRequest(method, params = {}, notification = false) {
    const token = getToken();

    if (!token) {
        throw new Error("COROS is not connected.");
    }

    const body = {
        jsonrpc: "2.0",
        method,
        params
    };

    if (!notification) {
        body.id = requestId++;
    }

    const response = await fetch(COROS_MCP_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-11-25"
        },
        body: JSON.stringify(body)
    });

    if (response.status === 401) {
        throw new Error(
            "COROS authorization expired. Reconnect COROS in the section above."
        );
    }

    if (!response.ok) {
        const message = await response.text().catch(() => "");

        throw new Error(
            `COROS MCP request failed (${response.status})` +
            (message ? `: ${message}` : "")
        );
    }

    if (notification) {
        return null;
    }

    const payload = await readResponse(response);

    if (payload.error) {
        throw new Error(
            payload.error.message ||
            "COROS MCP returned an error."
        );
    }

    return payload.result ?? payload;
}

async function createMcpClient() {
    const initialized = await mcpRequest(
        "initialize",
        {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: {
                name: "EddieOS",
                version: "3.0.0"
            }
        }
    );

    await mcpRequest(
        "notifications/initialized",
        {},
        true
    );

    return initialized;
}

async function listTools() {
    const result = await mcpRequest(
        "tools/list",
        {}
    );

    return result?.tools || [];
}

function findTool(tools, name) {
    return tools.find(tool => tool?.name === name) || null;
}

function buildDateArguments(tool, startDate, endDate) {
    const schema = tool?.inputSchema || {};
    const properties = schema.properties || {};
    const args = {};

    const addIfSupported = (key, value) => {
        if (
            Object.prototype.hasOwnProperty.call(
                properties,
                key
            )
        ) {
            args[key] = value;
        }
    };

    addIfSupported("startDate", startDate);
    addIfSupported("endDate", endDate);
    addIfSupported("start_day", startDate);
    addIfSupported("end_day", endDate);
    addIfSupported("timezone",
        Intl.DateTimeFormat().resolvedOptions().timeZone
    );

    // Activity queries can accept a page/limit in different MCP versions.
    addIfSupported("page", 1);
    addIfSupported("limit", 100);
    addIfSupported("size", 100);

    return args;
}

async function callTool(name, args = {}) {
    const result = await mcpRequest(
        "tools/call",
        {
            name,
            arguments: args
        }
    );

    return parseToolResult(result);
}

async function ensureTools() {
    await createMcpClient();

    const tools = await listTools();

    const required = [
        "querySportRecords",
        "queryTrainingLoadAssessment",
        "queryRecoveryStatus",
        "queryFitnessAssessmentOverview"
    ];

    const missing = required.filter(name =>
        !findTool(tools, name)
    );

    if (missing.length) {
        throw new Error(
            `COROS did not expose the expected analytics tools: ${missing.join(", ")}`
        );
    }

    return tools;
}

function flattenActivities(data) {
    if (!data) return [];

    if (Array.isArray(data.activities)) {
        return data.activities;
    }

    if (Array.isArray(data.records)) {
        return data.records;
    }

    if (Array.isArray(data.data)) {
        return data.data;
    }

    // querySportRecords may return formatted text rather than JSON.
    if (typeof data.text === "string") {
        return parseActivityText(data.text);
    }

    return [];
}

function parseActivityText(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const records = [];

    let current = null;

    for (const line of lines) {
        if (/^(LabelId|ActivityId)\s*:/i.test(line)) {
            if (current) {
                records.push(current);
            }

            current = {
                activity_id:
                    line.split(":").slice(1).join(":").trim()
            };

            continue;
        }

        if (!current) {
            continue;
        }

        const match = line.match(
            /^([^:]+):\s*(.*)$/
        );

        if (!match) {
            continue;
        }

        const key = match[1]
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_");

        current[key] = match[2].trim();
    }

    if (current) {
        records.push(current);
    }

    return records;
}

function isRunning(activity) {
    const text = [
        activity?.sport_type,
        activity?.sport_name,
        activity?.sportType,
        activity?.sportName,
        activity?.name,
        activity?.sport
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

function activityDistanceMeters(activity) {
    const value =
        activity?.distance_meters ??
        activity?.distanceMeters ??
        activity?.distance ??
        0;

    const n = Number(value);

    // If a formatted response gives miles, support that too.
    if (
        activity?.distance_unit &&
        String(activity.distance_unit).toLowerCase().includes("mile")
    ) {
        return n * 1609.344;
    }

    return n;
}

function activityDurationSeconds(activity) {
    const value =
        activity?.duration_seconds ??
        activity?.durationSeconds ??
        activity?.duration ??
        0;

    return Number(value) || 0;
}

function activityName(activity) {
    return (
        activity?.name ||
        activity?.activity_name ||
        activity?.sport_name ||
        activity?.sportName ||
        "COROS Run"
    );
}

function activityDate(activity) {
    return (
        activity?.start_time ||
        activity?.startTime ||
        activity?.date ||
        activity?.start_date ||
        ""
    );
}

function sortActivities(activities) {
    return [...activities].sort(
        (a, b) =>
            new Date(activityDate(b)).getTime() -
            new Date(activityDate(a)).getTime()
    );
}

function displayActivities(activities) {
    const container = $("corosRecentActivities");
    if (!container) return;

    const runs = sortActivities(
        activities.filter(isRunning)
    ).slice(0, 6);

    if (!runs.length) {
        container.innerHTML = `
            <div class="coros-empty-state">
                No running activities were returned for the selected period.
            </div>
        `;
        return;
    }

    container.innerHTML = runs.map(activity => {
        const distance = activityDistanceMeters(activity);
        const duration = activityDurationSeconds(activity);
        const date = activityDate(activity);

        return `
            <div class="coros-activity-row">
                <div class="coros-activity-main">
                    <strong>
                        ${escapeHtml(activityName(activity))}
                    </strong>
                    <span>
                        ${formatActivityDate(date)}
                    </span>
                </div>

                <div class="coros-activity-stat">
                    <strong>
                        ${formatMiles(distance)} mi
                    </strong>
                    <span>
                        ${formatPace(distance, duration)}
                    </span>
                </div>

                <div class="coros-activity-stat">
                    <strong>
                        ${formatDuration(duration)}
                    </strong>
                    <span>
                        ${Number(activity?.training_load || activity?.trainingLoad)
                            ? `Load ${Math.round(Number(activity.training_load || activity.trainingLoad))}`
                            : "COROS activity"}
                    </span>
                </div>
            </div>
        `;
    }).join("");
}

function formatActivityDate(value) {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString(
        undefined,
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    );
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function findNumeric(data, keys = []) {
    if (!data || typeof data !== "object") {
        return null;
    }

    const lower = new Map();

    const walk = (value, prefix = "") => {
        if (!value || typeof value !== "object") {
            return;
        }

        for (const [key, item] of Object.entries(value)) {
            const normalized =
                `${prefix}${key}`.toLowerCase();

            lower.set(normalized, item);

            if (
                item &&
                typeof item === "object" &&
                !Array.isArray(item)
            ) {
                walk(item, `${normalized}.`);
            }
        }
    };

    walk(data);

    for (const key of keys) {
        for (const [candidate, value] of lower.entries()) {
            if (
                candidate === key.toLowerCase() ||
                candidate.endsWith(`.${key.toLowerCase()}`)
            ) {
                const n = Number(value);

                if (Number.isFinite(n)) {
                    return n;
                }
            }
        }
    }

    return null;
}

function findValue(data, keys = []) {
    if (!data || typeof data !== "object") {
        return null;
    }

    const walk = (value) => {
        if (!value || typeof value !== "object") {
            return null;
        }

        for (const key of keys) {
            if (
                Object.prototype.hasOwnProperty.call(
                    value,
                    key
                )
            ) {
                return value[key];
            }
        }

        for (const child of Object.values(value)) {
            if (
                child &&
                typeof child === "object"
            ) {
                const result = walk(child);

                if (result !== null && result !== undefined) {
                    return result;
                }
            }
        }

        return null;
    };

    return walk(data);
}

function formatRecovery(data) {
    const percent = findNumeric(data, [
        "recoveryPercentage",
        "recovery_percent",
        "recoveryScore",
        "recovery"
    ]);

    const level = findValue(data, [
        "recoveryLevel",
        "recovery_level",
        "level"
    ]);

    if (percent !== null) {
        return {
            value: `${Math.round(percent)}%`,
            meta: level ? String(level) : "Current recovery"
        };
    }

    if (level) {
        return {
            value: String(level),
            meta: "Current recovery"
        };
    }

    return {
        value: "—",
        meta: "No recovery value returned"
    };
}

function formatTrainingLoad(data) {
    const shortTerm = findNumeric(data, [
        "shortTermLoad",
        "short_term_load",
        "shortTermTrainingLoad"
    ]);

    const ratio = findNumeric(data, [
        "loadRatio",
        "load_ratio",
        "trainingLoadRatio"
    ]);

    if (shortTerm !== null) {
        return {
            value: Math.round(shortTerm).toString(),
            meta:
                ratio !== null
                    ? `Load ratio ${ratio.toFixed(2)}`
                    : "Short-term load"
        };
    }

    const load = findNumeric(data, [
        "trainingLoad",
        "weeklyTrainingLoad"
    ]);

    if (load !== null) {
        return {
            value: Math.round(load).toString(),
            meta: "COROS training load"
        };
    }

    return {
        value: "—",
        meta: "No load value returned"
    };
}

function formatFitness(data) {
    const vo2 = findNumeric(data, [
        "vo2Max",
        "vo2max",
        "VO2Max"
    ]);

    const marathon =
        findValue(data, [
            "marathon",
            "marathonPrediction",
            "marathon_predicted_time",
            "marathonPredictionTime"
        ]);

    return {
        vo2: vo2 !== null
            ? vo2.toFixed(1)
            : "—",
        marathon:
            marathon !== null &&
            marathon !== undefined
                ? formatPrediction(marathon)
                : "—",
        vo2Meta: vo2 !== null
            ? "COROS fitness assessment"
            : "No VO₂ Max returned"
    };
}

function formatPrediction(value) {
    if (typeof value === "object" && value !== null) {
        const nested =
            value.time ??
            value.predictedTime ??
            value.prediction ??
            value.value;

        if (nested !== undefined) {
            return formatPrediction(nested);
        }
    }

    if (
        typeof value === "number" &&
        Number.isFinite(value)
    ) {
        const totalSeconds = Math.round(value);

        const hours = Math.floor(totalSeconds / 3600);
        const minutes =
            Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return String(value);
}

function saveSnapshot(snapshot) {
    localStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify({
            ...snapshot,
            savedAt: Date.now()
        })
    );
}

function renderSnapshot(snapshot) {
    const activities = snapshot.activities || [];
    const runs = activities.filter(isRunning);

    const totalMeters = runs.reduce(
        (sum, activity) =>
            sum + activityDistanceMeters(activity),
        0
    );

    setText(
        "corosActivityCount",
        String(runs.length)
    );

    setText(
        "corosMileage",
        `${formatMiles(totalMeters)} mi`
    );

    const load = formatTrainingLoad(
        snapshot.trainingLoad
    );

    setText(
        "corosTrainingLoad",
        load.value
    );

    setText(
        "corosTrainingLoadMeta",
        load.meta
    );

    const recovery = formatRecovery(
        snapshot.recovery
    );

    setText(
        "corosRecovery",
        recovery.value
    );

    setText(
        "corosRecoveryMeta",
        recovery.meta
    );

    const fitness = formatFitness(
        snapshot.fitness
    );

    setText(
        "corosVo2Max",
        fitness.vo2
    );

    setText(
        "corosVo2Meta",
        fitness.vo2Meta
    );

    setText(
        "corosMarathonPrediction",
        fitness.marathon
    );

    setText(
        "corosPredictionMeta",
        "COROS race prediction"
    );

    setText(
        "corosActivitySummary",
        `${runs.length} running activities • last 28 days`
    );

    setText(
        "corosDataLastSync",
        `Synced ${new Date(snapshot.savedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
        })}`
    );

    displayActivities(runs);

    setStatus(
        "COROS data is connected and available to EddieOS.",
        "success"
    );
}

async function refreshCorosData() {
    if (!getToken()) {
        setStatus(
            "Connect COROS above before refreshing live data.",
            "neutral"
        );
        return;
    }

    const button = $("refreshCorosDataBtn");

    if (button) {
        button.disabled = true;
        button.textContent = "Refreshing…";
    }

    setStatus(
        "Connecting to COROS and loading your recent data…",
        "loading"
    );

    try {
        const tools = await ensureTools();

        const startDate = getDateDaysAgo(28);
        const endDate = getDateDaysAgo(0);

        const activityTool =
            findTool(tools, "querySportRecords");

        const loadTool =
            findTool(tools, "queryTrainingLoadAssessment");

        const recoveryTool =
            findTool(tools, "queryRecoveryStatus");

        const fitnessTool =
            findTool(tools, "queryFitnessAssessmentOverview");

        const [activityData, trainingLoad, recovery, fitness] =
            await Promise.all([
                callTool(
                    activityTool.name,
                    buildDateArguments(
                        activityTool,
                        startDate,
                        endDate
                    )
                ),
                callTool(
                    loadTool.name,
                    {}
                ),
                callTool(
                    recoveryTool.name,
                    {}
                ),
                callTool(
                    fitnessTool.name,
                    {}
                )
            ]);

        const snapshot = {
            startDate,
            endDate,
            activities: flattenActivities(activityData),
            trainingLoad,
            recovery,
            fitness,
            savedAt: Date.now()
        };

        saveSnapshot(snapshot);
        renderSnapshot(snapshot);
    } catch (error) {
        console.error(
            "EddieOS COROS data error:",
            error
        );

        setStatus(
            error.message ||
            "COROS data could not be loaded.",
            "error"
        );
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Refresh COROS";
        }
    }
}

function restoreCachedSnapshot() {
    try {
        const snapshot = JSON.parse(
            localStorage.getItem(SNAPSHOT_KEY) || "null"
        );

        if (
            snapshot &&
            Array.isArray(snapshot.activities)
        ) {
            renderSnapshot(snapshot);
            return true;
        }
    } catch {
        // Ignore bad cache.
    }

    return false;
}

function initCorosData() {
    const button = $("refreshCorosDataBtn");

    if (button) {
        button.addEventListener(
            "click",
            refreshCorosData
        );
    }

    if (restoreCachedSnapshot()) {
        return;
    }

    if (getToken()) {
        refreshCorosData();
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initCorosData
    );
} else {
    initCorosData();
}

export {
    refreshCorosData
};
