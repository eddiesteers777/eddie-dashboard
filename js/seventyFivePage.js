// 75-day challenge tracker (75.html): the page. The rules and maths are in js/seventyFive.js (tested);
// account sync is js/seventyFiveCloud.js. Works with no account. Signed in, the page wears the app's
// own navigation (same switch the Free tools page uses) and the challenge follows the account.
import {
    PRESETS, TOTAL_DAYS, MAX_TASKS, dateKey, addDays, newChallenge, cleanTasks, toggleTask, missedDay, restart, fixDay,
    summary, tickStates, shareLine, doneCount
} from "./seventyFive.js";
import { readLocal, writeLocal, startSync, syncNow, signIn } from "./seventyFiveCloud.js";
import { suggestIcons } from "./habitIconSet.js";

const html = document.documentElement;
const root = document.getElementById("sfApp");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const niceDate = key => new Date(key + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

let state = readLocal();
let signedIn = false;
let syncText = "";
let draft = { preset: "hard", offset: 0, custom: [""], strict: true };

// ---- shell: public header signed out, the app's navigation signed in -----------------------
async function chooseShell() {
    let app = html.classList.contains("sf-app");
    if (app) {
        try {
            const { waitForUser } = await import("./auth.js");
            if (!(await waitForUser())) app = false;
        } catch { /* offline: the sentinel says signed in, so stay in the app */ }
    }
    if (!app) {
        html.classList.remove("sf-app");
        import("./loadPublicHeader.js");
        return;
    }
    document.body.classList.remove("pub-body");
    document.body.classList.add("sf-in-app");
    document.querySelectorAll("[data-public-only]").forEach(el => el.remove());
    document.getElementById("main").classList.add("container");
    const mount = document.createElement("div");
    mount.id = "header";
    document.body.prepend(mount);
    for (const src of ["js/loadHeader.js", "js/registerSW.js"]) {
        const s = document.createElement("script");
        s.src = src;
        document.body.append(s);
    }
}

// ---- the dial -----------------------------------------------------------------------------
function arcPath(r, a0, a1) {
    const p = a => [200 + r * Math.cos(a * Math.PI / 180), 200 + r * Math.sin(a * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function dialSvg(s, today, ticks, tasks, marks) {
    let g = "";
    ticks.forEach((st, i) => {
        const a = (-90 + i * 360 / TOTAL_DAYS) * Math.PI / 180, now = st === "now";
        const r1 = now ? 160 : 170;
        const col = st === "done" ? "var(--sage)" : now ? "var(--primary)" : st === "missed" ? "color-mix(in srgb, var(--red) 55%, transparent)" : "color-mix(in srgb, var(--text) 20%, transparent)";
        g += `<line class="sf-tk" data-n="${i + 1}" style="--i:${i + 1}" x1="${(200 + r1 * Math.cos(a)).toFixed(1)}" y1="${(200 + r1 * Math.sin(a)).toFixed(1)}" x2="${(200 + 190 * Math.cos(a)).toFixed(1)}" y2="${(200 + 190 * Math.sin(a)).toFixed(1)}" stroke="${col}" stroke-width="${now ? 5 : 3.2}" stroke-linecap="round"/>`;
    });
    const n = Math.max(1, tasks.length), seg = 360 / n, gap = n === 1 ? 0 : Math.min(10, seg / 4);
    tasks.forEach((t, i) => {
        const d = n === 1 ? `${arcPath(132, -90, 89.9)}` : arcPath(132, -90 + i * seg + gap / 2, -90 + (i + 1) * seg - gap / 2);
        g += `<path class="sf-arc bg" d="${d}"/><path class="sf-arc fg${marks[t.id] ? " on" : ""}" data-task="${esc(t.id)}" pathLength="100" d="${d}"/>`;
    });
    let top, mid, low;
    if (!s) { top = ""; mid = "75"; low = "DAYS TO GO"; }
    else if (s.notStarted) { top = "STARTS"; mid = "D1"; low = niceDate(state.start).toUpperCase(); }
    else if (s.over) { top = s.complete ? "DONE" : "OVER"; mid = "75"; low = s.complete ? "ALL 75 DAYS" : `${s.streak} IN A ROW`; }
    else { top = "DAY"; mid = String(s.day); low = s.todayComplete ? "DAY COMPLETE" : `${s.done} OF ${s.total} DONE TODAY`; }
    const midFill = !s ? "var(--text)" : "var(--primary)";
    g += top ? `<text class="lab" x="200" y="146" text-anchor="middle" font-size="12">${top}</text>` : "";
    g += `<text id="sfNum" class="c" x="200" y="${top ? 236 : 222}" text-anchor="middle" font-size="${mid.length > 2 ? 80 : 96}" fill="${midFill}">${mid}</text>`;
    g += `<text id="sfLow" class="lab" x="200" y="${top ? 262 : 256}" text-anchor="middle" font-size="12" letter-spacing="3">${esc(low)}</text>`;
    const label = s ? `Day ${s.day} of 75, ${s.done} of ${s.total} done today` : "75 days to go";
    return `<svg class="sf-dial" viewBox="0 0 400 400" role="img" aria-label="${label}">${g}</svg>`;
}

// ---- setup (no challenge yet) -------------------------------------------------------------
function renderSetup() {
    const today = dateKey();
    const start = addDays(today, draft.offset);
    const custom = draft.preset === "custom";
    const opts = Object.values(PRESETS).map(p => `<button type="button" class="sf-opt" role="radio" aria-checked="${draft.preset === p.id}" data-preset="${p.id}"><b>${p.label}</b><span>${esc(p.blurb)}</span></button>`).join("");
    const rows = custom ? `<div class="sf-custom" id="sfCustom">${draft.custom.map((v, i) => `<label><input type="text" maxlength="48" value="${esc(v)}" placeholder="Task ${i + 1}" aria-label="Task ${i + 1}" data-ci="${i}"><button type="button" data-rm="${i}" aria-label="Remove task ${i + 1}">&times;</button></label>`).join("")}${draft.custom.length < MAX_TASKS ? `<button type="button" class="sf-btn" id="sfAdd">Add a task</button>` : ""}</div>` : "";
    const canStart = !custom || cleanTasks(draft.custom.map(name => ({ name }))).length > 0;
    root.innerHTML = `
        <div class="sf-two">
            <div>
                <p class="sf-kick">Free tool &middot; <b>75-day challenge</b></p>
                <p class="sf-h" role="presentation">75 days.<br>One list.<br>Every day.</p>
                <p class="sf-lead">A free tracker for 75 Hard, 75 Soft or your own list. No account. No ads.</p>
                ${dialSvg(null, today, Array(TOTAL_DAYS).fill("ahead"), previewTasks(), {})}
            </div>
            <div class="sf-panel">
                <p class="sf-kick">Step 1 &middot; Pick your rules</p>
                <div role="radiogroup" aria-label="Rules">${opts}</div>
                ${rows}
                <p class="sf-kick" style="margin-top:14px">Step 2 &middot; Day 1</p>
                <div class="sf-seg" role="group" aria-label="Start day">
                    <button type="button" class="sf-chip" aria-pressed="${draft.offset === 0}" data-offset="0">Today</button>
                    <button type="button" class="sf-chip" aria-pressed="${draft.offset === 1}" data-offset="1">Tomorrow</button>
                </div>
                <p class="sf-note" style="margin:0 0 14px">Starts ${niceDate(start)}.</p>
                <button type="button" class="sf-btn p w" id="sfStart" ${canStart ? "" : "disabled"}>Start day 1</button>
                <p class="sf-note">${saveNote()}</p>
            </div>
        </div>`;
    root.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { draft.preset = b.dataset.preset; renderSetup(); }));
    root.querySelectorAll("[data-offset]").forEach(b => b.addEventListener("click", () => { draft.offset = Number(b.dataset.offset); renderSetup(); }));
    root.querySelector("#sfAdd")?.addEventListener("click", () => { draft.custom.push(""); renderSetup(); root.querySelector(`[data-ci="${draft.custom.length - 1}"]`)?.focus(); });
    root.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => { draft.custom.splice(Number(b.dataset.rm), 1); if (!draft.custom.length) draft.custom = [""]; renderSetup(); }));
    root.querySelectorAll("[data-ci]").forEach(inp => inp.addEventListener("input", () => { draft.custom[Number(inp.dataset.ci)] = inp.value; root.querySelector("#sfStart").disabled = !cleanTasks(draft.custom.map(name => ({ name }))).length; }));
    root.querySelector("#sfStart").addEventListener("click", startChallenge);
    root.querySelector("[data-signin]")?.addEventListener("click", () => signIn().catch(() => {}));
}

