/* ==========================================
   Southbound — the guided profile on profile.html

   One question per screen, answered mostly with taps (the question list
   and rules are js/intakeFlow.js). Six essentials first, then "Got 2 more
   minutes?" for the optional ones, then a review of everything with
   Change on each answer. Every answer is saved as soon as it's given
   (clientRecords/{uid} through js/clientRecords.js, the same save the full
   form uses), so leaving halfway loses nothing and the next visit picks
   up at the first open question. Offline it's kept on the phone and sent
   later (js/offlineWrite.js).

   mountIntakeGuide(container, { clientUid, record, prefill, suggestion, onFullForm })
     prefill     starting answers that aren't saved yet (from the
                 application: goal, sport, first name)
     suggestion  { miles, runs, source } from recentWeeklyMiles(), or null
========================================== */

import {
    ESSENTIALS, MORE, NONE_EVENT, NONE_INJURIES, essentialsDone, startStep, nextStep, prevStep,
    goalIdeas, MILES_CHOICES, milesChoice, COACHING_WANTS, togglePhrase, hasPhrase, DAY_PRESETS, asksMiles, isNoneAnswer
} from "./intakeFlow.js";
import { FIELDS, SECTIONS, DAYS, SPORTS, STRENGTH_LEVELS, displayValue } from "./clientRecordSchema.js";
import { saveClientRecord } from "./clientRecords.js";
import { settleWrite } from "./offlineWrite.js";
import { TRACKED, nextConfirmedAt, asksSettledBy } from "./profileChecks.js";
import { icon } from "./icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fieldOf = key => FIELDS.find(f => f.key === key);
const hasValue = v => v !== null && v !== undefined && v !== "";

const SPORT_ICONS = { running: "activity", strength: "dumbbell", soccer: "target", general: "heart", other: "star" };

// Phrasing for "me" vs "my child".
const say = (child, self, other) => (child ? other : self);

