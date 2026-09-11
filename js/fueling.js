/* ==========================================
   EddieOS Endurance Fueling
========================================== */

const $ = (id) => document.getElementById(id);

/* ==========================================
   State
========================================== */

// mode/library/diyRecipes/plans are populated by loadPersistedState()
// once cloud sync (if any) has pulled this account's latest data down —
// see the Initialize block at the bottom of this file. Reading
// localStorage any earlier would risk using stale, pre-sync data.

let mode = "training";

let lastTargets = null;   // { carbsPerHour, fluidPerHour, sodiumPerHour }
let lastSession = null;   // the session inputs used for the last calculation
let planItems = [];       // library items added to the current plan build
let currentPlanId = null; // set when editing a saved plan
let marathonRef = null;   // { week, dayKey } when this plan is tied to a Marathon workout
let timelineRows = [];    // [{ time: "0:25", label: "Hammer Raspberry Gel" }, ...]
let preWorkoutFood = "";

let library = [];
let diyRecipes = [];
let plans = [];

let activeLibraryTab = "all";

function loadPersistedState() {

    mode = localStorage.getItem("fueling-mode") || "training";

    library = loadLibrary();
    diyRecipes = loadJSON("fueling-diy-recipes", []);
    plans = loadJSON("fueling-plans", []);

}

let marathonModulePromise = null;

let selectedWeek = null;
let selectedDayIndex = null;

/* ==========================================
   Storage helpers
========================================== */

function loadJSON(key, fallback) {

    try {

        const raw = localStorage.getItem(key);

        return raw ? JSON.parse(raw) : fallback;

    } catch (e) {

        return fallback;

    }

}

function saveJSON(key, value) {

    localStorage.setItem(key, JSON.stringify(value));

    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud());

}

function loadLibrary() {

    let saved = loadJSON("fueling-library", null);

    if (!saved) {

        saved = defaultLibrary();

    }

    saved = ensureHammerGels(saved);

    saveJSON("fueling-library", saved);

    return saved;

}

function defaultLibrary() {

    let id = 1;

    const item = (name, category, carbs, sodium, fluid, caffeine, serving, price) => ({

        id: id++,
        name,
        category,
        carbs,
        sodium,
        fluid,
        caffeine,
        serving,
        price

    });

    return [

        item("Basic Carb Gel", "gels", 25, 50, 0, false, "1 packet", "$1.50"),
        item("Caffeinated Carb Gel", "gels", 25, 60, 0, true, "1 packet", "$1.75"),
        item("Isotonic Drink Mix", "drinkmix", 22, 300, 16, false, "1 scoop / 16oz", "$1.00"),
        item("High-Carb Drink Mix", "drinkmix", 45, 350, 16, false, "1 scoop / 16oz", "$1.50"),
        item("Fruit Chews", "chews", 24, 40, 0, false, "1 pack (4 pieces)", "$1.25"),
        item("Energy Bar", "bars", 40, 120, 0, false, "1 bar", "$2.00"),
        item("Electrolyte Tablet", "other", 0, 250, 0, false, "1 tablet in 16oz water", "$0.50")

    ];

}

// Nutrition figures are the manufacturer's stated label values for the
// two Hammer Raspberry Gel formats — not scraped or estimated.
function ensureHammerGels(list) {

    const hasHammer = list.some(i => (i.name || "").toLowerCase().startsWith("hammer gel raspberry"));

    if (hasHammer) return list;

    const maxId = list.reduce((m, i) => Math.max(m, i.id), 0);

    return list.concat([

        {
            id: maxId + 1,
            name: "Hammer Gel Raspberry (Single Pouch)",
            category: "gels",
            carbs: 22,
            sodium: 60,
            fluid: 0,
            caffeine: false,
            serving: "33g pouch",
            price: ""
        },

        {
            id: maxId + 2,
            name: "Hammer Gel Raspberry (26-Serving Jug)",
            category: "gels",
            carbs: 21,
            sodium: 25,
            fluid: 0,
            caffeine: false,
            serving: "33g scoop",
            price: ""
        }

    ]);

}

/* ==========================================
   Marathon Data (shared source of truth)
========================================== */

function getMarathonModule() {
    if (!marathonModulePromise) {
        marathonModulePromise = import("./marathonData.js");
    }

    return marathonModulePromise;
}

async function initWeekSelector() {

    try {

        const data = await getMarathonModule();

        const totalWeeks = data.WEEKS.length;

        const row = $("weekSelectRow");

        row.innerHTML = "";

        const currentWeek = data.getCurrentWeek();

        for (let w = 1; w <= totalWeeks; w++) {

            const btn = document.createElement("button");

            btn.className = "week-chip" + (w === currentWeek ? " current" : "");
            btn.textContent = "Wk " + w;
            btn.dataset.week = w;

            btn.addEventListener("click", () => selectWeek(w));

            row.appendChild(btn);

        }

        await maybeOpenFromQuery(data, currentWeek);

    } catch (err) {

        $("weekSelectRow").innerHTML = "";

        $("workoutDayList").innerHTML = `<p class="fuel-empty-state">Couldn't load Marathon data (js/marathonData.js).</p>`;

        console.error("Marathon data load error:", err);

    }

}

async function maybeOpenFromQuery(data, currentWeek) {

    const params = new URLSearchParams(location.search);

    const qWeek = Number(params.get("week"));
    const qDay = params.get("day");

    if (qWeek && qDay) {

        const existing = findPlanForWorkout(qWeek, qDay);

        await selectWeek(qWeek);

        const dayIndex = data.DAYS.indexOf(qDay);

        if (dayIndex >= 0) {

            const days = data.getAdjustedWeekDays(qWeek);

            selectDay(dayIndex, days[dayIndex], qDay);

        }

        if (existing) {

            openPlan(existing.id);

            document.getElementById("planSummary").scrollIntoView({ behavior: "smooth" });

        }

        return;

    }

    await selectWeek(currentWeek);

}

async function selectWeek(week) {
    selectedWeek = week;
    selectedDayIndex = null;

    document.querySelectorAll(".week-chip").forEach(b => {
        b.classList.toggle("active", Number(b.dataset.week) === week);
    });

    const data = await getMarathonModule();

    // Reload the latest saved Marathon overrides before building the list.
    const days = data.getAdjustedWeekDays(week, data.loadOverrides());

    renderDayList(days, data.DAYS);

    $("workoutDetailCard").style.display = "none";
}

function renderDayList(days, DAYS) {

    const list = $("workoutDayList");

    list.innerHTML = "";

    days.forEach((d, i) => {

        const dayKey = DAYS[i];

        const hasPlan = findPlanForWorkout(selectedWeek, dayKey);

        const row = document.createElement("div");

        row.className = "workout-day-row" + (hasPlan ? " has-plan" : "");

        row.innerHTML = `

            <span class="workout-day-abbr">${dayKey}</span>
            <span class="workout-day-session">${escapeHTML(d.session)}</span>
            <span class="workout-day-miles">${d.miles} mi</span>
            <span class="workout-day-pace">${escapeHTML(d.pace)}</span>
            ${hasPlan ? '<span class="workout-day-check">Fueling Plan ✓</span>' : "<span></span>"}

        `;

        row.addEventListener("click", () => selectDay(i, d, dayKey));

        list.appendChild(row);

    });

}

