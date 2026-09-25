/* ==========================================
   Southbound — Coach plan editor

   Edit a linked client's Training / Race Plans day by day, and leave
   plan notes the client sees. Moved out of js/clients.js (where it was
   a popup) so the Client Hub's Plan tab can host it inline. Reads and
   writes the same sharedPlans/{clientUid} mirror as before
   (js/coachAccess.js); the client's app pulls changes on its next sync.

   mountPlanEditor(container, { clientUid, clientName, focusPlanId })
========================================== */

import { readSharedPlanDoc, saveClientPlanList, addPlanNote } from "./coachAccess.js";

const DAY_TYPES = ["rest", "easy", "long", "workout", "race", "cross", "strength"];

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

const planKey = (planType, index) => `${planType}:${index}`;

export async function mountPlanEditor(container, { clientUid, clientName, focusPlanId, currentDate } = {}) {
    container.innerHTML = `
        <div class="clients-plan-editor">
            <p class="clients-card-note" data-el="loading">Loading plans…</p>
            <div class="clients-card-note" data-el="noPlans" hidden>${escapeHtml(clientName || "This client")} doesn't have any plans yet. Plans they create in Programs (or a Race Plan) show up here to edit.</div>
            <div class="clients-plan-tabs" data-el="tabs"></div>
            <h3 class="clients-plan-name" data-el="planName" hidden></h3>
            <div class="clients-weeks" data-el="weeks"></div>
            <div class="clients-notes-section" data-el="notesSection" hidden>
                <h3>Plan notes <span class="clients-card-note">(your client sees these)</span></h3>
                <div class="clients-notes-list" data-el="notes"></div>
                <form class="clients-note-form" data-el="noteForm">
                    <textarea rows="2" data-el="noteInput" placeholder="Leave a note for your client about this plan..."></textarea>
                    <button type="submit" class="clients-btn-primary">Post Note</button>
                </form>
            </div>
            <div class="clients-editor-actions" data-el="actions" hidden>
                <button type="button" class="clients-btn-primary" data-el="saveBtn">Save Changes</button>
                <span class="clients-msg" data-el="saveMsg" hidden></span>
            </div>
        </div>`;

    const el = name => container.querySelector(`[data-el="${name}"]`);
    const state = { shared: {}, plans: [], activeKey: null };

    const showMsg = (text, isError = false) => {
        const msg = el("saveMsg");
        msg.textContent = text;
        msg.classList.toggle("clients-msg-error", isError);
        msg.hidden = false;
    };

    const currentEntry = () => state.plans.find(e => planKey(e.planType, e.index) === state.activeKey) || null;

    function renderWeeks(entry) {
        const weeks = entry.program?.generatedPlan?.weeks || [];
        const wrap = el("weeks");
        wrap.innerHTML = "";
        if (!weeks.length) {
            wrap.innerHTML = `<p class="clients-card-note">This plan hasn't been generated yet.</p>`;
            return;
        }

        let currentBlock = null;
        weeks.forEach((week, weekIndex) => {
            const block = document.createElement("div");
            block.className = "clients-week";
            const days = week.days || [];
            const isCurrent = currentDate && days.some(d => d.date === currentDate);
            if (isCurrent) { block.classList.add("is-current"); currentBlock = block; }
            const done = days.filter(d => d.type !== "rest" && d.completed).length;
            const planned = days.filter(d => d.type !== "rest").length;
            block.innerHTML = `<div class="clients-week-head">Week ${week.week ?? weekIndex + 1}${week.phase ? ` &middot; ${escapeHtml(week.phase)}` : ""}${isCurrent ? ` <span class="clients-week-now">This week</span>` : ""}<span class="clients-week-done">${done}/${planned} done</span></div>`;

            const daysWrap = document.createElement("div");
            daysWrap.className = "clients-days";

            days.forEach(day => {
                const row = document.createElement("div");
                row.className = "clients-day-row" + (day.completed ? " is-done" : "");
                row.innerHTML = `
                    <span class="clients-day-label">${escapeHtml(day.day || day.date || "")}${day.completed ? ` <span class="clients-day-check" title="Done">&#10003;</span>` : ""}</span>
                    <select data-field="type" class="clients-day-type" aria-label="Type"></select>
                    <input type="number" step="0.1" min="0" data-field="miles" class="clients-day-miles" value="${Number(day.miles) || 0}" aria-label="Miles">
                    <input type="text" data-field="session" class="clients-day-session" value="${escapeHtml(day.session || "")}" placeholder="Session notes" aria-label="Session">
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
            wrap.appendChild(block);
        });

        // Land on this week instead of week 1.
        if (currentBlock) requestAnimationFrame(() => currentBlock.scrollIntoView({ block: "start", behavior: "auto" }));
    }

    function renderNotes(entry) {
        const field = entry.planType === "training" ? "trainingPrograms" : "runningPrograms";
        const notes = state.shared?.notes?.[field]?.[entry.program.id] || [];
        el("notes").innerHTML = notes.length
            ? notes.map(note => `
                <div class="clients-note">
                    <span class="clients-note-author">${escapeHtml(note.author || "Coach")}</span>
                    <span class="clients-note-time">${escapeHtml(formatRelativeTime(note.at))}</span>
                    <p>${escapeHtml(note.text)}</p>
                </div>`).join("")
            : `<p class="clients-card-note">No notes yet.</p>`;
    }

    function selectPlan(key) {
        state.activeKey = key;
        container.querySelectorAll(".clients-plan-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.key === key));
        const entry = currentEntry();
        if (!entry) return;
        el("planName").textContent = entry.program.name || "Plan";
        el("planName").hidden = state.plans.length > 1;
        renderWeeks(entry);
        renderNotes(entry);
    }

    el("noteForm").addEventListener("submit", async event => {
        event.preventDefault();
        const entry = currentEntry();
        const input = el("noteInput");
        if (!entry || !input.value.trim()) return;
        const btn = el("noteForm").querySelector("button");
        btn.disabled = true;
        try {
            await addPlanNote(clientUid, entry.planType, entry.program.id, input.value);
            state.shared = await readSharedPlanDoc(clientUid) || state.shared;
            input.value = "";
            renderNotes(entry);
        } catch (error) {
            console.error("Posting note failed:", error);
        } finally {
            btn.disabled = false;
        }
    });

    el("saveBtn").addEventListener("click", async () => {
        const btn = el("saveBtn");
        btn.disabled = true;
        el("saveMsg").hidden = true;
        try {
            const trainingPrograms = state.plans.filter(e => e.planType === "training").map(e => e.program);
            const runningPrograms = state.plans.filter(e => e.planType === "running").map(e => e.program);
            if (trainingPrograms.length) await saveClientPlanList(clientUid, "training", trainingPrograms);
            if (runningPrograms.length) await saveClientPlanList(clientUid, "running", runningPrograms);
            showMsg("Saved -- your client will see this next time their app syncs.");
        } catch (error) {
            console.error("Saving client plan failed:", error);
            showMsg("Couldn't save. Try again.", true);
        } finally {
            btn.disabled = false;
        }
    });

    const shared = await readSharedPlanDoc(clientUid).catch(() => null);
    el("loading").hidden = true;
    state.shared = shared || {};
    const running = (shared?.runningPrograms || []).map((program, index) => ({ planType: "running", index, program }));
    const training = (shared?.trainingPrograms || []).map((program, index) => ({ planType: "training", index, program }));
    // Active plans first.
    state.plans = [...running, ...training].sort((a, b) => (b.program.status === "active") - (a.program.status === "active"));

    if (!state.plans.length) {
        el("noPlans").hidden = false;
        return;
    }

    el("notesSection").hidden = false;
    el("actions").hidden = false;
    const tabs = el("tabs");
    state.plans.forEach(entry => {
        const key = planKey(entry.planType, entry.index);
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "clients-plan-tab";
        tab.dataset.key = key;
        const status = entry.program.status && entry.program.status !== "active" ? ` (${entry.program.status})` : "";
        tab.textContent = (entry.program.name || (entry.planType === "training" ? "Training Plan" : "Race Plan")) + status;
        tab.addEventListener("click", () => selectPlan(key));
        tabs.appendChild(tab);
    });
    tabs.hidden = state.plans.length < 2;

    const focus = state.plans.find(e => e.program.id === focusPlanId) || state.plans[0];
    selectPlan(planKey(focus.planType, focus.index));
}
