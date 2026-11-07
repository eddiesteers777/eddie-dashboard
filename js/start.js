/* ==========================================
   Southbound — Get started (start.html)

   A few quick taps before anyone is asked to sign in. Each tap is saved on
   the device (sb-start-answers). The last screen shows the person's sample
   week and the Google button; at first sign-in js/auth.js sets the answers
   aside and js/startCarry.js writes them into the account.
   The questions and the sample week are js/startFlow.js (pure, tested).
========================================== */
import {
    START_KEY, SPORTS, GOALS, NOW, MARKS, DAY_LABELS,
    cleanStart, stepsFor, exampleWeek, leaveSummary, hasAnswers, accentFor,
    parseInvite, inviteSteps, INVITE_WORDS
} from "./startFlow.js";

const root = document.getElementById("startRoot");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let answers = readSaved();
// A personal invite link (?for=Jake&sport=soccer) sets the sport and name and adds a welcome screen.
const found = parseInvite(location.search);
let invite = found && !found.bad ? found : null;
const badInvite = Boolean(found?.bad);
if (invite) {
    const same = answers.sport === invite.sport;
    answers = cleanStart({ ...answers, sport: invite.sport, name: invite.name || answers.name, goal: same ? answers.goal : "", now: same ? answers.now : "" });
    try { localStorage.setItem(START_KEY, JSON.stringify(answers)); } catch { /* fine */ }
}
let index = 0;
let busy = false;
let picked = null;      // the card just tapped, so only it animates
let stepMoved = false;  // true right after Continue/Back, so the progress segment fills

function readSaved() {
    try { return cleanStart(JSON.parse(localStorage.getItem(START_KEY) || "{}")); } catch { return cleanStart({}); }
}
function save() {
    try { localStorage.setItem(START_KEY, JSON.stringify(answers)); } catch { /* the taps just won't survive a reload */ }
}

const ICONS = {
    running: '<path d="M4 17l3-4 3 2 3-5 4 3"/><circle cx="17" cy="6" r="1.6"/>',
    strength: '<path d="M3 12h2M19 12h2M5 8v8M19 8v8M8 6v12M16 6v12M8 12h8"/>',
    soccer: '<circle cx="12" cy="12" r="8"/><path d="M12 8l3 2-1 4h-4l-1-4z"/>',
    general: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z"/>'
};
const svg = path => `<svg class="st-ic" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
const steps = () => [...(invite ? inviteSteps(answers) : stepsFor(answers)), "ready"];
const offset = () => (invite ? 1 : 0);
const stepName = () => steps()[Math.min(index, steps().length - 1)];
const labelOf = (list, value) => list.find(o => o.value === value)?.label || "";

function progress() {
    const total = steps().length - 1 - offset(), at = index - offset();
    return `<div class="st-steps" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i <= at ? "on" : ""} ${stepMoved && i === at ? "fill" : ""}"></i>`).join("")}</div>`;
}

function weekCard() {
    const w = exampleWeek(answers);
    const goal = GOALS[answers.sport]?.find(g => g.value === answers.goal)?.label;
    const plan = Object.fromEntries(w.plan.map(p => [p.day, p]));
    const longest = w.plan.length > 2 ? w.plan[w.plan.length - 1].day : "";
    return `<div class="st-prev st-glass">
        <div class="st-prev-h"><span class="st-prev-t">Your week</span><span class="st-tag">Example</span></div>
        <div class="st-pills"><span>${esc(labelOf(SPORTS, answers.sport) || "What you train")}</span><span>${esc(goal || "Your goal")}</span><span>${w.sessions ? `${w.sessions} day${w.sessions === 1 ? "" : "s"}` : "Pick days"}</span></div>
        <div class="st-wk">${DAY_LABELS.map(([id, name]) => `<div class="${plan[id] ? "on" : ""} ${id === longest ? "long" : ""}">${name}<span>${plan[id] ? `${esc(plan[id].label)} ${plan[id].minutes}` : "Rest"}</span></div>`).join("")}</div>
        <div class="st-stat"><div><b>${w.sessions}</b><span>Days a week</span></div><div><b>${w.minutes}</b><span>Min a week</span></div><div><b>${w.longest}</b><span>Longest</span></div></div>
        <p class="st-note" style="text-align:left">Eddie writes your real week by hand. This shows how it will look.</p>
    </div>`;
}

