/* ==========================================
   Southbound — coach Messages (coach-messages.html)

   One inbox for every client: the list grouped by who needs a reply,
   the live thread (js/messageView.js, the same one the Client Hub
   uses), and a short "about this client" panel. No new data: messages
   come from the client directory, grouping from js/coachInbox.js.
========================================== */

import { listenForAuth, getCurrentUser } from "./auth.js";
import { isApprovedCoach } from "./userProfile.js";
import { loadClientDirectory } from "./clientDirectory.js";
import { summarizeClient, isoDate, shortDate, serviceLabels } from "./clientSummary.js";
import { inboxRows, inboxGroups, needsCount } from "./coachInbox.js";
import { waitedText } from "./coachToday.js";
import { mountThread } from "./messageView.js";
import { markRead } from "./messages.js";
import { togglePinned, unreadFor } from "./messageThread.js";
import { sendCoachMessageEmail } from "./emailNotify.js";
import { friendlyError, loadingHtml } from "./ui.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const firstName = name => String(name || "").split(" ")[0] || "them";
const wide = () => window.matchMedia("(min-width: 901px)").matches;

const PIN_KEY = "coach-pinned-chats";   // cloud-synced list of client uids
const readPins = () => { try { const v = JSON.parse(localStorage.getItem(PIN_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const writePins = list => { try { localStorage.setItem(PIN_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };

const shell = $("cmShell");
let clients = [];          // [{ uid, name, searchText, messages, summary, record }]
let selected = "";
let mounted = null;

// ---------- the list ----------

function renderList() {
    const rows = inboxRows(clients.map(c => ({ uid: c.uid, name: c.name, searchText: c.searchText, messages: c.messages })));
    const pins = readPins();
    let groups = inboxGroups(rows, { query: $("cmSearch").value });
    const pinned = pins.map(uid => groups.flatMap(g => g.rows).find(r => r.uid === uid)).filter(Boolean);
    if (pinned.length) {
        groups = [{ key: "pinned", label: "Pinned", rows: pinned }, ...groups.map(g => ({ ...g, rows: g.rows.filter(r => !pins.includes(r.uid)) })).filter(g => g.rows.length)];
    }
    const waiting = needsCount(rows);
    $("cmSummary").textContent = waiting
        ? `${waiting} ${waiting === 1 ? "client is" : "clients are"} waiting on you.`
        : "You're caught up.";
    const initials = name => String(name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
    $("cmList").innerHTML = groups.length ? groups.map(g => `
        <div class="cm-group">${esc(g.label)} · ${g.rows.length}</div>
        ${g.rows.map(r => `
            <div class="cm-swipe">
                <div class="cm-actions">
                    <button type="button" class="cm-act cm-act-pin" data-pin="${esc(r.uid)}">${pins.includes(r.uid) ? "Unpin" : "Pin"}</button>
                    ${r.unread ? `<button type="button" class="cm-act cm-act-read" data-markread="${esc(r.uid)}">Read</button>` : ""}
                </div>
                <button type="button" class="cm-item${r.uid === selected ? " is-selected" : ""}${r.unread ? " is-unread" : ""}" data-uid="${esc(r.uid)}">
                    <span class="cm-avatar" aria-hidden="true">${esc(initials(r.name))}</span>
                    <span class="cm-item-main">
                        <span class="cm-item-top"><strong>${esc(r.name)}</strong><span class="cm-when">${r.at ? esc(waitedText(r.at).replace(" ago", "")) : ""}</span></span>
                        <span class="cm-item-bottom"><span class="cm-preview">${r.text ? `${r.mine ? "You: " : ""}${esc(r.text)}` : "Start a conversation"}</span>${r.unread ? `<span class="cm-count" aria-label="${r.unread} unread">${r.unread}</span>` : ""}</span>
                    </span>
                </button>
            </div>`).join("")}`).join("")
        : `<p class="cm-none">${clients.length ? "No clients match." : "No clients yet. Add one from My Clients."}</p>`;
}

// ---------- about this client ----------

function contextHtml(c) {
    const s = c.summary;
    const plan = s.plans?.primary;
    const trains = (s.services || []).some(v => v !== "soccer_1on1" && v !== "soccer_group");
    const planText = !plan ? (trains ? "No plan yet" : "Sessions only")
        : plan.state === "upcoming" ? `${plan.name}, starts ${shortDate(plan.startDate)}`
        : plan.state === "finished" ? `${plan.name}, finished`
        : `${plan.name}, week ${plan.weekNumber} of ${plan.totalWeeks}`;
    const latest = s.checkins?.latest;
    const checkinText = !latest ? "None yet" : latest.status === "submitted" ? "Waiting for your reply" : `Replied, week of ${shortDate(latest.weekOf)}`;
    const next = s.sessions?.upcoming?.[0];
    const flags = (s.attention || []).filter(a => a.kind !== "message").slice(0, 2);
    const hub = tab => `client.html?uid=${encodeURIComponent(c.uid)}&tab=${tab}`;
    return `
        ${flags.map(f => `<div class="cm-flag">${esc(f.text)}</div>`).join("")}
        <div><h3>Plan</h3><p>${esc(planText)}</p></div>
        <div><h3>Check-in</h3><p>${esc(checkinText)}</p></div>
        <div><h3>Next session</h3><p>${next ? esc(shortDate(next.date)) : "None booked"}</p></div>
        <div><h3>Last seen</h3><p>${c.lastSeen ? esc(waitedText(c.lastSeen)) : "Not yet"}</p></div>
        <a class="sb-btn sb-btn-secondary" href="${hub("overview")}">${latest?.status === "submitted" ? "Reply to check-in" : "Open overview"}</a>
        <a class="sb-btn sb-btn-secondary" href="${hub("plan")}">Adjust their plan</a>`;
}

const QUICK = [
    name => `Got it, thanks ${name}.`,
    () => "Nice work. Keep the easy days easy this week.",
    () => "Let's talk it through. Call me when you can."
];

// ---------- the thread ----------

function openClient(uid, { push = true } = {}) {
    const c = clients.find(x => x.uid === uid);
    if (!c) return;
    selected = uid;
    mounted?.destroy?.();
    const name = firstName(c.name);
    $("cmName").textContent = c.name;
    $("cmSub").textContent = serviceLabels(c.summary.services).join(" · ") || c.summary.email || "";
    $("cmHub").href = `client.html?uid=${encodeURIComponent(uid)}`;
    $("cmCtxBody").innerHTML = contextHtml(c);
    $("cmQuick").innerHTML = QUICK.map((q, i) => `<button type="button" class="cm-chip" data-quick="${i}">${esc(q(name))}</button>`).join("");
    shell.classList.add("has-thread");
    $("cmThreadPane").hidden = false;
    $("cmCtx").hidden = false;
    $("cmPick").hidden = true;
    $("cmCtx").classList.remove("is-open");
    $("cmCtxToggle").setAttribute("aria-expanded", "false");
    const coachName = getCurrentUser()?.displayName || "Your coach";
    mounted = mountThread($("cmThread"), {
        role: "coach", otherUid: uid, otherName: name, myName: coachName,
        email: text => sendCoachMessageEmail({ clientEmail: c.summary.email, clientName: name, coachName, text }),
        onChange: messages => { c.messages = messages; renderList(); }
    });
    if (push) history.replaceState(null, "", `?uid=${encodeURIComponent(uid)}`);
    renderList();
    if (!wide()) $("cmThreadPane").scrollIntoView({ block: "start" });
}

function closeClient() {
    mounted?.destroy?.();
    mounted = null;
    selected = "";
    shell.classList.remove("has-thread");
    $("cmThreadPane").hidden = true;
    $("cmCtx").hidden = true;
    $("cmPick").hidden = false;
    history.replaceState(null, "", location.pathname);
    renderList();
}

// Swipe a row left (or right-click it) for Pin / Read.
let swipe = null;
let swiped = false;
const closeSwipes = except => $("cmList").querySelectorAll(".cm-swipe.is-open").forEach(el => { if (el !== except) el.classList.remove("is-open"); });
$("cmList").addEventListener("pointerdown", event => {
    const item = event.target.closest(".cm-item");
    if (!item || event.pointerType === "mouse") return;
    swipe = { item, row: item.closest(".cm-swipe"), x: event.clientX, y: event.clientY, dx: 0, live: false };
    swiped = false;
});
$("cmList").addEventListener("pointermove", event => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.live) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
        if (Math.abs(dx) < 10) return;
        swipe.live = true;
        closeSwipes(swipe.row);
        swipe.item.style.transition = "none";
    }
    const base = swipe.row.classList.contains("is-open") ? -150 : 0;
    swipe.dx = Math.max(-150, Math.min(0, base + dx));
    swipe.item.style.transform = `translateX(${swipe.dx}px)`;
});
const endSwipe = () => {
    if (!swipe) return;
    if (swipe.live) {
        swiped = true;
        swipe.item.style.transition = "";
        swipe.item.style.transform = "";
        swipe.row.classList.toggle("is-open", swipe.dx < -60);
    }
    swipe = null;
};
$("cmList").addEventListener("pointerup", endSwipe);
$("cmList").addEventListener("pointercancel", endSwipe);
$("cmList").addEventListener("contextmenu", event => {
    const row = event.target.closest(".cm-swipe");
    if (!row) return;
    event.preventDefault();
    closeSwipes(row);
    row.classList.toggle("is-open");
});
$("cmList").addEventListener("click", async event => {
    const pin = event.target.closest("[data-pin]");
    if (pin) { writePins(togglePinned(readPins(), pin.dataset.pin)); renderList(); return; }
    const read = event.target.closest("[data-markread]");
    if (read) {
        const c = clients.find(x => x.uid === read.dataset.markread);
        if (c) {
            const unread = unreadFor(c.messages, "coach");
            c.messages = c.messages.map(m => unread.includes(m) ? { ...m, readAt: Date.now() } : m);
            renderList();
            markRead(unread);
        }
        return;
    }
    if (swiped) { swiped = false; return; }
    const open = event.target.closest(".cm-swipe.is-open");
    if (open) { open.classList.remove("is-open"); return; }
    const item = event.target.closest("[data-uid]");
    if (item) openClient(item.dataset.uid);
});
$("cmSearch").addEventListener("input", renderList);
$("cmBack").addEventListener("click", closeClient);
$("cmCtxToggle").addEventListener("click", () => {
    const open = $("cmCtx").classList.toggle("is-open");
    $("cmCtxToggle").setAttribute("aria-expanded", String(open));
});
$("cmQuick").addEventListener("click", event => {
    const chip = event.target.closest("[data-quick]");
    const c = clients.find(x => x.uid === selected);
    const input = $("cmThread").querySelector(".msg-input");
    if (!chip || !c || !input) return;
    input.value = QUICK[Number(chip.dataset.quick)](firstName(c.name));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
});

// ---------- load ----------

async function load() {
    $("cmList").innerHTML = loadingHtml("Loading messages", { lines: 5 });
    try {
        const today = isoDate(new Date());
        const records = await loadClientDirectory();
        clients = records.map(r => {
            const summary = summarizeClient(r, today);
            return { uid: summary.uid, name: summary.name, searchText: summary.searchText, messages: r.messages || [], summary, lastSeen: r.profile?.lastSeenAt?.toMillis?.() || 0 };
        }).filter(c => c.uid);
    } catch (error) {
        console.error("Loading messages failed:", error);
        $("cmList").innerHTML = `<p class="cm-none">${esc(friendlyError(error, "load your messages"))}</p>`;
        return;
    }
    renderList();
    const wanted = new URLSearchParams(location.search).get("uid");
    if (wanted && clients.some(c => c.uid === wanted)) openClient(wanted, { push: false });
}

listenForAuth(async user => {
    $("cmSignedOut").hidden = Boolean(user);
    $("cmNotApproved").hidden = true;
    shell.hidden = true;
    if (!user) return;
    if (!(await isApprovedCoach())) { $("cmNotApproved").hidden = false; return; }
    shell.hidden = false;
    load();
});
