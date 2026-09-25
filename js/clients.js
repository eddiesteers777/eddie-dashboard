/* ==========================================
   Southbound — My Clients

   Two roles live on one page since any account can be both a coach
   and a client: "Coach a Client" (this account editing someone
   else's Training/Race Plans) and "Share My Plans" (this account
   granting a coach access to its own). See js/coachAccess.js for
   the Firestore access this drives, and firestore.rules for what
   actually enforces the boundary.
========================================== */

import { listenForAuth } from "./auth.js";
import { cachedRole } from "./role.js";
import {
    createInviteCode, redeemInviteCode, linkApplicant,
    listMyCoaches, removeLink
} from "./coachAccess.js";
import { loadClientDirectory } from "./clientDirectory.js";
import { summarizeClient, serviceLabels, isoDate, shortDate } from "./clientSummary.js";
import {
    SERVICES, isApprovedCoach, listPendingProfiles,
    approveClient, denyProfile, promoteToCoach
} from "./userProfile.js";

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

// Each linked client as one row: who they are, their plan week, next
// session, check-in status and anything that needs attention. The row
// opens their Client Hub (client.html). Data comes from
// js/clientDirectory.js, summaries from js/clientSummary.js.
let clientRows = [];
let clientFilter = "all";
const clientSearch = document.getElementById("clientSearch");
const clientFilters = document.getElementById("clientFilters");

const FILTERS = {
    all: () => true,
    attention: c => c.attention.length > 0,
    running: c => c.services.includes("running"),
    strength: c => c.services.includes("strength"),
    soccer: c => c.services.some(s => s.startsWith("soccer")),
    online: c => c.services.includes("online_coaching")
};

function planLine(c) {
    const p = c.plans.primary;
    if (!p) return "No active plan";
    if (p.state === "upcoming") return `${p.name} · starts ${shortDate(p.startDate)}`;
    if (p.state === "finished") return `${p.name} · finished`;
    return `${p.name} · Week ${p.weekNumber} of ${p.totalWeeks}`;
}

function sessionLine(c) {
    const next = c.sessions.upcoming[0];
    return next ? `Next session ${shortDate(next.date)}` : "";
}

function checkinLine(c) {
    const latest = c.checkins.latest;
    if (!latest) return "";
    return latest.status === "submitted" ? "Check-in needs reply" : `Check-in ${shortDate(latest.weekOf)} reviewed`;
}

function renderClientRows() {
    const q = (clientSearch.value || "").trim().toLowerCase();
    const shown = clientRows
        .filter(FILTERS[clientFilter] || FILTERS.all)
        .filter(c => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));

    clientsEmptyMsg.hidden = clientRows.length > 0;
    clientsList.innerHTML = shown.length || !clientRows.length ? "" :
        `<p class="clients-card-note">No clients match.</p>`;

    for (const c of shown) {
        const row = document.createElement("div");
        row.className = "clients-row clients-client-row";
        const meta = [planLine(c), sessionLine(c), checkinLine(c)].filter(Boolean);
        row.innerHTML = `
            <a class="clients-client-link" href="client.html?uid=${encodeURIComponent(c.uid)}">
                <div class="clients-row-avatar">${escapeHtml((c.name || "?").slice(0, 1).toUpperCase())}</div>
                <div class="clients-row-info">
                    <strong>${escapeHtml(c.name)}${c.attention.length ? ` <span class="clients-attn-badge" title="Needs attention">${c.attention.length}</span>` : ""}</strong>
                    <span>${escapeHtml(serviceLabels(c.services).join(" · ") || c.email)}</span>
                    <span class="clients-client-meta">${meta.map(escapeHtml).join(" &middot; ")}</span>
                </div>
                <span class="clients-client-chevron" data-icon="chevronRight"></span>
            </a>
            <button type="button" class="clients-btn-icon" data-action="remove" aria-label="Remove client">
                <span data-icon="trash"></span>
            </button>
        `;
        row.querySelector('[data-action="remove"]').addEventListener("click", async () => {
            if (!window.confirm(`Remove ${c.name}? You'll lose access to their plans, check-ins and sessions until they send you a new code.`)) return;
            await removeLink(c.linkId);
            refreshClients();
        });
        clientsList.appendChild(row);
    }

    clientFilters.querySelectorAll("[data-filter]").forEach(btn => {
        const count = clientRows.filter(FILTERS[btn.dataset.filter]).length;
        btn.querySelector(".clients-filter-count").textContent = count;
        btn.classList.toggle("active", btn.dataset.filter === clientFilter);
    });

    import("./icons.js").then(m => m.hydrate());
}

