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
   iPhone-style (2026-10-18): bubbles join into runs with a tail on the
   last one, a time stamp after a long pause, "Delivered" / "Read 6:41 PM"
   under my newest message, the other side's typing dots (a ping in
   messageTyping, js/messages.js), new bubbles slide in, and press-and-hold
   (right-click on a computer) opens Copy / Show time / Unsend.
   Styles: css/messages.css (loaded here, so any page can mount it).
========================================== */

import { watchThread, sendMessage, markRead, unsendMessage, watchTyping, pingTyping, reactToMessage } from "./messages.js";
import { threadDays, unreadFor, seenLine, isTyping, preview, MAX_MESSAGE } from "./messageThread.js";
import { renderEmojiText, onlyEmoji, emojiImg, emojiById, QUICK_REACTIONS } from "./emoji.js";
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

const REPLY_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 6 6v3"></path></svg>';
const BACK_ICON = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>';
const SEND_ARROW = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path></svg>';

function bubbleHtml(m, fresh, role, first) {
    const big = onlyEmoji(m.text);
    const pending = !m.id || m.pending;
    const tail = m.pos === "end" || m.pos === "single";
    return `
        <div class="msg-row ${m.mine ? "is-mine" : "is-theirs"} pos-${m.pos}${m.first ? " is-first" : ""}${fresh ? " is-new" : ""}" data-msg="${esc(m.id || "")}">
            <div class="msg-bubble${big ? " is-emoji" : ""}${tail && !big ? " has-tail" : ""}" tabindex="0">
                ${reactionsHtml(m)}
                ${m.replyTo?.id ? `<button type="button" class="msg-quote" data-jump="${esc(m.replyTo.id)}"><b>${m.replyTo.from === role ? "You" : esc(first)}</b><span>${esc(preview(m.replyTo.text, 90))}</span></button>` : ""}
                <div class="msg-text">${linkify(renderEmojiText(esc(m.text), big ? { size: 44 } : {}))}</div>
            </div>
            <span class="msg-time">${esc(m.time)}${pending ? " · sending" : ""}</span>
            ${m.mine && m.id && !m.readAt ? `<button type="button" class="msg-unsend" data-unsend="${esc(m.id)}" aria-label="Unsend this message">Unsend</button>` : ""}
        </div>`;
}

function reactionsHtml(m) {
    const ids = [m.reactions?.coach, m.reactions?.client].filter(id => id && emojiById(id));
    return ids.length ? `<span class="msg-react" aria-label="Reactions">${ids.map(id => emojiImg(id, { size: 18 })).join("")}</span>` : "";
}

const plainText = row => row.querySelector(".msg-text")?.innerText || "";

/**
 * Full-screen mode (phones): the page behind stops scrolling and the box
 * follows the visual viewport, so the on-screen keyboard pushes the thread up
 * instead of covering the input. Returns a function that turns it off.
 */
export function enterFullScreen(el) {
    const root = document.documentElement;
    root.classList.add("msg-full");
    const vv = window.visualViewport;
    const fit = () => {
        el.style.setProperty("--msg-vh", `${Math.round(vv?.height || window.innerHeight)}px`);
        el.style.setProperty("--msg-top", `${Math.round(vv?.offsetTop || 0)}px`);
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
        root.classList.remove("msg-full");
        vv?.removeEventListener("resize", fit);
        vv?.removeEventListener("scroll", fit);
        el.style.removeProperty("--msg-vh");
        el.style.removeProperty("--msg-top");
    };
}

