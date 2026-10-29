/* ==========================================
   Southbound — Fuel Clock strip (Fueling page, signed-in app only)

   One line above the plan: the next gel or drink, a countdown to it once
   the clock is started, and how much is left to drink. "Plan" opens the
   whole day: done, next, later, with a fill that rises as you log what you
   took. The logic is js/fuelClockModel.js; js/fueling.js hands it the plan
   it builds (or today's saved marathon plan) through updateFuelClock().

   This is a web strip on this page. It is not a lock-screen, watch or
   Live Activity alert, and it says so.
   Done marks and the start time stay on this device for today only
   (`sb-fuel-clock`, cleared on sign-out in js/auth.js).
========================================== */

import { clockItems, clockState, countdownText, atText, itemLabel, freshState } from "./fuelClockModel.js";
import { fluidText } from "./fluidUnits.js";
import { timeOfDay, parseStartTime, formatClock } from "./fuelSchedule.js";

const KEY = "sb-fuel-clock";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let current = null;     // { items, plan, from, unit, startMin, onOpen }
let state = null;       // { planKey, day, startedAt, done }
let open = false;
let timer = null;
let lastNextId = null;
let shownFill = 0;       // the fill and open state on screen, so a repaint can rise / open from them
let shownOpen = false;

// The app only: a guest, or the Free tools page that borrows this page's calculator, gets no strip.
export function fuelClockAllowed() {
    return /\/fueling(\.html)?$/.test(location.pathname) && !document.documentElement.classList.contains("sb-guest");
}

function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ } }

/**
 * source: null (no plan today) or { plan, schedule, from: "live" | "saved", key, onOpen }.
 * opts: { unit: "oz" | "ml" }.
 */
export function updateFuelClock(source, { unit = "oz" } = {}) {
    const box = $("fuelClock");
    if (!box) return;
    const items = source ? clockItems(source.schedule) : [];
    if (!fuelClockAllowed() || !source) {
        // No plan today: no strip. The plan screen's own "No plan yet" card says what happens next.
        box.hidden = true;
        stopTick();
        current = null;
        return;
    }
    const startMin = parseStartTime(source.plan?.startTime ?? source.plan?.session?.startTime);
    current = { items, plan: source.plan, from: source.from, unit, startMin, onOpen: source.onOpen };
    state = freshState(state?.planKey === source.key ? state : load(), source.key);
    box.hidden = false;
    paint();
}

function elapsedSec() {
    return state?.startedAt ? (Date.now() - state.startedAt) / 1000 : null;
}

function dueText(s) {
    const n = s.next;
    if (!n) return "";
    if (s.dueInSec != null) return s.overdue ? "due now" : `in ${countdownText(s.dueInSec)}`;
    const clock = current.startMin != null ? ` (${timeOfDay(current.startMin + n.at)})` : "";
    return `${atText(n.at)}${clock}`;
}

function amountText(item) {
    const parts = [];
    if (item.carbs) parts.push(`${Math.round(item.carbs)} g carbs`);
    if (item.fluid) parts.push(fluidText(item.fluid, current.unit));
    if (item.caffeineMg) parts.push(`${item.caffeineMg} mg caffeine`);
    return parts.join(" · ");
}

function whenText(item) {
    return `<b>${esc(formatClock(item.at))}</b>${item.mile ? `<small>mi ${esc(item.mile)}</small>` : ""}`;
}