function selectDay(index, day, dayKey) {

    selectedDayIndex = index;

    document.querySelectorAll(".workout-day-row").forEach((r, i) => {

        r.classList.toggle("selected", i === index);

    });

    const existingPlan = findPlanForWorkout(selectedWeek, dayKey);

    const card = $("workoutDetailCard");

    card.style.display = "";

    card.innerHTML = `

        <h3>Week ${selectedWeek} — ${dayKey}</h3>

        <p class="workout-detail-line">
            ${escapeHTML(day.session)} — ${day.miles} mi @ ${escapeHTML(day.pace)}${day.race ? " (Race)" : ""}
        </p>

        ${existingPlan
            ? `<span class="fuel-tag caffeine">Fueling Plan Saved ✓</span> <button class="fuel-btn secondary small" id="openWorkoutPlanBtn">Open Plan</button>`
            : ""
        }

        <div style="margin-top:14px;">
            <button class="fuel-btn primary small" id="buildFuelingPlanBtn">Build Fueling Plan</button>
        </div>

    `;

$("buildFuelingPlanBtn").addEventListener("click", () => {

    applyMarathonWorkout(
        day,
        selectedWeek,
        dayKey
    );

    updatePlanWorkoutLabel();

});

    if (existingPlan) {

        $("openWorkoutPlanBtn").addEventListener("click", () => {

            openPlan(existingPlan.id);

            document.getElementById("planSummary").scrollIntoView({ behavior: "smooth" });

        });

    }

}

function findPlanForWorkout(week, dayKey) {

    return plans.find(p => p.marathonRef && p.marathonRef.week === week && p.marathonRef.dayKey === dayKey);

}

/* ==========================================
   Session Inputs
========================================== */

function readSession() {

    const prefs = Array.from(

        document.querySelectorAll("#fuelPreferences input:checked")

    ).map(el => el.value);

    return {

        workoutType: $("workoutType").value,
        duration: Number($("duration").value) || 0,
        distance: Number($("distance").value) || 0,
        pace: $("pace").value.trim(),

        bodyWeight: Number($("bodyWeight").value) || 0,
        currentCarbIntake: Number($("currentCarbIntake").value) || 0,
        tolerance: $("tolerance").value,
        stomachSensitivity: $("stomachSensitivity").value,

        temperature: Number($("temperature").value) || 0,
        humidity: Number($("humidity").value) || 0,
        sweatRate: $("sweatRate").value,

        sweatSodium: $("sweatSodium").value,
        typicalSodiumIntake: Number($("typicalSodiumIntake").value) || 0,

        fuelPreferences: prefs,
        caffeineWanted: $("caffeineWanted").checked,

        mode

    };

}

/* ==========================================
   Calculation Logic
   (Transparent, editable starting targets —
   not medical advice. See disclaimer.)
========================================== */

function estimateDurationMinutes(session) {

    if (session.duration > 0) return session.duration;

    if (session.distance > 0) {

        const minPerMile = paceMinutesPerMile(session);

        return Math.round(session.distance * minPerMile);

    }

    return 60;

}

function paceMinutesPerMile(session) {

    const table = {

        recovery: 9.1,
        easy: 8.6,
        long: 8.25,
        workout: 7.5,
        marathon: 7.05,
        race: 7.05,
        other: 8.5

    };

    return table[session.workoutType] || 8.5;

}

function calculateTargets(session) {

    const duration = estimateDurationMinutes(session);

    /* ---- Carbohydrates ---- */

    let baseCarbs;

    if (duration < 45) baseCarbs = 0;
    else if (duration < 75) baseCarbs = 30;
    else if (duration <= 150) baseCarbs = 45;
    else baseCarbs = 60;

    if (session.mode === "race" && duration > 150) baseCarbs = 75;

    const toleranceFactor = { low: 0.7, moderate: 1, high: 1.25 }[session.tolerance] || 1;

    let carbsPerHour = baseCarbs * toleranceFactor;

    if (session.currentCarbIntake > 0) {

        if (session.mode === "training") {

            carbsPerHour = Math.min(Math.max(carbsPerHour, session.currentCarbIntake), session.currentCarbIntake + 15);

        } else {

            carbsPerHour = session.currentCarbIntake;

        }

    }

    if (session.stomachSensitivity === "sensitive") carbsPerHour *= 0.85;
    if (session.stomachSensitivity === "iron") carbsPerHour *= 1.1;

    carbsPerHour = clampRound(carbsPerHour, 0, 100, 5);

    /* ---- Fluids ---- */

    let baseFluid = { low: 16, moderate: 22, high: 28 }[session.sweatRate] || 22;

    if (session.temperature >= 85) baseFluid += 4;
    else if (session.temperature >= 75) baseFluid += 2;

    if (session.humidity >= 70) baseFluid += 2;

    const weightFactor = session.bodyWeight > 0
        ? Math.min(Math.max(session.bodyWeight / 165, 0.8), 1.25)
        : 1;

    const fluidPerHour = clampRound(baseFluid * weightFactor, 8, 40, 1);

    /* ---- Sodium ---- */

    let sodiumPerHour;

    if (session.typicalSodiumIntake > 0) {

        sodiumPerHour = session.typicalSodiumIntake;

    } else {

        const sodiumMap = { light: 300, average: 500, heavy: 800, unknown: 450 };

        sodiumPerHour = sodiumMap[session.sweatSodium] ?? 450;

        if (session.temperature >= 85) sodiumPerHour += 100;

    }

    sodiumPerHour = clampRound(sodiumPerHour, 0, 1500, 25);

    return { duration, carbsPerHour, fluidPerHour, sodiumPerHour };

}

function clampRound(value, min, max, step) {

    const rounded = Math.round(value / step) * step;

    return Math.min(max, Math.max(min, rounded));

}

/* ==========================================
   Render — Targets
========================================== */

function runCalculation() {

    const session = readSession();

    const targets = calculateTargets(session);

    lastSession = session;

    lastTargets = {

        carbsPerHour: targets.carbsPerHour,
        fluidPerHour: targets.fluidPerHour,
        sodiumPerHour: targets.sodiumPerHour

    };

    $("targetsPanel").style.display = "";
    $("compositionPanel").style.display = "";
    $("timelinePanel").style.display = "";

    $("carbsPerHour").value = targets.carbsPerHour;
    $("fluidPerHour").value = targets.fluidPerHour;
    $("sodiumPerHour").value = targets.sodiumPerHour;

    $("calcNote").textContent =
        `Estimated from a ${targets.duration}-minute session, your fueling tolerance, ` +
        `sensitivity, and the conditions entered above. These are starting targets — ` +
        `adjust anything to match what actually works for your gut.`;

    updatePlanWorkoutLabel();
    updateTotalsAndTimeline(true);

}

function currentDurationMinutes() {

    if (lastSession) return estimateDurationMinutes(lastSession);

    return Number($("duration").value) || 60;

}

