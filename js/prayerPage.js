/* ==========================================
   Southbound — Prayer page (prayer.html), option A: Today / Requests / Answered

   Today = the prayer map (the sheet from js/faithSheets.js) plus the open requests it asks you to pray for.
   Requests = add, edit, mark answered. Answered = a record to look back on (what you asked, what happened).
   Data: js/prayerRequests.js (one key per request). Mock-ups: project files faith-pages/.
========================================== */

import * as R from "./prayerRequests.js";
import * as P from "./prayerModel.js";
import { esc, read, save, today, prayerHabit, tabFromUrl, tabsHtml } from "./faithStore.js";
import { sbPrompt, sbConfirm, sbChoose, toast } from "./ui.js";

const root = document.getElementById("fpRoot");
let tab = tabFromUrl(["today", "requests", "answered"]);
let group = "";   // the group filter on Requests; a new request goes into it

const all = () => R.loadAll(localStorage);
const persist = r => save(R.keyFor(r.id), r);

function requestRow(r, { showActions = true } = {}) {
    const meta = [r.group, r.added ? `Added ${R.shortDate(r.added)}` : ""].filter(Boolean).join(" · ");
    return `<li class="fp-item" data-id="${esc(r.id)}">
        <div class="fp-item-top"><strong class="fp-item-t">${esc(r.text)}</strong>${r.group ? `<span class="fp-chip">${esc(r.group)}</span>` : ""}</div>
        ${r.note ? `<p class="fp-item-note">${esc(r.note)}</p>` : ""}
        <div class="fp-item-foot"><span class="fp-meta">${r.added ? `Added ${R.shortDate(r.added)}` : ""}</span>
        ${showActions ? `<button type="button" class="fp-more" data-more aria-label="More for ${esc(r.text)}">More</button><button type="button" class="sb-btn sb-btn-secondary fp-sm" data-answer>Mark answered</button>` : ""}</div></li>`;
}

function answeredRow(r) {
    const days = R.daysBetween(r.added, r.answered.date);
    return `<li class="fp-item fp-ans" data-id="${esc(r.id)}">
        <div class="fp-item-top"><strong class="fp-item-t"><span class="fp-tick" aria-hidden="true">✓</span> ${esc(r.text)}</strong>${r.group ? `<span class="fp-chip">${esc(r.group)}</span>` : ""}</div>
        <p class="fp-meta">${r.added ? `Asked ${R.shortDate(r.added)} · ` : ""}Answered ${R.shortDate(r.answered.date)}${r.added && days ? ` · ${days} day${days === 1 ? "" : "s"}` : ""}</p>
        ${r.answered.note ? `<p class="fp-item-note fp-happened">${esc(r.answered.note)}</p>` : ""}
        <div class="fp-item-foot"><span></span><button type="button" class="fp-more" data-reopen>Not answered after all</button><button type="button" class="fp-more" data-del>Delete</button></div></li>`;
}