function previewTasks() {
    const t = draft.preset === "custom" ? cleanTasks(draft.custom.map(name => ({ name }))) : PRESETS[draft.preset].tasks.map((x, i) => ({ ...x, id: "p" + i }));
    return t.length ? t : [{ id: "x" }];
}

function startChallenge() {
    const today = dateKey();
    const tasks = draft.preset === "custom"
        ? cleanTasks(draft.custom.map(name => ({ name, icon: suggestIcons(name, 1)[0] || "check" })))
        : null;
    const made = newChallenge({ preset: draft.preset, tasks, start: addDays(today, draft.offset), strict: draft.strict });
    if (!made) return;
    state = made;
    save();
    renderTracker();
}

// ---- the tracker --------------------------------------------------------------------------
function saveNote() {
    if (signedIn) return syncText || "Saved to your account.";
    return `Saved on this phone. <button type="button" data-signin>Sign in</button> to keep it on every device.`;
}

function save() {
    writeLocal(state);
    if (signedIn) syncNow();
}

function statusLine(s) {
    if (s.notStarted) return `Day 1 is ${niceDate(state.start)}. Nothing to do yet.`;
    if (s.over) return s.complete ? "All 75 days. Done." : "The 75 days are over.";
    if (s.todayComplete) return `Day ${s.day} done. See you tomorrow.`;
    const left = s.total - s.done, names = state.tasks.filter(t => !(state.log[dateKey()] || {})[t.id]).map(t => t.name);
    return `${left === 1 ? "One left" : left + " left"}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? "…" : "."}`;
}