function updateTotalsAndTimeline(regenerateTimeline) {

    if (!lastTargets) return;

    const carbsPerHour = Number($("carbsPerHour").value) || 0;
    const fluidPerHour = Number($("fluidPerHour").value) || 0;
    const sodiumPerHour = Number($("sodiumPerHour").value) || 0;

    lastTargets = { carbsPerHour, fluidPerHour, sodiumPerHour };

    const duration = currentDurationMinutes();
    const hours = duration / 60;

    $("carbsTotal").textContent = `${Math.round(carbsPerHour * hours)} g`;
    $("fluidTotal").textContent = `${Math.round(fluidPerHour * hours)} oz`;
    $("sodiumTotal").textContent = `${Math.round(sodiumPerHour * hours)} mg`;

    renderTimeline(!!regenerateTimeline);
    renderComposition();
    renderPlanSummary();

}

/* ==========================================
   Mode Toggle (Training vs Race)
========================================== */

function setMode(next) {

    mode = next;

    localStorage.setItem("fueling-mode", mode);

    document.querySelectorAll(".mode-btn").forEach(btn => {

        btn.classList.toggle("active", btn.dataset.mode === mode);

    });

    $("modeCaption").textContent = mode === "race"
        ? "Race mode: exact planned fueling, consistent timing, minimal surprises."
        : "Training mode: practice fueling, train your gut, and experiment in small steps.";

    if (lastSession) {

        lastSession.mode = mode;

        const targets = calculateTargets(lastSession);

        $("carbsPerHour").value = targets.carbsPerHour;
        $("fluidPerHour").value = targets.fluidPerHour;
        $("sodiumPerHour").value = targets.sodiumPerHour;

        updateTotalsAndTimeline(true);

    }

}

$("modeToggle").addEventListener("click", (e) => {

    const btn = e.target.closest(".mode-btn");

    if (!btn) return;

    setMode(btn.dataset.mode);

});

/* ==========================================
   Calculate Button + live target edits
========================================== */

$("calculateBtn").addEventListener("click", runCalculation);

["carbsPerHour", "fluidPerHour", "sodiumPerHour"].forEach(id => {

    $(id).addEventListener("input", () => updateTotalsAndTimeline(false));

});

$("fuelInterval").addEventListener("input", () => updateTotalsAndTimeline(true));

/* ==========================================
   Marathon Integration
========================================== */

$("useMarathonWorkoutBtn").addEventListener("click", async () => {

    try {

        const data = await getMarathonModule();

        const week = data.getCurrentWeek();

        const days = data.getAdjustedWeekDays(week);

        const jsDay = new Date().getDay();          // 0 = Sun ... 6 = Sat
        const dayIndex = (jsDay + 6) % 7;            // 0 = Mon ... 6 = Sun (matches DAYS order)

        const dayKey = data.DAYS[dayIndex];

        const todayWorkout = days[dayIndex];

        if (!todayWorkout) {

            $("marathonWorkoutPreview").textContent = "Couldn't find today's workout on the Marathon page.";

            return;

        }

        applyMarathonWorkout(todayWorkout, week, dayKey);

        await selectWeek(week);

        selectDay(dayIndex, todayWorkout, dayKey);

    } catch (err) {

        $("marathonWorkoutPreview").textContent = "Couldn't load Marathon workout data.";

        console.error("Marathon integration error:", err);

    }

});

function applyMarathonWorkout(workout, week, dayKey) {

    const miles = workout.miles || 0;

    const paceLabel = (workout.pace || "").toLowerCase();

    let workoutType = "workout";

    if (workout.race) workoutType = "race";
    else if (paceLabel.includes("long")) workoutType = "long";
    else if (paceLabel === "recovery" || (miles > 0 && miles <= 4)) workoutType = "easy";

    const minPerMile = {

        recovery: 9.1, easy: 8.6, "long run": 8.25, steady: 7.5,
        threshold: 6.7, cruise: 6.6, "10k pace": 6.33, vo2max: 6.1,
        fartlek: 8.3, "hill effort": 8.5, progression: 7.6,
        "fast finish": 7.2, mp: 7.05, race: 7.05

    }[paceLabel] || 8.3;

    const estimatedDuration = Math.round(miles * minPerMile);

    $("workoutType").value = workoutType;
    $("distance").value = miles || "";
    $("duration").value = estimatedDuration || "";
    $("pace").value = workout.pace || "";

    marathonRef = { week, dayKey, workoutLabel: workout.session || "Workout", miles, pace: workout.pace || "" };

    $("marathonWorkoutPreview").innerHTML =

        `Week ${week} — ${dayKey}: <strong>${escapeHTML(workout.session || "Workout")}</strong> ` +
        `— ${miles} mi @ ${escapeHTML(workout.pace || "")}${workout.race ? " (Race)" : ""}`;

    $("planName").value = `Week ${week} ${dayKey} — ${workout.session || "Workout"}`;

    if (workout.race) setMode("race"); else setMode("training");

    runCalculation();

    document.getElementById("targetsPanel").scrollIntoView({ behavior: "smooth" });

}

function updatePlanWorkoutLabel() {

    $("planWorkoutLabel").textContent = marathonRef

        ? `Week ${marathonRef.week} — ${marathonRef.dayKey}`

        : "Off-plan / custom session";

    $("savePlanBtn").textContent = marathonRef ? "Save to Workout" : "Save Plan";

}

/* ==========================================
   Fueling Composition (gels/chews vs target,
   remainder covered by the homemade drink)
========================================== */

function computeComposition() {

    const duration = currentDurationMinutes();

    const hours = duration / 60;

    const targetCarbs = lastTargets ? Math.round(lastTargets.carbsPerHour * hours) : 0;
    const targetSodium = lastTargets ? Math.round(lastTargets.sodiumPerHour * hours) : 0;

    const gelCarbs = planItems.reduce((s, p) => s + p.carbs * p.qty, 0);
    const gelSodium = planItems.reduce((s, p) => s + p.sodium * p.qty, 0);

    const includeDrink = $("includeHomemadeDrink").checked;

    const drinkCarbs = includeDrink ? (Number($("diyCarbTarget").value) || 0) : 0;
    const drinkSodium = includeDrink ? (Number($("diySodiumTarget").value) || 0) : 0;

    const totalCarbs = gelCarbs + drinkCarbs;
    const totalSodium = gelSodium + drinkSodium;

    const remainderCarbs = Math.max(0, targetCarbs - gelCarbs);
    const remainderSodium = Math.max(0, targetSodium - gelSodium);

    return {

        duration, targetCarbs, targetSodium,
        gelCarbs, gelSodium,
        includeDrink, drinkCarbs, drinkSodium,
        totalCarbs, totalSodium,
        remainderCarbs, remainderSodium

    };

}

