/* ==========================================
   Southbound — Apply (public site)

   Anyone can apply, no account needed: one question per screen, answered
   with taps (the questions and their choices are js/applicationForm.js;
   the look is css/intake.css, shared with the client's guided profile).
   The application is saved to "applications" (js/applications.js), which
   only the coach can read, and the coach gets the usual email alert.

   Someone who happens to be signed in gets their name and email filled
   in, and the application is also written onto their account the old way
   (plus the standing invite code), so the coach's Approve links them in
   one step. Everyone else is matched to their account by email when they
   sign in later (My Clients → Pending).
========================================== */

import {
    STEPS, WHO, AGE_RANGES, SERVICE_OPTIONS, START_WHEN, COACHED_BEFORE, HEARD_FROM, CONTACT_BY, CONTACT_TIME,
    screenProblem, applicationProblem, cleanApplication, applyGoalIdeas, LIMITS
} from "./applicationForm.js";
import { icon } from "./icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DRAFT_KEY = "sb-apply-draft";
const loadedAt = Date.now();

const root = document.getElementById("applyGuide");
const trap = document.getElementById("sbLeaveEmpty");

let answers = readDraft();
let step = "who";
let signedInUser = null;
let status = "";

// ?service=soccer_group (from Packages / Soccer) picks that service to start.
const wanted = new URLSearchParams(location.search).get("service");
if (SERVICE_OPTIONS.some(o => o.value === wanted) && !(answers.services || []).length) answers.services = [wanted];

function readDraft() {
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}") || {}; } catch { return {}; }
}
function saveDraft() {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(answers)); } catch { /* fine */ }
}

const child = () => answers.who && answers.who !== "self";
const them = () => (child() ? (String(answers.athleteName || "").trim() || "they") : "you");

// ---------- building blocks ----------
const chip = (label, { on = false, attrs = "", big = false } = {}) =>
    `<button type="button" class="ig-chip${big ? " is-big" : ""}${on ? " is-on" : ""}" aria-pressed="${on}" ${attrs}><span>${esc(label)}</span></button>`;

function screen({ title, sub = "", body = "", next = "Next", nextAct = "next", showNext = true }) {
    const i = STEPS.indexOf(step);
    return `
        <div class="ig-card">
            <div class="ig-progress" aria-label="Question ${i + 1} of ${STEPS.length}">
                <div class="ig-progress-text">Question ${i + 1} of ${STEPS.length}</div>
                <div class="ig-bar"><span style="width:${Math.round((i / STEPS.length) * 100)}%"></span></div>
            </div>
            <h2 class="ig-title" tabindex="-1">${esc(title)}</h2>
            ${sub ? `<p class="ig-sub">${sub}</p>` : ""}
            <div class="ig-body">${body}</div>
            <p class="ig-error" role="alert" hidden></p>
            <div class="ig-foot">
                ${i > 0 ? `<button type="button" class="sb-btn sb-btn-tertiary ig-back" data-back>${icon("chevronLeft")} Back</button>` : "<span></span>"}
                <div class="ig-foot-right">
                    ${showNext ? `<button type="button" class="sb-btn sb-btn-primary" data-act="${nextAct}">${esc(next)}</button>` : ""}
                </div>
            </div>
            <p class="ig-status" role="status" aria-live="polite">${esc(status)}</p>
        </div>`;
}

