/* ==========================================
   EddieOS — My Clients

   Two roles live on one page since any account can be both a coach
   and a client: "Coach a Client" (this account editing someone
   else's Training/Race Plans) and "Share My Plans" (this account
   granting a coach access to its own). See js/coachAccess.js for
   the Firestore access this drives, and firestore.rules for what
   actually enforces the boundary.
========================================== */

import { listenForAuth } from "./auth.js";
import {
    createInviteCode, redeemInviteCode,
    listMyClients, listMyCoaches, removeLink,
    readSharedPlanDoc, saveClientPlanList, addPlanNote
} from "./coachAccess.js";
import {
    SERVICES, isApprovedCoach, listPendingProfiles,
    approveClient, denyProfile, promoteToCoach
} from "./userProfile.js";

const DAY_TYPES = ["rest", "easy", "long", "workout", "race", "cross", "strength"];

const signedOutEl = document.getElementById("clientsSignedOut");
const signedInEl = document.getElementById("clientsSignedIn");

// ---- Tabs ----
// selectTab is also called on load if the page was opened with
// ?tab=pending etc. (see bottom of file) -- js/coach.html links here
// directly to a specific tab instead of duplicating this page's UI.
function selectTab(tabName) {
    const tab = document.querySelector(`.clients-tab[data-tab="${tabName}"]`);
    if (!tab || tab.hidden) return;
    document.querySelectorAll(".clients-tab").forEach(t => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".clients-panel").forEach(panel => {
        panel.hidden = panel.dataset.panel !== tabName;
    });
}

document.querySelectorAll(".clients-tab").forEach(tab => {
    tab.addEventListener("click", () => selectTab(tab.dataset.tab));
});

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatRelativeTime(ts) {
    if (!ts) return "";
    const diffMin = Math.round((Date.now() - ts) / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.round(diffHr / 24)}d ago`;
}

// ---- Coach panel: redeem + client list ----

const redeemForm = document.getElementById("redeemForm");
const redeemInput = document.getElementById("redeemInput");
const redeemBtn = document.getElementById("redeemBtn");
const redeemMsg = document.getElementById("redeemMsg");
const clientsList = document.getElementById("clientsList");
const clientsEmptyMsg = document.getElementById("clientsEmptyMsg");

function showMsg(el, text, isError = false) {
    el.textContent = text;
    el.classList.toggle("clients-msg-error", isError);
    el.hidden = false;
}

async function refreshClients() {
    const clients = await listMyClients();
    clientsList.innerHTML = "";
    clientsEmptyMsg.hidden = clients.length > 0;

    for (const client of clients) {
        const row = document.createElement("div");
        row.className = "clients-row";
        row.innerHTML = `
            <div class="clients-row-avatar">${escapeHtml((client.clientName || "?").slice(0, 1).toUpperCase())}</div>
            <div class="clients-row-info">
                <strong>${escapeHtml(client.clientName || "Client")}</strong>
                <span>${escapeHtml(client.clientEmail || "")}</span>
            </div>
            <button type="button" class="clients-btn-secondary" data-action="view">View &amp; Edit</button>
            <button type="button" class="clients-btn-icon" data-action="remove" aria-label="Remove client">
                <span data-icon="trash"></span>
            </button>
        `;
        row.querySelector('[data-action="view"]').addEventListener("click", () => openEditor(client));
        row.querySelector('[data-action="remove"]').addEventListener("click", async () => {
            if (!window.confirm(`Remove access to ${client.clientName || "this client"}'s plans?`)) return;
            await removeLink(client.id);
            refreshClients();
        });
        clientsList.appendChild(row);
    }

    await import("./icons.js").then(m => m.hydrate());
}

redeemForm.addEventListener("submit", async event => {
    event.preventDefault();
    redeemBtn.disabled = true;
    redeemMsg.hidden = true;

    try {
        const result = await redeemInviteCode(redeemInput.value);
        showMsg(redeemMsg, `Added ${result.clientName} as a client.`);
        redeemInput.value = "";
        refreshClients();
    } catch (error) {
        const message = {
            "invalid-code": "That code doesn't exist or has already been used.",
            "empty-code": "Enter a code first.",
            "cannot-link-self": "You can't add yourself as a client."
        }[error.message] || "Couldn't add that client. Try again.";
        showMsg(redeemMsg, message, true);
    } finally {
        redeemBtn.disabled = false;
    }
});

// ---- Share panel: generate code + coach list ----

const generateCodeBtn = document.getElementById("generateCodeBtn");
const codeDisplay = document.getElementById("codeDisplay");
const codeValue = document.getElementById("codeValue");
const generateCodeMsg = document.getElementById("generateCodeMsg");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const copyCodeLabel = document.getElementById("copyCodeLabel");
const coachesList = document.getElementById("coachesList");
const coachesEmptyMsg = document.getElementById("coachesEmptyMsg");

