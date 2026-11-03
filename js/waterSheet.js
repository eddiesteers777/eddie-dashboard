/* ==========================================
   Southbound — the water screen: the rising tide (2026-11-02)

   Tapping the Water goal opens this instead of ticking it. A full screen
   of water rises as you add what you drank; the goal ticks itself when
   you reach it, and the finale plays right here (the water floods, a
   check rises like a buoy, "Fully hydrated"). The amount stays editable
   (chips, Other amount, Undo), sound is on unless muted. Numbers live in
   js/waterModel.js (the total is the `water` the Nutrition page logs,
   "nutrition-YYYY-MM-DD") and js/waterTide.js; the sea is js/waterSea.js,
   sound js/waterSound.js. Mock-ups: project files completion-moments/water/.
========================================== */

import { PRESETS, readWater, addWater, undoLast, paceOz, nextTip, nutritionKey, minutesOf, clock, DAY_START, DAY_END } from "./waterModel.js";
import { habitList, dayKey, doneOn } from "./habitDefaults.js";
import { habitStreak, dayComplete } from "./todayCues.js";
import { tideY, layoutFor, countCaption, paceMessage, finaleSummary, paceTag } from "./waterTide.js";
import { createSea } from "./waterSea.js";
import { soundOn, setSoundOn, primeSound, playPour, playChime } from "./waterSound.js";
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