function renderTracker() {
    if (!state) return renderSetup();
    const today = dateKey();
    const s = summary(state, today);
    const missed = missedDay(state, today);
    const marks = state.log[today] || {};
    const live = !s.notStarted && !s.over;
    const pills = state.tasks.map(t => `<button type="button" class="sf-pill" data-task="${esc(t.id)}" aria-pressed="${Boolean(marks[t.id])}" ${live ? "" : "disabled"}><i></i><span>${esc(t.name)}${t.sub ? `<small>${esc(t.sub)}</small>` : ""}</span></button>`).join("");
    const alert = missed ? `
        <div class="sf-alert" role="alert"><b>${missed === addDays(today, -1) ? "Yesterday" : niceDate(missed)} wasn't finished.</b>
            <p>${esc(state.tasks.find(t => !(state.log[missed] || {})[t.id])?.name || "A task")} was left open. Under these rules that means day 1 again.</p>
            <div class="row"><button type="button" class="sf-btn p" id="sfRestart">Start again at day 1</button><button type="button" class="sf-btn" id="sfFix">I did it, fix that day</button></div></div>` : "";
    const stat = s => `<div class="sf-stats"><div><div class="n" id="sfStreak">${s.streak}</div><div class="l">Days in a row</div></div><div><div class="n">${s.toGo}</div><div class="l">To go</div></div><div><div class="n">${s.attempt}</div><div class="l">Attempt</div></div></div>`;
    root.innerHTML = `
        ${alert}
        <div class="sf-two">
            <div>${dialSvg(s, today, tickStates(state, today), state.tasks, marks)}</div>
            <div>
                <p class="sf-kick">${esc(PRESETS[state.preset]?.label || "75-day challenge")} &middot; <b>${live ? "Today &middot; " + niceDate(today) : "Attempt " + s.attempt}</b></p>
                <p class="sf-status" id="sfStatus">${esc(statusLine(s))}</p>
                <div class="sf-pills" id="sfPills">${pills}</div>
                <div class="sf-actions"><button type="button" class="sf-btn p" id="sfShare">Share my progress</button>${s.over ? `<button type="button" class="sf-btn" id="sfAgain">Start another</button>` : `<button type="button" class="sf-btn" id="sfRemind">Daily reminder</button>`}</div>
                ${stat(s)}
                <div class="sf-tools">
                    <button type="button" id="sfStrict">${state.strict ? "Strict: a missed day means day 1" : "Relaxed: a missed day only breaks the streak"}</button>
                    <button type="button" id="sfReset">Start over</button>
                    <span class="sf-sync" id="sfSync">${signedIn ? esc(syncText) : ""}</span>
                </div>
                ${signedIn ? "" : `<p class="sf-note">${saveNote()}</p>`}
            </div>
        </div>`;
    wireTracker();
}

