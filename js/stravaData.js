/* ==========================================
   EddieOS Strava — activity data

   Once connected, activity reads go straight from the browser to
   Strava's API with the access token -- only the token exchange
   and refresh (which need the client_secret) go through the
   broker worker, see js/stravaAuth.js.
========================================== */

import { ensureFreshToken } from "./stravaAuth.js";

const SNAPSHOT_KEY = "__eddieos_strava_data_snapshot_v1";
const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

const $ = id => document.getElementById(id);

function setStatus(text, type = "neutral") {
    const el = $("stravaDataStatus");

    if (!el) {
        return;
    }

    el.textContent = text;
    el.dataset.status = type;
}

function setText(id, value) {
    const el = $(id);

    if (el) {
        el.textContent = value;
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function isRun(activity) {
    return RUN_TYPES.has(activity?.sport_type) || RUN_TYPES.has(activity?.type);
}

function formatPace(activity) {
    const meters = Number(activity.distance) || 0;
    const seconds = Number(activity.moving_time) || 0;

    if (!meters || !seconds) {
        return "—";
    }

    const miles = meters / 1609.344;
    const secPerMile = seconds / miles;
    const min = Math.floor(secPerMile / 60);
    const sec = Math.round(secPerMile % 60);

    return `${min}:${String(sec).padStart(2, "0")}/mi`;
}

async function loadRecentActivities() {
    const token = await ensureFreshToken();

    if (!token) {
        throw new Error("Strava is not connected.");
    }

    const after = Math.floor((Date.now() - 28 * 24 * 60 * 60 * 1000) / 1000);

    const response = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (response.status === 401) {
        throw new Error("Strava returned HTTP 401. Reconnect Strava.");
    }

    if (!response.ok) {
        throw new Error(`Strava API returned HTTP ${response.status}.`);
    }

    const all = await response.json();
    const activities = all.filter(isRun);

    const snapshot = {
        fetchedAt: Date.now(),
        activities
    };

    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    renderSnapshot(snapshot);

    return snapshot;
}

function renderRecentActivities(activities) {
    const container = $("stravaRecentActivities");

    if (!container) {
        return;
    }

    if (!activities.length) {
        container.innerHTML = `
            <div class="strava-empty-state">No recent Strava runs to show.</div>
        `;
        return;
    }

    container.innerHTML = activities
        .slice(0, 8)
        .map(activity => `
            <div class="strava-activity-row">
                <div class="strava-activity-main">
                    <strong>${escapeHtml(activity.name || "Run")}</strong>
                    <span>${new Date(activity.start_date_local).toLocaleDateString()}</span>
                </div>
                <div class="strava-activity-stat">
                    <strong>${(Number(activity.distance) / 1609.344).toFixed(2)} mi</strong>
                    <span>Distance</span>
                </div>
                <div class="strava-activity-stat">
                    <strong>${formatPace(activity)}</strong>
                    <span>Avg Pace</span>
                </div>
            </div>
        `)
        .join("");
}

function renderSnapshot(snapshot) {
    if (!snapshot) {
        return;
    }

    const activities = Array.isArray(snapshot.activities) ? snapshot.activities : [];
    const totalMeters = activities.reduce(
        (sum, activity) => sum + (Number(activity.distance) || 0),
        0
    );

    setText("stravaActivityCount", String(activities.length));
    setText("stravaMileage", `${(totalMeters / 1609.344).toFixed(1)} mi`);

    setText(
        "stravaDataLastSync",
        `Synced ${new Date(snapshot.fetchedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
        })}`
    );

    renderRecentActivities(activities);

    setStatus(
        activities.length
            ? "Strava data loaded successfully."
            : "Strava connected, but no running activities were returned for the last 28 days.",
        activities.length ? "success" : "warning"
    );
}

function init() {
    const refresh = $("refreshStravaDataBtn");

    if (refresh) {
        refresh.addEventListener("click", async () => {
            refresh.disabled = true;
            refresh.textContent = "Refreshing…";

            try {
                await loadRecentActivities();
            } catch (error) {
                console.error("EddieOS Strava data:", error);
                setStatus(error.message, "error");
            } finally {
                refresh.disabled = false;
                refresh.textContent = "Refresh Strava";
            }
        });
    }

    try {
        const cached = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null");
        renderSnapshot(cached);
    } catch {}

    ensureFreshToken()
        .then(token => {
            if (token) {
                return loadRecentActivities();
            }
        })
        .catch(error => {
            console.error("Initial Strava load:", error);
            setStatus(error.message, "error");
        });

    window.addEventListener("eddieos:strava-auth-changed", () => {
        loadRecentActivities().catch(error => {
            console.error("EddieOS Strava data:", error);
            setStatus(error.message, "error");
        });
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

export { loadRecentActivities };