const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const buzz = p => { try { if (!reduced()) navigator.vibrate?.(p); } catch { /* not every phone buzzes */ } };
const SPEAKER = on => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/>${on ? '<path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;
const SPARKS = [[8, 14, 16], [86, 10, 20], [18, 46, 14], [84, 42, 18], [10, 74, 12], [90, 70, 16], [50, 6, 14], [30, 60, 10], [70, 58, 12]];
const EMOJIS = [[-130, -80, 58, -14, .9], [130, -70, 52, 12, 1], [-140, 60, 50, 8, 1.1], [135, 80, 48, -10, 1.05]];

/**
 * Open the screen for a day (a Date; today by default). Resolves when it closes.
 * `habit` is the water habit to tick; `onChange` runs after each saved change.
 */
export async function openWaterSheet({ date = new Date(), habit = null, onChange = null } = {}) {
    const goal = await waterGoal();
    const isToday = dayKey(date) === dayKey(new Date());
    const key = nutritionKey(isToday ? new Date() : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12));
    const dkey = dayKey(date);
    const opener = document.activeElement;
    const celebrate = import("./celebrate.js").catch(() => null);
    const still = reduced();
    const dlg = document.createElement("dialog");
    dlg.className = "wt-sheet";
    dlg.setAttribute("aria-label", "Water");
    dlg.innerHTML = `<canvas class="wt-sea" aria-hidden="true"></canvas>
        <div class="wt-goal" aria-hidden="true"><span>GOAL · ${goal} OZ</span></div>
        <div class="wt-pace" aria-hidden="true"><span></span></div>
        <div class="wt-count" aria-live="polite"><b></b><small></small></div>
        <i class="wt-halo" style="--d:0s"></i><i class="wt-halo" style="--d:.35s"></i>
        <div class="wt-buoy" aria-hidden="true"><svg viewBox="0 0 100 100"><polyline points="27 53 44 70 75 33"/></svg></div>
        <div class="wt-title" aria-live="polite"><h2></h2><p></p></div>
        <div class="wt-fx" aria-hidden="true"></div>
        <div class="wt-ui">
            <div class="wt-top"><div><p class="wt-kick">${esc(date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))}</p><h1>Water</h1></div>
                <div class="wt-btns"><button type="button" class="wt-x" data-sound aria-label="Sound"></button><button type="button" class="wt-x" data-close aria-label="Close">&#10005;</button></div></div>
            <div class="wt-lower"><p class="wt-msg"></p><p class="wt-next"></p>
                <div class="wt-chips">${PRESETS.map(p => `<button type="button" class="wt-chip${p.main ? " is-main" : ""}" data-add="${p.oz}"><b>+${p.oz}</b><small>${esc(p.label)}</small></button>`).join("")}</div>
                <div class="wt-tools"><button type="button" class="wt-link" data-other>Other amount</button><button type="button" class="wt-link" data-undo>Undo last</button></div></div>
        </div>`;
    document.body.appendChild(dlg);
    const $ = sel => dlg.querySelector(sel);
    const countEl = $(".wt-count"), numEl = $(".wt-count b"), capEl = $(".wt-count small"), msgEl = $(".wt-msg"), nextEl = $(".wt-next");
    const goalEl = $(".wt-goal"), paceEl = $(".wt-pace"), fxEl = $(".wt-fx"), titleH = $(".wt-title h2"), titleP = $(".wt-title p"), lower = $(".wt-lower");
    const sea = createSea($(".wt-sea"), { still });

    const dayRecord = () => read(key, null) || {};
    const entriesNow = () => read("entries", {}) || {};
    const streakNow = () => (habit ? habitStreak(entriesNow(), [habit], dkey) : 0);
    const save = next => {
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { return false; }
        // The water habit ticks at the goal and unticks below it.
        if (habit) {
            const entries = entriesNow();
            const dayEntries = { ...(entries[dkey] || {}) };
            const reached = readWater(next).total >= goal;
            if (reached) dayEntries[habit.id] = true; else delete dayEntries[habit.id];
            if (Object.keys(dayEntries).length) entries[dkey] = dayEntries; else delete entries[dkey];
            try { localStorage.setItem("entries", JSON.stringify(entries)); } catch {}
        }
        sync();
        return true;
    };

    // ---- layout: sizes in px from the screen's own size
    let L = null, underCount = false, underMsg = false, underTools = false, nowMin = minutesOf(new Date());
    const paceNow = () => (isToday ? paceOz(goal, nowMin) : goal);
    let lastW = 0, lastH = 0;
    function layoutCountBack() {
        // After the finale the total comes back, smaller, under "Fully hydrated" so later drinks still count up.
        if (L) dlg.style.setProperty("--cb", `${L.titleTop + L.titleSize + 46 - L.countTop}px`);
    }
    function layout() {
        const w = dlg.clientWidth, h = dlg.clientHeight;
        if (!w || !h) return;
        lastW = w; lastH = h;
        L = layoutFor(w, h, lower.offsetTop);
        const st = dlg.style;
        st.setProperty("--gy", L.goalY + "px"); st.setProperty("--ct", L.countTop + "px"); st.setProperty("--cs", L.countSize + "px");
        st.setProperty("--bd", L.buoy + "px"); st.setProperty("--by", L.buoyY + "px"); st.setProperty("--tt", L.titleTop + "px"); st.setProperty("--tf", L.titleSize + "px");
        st.setProperty("--py", tideY(paceNow(), goal, L.goalY, L.floorY) + "px");
        sea.resize(w, h);
        sea.setTarget(tideY(readWater(dayRecord()).total, goal, L.goalY, L.floorY), true);
        msgTop = lower.offsetTop + msgEl.offsetTop;
        layoutCountBack(); toolsTop = lower.offsetTop + $(".wt-tools").offsetTop;
    }
    let msgTop = 0, toolsTop = 0;
    // White text where the water has risen past it.
    sea.onFrame(y => {
        // iPhone can change the screen's height without a resize event (the keyboard from Other amount,
        // the toolbar). Redraw the sea at the real size so it always reaches the bottom.
        if (dlg.clientHeight !== lastH || dlg.clientWidth !== lastW) { layout(); return; }
        if (!L) return;
        const uc = L.countMid > y, um = msgTop > y;
        if (uc !== underCount) { underCount = uc; countEl.classList.toggle("is-under", uc); }
        if (um !== underMsg) { underMsg = um; dlg.classList.toggle("is-under-msg", um); }
        const ut = toolsTop > y;
        if (ut !== underTools) { underTools = ut; dlg.classList.toggle("is-under-tools", ut); }
    });

    // ---- state
    let shown = 0, countRaf = 0, crossedAllDone = null, finaleOn = false;
    function countTo(a, b) {
        cancelAnimationFrame(countRaf);
        if (still || a === b) { numEl.textContent = b; return; }
        const t0 = performance.now();
        (function step(now) {
            const k = Math.min(1, (now - t0) / 650), e = 1 - Math.pow(1 - k, 3);
            numEl.textContent = Math.round(a + (b - a) * e);
            if (k < 1) countRaf = requestAnimationFrame(step);
        })(t0);
        countEl.classList.remove("is-bump"); void countEl.offsetWidth; countEl.classList.add("is-bump");
    }
    function plusFloat(v) {
        const p = document.createElement("div");
        p.className = "wt-plus" + (underCount || finaleOn ? " is-light" : "");
        p.textContent = "+" + v + " oz";
        fxEl.appendChild(p);
        setTimeout(() => p.remove(), 1200);
    }
    const titleHtml = text => [...text].map((c, i) => c === " " ? `<span class="s" style="--k:${i}"></span>` : `<span style="--k:${i}">${c}</span>`).join("");
    async function startFinale(settled) {
        finaleOn = true;
        const mod = await celebrate;
        const src = mod?.celebrateEmojiSrc ? mod.celebrateEmojiSrc("hydrate") : "emoji/celebrate/sb_hydrate.svg";
        titleH.innerHTML = titleHtml("Fully hydrated");
        titleH.setAttribute("aria-label", "Fully hydrated");
        dlg.classList.toggle("is-settled", !!settled);
        dlg.classList.remove("is-done"); void dlg.offsetWidth; dlg.classList.add("is-done");
        sea.flood(true, settled || still);
        if (!settled) { sea.splash(40); buzz([20, 60, 30]); playChime(); }
        fxEl.innerHTML = settled || still ? "" :
            EMOJIS.map(([x, y, z, r, dl]) => `<img class="wt-em" src="${src}" alt="" style="--x:${x}px;--y:${y}px;--z:${z}px;--r:${r}deg;--dl:${dl}s">`).join("") +
            SPARKS.map(([x, y, s], i) => `<i class="wt-spark" style="--x:${x}%;--y:${y}%;--s:${s}px;--i:${i}"></i>`).join("");
    }
    function endFinale() {
        finaleOn = false;
        dlg.classList.remove("is-done", "is-settled");
        sea.flood(false);
        fxEl.innerHTML = "";
    }
    function render(prev) {
        const { total } = readWater(dayRecord());
        const done = total >= goal;
        const y = L ? tideY(total, goal, L.goalY, L.floorY) : 0;
        sea.setTarget(y);
        if (prev != null) countTo(prev, total); else numEl.textContent = total;
        shown = total;
        capEl.textContent = done ? "oz today" : countCaption(total, goal);
        const m = paceMessage({ total, pace: paceNow(), isToday, goal });
        msgEl.innerHTML = done ? "" : `${m.lead ? `<b>${esc(m.lead)}</b>` : ""}${esc(m.rest)}`;
        const tip = isToday && !done ? nextTip(total, goal, nowMin) : null;
        nextEl.hidden = !tip;
        nextEl.innerHTML = tip ? `Next: <b>+${tip.oz} oz</b> by ${esc(tip.byText)} keeps you on pace` : "";
        const showPace = isToday && !done && paceNow() > 0;
        paceEl.hidden = !showPace;
        if (showPace) { paceEl.querySelector("span").textContent = paceTag(paceNow(), Math.min(DAY_END, Math.max(DAY_START, nowMin))).toUpperCase(); }
        dlg.querySelector("[data-undo]").hidden = !readWater(dayRecord()).log.length;
        titleP.textContent = finaleSummary(total, goal, streakNow(), { withTotal: false });
        const was = finaleOn;
        if (done && !was) startFinale(prev == null);
        else if (!done && was) endFinale();
        capEl.parentElement.setAttribute("aria-label", `${total} of ${goal} ounces`);
    }

    async function add(oz) {
        const before = readWater(dayRecord()).total;
        const next = addWater(dayRecord(), oz, isToday ? clock(new Date()) : "");
        if (!next) { const { toast } = await import("./ui.js"); toast("That amount does not fit. Try 1 to 200 oz.", { type: "error" }); return; }
        if (!save(next)) return;
        nowMin = minutesOf(new Date());
        sea.surge(12); sea.splash(10); plusFloat(oz); buzz(8); playPour(oz);
        const crossing = before < goal && next.water >= goal;
        render(before);
        onChange?.();
        if (crossing && habit) {
            // The finale is the celebration here. A finished day gets its Day complete card when this screen closes.
            const habits = habitList(read("habits", null), showsPersonalPlan());
            crossedAllDone = doneOn(entriesNow(), dkey, habits) === habits.length ? { count: habits.length } : null;
        }
    }

    const soundBtn = $("[data-sound]");
    const drawSound = () => { const on = soundOn(); soundBtn.innerHTML = SPEAKER(on); soundBtn.setAttribute("aria-pressed", String(on)); soundBtn.setAttribute("aria-label", on ? "Sound on. Tap to mute" : "Sound off. Tap to turn on"); };
    drawSound();

    dlg.addEventListener("click", async event => {
        if (event.target === dlg || event.target.closest("[data-close]")) { closeNicely(); return; }
        primeSound();
        if (event.target.closest("[data-sound]")) { setSoundOn(!soundOn()); drawSound(); if (soundOn()) playPour(12); return; }
        const addBtn = event.target.closest("[data-add]");
        if (addBtn) { add(Number(addBtn.dataset.add)); return; }
        if (event.target.closest("[data-undo]")) {
            const before = readWater(dayRecord()).total;
            const next = undoLast(dayRecord());
            if (next && save(next)) { sea.surge(7); render(before); onChange?.(); }
            return;
        }
        if (event.target.closest("[data-other]")) {
            const { sbPrompt } = await import("./ui.js");
            const value = await sbPrompt("How many ounces?", { title: "Other amount", placeholder: "oz", maxLength: 4 });
            const oz = Number(String(value ?? "").trim());
            if (value != null && String(value).trim() !== "") add(oz);
        }
    });
    let ro = null, closing = false;
    // Close with the water draining away, then the dialog goes (instantly with reduced motion).
    function closeNicely() {
        if (closing) return;
        closing = true;
        if (still || !L) { dlg.close(); return; }
        dlg.classList.add("is-closing");
        sea.flood(false); sea.setTarget(dlg.clientHeight + 40);
        setTimeout(() => dlg.close(), 420);
    }
    dlg.addEventListener("cancel", event => { event.preventDefault(); closeNicely(); });
    dlg.addEventListener("close", async () => {
        ro?.disconnect(); sea.stop(); cancelAnimationFrame(countRaf);
        dlg.remove(); opener?.focus?.();
        if (crossedAllDone && habit && readWater(read(key, null) || {}).total >= goal) {
            const mod = await celebrate;
            mod?.celebrateHabit?.(habit, { allDone: true, count: crossedAllDone.count, streak: habitStreak(entriesNow(), habitList(read("habits", null), showsPersonalPlan()), dkey), days: mod.weekDots(dkey, k => dayComplete(entriesNow(), k, habitList(read("habits", null), showsPersonalPlan()))) });
        }
    });

    dlg.showModal();
    layout();
    render();
    sea.start();
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(() => { layout(); }); ro.observe(dlg); }
    const relayout = () => requestAnimationFrame(layout);
    window.visualViewport?.addEventListener("resize", relayout);
    window.addEventListener("resize", relayout);
    dlg.addEventListener("close", () => { window.visualViewport?.removeEventListener("resize", relayout); window.removeEventListener("resize", relayout); }, { once: true });
    $(".wt-chip.is-main")?.focus({ preventScroll: true });
    return new Promise(resolve => dlg.addEventListener("close", resolve, { once: true }));
}
