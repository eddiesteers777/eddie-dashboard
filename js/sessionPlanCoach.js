/* ==========================================
   Southbound — attach a practice plan to a session (the coach's dialog)

   Opens from a booked session on the coach's Schedule. Plans come from the
   Playbook practice planner (saved on this device, synced with the account).
   Players see drill names, times, what to bring and the focus; nothing else.
========================================== */

import { savePlan, deletePlan } from "./sessionPlans.js";
import { linesFromPractice, parseLine, totalMinutes, cleanPlan } from "./sessionPlanModel.js";
import { toast, friendlyError, sbConfirm } from "./ui.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Saved Playbook practices and drills (pull the account copy first, but never wait long).
export async function loadPlaybook() {
    try { const cloud = await import("./playbook/cloud.js"); await Promise.race([cloud.startSync({ timeoutMs: 2500 }), new Promise(r => setTimeout(r, 3000))]); } catch { /* signed out or offline: use this device */ }
    const [{ KEYS }, P, D, { SEED_DRILLS }] = await Promise.all([import("./playbook/store.js"), import("./playbook/practiceModel.js"), import("./playbook/drillModel.js"), import("./playbook/drillSeed.js")]);
    const get = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
    const mine = D.parseDrills(get(KEYS.drills));
    // Include starter drills the library doesn't have yet (for suggestions); nothing is saved.
    const drills = D.mergeSeeds(mine || [], SEED_DRILLS);
    // A name-free diagram token for a drill's saved board (or "" when none / too big).
    const diagram = async boardId => {
        try {
            const [{ loadLibrary }, { diagramToken }] = await Promise.all([import("./playbook/boardLibrary.js"), import("./playbook/drillHomework.js")]);
            const found = loadLibrary(get(KEYS.library)).boards.find(b => b.id === boardId);
            return found ? await diagramToken(found.board) : "";
        } catch { return ""; }
    };
    return { practices: P.parsePracticeList(get(KEYS.practices)).sort((a, b) => b.updatedAt - a.updatedAt), drills: new Map(drills.map(d => [d.id, d])), P, diagram };
}

/**
 * session: { key, date, startTime, clientUids, label }, existing: the saved plan or null.
 * Resolves to "saved", "removed" or "".
 */