function renderComposition() {

    if (!lastTargets) {

        $("compositionPanel").style.display = "none";

        return;

    }

    $("compositionPanel").style.display = "";

    const c = computeComposition();

    const rows = planItems.map(p => `

        <div class="fuel-plan-row">
            <span>${p.qty}× ${escapeHTML(p.name)}</span>
            <span>${p.carbs * p.qty} g carb · ${p.sodium * p.qty} mg sodium</span>
        </div>

    `).join("");

    const onTarget = Math.abs(c.totalCarbs - c.targetCarbs) <= 5 && Math.abs(c.totalSodium - c.targetSodium) <= 50;

    $("compositionBreakdown").innerHTML = `

        ${rows || '<p class="fuel-empty-state">No products added yet — use "Add to Plan" in the Fueling Library below.</p>'}

        ${c.includeDrink
            ? `<div class="fuel-plan-row"><span>Homemade Drink</span><span>${c.drinkCarbs} g carb · ${c.drinkSodium} mg sodium</span></div>`
            : ""
        }

        <div class="fuel-plan-row fuel-plan-total">
            <span>Total</span>
            <span>${c.totalCarbs} g carb · ${c.totalSodium} mg sodium</span>
        </div>

        <div class="fuel-plan-row fuel-plan-target ${onTarget ? "on-target" : "off-target"}">
            <span>Target</span>
            <span>${c.targetCarbs} g carb · ${c.targetSodium} mg sodium ${onTarget ? "— on target ✓" : "— adjust products or drink"}</span>
        </div>

    `;

}

function refreshDiySnapshot(){
    const bottleSize = Number($("diyBottleSize").value) || 16;
    const bottleCount = Math.max(1, Number($("diyBottleCount").value) || 1);
    const carbTarget = Number($("diyCarbTarget").value) || 0;
    const sodiumTarget = Number($("diySodiumTarget").value) || 0;

    const totalFluid = bottleSize * bottleCount;

    const sugarGrams = Math.round(carbTarget * 10) / 10;
    const saltGrams = Math.round((sodiumTarget / 393) * 100) / 100;

    const sugarTsp = Math.round((sugarGrams / SUGAR_G_PER_TSP) * 4) / 4;
    const saltTsp = Math.round((saltGrams / SALT_G_PER_TSP) * 4) / 4;

    $("diyResults").dataset.snapshot = JSON.stringify({
        bottleSize,
        bottleCount,
        carbTarget,
        sodiumTarget,
        totalFluid,
        sugarGrams,
        saltGrams,
        sugarTsp,
        saltTsp,
        carbSource: $("diyCarbSource").value,
        sodiumSource: $("diySodiumSource").value,
        notes: $("diyNotes").value
    });
}

$("includeHomemadeDrink").addEventListener("change", () => {
    refreshDiySnapshot();
    renderComposition();
    renderPlanSummary();
});

$("diyCarbTarget").addEventListener("input", () => {
    refreshDiySnapshot();
    renderComposition();
    renderPlanSummary();
});

$("diySodiumTarget").addEventListener("input", () => {
    refreshDiySnapshot();
    renderComposition();
    renderPlanSummary();
});

$("diyBottleSize").addEventListener("input", () => {
    refreshDiySnapshot();
});

$("diyBottleCount").addEventListener("input", () => {
    refreshDiySnapshot();
});

$("diyCarbSource").addEventListener("change", () => {
    refreshDiySnapshot();
});

$("diySodiumSource").addEventListener("change", () => {
    refreshDiySnapshot();
});

$("diyNotes").addEventListener("input", () => {
    refreshDiySnapshot();
});

$("autoFillDrinkBtn").addEventListener("click", () => {

    if (!lastTargets) {

        alert("Calculate a fueling plan first.");

        return;

    }

    const c = computeComposition();

    $("diyCarbTarget").value = c.remainderCarbs;
    $("diySodiumTarget").value = c.remainderSodium;
    $("includeHomemadeDrink").checked = true;

    refreshDiySnapshot();
    renderComposition();

    document.getElementById("diyPanelAnchor").scrollIntoView({ behavior: "smooth" });

});

/* ==========================================
   Render — Timeline (editable)
========================================== */

function buildFeedQueue() {

    const queue = [];

    planItems.forEach(p => {

        for (let i = 0; i < p.qty; i++) queue.push(p.name);

    });

    if ($("includeHomemadeDrink").checked) queue.push("Homemade Drink");

    return queue;

}

function generateTimelineRows() {
    const duration = currentDurationMinutes();
    const interval = Math.max(
        5,
        Number($("fuelInterval").value) || 25
    );

    const queue = buildFeedQueue();

    const rows = [
        {
            time: "0:00",
            label: "Start — sip fluids, settle in"
        }
    ];

    if (!queue.length) {
        const firstFeedTime = Math.min(interval, duration);

        if (duration > 0) {
            rows.push({
                time: formatClock(firstFeedTime),
                label: "Carbs + fluid"
            });
        }
    } else {
        /*
            Place each planned serving once.

            We use the preferred interval as a guide, but never
            create extra servings just to fill the timeline.
        */
        const availableTimes = [];

        for (
            let t = interval;
            t < duration;
            t += interval
        ) {
            availableTimes.push(t);
        }

        if (!availableTimes.length || availableTimes[availableTimes.length - 1] < duration) {
            availableTimes.push(duration);
        }

        const feedCount = queue.length;

        queue.forEach((item, index) => {
            let time;

            if (feedCount === 1) {
                time = Math.min(interval, duration);
            } else {
                const slot = Math.round(
                    (index / (feedCount - 1)) *
                    (availableTimes.length - 1)
                );

                time = availableTimes[slot];
            }

            rows.push({
                time: formatClock(time),
                label: item
            });
        });
    }

    if (
        lastSession &&
        lastSession.caffeineWanted &&
        rows.length > 2
    ) {
        const midIndex =
            Math.ceil((rows.length - 1) / 2);

        rows[midIndex].label += " + Caffeine";
    }

    return rows;
}

function renderTimeline(regenerate) {

    if (regenerate || !timelineRows.length) timelineRows = generateTimelineRows();

    const container = $("fuelTimeline");

    container.innerHTML = "";

    timelineRows.forEach((row, idx) => {

        const item = document.createElement("div");

        item.className = "fuel-timeline-item";

        item.innerHTML = `

            <div class="fuel-timeline-time">
                <input type="text" class="timeline-time-input" data-idx="${idx}" value="${escapeHTML(row.time)}">
            </div>

            <div class="fuel-timeline-rail">
                <div class="fuel-timeline-dot"></div>
                <div class="fuel-timeline-line"></div>
            </div>

            <div class="fuel-timeline-content">
                <input type="text" class="timeline-label-input" data-idx="${idx}" value="${escapeHTML(row.label)}">
                <button class="timeline-remove-btn" data-idx="${idx}" title="Remove step">✕</button>
            </div>

        `;

        container.appendChild(item);

    });

}

function formatClock(minutes) {

    const h = Math.floor(minutes / 60);

    const m = minutes % 60;

    return `${h}:${String(m).padStart(2, "0")}`;

}

$("fuelTimeline").addEventListener("input", (e) => {

    const idx = e.target.dataset.idx;

    if (idx === undefined) return;

    if (e.target.classList.contains("timeline-time-input")) timelineRows[idx].time = e.target.value;
    if (e.target.classList.contains("timeline-label-input")) timelineRows[idx].label = e.target.value;

    renderPlanSummary();

});