const SCREENS = {
    who: () => screen({
        title: "Who's training?",
        body: `
            <div class="ig-chips">${WHO.map(o => chip(o.label, { on: answers.who === o.value, attrs: `data-set="who" data-value="${o.value}"` })).join("")}</div>
            <label class="ig-q" for="apName">${child() ? "Your name (parent or guardian)" : "Your name"}</label>
            <input id="apName" class="ig-input" data-field="name" type="text" maxlength="${LIMITS.name}" autocomplete="name" value="${esc(answers.name || "")}">
            ${child() ? `
                <label class="ig-q" for="apAthlete">Their first name</label>
                <input id="apAthlete" class="ig-input" data-field="athleteName" type="text" maxlength="${LIMITS.athleteName}" autocomplete="off" value="${esc(answers.athleteName || "")}">` : ""}`
    }),

    age: () => screen({
        title: child() ? `How old is ${them()}?` : "How old are you?",
        sub: "Roughly is fine.",
        showNext: Boolean(answers.ageRange),
        body: `<div class="ig-chips">${AGE_RANGES.map(o => chip(o.label, { on: answers.ageRange === o.value, attrs: `data-pick="ageRange" data-value="${o.value}"` })).join("")}</div>`
    }),

    services: () => screen({
        title: "What are you interested in?",
        sub: "Tap all that apply.",
        body: `<div class="ig-grid">${SERVICE_OPTIONS.map(o => chip(o.label, { big: true, on: (answers.services || []).includes(o.value), attrs: `data-toggle="services" data-value="${o.value}"` })).join("")}</div>`
    }),

    goal: () => {
        const ideas = applyGoalIdeas(answers.services);
        const own = ideas.includes(answers.goal) ? "" : (answers.goal || "");
        return screen({
            title: child() ? `What's the main goal for ${them()}?` : "What's the main thing you want to achieve?",
            sub: "Tap one, or say it in your own words.",
            body: `
                <div class="ig-chips">${ideas.map(g => chip(g, { on: answers.goal === g, attrs: `data-pick="goal" data-value="${esc(g)}"` })).join("")}</div>
                <label class="ig-q" for="apGoal">Or in your own words</label>
                <input id="apGoal" class="ig-input" data-field="goal" type="text" maxlength="${LIMITS.goal}" placeholder="e.g. Break 25 minutes in the 5K" value="${esc(own)}">`
        });
    },

    start: () => screen({
        title: "How soon would you like to start?",
        showNext: Boolean(answers.startWhen),
        body: `<div class="ig-grid">${START_WHEN.map(o => chip(o.label, { big: true, on: answers.startWhen === o.value, attrs: `data-pick="startWhen" data-value="${o.value}"` })).join("")}</div>`
    }),

    coached: () => screen({
        title: child() ? `Has ${them()} worked with a coach before?` : "Have you worked with a coach before?",
        showNext: Boolean(answers.coachedBefore),
        body: `<div class="ig-grid">${COACHED_BEFORE.map(o => chip(o.label, { big: true, on: answers.coachedBefore === o.value, attrs: `data-pick="coachedBefore" data-value="${o.value}"` })).join("")}</div>`
    }),

    heard: () => {
        const option = HEARD_FROM.find(o => o.value === answers.heardFrom);
        return screen({
            title: "How did you hear about Southbound?",
            showNext: Boolean(answers.heardFrom),
            body: `
                <div class="ig-chips">${HEARD_FROM.map(o => chip(o.label, { on: answers.heardFrom === o.value, attrs: `data-pick="heardFrom" data-value="${o.value}"` })).join("")}</div>
                ${option?.ask ? `
                    <label class="ig-q" for="apHeard">${esc(option.ask)} <span class="ig-light">(optional)</span></label>
                    <input id="apHeard" class="ig-input" data-field="heardDetail" type="text" maxlength="${LIMITS.heardDetail}" value="${esc(answers.heardDetail || "")}">` : ""}`
        });
    },

    contact: () => screen({
        title: "How can I reach you?",
        sub: "An email or a phone number, whichever you'd rather.",
        body: `
            <label class="ig-q" for="apEmail">Email</label>
            <input id="apEmail" class="ig-input" data-field="email" type="email" inputmode="email" autocomplete="email" maxlength="${LIMITS.email}" value="${esc(answers.email || "")}">
            <label class="ig-q" for="apPhone">Phone</label>
            <input id="apPhone" class="ig-input" data-field="phone" type="tel" autocomplete="tel" maxlength="${LIMITS.phone}" value="${esc(answers.phone || "")}">
            <div class="ig-q">Best way to reach you <span class="ig-light">(optional)</span></div>
            <div class="ig-chips">${CONTACT_BY.map(o => chip(o.label, { on: (answers.contactBy || []).includes(o.value), attrs: `data-toggle="contactBy" data-value="${o.value}"` })).join("")}</div>
            <div class="ig-q">Best time <span class="ig-light">(optional)</span></div>
            <div class="ig-chips">${CONTACT_TIME.map(o => chip(o.label, { on: (answers.contactTime || []).includes(o.value), attrs: `data-toggle="contactTime" data-value="${o.value}"` })).join("")}</div>`
    }),

    extra: () => screen({
        title: "Anything else I should know?",
        sub: "Optional: an injury, a schedule thing, a question.",
        next: "Send application",
        nextAct: "send",
        body: `<textarea id="apMessage" class="ig-input" data-field="message" rows="4" maxlength="${LIMITS.message}">${esc(answers.message || "")}</textarea>`
    })
};