export async function openPlanDialog({ session, existing = null }) {
    const pb = await loadPlaybook();
    return new Promise(resolve => {
        const dialog = document.createElement("dialog");
        dialog.className = "sb-dialog sp-dialog";
        const st = { mode: existing?.mode || "plan", pick: "", lines: existing?.lines || [], bring: existing?.bring || "" };
        const dateText = new Date(`${session.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        dialog.innerHTML = `
            <form class="sb-dialog-form" method="dialog" novalidate>
                <div><h2 class="sb-dialog-title" style="font-size:24px">${existing ? "Session plan" : "Attach a plan"}</h2><span class="sp-sub">${esc(dateText)} · ${esc(session.timeText || "")} · ${session.clientUids.length} booked</span></div>
                <label class="sp-lbl" for="spTitle">Name</label>
                <input class="sb-dialog-input" id="spTitle" maxlength="80" value="${esc(existing?.title || session.label || "Group session")}">
                <span class="sp-lbl">What players see</span>
                <div class="sp-seg" id="spMode" role="group"><button type="button" data-mode="plan">Plan and times</button><button type="button" data-mode="focus">Just the focus</button></div>
                <div id="spPlanBox">
                    <label class="sp-lbl" for="spPick">Practice plan from your Playbook</label>
                    <select class="sb-dialog-input" id="spPick"><option value="">${pb.practices.length ? "Choose a plan…" : "No saved plans yet"}</option>${pb.practices.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.practice.items.length} drills</option>`).join("")}</select>
                    <p class="sp-hint" id="spNone" ${pb.practices.length ? "hidden" : ""}>Build and save one in the <a href="playbook-practice.html">Practice planner</a> first.</p>
                    <ol class="sp-lines" id="spLines"></ol>
                </div>
                <label class="sp-lbl" for="spFocus">Focus (one line)</label>
                <input class="sb-dialog-input" id="spFocus" maxlength="200" placeholder="Passing under pressure" value="${esc(existing?.focus || "")}">
                <label class="sp-lbl" for="spBring">What to bring</label>
                <input class="sb-dialog-input" id="spBring" maxlength="200" placeholder="Ball, water, shin guards" value="${esc(existing?.bring || "")}">
                <p class="sp-hint">Players only see drill names, times, what to bring and the focus. Private notes stay in your Playbook.</p>
                <p class="sp-err" id="spErr" role="alert" hidden></p>
                <div class="sb-dialog-actions">
                    ${existing ? `<button type="button" class="sb-btn sb-btn-tertiary" data-remove>Remove plan</button>` : ""}
                    <button type="button" class="sb-btn sb-btn-tertiary" data-cancel>Cancel</button>
                    <button type="submit" class="sb-btn sb-btn-primary">${existing ? "Save" : "Attach to this session"}</button>
                </div>
            </form>`;
        document.body.appendChild(dialog);
        const $ = id => dialog.querySelector(`#${id}`);
        const showLines = () => {
            $("spLines").innerHTML = st.lines.map(l => { const p = parseLine(l); return `<li><span>${esc(p.time)}</span><b>${esc(p.name)}</b><span>${esc(p.mins)}</span></li>`; }).join("");
        };
        const sync = () => {
            dialog.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === st.mode));
            $("spPlanBox").hidden = st.mode !== "plan";
        };
        sync(); showLines();
        dialog.addEventListener("click", async event => {
            const m = event.target.closest("[data-mode]");
            if (m) { st.mode = m.dataset.mode; sync(); return; }
            if (event.target.closest("[data-cancel]")) { dialog.close(); return; }
            if (event.target.closest("[data-remove]")) {
                if (!(await sbConfirm("Players booked on this session will no longer see it.", { title: "Remove this plan?", confirmLabel: "Remove", danger: true }))) return;
                try { await deletePlan(session.key, session.date); toast("Plan removed"); dialog.dataset.result = "removed"; dialog.close(); } catch (error) { toast(friendlyError(error, "remove that plan"), "error"); }
            }
        });
        $("spPick").addEventListener("change", () => {
            const found = pb.practices.find(p => p.id === $("spPick").value);
            if (!found) return;
            st.lines = linesFromPractice(found.practice, pb.drills, session.startTime);
            const equip = pb.P.planEquipment(found.practice.items, pb.drills);
            if (!$("spBring").value.trim() && equip.length) $("spBring").value = equip.join(", ").slice(0, 200);
            if ($("spTitle").value === "Group session" || !$("spTitle").value.trim()) $("spTitle").value = found.name;
            showLines();
        });
        dialog.querySelector("form").addEventListener("submit", async event => {
            event.preventDefault();
            const err = $("spErr"); err.hidden = true;
            const input = { key: session.key, date: session.date, startTime: session.startTime, title: $("spTitle").value, mode: st.mode, focus: $("spFocus").value, lines: st.lines, bring: $("spBring").value, clientUids: session.clientUids };
            const plan = cleanPlan(input);
            if (plan.mode === "plan" && !plan.lines.length) { err.textContent = "Pick a plan, or switch to Just the focus."; err.hidden = false; return; }
            const submit = dialog.querySelector("[type=submit]"); submit.disabled = true;
            try { await savePlan(input); toast("Plan attached"); dialog.dataset.result = "saved"; dialog.close(); }
            catch (error) { submit.disabled = false; err.textContent = friendlyError(error, "attach that plan"); err.hidden = false; }
        });
        dialog.addEventListener("close", () => { const r = dialog.dataset.result || ""; dialog.remove(); resolve(r); });
        dialog.showModal();
    });
}
export { totalMinutes };