$("fuelTimeline").addEventListener("click", (e) => {

    if (!e.target.classList.contains("timeline-remove-btn")) return;

    const idx = Number(e.target.dataset.idx);

    timelineRows.splice(idx, 1);

    renderTimeline(false);
    renderPlanSummary();

});

$("addTimelineStepBtn").addEventListener("click", () => {

    timelineRows.push({ time: "", label: "" });

    renderTimeline(false);

});

$("regenerateTimelineBtn").addEventListener("click", () => {

    if (!lastTargets) {

        alert("Calculate a fueling plan first.");

        return;

    }

    renderTimeline(true);
    renderPlanSummary();

});

/* ==========================================
   Homemade Drink — Sugar + Salt Calculator

   Table sugar is essentially pure carbohydrate,
   so grams of sugar ≈ grams of carbohydrate needed.
   Table salt (NaCl) is ~39.3% sodium by weight, so
   grams of salt ≈ mg sodium ÷ 393.
========================================== */

const SUGAR_G_PER_TSP = 4.2;
const SALT_G_PER_TSP = 5.7;

const DIY_CARB_SOURCES = {
    "table-sugar": {
        label: "Table Sugar",
        carbsPerGram: 1
    },
    "maltodextrin": {
        label: "Maltodextrin",
        carbsPerGram: 0.95
    },
    "honey": {
        label: "Honey",
        carbsPerGram: 0.82
    },
    "fruit-juice": {
        label: "Fruit Juice",
        carbsPerGram: 0.11
    },
    "sports-drink-powder": {
        label: "Sports Drink Powder",
        carbsPerGram: 0.90
    },
    "other": {
        label: "Other",
        carbsPerGram: 1
    }
};

const DIY_SODIUM_SOURCES = {
    "table-salt": {
        label: "Table Salt",
        sodiumPerGram: 393
    },
    "salt-tabs": {
        label: "Salt Tabs",
        sodiumPerGram: 0
    },
    "electrolyte-mix": {
        label: "Electrolyte Mix",
        sodiumPerGram: 0
    },
    "other": {
        label: "Other",
        sodiumPerGram: 0
    }
};

$("diyCalculateBtn").addEventListener("click", () => {

    const bottleSize = Number($("diyBottleSize").value) || 0;
    const bottleCount = Math.max(1, Number($("diyBottleCount").value) || 1);
    const carbTarget = Number($("diyCarbTarget").value) || 0;
    const sodiumTarget = Number($("diySodiumTarget").value) || 0;

    const totalFluid = bottleSize * bottleCount;

const carbSource = $("diyCarbSource").value;
const sodiumSource = $("diySodiumSource").value;

const carbConfig =
    DIY_CARB_SOURCES[carbSource] ||
    DIY_CARB_SOURCES["table-sugar"];

const sodiumConfig =
    DIY_SODIUM_SOURCES[sodiumSource] ||
    DIY_SODIUM_SOURCES["table-salt"];

const sugarGrams =
    Math.round(
        (carbTarget / carbConfig.carbsPerGram) * 10
    ) / 10;

const saltGrams =
    sodiumSource === "table-salt"
        ? Math.round((sodiumTarget / 393) * 100) / 100
        : 0;

const sugarTsp =
    carbSource === "table-sugar"
        ? Math.round((sugarGrams / SUGAR_G_PER_TSP) * 4) / 4
        : null;

const saltTsp =
    sodiumSource === "table-salt"
        ? Math.round((saltGrams / SALT_G_PER_TSP) * 4) / 4
        : null;

    $("diyWaterAmount").textContent = `${totalFluid} oz`;
$("diySugarGrams").textContent = `${sugarGrams} g`;
$("diySaltGrams").textContent =
    sodiumSource === "table-salt"
        ? `${saltGrams} g`
        : "Use product label";

$("diySugarTsp").textContent =
    sugarTsp !== null
        ? sugarTsp
        : "Use product label";

$("diySaltTsp").textContent =
    saltTsp !== null
        ? saltTsp
        : "Use product label";

    $("diyResults").style.display = "flex";
    $("diyConversionNote").style.display = "";

    $("diyResults").dataset.snapshot = JSON.stringify({

        bottleSize, bottleCount, carbTarget, sodiumTarget, totalFluid,
        sugarGrams, saltGrams, sugarTsp, saltTsp,
        carbSource: $("diyCarbSource").value,
        sodiumSource: $("diySodiumSource").value,
        notes: $("diyNotes").value

    });

    renderComposition();
    renderPlanSummary();

});

$("saveDiyRecipeBtn").addEventListener("click", () => {

    const snapshot = $("diyResults").dataset.snapshot;

    if (!snapshot) return;

    const recipe = JSON.parse(snapshot);

    recipe.id = Date.now();

    recipe.name = prompt("Name this recipe:", "My DIY Mix") || "My DIY Mix";

    diyRecipes.push(recipe);

    saveJSON("fueling-diy-recipes", diyRecipes);

    renderDiyRecipes();

});

function renderDiyRecipes() {

    const list = $("diyRecipeList");

    list.innerHTML = "";

    if (!diyRecipes.length) return;

    diyRecipes.forEach(r => {

        const row = document.createElement("div");

        row.className = "fuel-saved-item";

        row.innerHTML = `

            <div>
                <strong>${escapeHTML(r.name)}</strong>
                <div class="fuel-saved-item-meta">
                    ${r.sugarGrams}g sugar · ${r.saltGrams}g salt · ${r.totalFluid} oz water
                </div>
            </div>

            <button class="fuel-btn secondary small" data-delete-recipe="${r.id}">Delete</button>

        `;

        list.appendChild(row);

    });

}

$("diyRecipeList").addEventListener("click", (e) => {

    const id = e.target.dataset.deleteRecipe;

    if (!id) return;

    diyRecipes = diyRecipes.filter(r => String(r.id) !== id);

    saveJSON("fueling-diy-recipes", diyRecipes);

    renderDiyRecipes();

});

/* ==========================================
   Commercial Fueling Library
========================================== */

function renderLibrary() {

    const grid = $("libraryGrid");

    grid.innerHTML = "";

    const items = activeLibraryTab === "all"
        ? library
        : library.filter(i => i.category === activeLibraryTab);

    if (!items.length) {

        grid.innerHTML = `<p class="fuel-empty-state">No items in this category yet.</p>`;

        return;

    }

    items.forEach(item => {

        const card = document.createElement("div");

        card.className = "fuel-lib-item";

        card.innerHTML = `

            <div class="fuel-lib-item-top">
                <div>
                    <h4>${escapeHTML(item.name)}</h4>
                    <span class="fuel-lib-category">${categoryLabel(item.category)}</span>
                </div>
            </div>

            <div class="fuel-lib-macros">
                <span><b>${item.carbs}g</b> carb</span>
                <span><b>${item.sodium}mg</b> sodium</span>
                ${item.fluid ? `<span><b>${item.fluid}oz</b> fluid</span>` : ""}
                ${item.caffeine ? `<span><b>Caffeine</b></span>` : ""}
                ${item.serving ? `<span>${escapeHTML(item.serving)}</span>` : ""}
                ${item.price ? `<span>${escapeHTML(item.price)}</span>` : ""}
            </div>

            <div class="fuel-lib-actions">
                <button class="add-to-plan" data-add="${item.id}">Add to Plan</button>
                <button data-edit="${item.id}">Edit</button>
                <button data-delete="${item.id}">Delete</button>
            </div>

        `;

        grid.appendChild(card);

    });

}

