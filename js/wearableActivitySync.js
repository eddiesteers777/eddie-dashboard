/* ==========================================
   Southbound — shared COROS activity sync

   The COROS MCP connection is single-user: this browser can read only
   the signed-in client's own COROS data. This module takes the minimum
   training-activity fields needed by the coach and writes only those
   selected activities into the client-controlled sharing path.
========================================== */

import { getTokenRecord } from "./corosAuth.js";
import { waitForUser } from "./auth.js";
import { callTool, mcpRequest } from "./corosClient.js";
import { findRecords, normalizeActivity } from "./corosParse.js";
import {
    readWearableShare,
    saveSharedWearableActivities,
    clearSharedWearableActivities
} from "./coachAccess.js";

const RUN_CODES = new Set([100, 101, 102, 103]);

const dateKey = d =>
    d.toISOString().slice(0, 10);

const addDays = (iso, days) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + days);
    return dateKey(d);
};

function recordId(activity) {
    const raw =
        activity?.labelId ??
        activity?.label_id ??
        activity?.labelid ??
        activity?.activityId ??
        activity?.activityid ??
        activity?.activity_id ??
        activity?.id ??
        null;
    return raw == null ? "" : String(raw);
}

function isRun(activity) {
    const code = Number(activity?.sportType);
    if (Number.isFinite(code) && RUN_CODES.has(code)) return true;
    const text = [
        activity?.sport,
        activity?.sport_name,
        activity?.sportName,
        activity?.name,
        activity?.activity_name
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes("run") || text.includes("trail");
}

function formatCorosDate(iso) {
    return iso.replaceAll("-", "");
}

async function activityTool() {
    const result = await mcpRequest("tools/list");
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    const tool = tools.find(t => t?.name === "querySportRecords");
    if (!tool) throw new Error("COROS did not expose its activity history tool.");
    return tool;
}

function supports(schema, key) {
    return Boolean(schema?.properties && Object.prototype.hasOwnProperty.call(schema.properties, key));
}

function buildArgs(toolDefinition, start, end) {
    const schema = toolDefinition?.inputSchema || {};
    const args = {};
    if (supports(schema, "startDate")) args.startDate = formatCorosDate(start);
    if (supports(schema, "endDate")) args.endDate = formatCorosDate(end);
    if (supports(schema, "limit")) args.limit = 100;
    if (supports(schema, "timezone")) args.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return args;
}

function compact(activity) {
    const n = normalizeActivity(activity) || {};
    const id = recordId(n);
    if (!id || !n.date) return null;
    return {
        labelId: id,
        date: String(n.date),
        startTime: String(n.startTime || ""),
        sport: String(n.sport || "Activity"),
        name: String(n.name || n.sport || "Activity"),
        distanceMeters: Number(n.distance) || 0,
        durationSeconds: Number(n.duration) || 0
    };
}

export async function syncWearableActivityForCoach(coachUid, { days = 28 } = {}) {
    if (!coachUid) throw new Error("No coach selected.");
    if (!getTokenRecord()?.access_token) throw new Error("Connect COROS before sharing activity.");

    const user = await waitForUser();
    if (!user) throw new Error("Sign in before sharing activity.");
    const share = await readWearableShare(coachUid, user.uid);
    if (share?.status !== "active" || share.permissions?.activity !== true) {
        throw new Error("Turn on Training activity sharing before syncing.");
    }

    const today = dateKey(new Date());
    const start = addDays(today, -(Math.max(1, Math.min(30, days)) - 1));
    const toolDefinition = await activityTool();
    const result = await callTool(toolDefinition.name, buildArgs(toolDefinition, start, today));
    const records = findRecords(result).map(normalizeActivity);
    const activities = records.map(compact).filter(Boolean);

    await saveSharedWearableActivities(coachUid, activities);
    return {
        count: activities.length,
        from: start,
        to: today
    };
}

export async function revokeWearableActivitySharing(coachUid) {
    await clearSharedWearableActivities(coachUid);
    return { revoked: true };
}
