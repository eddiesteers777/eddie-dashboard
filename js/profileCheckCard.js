/* ==========================================
   Southbound — "Still right?" card

   One small question that keeps the client profile current (which one,
   and when, is js/profileChecks.js). Put an element on the page and this
   module fills it for clients:

     <section id="profileCheck" data-back="index.html" hidden></section>    Today
     <div id="profileCheck" data-back="checkin.html" data-any-time hidden>  weekly check-in

   Answers: "Yes, still right" stamps the answer as confirmed; one-tap
   answers ("It's gone now", "Use 26 mi") save straight away; "Update"
   opens just that question in the guided profile
   (profile.html?ask=…&back=…) and comes back here. "Not now" hides that
   question for a week. The cadence lives in the person's own
   cloud-synced "profile-checks".
========================================== */

import { waitForUser } from "./auth.js";
import { getMyClientRecord, saveClientRecord, confirmClientFields, clientRecordRef } from "./clientRecords.js";
import { listMyResults } from "./workoutResults.js";
import { listMyCheckins } from "./checkins.js";
import { profileChecks, pickCheck, afterAnswer, recentPain, STATE_KEY, TRACKED } from "./profileChecks.js";
import { recentWeeklyMiles } from "./intakeFlow.js";
import { settleWrite } from "./offlineWrite.js";
import { cachedRole } from "./role.js";
import { icon } from "./icons.js";
import { toast } from "./ui.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const readJson = key => {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
};

export const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// About how many miles a week they've run lately, from this device's COROS
// history and Running Log (both cloud-synced).
export function deviceMilesSuggestion() {
    const coros = readJson("coros-run-history");
    const log = readJson("running-log");
    return recentWeeklyMiles({
        corosRuns: Object.values(coros?.runs || {}),
        logEntries: Array.isArray(log?.entries) ? log.entries : []
    }, todayIso());
}

function saveState(state) {
    try {
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
        import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
    } catch { /* storage blocked: it just asks again */ }
}

export async function mountProfileCheck(el) {
    if (!el || cachedRole() === "coach") return;
    const user = await waitForUser();
    if (!user) return;

    // Coming back from a quick update.
    try {
        if (sessionStorage.getItem("sb-profile-updated")) {
            sessionStorage.removeItem("sb-profile-updated");
            toast("Profile updated. Your coach can see it now.");
        }
    } catch { /* fine */ }

    const [record, results, checkins] = await Promise.all([
        getMyClientRecord().catch(() => null),
        listMyResults().catch(() => []),
        listMyCheckins().catch(() => [])
    ]);
    if (!record) return;

    const now = Date.now();
    const today = todayIso();
    const checks = profileChecks(record, {
        today, now,
        pain: recentPain({ results, checkins }, today),
        suggestion: deviceMilesSuggestion()
    });
    const check = pickCheck(checks, readJson(STATE_KEY) || {}, now, { anyTime: "anyTime" in el.dataset });
    if (!check) { el.hidden = true; return; }

    const back = el.dataset.back || "index.html";
    el.classList.add("sb-pcheck");
    el.setAttribute("aria-label", "A quick question for your profile");
    el.innerHTML = `
        <div class="sb-pcheck-eyebrow">${icon("user")} Quick check · your profile</div>
        <h3 class="sb-pcheck-title">${esc(check.title)}</h3>
        <p class="sb-pcheck-detail">${esc(check.detail)}</p>
        <div class="sb-pcheck-actions">
            ${check.actions.map((a, i) => `<button type="button" class="sb-btn ${a.primary ? "sb-btn-primary" : "sb-btn-secondary"}" data-i="${i}">${esc(a.label)}</button>`).join("")}
            <button type="button" class="sb-btn sb-btn-tertiary" data-later>Not now</button>
        </div>
        <p class="sb-pcheck-status" role="status" aria-live="polite"></p>`;
    el.hidden = false;

    const status = el.querySelector(".sb-pcheck-status");
    const finish = message => {
        el.querySelector(".sb-pcheck-actions").hidden = true;
        el.querySelector(".sb-pcheck-detail").hidden = true;
        el.querySelector(".sb-pcheck-title").textContent = message;
        status.textContent = "";
        setTimeout(() => { el.hidden = true; }, 2600);
    };

    el.addEventListener("click", async event => {
        const button = event.target.closest("button");
        if (!button || button.disabled) return;

        if ("later" in button.dataset) {
            saveState(afterAnswer(readJson(STATE_KEY) || {}, check, Date.now(), { snooze: true }));
            el.hidden = true;
            return;
        }

        const action = check.actions[Number(button.dataset.i)];
        if (!action) return;
        saveState(afterAnswer(readJson(STATE_KEY) || {}, check, Date.now()));

        if (action.act === "ask") {
            location.href = `profile.html?ask=${action.steps.join(",")}&back=${encodeURIComponent(back)}`;
            return;
        }

        el.querySelectorAll("button").forEach(b => { b.disabled = true; });
        status.textContent = "Saving…";
        try {
            let outcome;
            if (action.act === "confirm") {
                const { write, ref } = await confirmClientFields(user.uid, action.keys, record);
                outcome = await settleWrite(write, "Your profile", ref);
            } else {
                const confirm = Object.keys(action.values).filter(k => TRACKED.includes(k));
                outcome = await settleWrite(saveClientRecord(user.uid, { ...record, ...action.values }, record, { confirm }), "Your profile", clientRecordRef(user.uid));
            }
            finish(outcome?.queued ? "Saved on this phone — it'll reach your coach when you're back online." : "Thanks — your coach has it.");
        } catch (error) {
            console.error("Southbound: couldn't save the profile check.", error);
            status.textContent = "Couldn't save that. Check your connection and try again.";
            el.querySelectorAll("button").forEach(b => { b.disabled = false; });
        }
    });
}

mountProfileCheck(document.getElementById("profileCheck")).catch(error => console.warn("Southbound: profile check skipped.", error));
