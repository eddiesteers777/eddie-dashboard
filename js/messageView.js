/* ==========================================
   Southbound — the message thread on screen

   mountThread(el, {
     role: "coach" | "client",   who I am
     otherUid, otherName,        the other side
     myName,                     shown to them as the sender
     email(text, senderName)     called for the first unread message of a run
     intro                       a line above the thread (optional)
     onChange(messages)          after every change (badges, attention)
   }) -> { destroy(), focus() }

   Live (onSnapshot): new messages and "Seen" appear without a reload.
   Messages from the other side are marked read while the page is in
   front. My unread messages can be taken back (Unsend). Ctrl/⌘ + Enter
   sends; on a phone Enter is a new line and the Send button sends.
   Reactions: the composer is a <textarea data-emoji>, so the Southbound
   picker attaches itself (js/emojiPicker.js) and bubbles draw them.
   Styles: css/messages.css (loaded here, so any page can mount it).
========================================== */

import { watchThread, sendMessage, markRead, unsendMessage } from "./messages.js";
import { threadDays, unreadFor, seenLine, MAX_MESSAGE } from "./messageThread.js";
import { renderEmojiText, onlyEmoji } from "./emoji.js";
import { icon } from "./icons.js";
import { toast, friendlyError, sbConfirm } from "./ui.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function ensureStyles() {
    if (document.querySelector('link[href$="css/messages.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/messages.css";
    document.head.appendChild(link);
}

// Links typed into a message become tappable (after escaping).
const linkify = html => html.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"']/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);

function bubbleHtml(m, role) {
    const big = onlyEmoji(m.text);
    const pending = !m.id || m.pending;
    return `
        <div class="msg-row ${m.mine ? "is-mine" : "is-theirs"}${m.first ? " is-first" : ""}" data-msg="${esc(m.id || "")}">
            <div class="msg-bubble${big ? " is-emoji" : ""}">
                <div class="msg-text">${linkify(renderEmojiText(esc(m.text), big ? { size: 44 } : {}))}</div>
                <span class="msg-time">${esc(m.time)}${pending ? " · sending" : ""}</span>
            </div>
            ${m.mine && m.id && !m.readAt ? `<button type="button" class="msg-unsend" data-unsend="${esc(m.id)}" aria-label="Unsend this message">Unsend</button>` : ""}
        </div>`;
}

export function mountThread(el, { role, otherUid, otherName = "", myName = "", email = null, intro = "", onChange = null } = {}) {
    ensureStyles();
    const first = String(otherName || "").split(" ")[0] || (role === "coach" ? "them" : "your coach");
    el.innerHTML = `
        <div class="msg-thread">
            ${intro ? `<p class="msg-intro">${esc(intro)}</p>` : ""}
            <div class="msg-list" role="log" aria-live="polite" aria-label="Messages with ${esc(otherName || first)}">
                <div class="sb-loading" role="status"><span class="sr-only">Loading…</span><span class="sb-skeleton" style="width:60%"></span><span class="sb-skeleton" style="width:44%;margin-left:auto"></span><span class="sb-skeleton" style="width:52%"></span></div>
            </div>
            <p class="msg-seen" aria-live="polite"></p>
            <form class="msg-compose" novalidate>
                <label class="sr-only" for="msgInput-${esc(otherUid)}">Message ${esc(first)}</label>
                <textarea id="msgInput-${esc(otherUid)}" class="msg-input" data-emoji rows="1" maxlength="${MAX_MESSAGE}" placeholder="Message ${esc(first)}…"></textarea>
                <button type="submit" class="sb-btn sb-btn-primary msg-send" aria-label="Send" disabled>${icon("send")}<span class="msg-send-label">Send</span></button>
            </form>
            <p class="msg-error" role="alert" hidden></p>
        </div>`;
    const list = el.querySelector(".msg-list");
    const seen = el.querySelector(".msg-seen");
    const form = el.querySelector(".msg-compose");
    const input = el.querySelector(".msg-input");
    const sendBtn = el.querySelector(".msg-send");
    const errorEl = el.querySelector(".msg-error");
    let thread = [];
    let loaded = false;
    let sending = false;

    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const toBottom = () => { list.scrollTop = list.scrollHeight; };

    const readSoon = () => {
        if (document.visibilityState !== "visible") return;
        const unread = unreadFor(thread, role);
        if (unread.length) markRead(unread);
    };

    function draw() {
        const stick = !loaded || nearBottom();
        const days = threadDays(thread, { role });
        list.innerHTML = days.length
            ? days.map(d => `<div class="msg-day"><span>${esc(d.label)}</span></div>${d.items.map(m => bubbleHtml(m, role)).join("")}`).join("")
            : `<div class="msg-empty">${icon("messageSquare")}<strong>No messages yet</strong><span>${role === "coach"
                ? `Anything you send here, ${esc(first)} sees in the app${email ? " (and gets an email nudge)" : ""}.`
                : `Questions about a workout, how you're feeling, a change in your week: send it here and ${esc(first)} sees it.`}</span></div>`;
        seen.textContent = seenLine(thread, role);
        if (stick) toBottom();
        loaded = true;
    }

    const stop = watchThread(role, otherUid, messages => {
        thread = messages;
        draw();
        readSoon();
        try { onChange?.(messages); } catch { /* the page's own redraw */ }
    }, error => {
        list.innerHTML = `<div class="msg-empty">${icon("alertTriangle")}<strong>Messages aren't available yet</strong><span>${error?.code === "permission-denied"
            ? (role === "coach" ? "The Firebase rules need the latest update published (Firestore Database → Rules)." : `They'll show here once ${esc(first)} switches them on.`)
            : esc(friendlyError(error, "load your messages"))}</span></div>`;
        input.disabled = true;
        sendBtn.disabled = true;
    });

    const onVisible = () => readSoon();
    document.addEventListener("visibilitychange", onVisible);

    const grow = () => {
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
        sendBtn.disabled = sending || !input.value.trim();
    };
    input.addEventListener("input", grow);
    input.addEventListener("keydown", event => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            form.requestSubmit();
        }
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text || sending) return;
        sending = true;
        sendBtn.disabled = true;
        errorEl.hidden = true;
        try {
            const { queued } = await sendMessage({
                role, otherUid, text, senderName: myName, thread,
                email: email ? ({ text: t, senderName }) => email(t, senderName) : null
            });
            input.value = "";
            grow();
            toBottom();
            if (queued) toast("Saved on this phone. It'll send when you're back online.", { type: "info" });
        } catch (error) {
            errorEl.textContent = friendlyError(error, "send that");
            errorEl.hidden = false;
        } finally {
            sending = false;
            grow();
            input.focus();
        }
    });

    list.addEventListener("click", async event => {
        const btn = event.target.closest("[data-unsend]");
        if (!btn) return;
        if (!(await sbConfirm(`${first} hasn't read it yet, so it disappears for both of you.`, { title: "Unsend this message?", confirmLabel: "Unsend", cancelLabel: "Keep it", danger: true }))) return;
        try {
            await unsendMessage(btn.dataset.unsend);
            toast("Message unsent.");
        } catch (error) {
            toast(error?.code === "permission-denied" ? `${first} has already read it, so it stays.` : friendlyError(error, "unsend that"), { type: "error" });
        }
    });

    return {
        destroy() { stop(); document.removeEventListener("visibilitychange", onVisible); },
        focus() { input.focus(); }
    };
}