function todayTab(reqs) {
    const list = P.cleanList(read(P.PRAYER_LIST_KEY, null));
    const p = P.progress(list, read(P.PRAYER_CHECKS_KEY, {}), today());
    const open = R.openRequests(reqs), recent = R.answeredRequests(reqs).slice(0, 3);
    const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return `<div class="fp-split"><section class="fp-card"><h2 class="fp-h">Today's prayer map</h2>
        ${list ? `<p class="fp-sub">${p.done} of ${p.total} done</p><div class="fp-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>`
            : `<p class="fp-sub">Pick the steps you pray through, then add what you pray for under each one.</p>`}
        <button type="button" class="sb-btn sb-btn-primary" data-map>${list ? (p.done ? "Continue the map" : "Open the map") : "Build my prayer map"}</button></section>
        <section class="fp-card"><h2 class="fp-h">Ask <button type="button" class="fp-link" data-go="requests">All requests</button></h2>
        ${open.length ? `<ul class="fp-list">${open.slice(0, 5).map(r => requestRow(r)).join("")}</ul>${open.length > 5 ? `<p class="fp-meta">${open.length - 5} more on Requests.</p>` : ""}`
            : `<p class="fp-sub">No open requests. Add one on Requests and it shows up here.</p>`}</section>
        ${recent.length ? `<section class="fp-card"><h2 class="fp-h">Thank <button type="button" class="fp-link" data-go="answered">All answered</button></h2>
        <ul class="fp-list">${recent.map(answeredRow).join("")}</ul></section>` : ""}</div>`;
}

function requestsTab(reqs) {
    const open = R.openRequests(reqs, group);
    const chips = ["", ...R.GROUPS].map(g => `<button type="button" class="fp-chipbtn${g === group ? " is-on" : ""}" data-group="${esc(g)}" aria-pressed="${g === group}">${g || "All"}</button>`).join("");
    const empty = !reqs.some(r => !r.answered);
    return `<form class="fp-add" data-add><input class="fp-input" name="text" type="text" maxlength="90" placeholder="Who or what are you praying for?" aria-label="New prayer request" autocomplete="off"><button type="submit" class="sb-btn sb-btn-primary">Add</button></form>
        ${group ? `<p class="fp-meta">New requests go under ${esc(group)}.</p>` : ""}
        <div class="fp-chips" role="group" aria-label="Filter by group">${chips}</div>
        ${open.length ? `<ul class="fp-list">${open.map(r => requestRow(r)).join("")}</ul>`
            : empty ? `<section class="fp-card fp-empty"><div class="fp-empty-ico" aria-hidden="true">🕯</div><h2 class="fp-empty-t">Nothing on your list yet</h2><p class="fp-sub">Add a person or a need. It shows up under Ask on your prayer map page. When it's answered, mark it and it moves to Answered.</p></section>`
            : `<p class="fp-sub">Nothing open under ${esc(group || "All")}.</p>`}`;
}

function answeredTab(reqs) {
    const done = R.answeredRequests(reqs);
    return done.length ? `<ul class="fp-list">${done.map(answeredRow).join("")}</ul>`
        : `<section class="fp-card fp-empty"><div class="fp-empty-ico" aria-hidden="true">✓</div><h2 class="fp-empty-t">No answered prayers yet</h2><p class="fp-sub">When a request is answered, mark it and write what happened. This becomes a record you can look back on.</p></section>`;
}

function draw() {
    const reqs = all();
    const open = reqs.filter(r => !r.answered).length, done = reqs.length - open;
    root.innerHTML = tabsHtml([{ id: "today", label: "Today" }, { id: "requests", label: "Requests", count: open }, { id: "answered", label: "Answered", count: done }], tab)
        + `<div class="fp-panel">${tab === "requests" ? requestsTab(reqs) : tab === "answered" ? answeredTab(reqs) : todayTab(reqs)}</div>`;
}

function find(el) { const id = el.closest("[data-id]")?.dataset.id; return all().find(r => r.id === id); }

async function editRequest(r) {
    const text = await sbPrompt("Who or what?", { title: "Edit request", defaultValue: r.text, maxLength: 90 });
    if (text === null) return;
    const note = await sbPrompt("A short note (optional).", { title: "Edit request", defaultValue: r.note, multiline: true, maxLength: 240, placeholder: "For example: surgery Thursday" });
    if (note === null) return;
    const g = await sbChoose("Which group?", { title: "Group", choices: [...R.GROUPS.map(x => ({ label: x, value: x, primary: x === r.group })), { label: "No group", value: "" }] });
    persist(R.edit(r, { text, note, group: g === null ? r.group : g }));
}

root.addEventListener("click", async e => {
    const t = e.target;
    const tabBtn = t.closest("[data-tab]"), go = t.closest("[data-go]");
    if (tabBtn || go) { tab = (tabBtn || go).dataset.tab || go.dataset.go; history.replaceState(null, "", `#${tab}`); draw(); return; }
    if (t.closest("[data-map]")) {
        const m = await import("./faithSheets.js");
        await m.openPrayerSheet({ habit: prayerHabit(), onChange: draw });
        draw(); window.dispatchEvent(new CustomEvent("sb:habits-changed"));
        return;
    }
    const g = t.closest("[data-group]");
    if (g) { group = g.dataset.group; draw(); return; }
    const r = find(t);
    if (!r) return;
    if (t.closest("[data-answer]")) {
        const note = await sbPrompt("What happened? You can leave this empty.", { title: "Answered", multiline: true, maxLength: 240, confirmLabel: "Mark answered", placeholder: "For example: the scan came back clear" });
        if (note === null) return;
        persist(R.markAnswered(r, today(), note)); toast("Moved to Answered."); draw();
    } else if (t.closest("[data-reopen]")) {
        persist(R.reopen(r)); draw();
    } else if (t.closest("[data-del]")) {
        if (await sbConfirm(`Delete "${r.text}"? This can't be undone.`, { title: "Delete request", confirmLabel: "Delete", danger: true })) { persist(R.tombstone(r)); draw(); }
    } else if (t.closest("[data-more]")) {
        const what = await sbChoose(r.text, { title: "Request", choices: [{ label: "Edit", value: "edit", primary: true }, { label: "Delete", value: "del" }] });
        if (what === "edit") { await editRequest(r); draw(); }
        else if (what === "del" && await sbConfirm(`Delete "${r.text}"? This can't be undone.`, { title: "Delete request", confirmLabel: "Delete", danger: true })) { persist(R.tombstone(r)); draw(); }
    }
});

root.addEventListener("submit", e => {
    const form = e.target.closest("[data-add]");
    if (!form) return;
    e.preventDefault();
    const r = R.newRequest(form.elements.text.value, "", group, today());
    if (!r) return;
    if (!persist(r)) { toast("This device couldn't save that. Free some space and try again.", { type: "error" }); return; }
    draw();
    root.querySelector(".fp-input")?.focus();
});

window.addEventListener("pageshow", draw);
draw();
import("./icons.js").then(m => m.hydrate?.()).catch(() => {});