// ---------- drawing and moving ----------
function render() {
    root.innerHTML = SCREENS[step]();
}

function go(next, { push = true } = {}) {
    step = next;
    status = "";
    if (push) history.pushState({ apStep: next }, "", `#${next}`);
    render();
    root.scrollIntoView({ block: "start", behavior: "instant" });
    root.querySelector(".ig-title")?.focus({ preventScroll: true });
}

function showError(text) {
    const el = root.querySelector(".ig-error");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
}

function readFields() {
    root.querySelectorAll("[data-field]").forEach(el => {
        // An empty "own words" box doesn't undo a goal idea they tapped.
        if (el.dataset.field === "goal" && !el.value.trim() && root.querySelector('[data-pick="goal"].is-on')) return;
        answers[el.dataset.field] = el.value;
    });
    saveDraft();
}

function next() {
    readFields();
    const problem = screenProblem(step, answers);
    if (problem) { showError(problem); return; }
    go(STEPS[STEPS.indexOf(step) + 1]);
}

window.addEventListener("popstate", event => {
    const target = event.state?.apStep;
    if (target && STEPS.includes(target)) go(target, { push: false });
});

root.addEventListener("input", event => {
    if (!event.target.dataset.field) return;
    answers[event.target.dataset.field] = event.target.value;
    // Typing your own goal un-picks the idea.
    if (event.target.dataset.field === "goal") root.querySelectorAll('[data-pick="goal"]').forEach(b => { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); });
    saveDraft();
    showError("");
});

root.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.matches("input.ig-input")) {
        event.preventDefault();
        root.querySelector("[data-act]")?.click();
    }
});

root.addEventListener("click", event => {
    const t = event.target.closest("button");
    if (!t) return;
    const d = t.dataset;

    if ("back" in d) { readFields(); history.back(); return; }
    if (d.act === "next") { next(); return; }
    if (d.act === "send") { send(); return; }

    // Who's training: redraw to show or hide their name.
    if (d.set) {
        readFields();
        answers[d.set] = d.value;
        saveDraft();
        render();
        root.querySelector(answers.who === "self" ? "#apName" : "#apAthlete")?.focus();
        return;
    }
    // A single pick answers the question and moves on (except where a
    // follow-up box appears).
    if (d.pick) {
        readFields();
        answers[d.pick] = d.value;
        if (d.pick === "goal") { const own = root.querySelector("#apGoal"); if (own) own.value = ""; }
        if (d.pick === "heardFrom" && !HEARD_FROM.find(o => o.value === d.value)?.ask) answers.heardDetail = "";
        saveDraft();
        if (d.pick === "heardFrom" && HEARD_FROM.find(o => o.value === d.value)?.ask) {
            render();
            root.querySelector("#apHeard")?.focus();
            return;
        }
        go(STEPS[STEPS.indexOf(step) + 1]);
        return;
    }
    if (d.toggle) {
        const list = new Set(answers[d.toggle] || []);
        list.has(d.value) ? list.delete(d.value) : list.add(d.value);
        answers[d.toggle] = [...list];
        t.classList.toggle("is-on", list.has(d.value));
        t.setAttribute("aria-pressed", list.has(d.value));
        saveDraft();
        showError("");
    }
});

