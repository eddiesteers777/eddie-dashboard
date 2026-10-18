/* ==========================================
   Southbound — Homework tab in the Client Hub (coach side)

   Everything assigned to one soccer client, how far along they are, the
   practices they logged, and the sheet to assign or edit one (a YouTube
   link trimmed to a clip, how often, a due date). Loads its own data
   when the tab first opens. Model: js/homeworkModel.js.
========================================== */

import { listHomeworkForClient, assignHomework, updateHomework, archiveHomework, replyToHomework, deleteHomework } from "./homework.js";
import {
    parseYouTube, parseClock, clockText, thumbUrl, CADENCES, SKILLS, progress, standing, streak, isoOf, addDays,
    cleanAssignment, validAssignment, sortForClient
} from "./homeworkModel.js";
import { esc, thumbHtml, ticksHtml, metaLine, standingPill, dueText } from "./homeworkView.js";
import { icon } from "./icons.js";
import { toast, sbConfirm, sbPrompt, friendlyError, emptyHtml } from "./ui.js";

const today = () => isoOf(new Date());

export async function mountHomework(root, { clientUid, firstName = "them" } = {}) {
    let items = [];
    let failed = false;
    root.classList.add("hw-coach");
    root.innerHTML = `<div class="clients-card"><div class="sb-loading" role="status"><span class="sr-only">Loading…</span><span class="sb-skeleton" style="width:90%"></span><span class="sb-skeleton" style="width:70%"></span></div></div>`;
    try { items = await listHomeworkForClient(clientUid); } catch (error) {
        failed = true;
        console.warn("Southbound: homework unavailable.", error);
    }

    function render() {
        if (failed) {
            root.innerHTML = `<div class="clients-card"><p class="clients-card-note">Homework can't load yet. If you just added it, publish the latest <code>firestore.rules</code> in Firebase first.</p></div>`;
            return;
        }
        const t = today();
        const active = items.filter(h => h.status !== "archived");
        const archived = items.filter(h => h.status === "archived");
        const weekly = active.filter(h => h.cadence === "weekly" || h.cadence === "daily");
        const done = weekly.reduce((n, h) => n + Math.min(progress(h, t).done, progress(h, t).target), 0);
        const target = weekly.reduce((n, h) => n + progress(h, t).target, 0);
        const run = streak(items, t);
        const nextDue = active.filter(h => !progress(h, t).complete && h.dueDate).map(h => h.dueDate).sort()[0];
        root.innerHTML = `
            <div class="hw-stats">
                <div class="hw-stat"><span class="hw-kicker">This week</span><b>${target ? `${done}<span class="hw-sub" style="font-size:20px">/${target}</span>` : "—"}</b></div>
                <div class="hw-stat"><span class="hw-kicker">Streak</span><b class="tan">${run ? `${run}d` : "—"}</b></div>
                <div class="hw-stat"><span class="hw-kicker">Next due</span><b style="font-size:26px;padding-top:6px">${nextDue ? esc(dueText(nextDue)) : "—"}</b></div>
            </div>
            <div class="hw-section"><h2>Assigned</h2><button type="button" class="sb-btn sb-btn-primary" data-new style="min-height:44px">+ Assign homework</button></div>
            ${active.length ? `<div class="hw-rows">${sortForClient(active, t).map(rowHtml).join("")}</div>` : `<div class="clients-card">${emptyHtml({ iconName: "target", title: `Nothing assigned to ${firstName} yet`, text: "Paste a YouTube link or write the drill, set how often and by when. They practice in their app and you see every one." })}</div>`}
            ${archived.length ? `<div class="hw-section"><h2>Closed</h2><span class="hw-kicker">${archived.length}</span></div><div class="hw-rows">${archived.map(rowHtml).join("")}</div>` : ""}`;
        import("./icons.js").then(m => m.hydrate());
    }

    function rowHtml(hw) {
        const t = today();
        const p = progress(hw, t);
        const logs = [...hw.logs].sort((a, b) => (b.at || 0) - (a.at || 0));
        const last = logs[0];
        return `<details class="hw-row-wrap" data-id="${esc(hw.id)}" style="border-top:1px solid var(--border)">
            <summary class="hw-row" style="border-top:0;list-style:none">
                ${thumbHtml(hw, { small: true })}
                <span class="hw-row-main"><b>${esc(hw.title)}</b><span>${esc(metaLine(hw))}${hw.dueDate ? ` · due ${esc(dueText(hw.dueDate))}` : ""}</span></span>
                <span class="hw-row-side">${p.kind === "goal" ? `<b>${p.done}</b>` : `<b>${p.done}/${p.target}</b>`}${standingPill(hw, t)}</span>
            </summary>
            <div style="padding:2px 2px 14px">
                ${ticksHtml(hw, t)}
                ${hw.note ? `<p class="hw-sub" style="margin:8px 0">Note: ${esc(hw.note)}</p>` : ""}
                ${logs.length ? `<div class="hw-history" style="margin-top:8px">${logs.slice(0, 6).map(l => `<div class="hw-practice"><span>${esc(dueText(l.date))}${l.feel ? ` · felt ${esc(l.feel)}` : ""}</span><span>${l.count != null ? esc(l.count) : ""}</span></div>`).join("")}</div>` : `<p class="hw-sub" style="margin:8px 0">No practices logged yet.</p>`}
                ${hw.coachReply ? `<p class="hw-reply">You replied: ${esc(hw.coachReply)}</p>` : ""}
                <div class="hw-coach-actions">
                    ${last ? `<button type="button" class="sb-btn sb-btn-secondary" data-reply="${esc(hw.id)}">${hw.coachReply ? "Change reply" : "Reply"}</button>` : ""}
                    <button type="button" class="sb-btn sb-btn-secondary" data-edit="${esc(hw.id)}">Edit</button>
                    <button type="button" class="sb-btn sb-btn-secondary" data-archive="${esc(hw.id)}">${hw.status === "archived" ? "Reopen" : "Close"}</button>
                    <button type="button" class="sb-btn sb-btn-tertiary" data-delete="${esc(hw.id)}" aria-label="Delete">${icon("trash")}</button>
                </div>
            </div></details>`;
    }

    root.addEventListener("click", async event => {
        const get = key => items.find(h => h.id === event.target.closest(`[data-${key}]`)?.dataset[key]);
        if (event.target.closest("[data-new]")) {
            const input = await openSheet({ firstName });
            if (!input) return;
            try {
                const created = await assignHomework(clientUid, input);
                items = [created, ...items];
                render();
                toast(`Assigned to ${firstName}`);
            } catch (error) { console.error(error); toast(friendlyError(error, "assign that"), { type: "error" }); }
            return;
        }
        const edit = get("edit");
        if (edit) {
            const input = await openSheet({ firstName, hw: edit });
            if (!input) return;
            try {
                Object.assign(edit, cleanAssignment(input));
                await updateHomework(edit.id, input);
                render();
                toast("Saved");
            } catch (error) { console.error(error); toast(friendlyError(error, "save that"), { type: "error" }); }
            return;
        }
        const reply = get("reply");
        if (reply) {
            const text = await sbPrompt(`A line ${firstName} sees on this homework.`, { title: "Reply", defaultValue: reply.coachReply || "", multiline: true, maxLength: 300, confirmLabel: "Send" });
            if (text == null) return;
            try { reply.coachReply = await replyToHomework(reply.id, text); render(); toast("Reply saved"); }
            catch (error) { console.error(error); toast(friendlyError(error, "save that"), { type: "error" }); }
            return;
        }
        const arch = get("archive");
        if (arch) {
            const closing = arch.status !== "archived";
            try { await archiveHomework(arch.id, closing); arch.status = closing ? "archived" : "active"; render(); toast(closing ? "Closed. It leaves their list." : "Reopened"); }
            catch (error) { console.error(error); toast(friendlyError(error, "do that"), { type: "error" }); }
            return;
        }
        const del = get("delete");
        if (del && await sbConfirm(`Delete "${del.title}" and the practices ${firstName} logged on it?`, { title: "Delete homework", confirmLabel: "Delete", danger: true })) {
            try { await deleteHomework(del.id); items = items.filter(h => h !== del); render(); toast("Deleted"); }
            catch (error) { console.error(error); toast(friendlyError(error, "delete that"), { type: "error" }); }
        }
    });

    render();
    return { reload: async () => { items = await listHomeworkForClient(clientUid); render(); } };
}

