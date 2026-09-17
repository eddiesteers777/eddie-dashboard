/* ==========================================
   EddieOS Running — Log

   Runs that aren't part of the marathon plan --
   logged by hand (always available) or, if COROS
   is connected, imported with one tap. COROS is
   never required for this to work.
========================================== */

const LOG_KEY = "running-log";
const SNAPSHOT_KEY = "__eddieos_coros_data_snapshot_v2";

let editingEntryId = null;

function uid() {
    return crypto.randomUUID();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function localIsoDate(date) {
    // Not toISOString().slice(0,10) -- that forces UTC and silently
    // shifts to the wrong calendar day in the evening for anyone
    // west of UTC. Build the string from local-time components.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/* ==========================================
   Persistence
========================================== */

function loadLog() {
    try {
        const raw = localStorage.getItem(LOG_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && Array.isArray(parsed.entries)
            ? parsed
            : { entries: [] };
    } catch {
        return { entries: [] };
    }
}

function saveLog(data) {
    localStorage.setItem(LOG_KEY, JSON.stringify(data));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

/** All logged casual runs for one YYYY-MM-DD date. */
export function getEntriesForDate(dateStr) {
    return loadLog().entries.filter(e => e.date === dateStr);
}

export function getAllEntries() {
    return loadLog().entries
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));
}

export function getRecentEntries(count = 5) {
    return getAllEntries().slice(0, count);
}

/* ==========================================
   Optional COROS import (never required)
========================================== */

function corosRecordId(activity) {
    return (
        activity?.labelId ??
        activity?.label_id ??
        activity?.activityId ??
        activity?.activity_id ??
        activity?.id ??
        null
    );
}

function corosActivityDate(activity) {
    const raw =
        activity?.startTime ??
        activity?.start_time ??
        activity?.startDate ??
        activity?.start_date ??
        activity?.date ??
        "";

    if (!raw) return "";

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime())
        ? ""
        : localIsoDate(parsed);
}

function corosActivityMeters(activity) {
    const raw =
        activity?.distanceMeters ??
        activity?.distance_meters ??
        activity?.distance ??
        0;

    return Number(raw) || 0;
}

function corosActivityName(activity) {
    return (
        activity?.name ||
        activity?.activity_name ||
        activity?.sport_name ||
        activity?.sportName ||
        "COROS Run"
    );
}

function corosIsRun(activity) {
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

    return text.includes("run") || text.includes("trail");
}

/**
 * Returns COROS runs not already imported. Returns an empty
 * array (never throws, never blocks anything) if COROS has
 * never been connected or has no cached data.
 */
export function getImportableCorosRuns() {
    let snapshot = null;

    try {
        snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null");
    } catch {
        snapshot = null;
    }

    if (!snapshot || !Array.isArray(snapshot.activities)) {
        return [];
    }

    const log = loadLog();
    const alreadyImported = new Set(
        log.entries
            .filter(e => e.source === "coros" && e.corosActivityId)
            .map(e => e.corosActivityId)
    );

    return snapshot.activities
        .filter(corosIsRun)
        .map(activity => ({
            corosActivityId: String(corosRecordId(activity) || ""),
            date: corosActivityDate(activity),
            miles: corosActivityMeters(activity) / 1609.344,
            name: corosActivityName(activity)
        }))
        .filter(entry =>
            entry.corosActivityId &&
            entry.date &&
            entry.miles > 0 &&
            !alreadyImported.has(entry.corosActivityId)
        );
}

export function importCorosRun(candidate) {
    const data = loadLog();

    data.entries.push({
        id: uid(),
        source: "coros",
        corosActivityId: candidate.corosActivityId,
        date: candidate.date,
        time: null,
        miles: candidate.miles,
        type: "Easy",
        notes: "",
        name: candidate.name
    });

    saveLog(data);

    window.dispatchEvent(new CustomEvent("eddieos:running-log-changed"));
}

/* ==========================================
   Add / Edit modal
========================================== */

function openRunModal(entry = null) {
    editingEntryId = entry?.id || null;

    document.getElementById("runningRunModalTitle").textContent =
        entry?.id ? "Edit Run" : "Add a Run";

    document.getElementById("runningRunDate").value =
        entry?.date || localIsoDate(new Date());

    document.getElementById("runningRunTime").value = entry?.time || "";
    document.getElementById("runningRunMiles").value = entry?.miles || "";
    document.getElementById("runningRunType").value = entry?.type || "Easy";
    document.getElementById("runningRunNotes").value = entry?.notes || "";

    const deleteBtn = document.getElementById("runningRunDelete");

    if (deleteBtn) {
        deleteBtn.style.display = entry?.id ? "inline-block" : "none";
    }

    document.getElementById("runningRunModalOverlay")?.classList.add("open");
}

function closeRunModal() {
    document.getElementById("runningRunModalOverlay")?.classList.remove("open");
    editingEntryId = null;
}

function saveRunModal() {
    const date = document.getElementById("runningRunDate").value;
    const miles = Number(document.getElementById("runningRunMiles").value);

    if (!date || !miles || miles <= 0) {
        return;
    }

    const data = loadLog();

    const entryData = {
        date,
        time: document.getElementById("runningRunTime").value || null,
        miles,
        type: document.getElementById("runningRunType").value,
        notes: document.getElementById("runningRunNotes").value.trim()
    };

    if (editingEntryId) {
        const existing = data.entries.find(e => e.id === editingEntryId);

        if (existing) {
            Object.assign(existing, entryData);
        }
    } else {
        data.entries.push({
            id: uid(),
            source: "manual",
            corosActivityId: null,
            ...entryData
        });
    }

    saveLog(data);
    closeRunModal();

    window.dispatchEvent(new CustomEvent("eddieos:running-log-changed"));
}

function deleteRunModal() {
    if (!editingEntryId) {
        closeRunModal();
        return;
    }

    const data = loadLog();
    data.entries = data.entries.filter(e => e.id !== editingEntryId);
    saveLog(data);

    closeRunModal();

    window.dispatchEvent(new CustomEvent("eddieos:running-log-changed"));
}

/* ==========================================
   Event wiring
========================================== */

document.addEventListener("click", event => {
    const target = event.target;

    if (target.matches("#runningAddRunBtn")) {
        openRunModal();
        return;
    }

    if (target.matches("[data-edit-log-entry]")) {
        const entry = loadLog().entries.find(
            e => e.id === target.dataset.editLogEntry
        );

        if (entry) {
            openRunModal(entry);
        }
        return;
    }

    if (
        target.matches("#runningRunModalClose") ||
        target.matches("#runningRunCancel") ||
        target.matches("#runningRunModalOverlay")
    ) {
        closeRunModal();
        return;
    }

    if (target.matches("#runningRunSave")) {
        saveRunModal();
        return;
    }

    if (target.matches("#runningRunDelete")) {
        deleteRunModal();
        return;
    }
});

/**
 * Lets the Calendar open the Add Run modal pre-filled with a
 * date the person clicked, without the two files needing to
 * import from each other.
 */
window.addEventListener("eddieos:running-add-run-for-date", event => {
    const dateStr = event.detail?.date;
    openRunModal(dateStr ? { date: dateStr } : null);
});
