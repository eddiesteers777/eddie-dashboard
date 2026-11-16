/* ==========================================
   Southbound — Bible page (bible.html), option A: Today / Notes / Books

   Today = the day's reading (links out to esv.org, check-offs live in the sheet from js/faithSheets.js),
   two short questions for a note, and a verse to carry on Today.
   Notes = every note, searchable. Books = a 66-book map that fills in as chapters are read.
   Only references and the person's own words are stored (js/bibleNotes.js). Mock-ups: project files faith-pages/.
========================================== */

import * as B from "./biblePlan.js";
import * as N from "./bibleNotes.js";
import { esc, read, save, today, bibleHabit, tabFromUrl, tabsHtml } from "./faithStore.js";
import { sbPrompt, sbConfirm, sbChoose, toast } from "./ui.js";

const root = document.getElementById("fpRoot");
let tab = tabFromUrl(["today", "notes", "books"]);
let query = "", book = "", draft = { ref: null, says: "", does: "" };

const plan = () => B.cleanPlan(read(B.BIBLE_PLAN_KEY, null));
const notes = () => N.loadNotes(localStorage);
const persistNote = n => save(N.keyFor(n.id), n);

function chapterRows(p, day) {
    return B.chaptersOn(p, day).map((ch, i) => {
        const on = (p.read?.[day] || []).includes(i);
        return `<li class="fp-chapter${on ? " is-on" : ""}"><span class="fp-ck" aria-hidden="true">${on ? "✓" : ""}</span><strong class="fp-item-t">${esc(ch)}</strong>
            <a class="fp-ext" href="${esc(N.esvUrl(ch))}" target="_blank" rel="noopener noreferrer" aria-label="Read ${esc(ch)} on ESV.org (opens a new tab)">ESV.org ↗</a></li>`;
    }).join("");
}