function wireTracker() {
    root.querySelector("#sfPills").addEventListener("click", e => { const b = e.target.closest("[data-task]"); if (b && !b.disabled) tap(b.dataset.task); });
    root.querySelector("#sfRestart")?.addEventListener("click", () => { state = restart(state, dateKey()); save(); renderTracker(); });
    root.querySelector("#sfFix")?.addEventListener("click", () => { state = fixDay(state, missedDay(state, dateKey())); save(); renderTracker(); });
    root.querySelector("#sfAgain")?.addEventListener("click", () => { state = null; writeLocal(null); if (signedIn) syncNow(); draft = { preset: "hard", offset: 0, custom: [""], strict: true }; renderSetup(); });
    root.querySelector("#sfShare").addEventListener("click", shareCard);
    root.querySelector("#sfRemind")?.addEventListener("click", reminder);
    root.querySelector("#sfStrict").addEventListener("click", () => { state = { ...state, strict: !state.strict, updatedAt: Date.now() }; save(); renderTracker(); });
    root.querySelector("#sfReset").addEventListener("click", async () => {
        const { sbConfirm } = await import("./ui.js");
        if (!(await sbConfirm("This clears your challenge and every tick. You can't get it back.", { title: "Start over?", confirmLabel: "Clear it", danger: true }))) return;
        state = null; writeLocal(null); if (signedIn) syncNow();
        draft = { preset: "hard", offset: 0, custom: [""], strict: true };
        renderSetup();
    });
    root.querySelector("[data-signin]")?.addEventListener("click", () => signIn().catch(() => {}));
}

// A tick: update the dial in place so the arc draws in, then play the moment for the task's family.
async function tap(taskId) {
    const today = dateKey();
    const was = Boolean((state.log[today] || {})[taskId]);
    state = toggleTask(state, today, taskId);
    save();
    const s = summary(state, today), marks = state.log[today] || {}, now = !was;
    const pill = root.querySelector(`.sf-pill[data-task="${CSS.escape(taskId)}"]`);
    pill?.setAttribute("aria-pressed", String(now));
    const arc = root.querySelector(`.sf-arc.fg[data-task="${CSS.escape(taskId)}"]`);
    if (arc) { arc.classList.toggle("on", now); arc.classList.remove("flash"); if (now && !reduced()) { void arc.getBoundingClientRect(); arc.classList.add("flash"); } }
    root.querySelector("#sfLow").textContent = s.todayComplete ? "DAY COMPLETE" : `${doneCount(state, today)} OF ${s.total} DONE TODAY`;
    root.querySelector("#sfStatus").textContent = statusLine(s);
    root.querySelector("#sfStreak").textContent = s.streak;
    const tick = root.querySelector(`.sf-tk[data-n="${s.day}"]`);
    if (tick) tick.setAttribute("stroke", s.todayComplete ? "var(--sage)" : "var(--primary)");
    if (!now) return;
    const t = state.tasks.find(x => x.id === taskId);
    try {
        const { celebrateHabit } = await import("./celebrate.js");
        celebrateHabit({ name: t.name, icon: "hb:" + t.icon }, { allDone: s.todayComplete, noun: "Task" });
    } catch { /* the tick already says done */ }
    if (s.todayComplete && !reduced()) {
        root.querySelectorAll(".sf-tk").forEach(l => { if (+l.dataset.n <= s.day) { l.classList.remove("wave"); void l.getBoundingClientRect(); l.classList.add("wave"); } });
        const num = root.querySelector("#sfNum");
        num?.classList.remove("sf-pop"); void num?.getBoundingClientRect(); num?.classList.add("sf-pop");
    }
}

