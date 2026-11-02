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
    cleanStart, stepsFor, exampleWeek
} from "./startFlow.js";

const root = document.getElementById("startRoot");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let answers = readSaved();
let index = 0;
let busy = false;

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
const steps = () => [...stepsFor(answers), "ready"];
const stepName = () => steps()[Math.min(index, steps().length - 1)];
const labelOf = (list, value) => list.find(o => o.value === value)?.label || "";

function progress() {
    const total = steps().length - 1;
    return `<div class="st-steps" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i <= index && index < total ? "on" : index >= total ? "on" : ""}"></i>`).join("")}</div>`;
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
    const n = index + 1, total = steps().length - 1;
    const kicker = `<div class="st-kicker">Step ${n} of ${total}</div>`;
    if (step === "train") return {
        html: `${kicker}<h1 class="st-h1">What do you train?</h1><p class="st-sub">Pick the main one. You can add more later.</p>
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

function render({ focus = true } = {}) {
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
                   <p class="st-note">${index === 0 ? "No account yet. Your taps stay on this phone." : "&nbsp;"}</p>`}
        </div>
        <aside class="st-side" aria-label="Your sample week">${weekCard()}</aside>`;
    greeting();
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
        if (ok) { location.href = "index.html"; return; }
    } catch (error) { console.warn("Southbound: start sign-in failed.", error); }
    busy = false; render({ focus: false });
}

root.addEventListener("click", event => {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    const v = el.dataset.v;
    switch (el.dataset.act) {
        case "sport": answers = { ...answers, sport: v, goal: answers.sport === v ? answers.goal : "", now: answers.sport === v ? answers.now : "" }; update(); break;
        case "goal": answers = { ...answers, goal: v }; update(); break;
        case "now": answers = { ...answers, now: v }; update(); break;
        case "mark": answers = { ...answers, mark: v }; update(); break;
        case "day": answers = { ...answers, days: answers.days.includes(v) ? answers.days.filter(d => d !== v) : [...answers.days, v] }; update(); break;
        case "next": if (index < steps().length - 1) { index++; render(); window.scrollTo(0, 0); } break;
        case "back": if (index > 0) { index--; render(); window.scrollTo(0, 0); } break;
        case "google": signIn(); break;
    }
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
import("./auth.js").then(({ listenForAuth }) => listenForAuth(user => { if (user && !busy) location.replace("index.html"); })).catch(() => {});

render({ focus: false });