const optCard = (action, value, label, sub, on, icon) =>
    `<button type="button" class="st-opt st-glass ${on ? "on" : ""}" data-act="${action}" data-v="${esc(value)}" aria-pressed="${on}">${icon ? svg(icon) : ""}<span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}</button>`;

function body(step) {
    const n = index + 1 - offset(), total = steps().length - 1 - offset();
    const note = badInvite && index === 0 ? `<div class="st-warn" role="status">That invite link didn't open the way it should. No problem. Pick what you train and we'll set it up.</div>` : "";
    const kicker = `<div class="st-kicker">Step ${n} of ${total}</div>`;
    if (step === "welcome") {
        const word = INVITE_WORDS[answers.sport];
        return {
            html: `<div class="st-kicker">Set up for you</div><div class="st-tile st-tile-lg">${svg(ICONS[answers.sport])}</div>
                <h1 class="st-h1">${answers.name ? `${esc(answers.name)}, let's` : "Let's"} build your ${word} week</h1>
                <p class="st-sub">Eddie set this up for you. ${steps().length - 2} quick taps, then sign in to save it. No form, no password.</p>`,
            ok: true, cta: "Start",
            after: `<p class="st-note">${answers.name ? `Not ${esc(answers.name)}?` : "Not for you?"} <button type="button" class="st-link" data-act="restart">Start from the beginning</button></p>`
        };
    }
    if (step === "train") return {
        html: `${note}${kicker}<h1 class="st-h1">What do you train?</h1><p class="st-sub">Pick the main one. You can add more later.</p>
            <div class="st-opts">${SPORTS.map(s => optCard("sport", s.value, s.label, s.sub, answers.sport === s.value, ICONS[s.value])).join("")}</div>`,
        ok: Boolean(answers.sport), cta: "Continue"
    };
    if (step === "you") return {
        html: `${kicker}<h1 class="st-h1">Make it yours</h1><p class="st-sub">Your name and a mark. Change them any time.</p>
            <div class="st-sec"><h2 id="stNameL">What should we call you?</h2><input class="st-field st-glass" id="stName" type="text" maxlength="40" autocomplete="given-name" enterkeyhint="done" placeholder="First name" aria-labelledby="stNameL" value="${esc(answers.name)}"></div>
            <div class="st-sec"><h2>Your mark</h2><div class="st-marks">${MARKS.map(m => `<button type="button" class="st-mk st-glass ${answers.mark === m.value ? "on" : ""}" data-act="mark" data-v="${m.value}" aria-label="${m.label}" aria-pressed="${answers.mark === m.value}"><svg viewBox="0 0 24 24" aria-hidden="true">${m.path}</svg></button>`).join("")}</div></div>
            <div class="st-hi st-glass" id="stHi"></div>`,
        ok: true, cta: "Continue"
    };
    if (step === "goal") return {
        html: `${kicker}<h1 class="st-h1">${answers.sport === "running" ? "What are you working toward?" : "What do you want most?"}</h1>
            <div class="st-opts">${GOALS[answers.sport].map(g => optCard("goal", g.value, g.label, g.sub, answers.goal === g.value)).join("")}</div>`,
        ok: Boolean(answers.goal), cta: "Continue"
    };
    if (step === "now") {
        const q = NOW[answers.sport];
        return {
            html: `${kicker}<h1 class="st-h1">${q.title}</h1><p class="st-sub">${q.sub}</p>
                <div class="st-list">${q.options.map(o => optCard("now", o.value, o.label, "", answers.now === o.value)).join("")}</div>`,
            ok: Boolean(answers.now), cta: "Continue"
        };
    }
    if (step === "days") return {
        html: `${kicker}<h1 class="st-h1">Which days can you train?</h1><p class="st-sub">Watch your week fill in.</p>
            <div class="st-days" role="group" aria-label="Days you can train">${DAY_LABELS.map(([id, name]) => `<button type="button" class="st-day st-glass ${answers.days.includes(id) ? "on" : ""}" data-act="day" data-v="${id}" aria-pressed="${answers.days.includes(id)}" aria-label="${name}">${name[0]}<small>${name}</small></button>`).join("")}</div>
            <div class="st-inline">${weekCard()}</div>`,
        ok: answers.days.length > 0, cta: "See your week"
    };
    const name = answers.name;
    return {
        html: `<div class="st-kicker">Ready</div><h1 class="st-h1">${name ? `${esc(name)}, your week is set up` : "Your week is set up"}</h1>
            <p class="st-sub">Save it to your account so Eddie can see it.</p><div class="st-inline">${weekCard()}</div>`,
        ok: true, google: true
    };
}

function greeting() {
    const el = document.getElementById("stHi");
    if (!el) return;
    const mark = MARKS.find(m => m.value === answers.mark) || MARKS[0];
    el.innerHTML = `<div class="st-tile"><svg viewBox="0 0 24 24" aria-hidden="true">${mark.path}</svg></div><div><small>Good morning</small><b>${esc(answers.name || "You")}</b></div>`;
}

function tint() {
    const { ac, glow } = accentFor(answers);
    document.body.style.setProperty("--ac", ac);
    document.body.style.setProperty("--st-glow", glow);
}

function render({ focus = true } = {}) {
    tint();
    const step = stepName();
    const b = body(step);
    const last = step === "ready";
    root.innerHTML = `<div class="st-top">
            <button type="button" class="st-back" data-act="back" aria-label="Back" ${index === 0 ? "disabled" : ""}>‹</button>
            ${last ? '<span class="st-brand">Southbound</span>' : progress()}
            <span style="width:44px"></span>
        </div>
        <div class="st-main">${b.html}<div class="st-spacer"></div>
            ${b.google
                ? `<button type="button" class="st-cta" data-act="google" ${busy ? "disabled" : ""}><span class="st-g" aria-hidden="true">G</span>${busy ? "Signing in…" : "Continue with Google"}</button>
                   <p class="st-note">Your answers go into your profile. Nothing is shared until you continue. <a href="privacy.html">Privacy</a></p>
                   <p class="st-note">Already have an account? <button type="button" class="st-link" data-act="google">Sign in</button></p>
                   <p class="st-note">Not ready to sign in? <a href="apply.html">Send an application without an account</a></p>`
                : `<button type="button" class="st-cta" data-act="next" ${b.ok ? "" : "disabled"}>${b.cta}</button>
                   ${b.after || `<p class="st-note">${index === offset() ? "No account yet. Your taps stay on this phone." : "&nbsp;"}</p>`}`}
        </div>
        <aside class="st-side" aria-label="Your sample week">${weekCard()}</aside>`;
    greeting();
    if (picked) {
        const el = [...root.querySelectorAll("[data-act]")].find(e => e.dataset.act === picked.act && e.dataset.v === picked.v);
        if (el) el.classList.add("st-pop");
        picked = null;
    }
    stepMoved = false;
    if (focus) root.querySelector("h1")?.setAttribute("tabindex", "-1"), root.querySelector("h1")?.focus({ preventScroll: true });
}

function update() {
    save();
    // Changing the sport changes which steps exist and which goal still fits.
    answers = cleanStart(answers);
    render({ focus: false });
}

async function signIn() {
    if (busy) return;
    busy = true; render({ focus: false });
    try {
        const { login } = await import("./auth.js");
        const ok = await login();
        if (ok) { leaving = true; location.href = "index.html"; return; }
    } catch (error) { console.warn("Southbound: start sign-in failed.", error); }
    busy = false; render({ focus: false });
}

root.addEventListener("click", event => {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    const v = el.dataset.v;
    if (v !== undefined && !["next", "back", "google"].includes(el.dataset.act)) {
        picked = { act: el.dataset.act, v };
        try { navigator.vibrate?.(8); } catch { /* not every phone */ }
    }
    switch (el.dataset.act) {
        case "sport": answers = { ...answers, sport: v, goal: answers.sport === v ? answers.goal : "", now: answers.sport === v ? answers.now : "" }; update(); break;
        case "goal": answers = { ...answers, goal: v }; update(); break;
        case "now": answers = { ...answers, now: v }; update(); break;
        case "mark": answers = { ...answers, mark: v }; update(); break;
        case "day": answers = { ...answers, days: answers.days.includes(v) ? answers.days.filter(d => d !== v) : [...answers.days, v] }; update(); break;
        case "next": if (index < steps().length - 1) { index++; stepMoved = true; render(); window.scrollTo(0, 0); } break;
        case "back": if (index > 0) { index--; stepMoved = true; render(); window.scrollTo(0, 0); } break;
        case "google": signIn(); break;
        case "restart":
            invite = null; answers = cleanStart({}); index = 0; save();
            try { history.replaceState(null, "", "start.html"); } catch { /* fine */ }
            render(); window.scrollTo(0, 0); break;
    }
});

// ---- Before you go: leaving without saving shows what would be lost (loss aversion, shown honestly) ----
let leaving = false;
let pendingLeave = null;
let leaveDialog = null;

function openLeave(after) {
    const sum = leaveSummary(answers);
    if (leaving || !sum.any || busy) return false;
    pendingLeave = after;
    if (!leaveDialog) {
        leaveDialog = document.createElement("dialog");
        leaveDialog.className = "st-leave";
        leaveDialog.addEventListener("click", e => { if (e.target === leaveDialog) leaveDialog.close(); });
        leaveDialog.addEventListener("click", e => {
            const act = e.target.closest("[data-leave]")?.dataset.leave;
            if (act === "save") { leaveDialog.close(); signIn(); }
            if (act === "lose") {
                leaving = true;
                try { localStorage.removeItem(START_KEY); } catch { /* fine */ }
                leaveDialog.close();
                if (pendingLeave) pendingLeave();
            }
        });
        document.body.append(leaveDialog);
    }
    leaveDialog.innerHTML = `<div class="st-leave-card st-glass" aria-labelledby="stLeaveH">
        <div class="st-kicker">Before you go</div>
        <h2 id="stLeaveH">${sum.name ? `${esc(sum.name)}, your` : "Your"} week isn't saved yet</h2>
        <p>Leave now and these are gone from this phone.</p>
        <ul>${sum.items.map(i => `<li>${esc(i.label)}<span>${esc(i.tag)}</span></li>`).join("")}</ul>
        <button type="button" class="st-cta st-cta-keep" data-leave="save"><span class="st-g" aria-hidden="true">G</span>Save my week with Google</button>
        <button type="button" class="st-lose" data-leave="lose">I'll lose it</button>
    </div>`;
    leaveDialog.showModal();
    return true;
}

// Links that leave the page (the no-account application, Privacy).
root.addEventListener("click", event => {
    const a = event.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    if (openLeave(() => { location.href = a.href; })) event.preventDefault();
}, true);

// The phone's back gesture: keep one extra history entry so back lands here first.
try { history.pushState({ stGuard: true }, ""); } catch { /* fine */ }
window.addEventListener("popstate", () => {
    if (leaving) return;
    try { history.pushState({ stGuard: true }, ""); } catch { /* fine */ }
    openLeave(() => history.go(-2));
});

// Closing the tab: a browser can only show its own plain box here.
window.addEventListener("beforeunload", event => {
    if (leaving || busy || !hasAnswers(answers)) return;
    event.preventDefault();
    event.returnValue = "";
});

root.addEventListener("input", event => {
    if (event.target.id !== "stName") return;
    answers = { ...answers, name: event.target.value.slice(0, 40) };
    save();
    greeting();
});
root.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.id === "stName") { event.preventDefault(); root.querySelector('[data-act="next"]')?.click(); }
});

// Someone who is already signed in has no use for this page.
import("./auth.js").then(({ listenForAuth }) => listenForAuth(user => { if (user && !busy) { leaving = true; location.replace("index.html"); } })).catch(() => {});

render({ focus: false });
