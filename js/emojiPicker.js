/* ==========================================
   Southbound — the reaction picker

   Any <textarea data-emoji> gets a small bar under it:
     [quick reactions, when data-emoji="quick"]  [Southbound ☺ picker]
   and a live preview once the text holds a reaction, so nobody has to
   read ":sb_great_work:" to know what they're sending.

   The picker is a <dialog> (showModal), so it sits above other dialogs
   (the workout log form is one), closes on Escape or a tap outside, and
   hands focus back to the button. Anchored under its button on a
   computer, a bottom sheet on a phone.

   js/loadHeader.js calls enableEmojiPickers() on every app page; it
   watches for textareas added later (hub reply boxes, log dialogs).
========================================== */

import { EMOJI, EMOJI_CATEGORIES, QUICK_REACTIONS, emojiImg, hasEmoji, renderEmojiText, insertToken, emojiById } from "./emoji.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let dialog = null;
let target = null;       // the textarea the open picker writes into
let opener = null;       // the button that opened it

function insertInto(textarea, id) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const max = Number(textarea.getAttribute("maxlength")) || Infinity;
    const next = insertToken(textarea.value, id, start, end);
    if (next.text.length > max) return;
    textarea.value = next.text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    try { textarea.setSelectionRange(next.cursor, next.cursor); } catch { /* not focusable yet */ }
}

function buildDialog() {
    const d = document.createElement("dialog");
    d.className = "sb-emoji-pop";
    d.setAttribute("aria-label", "Southbound reactions");
    d.innerHTML = `
        <div class="sb-emoji-pop-head">
            <span class="sb-emoji-pop-title">Southbound</span>
            <button type="button" class="sb-emoji-pop-close" aria-label="Close">×</button>
        </div>
        ${EMOJI_CATEGORIES.map(cat => `
            <div class="sb-emoji-cat">
                <div class="sb-emoji-cat-label">${esc(cat.label)}</div>
                <div class="sb-emoji-grid">
                    ${EMOJI.filter(e => e.category === cat.key).map(e => `
                        <button type="button" class="sb-emoji-choice" data-emoji-id="${e.id}" aria-label="${esc(e.label)}" title="${esc(e.label)}">
                            ${emojiImg(e.id, { size: 32 })}
                        </button>`).join("")}
                </div>
            </div>`).join("")}`;
    d.addEventListener("click", event => {
        if (event.target === d) return close();                 // the backdrop
        if (event.target.closest(".sb-emoji-pop-close")) return close();
        const choice = event.target.closest("[data-emoji-id]");
        if (choice && target) {
            insertInto(target, choice.dataset.emojiId);
            close();
            target?.focus();
        }
    });
    d.addEventListener("close", () => { opener?.setAttribute("aria-expanded", "false"); });
    document.body.appendChild(d);
    return d;
}

function close() {
    if (dialog?.open) dialog.close();
}

function open(textarea, button) {
    dialog = dialog || buildDialog();
    target = textarea;
    opener = button;
    const phone = window.matchMedia("(max-width:600px)").matches;
    dialog.classList.toggle("is-sheet", phone);
    if (!phone) {
        const r = button.getBoundingClientRect();
        const width = Math.min(372, window.innerWidth - 24);
        dialog.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - width - 12))}px`;
        const below = r.bottom + 8;
        const height = Math.min(420, window.innerHeight * 0.8);
        dialog.style.top = below + height > window.innerHeight ? `${Math.max(12, r.top - height - 8)}px` : `${below}px`;
    } else {
        dialog.style.left = dialog.style.top = "";
    }
    button.setAttribute("aria-expanded", "true");
    dialog.showModal();
    dialog.querySelector(".sb-emoji-choice")?.focus();
}

function updatePreview(textarea, preview) {
    const show = hasEmoji(textarea.value);
    preview.hidden = !show;
    if (show) preview.innerHTML = `<span class="sb-emoji-preview-label">Preview</span> ${renderEmojiText(esc(textarea.value))}`;
}

export function attachEmojiPicker(textarea) {
    if (!textarea || textarea.dataset.emojiReady) return;
    textarea.dataset.emojiReady = "1";
    const quick = textarea.dataset.emoji === "quick";
    const bar = document.createElement("div");
    bar.className = "sb-emoji-bar";
    bar.innerHTML = `
        ${quick ? QUICK_REACTIONS.map(id => `
            <button type="button" class="sb-emoji-quick" data-quick="${id}" aria-label="Add ${esc(emojiById(id).label)}" title="${esc(emojiById(id).label)}">${emojiImg(id, { size: 24 })}</button>`).join("") : ""}
        <button type="button" class="sb-emoji-open" aria-haspopup="dialog" aria-expanded="false" aria-label="Add a Southbound reaction" title="Southbound reactions">
            ${emojiImg("sb_southbound", { size: 22 })}<span>${quick ? "More" : "React"}</span>
        </button>
        <div class="sb-emoji-preview" hidden></div>`;
    textarea.insertAdjacentElement("afterend", bar);
    const preview = bar.querySelector(".sb-emoji-preview");
    bar.addEventListener("click", event => {
        const q = event.target.closest("[data-quick]");
        if (q) { insertInto(textarea, q.dataset.quick); textarea.focus(); return; }
        const o = event.target.closest(".sb-emoji-open");
        if (o) open(textarea, o);
    });
    textarea.addEventListener("input", () => updatePreview(textarea, preview));
    // Pages also set the text in code (prefill, clear after sending),
    // which fires no input event: keep the preview in step anyway.
    const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    Object.defineProperty(textarea, "value", {
        configurable: true,
        get() { return native.get.call(this); },
        set(v) { native.set.call(this, v); updatePreview(textarea, preview); }
    });
    updatePreview(textarea, preview);
}

let observer = null;
export function enableEmojiPickers(root = document) {
    root.querySelectorAll?.("textarea[data-emoji]").forEach(attachEmojiPicker);
    if (observer || !document.body) return;
    observer = new MutationObserver(records => {
        for (const r of records) for (const n of r.addedNodes) {
            if (n.nodeType !== 1) continue;
            if (n.matches?.("textarea[data-emoji]")) attachEmojiPicker(n);
            n.querySelectorAll?.("textarea[data-emoji]").forEach(attachEmojiPicker);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
