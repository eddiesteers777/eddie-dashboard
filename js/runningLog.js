/* ==========================================
   Southbound Running — Log

   Runs that aren't part of the marathon plan --
   logged by hand (always available) or, if COROS
   is connected, imported with one tap. COROS is
   never required for this to work.
========================================== */

import { PLAN_KINDS, DONE_TYPES, kindById, makePlanned, loadPlanned, savePlanned, logEntryFromPlanned } from "./runningPlanned.js";

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

let modalMode = "plan";      // "plan" = a workout for later, "done" = a run already done
let modalKind = "easy";      // plan kind id, or a done type like "Easy"
let editingPlannedId = null; // a planned workout being edited
let completingPlannedId = null; // a planned run being marked done (removed on save)

function renderKindChips() {
    const wrap = document.getElementById("runningRunKinds");
    if (!wrap) return;

    const options = modalMode === "plan"
        ? PLAN_KINDS.map(k => ({ value: k.id, label: k.label }))
        : DONE_TYPES.map(t => ({ value: t, label: t }));

    wrap.innerHTML = options.map(o => `
        <button type="button" class="running-kind-chip ${o.value === modalKind ? "active" : ""}"
            data-run-kind="${escapeHtml(o.value)}" aria-pressed="${o.value === modalKind}">${escapeHtml(o.label)}</button>
    `).join("");

    const kind = kindById(modalKind);
    const amountLabel = document.getElementById("runningRunAmountLabel");
    if (amountLabel) {
        amountLabel.textContent = modalMode === "plan" && kind && !kind.run ? "Minutes (optional)" : "Distance (miles)";
    }
}

function setModalMode(mode) {
    modalMode = mode;
    modalKind = mode === "plan" ? "easy" : "Easy";
    document.querySelectorAll("[data-run-mode]").forEach(btn => {
        const on = btn.dataset.runMode === mode;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-pressed", String(on));
    });
    renderKindChips();
}

function openRunModal(entry = null) {
    editingEntryId = null;
    editingPlannedId = null;
    completingPlannedId = null;

    const isPlanned = !!entry?.kind;          // a planned workout
    const isLog = !!entry?.id && !isPlanned;  // an existing logged run
    const existing = isPlanned || isLog;

    editingEntryId = isLog ? entry.id : null;
    editingPlannedId = isPlanned ? entry.id : null;

    setModalMode(isLog ? "done" : "plan");
    if (isPlanned) modalKind = entry.kind;
    if (isLog) modalKind = DONE_TYPES.includes(entry.type) ? entry.type : "Other";
    renderKindChips();

    // Fresh adds can switch between planning and logging. Edits can't.
    const modeBar = document.getElementById("runningRunMode");
    if (modeBar) modeBar.style.display = existing ? "none" : "";

    document.getElementById("runningRunModalTitle").textContent =
        isPlanned ? "Edit workout" : isLog ? "Edit Run" : "Add a workout";

    document.getElementById("runningRunDate").value =
        entry?.date || localIsoDate(new Date());

    document.getElementById("runningRunTime").value = entry?.time || "";
    document.getElementById("runningRunMiles").value =
        (isPlanned ? (entry.miles || entry.minutes) : entry?.miles) || "";
    document.getElementById("runningRunNotes").value = entry?.notes || "";

    const deleteBtn = document.getElementById("runningRunDelete");

    if (deleteBtn) {
        deleteBtn.style.display = existing ? "inline-block" : "none";
    }

    document.getElementById("runningRunModalOverlay")?.classList.add("open");
}

/** "Mark done" on a planned run: the same form, filled in, as a run you did. */
function openMarkDone(item) {
    const prefill = logEntryFromPlanned(item);
    if (!prefill) return;
    openRunModal(prefill);
    completingPlannedId = item.id;
    document.getElementById("runningRunModalTitle").textContent = "Log this run";
    const modeBar = document.getElementById("runningRunMode");
    if (modeBar) modeBar.style.display = "none";
    setModalMode("done");
    modalKind = prefill.type;
    renderKindChips();
}

function closeRunModal() {
    document.getElementById("runningRunModalOverlay")?.classList.remove("open");
    editingEntryId = null;
    editingPlannedId = null;
    completingPlannedId = null;
}