function categoryLabel(category) {

    return {

        gels: "Gel",
        drinkmix: "Drink Mix",
        chews: "Chews",
        bars: "Bar",
        other: "Other"

    }[category] || "Other";

}

$("libraryTabs").addEventListener("click", (e) => {

    const tab = e.target.closest(".fuel-tab");

    if (!tab) return;

    activeLibraryTab = tab.dataset.category;

    document.querySelectorAll(".fuel-tab").forEach(t => t.classList.toggle("active", t === tab));

    renderLibrary();

});

$("addLibraryItemBtn").addEventListener("click", () => {

    resetLibraryForm();

    $("libraryForm").style.display = "";

});

$("cancelLibraryFormBtn").addEventListener("click", () => {

    $("libraryForm").style.display = "none";

});

function resetLibraryForm() {

    $("libEditId").value = "";
    $("libName").value = "";
    $("libCategory").value = "gels";
    $("libCarbs").value = 25;
    $("libSodium").value = 50;
    $("libFluid").value = 0;
    $("libServing").value = "";
    $("libPrice").value = "";
    $("libCaffeine").checked = false;

}

$("libraryForm").addEventListener("submit", (e) => {

    e.preventDefault();

    const editId = $("libEditId").value;

    const item = {

        id: editId ? Number(editId) : Date.now(),
        name: $("libName").value.trim() || "Unnamed Item",
        category: $("libCategory").value,
        carbs: Number($("libCarbs").value) || 0,
        sodium: Number($("libSodium").value) || 0,
        fluid: Number($("libFluid").value) || 0,
        caffeine: $("libCaffeine").checked,
        serving: $("libServing").value.trim(),
        price: $("libPrice").value.trim()

    };

    if (editId) {

        library = library.map(i => String(i.id) === editId ? item : i);

    } else {

        library.push(item);

    }

    saveJSON("fueling-library", library);

    $("libraryForm").style.display = "none";

    renderLibrary();

});

$("libraryGrid").addEventListener("click", (e) => {

    const editId = e.target.dataset.edit;
    const deleteId = e.target.dataset.delete;
    const addId = e.target.dataset.add;

    if (editId) {

        const item = library.find(i => String(i.id) === editId);

        if (!item) return;

        $("libEditId").value = item.id;
        $("libName").value = item.name;
        $("libCategory").value = item.category;
        $("libCarbs").value = item.carbs;
        $("libSodium").value = item.sodium;
        $("libFluid").value = item.fluid;
        $("libServing").value = item.serving || "";
        $("libPrice").value = item.price || "";
        $("libCaffeine").checked = !!item.caffeine;

        $("libraryForm").style.display = "";

        $("libraryForm").scrollIntoView({ behavior: "smooth", block: "center" });

    }

    if (deleteId) {

        library = library.filter(i => String(i.id) !== deleteId);

        saveJSON("fueling-library", library);

        renderLibrary();

    }

    if (addId) {

        if (!lastTargets) {

            alert("Calculate a fueling plan first, so this item's contribution can be checked against your target.");

            return;

        }

        const item = library.find(i => String(i.id) === addId);

        if (!item) return;

        const existing = planItems.find(p => String(p.id) === addId);

        if (existing) existing.qty += 1;
        else planItems.push({ id: item.id, name: item.name, carbs: item.carbs, sodium: item.sodium, fluid: item.fluid, caffeine: item.caffeine, qty: 1 });

        renderComposition();
        renderTimeline(true);
        renderPlanSummary();

    }

});

/* ==========================================
   Pre-Workout Fuel
========================================== */

const PRE_WORKOUT_OPTIONS = [

    {
        label: "3+ hours before",
        options: ["Oatmeal + banana", "Bagel + honey", "Rice + banana", "Cereal + low-fat milk"]
    },

    {
        label: "1–2 hours before",
        options: ["Banana + toast", "Plain bagel", "Applesauce + pretzels", "Small bowl of white rice"]
    },

    {
        label: "30–60 minutes before",
        options: ["Banana", "Applesauce pouch", "A few dates or a spoon of honey", "Few sips of sports drink"]
    }

];

function renderPreWorkoutGroups() {

    const container = $("preWorkoutGroups");

    container.innerHTML = PRE_WORKOUT_OPTIONS.map(group => `

        <div class="pre-workout-group">
            <h4>${escapeHTML(group.label)}</h4>
            <div class="pre-workout-chips">
                ${group.options.map(opt => `<button type="button" class="pre-workout-chip" data-food="${escapeHTML(opt)}">${escapeHTML(opt)}</button>`).join("")}
            </div>
        </div>

    `).join("");

}

$("preWorkoutGroups").addEventListener("click", (e) => {

    const chip = e.target.closest(".pre-workout-chip");

    if (!chip) return;

    const food = chip.dataset.food;

    $("preWorkoutFood").value = food;

    preWorkoutFood = food;

    renderPlanSummary();

});

$("preWorkoutFood").addEventListener("input", () => {

    preWorkoutFood = $("preWorkoutFood").value;

    renderPlanSummary();

});

/* ==========================================
   Complete Fueling Plan — Summary + Save
========================================== */

function renderPlanSummary() {

    const container = $("planSummary");

    if (!lastTargets && !planItems.length) {

        container.innerHTML = `<p class="fuel-empty-state">Calculate a fueling plan above to build a saved plan.</p>`;

        $("deletePlanBtn").style.display = "none";

        return;

    }

    const duration = currentDurationMinutes();
    const hours = duration / 60;

    let html = "";

    if (lastTargets) {

        const c = computeComposition();

        html += `
            <div class="fuel-plan-row"><span>Workout</span><span>${escapeHTML(workoutSummaryLabel())}</span></div>
            <div class="fuel-plan-row"><span>Duration</span><span>${duration} min</span></div>
            <div class="fuel-plan-row"><span>Carb Target</span><span>${Math.round(lastTargets.carbsPerHour * hours)} g total (${lastTargets.carbsPerHour} g/hr)</span></div>
            <div class="fuel-plan-row"><span>Fluid Target</span><span>${Math.round(lastTargets.fluidPerHour * hours)} oz total (${lastTargets.fluidPerHour} oz/hr)</span></div>
            <div class="fuel-plan-row"><span>Sodium Target</span><span>${Math.round(lastTargets.sodiumPerHour * hours)} mg total (${lastTargets.sodiumPerHour} mg/hr)</span></div>
            <div class="fuel-plan-row"><span>Caffeine</span><span>${lastSession && lastSession.caffeineWanted ? "Yes" : "No"}</span></div>
        `;

        if (c.includeDrink) {

            const snapshot = $("diyResults").dataset.snapshot ? JSON.parse($("diyResults").dataset.snapshot) : null;

            html += `
                <div class="fuel-plan-row">
                    <span>Homemade Drink</span>
                    <span>${snapshot ? `${snapshot.totalFluid} oz water · ${snapshot.sugarGrams}g sugar · ${snapshot.saltGrams}g salt` : `${c.drinkCarbs}g carb · ${c.drinkSodium}mg sodium (calculate below)`}</span>
                </div>
            `;

        }

        if (preWorkoutFood) {

            html += `<div class="fuel-plan-row"><span>Pre-Workout</span><span>${escapeHTML(preWorkoutFood)}</span></div>`;

        }

    }

    if (planItems.length) {

        html += `<div class="fuel-plan-items-list">` + planItems.map(p => `

            <span class="fuel-tag">
                ${p.qty}× ${escapeHTML(p.name)}
                <button data-remove-plan-item="${p.id}" style="background:none;border:none;color:var(--muted);cursor:pointer;">✕</button>
            </span>

        `).join("") + `</div>`;

    }

    container.innerHTML = html;

    $("deletePlanBtn").style.display = currentPlanId ? "" : "none";

}

