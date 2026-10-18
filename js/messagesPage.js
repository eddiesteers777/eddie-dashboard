/* ==========================================
   Southbound — Messages (messages.html), the client's side

   The thread with their coach (js/messageView.js). With more than one
   coach, a chip per coach picks the thread (?coach=<uid> deep-links).
   Not linked to a coach yet: a pointer to Connect with Your Coach. The
   coach's own threads live in each client's hub (Messages tab).
========================================== */

import { listenForAuth } from "./auth.js";
import { listMyCoaches } from "./coachAccess.js";
import { cachedRole } from "./role.js";
import { mountThread, enterFullScreen } from "./messageView.js";
import { sendClientMessageEmail } from "./emailNotify.js";
import { emptyHtml } from "./ui.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let started = false;
let view = null;
let leaveFull = null;
let onlyCoach = false;   // one coach: the thread fills a phone screen

function setSubtitle(text) {
    const el = $("msgSubtitle");
    el.textContent = text;
    el.classList.remove("sb-wait");
}

function open(coach, user) {
    view?.destroy();
    const name = coach.coachName || "your coach";
    setSubtitle(`You and ${name}. Questions, how a workout felt, a change in your week.`);
    document.querySelectorAll("[data-coach]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.coach === coach.coachUid)));
    view = mountThread($("msgThread"), {
        role: "client",
        otherUid: coach.coachUid,
        otherName: name,
        myName: user.displayName || "",
        header: { name, sub: "Your coach", back: document.referrer && new URL(document.referrer).origin === location.origin ? "" : "index.html" },
        email: text => sendClientMessageEmail({ clientName: user.displayName || "A client", clientUid: user.uid, text })
    });
    leaveFull?.();
    leaveFull = null;
    const host = $("msgThread");
    host.classList.toggle("is-full", onlyCoach);
    if (onlyCoach && window.matchMedia("(max-width: 600px)").matches) leaveFull = enterFullScreen(host);
    host.querySelector(".msg-head-back")?.addEventListener("click", event => {
        if (history.length > 1 && document.referrer) { event.preventDefault(); history.back(); }
    });
    import("./icons.js").then(m => m.hydrate());
}

listenForAuth(async user => {
    if (!user || started) return;
    started = true;

    if (cachedRole() === "coach") {
        setSubtitle("Your conversations with clients.");
        $("msgThread").innerHTML = `<div class="clients-card"><p class="clients-card-note">Each client's messages are on their page: open a client from <a href="clients.html">My Clients</a> and choose the Messages tab. New messages also show on your <a href="coach.html">Coach Dashboard</a>.</p></div>`;
        return;
    }

    const coaches = await listMyCoaches().catch(() => []);
    if (!coaches.length) {
        setSubtitle("Talk to your coach here once you're connected.");
        $("msgThread").innerHTML = emptyHtml({
            iconName: "messageSquare",
            title: "You're not connected to a coach yet",
            text: "Once your coach approves you (or you share your code with them), your conversation shows here.",
            actionHref: "clients.html?tab=share",
            actionLabel: "Connect with your coach"
        });
        import("./icons.js").then(m => m.hydrate());
        return;
    }

    const wanted = new URLSearchParams(location.search).get("coach");
    const first = coaches.find(c => c.coachUid === wanted) || coaches[0];
    if (coaches.length > 1) {
        const nav = $("msgCoaches");
        nav.hidden = false;
        nav.innerHTML = coaches.map(c => `<button type="button" class="msg-coach-chip" data-coach="${esc(c.coachUid)}" aria-pressed="false">${esc(c.coachName || "Coach")}</button>`).join("");
        nav.addEventListener("click", event => {
            const btn = event.target.closest("[data-coach]");
            const coach = btn && coaches.find(c => c.coachUid === btn.dataset.coach);
            if (coach) open(coach, user);
        });
    }
    onlyCoach = coaches.length === 1;
    open(first, user);
});
