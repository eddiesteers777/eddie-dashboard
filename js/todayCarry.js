/* The verse to carry on Today (#todayCarry): the one picked on the Bible page, shown on the day it was picked. */
import * as N from "./bibleNotes.js";
import { esc, read, today } from "./faithStore.js";

const el = document.getElementById("todayCarry");
function draw() {
    if (!el) return;
    const c = N.carryFor(read(N.CARRY_KEY, null), today());
    if (!c) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.innerHTML = `<div class="tc-eyebrow">Verse to carry</div><a class="tc-ref" href="bible.html">${esc(c.ref)}</a>${c.words ? `<p class="tc-words">${esc(c.words)}</p>` : ""}`;
}
for (const ev of ["pageshow", "focus"]) window.addEventListener(ev, draw);
draw();