function workoutSummaryLabel() {

    if (marathonRef) {

        return `Week ${marathonRef.week} — ${marathonRef.dayKey}: ${marathonRef.workoutLabel} (${marathonRef.miles} mi)`;

    }

    if (!lastSession) return "—";

    const typeLabels = {

        easy: "Easy Run", long: "Long Run", workout: "Workout",
        marathon: "Marathon", race: "Race", other: "Other"

    };

    const distance = lastSession.distance ? ` — ${lastSession.distance} mi` : "";

    return `${typeLabels[lastSession.workoutType] || "Workout"}${distance}`;

}

$("planSummary").addEventListener("click", (e) => {

    const id = e.target.dataset.removePlanItem;

    if (!id) return;

    planItems = planItems.filter(p => String(p.id) !== id);

    renderComposition();
    renderTimeline(true);
    renderPlanSummary();

});

function buildPlanObject() {

    const duration = currentDurationMinutes();
    const hours = duration / 60;

    const diySnapshot = $("diyResults").dataset.snapshot ? JSON.parse($("diyResults").dataset.snapshot) : null;

    return {

        id: marathonRef ? `w${marathonRef.week}-${marathonRef.dayKey}` : (currentPlanId || Date.now()),
        name: $("planName").value.trim() || "Untitled Plan",
        workout: workoutSummaryLabel(),
        duration,
        mode,
        marathonRef: marathonRef ? { ...marathonRef } : null,
        date: new Date().toISOString(),
        carbsPerHour: lastTargets ? lastTargets.carbsPerHour : 0,
        fluidPerHour: lastTargets ? lastTargets.fluidPerHour : 0,
        sodiumPerHour: lastTargets ? lastTargets.sodiumPerHour : 0,
        carbTotal: lastTargets ? Math.round(lastTargets.carbsPerHour * hours) : 0,
        fluidTotal: lastTargets ? Math.round(lastTargets.fluidPerHour * hours) : 0,
        sodiumTotal: lastTargets ? Math.round(lastTargets.sodiumPerHour * hours) : 0,
        caffeine: !!(lastSession && lastSession.caffeineWanted),
        items: planItems,
        includeHomemadeDrink: $("includeHomemadeDrink").checked,
        diySnapshot,
        diyInputs: {
            bottleSize: Number($("diyBottleSize").value) || 0,
            bottleCount: Number($("diyBottleCount").value) || 1,
            carbTarget: Number($("diyCarbTarget").value) || 0,
            sodiumTarget: Number($("diySodiumTarget").value) || 0,
            carbSource: $("diyCarbSource").value,
            sodiumSource: $("diySodiumSource").value,
            notes: $("diyNotes").value
        },
        preWorkoutFood,
        timelineRows,
        session: lastSession

    };

}

$("savePlanBtn").addEventListener("click", () => {

    if (!lastTargets) {

        alert("Calculate a fueling plan first before saving.");

        return;

    }

    const plan = buildPlanObject();

    const existingIndex = plans.findIndex(p => String(p.id) === String(plan.id));

    if (existingIndex >= 0) plans[existingIndex] = plan;
    else plans.push(plan);

    currentPlanId = plan.id;

    saveJSON("fueling-plans", plans);

    renderSavedPlans();
    renderPlanSummary();

    if (selectedWeek) renderDayListIfVisible();

    alert(marathonRef ? "Saved to this Marathon workout." : "Plan saved.");

});

$("duplicatePlanBtn").addEventListener("click", () => {

    if (!lastTargets) {

        alert("Calculate a fueling plan first before duplicating.");

        return;

    }

    // Duplicates always become a standalone/custom plan so it doesn't
    // collide with the workout-linked id.
    marathonRef = null;

    currentPlanId = null;

    $("planName").value = ($("planName").value.trim() || "Untitled Plan") + " (Copy)";

    updatePlanWorkoutLabel();

    const plan = buildPlanObject();

    plans.push(plan);

    currentPlanId = plan.id;

    saveJSON("fueling-plans", plans);

    renderSavedPlans();
    renderPlanSummary();

});

$("clearPlanBtn").addEventListener("click", () => {

    currentPlanId = null;
    marathonRef = null;
    planItems = [];
    timelineRows = [];
    preWorkoutFood = "";
    lastTargets = null;
    lastSession = null;

    $("planName").value = "";
    $("preWorkoutFood").value = "";
    $("targetsPanel").style.display = "none";
    $("compositionPanel").style.display = "none";
    $("timelinePanel").style.display = "none";
    $("marathonWorkoutPreview").textContent = "";
    $("diyResults").style.display = "none";
    $("diyConversionNote").style.display = "none";

    updatePlanWorkoutLabel();
    renderPlanSummary();

});

$("deletePlanBtn").addEventListener("click", () => {

    if (!currentPlanId) return;

    if (!confirm("Delete this saved plan?")) return;

    plans = plans.filter(p => String(p.id) !== String(currentPlanId));

    saveJSON("fueling-plans", plans);

    currentPlanId = null;

    renderSavedPlans();
    renderPlanSummary();
    renderDayListIfVisible();

});

function renderDayListIfVisible() {

    if (selectedWeek == null) return;

    getMarathonModule().then(data => {

        const days = data.getAdjustedWeekDays(selectedWeek);

        renderDayList(days, data.DAYS);

    });

}

/* ==========================================
   Saved Fueling Plans (grouped by week)
========================================== */