function paint() {
    const box = $("fuelClock");
    if (!box || !current) return;
    const { items, plan, from } = current;
    const s = clockState(items, { done: state.done, elapsedSec: elapsedSec() });
    const name = plan?.name && plan.name !== "Untitled Plan" ? plan.name : (plan?.workout || "Today's plan");
    const source = from === "saved" ? `Saved plan for today: ${name}` : name;

    if (!items.length) {
        // A plan with nothing in it to take: say so, no countdown.
        box.innerHTML = `
            <div class="fc-bar">
                <div class="fc-main">
                    <h2 class="fc-kicker" id="fuelClockTitle">Fuel Clock</h2>
                    <p class="fc-line"><b>No gels or drink in this plan yet.</b></p>
                    <p class="fc-src">Add what you carry below and the clock lists each one.</p>
                </div>
            </div>`;
        stopTick();
        return;
    }

    const fluidLeft = fluidText(s.fluidLeft, current.unit);
    const nextLine = s.allDone ? "All taken. That is the plan done." : itemLabel(s.next);
    const started = !!state.startedAt;
    const mainBtn = s.allDone ? ""
        : !started ? `<button type="button" class="sb-btn sb-btn-primary fc-go" data-fc="start">Start clock</button>`
        : `<button type="button" class="sb-btn sb-btn-primary fc-go" data-fc="took">Took it</button>`;

    box.innerHTML = `
        <div class="fc-bar">
            <div class="fc-gauge" role="img" aria-label="${s.carbsTotal ? `${s.carbsTaken} of ${s.carbsTotal} grams of carbs taken` : `${fluidLeft} left to drink`}"><i style="--fc-fill:${shownFill.toFixed(3)}"></i></div>
            <div class="fc-main">
                <h2 class="fc-kicker" id="fuelClockTitle">Fuel Clock</h2>
                <p class="fc-line"><b class="fc-next">${s.allDone ? "" : "Next: "}${esc(nextLine)}</b></p>
                <p class="fc-meta">${s.allDone ? "" : `<span class="fc-due" id="fuelClockDue">${esc(dueText(s))}</span>`}<span class="fc-left">${esc(fluidLeft)} to drink</span></p>
            </div>
            <div class="fc-actions">
                ${mainBtn}
                <button type="button" class="sb-btn sb-btn-secondary fc-toggle" data-fc="toggle" aria-expanded="${open}" aria-controls="fuelClockPlan">${open ? "Hide plan" : "Plan"}</button>
            </div>
        </div>
        <div class="fc-plan${shownOpen ? " is-open" : ""}" id="fuelClockPlan" ${open ? "" : "inert"}>
            <div class="fc-plan-in">
                <p class="fc-src">${esc(source)}${from === "saved" ? ` · <button type="button" class="fc-link" data-fc="open">Open it</button>` : ""}</p>
                <p class="fc-sum">${s.carbsTotal ? `<b>${s.carbsTaken} of ${s.carbsTotal} g</b> carbs taken · ` : ""}<b>${esc(fluidLeft)}</b> of ${esc(fluidText(s.fluidTotal, current.unit))} left to drink</p>
                <ol class="fc-list">
                    ${items.map(item => {
                        const done = state.done.includes(item.id);
                        const isNext = !done && s.next?.id === item.id;
                        return `<li class="fc-row${done ? " is-done" : ""}${isNext ? " is-next" : ""}">
                            <span class="fc-when">${whenText(item)}</span>
                            <span class="fc-what"><b>${esc(itemLabel(item))}</b><small>${esc(amountText(item))}${item.from != null ? ` · sip from ${esc(formatClock(item.from))}` : ""}</small></span>
                            <button type="button" class="fc-mark" data-fc="mark" data-id="${esc(item.id)}" aria-pressed="${done}" aria-label="${done ? "Undo" : "Mark done"}: ${esc(itemLabel(item))}">${done ? "Done" : isNext ? "Next" : "Later"}</button>
                        </li>`;
                    }).join("")}
                </ol>
                <div class="fc-foot">
                    ${started || state.done.length ? `<button type="button" class="sb-btn sb-btn-tertiary" data-fc="reset">Reset clock</button>` : ""}
                    <p class="fc-note">The clock runs while this page is open. It is not a phone or watch alert.</p>
                </div>
            </div>
        </div>
        <p class="sr-only" aria-live="polite" id="fuelClockSay"></p>`;

    // Rise / open from what was on screen (css/fueling.css times it; reduced motion turns it off).
    const fillEl = box.querySelector(".fc-gauge i"), planEl = $("fuelClockPlan");
    requestAnimationFrame(() => {
        fillEl?.style.setProperty("--fc-fill", s.fill.toFixed(3));
        planEl?.classList.toggle("is-open", open);
    });
    shownFill = s.fill;
    shownOpen = open;

    if (s.next?.id !== lastNextId) {
        if (lastNextId !== null && s.next) $("fuelClockSay").textContent = `Next: ${itemLabel(s.next)}, ${dueText(s)}.`;
        lastNextId = s.next?.id ?? null;
    }
    if (started && !s.allDone) startTick(); else stopTick();
}

// The countdown: one text update a second while the clock runs and the page is in view.
function tick() {
    if (!current || !state?.startedAt || document.hidden) return;
    const s = clockState(current.items, { done: state.done, elapsedSec: elapsedSec() });
    const el = $("fuelClockDue");
    if (el) el.textContent = dueText(s);
}
function startTick() { if (!timer) timer = setInterval(tick, 1000); }
function stopTick() { clearInterval(timer); timer = null; }

function act(kind, id) {
    if (!current) return;
    if (kind === "toggle") { open = !open; paint(); $("fuelClock")?.querySelector('[data-fc="toggle"]')?.focus(); return; }
    if (kind === "open") { current.onOpen?.(); return; }
    if (kind === "start") state.startedAt = Date.now();
    if (kind === "took") {
        const s = clockState(current.items, { done: state.done });
        if (s.next) state.done = [...state.done, s.next.id];
    }
    if (kind === "mark" && id) state.done = state.done.includes(id) ? state.done.filter(x => x !== id) : [...state.done, id];
    if (kind === "reset") { state.startedAt = null; state.done = []; }
    save();
    paint();
    // Keep focus where the tap was, after the repaint.
    const sel = kind === "mark" ? `[data-fc="mark"][data-id="${id}"]` : kind === "reset" ? '[data-fc="toggle"]' : '.fc-go, [data-fc="toggle"]';
    $("fuelClock")?.querySelector(sel)?.focus();
}

export function initFuelClock() {
    const box = $("fuelClock");
    if (!box || box.dataset.ready) return;
    box.dataset.ready = "1";
    box.addEventListener("click", e => {
        const b = e.target.closest("[data-fc]");
        if (b) act(b.dataset.fc, b.dataset.id);
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
}