export function mountThread(el, { role, otherUid, otherName = "", myName = "", email = null, intro = "", onChange = null, header = null } = {}) {
    ensureStyles();
    const first = String(otherName || "").split(" ")[0] || (role === "coach" ? "them" : "your coach");
    el.innerHTML = `
        <div class="msg-thread">
            ${header ? `<div class="msg-head">${header.back ? `<a class="msg-head-back" href="${esc(header.back)}" aria-label="Back">${BACK_ICON}</a>` : ""}<span class="msg-head-av" aria-hidden="true">${esc(String(header.name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase())}</span><strong>${esc(header.name || "")}</strong>${header.sub ? `<span>${esc(header.sub)}</span>` : ""}</div>` : ""}
            ${intro ? `<p class="msg-intro">${esc(intro)}</p>` : ""}
            <div class="msg-list" role="log" aria-live="polite" aria-label="Messages with ${esc(otherName || first)}">
                <div class="sb-loading" role="status"><span class="sr-only">Loading…</span><span class="sb-skeleton" style="width:60%"></span><span class="sb-skeleton" style="width:44%;margin-left:auto"></span><span class="sb-skeleton" style="width:52%"></span></div>
            </div>
            <form class="msg-compose" novalidate>
                <div class="msg-replying" hidden><span class="msg-replying-text"></span><button type="button" class="msg-replying-x" aria-label="Cancel reply">×</button></div>
                <div class="msg-field">
                    <label class="sr-only" for="msgInput-${esc(otherUid)}">Message ${esc(first)}</label>
                    <textarea id="msgInput-${esc(otherUid)}" class="msg-input" data-emoji rows="1" maxlength="${MAX_MESSAGE}" placeholder="Message ${esc(first)}"></textarea>
                    <button type="submit" class="msg-send" aria-label="Send" disabled>${SEND_ARROW}</button>
                </div>
            </form>
            <p class="msg-error" role="alert" hidden></p>
        </div>`;
    const list = el.querySelector(".msg-list");
    const form = el.querySelector(".msg-compose");
    const input = el.querySelector(".msg-input");
    const sendBtn = el.querySelector(".msg-send");
    const errorEl = el.querySelector(".msg-error");
    let thread = [];
    let loaded = false;
    let sending = false;
    let typingAt = 0;
    let typingTimer = 0;
    let lastPing = 0;
    let replyTo = null;
    const replyBar = el.querySelector(".msg-replying");
    const shown = new Set();   // ids already drawn, so only new bubbles slide in
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const toBottom = () => { list.scrollTop = list.scrollHeight; };

    const readSoon = () => {
        if (document.visibilityState !== "visible") return;
        const unread = unreadFor(thread, role);
        if (unread.length) markRead(unread);
    };

    function typingHtml() {
        return `<div class="msg-typing" role="status" aria-label="${esc(first)} is typing"><i></i><i></i><i></i></div>`;
    }

    function syncTyping() {
        clearTimeout(typingTimer);
        const live = isTyping(typingAt);
        const have = list.querySelector(".msg-typing");
        if (live && !have && loaded) {
            const stick = nearBottom();
            list.insertAdjacentHTML("beforeend", typingHtml());
            if (stick) toBottom();
        } else if (!live && have) {
            have.remove();
        }
        if (live) typingTimer = setTimeout(syncTyping, 1500);
    }

    function draw() {
        const stick = !loaded || nearBottom();
        const days = threadDays(thread, { role });
        const items = days.flatMap(d => d.items);
        const lastItem = items[items.length - 1];
        list.innerHTML = days.length
            ? days.map(d => `<div class="msg-day"><span><b>${esc(d.label)}</b>${d.items[0].stamp ? ` ${esc(d.items[0].stamp)}` : ""}</span></div>${d.items.map((m, i) => `${i && m.stamp ? `<div class="msg-day"><span>${esc(m.stamp)}</span></div>` : ""}${bubbleHtml(m, loaded && m.id && !shown.has(m.id), role, first)}`).join("")}`).join("")
              + (lastItem?.mine ? `<div class="msg-receipt" aria-live="polite">${lastItem.id ? esc(seenLine(thread, role)) : "Sending…"}</div>` : "")
            : `<div class="msg-empty">${icon("messageSquare")}<strong>No messages yet</strong><span>${role === "coach"
                ? `Anything you send here, ${esc(first)} sees in the app${email ? " (and gets an email nudge)" : ""}.`
                : `Questions about a workout, how you're feeling, a change in your week: send it here and ${esc(first)} sees it.`}</span></div>`;
        items.forEach(m => { if (m.id) shown.add(m.id); });
        if (isTyping(typingAt)) list.insertAdjacentHTML("beforeend", typingHtml());
        if (stick) toBottom();
        loaded = true;
        syncTyping();
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

    const stopTyping = watchTyping(role, otherUid, at => { typingAt = at; syncTyping(); });
    const onVisible = () => readSoon();
    document.addEventListener("visibilitychange", onVisible);

    const grow = () => {
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
        sendBtn.disabled = sending || !input.value.trim();
        if (input.value.trim() && Date.now() - lastPing > 3000) { lastPing = Date.now(); pingTyping(role, otherUid); }
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
                role, otherUid, text, senderName: myName, thread, replyTo,
                email: email ? ({ text: t, senderName }) => email(t, senderName) : null
            });
            input.value = "";
            setReply(null);
            lastPing = 0;
            grow();
            toBottom();
            if (!reduceMotion.matches) sendBtn.animate([{ transform: "scale(.82)" }, { transform: "scale(1)" }], { duration: 220, easing: "cubic-bezier(.2,1.4,.4,1)" });
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

    function setReply(message) {
        replyTo = message ? { id: message.id, from: message.from, text: message.text } : null;
        replyBar.hidden = !replyTo;
        replyBar.querySelector(".msg-replying-text").textContent = replyTo ? `Replying to ${replyTo.from === role ? "yourself" : first}: ${preview(replyTo.text, 60)}` : "";
        if (replyTo) input.focus();
    }
    replyBar.querySelector(".msg-replying-x").addEventListener("click", () => setReply(null));

    async function unsend(id) {
        if (!(await sbConfirm(`${first} hasn't read it yet, so it disappears for both of you.`, { title: "Unsend this message?", confirmLabel: "Unsend", cancelLabel: "Keep it", danger: true }))) return;
        try {
            await unsendMessage(id);
            toast("Message unsent.");
        } catch (error) {
            toast(error?.code === "permission-denied" ? `${first} has already read it, so it stays.` : friendlyError(error, "unsend that"), { type: "error" });
        }
    }

    list.addEventListener("click", event => {
        const btn = event.target.closest("[data-unsend]");
        if (btn) return unsend(btn.dataset.unsend);
        const jump = event.target.closest("[data-jump]");
        const target = jump && [...list.querySelectorAll("[data-msg]")].find(r => r.dataset.msg === jump.dataset.jump);
        if (target) {
            target.scrollIntoView({ block: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
            target.classList.add("is-flash");
            setTimeout(() => target.classList.remove("is-flash"), 1200);
        }
    });

    // Press and hold a bubble (right-click on a computer): the chat blurs, the
    // bubble lifts, and Copy / Show time / Unsend sit under it.
    let pressTimer = 0;
    let pressStart = null;
    let press = null;
    function closePress() {
        press?.remove();
        press = null;
        document.removeEventListener("keydown", pressKey, true);
    }
    function pressKey(event) { if (event.key === "Escape") { event.stopPropagation(); closePress(); } }
    function openPress(row) {
        closePress();
        const bubble = row.querySelector(".msg-bubble");
        const id = row.dataset.msg;
        const msg = thread.find(x => x.id === id);
        const myReaction = msg?.reactions?.[role] || "";
        const mineUnread = row.classList.contains("is-mine") && id && row.querySelector("[data-unsend]");
        const r = bubble.getBoundingClientRect();
        const mine = row.classList.contains("is-mine");
        press = document.createElement("div");
        press.className = "msg-press";
        press.innerHTML = `
            <div class="msg-press-lift ${mine ? "is-mine" : "is-theirs"}" style="top:${Math.round(r.top)}px;${mine ? `right:${Math.round(window.innerWidth - r.right)}px` : `left:${Math.round(r.left)}px`};min-width:min(240px, 86vw)">
                ${id && msg ? `<div class="msg-press-react" role="group" aria-label="React">${QUICK_REACTIONS.map(e => `<button type="button" data-react="${e}" class="${e === myReaction ? "is-on" : ""}" aria-label="${esc(emojiById(e)?.label || e)}" aria-pressed="${e === myReaction}">${emojiImg(e, { size: 32 })}</button>`).join("")}</div>` : ""}
                <div class="msg-bubble${bubble.classList.contains("is-emoji") ? " is-emoji" : ""}" style="width:${Math.round(r.width)}px">${bubble.innerHTML}</div>
                <div class="msg-press-menu" role="menu">
                    ${id && msg ? `<button type="button" role="menuitem" data-act="reply"><span>Reply</span>${REPLY_ICON}</button>` : ""}
                    <button type="button" role="menuitem" data-act="copy"><span>Copy</span>${icon("copy")}</button>
                    <button type="button" role="menuitem" data-act="time"><span>Show time</span><em>${esc(row.querySelector(".msg-time")?.textContent.replace(" · sending", "") || "")}</em></button>
                    ${mineUnread ? `<button type="button" role="menuitem" class="is-danger" data-act="unsend"><span>Unsend</span></button>` : ""}
                </div>
            </div>`;
        document.body.appendChild(press);
        const lift = press.querySelector(".msg-press-lift");
        const menu = press.querySelector(".msg-press-menu");
        // Keep the whole lift on screen: slide up if the menu would run off the bottom.
        const overflow = lift.getBoundingClientRect().bottom - (window.innerHeight - 16);
        if (overflow > 0) lift.style.top = `${Math.max(16, Math.round(r.top - overflow))}px`;
        (press.querySelector(".msg-press-react button") || menu.querySelector("button"))?.focus({ preventScroll: true });
        document.addEventListener("keydown", pressKey, true);
        press.addEventListener("click", async event => {
            const react = event.target.closest("[data-react]")?.dataset.react;
            if (react && msg) {
                closePress();
                reactToMessage(msg, role, react === myReaction ? "" : react).catch(error => toast(friendlyError(error, "react to that"), { type: "error" }));
                return;
            }
            const act = event.target.closest("[data-act]")?.dataset.act;
            if (!act) { if (!event.target.closest(".msg-press-lift")) closePress(); return; }
            closePress();
            if (act === "copy") {
                try { await navigator.clipboard.writeText(plainText(row)); toast("Copied."); } catch { toast("Couldn't copy that.", { type: "error" }); }
            } else if (act === "time") {
                row.classList.toggle("show-time");
            } else if (act === "reply") {
                setReply(msg);
            } else if (act === "unsend") {
                unsend(id);
            }
        });
        navigator.vibrate?.(8);
    }
    list.addEventListener("pointerdown", event => {
        const row = event.target.closest(".msg-row");
        if (!row || event.target.closest("a, button") || event.button > 0 || event.pointerType === "mouse") return;
        pressStart = { x: event.clientX, y: event.clientY };
        pressTimer = setTimeout(() => openPress(row), 420);
    });
    const cancelPress = event => {
        if (event?.type === "pointermove" && pressStart && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) < 10) return;
        clearTimeout(pressTimer);
    };
    list.addEventListener("pointermove", cancelPress);
    list.addEventListener("pointerup", cancelPress);
    list.addEventListener("pointercancel", cancelPress);
    list.addEventListener("scroll", cancelPress, { passive: true });
    list.addEventListener("contextmenu", event => {
        const row = event.target.closest(".msg-row");
        if (!row || event.target.closest("a")) return;
        event.preventDefault();
        clearTimeout(pressTimer);
        openPress(row);
    });

    return {
        destroy() { stop(); stopTyping(); clearTimeout(typingTimer); clearTimeout(pressTimer); closePress(); document.removeEventListener("visibilitychange", onVisible); },
        focus() { input.focus(); }
    };
}