generateCodeBtn.addEventListener("click", async () => {
    generateCodeBtn.disabled = true;
    generateCodeBtn.textContent = "Generating…";
    generateCodeMsg.hidden = true;
    try {
        const code = await createInviteCode();
        codeValue.textContent = code;
        codeDisplay.hidden = false;
    } catch (error) {
        console.error("Invite code generation failed:", error);
        const denied = error.code === "permission-denied" || /permission/i.test(error.message || "");
        showMsg(
            generateCodeMsg,
            denied
                ? "Couldn't generate a code -- Firestore security rules for this feature may not be deployed yet."
                : "Couldn't generate a code. Try again.",
            true
        );
    } finally {
        generateCodeBtn.disabled = false;
        generateCodeBtn.textContent = "Generate Invite Code";
    }
});

copyCodeBtn.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(codeValue.textContent);
    } catch {}
    copyCodeLabel.textContent = "Copied";
    setTimeout(() => { copyCodeLabel.textContent = "Copy"; }, 1800);
});

async function refreshCoaches() {
    const coaches = await listMyCoaches();
    coachesList.innerHTML = "";
    coachesEmptyMsg.hidden = coaches.length > 0;

    for (const coach of coaches) {
        const row = document.createElement("div");
        row.className = "clients-row";
        row.innerHTML = `
            <div class="clients-row-avatar">${escapeHtml((coach.coachName || "?").slice(0, 1).toUpperCase())}</div>
            <div class="clients-row-info">
                <strong>${escapeHtml(coach.coachName || "Coach")}</strong>
                <span>${escapeHtml(coach.coachEmail || "")}</span>
            </div>
            <button type="button" class="clients-btn-icon" data-action="revoke" aria-label="Revoke access">
                <span data-icon="trash"></span>
            </button>
        `;
        row.querySelector('[data-action="revoke"]').addEventListener("click", async () => {
            if (!window.confirm(`Remove ${coach.coachName || "this coach"}'s access to your plans?`)) return;
            await removeLink(coach.id);
            refreshCoaches();
        });
        coachesList.appendChild(row);
    }

    await import("./icons.js").then(m => m.hydrate());
}

// ---- Plan editor ----

const overlay = document.getElementById("planEditorOverlay");
const editorClientName = document.getElementById("editorClientName");
const editorPlanName = document.getElementById("editorPlanName");
const editorNoPlans = document.getElementById("editorNoPlans");
const editorPlanTabs = document.getElementById("editorPlanTabs");
const editorWeeks = document.getElementById("editorWeeks");
const editorNotesList = document.getElementById("editorNotesList");
const editorNoteForm = document.getElementById("editorNoteForm");
const editorNoteInput = document.getElementById("editorNoteInput");
const editorSaveBtn = document.getElementById("editorSaveBtn");
const editorSaveMsg = document.getElementById("editorSaveMsg");
const editorCloseBtn = document.getElementById("editorCloseBtn");

let editorState = null; // { clientUid, clientName, plans: [{planType, index, program}], activeKey }

function planKey(planType, index) { return `${planType}:${index}`; }

async function openEditor(client) {
    editorState = { clientUid: client.clientUid, clientName: client.clientName || "Client", plans: [], activeKey: null };
    editorClientName.textContent = client.clientName || "Client";
    editorPlanName.textContent = "Loading…";
    editorNoPlans.hidden = true;
    editorPlanTabs.innerHTML = "";
    editorWeeks.innerHTML = "";
    editorNotesList.innerHTML = "";
    editorSaveMsg.hidden = true;
    overlay.hidden = false;

    const shared = await readSharedPlanDoc(client.clientUid);
    editorState.shared = shared || {};
    const training = (shared?.trainingPrograms || []).map((program, index) => ({ planType: "training", index, program }));
    const running = (shared?.runningPrograms || []).map((program, index) => ({ planType: "running", index, program }));
    editorState.plans = [...running, ...training];

    if (!editorState.plans.length) {
        editorPlanName.textContent = "No plans";
        editorNoPlans.hidden = false;
        return;
    }

    editorPlanTabs.innerHTML = "";
    editorState.plans.forEach(entry => {
        const key = planKey(entry.planType, entry.index);
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "clients-plan-tab";
        tab.dataset.key = key;
        tab.textContent = entry.program.name || (entry.planType === "training" ? "Training Plan" : "Race Plan");
        tab.addEventListener("click", () => selectPlan(key));
        editorPlanTabs.appendChild(tab);
    });

    selectPlan(planKey(editorState.plans[0].planType, editorState.plans[0].index));
}