async function refreshClients() {
    clientsList.innerHTML = `<p class="clients-card-note">Loading clients…</p>`;
    const today = isoDate(new Date());
    const records = await loadClientDirectory().catch(error => {
        console.error("Loading clients failed:", error);
        return [];
    });
    clientRows = records
        .map(r => ({ ...summarizeClient(r, today), linkId: r.link.id }))
        .sort((a, b) => (b.attention.length > 0) - (a.attention.length > 0) || a.name.localeCompare(b.name));
    renderClientRows();
}

clientSearch.addEventListener("input", renderClientRows);
clientFilters.addEventListener("click", event => {
    const btn = event.target.closest("[data-filter]");
    if (!btn) return;
    clientFilter = btn.dataset.filter;
    renderClientRows();
});

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
            "expired-code": "That code has expired. Ask your client for a new one.",
            "not-approved-coach": "Only approved coach accounts can add clients.",
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
        generateCodeBtn.textContent = codeDisplay.hidden ? "Get My Code" : "Get a New Code";
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
            const approveBtn = row.querySelector('[data-action="approve"]');
            approveBtn.disabled = true;
            await approveClient(profile.uid, services);
            // Link them in the same step using the code their application
            // left (js/coachAccess.js). Older applications won't have one;
            // those still link the usual way, with an invite code.
            let linked = false;
            try {
                await linkApplicant(profile.uid);
                linked = true;
            } catch (error) {
                console.info("Approved without auto-link:", error.message);
            }
            window.alert(linked
                ? `${profile.displayName || "They"} ${profile.displayName ? "is" : "are"} approved and linked -- they're in My Clients now.`
                : `${profile.displayName || "They"} ${profile.displayName ? "is" : "are"} approved. They aren't linked yet: ask them to open More > Connect with Coach in their app and send you the code, then enter it under Coach a Client.`);
            refreshPending();
            refreshClients();
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

// ---- Coach vs client view ----
// A coach manages clients here (Coach a Client + Pending) and has no
// use for sharing their own plans. A client only ever uses this page to
// connect with their coach, so they get just that (More -> Connect with
// Coach links here). Guessed from the role remembered on this device
// (js/role.js) so there's no flash, then confirmed from the profile.

const titleEl = document.getElementById("clientsTitle");
const introEl = document.getElementById("clientsIntro");
const coachTitle = titleEl.textContent;
const coachIntro = introEl.textContent;

function setClientsView(isCoach) {
    document.getElementById("clientsTabs").hidden = !isCoach;
    document.getElementById("shareTabBtn").hidden = isCoach;
    titleEl.textContent = isCoach ? coachTitle : "Connect with Your Coach";
    introEl.textContent = isCoach
        ? coachIntro
        : "Link your account to your coach so they can build your plan, read your check-ins and book your sessions.";
    if (!isCoach) selectTab("share");
    else if (document.querySelector('.clients-tab.active')?.dataset.tab === "share") selectTab("coach");
}
setClientsView(cachedRole() === "coach");

// ---- Auth gate ----

listenForAuth(user => {
    signedOutEl.hidden = Boolean(user);
    signedInEl.hidden = !user;
    if (user) {
        refreshClients();
        refreshCoaches();
        isApprovedCoach().then(approved => {
            setClientsView(approved);
            pendingTabBtn.hidden = !approved;
            if (approved) refreshPending();

            // js/coach.html deep-links here with ?tab=pending etc.
            // instead of duplicating this page's UI -- only applied
            // once we know whether the requested tab is actually
            // visible for this account (e.g. "pending" needs approved).
            const requestedTab = new URLSearchParams(window.location.search).get("tab");
            if (requestedTab && (approved || requestedTab === "share")) selectTab(requestedTab);
        });
    }
});
