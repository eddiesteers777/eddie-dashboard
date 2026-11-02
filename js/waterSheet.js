/* ==========================================
   Southbound — the water sheet (2026-11-02)

   Tapping the Water goal opens this instead of ticking it. Add what you
   drank and a jug fills; the goal ticks itself when you reach it. The
   jug shows an even-pace zone (7 am to 9 pm) and pins each drink where
   it landed. Numbers live in js/waterModel.js; the total is the same
   `water` the Nutrition page logs ("nutrition-YYYY-MM-DD"). Mock-ups:
   project files water-bottle/ (C2 + C3).
========================================== */

import { PRESETS, readWater, addWater, undoLast, pins, paceOz, nextTip, timeText, nutritionKey, minutesOf, clock, DAY_START, DAY_END } from "./waterModel.js";
import { habitList, dayKey, doneOn } from "./habitDefaults.js";
import { showsPersonalPlan } from "./role.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const sync = () => import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});

/** The water habit on a list: the drawn water icon, or "water" in the name. */
export function findWaterHabit(habits) {
    return (habits || []).find(h => h?.icon === "hb:water") || (habits || []).find(h => /water/i.test(String(h?.name || ""))) || null;
}

/** The day's water goal in oz, the same way the Nutrition page works it out. */
export async function waterGoal() {
    try {
        const goals = await import("./nutritionGoals.js");
        const isCoach = localStorage.getItem("sb-account-role") === "coach";
        let bodyWeightLb = null;
        const plans = read("fueling-plans", null), profile = read("fueling-profile", null);
        if (!isCoach && ((Array.isArray(plans) && plans.length) || profile?.fields?.bodyWeight)) {
            const { profileFromPlans } = await import("./workoutFuel.js");
            bodyWeightLb = Number(profileFromPlans(Array.isArray(plans) ? plans : [], profile).bodyWeight) || null;
        }
        return goals.resolveGoals(read("nutrition-goals", null), { isCoach, bodyWeightLb }).goals.water || 100;
    } catch { return 100; }
}

const BODY = "M40 120 Q40 96 66 90 L92 84 L92 54 L132 54 L132 84 L150 90 Q168 98 168 122 L168 330 Q168 346 152 346 L56 346 Q40 346 40 330 Z";
const TOP = 96, BOT = 346, H = BOT - TOP;
const WAVE = "q30 -9 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V900 H0Z";

function jugSvg(goal, total, log, pace, showPace) {
    const frac = Math.min(1, total / goal);
    const y = f => BOT - Math.min(1, Math.max(0, f)) * H;
    const hourMarks = [["9 AM", 9], ["NOON", 12], ["3 PM", 15], ["6 PM", 18]].map(([t, hr]) => {
        const ty = y((hr * 60 - DAY_START) / (DAY_END - DAY_START));
        return `<line class="wt-tick" x1="30" x2="40" y1="${ty}" y2="${ty}"/><text class="wt-tl" x="26" y="${ty + 4}" text-anchor="end">${t}</text>`;
    }).join("");
    // Each drink is a dot at the level it reached. Labels are nudged apart so close drinks stay readable.
    let lastY = -99;
    const dots = pins(log).slice(-6).map(p => {
        const py = y(p.level / goal);
        const ly = Math.max(py, lastY + 15); lastY = ly;
        const tm = p.t ? timeText(p.t).replace(" am", "a").replace(" pm", "p") : "earlier";
        return `<circle cx="168" cy="${py}" r="4" class="wt-dot"/><line x1="172" x2="184" y1="${py}" y2="${ly}" class="wt-lead"/><text class="wt-tl wt-pin" x="188" y="${ly + 4}">${esc(tm)} +${p.oz}</text>`;
    }).join("");
    const lo = y(Math.min(1, (pace + goal * .08) / goal)), hi = y(Math.max(0, (pace - goal * .08) / goal));
    const zone = showPace ? `<rect x="40" y="${lo}" width="128" height="${hi - lo}" class="wt-zone"/><line x1="40" x2="168" y1="${y(pace / goal)}" y2="${y(pace / goal)}" class="wt-pace"/>` : "";
    return `<svg class="wt-jug" viewBox="-30 0 330 360" aria-hidden="true">
        <defs><linearGradient id="wtw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FC4DC"/><stop offset="1" stop-color="#3E6F94"/></linearGradient>
        <linearGradient id="wtg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(214,228,240,.16)"/><stop offset=".25" stop-color="rgba(214,228,240,.05)"/><stop offset=".8" stop-color="rgba(214,228,240,.03)"/><stop offset="1" stop-color="rgba(214,228,240,.14)"/></linearGradient>
        <clipPath id="wtc"><path d="${BODY}"/></clipPath></defs>
        <rect x="88" y="36" width="48" height="20" rx="4" fill="rgba(210,173,98,.85)"/>
        <path d="${BODY}" fill="url(#wtg)"/>
        <g clip-path="url(#wtc)"><g class="wt-level" style="transform:translateY(${y(frac)}px)">
            <path class="wt-wave" d="M0 0 ${WAVE}" fill="url(#wtw)"/><path class="wt-wave wt-wave-b" d="M-30 3 ${WAVE}" fill="rgba(199,226,240,.35)"/></g>${zone}</g>
        <path d="${BODY}" fill="none" stroke="rgba(214,228,240,.55)" stroke-width="2"/>
        ${hourMarks}
        <line class="wt-goal" x1="40" x2="168" y1="${TOP}" y2="${TOP}"/>
        <text class="wt-gl" x="84" y="66" text-anchor="end">GOAL ${goal} OZ</text><text class="wt-gl wt-dim" x="84" y="80" text-anchor="end">BY 9 PM</text>
        ${dots}
    </svg>`;
}

