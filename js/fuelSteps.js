/* ==========================================
   Southbound — the Fueling calculator one step at a time (a phone, 2026-10-15)

   Below 1100px the page shows one part at a time: Your run, About you, What you
   carry, then Your plan (the review: the plan, every answer with an Edit button,
   saving). A glass bar keeps the numbers in view and holds Next. On a computer
   (and with no script) it is one page, as before. Which part shows is the
   data-step attribute on the page; css/fueling.css hides the rest. The fields
   stay in the page, so nothing about the maths, drafts or saving changes.
   The rules (titles, where to open, the bar's words, the review's rows) are
   in js/fuelStepsModel.js (pure, tested).
========================================== */

import { STEPS, stepInfo, nextStep, prevStep, startingStep, barText, answerRows } from "./fuelStepsModel.js";
import { tuneSummaries } from "./fuelDetails.js";
import { currentDetailsInput } from "./fuelingPlans.js";
import { toast } from "./ui.js";

const $ = id => document.getElementById(id);
const main = document.querySelector("main.fueling-page");
const phone = window.matchMedia("(max-width: 1099px)");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let step = 0;            // 0 = steps are off (a computer)
let touched = false;     // the person has started: never jump the page under them
let timer = null;

// A plan is showing once the targets panel is (the page shows it with inline display).
const planShown = () => { const p = $("targetsPanel"); return Boolean(p) && p.style.display !== "none"; };

function paintBar() {
    const el = $("fuelBarNums");
    if (!el) return;
    const unit = document.querySelector("#fluidUnitSwitch [aria-pressed='true']")?.dataset.unit || "oz";
    el.textContent = barText({ carbs: $("carbsPerHour")?.value, fluid: $("fluidPerHour")?.value, unit });
}

function paintAnswers() {
    const list = $("fuelAnswersList");
    if (!list) return;
    const type = $("workoutType");
    const rows = answerRows({
        run: { type: type?.selectedOptions?.[0]?.textContent.trim() || "", distance: $("distance")?.value, duration: $("duration")?.value, pace: $("pace")?.value },
        tune: tuneSummaries(currentDetailsInput())
    });
    list.innerHTML = rows.map(r => `<div class="fx-ans">
        <span class="fx-ans-text"><b>${esc(r.title)}</b><small>${esc(r.summary)}</small></span>
        <button type="button" class="fx-ans-edit" data-step-go="${r.step}" aria-label="Edit ${esc(r.title)}">Edit</button>
    </div>`).join("");
}

function paintStep(scroll) {
    const info = stepInfo(step);
    main.dataset.step = String(step);
    $("fuelStepper").hidden = false;
    $("fuelStepTitle").textContent = info.title;
    $("fuelStepHelp").textContent = info.help;
    $("fuelStepHelp").hidden = step === STEPS.length;
    $("fuelStepCount").textContent = step === STEPS.length ? "Review" : `Step ${step} of ${STEPS.length}`;
    $("fuelStepBack").hidden = step === 1;
    document.querySelectorAll("#fuelStepDots i").forEach((dot, i) => dot.classList.toggle("on", i < step));
    const bar = $("fuelStepBar");
    bar.hidden = step === STEPS.length;
    $("fuelStepNext").textContent = info.next;
    // The rows that are the step itself (not optional extras) are open, and their headings are not buttons.
    document.querySelectorAll(".fx-forced").forEach(row => { row.open = true; });
    paintBar();
    if (step === STEPS.length) paintAnswers();
    if (scroll) {
        // On the Free tools page the calculator is one section of a longer page: go to its top, not the page's.
        const top = $("fuelScrollTop") || main.closest(".tl-sec");
        if (top) top.scrollIntoView({ block: "start", behavior: "instant" });
        else window.scrollTo({ top: 0, behavior: "instant" });
    }
    $("fuelStepTitle").focus({ preventScroll: true });
}

function setStep(n, { push = true, scroll = true } = {}) {
    const next = Math.min(STEPS.length, Math.max(1, n));
    if (!main || !phone.matches) return;
    if (next === step) { paintStep(false); return; }
    step = next;
    if (push) { try { history.pushState({ fuelStep: step }, "", location.href); } catch { /* fine */ } }
    paintStep(scroll);
}

// Step 1 needs a plan before it can move on: build it from the run, and say so if the run is not enough yet.
async function ensurePlan() {
    if (planShown()) return true;
    $("calculateBtn")?.click();
    for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (planShown()) return true;
    }
    toast("Add a distance or a time first, and I will work out the rest.");
    $("distance")?.focus();
    return false;
}

async function goTo(n) {
    if (n > 1 && !planShown() && !(await ensurePlan())) { setStep(1); return; }
    setStep(n);
}

function turnOn() {
    if (!main) return;
    $("fuelStepper").hidden = false;
    if (!step) {
        step = startingStep({ planShown: planShown(), touched });
        try { history.replaceState({ fuelStep: step }, "", location.href); } catch { /* fine */ }
        paintStep(false);
    }
}

function turnOff() {
    step = 0;
    delete main.dataset.step;
    $("fuelStepper").hidden = true;
    $("fuelStepBar").hidden = true;
}

function init() {
    if (!main || !$("fuelStepper")) return;
    const mark = () => { touched = true; };
    main.addEventListener("pointerdown", mark, true);
    main.addEventListener("keydown", mark, true);
    main.addEventListener("input", () => { touched = true; paintBar(); }, true);
    main.addEventListener("change", () => paintBar(), true);

    document.addEventListener("click", event => {
        const t = event.target instanceof Element ? event.target : null;
        if (!t || !phone.matches || !step) return;
        const go = t.closest("[data-step-go]");
        if (go) { goTo(Number(go.dataset.stepGo)); return; }
        if (t.closest("#fuelStepNext")) { goTo(nextStep(step)); return; }
        if (t.closest("#fuelStepBack")) { if (history.state?.fuelStep > 1) history.back(); else setStep(prevStep(step)); return; }
        // "My fueling plans" lives on the review.
        const plans = t.closest("#fuelMyPlansLink");
        if (plans) { event.preventDefault(); setStep(STEPS.length, { scroll: false }); $("myFuelingPlans")?.scrollIntoView({ behavior: "smooth" }); }
    });

    // The phone's own back gesture goes back a step.
    window.addEventListener("popstate", event => {
        if (!phone.matches || !step) return;
        const n = event.state?.fuelStep;
        if (n) setStep(n, { push: false });
    });

    phone.addEventListener?.("change", () => { phone.matches ? turnOn() : turnOff(); });
    // The calculator builds itself a moment after load (a resumed draft, a "Fuel this run" link): wait for it, then open.
    setTimeout(() => { if (phone.matches) turnOn(); timer = setInterval(() => { if (step) paintBar(); }, 700); }, 1100);
    // A person returning to a finished plan lands on the review; once they have touched anything, never.
    setTimeout(() => { if (step === 1 && !touched && planShown()) setStep(STEPS.length, { push: false, scroll: false }); }, 1900);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