export function mountIntakeGuide(container, { clientUid, record = null, prefill = {}, suggestion = null, onFullForm, ask = [], backTo = "index.html" } = {}) {
    // What's saved (the record) plus what's being answered on this device.
    let saved = record ? { ...record } : null;
    // Saved answers (plus what's been committed on this device). Prefills
    // (the application's goal and sport, COROS miles) only fill the
    // screens; they're saved when the person accepts them with Next.
    let answers = { whoTrains: "self", ...(record || {}) };
    let draft = {};                   // taps on the current screen, not saved yet
    // Quick update (?ask=goal,event&back=index.html from a "Still right?"
    // card): just those questions, then back where they came from.
    const askSteps = ask.filter(id => ESSENTIALS.some(e => e.id === id) || MORE.some(m => m.id === id));
    let step = askSteps[0] || startStep(record);
    let returnTo = null;              // "review" while changing one answer from the review
    let status = "";
    let lastWrite = Promise.resolve();

    const child = () => answers.whoTrains === "child";
    const done = () => essentialsDone(saved);

    // ---------- saving ----------
    function save(values) {
        answers = { ...answers, ...values };
        const existing = saved;
        // What they answer on a screen counts as confirmed (js/profileChecks.js).
        const confirm = Object.keys(values).filter(k => TRACKED.includes(k));
        const write = saveClientRecord(clientUid, answers, existing, { confirm });
        const confirmedAt = nextConfirmedAt(existing?.confirmedAt, existing, answers, confirm, Date.now());
        const settled = asksSettledBy(existing, Object.keys(confirmedAt).filter(k => confirmedAt[k] !== existing?.confirmedAt?.[k]));
        saved = { ...(existing || {}), ...answers, confirmedAt,
            askedAt: Object.fromEntries(Object.entries(existing?.askedAt || {}).filter(([id]) => !settled.includes(id))) };
        if (!existing?.intakeCompletedAt && answers.primaryGoal && answers.primarySport) saved.intakeCompletedAt = Date.now();
        setStatus("Saving…");
        lastWrite = settleWrite(write, "Your profile");
        lastWrite.then(
            ({ queued }) => setStatus(queued ? "Saved on this phone. It'll sync when you're back online." : "Saved"),
            error => {
                console.error("Saving the profile failed:", error);
                setStatus(error?.code === "permission-denied"
                    ? "Couldn't save — the profile isn't switched on yet."
                    : "Couldn't save that. Check your connection; your answers are still here.", true);
            }
        );
    }

    function setStatus(text, error = false) {
        status = text;
        const el = container.querySelector(".ig-status");
        if (el) {
            el.textContent = text;
            el.classList.toggle("is-error", error);
        }
    }

    // ---------- moving between screens ----------
    function go(next, { push = true } = {}) {
        step = next;
        draft = {};
        if (push) history.pushState({ igStep: next }, "", `#${next}`);
        render();
        container.querySelector(".ig-card")?.scrollIntoView({ block: "start", behavior: "instant" });
        window.scrollTo({ top: 0, behavior: "instant" });
        container.querySelector(".ig-title")?.focus({ preventScroll: true });
    }

    async function exitAsk() {
        setStatus("Saving…");
        try { await lastWrite; } catch { /* the error is on screen */ return; }
        try { sessionStorage.setItem("sb-profile-updated", "1"); } catch { /* fine */ }
        location.href = backTo;
    }

    function advance() {
        if (askSteps.length) {
            const i = askSteps.indexOf(step);
            return i >= 0 && i < askSteps.length - 1 ? go(askSteps[i + 1]) : exitAsk();
        }
        if (returnTo) {
            const back = returnTo;
            returnTo = null;
            return go(back);
        }
        go(nextStep(step));
    }

    window.addEventListener("popstate", event => {
        const target = event.state?.igStep;
        if (target && target !== step) go(target, { push: false });
    });

    // ---------- screens ----------
    function progressHtml() {
        if (askSteps.length) {
            const k = askSteps.indexOf(step);
            return `<div class="ig-progress"><div class="ig-progress-text">Quick update${askSteps.length > 1 ? ` · ${k + 1} of ${askSteps.length}` : ""}</div></div>`;
        }
        const i = ESSENTIALS.findIndex(s => s.id === step);
        if (i >= 0) {
            return `<div class="ig-progress" aria-label="Question ${i + 1} of ${ESSENTIALS.length}">
                <div class="ig-progress-text">Question ${i + 1} of ${ESSENTIALS.length}</div>
                <div class="ig-bar"><span style="width:${Math.round((i / ESSENTIALS.length) * 100)}%"></span></div>
            </div>`;
        }
        const j = MORE.findIndex(s => s.id === step);
        if (j >= 0) {
            return `<div class="ig-progress">
                <div class="ig-progress-text">More about ${say(child(), "you", "them")} · ${j + 1} of ${MORE.length} · all optional</div>
                <div class="ig-bar is-more"><span style="width:${Math.round((j / MORE.length) * 100)}%"></span></div>
            </div>`;
        }
        return "";
    }

    const chip = (label, { on = false, attrs = "", big = false, iconName = "" } = {}) =>
        `<button type="button" class="ig-chip${big ? " is-big" : ""}${on ? " is-on" : ""}" aria-pressed="${on}" ${attrs}>${iconName ? icon(iconName) : ""}<span>${esc(label)}</span></button>`;

    function screen({ title, sub = "", body = "", next = "Next", canNext = true, skip = false, back = true, nextId = "next" }) {
        const prev = askSteps.length ? askSteps[askSteps.indexOf(step) - 1] : (returnTo ? returnTo : prevStep(step));
        return `
            <div class="ig-card">
                ${progressHtml()}
                <h2 class="ig-title" tabindex="-1">${esc(title)}</h2>
                ${sub ? `<p class="ig-sub">${sub}</p>` : ""}
                <div class="ig-body">${body}</div>
                <div class="ig-foot">
                    ${back && prev ? `<button type="button" class="sb-btn sb-btn-tertiary ig-back" data-go="${prev}">${icon("chevronLeft")} Back</button>` : "<span></span>"}
                    <div class="ig-foot-right">
                        ${skip ? `<button type="button" class="sb-btn sb-btn-tertiary" data-act="skip">${askSteps.length || returnTo ? "Cancel" : "Skip for now"}</button>` : ""}
                        ${next ? `<button type="button" class="sb-btn sb-btn-primary" data-act="${nextId}" ${canNext ? "" : "disabled"}>${esc(next)}</button>` : ""}
                    </div>
                </div>
                <p class="ig-status" role="status" aria-live="polite">${esc(status)}</p>
            </div>`;
    }

    const SCREENS = {
        welcome() {
            const who = answers.whoTrains === "child" ? "child" : "self";
            const nameKey = who === "child" ? "athleteName" : "preferredName";
            return screen({
                title: "Let's set up your profile",
                sub: "Six quick questions so your coach can build training around you. Mostly taps, about a minute. Only you and your coach see this.",
                back: false,
                next: "Let's go",
                body: `
                    <div class="ig-q">Who's training?</div>
                    <div class="ig-chips">
                        ${chip("Me", { on: who === "self", attrs: 'data-who="self"' })}
                        ${chip("My child (or someone I'm signing up)", { on: who === "child", attrs: 'data-who="child"' })}
                    </div>
                    <label class="ig-q" for="igName">${who === "child" ? "Their first name" : "What should your coach call you?"}</label>
                    <input id="igName" class="ig-input" type="text" maxlength="60" autocomplete="${who === "child" ? "off" : "given-name"}" value="${esc(answers[nameKey] ?? (who === "self" ? prefill.preferredName : "") ?? "")}">`
            });
        },

        sport() {
            const current = answers.primarySport || prefill.primarySport || "";
            return screen({
                title: say(child(), "What are you training for mostly?", "What are they training for mostly?"),
                sub: "Tap one.",
                next: current ? "Next" : "",
                skip: !current,
                body: `<div class="ig-grid">${SPORTS.map(s => chip(s.label, { on: current === s.value, big: true, iconName: SPORT_ICONS[s.value], attrs: `data-sport="${s.value}"` })).join("")}</div>`
            });
        },

        goal() {
            const text = answers.primaryGoal || prefill.primaryGoal || "";
            return screen({
                title: say(child(), "What's the main thing you want to achieve?", "What's the main thing they want to achieve?"),
                sub: "Tap one to start, then make it yours. Specific is great: “Break 25 minutes in the 5K”.",
                canNext: Boolean(text.trim()),
                skip: true,
                body: `
                    <div class="ig-chips">${goalIdeas(answers.primarySport || prefill.primarySport).map(g => chip(g, { on: text.trim() === g, attrs: `data-goal="${esc(g)}"` })).join("")}</div>
                    <textarea id="igText" class="ig-input" rows="3" maxlength="500" placeholder="In your own words">${esc(text)}</textarea>`
            });
        },

        event() {
            const event = isNoneAnswer(answers.targetEvent) ? "" : (answers.targetEvent || "");
            return screen({
                title: say(child(), "Aiming for a race, tryout or season?", "Are they aiming for a race, tryout or season?"),
                sub: "It helps your coach time the plan. If there's nothing yet, that's fine.",
                canNext: Boolean(event.trim() || answers.targetDate),
                skip: true,
                body: `
                    ${chip(NONE_EVENT, { on: answers.targetEvent === NONE_EVENT, big: true, attrs: 'data-none="event"' })}
                    <div class="ig-or">or</div>
                    <label class="ig-q" for="igEvent">What is it?</label>
                    <input id="igEvent" class="ig-input" type="text" maxlength="120" placeholder="e.g. Indy Half Marathon, fall tryouts" value="${esc(event)}">
                    <label class="ig-q" for="igDate">When is it? <span class="ig-light">(a rough date is fine)</span></label>
                    <input id="igDate" class="ig-input ig-short" type="date" value="${esc(answers.targetDate || "")}">`
            });
        },

        days() {
            draft.days ??= [...(answers.availabilityDays || [])];
            const days = draft.days;
            return screen({
                title: say(child(), "Which days can you usually train?", "Which days can they usually train?"),
                sub: "Tap every day that usually works. You can change this any time.",
                canNext: days.length > 0,
                skip: true,
                body: `
                    <div class="ig-days">${DAYS.map(d => chip(d.label, { on: days.includes(d.value), attrs: `data-day="${d.value}"` })).join("")}</div>
                    <div class="ig-presets">${DAY_PRESETS.map(p => `<button type="button" class="ig-link" data-preset="${p.days.join(",")}">${esc(p.label)}</button>`).join("")}</div>`
            });
        },

        level() {
            const miles = asksMiles(answers.primarySport);
            if (!("miles" in draft)) draft.miles = hasValue(answers.weeklyMileage) ? Number(answers.weeklyMileage) : (suggestion ? suggestion.miles : null);
            draft.strength ??= answers.strengthExperience || "";
            const picked = milesChoice(draft.miles);
            const exact = hasValue(draft.miles) && picked !== Number(draft.miles) ? draft.miles : "";
            const ready = (!miles || hasValue(draft.miles)) && Boolean(draft.strength);
            return screen({
                title: "Where are you starting from?",
                sub: say(child(), "No wrong answers — this just sets a safe starting point.", "No wrong answers — this just sets a safe starting point for them."),
                canNext: ready,
                skip: true,
                body: `
                    ${miles ? `
                        <div class="ig-q">Miles ${say(child(), "you run", "they run")} in a normal week right now</div>
                        ${suggestion ? `<p class="ig-hint">${icon("checkCircle")} From ${esc(suggestion.source)}: about <strong>${suggestion.miles} mi a week</strong> over the last 4 weeks.</p>` : ""}
                        <div class="ig-chips">${MILES_CHOICES.map(c => chip(c.label, { on: picked === c.value && !exact, attrs: `data-miles="${c.value}"` })).join("")}</div>
                        <label class="ig-light ig-exact">Or the exact number <input id="igMiles" class="ig-input ig-tiny" type="number" inputmode="decimal" min="0" max="500" step="0.5" value="${esc(exact)}"> mi</label>` : ""}
                    <div class="ig-q">Strength training experience</div>
                    <div class="ig-chips">${STRENGTH_LEVELS.map(l => chip(l.label, { on: draft.strength === l.value, attrs: `data-strength="${l.value}"` })).join("")}</div>`
            });
        },

        limits() {
            const text = isNoneAnswer(answers.injuries) ? "" : (answers.injuries || "");
            return screen({
                title: say(child(), "Anything that limits your training?", "Anything that limits their training?"),
                sub: "An injury, a niggle, a health thing, or “no running on Sundays”. Only you and your coach see this.",
                canNext: Boolean(text.trim()),
                next: "Save",
                skip: true,
                body: `
                    ${chip(NONE_INJURIES, { on: answers.injuries === NONE_INJURIES, big: true, attrs: 'data-none="injuries"' })}
                    <div class="ig-or">or</div>
                    <textarea id="igText" class="ig-input" rows="3" maxlength="1000" placeholder="e.g. Left knee gets sore on downhills">${esc(text)}</textarea>`
            });
        },

        more() {
            const n = done();
            const complete = n === ESSENTIALS.length;
            return screen({
                title: complete ? "Nice — that's the essentials" : `${n} of ${ESSENTIALS.length} essentials done`,
                sub: complete
                    ? "Your coach has what they need to start. Got two more minutes? A few more answers help fit the plan to you — skip any you like."
                    : "You skipped a few. You can answer them from the review, or keep going with the extra questions.",
                back: true,
                next: "Keep going",
                body: `<button type="button" class="ig-link ig-finish" data-go="review">Finish for now</button>`
            });
        },

        review() {
            const n = done();
            const rows = SECTIONS.map(section => {
                const items = section.fields
                    .filter(f => !f.when || f.when === (answers.whoTrains === "child" ? "child" : "self"))
                    .filter(f => f.key !== "whoTrains")
                    .map(f => {
                        const value = displayValue(f, saved?.[f.key]);
                        const stepId = stepFor(f.key);
                        // Flag only what an unanswered essential still needs.
                        const owner = ESSENTIALS.find(e => e.keys.includes(f.key));
                        const essential = Boolean(owner && !owner.done(saved || {}));
                        return `<div class="ig-row${!value && essential ? " is-open" : ""}">
                            <div class="ig-row-label">${esc(f.label)}</div>
                            <div class="ig-row-value">${value ? esc(value) : `<span class="ig-light">${essential ? "Not answered yet" : "—"}</span>`}</div>
                            ${stepId ? `<button type="button" class="ig-link" data-change="${stepId}">${value ? "Change" : "Answer"}</button>` : ""}
                        </div>`;
                    }).join("");
                return `<section class="ig-review-section"><h3>${esc(section.title === "About you" && child() ? "About them" : section.title)}</h3>${items}</section>`;
            }).join("");
            return `
                <div class="ig-card ig-review">
                    <div class="ig-review-head">
                        <div class="ig-ring" style="--pct:${Math.round((n / ESSENTIALS.length) * 100)}"><span>${n}/${ESSENTIALS.length}</span></div>
                        <div>
                            <h2 class="ig-title" tabindex="-1">${n === ESSENTIALS.length ? "You're all set" : "Almost there"}</h2>
                            <p class="ig-sub">${n === ESSENTIALS.length
                                ? "Your coach can see this. Change anything here when something changes: a new goal, a new schedule, a niggle."
                                : `${ESSENTIALS.length - n} essential${ESSENTIALS.length - n === 1 ? "" : "s"} still open. They take a few seconds each.`}</p>
                        </div>
                    </div>
                    ${n < ESSENTIALS.length ? `<button type="button" class="sb-btn sb-btn-primary ig-resume" data-go="${ESSENTIALS.find(e => !e.done(saved || {})).id}">Answer the rest</button>` : ""}
                    ${rows}
                    <div class="ig-foot">
                        <button type="button" class="ig-link" data-act="full">Edit everything on one page</button>
                        <a class="sb-btn sb-btn-primary" href="index.html">Done</a>
                    </div>
                    <p class="ig-status" role="status" aria-live="polite">${esc(status)}</p>
                </div>`;
        }
    };

    // The optional one-field screens.
    for (const item of MORE) {
        SCREENS[item.id] = () => {
            const field = fieldOf(item.key);
            const value = answers[item.key] ?? "";
            const ask = child() && field.askChild ? field.askChild : field.ask;
            let body;
            if (field.type === "year") {
                body = `<input id="igText" class="ig-input ig-short" type="number" inputmode="numeric" min="1920" max="${new Date().getFullYear()}" placeholder="e.g. 1994" value="${esc(value)}">
                    ${field.hint ? `<p class="ig-hint">${esc(field.hint)}</p>` : ""}`;
            } else if (field.type === "tel") {
                body = `<input id="igText" class="ig-input" type="tel" autocomplete="tel" maxlength="${field.max}" value="${esc(value)}">`;
            } else if (field.type === "textarea") {
                body = `${item.key === "coachingWants" ? `<div class="ig-chips">${COACHING_WANTS.map(w => chip(w, { on: hasPhrase(value, w), attrs: `data-want="${esc(w)}"` })).join("")}</div>` : ""}
                    <textarea id="igText" class="ig-input" rows="3" maxlength="${field.max}">${esc(value)}</textarea>`;
            } else {
                body = `<input id="igText" class="ig-input" type="text" maxlength="${field.max}" value="${esc(value)}">`;
            }
            return screen({ title: ask, body, skip: true, next: returnTo ? "Save" : "Next" });
        };
    }

    function stepFor(key) {
        const essential = ESSENTIALS.find(e => e.keys.includes(key));
        if (essential) return essential.id;
        if (MORE.some(m => m.key === key)) return MORE.find(m => m.key === key).id;
        if (["preferredName", "athleteName", "whoTrains"].includes(key)) return "welcome";
        return null;
    }

    function render() {
        container.innerHTML = (SCREENS[step] || SCREENS.review)();
        wire();
    }

    // ---------- reading answers off the screen ----------
    const q = sel => container.querySelector(sel);
    const textValue = () => q("#igText")?.value.trim() ?? "";

    function commitCurrent() {
        switch (step) {
            case "welcome": {
                const nameKey = answers.whoTrains === "child" ? "athleteName" : "preferredName";
                save({ whoTrains: answers.whoTrains, [nameKey]: q("#igName").value.trim() });
                break;
            }
            case "sport": save({ primarySport: answers.primarySport || prefill.primarySport || "" }); break;
            case "goal": save({ primaryGoal: textValue() }); break;
            case "event": save({ targetEvent: q("#igEvent").value.trim(), targetDate: q("#igDate").value }); break;
            case "days": save({ availabilityDays: draft.days || [] }); break;
            case "level": {
                const exact = q("#igMiles")?.value;
                const values = { strengthExperience: draft.strength || "" };
                if (asksMiles(answers.primarySport)) values.weeklyMileage = exact !== "" && exact != null ? Number(exact) : draft.miles;
                save(values);
                break;
            }
            case "limits": save({ injuries: textValue() }); break;
            default: {
                const item = MORE.find(m => m.id === step);
                if (item) save({ [item.key]: textValue() });
            }
        }
    }

    function refreshNext() {
        const next = q('[data-act="next"]');
        if (!next) return;
        let ok = true;
        if (step === "goal" || step === "limits") ok = Boolean(textValue());
        if (step === "event") ok = Boolean(q("#igEvent").value.trim() || q("#igDate").value);
        if (step === "days") ok = (draft.days || []).length > 0;
        if (step === "level") {
            const exact = q("#igMiles")?.value;
            const milesOk = !asksMiles(answers.primarySport) || (exact !== "" && exact != null) || hasValue(draft.miles);
            ok = milesOk && Boolean(draft.strength);
        }
        next.disabled = !ok;
    }

    function wire() {
        container.querySelectorAll("input, textarea").forEach(el => el.addEventListener("input", () => {
            if (step === "goal") container.querySelectorAll("[data-goal]").forEach(b => { const on = b.dataset.goal === textValue(); b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
            if (step === "event" || step === "limits") container.querySelectorAll("[data-none]").forEach(b => { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); });
            if (step === "level" && el.id === "igMiles") container.querySelectorAll("[data-miles]").forEach(b => { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); });
            if (step === "coachingWants") container.querySelectorAll("[data-want]").forEach(b => { const on = hasPhrase(el.value, b.dataset.want); b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
            refreshNext();
        }));
        // Enter on a one-line answer = Next.
        container.querySelectorAll("input:not([type=date])").forEach(el => el.addEventListener("keydown", event => {
            if (event.key === "Enter") { event.preventDefault(); q('[data-act="next"]:not([disabled])')?.click(); }
        }));
    }

    container.addEventListener("click", event => {
        const t = event.target.closest("button, a");
        if (!t || !container.contains(t)) return;
        const d = t.dataset;

        if (d.go) { returnTo = null; return go(d.go); }
        if (d.change) { returnTo = "review"; return go(d.change); }
        if (d.act === "full") return onFullForm?.();
        if (d.act === "skip") {
            if (askSteps.length) { location.href = backTo; return; }
            return advance();
        }
        if (d.act === "next") {
            if (step !== "more") commitCurrent();
            return advance();
        }

        if (d.who) {
            const name = q("#igName")?.value.trim() || "";
            const oldKey = answers.whoTrains === "child" ? "athleteName" : "preferredName";
            answers = { ...answers, [oldKey]: name, whoTrains: d.who };
            return render();
        }
        // One tap answers these, and moves on.
        if (d.sport) {
            save({ primarySport: d.sport });
            return advance();
        }
        if (d.none === "event") {
            save({ targetEvent: NONE_EVENT, targetDate: "" });
            return advance();
        }
        if (d.none === "injuries") {
            save({ injuries: NONE_INJURIES });
            return advance();
        }
        if (d.goal) {
            q("#igText").value = d.goal;
            q("#igText").dispatchEvent(new Event("input"));
            return;
        }
        if (d.day) {
            const days = new Set(draft.days || []);
            days.has(d.day) ? days.delete(d.day) : days.add(d.day);
            draft.days = DAYS.map(x => x.value).filter(v => days.has(v));
            t.classList.toggle("is-on", days.has(d.day));
            t.setAttribute("aria-pressed", days.has(d.day));
            return refreshNext();
        }
        if (d.preset) {
            draft.days = d.preset.split(",");
            container.querySelectorAll("[data-day]").forEach(b => { const on = draft.days.includes(b.dataset.day); b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
            return refreshNext();
        }
        if (d.miles !== undefined) {
            draft.miles = Number(d.miles);
            if (q("#igMiles")) q("#igMiles").value = "";
            container.querySelectorAll("[data-miles]").forEach(b => { const on = b === t; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
            return refreshNext();
        }
        if (d.strength) {
            draft.strength = d.strength;
            container.querySelectorAll("[data-strength]").forEach(b => { const on = b === t; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
            return refreshNext();
        }
        if (d.want) {
            const box = q("#igText");
            box.value = togglePhrase(box.value, d.want);
            box.dispatchEvent(new Event("input"));
        }
    });

    history.replaceState({ igStep: step }, "", location.pathname + location.search);
    render();
    return { go };
}