function currentEntry() {
    if (!editorState) return null;
    return editorState.plans.find(entry => planKey(entry.planType, entry.index) === editorState.activeKey) || null;
}

function selectPlan(key) {
    editorState.activeKey = key;
    document.querySelectorAll(".clients-plan-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.key === key));

    const entry = currentEntry();
    if (!entry) return;
    editorPlanName.textContent = entry.program.name || "Plan";
    renderWeeks(entry);
    renderNotes(entry);
}

function renderWeeks(entry) {
    const weeks = entry.program?.generatedPlan?.weeks || [];
    editorWeeks.innerHTML = "";

    if (!weeks.length) {
        editorWeeks.innerHTML = `<p class="clients-card-note">This plan hasn't been generated yet.</p>`;
        return;
    }

    weeks.forEach((week, weekIndex) => {
        const block = document.createElement("div");
        block.className = "clients-week";
        block.innerHTML = `<div class="clients-week-head">Week ${week.week ?? weekIndex + 1}${week.phase ? ` &middot; ${escapeHtml(week.phase)}` : ""}</div>`;

        const daysWrap = document.createElement("div");
        daysWrap.className = "clients-days";

        (week.days || []).forEach((day, dayIndex) => {
            const row = document.createElement("div");
            row.className = "clients-day-row";
            row.innerHTML = `
                <span class="clients-day-label">${escapeHtml(day.day || day.date || "")}</span>
                <select data-field="type" class="clients-day-type"></select>
                <input type="number" step="0.1" min="0" data-field="miles" class="clients-day-miles" value="${Number(day.miles) || 0}">
                <input type="text" data-field="session" class="clients-day-session" value="${escapeHtml(day.session || "")}" placeholder="Session notes">
            `;

            const select = row.querySelector("select");
            DAY_TYPES.forEach(type => {
                const option = document.createElement("option");
                option.value = type;
                option.textContent = type[0].toUpperCase() + type.slice(1);
                if (type === day.type) option.selected = true;
                select.appendChild(option);
            });
            if (!DAY_TYPES.includes(day.type)) {
                const option = document.createElement("option");
                option.value = day.type || "easy";
                option.textContent = day.type || "Easy";
                option.selected = true;
                select.prepend(option);
            }

            select.addEventListener("change", () => { day.type = select.value; });
            row.querySelector('[data-field="miles"]').addEventListener("input", e => { day.miles = Number(e.target.value) || 0; });
            row.querySelector('[data-field="session"]').addEventListener("input", e => { day.session = e.target.value; });

            daysWrap.appendChild(row);
        });

        block.appendChild(daysWrap);
        editorWeeks.appendChild(block);
    });
}

function renderNotes(entry) {
    const field = entry.planType === "training" ? "trainingPrograms" : "runningPrograms";
    const notes = editorState.shared?.notes?.[field]?.[entry.program.id] || [];
    editorNotesList.innerHTML = notes.length
        ? notes.map(note => `
            <div class="clients-note">
                <span class="clients-note-author">${escapeHtml(note.author || "Coach")}</span>
                <span class="clients-note-time">${escapeHtml(formatRelativeTime(note.at))}</span>
                <p>${escapeHtml(note.text)}</p>
            </div>
        `).join("")
        : `<p class="clients-card-note">No notes yet.</p>`;
}

editorNoteForm.addEventListener("submit", async event => {
    event.preventDefault();
    const entry = currentEntry();
    if (!entry || !editorNoteInput.value.trim()) return;

    const submitBtn = editorNoteForm.querySelector("button");
    submitBtn.disabled = true;
    try {
        await addPlanNote(editorState.clientUid, entry.planType, entry.program.id, editorNoteInput.value);
        editorState.shared = await readSharedPlanDoc(editorState.clientUid) || editorState.shared;
        editorNoteInput.value = "";
        renderNotes(entry);
    } catch (error) {
        console.error("Posting note failed:", error);
    } finally {
        submitBtn.disabled = false;
    }
});

editorSaveBtn.addEventListener("click", async () => {
    if (!editorState) return;
    editorSaveBtn.disabled = true;
    editorSaveMsg.hidden = true;

    try {
        const trainingPrograms = editorState.plans.filter(e => e.planType === "training").map(e => e.program);
        const runningPrograms = editorState.plans.filter(e => e.planType === "running").map(e => e.program);
        if (trainingPrograms.length) await saveClientPlanList(editorState.clientUid, "training", trainingPrograms);
        if (runningPrograms.length) await saveClientPlanList(editorState.clientUid, "running", runningPrograms);
        showMsg(editorSaveMsg, "Saved -- your client will see this next time their app syncs.");
    } catch (error) {
        console.error("Saving client plan failed:", error);
        showMsg(editorSaveMsg, "Couldn't save. Try again.", true);
    } finally {
        editorSaveBtn.disabled = false;
    }
});

editorCloseBtn.addEventListener("click", () => { overlay.hidden = true; editorState = null; });
overlay.addEventListener("click", event => { if (event.target === overlay) { overlay.hidden = true; editorState = null; } });

// ---- Pending accounts (coach-only) ----
// The tab itself stays hidden for everyone except an approved coach
// -- but that's just so a regular client isn't confused by a tab
// that will always be empty for them. The actual security boundary
// is the Firestore write rule (only an already-approved coach can
// change status/services/isCoachApproved), same as everywhere else
// in this app: UI hiding is never the real gate.

const pendingTabBtn = document.getElementById("pendingTabBtn");
const pendingCount = document.getElementById("pendingCount");
const pendingList = document.getElementById("pendingList");
const pendingEmptyMsg = document.getElementById("pendingEmptyMsg");

function pendingCardHtml(profile) {
    const requested = new Set(profile.requestedServices || []);
    const services = SERVICES.map(s => `
        <label class="clients-service-check">
            <input type="checkbox" value="${escapeHtml(s.value)}" ${requested.has(s.value) ? "checked" : ""}>
            <span>${escapeHtml(s.label)}</span>
        </label>
    `).join("");

    // requestedServices/applicationMessage only exist if they applied
    // through the public site's apply form (js/apply.js) -- someone
    // whose profile was only ever auto-created by signing into the
    // internal app won't have these, and that's fine, just fewer
    // details to show.
    const requestedNote = profile.requestedServices?.length
        ? `<div class="clients-service-note">Requested: ${profile.requestedServices.map(v => escapeHtml(SERVICES.find(s => s.value === v)?.label || v)).join(", ")}</div>`
        : "";
    const messageNote = profile.applicationMessage
        ? `<div class="clients-service-note">"${escapeHtml(profile.applicationMessage)}"</div>`
        : "";

    return `
        <div class="clients-row clients-pending-row" data-uid="${escapeHtml(profile.uid)}">
            <div class="clients-row-avatar">${escapeHtml((profile.displayName || "?").slice(0, 1).toUpperCase())}</div>
            <div class="clients-row-info">
                <strong>${escapeHtml(profile.displayName || "Unnamed")}</strong>
                <span>${escapeHtml(profile.email || "")} &middot; wants: ${escapeHtml(profile.role || "client")}</span>
                ${requestedNote}
                ${messageNote}
                <div class="clients-service-list">${services}</div>
            </div>
            <div class="clients-pending-actions">
                <button type="button" class="clients-btn-primary" data-action="approve">Approve</button>
                <button type="button" class="clients-btn-secondary" data-action="deny">Deny</button>
                <button type="button" class="clients-btn-secondary" data-action="promote">Make Coach</button>
            </div>
        </div>
    `;
}

async function refreshPending() {
    const pending = await listPendingProfiles();
    pendingCount.hidden = pending.length === 0;
    pendingCount.textContent = pending.length || "";
    pendingList.innerHTML = "";
    pendingEmptyMsg.hidden = pending.length > 0;

    for (const profile of pending) {
        const wrap = document.createElement("div");
        wrap.innerHTML = pendingCardHtml(profile);
        const row = wrap.firstElementChild;

        row.querySelector('[data-action="approve"]').addEventListener("click", async () => {
            const services = [...row.querySelectorAll(".clients-service-check input:checked")].map(el => el.value);
            await approveClient(profile.uid, services);
            refreshPending();
        });
        row.querySelector('[data-action="deny"]').addEventListener("click", async () => {
            if (!window.confirm(`Deny ${profile.displayName || "this account"}'s request?`)) return;
            await denyProfile(profile.uid);
            refreshPending();
        });
        row.querySelector('[data-action="promote"]').addEventListener("click", async () => {
            if (!window.confirm(`Make ${profile.displayName || "this account"} an approved coach? They'll get full coach access.`)) return;
            await promoteToCoach(profile.uid);
            refreshPending();
        });

        pendingList.appendChild(row);
    }
}

// ---- Auth gate ----

listenForAuth(user => {
    signedOutEl.hidden = Boolean(user);
    signedInEl.hidden = !user;
    if (user) {
        refreshClients();
        refreshCoaches();
        isApprovedCoach().then(approved => {
            pendingTabBtn.hidden = !approved;
            if (approved) refreshPending();

            // js/coach.html deep-links here with ?tab=pending etc.
            // instead of duplicating this page's UI -- only applied
            // once we know whether the requested tab is actually
            // visible for this account (e.g. "pending" needs approved).
            const requestedTab = new URLSearchParams(window.location.search).get("tab");
            if (requestedTab) selectTab(requestedTab);
        });
    }
});
