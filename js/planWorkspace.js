/* ==========================================
   Southbound — Coach plan workspace (Client Hub -> Plan)

   Where the coach builds and publishes a client's plan:
     - the client's published plans (version, seen / got it), drafts,
       and plans the client made themselves ("Take over this plan")
     - New plan (blank, from a start date and a number of weeks)
     - the editor: every day's type / miles / workout, add weeks,
       the client's done marks shown read-only
     - Save draft (only the coach sees it) / Review & publish (shows
       exactly what changes, optional note, then the client gets it)
     - version history
   Data: js/coachingPlans.js. Change lists: js/coachingPlanModel.js.
   Replaces the old edit-the-client's-copy editor (js/planEditor.js):
   the client's device no longer owns a coached plan.

   mountPlanWorkspace(container, { clientUid, clientName, clientEmail,
                                    firstName, data, onChange })
     data: the hub's loaded record ({ coachingPlans, planDrafts, shared })
========================================== */

import {
    newPlanId, saveDraft, deleteDraft, publishPlan, setPlanArchived, listVersions, previewChanges
} from "./coachingPlans.js";
import {
    DAY_TYPES, typeLabel, blankPlan, addWeeks, stripRuntime, recalcPlannedMiles, planDateRange,
    changeLines, shortDay, isoDate
} from "./coachingPlanModel.js";
import { toMillis } from "./clientSummary.js";
import { toast, sbConfirm, friendlyError } from "./ui.js";
import { icon } from "./icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const niceDate = ms => ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