function todayTab() {
    const p = plan(), t = today();
    const day = p ? B.dayFor(p, t) : 0;
    const chapters = p ? B.chaptersOn(p, day) : [];
    const behind = p ? B.daysBehind(p, t, day) : 0;
    const readCard = p
        ? `<section class="fp-card"><h2 class="fp-h">Day ${day + 1} · ${esc(B.planName(p.id))}</h2>
            ${behind ? `<p class="fp-sub fp-late">You're ${behind} day${behind === 1 ? "" : "s"} behind. The reading carries over, so just pick up where you are.</p>` : ""}
            <ul class="fp-list">${chapterRows(p, day)}</ul>
            <button type="button" class="sb-btn sb-btn-secondary" data-sheet>Check off chapters</button></section>`
        : `<section class="fp-card"><h2 class="fp-h">Reading plan</h2><p class="fp-sub">Pick a plan, or just log that you read. The plan picker is the same one the Bible habit opens.</p>
            <button type="button" class="sb-btn sb-btn-primary" data-sheet>Pick a reading plan</button></section>`;
    const ref = draft.ref ?? N.refLabel(chapters);
    const noteCard = `<form class="fp-card" data-note><h2 class="fp-h">Today's note</h2>
        <label class="fp-lbl" for="fpRef">What did you read?</label><input id="fpRef" name="ref" class="fp-input" type="text" maxlength="80" value="${esc(ref)}" placeholder="For example: Luke 8" autocomplete="off">
        <label class="fp-lbl" for="fpSays">What does it say?</label><textarea id="fpSays" name="says" class="fp-input fp-ta" rows="2" maxlength="400">${esc(draft.says)}</textarea>
        <label class="fp-lbl" for="fpDoes">What do I do with it?</label><textarea id="fpDoes" name="does" class="fp-input fp-ta" rows="2" maxlength="400" placeholder="One sentence.">${esc(draft.does)}</textarea>
        <button type="submit" class="sb-btn sb-btn-primary">Save note</button></form>`;
    const carry = N.carryFor(read(N.CARRY_KEY, null), t);
    const carryCard = carry
        ? `<section class="fp-card fp-carry"><h2 class="fp-h">Verse to carry · today</h2><p class="fp-item-t"><strong>${esc(carry.ref)}</strong></p>${carry.words ? `<p class="fp-sub">${esc(carry.words)}</p>` : ""}
            <p class="fp-meta">Shows on your Today screen all day.</p><button type="button" class="fp-link" data-carry-clear>Remove</button></section>`
        : `<form class="fp-card fp-carry" data-carry><h2 class="fp-h">Verse to carry</h2><p class="fp-sub">Pick one verse from today and it shows on your Today screen all day. Write it in your own words.</p>
            <label class="fp-lbl" for="fpCRef">Verse</label><input id="fpCRef" name="ref" class="fp-input" type="text" maxlength="60" placeholder="For example: Psalm 46:10" autocomplete="off">
            <label class="fp-lbl" for="fpCWords">In my words (optional)</label><input id="fpCWords" name="words" class="fp-input" type="text" maxlength="200" autocomplete="off">
            <button type="submit" class="sb-btn sb-btn-secondary">Carry it today</button></form>`;
    return `<div class="fp-split">${readCard}${noteCard}${carryCard}</div>`;
}

function noteRow(n) {
    return `<li class="fp-item" data-id="${esc(n.id)}"><div class="fp-item-top"><strong class="fp-item-t">${esc(n.ref)}</strong><span class="fp-meta">${esc(shortDate(n.date))}</span></div>
        ${n.says ? `<p class="fp-item-note"><span class="fp-q">Says</span> ${esc(n.says)}</p>` : ""}${n.does ? `<p class="fp-item-note"><span class="fp-q">Do</span> ${esc(n.does)}</p>` : ""}
        <div class="fp-item-foot"><span></span><button type="button" class="fp-more" data-more aria-label="More for ${esc(n.ref)}">More</button></div></li>`;
}
const shortDate = key => key ? new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

function notesTab() {
    const all = notes();
    if (!all.length) return `<section class="fp-card fp-empty"><div class="fp-empty-ico" aria-hidden="true">📖</div><h2 class="fp-empty-t">No notes yet</h2><p class="fp-sub">After you read, answer two short questions on Today. It takes a minute. Notes stay with the chapter and you can search them here.</p><button type="button" class="sb-btn sb-btn-primary" data-go="today">Write today's note</button></section>`;
    const shown = N.filterNotes(all, query, book);
    const chips = [{ book: "", count: all.length }, ...N.noteBooks(all)].map(c => `<button type="button" class="fp-chipbtn${c.book === book ? " is-on" : ""}" data-book="${esc(c.book)}" aria-pressed="${c.book === book}">${esc(c.book || "All")}</button>`).join("");
    return `<input class="fp-input" type="search" data-search value="${esc(query)}" placeholder="Search notes or a book" aria-label="Search notes">
        <div class="fp-chips" role="group" aria-label="Filter by book">${chips}</div>
        ${shown.length ? `<ul class="fp-list">${shown.map(noteRow).join("")}</ul>` : `<p class="fp-sub">No notes match.</p>`}`;
}

function booksTab() {
    const p = plan(), books = N.bookProgress(p);
    const done = books.filter(b => b.done).length, ch = books.reduce((s, b) => s + b.read, 0);
    const cells = books.map(b => `<li class="fp-book${b.done ? " is-done" : b.started ? " is-part" : ""}" title="${esc(b.name)}: ${b.read} of ${b.total} chapters"><span aria-hidden="true">${esc(N.bookAbbr(b.name))}</span><span class="sr-only">${esc(b.name)}, ${b.read} of ${b.total} chapters read</span></li>`).join("");
    return `<section class="fp-card"><h2 class="fp-h">66-book map <span class="fp-meta">${done} of 66</span></h2>
        ${p ? "" : `<p class="fp-sub">Pick a reading plan and the map fills in as you check off chapters.</p>`}
        <ul class="fp-books">${cells}</ul>
        <p class="fp-meta">${ch} of ${B.TOTAL_CHAPTERS} chapters read on this plan. Gold = a book you started, blue = finished.</p></section>`;
}