// ---- the assign / edit sheet ----
// Resolves to the form's values, or null when closed.
function openSheet({ firstName, hw = null }) {
    return new Promise(resolve => {
        const dialog = document.createElement("dialog");
        dialog.className = "sb-dialog hw-dialog";
        const st = {
            cadence: hw?.cadence || "weekly",
            skill: hw?.skill || "",
            videoId: hw?.videoId || ""
        };
        const due = hw ? (hw.dueDate || "") : addDays(today(), 7);
        const link = hw?.videoId ? `https://www.youtube.com/watch?v=${hw.videoId}` : "";
        dialog.innerHTML = `
            <form class="sb-dialog-form" method="dialog" novalidate>
                <div style="display:flex;justify-content:space-between;align-items:baseline"><h2 class="sb-dialog-title hw-title" style="font-size:24px">${hw ? "Edit homework" : "New homework"}</h2><span class="hw-kicker">For ${esc(firstName)}</span></div>
                <label class="hw-lbl" for="hwLink">YouTube link (optional)</label>
                <input class="sb-dialog-input" id="hwLink" type="url" inputmode="url" autocomplete="off" placeholder="youtube.com/watch?v=…" value="${esc(link)}">
                <div id="hwFound" hidden></div>
                <div class="hw-two" id="hwClip" hidden>
                    <div><label class="hw-lbl" for="hwStart">Start at</label><input class="sb-dialog-input" id="hwStart" inputmode="numeric" placeholder="1:10" value="${hw?.startSec != null ? esc(clockText(hw.startSec)) : ""}"></div>
                    <div><label class="hw-lbl" for="hwEnd">Stop at</label><input class="sb-dialog-input" id="hwEnd" inputmode="numeric" placeholder="3:40" value="${hw?.endSec != null ? esc(clockText(hw.endSec)) : ""}"></div>
                </div>
                <label class="hw-lbl" for="hwTitle">Title</label>
                <input class="sb-dialog-input" id="hwTitle" maxlength="100" placeholder="Wall passes, left foot" value="${esc(hw?.title || "")}">
                <span class="hw-lbl">Skill</span>
                <div class="hw-chips" id="hwSkills" role="group" aria-label="Skill">${SKILLS.map(s => `<button type="button" class="hw-chip" data-skill="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join("")}</div>
                <span class="hw-lbl">How often</span>
                <div class="hw-seg" id="hwCadence" role="group" aria-label="How often">${CADENCES.map(c => `<button type="button" data-cadence="${c.value}">${esc(c.label)}</button>`).join("")}</div>
                <div class="hw-two">
                    <div id="hwPerWeekBox"><label class="hw-lbl" for="hwPerWeek">Times a week</label><input class="sb-dialog-input" id="hwPerWeek" type="number" inputmode="numeric" min="1" max="7" value="${hw?.timesPerWeek || 3}"></div>
                    <div id="hwGoalBox"><label class="hw-lbl" for="hwGoal">Goal (a number)</label><input class="sb-dialog-input" id="hwGoal" type="number" inputmode="numeric" min="1" placeholder="50" value="${hw?.goal || ""}"></div>
                    <div><label class="hw-lbl" for="hwMin">Minutes</label><input class="sb-dialog-input" id="hwMin" type="number" inputmode="numeric" min="1" max="240" placeholder="10" value="${hw?.minutes || ""}"></div>
                </div>
                <label class="hw-lbl" for="hwDue">Due</label>
                <input class="sb-dialog-input" id="hwDue" type="date" value="${esc(due)}">
                <label class="hw-lbl" for="hwNote">Note for ${esc(firstName)}</label>
                <textarea class="sb-dialog-input" id="hwNote" rows="2" maxlength="1000" placeholder="Left foot only. Count the clean ones.">${esc(hw?.note || "")}</textarea>
                <p class="hw-err" id="hwErr" role="alert" hidden></p>
                <div class="sb-dialog-actions">
                    <button type="button" class="sb-btn sb-btn-tertiary" data-cancel>Cancel</button>
                    <button type="submit" class="sb-btn sb-btn-primary">${hw ? "Save" : `Assign to ${esc(firstName)}`}</button>
                </div>
            </form>`;
        document.body.appendChild(dialog);
        const $ = id => dialog.querySelector(`#${id}`);

        const sync = () => {
            dialog.querySelectorAll("[data-cadence]").forEach(b => b.classList.toggle("on", b.dataset.cadence === st.cadence));
            dialog.querySelectorAll("[data-skill]").forEach(b => { const on = b.dataset.skill === st.skill; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
            $("hwPerWeekBox").hidden = st.cadence !== "weekly";
            $("hwGoalBox").hidden = st.cadence !== "goal";
        };
        const showVideo = () => {
            const id = parseYouTube($("hwLink").value);
            st.videoId = id;
            $("hwClip").hidden = !id;
            const found = $("hwFound");
            found.hidden = !id;
            if (id) {
                found.className = "hw-found";
                found.innerHTML = `<span class="hw-thumb small"><img src="${esc(thumbUrl(id))}" alt=""><span class="hw-play"><i></i></span></span><span class="hw-sub" style="align-self:center">Video found. Set a start and stop to show only the part that matters.</span>`;
            }
        };
        dialog.addEventListener("click", event => {
            const c = event.target.closest("[data-cadence]");
            if (c) { st.cadence = c.dataset.cadence; sync(); return; }
            const s = event.target.closest("[data-skill]");
            if (s) { st.skill = st.skill === s.dataset.skill ? "" : s.dataset.skill; sync(); if (!$("hwTitle").value.trim() && st.skill) $("hwTitle").placeholder = `${st.skill} drill`; return; }
            if (event.target.closest("[data-cancel]")) dialog.close("cancel");
        });
        $("hwLink").addEventListener("input", showVideo);
        $("hwLink").addEventListener("change", async () => {
            // Fill the title from YouTube when it's still empty (best effort; no key needed).
            const id = parseYouTube($("hwLink").value);
            if (!id || $("hwTitle").value.trim()) return;
            try {
                const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
                const data = res.ok ? await res.json() : null;
                if (data?.title && !$("hwTitle").value.trim()) $("hwTitle").value = String(data.title).slice(0, 100);
            } catch { /* offline or blocked: they type it */ }
        });
        dialog.querySelector("form").addEventListener("submit", event => {
            event.preventDefault();
            const startRaw = $("hwStart").value.trim(), endRaw = $("hwEnd").value.trim();
            const err = $("hwErr");
            const fail = text => { err.textContent = text; err.hidden = false; };
            if ($("hwLink").value.trim() && !st.videoId) return fail("That doesn't look like a YouTube link.");
            const start = parseClock(startRaw), end = parseClock(endRaw);
            if ((startRaw && start == null) || (endRaw && end == null)) return fail("Write times like 1:10.");
            if (start != null && end != null && end <= start) return fail("Stop must be after start.");
            const values = {
                title: $("hwTitle").value, skill: st.skill, note: $("hwNote").value,
                videoUrl: st.videoId ? `https://www.youtube.com/watch?v=${st.videoId}` : "", startSec: start, endSec: end,
                cadence: st.cadence, timesPerWeek: Number($("hwPerWeek").value), minutes: $("hwMin").value ? Number($("hwMin").value) : null,
                goal: $("hwGoal").value ? Number($("hwGoal").value) : null, dueDate: $("hwDue").value || null
            };
            const problem = validAssignment(cleanAssignment(values));
            if (problem) return fail(problem);
            dialog.close("ok");
            resolve(values);
        });
        dialog.addEventListener("close", () => { dialog.remove(); resolve(null); });
        sync(); showVideo();
        dialog.showModal();
        $("hwLink").focus();
    });
}