function renderSavedPlans() {

    const container = $("savedPlansGrid");

    container.innerHTML = "";

    if (!plans.length) {

        container.innerHTML = `<p class="fuel-empty-state">No saved plans yet.</p>`;

        return;

    }

    const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const linked = plans.filter(p => p.marathonRef);
    const custom = plans.filter(p => !p.marathonRef);

    const weeks = [...new Set(linked.map(p => p.marathonRef.week))].sort((a, b) => a - b);

    weeks.forEach(w => {

        const weekPlans = linked

            .filter(p => p.marathonRef.week === w)

            .sort((a, b) => dayOrder.indexOf(a.marathonRef.dayKey) - dayOrder.indexOf(b.marathonRef.dayKey));

        const group = document.createElement("div");

        group.className = "fuel-plan-week-group";

        group.innerHTML = `
            <h3 class="fuel-plan-week-heading">Week ${w}</h3>
            <div class="fuel-saved-plans-grid">${weekPlans.map(planCardHTML).join("")}</div>
        `;

        container.appendChild(group);

    });

    if (custom.length) {

        const group = document.createElement("div");

        group.className = "fuel-plan-week-group";

        group.innerHTML = `
            <h3 class="fuel-plan-week-heading">Custom Plans</h3>
            <div class="fuel-saved-plans-grid">${custom.slice().reverse().map(planCardHTML).join("")}</div>
        `;

        container.appendChild(group);

    }

}

function planCardHTML(plan) {

    const dateLabel = plan.date ? new Date(plan.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

    return `

        <div class="fuel-saved-plan-card">

            <h4>${escapeHTML(plan.name)}</h4>

            <div class="fuel-saved-plan-meta">
                ${plan.marathonRef ? `${plan.marathonRef.dayKey} · ` : ""}${escapeHTML(plan.workout)} · ${plan.duration} min${dateLabel ? " · " + dateLabel : ""}
            </div>

            <div class="fuel-saved-plan-targets">
                <span>${plan.carbTotal}g carbs</span>
                <span>${plan.fluidTotal}oz fluid</span>
                <span>${plan.sodiumTotal}mg sodium</span>
            </div>

            <div class="fuel-saved-plan-actions">
                <button data-open="${plan.id}">Open</button>
                <button data-duplicate="${plan.id}">Duplicate</button>
                <button class="delete" data-delete="${plan.id}">Delete</button>
            </div>

        </div>

    `;

}

$("savedPlansGrid").addEventListener("click", (e) => {

    const openId = e.target.dataset.open;
    const dupId = e.target.dataset.duplicate;
    const delId = e.target.dataset.delete;

    if (openId) openPlan(openId);

    if (dupId) {

        const plan = plans.find(p => String(p.id) === dupId);

        if (!plan) return;

        const copy = { ...plan, id: Date.now(), name: plan.name + " (Copy)", marathonRef: null };

        plans.push(copy);

        saveJSON("fueling-plans", plans);

        renderSavedPlans();

    }

    if (delId) {

        if (!confirm("Delete this saved plan?")) return;

        plans = plans.filter(p => String(p.id) !== delId);

        saveJSON("fueling-plans", plans);

        if (String(currentPlanId) === delId) currentPlanId = null;

        renderSavedPlans();
        renderPlanSummary();
        renderDayListIfVisible();

    }

});

function openPlan(id) {

    const plan = plans.find(p => String(p.id) === String(id));

    if (!plan) return;

    currentPlanId = plan.id;
    marathonRef = plan.marathonRef ? { ...plan.marathonRef } : null;

    $("planName").value = plan.name;

    planItems = (plan.items || []).map(i => ({ ...i }));

    timelineRows = (plan.timelineRows || []).map(r => ({ ...r }));

    preWorkoutFood = plan.preWorkoutFood || "";
    $("preWorkoutFood").value = preWorkoutFood;

    if (plan.session) {

        lastSession = { ...plan.session };

        $("workoutType").value = plan.session.workoutType;
        $("duration").value = plan.session.duration;
        $("distance").value = plan.session.distance || "";
        $("pace").value = plan.session.pace || "";
        $("bodyWeight").value = plan.session.bodyWeight || "";
        $("currentCarbIntake").value = plan.session.currentCarbIntake || "";
        $("tolerance").value = plan.session.tolerance;
        $("stomachSensitivity").value = plan.session.stomachSensitivity;
        $("temperature").value = plan.session.temperature;
        $("humidity").value = plan.session.humidity;
        $("sweatRate").value = plan.session.sweatRate;
        $("sweatSodium").value = plan.session.sweatSodium;
        $("typicalSodiumIntake").value = plan.session.typicalSodiumIntake || "";
        $("caffeineWanted").checked = !!plan.session.caffeineWanted;

        setMode(plan.mode || "training");

    }

    lastTargets = {

        carbsPerHour: plan.carbsPerHour,
        fluidPerHour: plan.fluidPerHour,
        sodiumPerHour: plan.sodiumPerHour

    };

    $("targetsPanel").style.display = "";
    $("compositionPanel").style.display = "";
    $("timelinePanel").style.display = "";

    $("carbsPerHour").value = plan.carbsPerHour;
    $("fluidPerHour").value = plan.fluidPerHour;
    $("sodiumPerHour").value = plan.sodiumPerHour;

    $("includeHomemadeDrink").checked = plan.includeHomemadeDrink !== false;

if (plan.diyInputs) {
    $("diyBottleSize").value =
        plan.diyInputs.bottleSize || 20;

    $("diyBottleCount").value =
        plan.diyInputs.bottleCount || 1;

    $("diyCarbTarget").value =
        plan.diyInputs.carbTarget || 0;

    $("diySodiumTarget").value =
        plan.diyInputs.sodiumTarget || 0;

    $("diyCarbSource").value =
        plan.diyInputs.carbSource || "table-sugar";

    $("diySodiumSource").value =
        plan.diyInputs.sodiumSource || "table-salt";

    $("diyNotes").value =
        plan.diyInputs.notes || "";

    refreshDiySnapshot();
}

if (plan.diySnapshot) {
    $("diyResults").dataset.snapshot =
        JSON.stringify(plan.diySnapshot);

    $("diyWaterAmount").textContent =
        `${plan.diySnapshot.totalFluid} oz`;

    $("diySugarGrams").textContent =
        `${plan.diySnapshot.sugarGrams} g`;

    $("diySaltGrams").textContent =
        `${plan.diySnapshot.saltGrams} g`;

    $("diySugarTsp").textContent =
        plan.diySnapshot.sugarTsp ?? "Use product label";

    $("diySaltTsp").textContent =
        plan.diySnapshot.saltTsp ?? "Use product label";

    $("diyResults").style.display = "flex";
    $("diyConversionNote").style.display = "";
} else {
    $("diyResults").style.display = "none";
    $("diyConversionNote").style.display = "none";
    delete $("diyResults").dataset.snapshot;
}

    updatePlanWorkoutLabel();

    renderTimeline(false);
    renderComposition();
    renderPlanSummary();

    document.querySelector(".page-title").scrollIntoView({ behavior: "smooth" });

}

/* ==========================================
   Utilities
========================================== */

function escapeHTML(str) {

    const div = document.createElement("div");

    div.textContent = str == null ? "" : String(str);

    return div.innerHTML;

}

/* ==========================================
   Initialize
========================================== */

import("./cloudSync.js").then(({ initCloudSync }) => {

    initCloudSync().then(() => {

        loadPersistedState();

        setMode(mode);
        renderLibrary();
        renderDiyRecipes();
        renderSavedPlans();
        renderPlanSummary();
        renderPreWorkoutGroups();
        updatePlanWorkoutLabel();
        initWeekSelector();

    });

});