function draw() {
    const n = notes().length;
    root.innerHTML = tabsHtml([{ id: "today", label: "Today" }, { id: "notes", label: "Notes", count: n }, { id: "books", label: "Books" }], tab)
        + `<div class="fp-panel">${tab === "notes" ? notesTab() : tab === "books" ? booksTab() : todayTab()}</div>`;
}

const noteFor = el => { const id = el.closest("[data-id]")?.dataset.id; return notes().find(n => n.id === id); };
const readDraft = () => { const f = root.querySelector("[data-note]"); if (f) draft = { ref: f.elements.ref.value, says: f.elements.says.value, does: f.elements.does.value }; };

root.addEventListener("click", async e => {
    const t = e.target;
    const tabBtn = t.closest("[data-tab]"), go = t.closest("[data-go]");
    if (tabBtn || go) { readDraft(); tab = (tabBtn || go).dataset.tab || go.dataset.go; history.replaceState(null, "", `#${tab}`); draw(); return; }
    if (t.closest("[data-sheet]")) {
        readDraft();
        const m = await import("./faithSheets.js");
        await m.openBibleSheet({ habit: bibleHabit(), onChange: draw });
        draw(); window.dispatchEvent(new CustomEvent("sb:habits-changed"));
        return;
    }
    const bk = t.closest("[data-book]");
    if (bk) { book = bk.dataset.book; draw(); return; }
    if (t.closest("[data-carry-clear]")) { save(N.CARRY_KEY, null); draw(); return; }
    if (t.closest("[data-more]")) {
        const n = noteFor(t); if (!n) return;
        const what = await sbChoose(n.ref, { title: "Note", choices: [{ label: "Edit", value: "edit", primary: true }, { label: "Delete", value: "del" }] });
        if (what === "edit") {
            const says = await sbPrompt("What does it say?", { title: n.ref, defaultValue: n.says, multiline: true, maxLength: 400 }); if (says === null) return;
            const does = await sbPrompt("What do I do with it?", { title: n.ref, defaultValue: n.does, multiline: true, maxLength: 400 }); if (does === null) return;
            persistNote(N.editNote(n, { says, does })); draw();
        } else if (what === "del" && await sbConfirm(`Delete your note on ${n.ref}? This can't be undone.`, { title: "Delete note", confirmLabel: "Delete", danger: true })) { persistNote(N.tombstone(n)); draw(); }
    }
});

root.addEventListener("input", e => { if (e.target.matches("[data-search]")) { query = e.target.value; const pos = e.target.selectionStart; draw(); const s = root.querySelector("[data-search]"); s?.focus(); try { s.setSelectionRange(pos, pos); } catch {} } });

root.addEventListener("submit", e => {
    const f = e.target;
    if (f.matches("[data-note]")) {
        e.preventDefault();
        const n = N.newNote({ ref: f.elements.ref.value, says: f.elements.says.value, does: f.elements.does.value }, today());
        if (!n) { toast("Add the passage and at least one answer.", { type: "error" }); return; }
        if (!persistNote(n)) { toast("This device couldn't save that. Free some space and try again.", { type: "error" }); return; }
        draft = { ref: null, says: "", does: "" }; toast("Note saved."); tab = "notes"; history.replaceState(null, "", "#notes"); draw();
    } else if (f.matches("[data-carry]")) {
        e.preventDefault();
        const ref = f.elements.ref.value.trim();
        if (!ref) { toast("Add the verse, like Psalm 46:10.", { type: "error" }); return; }
        save(N.CARRY_KEY, { ref, words: f.elements.words.value, date: today() }); toast("It will show on Today."); draw();
    }
});

window.addEventListener("pageshow", draw);
draw();