// ---- share card and reminder --------------------------------------------------------------
async function shareCard() {
    const today = dateKey(), s = summary(state, today), ticks = tickStates(state, today);
    const css = n => getComputedStyle(html).getPropertyValue(n).trim();
    const display = css("--font-display"), mono = css("--font-mono"), body = css("--font-body");
    try { await Promise.all([document.fonts.load(`900 100px ${display}`), document.fonts.load(`600 24px ${mono}`), document.fonts.load(`400 30px ${body}`)]); } catch { /* fall back to the stack */ }
    const W = 1080, H = 1350, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = css("--forest") || "#173226"; g.fillRect(0, 0, W, H);
    g.textBaseline = "alphabetic";
    g.fillStyle = css("--sage"); g.font = `600 30px ${mono}`;
    g.fillText(`${(PRESETS[state.preset]?.label || "75-DAY CHALLENGE").toUpperCase()}  ·  ATTEMPT ${s.attempt}`, 80, 130);
    g.fillStyle = css("--text"); g.font = `900 300px ${display}`;
    g.fillText(s.complete ? "DONE" : s.notStarted ? "DAY 1" : "DAY", 80, 420);
    g.fillStyle = css("--primary"); g.font = `900 420px ${display}`;
    g.fillText(s.complete ? "75" : s.notStarted ? "" : String(s.day), 80, 790);
    g.fillStyle = css("--text-secondary"); g.font = `400 40px ${body}`;
    g.fillText(s.complete ? "All 75 days finished." : s.notStarted ? `Starts ${niceDate(state.start)}.` : `${s.streak} ${s.streak === 1 ? "day" : "days"} in a row.`, 80, 870);
    const cols = 15, size = 50, gap = 12;
    ticks.forEach((st, i) => {
        const x = 80 + (i % cols) * (size + gap), y = 940 + Math.floor(i / cols) * (size + gap);
        g.fillStyle = st === "done" ? css("--sage") : st === "now" ? css("--primary") : st === "missed" ? "rgba(210,122,98,.55)" : "rgba(242,237,225,.1)";
        g.beginPath(); g.roundRect(x, y, size, size, 8); g.fill();
    });
    g.fillStyle = css("--text"); g.font = `600 30px ${mono}`;
    g.fillText("SOUTHBOUND", 80, 1290);
    g.fillStyle = css("--muted"); g.font = `500 30px ${mono}`;
    g.textAlign = "right"; g.fillText("southboundcoaching.com/75.html", W - 80, 1290);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], "75-day-progress.png", { type: "image/png" });
    try {
        if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: shareLine(state, today) }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    (await import("./ui.js")).toast("Saved the picture.");
}

async function reminder() {
    const { sbPrompt, toast } = await import("./ui.js");
    const time = await sbPrompt("What time each day? Use 24-hour time, like 20:00.", { title: "Daily reminder", defaultValue: "20:00", confirmLabel: "Make reminder" });
    if (time == null) return;
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(time).trim());
    if (!m) { toast("Use a time like 20:00.", { type: "error" }); return; }
    const { reminderIcs } = await import("./seventyFive.js");
    const blob = new Blob([reminderIcs(state, `${m[1].padStart(2, "0")}${m[2]}`)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "75-day-reminder.ics"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Open the file to add it to your calendar.");
}

// ---- go -----------------------------------------------------------------------------------
function setSyncStatus(st) {
    syncText = { syncing: "Syncing…", synced: "Synced to your account", offline: "Offline: will sync", paused: "Sync paused" }[st] || "";
    signedIn = !["guest", "checking"].includes(st);
    const el = document.getElementById("sfSync");
    if (el) el.textContent = signedIn ? syncText : "";
}

await chooseShell();
renderTracker();
startSync({
    status: setSyncStatus,
    pulled: remote => { state = remote; renderTracker(); }
}).then(() => { if (signedIn && state) renderTracker(); });
