/* ==========================================
   Southbound Analytics — the header and Personal Records

   The header counts down to race day from the Marathon plan; Personal
   Records are typed in by you. The training and body trends below them
   are js/trendsView.js (from what you actually ran and measured).
========================================== */

import {
    WEEKS,
    getCurrentWeek,
    getRaceCountdown,
    getTrainingPhase
} from "./marathonData.js";

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function renderHero() {
    setText("countdownDays", getRaceCountdown());
    setText("trainingWeek", `Week ${getCurrentWeek()} of ${WEEKS.length}`);
    setText("trainingPhase", getTrainingPhase() || "—");
}

/* ==========================================
   Personal Records — real, user-entered, no fake defaults
========================================== */

const PR_KEY = "personal-records";
const PR_FIELDS = [
    { id: "5k", label: "5K" },
    { id: "10k", label: "10K" },
    { id: "half", label: "Half Marathon" },
    { id: "marathon", label: "Marathon" }
];

function loadPersonalRecords() {
    try {
        return JSON.parse(localStorage.getItem(PR_KEY) || "{}");
    } catch (e) {
        return {};
    }
}

function savePersonalRecords(records) {
    localStorage.setItem(PR_KEY, JSON.stringify(records));
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
}

function renderPersonalRecords() {
    const container = $("recordsGrid");
    if (!container) return;

    const records = loadPersonalRecords();

    container.innerHTML = PR_FIELDS.map(field => `
        <div class="record" data-field="${field.id}">
            <span>${field.label}</span>
            <h3 class="record-value">${records[field.id] || "Not set"}</h3>
            <input
                type="text"
                class="record-input"
                placeholder="e.g. 3:05:00"
                value="${records[field.id] || ""}"
                hidden>
        </div>
    `).join("");

    container.querySelectorAll(".record").forEach(card => {
        const field = card.dataset.field;
        const value = card.querySelector(".record-value");
        const input = card.querySelector(".record-input");

        value.addEventListener("click", () => {
            value.hidden = true;
            input.hidden = false;
            input.focus();
            input.select();
        });

        function commit() {
            const records = loadPersonalRecords();
            const next = input.value.trim();
            records[field] = next;
            savePersonalRecords(records);
            value.textContent = next || "Not set";
            input.hidden = true;
            value.hidden = false;
        }

        input.addEventListener("blur", commit);
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") input.blur();
        });
    });
}

// Each section is independent: a failure in one must never take down the other.
function safely(fn) {
    try {
        fn();
    } catch (error) {
        console.error(`Analytics: ${fn.name} failed`, error);
    }
}

function initAnalytics() {
    safely(renderHero);
    safely(renderPersonalRecords);
}

$("viewMarathonPlan")?.addEventListener("click", () => {
    window.location.href = "marathon.html";
});

$("viewTodayWorkout")?.addEventListener("click", () => {
    window.location.href = "index.html";
});

document.addEventListener("DOMContentLoaded", initAnalytics);