function savePlannedModal() {
    const date = document.getElementById("runningRunDate").value;
    const amount = document.getElementById("runningRunMiles").value;
    const kind = kindById(modalKind);

    const item = makePlanned({
        id: editingPlannedId || undefined,
        date,
        kind: modalKind,
        miles: kind?.run ? amount : undefined,
        minutes: kind?.run ? undefined : amount,
        time: document.getElementById("runningRunTime").value,
        notes: document.getElementById("runningRunNotes").value
    });

    if (!item) {
        import("./ui.js").then(({ toast }) => toast(
            kind?.run ? "Add a date and how many miles." : "Add a date first."
        )).catch(() => {});
        return;
    }

    const items = loadPlanned();
    const at = items.findIndex(e => e.id === item.id);
    if (at >= 0) {
        item.done = items[at].done;
        items[at] = item;
    } else {
        items.push(item);
    }
    savePlanned(items);
    closeRunModal();

    import("./ui.js").then(({ toast }) => toast("Workout added.")).catch(() => {});
    window.dispatchEvent(new CustomEvent("eddieos:running-log-changed"));
}

function saveRunModal() {
    if (modalMode === "plan") {
        savePlannedModal();
        return;
    }

    const date = document.getElementById("runningRunDate").value;
    const miles = Number(document.getElementById("runningRunMiles").value);

    if (!date || !miles || miles <= 0) {
        return;
    }

    const data = loadLog();
    let newEntry = null;

    const entryData = {
        date,
        time: document.getElementById("runningRunTime").value || null,
        miles,
        type: modalKind,
        notes: document.getElementById("runningRunNotes").value.trim()
    };

    if (editingEntryId) {
        const existing = data.entries.find(e => e.id === editingEntryId);

        if (existing) {
            Object.assign(existing, entryData);
        }
    } else {
        newEntry = {
            id: uid(),
            source: "manual",
            corosActivityId: null,
            ...entryData
        };
        data.entries.push(newEntry);
    }

    saveLog(data);

    if (completingPlannedId) {
        savePlanned(loadPlanned().filter(e => e.id !== completingPlannedId));
    }

    closeRunModal();

    // A new run: saved, with an optional share image (Train → Recent Workouts has it too).
    if (newEntry) {
        const saved = newEntry;
        import("./ui.js").then(({ toast }) => toast("Run saved.", {
            action: {
                label: "Share",
                onClick: () => Promise.all([import("./completedSessions.js"), import("./sessionShare.js")])
                    .then(([{ runFromLog }, { shareSession }]) => { const session = runFromLog(saved); if (session) shareSession(session); })
                    .catch(() => {})
            }
        })).catch(() => {});
    }

    window.dispatchEvent(new CustomEvent("eddieos:running-log-changed"));
}

function deleteRunModal() {
    if (editingPlannedId) {
        savePlanned(loadPlanned().filter(e => e.id !== editingPlannedId));
        closeRunModal();
        window.dispatchEvent(new CustomEvent("eddieos:running-log-changed"));
        return;
    }

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

    const modeBtn = target.closest("[data-run-mode]");
    if (modeBtn) {
        setModalMode(modeBtn.dataset.runMode);
        return;
    }

    const kindBtn = target.closest("[data-run-kind]");
    if (kindBtn) {
        modalKind = kindBtn.dataset.runKind;
        renderKindChips();
        return;
    }

    const editPlanned = target.closest("[data-edit-planned]");
    if (editPlanned) {
        const item = loadPlanned().find(e => e.id === editPlanned.dataset.editPlanned);
        if (item) openRunModal(item);
        return;
    }

    const donePlanned = target.closest("[data-done-planned]");
    if (donePlanned) {
        const items = loadPlanned();
        const item = items.find(e => e.id === donePlanned.dataset.donePlanned);
        if (!item) return;
        if (kindById(item.kind)?.run) {
            openMarkDone(item);
        } else {
            item.done = !item.done;
            savePlanned(items);
            window.dispatchEvent(new CustomEvent("eddieos:running-log-changed"));
        }
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
        target.closest("#runningRunModalClose") ||
        target.closest("#runningRunCancel") ||
        target === document.getElementById("runningRunModalOverlay")
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

/**
 * The mobile header's "+" quick-add menu links here with
 * ?addRun=1 so tapping "Add a Run" from anywhere on the site opens
 * straight into this modal instead of just landing on the page.
 */
(function openFromUrlParam() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("addRun") === "1") {
        openRunModal();

        // Strip the param so a later refresh of this same page
        // doesn't reopen the modal every time.
        params.delete("addRun");
        const query = params.toString();
        history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    }
})();