/**
 * Open the sheet for a day (a Date; today by default). Resolves when it closes.
 * `habit` is the water habit to tick; `onChange` runs after each saved change.
 */
export async function openWaterSheet({ date = new Date(), habit = null, onChange = null } = {}) {
    const goal = await waterGoal();
    const isToday = dayKey(date) === dayKey(new Date());
    const key = nutritionKey(isToday ? new Date() : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12));
    const dkey = dayKey(date);
    const opener = document.activeElement;
    const dlg = document.createElement("dialog");
    dlg.className = "wt-sheet";
    dlg.setAttribute("aria-label", "Water");
    document.body.appendChild(dlg);

    const dayRecord = () => read(key, null) || {};
    const save = next => {
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { return false; }
        // The water habit ticks at the goal and unticks below it.
        if (habit) {
            const entries = read("entries", {}) || {};
            const dayEntries = { ...(entries[dkey] || {}) };
            const reached = readWater(next).total >= goal;
            if (reached) dayEntries[habit.id] = true; else delete dayEntries[habit.id];
            if (Object.keys(dayEntries).length) entries[dkey] = dayEntries; else delete entries[dkey];
            try { localStorage.setItem("entries", JSON.stringify(entries)); } catch {}
        }
        sync();
        return true;
    };

    function draw(prevTotal = null) {
        const { total, log } = readWater(dayRecord());
        const now = minutesOf(new Date());
        const pace = isToday ? paceOz(goal, now) : goal;
        const tip = isToday ? nextTip(total, goal, now) : null;
        const done = total >= goal;
        const diff = total - pace;
        const line = done ? `<span class="wt-ok">Goal reached.</span> ${total > goal ? `${total - goal} oz over. ` : ""}${habit ? "Your water goal is ticked." : ""}`
            : !isToday ? `<b>${goal - total} oz</b> short of the goal that day.`
            : total === 0 ? "Nothing yet. The green zone is where an even day puts you."
            : `<b>${Math.abs(diff)} oz ${diff >= 0 ? "ahead" : "behind"}</b> of an even pace.`;
        dlg.innerHTML = `<div class="wt-head"><div><p class="wt-kick">${esc(date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))}</p><h2>Water</h2></div>
            <button type="button" class="wt-x" data-close aria-label="Close">${"✕"}</button></div>
            <div class="wt-body"><div class="wt-stage">${jugSvg(goal, total, log, pace, isToday)}</div>
            <div class="wt-side"><div class="wt-count" aria-live="polite">${total} <small>/ ${goal} oz</small></div>
            <p class="wt-sub">${line}</p>
            ${tip ? `<p class="wt-next"><span>Next</span><span><b>+${tip.oz} oz</b> by ${esc(tip.byText)} keeps you on pace</span></p>` : ""}
            <div class="wt-chips">${PRESETS.map(p => `<button type="button" class="wt-chip${p.main ? " is-main" : ""}" data-add="${p.oz}"><b>+${p.oz}</b><small>${esc(p.label)}</small></button>`).join("")}</div>
            <div class="wt-tools"><button type="button" class="wt-link" data-other>Other amount</button>${log.length ? `<button type="button" class="wt-link" data-undo>Undo last</button>` : ""}</div></div></div>`;
        if (prevTotal !== null) {
            // Start the water at the old level, then let it rise to the new one.
            const lvl = dlg.querySelector(".wt-level"), f = Math.min(1, prevTotal / goal);
            const to = lvl.style.transform;
            lvl.style.transition = "none"; lvl.style.transform = `translateY(${BOT - f * H}px)`; lvl.getBoundingClientRect();
            lvl.style.transition = ""; lvl.style.transform = to;
        }
    }

    async function add(oz) {
        const before = readWater(dayRecord()).total;
        const next = addWater(dayRecord(), oz, isToday ? clock(new Date()) : "");
        if (!next) { const { toast } = await import("./ui.js"); toast("That amount does not fit. Try 1 to 200 oz.", { type: "error" }); return; }
        if (!save(next)) return;
        draw(before);
        onChange?.();
        if (before < goal && next.water >= goal && habit) {
            const { celebrateHabit } = await import("./celebrate.js");
            const habits = habitList(read("habits", null), showsPersonalPlan());
            celebrateHabit(habit, { allDone: doneOn(read("entries", {}), dkey, habits) === habits.length });
        }
    }

    dlg.addEventListener("click", async event => {
        if (event.target === dlg || event.target.closest("[data-close]")) { dlg.close(); return; }
        const addBtn = event.target.closest("[data-add]");
        if (addBtn) { add(Number(addBtn.dataset.add)); return; }
        if (event.target.closest("[data-undo]")) {
            const before = readWater(dayRecord()).total;
            const next = undoLast(dayRecord());
            if (next && save(next)) { draw(before); onChange?.(); }
            return;
        }
        if (event.target.closest("[data-other]")) {
            const { sbPrompt } = await import("./ui.js");
            const value = await sbPrompt("How many ounces?", { title: "Other amount", placeholder: "oz", maxLength: 4 });
            const oz = Number(String(value ?? "").trim());
            if (value != null && String(value).trim() !== "") add(oz);
        }
    });
    dlg.addEventListener("close", () => { dlg.remove(); opener?.focus?.(); });

    draw();
    dlg.showModal();
    dlg.querySelector(".wt-chip.is-main")?.focus({ preventScroll: true });
    return new Promise(resolve => dlg.addEventListener("close", resolve, { once: true }));
}