export function mountPlanWorkspace(container, { clientUid, clientName, clientEmail, firstName, data, onChange }) {
    const state = {
        view: "list",
        editing: null  // { planId, header, name, kind, plan, basedOnVersion, adoptedFrom, draftExists, dirty }
    };
    const published = () => data.coachingPlans || [];
    const drafts = () => data.planDrafts || [];
    const first = firstName || "your client";

    // The client's own plans (made in their app) a coach can take over.
    function clientOwnPlans() {
        const adopted = new Set(published().map(h => h.adoptedFrom?.id).filter(Boolean));
        const draftAdopted = new Set(drafts().map(d => d.adoptedFrom?.id).filter(Boolean));
        const list = [
            ...(data.shared?.runningPrograms || []).map(p => ({ ...p, store: "running" })),
            ...(data.shared?.trainingPrograms || []).map(p => ({ ...p, store: "training" }))
        ];
        return list.filter(p => p.status === "active" && p.generatedPlan?.weeks?.length
            && !p.replacedByCoachPlan && !adopted.has(p.id) && !draftAdopted.has(p.id));
    }

    // Done marks from the client's synced copy of a coach plan: date -> true.
    function doneMarks(planId) {
        const copy = (data.shared?.coachPlans || []).find(p => p.coachPlanId === planId);
        const marks = new Map();
        for (const week of copy?.generatedPlan?.weeks || []) {
            for (const day of week.days || []) if (day.completed) marks.set(day.date, true);
        }
        return marks;
    }

    function statusChips(h) {
        const chips = [];
        if (h.status === "archived") chips.push(`<span class="pw-chip">Archived</span>`);
        else if ((h.ackVersion || 0) >= h.version) chips.push(`<span class="pw-chip is-good">${icon("check")} Got it ${esc(niceDate(toMillis(h.ackAt)))}</span>`);
        else if ((h.viewedVersion || 0) >= h.version) chips.push(`<span class="pw-chip">${icon("eye")} Seen ${esc(niceDate(toMillis(h.viewedAt)))}</span>`);
        else chips.push(`<span class="pw-chip is-wait">Not opened yet</span>`);
        if (drafts().some(d => d.id === h.id)) chips.push(`<span class="pw-chip is-draft">${icon("edit")} Unpublished changes</span>`);
        return chips.join("");
    }

    // ---------- List ----------

    function renderList() {
        state.view = "list";
        const active = published().filter(h => h.status === "active");
        const archived = published().filter(h => h.status === "archived");
        const draftOnly = drafts().filter(d => !published().some(h => h.id === d.id));
        const own = clientOwnPlans();
        const range = h => h.startDate ? `${shortDay(h.startDate)} – ${shortDay(h.endDate)}` : "";

        container.innerHTML = `
            <div class="pw">
                <div class="pw-head">
                    <div>
                        <h2>${esc(first)}'s plans</h2>
                        <p class="clients-card-note">You build it here; ${esc(first)} sees it once you publish. Every published version is kept.</p>
                    </div>
                    <button type="button" class="sb-btn sb-btn-primary" data-act="new">${icon("plus")} New plan</button>
                </div>

                ${active.map(h => `
                    <div class="clients-card pw-plan">
                        <div class="pw-plan-main">
                            <strong>${esc(h.name)}</strong>
                            <span class="pw-meta">Version ${h.version} · published ${esc(niceDate(toMillis(h.publishedAt)))}${range(h) ? ` · ${esc(range(h))}` : ""}</span>
                            <div class="pw-chips">${statusChips(h)}</div>
                        </div>
                        <button type="button" class="sb-btn sb-btn-secondary" data-act="open" data-id="${esc(h.id)}">Open</button>
                    </div>`).join("")}

                ${draftOnly.map(d => `
                    <div class="clients-card pw-plan is-draft">
                        <div class="pw-plan-main">
                            <strong>${esc(d.name)}</strong>
                            <span class="pw-meta">Draft · not published yet · only you can see it</span>
                        </div>
                        <button type="button" class="sb-btn sb-btn-secondary" data-act="open" data-id="${esc(d.id)}">Open</button>
                    </div>`).join("")}

                ${!active.length && !draftOnly.length ? `
                    <div class="clients-card">
                        <div class="sb-empty">
                            <span class="sb-empty-icon">${icon("calendar")}</span>
                            <strong class="sb-empty-title">No plan from you yet</strong>
                            <p class="sb-empty-text">${own.length ? `${esc(first)} made a plan in their app. Take it over below to edit and publish it as yours, or start a new one.` : `Start a new plan and publish it when it's ready.`}</p>
                        </div>
                    </div>` : ""}

                ${own.length ? `
                    <h3 class="pw-subhead">Made by ${esc(first)} in their app</h3>
                    ${own.map(p => `
                        <div class="clients-card pw-plan is-own">
                            <div class="pw-plan-main">
                                <strong>${esc(p.name || (p.store === "training" ? "Training plan" : "Race plan"))}</strong>
                                <span class="pw-meta">${esc(p.store === "training" ? "Training plan" : "Race plan")} · ${esc(rangeOf(p.generatedPlan))}</span>
                            </div>
                            <button type="button" class="sb-btn sb-btn-secondary" data-act="adopt" data-store="${p.store}" data-id="${esc(p.id)}">Take over this plan</button>
                        </div>`).join("")}` : ""}

                ${archived.length ? `
                    <details class="pw-archived">
                        <summary>Archived (${archived.length})</summary>
                        ${archived.map(h => `
                            <div class="pw-plan pw-plan-archived">
                                <div class="pw-plan-main"><strong>${esc(h.name)}</strong><span class="pw-meta">Version ${h.version}</span></div>
                                <button type="button" class="sb-btn sb-btn-tertiary" data-act="restore" data-id="${esc(h.id)}">Restore</button>
                            </div>`).join("")}
                    </details>` : ""}
            </div>`;
    }

    function rangeOf(plan) {
        const { startDate, endDate } = planDateRange(plan);
        return startDate ? `${shortDay(startDate)} – ${shortDay(endDate)}` : "";
    }

    // ---------- Editor ----------

    function openEditor(planId) {
        const header = published().find(h => h.id === planId) || null;
        const draft = drafts().find(d => d.id === planId) || null;
        const base = draft?.plan || header?.plan;
        if (!base) { toast("Couldn't open that plan right now. Try again in a moment.", { type: "error" }); return; }
        state.editing = {
            planId,
            header,
            name: draft?.name || header?.name || "Training plan",
            kind: draft?.kind || header?.kind || "custom",
            plan: recalcPlannedMiles(clone(base)),
            basedOnVersion: header?.version || 0,
            adoptedFrom: draft?.adoptedFrom || header?.adoptedFrom || null,
            draftExists: Boolean(draft),
            dirty: false
        };
        renderEditor();
    }

    function startNew({ name, kind, plan, adoptedFrom = null }) {
        state.editing = {
            planId: newPlanId(), header: null, name, kind,
            plan: recalcPlannedMiles(stripRuntime(plan)), basedOnVersion: 0, adoptedFrom, draftExists: false, dirty: true
        };
        renderEditor();
    }

    function editorStatus() {
        const e = state.editing;
        if (!e.header) return `Not published yet. ${esc(first)} can't see this until you publish it.`;
        const h = e.header;
        const seen = (h.ackVersion || 0) >= h.version ? `${esc(first)} tapped "Got it" ${esc(niceDate(toMillis(h.ackAt)))}`
            : (h.viewedVersion || 0) >= h.version ? `${esc(first)} saw it ${esc(niceDate(toMillis(h.viewedAt)))}`
            : `${esc(first)} hasn't opened it yet`;
        return `Version ${h.version} published ${esc(niceDate(toMillis(h.publishedAt)))} · ${seen}.`;
    }

    function renderEditor() {
        state.view = "editor";
        const e = state.editing;
        const marks = doneMarks(e.planId);
        const today = isoDate(new Date());
        const weeks = e.plan.weeks || [];
        const currentIndex = weeks.findIndex(w => (w.days || []).some(d => d.date === today));

        container.innerHTML = `
            <div class="pw pw-editor">
                <button type="button" class="hub-back pw-back" data-act="back">${icon("chevronLeft")} All plans</button>
                <div class="pw-editor-head">
                    <label class="sr-only" for="pwName">Plan name</label>
                    <input id="pwName" class="pw-name" type="text" maxlength="120" value="${esc(e.name)}">
                    <p class="clients-card-note" data-el="status">${editorStatus()}</p>
                </div>

                <div class="pw-weeks" data-el="weeks">
                    ${weeks.map((week, wi) => `
                        <div class="clients-week${wi === currentIndex ? " is-current" : ""}" data-week="${wi}">
                            <div class="clients-week-head">
                                Week ${week.week ?? wi + 1}
                                <input class="pw-phase" type="text" maxlength="40" value="${esc(week.phase || "")}" placeholder="Phase (optional)" aria-label="Week ${wi + 1} phase" data-field="phase">
                                ${wi === currentIndex ? `<span class="clients-week-now">This week</span>` : ""}
                                <span class="clients-week-done" data-el="miles-${wi}">${week.plannedMiles || 0} mi</span>
                            </div>
                            <div class="clients-days">
                                ${(week.days || []).map((day, di) => `
                                    <div class="clients-day-row${marks.get(day.date) ? " is-done" : ""}" data-day="${di}">
                                        <span class="clients-day-label pw-day-label">${esc(shortDay(day.date).split(",")[0])}<small>${esc(shortDay(day.date).split(", ")[1] || "")}</small>${marks.get(day.date) ? ` <span class="clients-day-check" title="${esc(first)} marked this done">✓</span>` : ""}</span>
                                        <select data-field="type" class="clients-day-type" aria-label="${esc(shortDay(day.date))} type">
                                            ${[...new Set([...DAY_TYPES, day.type || "rest"])].map(t => `<option value="${esc(t)}"${t === (day.type || "rest") ? " selected" : ""}>${esc(typeLabel(t))}</option>`).join("")}
                                        </select>
                                        <input type="number" step="0.1" min="0" max="100" data-field="miles" class="clients-day-miles" value="${Number(day.miles) || 0}" aria-label="${esc(shortDay(day.date))} miles">
                                        <input type="text" maxlength="300" data-field="session" class="clients-day-session" value="${esc(day.session || "")}" placeholder="Workout details" aria-label="${esc(shortDay(day.date))} workout">
                                    </div>`).join("")}
                            </div>
                        </div>`).join("")}
                </div>
                <button type="button" class="sb-btn sb-btn-secondary pw-add-week" data-act="add-week">${icon("plus")} Add a week</button>

                <div class="pw-history" data-el="history"></div>

                <div class="pw-bar">
                    <span class="pw-dirty" data-el="dirty"${e.dirty ? "" : " hidden"}>Unsaved changes</span>
                    ${e.header && e.header.status === "active" ? `<button type="button" class="sb-btn sb-btn-tertiary" data-act="archive">Archive plan</button>` : ""}
                    ${e.draftExists && e.header ? `<button type="button" class="sb-btn sb-btn-tertiary" data-act="discard">Discard draft</button>` : ""}
                    <button type="button" class="sb-btn sb-btn-secondary" data-act="save">Save draft</button>
                    <button type="button" class="sb-btn sb-btn-primary" data-act="review">${icon("send")} Review &amp; publish</button>
                </div>
            </div>`;

        const currentBlock = container.querySelector(".clients-week.is-current");
        if (currentBlock) requestAnimationFrame(() => currentBlock.scrollIntoView({ block: "start" }));
        if (e.header) renderHistory();
    }

    async function renderHistory() {
        const el = container.querySelector('[data-el="history"]');
        if (!el) return;
        try {
            const versions = await listVersions(state.editing.planId);
            el.innerHTML = `
                <details class="pw-archived">
                    <summary>Version history (${versions.length})</summary>
                    ${versions.map(v => `
                        <div class="pw-version">
                            <strong>Version ${v.version}</strong>
                            <span class="pw-meta">${esc(niceDate(toMillis(v.publishedAt)))}</span>
                            ${v.coachNote ? `<p class="hub-quote">"${esc(v.coachNote)}"</p>` : ""}
                            ${v.changes?.length ? `<ul>${v.changes.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : `<p class="pw-meta">${v.version === 1 ? "First version." : "No day-by-day changes."}</p>`}
                        </div>`).join("")}
                </details>`;
        } catch (error) {
            console.warn("Southbound: version history unavailable.", error);
            el.innerHTML = "";
        }
    }

    function markDirty() {
        state.editing.dirty = true;
        const dirty = container.querySelector('[data-el="dirty"]');
        if (dirty) dirty.hidden = false;
    }

    // Edits go straight into the in-memory plan.
    container.addEventListener("input", event => {
        if (state.view !== "editor") return;
        const e = state.editing;
        const target = event.target;
        if (target.id === "pwName") { e.name = target.value; markDirty(); return; }
        const weekEl = target.closest("[data-week]");
        if (!weekEl) return;
        const week = e.plan.weeks[Number(weekEl.dataset.week)];
        if (target.dataset.field === "phase") { week.phase = target.value; markDirty(); return; }
        const dayEl = target.closest("[data-day]");
        if (!dayEl) return;
        const day = week.days[Number(dayEl.dataset.day)];
        const field = target.dataset.field;
        if (field === "type") {
            // Generated plans often repeat the type as the workout text
            // ("rest", "easy"); don't let that tag along to the new type.
            const stale = String(day.session || "").trim().toLowerCase();
            if (!stale || stale === String(day.type || "").toLowerCase() || stale === typeLabel(day.type).toLowerCase()) {
                day.session = "";
                const sessionInput = dayEl.querySelector('[data-field="session"]');
                if (sessionInput) sessionInput.value = "";
            }
            day.type = target.value;
        }
        else if (field === "miles") day.miles = Math.max(0, Math.min(100, Number(target.value) || 0));
        else if (field === "session") day.session = target.value;
        if (field === "type" && day.type === "rest") {
            day.miles = 0;
            const milesInput = dayEl.querySelector('[data-field="miles"]');
            if (milesInput) milesInput.value = 0;
        }
        recalcPlannedMiles(e.plan);
        const milesEl = container.querySelector(`[data-el="miles-${weekEl.dataset.week}"]`);
        if (milesEl) milesEl.textContent = `${week.plannedMiles} mi`;
        markDirty();
    });

    // ---------- Actions ----------

    container.addEventListener("click", async event => {
        const btn = event.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        try {
            if (act === "new") return newPlanDialog();
            if (act === "open") return openEditor(btn.dataset.id);
            if (act === "adopt") return adopt(btn.dataset.store, btn.dataset.id);
            if (act === "restore") {
                await setPlanArchived(btn.dataset.id, false);
                const h = published().find(x => x.id === btn.dataset.id);
                if (h) h.status = "active";
                toast(`Restored. ${first} sees it again.`);
                onChange?.();
                return renderList();
            }
            if (act === "back") {
                if (state.editing?.dirty && !(await sbConfirm("Your edits since the last save will be lost.", { title: "Leave without saving?", confirmLabel: "Leave", danger: true }))) return;
                return renderList();
            }
            if (act === "add-week") {
                state.editing.plan = recalcPlannedMiles(addWeeks(state.editing.plan, 1));
                state.editing.dirty = true;
                renderEditor();
                container.querySelector(".clients-week:last-child")?.scrollIntoView({ block: "center" });
                return;
            }
            if (act === "save") return save(btn);
            if (act === "discard") return discard();
            if (act === "archive") {
                if (!(await sbConfirm(`It comes off ${first}'s calendar. Its history is kept and you can restore it.`, { title: "Archive this plan?", confirmLabel: "Archive" }))) return;
                await setPlanArchived(state.editing.planId, true);
                state.editing.header.status = "archived";
                toast("Plan archived");
                onChange?.();
                return renderList();
            }
            if (act === "review") return review();
        } catch (error) {
            console.error("Plan workspace action failed:", error);
            toast(friendlyError(error, "do that"), { type: "error" });
        }
    });

    async function save(btn) {
        const e = state.editing;
        if (!e.name.trim()) { toast("Give the plan a name first.", { type: "info" }); return; }
        btn.disabled = true;
        try {
            const saved = await saveDraft(e.planId, {
                clientUid, name: e.name.trim(), kind: e.kind, plan: e.plan,
                basedOnVersion: e.basedOnVersion, adoptedFrom: e.adoptedFrom, isNew: !e.draftExists
            });
            const list = data.planDrafts || (data.planDrafts = []);
            const i = list.findIndex(d => d.id === e.planId);
            if (i >= 0) list[i] = saved; else list.push(saved);
            e.draftExists = true;
            e.dirty = false;
            renderEditor();
            toast(`Draft saved. Only you can see it until you publish.`);
            onChange?.();
        } finally {
            btn.disabled = false;
        }
    }

    async function discard() {
        const e = state.editing;
        if (!(await sbConfirm(`You'll be back to version ${e.header.version}, the one ${first} has.`, { title: "Discard this draft?", confirmLabel: "Discard", danger: true }))) return;
        await deleteDraft(e.planId);
        data.planDrafts = drafts().filter(d => d.id !== e.planId);
        toast("Draft discarded");
        onChange?.();
        openEditor(e.planId);
    }

    async function adopt(store, id) {
        const own = clientOwnPlans().find(p => p.id === id && p.store === store);
        if (!own) return;
        startNew({
            name: own.name || (store === "training" ? "Training plan" : "Race plan"),
            kind: store === "training" ? "training" : "race",
            plan: own.generatedPlan,
            adoptedFrom: { store, id }
        });
        toast(`Loaded ${first}'s plan. When you publish it, it becomes yours and replaces theirs.`, { type: "info" });
    }

    // ---------- Dialogs ----------

    function dialog(html) {
        const d = document.createElement("dialog");
        d.className = "sb-dialog pw-dialog";
        d.innerHTML = html;
        document.body.appendChild(d);
        d.addEventListener("close", () => d.remove());
        d.addEventListener("click", ev => { if (ev.target === d) d.close(); });
        d.showModal();
        return d;
    }

    function newPlanDialog() {
        const nextMonday = (() => {
            const dt = new Date();
            dt.setDate(dt.getDate() + ((8 - dt.getDay()) % 7 || 7));
            return isoDate(dt);
        })();
        const d = dialog(`
            <form class="sb-dialog-form">
                <h2 class="sb-dialog-title">New plan for ${esc(first)}</h2>
                <label class="pw-label">Name<input class="sb-dialog-input" name="name" maxlength="120" required placeholder="e.g. Spring 10K build"></label>
                <label class="pw-label">Starts the week of<input class="sb-dialog-input" name="start" type="date" required value="${nextMonday}"></label>
                <label class="pw-label">How many weeks<input class="sb-dialog-input" name="weeks" type="number" min="1" max="52" required value="8"></label>
                <p class="sb-dialog-message">You'll fill in the days next. Nothing is sent to ${esc(first)} until you publish.</p>
                <div class="sb-dialog-actions">
                    <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                    <button type="submit" class="sb-btn sb-btn-primary">Start plan</button>
                </div>
            </form>`);
        d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
        d.querySelector("form").addEventListener("submit", ev => {
            ev.preventDefault();
            const f = new FormData(ev.target);
            const name = String(f.get("name") || "").trim();
            const start = String(f.get("start") || "");
            const weeks = Math.max(1, Math.min(52, Number(f.get("weeks")) || 1));
            if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return;
            d.close();
            startNew({ name, kind: "custom", plan: blankPlan(start, weeks) });
        });
        d.querySelector('[name="name"]').focus();
    }

    function review() {
        const e = state.editing;
        if (!e.name.trim()) { toast("Give the plan a name first.", { type: "info" }); return; }
        const firstPublish = !e.header;
        const changes = firstPublish ? [] : previewChanges(e.header.plan, e.plan);
        const renamed = !firstPublish && e.header.name !== e.name.trim();
        if (!firstPublish && !changes.length && !renamed) {
            toast(`Nothing has changed since version ${e.header.version}.`, { type: "info" });
            return;
        }
        const lines = changeLines(changes, { limit: 30 });
        const { startDate, endDate } = planDateRange(e.plan);
        const d = dialog(`
            <form class="sb-dialog-form">
                <h2 class="sb-dialog-title">${firstPublish ? `Publish to ${esc(first)}?` : `Publish version ${e.header.version + 1}?`}</h2>
                ${firstPublish
                    ? `<p class="sb-dialog-message"><strong>${esc(e.name)}</strong>: ${e.plan.weeks.length} week${e.plan.weeks.length === 1 ? "" : "s"}, ${esc(shortDay(startDate))} – ${esc(shortDay(endDate))}.${e.adoptedFrom ? ` It replaces the plan ${esc(first)} made in their app (their done marks carry over).` : ""}</p>`
                    : `<div class="pw-changes"><p class="pw-label">What ${esc(first)} will see changed</p><ul>${renamed ? `<li>Renamed to "${esc(e.name.trim())}"</li>` : ""}${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>`}
                <label class="pw-label">A note to ${esc(first)} (optional)
                    <textarea class="sb-dialog-input" name="note" rows="3" maxlength="2000" placeholder="${firstPublish ? "Here's your plan. Start easy this week..." : "Backing off Saturday because of your fatigue this week."}"></textarea>
                </label>
                <p class="sb-dialog-message">${esc(first)} gets an email and sees it in their app with a "Got it" button.</p>
                <div class="sb-dialog-actions">
                    <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Keep editing</button>
                    <button type="submit" class="sb-btn sb-btn-primary">${icon("send")} Publish to ${esc(first)}</button>
                </div>
            </form>`);
        d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
        d.querySelector("form").addEventListener("submit", async ev => {
            ev.preventDefault();
            const btn = ev.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            try {
                const header = await publishPlan({
                    planId: e.planId, clientUid, clientName, clientEmail,
                    name: e.name.trim(), kind: e.kind, plan: e.plan,
                    coachNote: new FormData(ev.target).get("note"),
                    header: e.header, previousPlan: e.header?.plan || null, adoptedFrom: e.adoptedFrom
                });
                header.plan = recalcPlannedMiles(stripRuntime(e.plan));
                const list = data.coachingPlans || (data.coachingPlans = []);
                const i = list.findIndex(h => h.id === e.planId);
                if (i >= 0) list[i] = header; else list.push(header);
                data.planDrafts = drafts().filter(x => x.id !== e.planId);
                d.close();
                toast(`Published${header.version > 1 ? ` version ${header.version}` : ""} to ${first}. They'll get an email.`);
                state.editing.dirty = false;
                onChange?.();
                renderList();
            } catch (error) {
                console.error("Publishing failed:", error);
                btn.disabled = false;
                toast(friendlyError(error, "publish that"), { type: "error" });
            }
        });
    }

    renderList();
    return {
        openPlan: planId => openEditor(planId),
        isDirty: () => Boolean(state.editing?.dirty && state.view === "editor")
    };
}