// ---------- sending ----------
async function send() {
    readFields();
    const problem = applicationProblem(answers);
    if (problem) {
        // Jump back to the question that still needs an answer.
        const where = STEPS.find(s => screenProblem(s, answers));
        if (where && where !== step) { go(where); showError(problem); } else showError(problem);
        return;
    }
    // A bot filled the hidden field, or raced through faster than a person
    // could tap: act like it worked, save nothing.
    if (trap?.value || Date.now() - loadedAt < 4000) { done(); return; }

    const btn = root.querySelector('[data-act="send"]');
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
        const [{ sendApplication }, { sendApplicationEmail }] = await Promise.all([import("./applications.js"), import("./emailNotify.js")]);
        // Firestore waits indefinitely on a blocked connection (a school
        // filter); give up after 15 s so they see an error.
        await Promise.race([
            sendApplication(answers, signedInUser?.uid || ""),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000))
        ]);
        sendApplicationEmail(cleanApplication(answers)).catch(() => {});
        if (signedInUser) alsoOnAccount().catch(() => {});
        done();
    } catch (error) {
        console.error("Application failed:", error);
        // Saving was refused (the rules for "applications" aren't published
        // yet): the email alert still carries every answer, so it isn't lost.
        if (error?.code === "permission-denied") {
            const { sendApplicationEmail } = await import("./emailNotify.js");
            if (await sendApplicationEmail(cleanApplication(answers)).catch(() => false)) {
                if (signedInUser) alsoOnAccount().catch(() => {});
                done();
                return;
            }
        }
        showError(error.message === "timeout"
            ? "This is taking too long — your network may be blocking it. Try again on another connection (like cell data)."
            : "Couldn't send your application. Check your connection and try again.");
        btn.disabled = false;
        btn.textContent = "Send application";
    }
}

// Signed in: also put it on their account and leave the standing invite,
// so Approve links them in one step (js/coachAccess.js).
async function alsoOnAccount() {
    const [{ submitApplication }, { ensureApplyCode }] = await Promise.all([import("./userProfile.js"), import("./coachAccess.js")]);
    await submitApplication(answers.services || [], String(answers.goal || "").trim());
    await ensureApplyCode();
}

function done() {
    const first = String(answers.name || "").trim().split(/\s+/)[0];
    const by = (answers.contactBy || []).length
        ? `by ${answers.contactBy.map(v => CONTACT_BY.find(o => o.value === v).label.toLowerCase()).join(" or ")}`
        : answers.email && answers.phone ? "by email or phone" : answers.email ? "by email" : "by phone";
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* fine */ }
    history.replaceState(null, "", location.pathname + location.search);
    root.innerHTML = `
        <div class="ig-card pub-apply-done">
            <div class="pub-card-icon" style="margin:0 auto 12px;">${icon("checkCircle")}</div>
            <h2 class="ig-title" tabindex="-1">Application sent</h2>
            <p class="ig-sub">Thanks${first ? `, ${esc(first)}` : ""} — I'll get back to you ${esc(by)} soon. If it's a fit, I'll send you a link to set up the Southbound app.</p>
            <div class="ig-foot">
                <a class="sb-btn sb-btn-tertiary" href="packages.html">See packages</a>
                <a class="sb-btn sb-btn-primary" href="home.html">Back to home</a>
            </div>
        </div>`;
    root.querySelector(".ig-title")?.focus();
}

// ---------- start ----------
history.replaceState({ apStep: step }, "", location.pathname + location.search);
render();

// Signed in already? Fill in their name and email (never required).
import("./auth.js").then(({ listenForAuth }) => listenForAuth(user => {
    if (!user) return;
    signedInUser = user;
    if (!answers.name && user.displayName) answers.name = user.displayName;
    if (!answers.email && user.email) answers.email = user.email;
    if (step === "who") render();
})).catch(() => { /* signing in isn't needed to apply */ });
