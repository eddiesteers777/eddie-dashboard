/* ==========================================
   EddieOS Endurance Fueling
========================================== */

const $ = (id) => document.getElementById(id);

/* ==========================================
   State
========================================== */

let mode = localStorage.getItem("fueling-mode") || "training";

let lastTargets = null;   // { carbsPerHour, fluidPerHour, sodiumPerHour }
let lastSession = null;   // the session inputs used for the last calculation
let planItems = [];       // library items added to the current plan build
let currentPlanId = null; // set when editing a saved plan

let library = loadLibrary();
let diyRecipes = loadJSON("fueling-diy-recipes", []);
let plans = loadJSON("fueling-plans", []);

let activeLibraryTab = "all";

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

}

function loadLibrary() {

    const saved = loadJSON("fueling-library", null);

    if (saved) return saved;

    const seeded = defaultLibrary();

    saveJSON("fueling-library", seeded);

    return seeded;

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

            // Encourage gradual gut training: nudge up from current habit, capped
            carbsPerHour = Math.min(Math.max(carbsPerHour, session.currentCarbIntake), session.currentCarbIntake + 15);

        } else {

            // Race day: stick with what's proven, don't introduce anything new
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

    return {

        duration,
        carbsPerHour,
        fluidPerHour,
        sodiumPerHour

    };

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
    $("timelinePanel").style.display = "";

    $("carbsPerHour").value = targets.carbsPerHour;
    $("fluidPerHour").value = targets.fluidPerHour;
    $("sodiumPerHour").value = targets.sodiumPerHour;

    $("calcNote").textContent =
        `Estimated from a ${targets.duration}-minute session, your fueling tolerance, ` +
        `sensitivity, and the conditions entered above. These are starting targets — ` +
        `adjust anything to match what actually works for your gut.`;

    updateTotalsAndTimeline();
    renderPlanSummary();

}

function currentDurationMinutes() {

    if (lastSession) return estimateDurationMinutes(lastSession);

    return Number($("duration").value) || 60;

}

function updateTotalsAndTimeline() {

    if (!lastTargets) return;

    const carbsPerHour = Number($("carbsPerHour").value) || 0;
    const fluidPerHour = Number($("fluidPerHour").value) || 0;
    const sodiumPerHour = Number($("sodiumPerHour").value) || 0;
    const interval = Math.max(5, Number($("fuelInterval").value) || 30);

    lastTargets = { carbsPerHour, fluidPerHour, sodiumPerHour };

    const duration = currentDurationMinutes();
    const hours = duration / 60;

    $("carbsTotal").textContent = `${Math.round(carbsPerHour * hours)} g`;
    $("fluidTotal").textContent = `${Math.round(fluidPerHour * hours)} oz`;
    $("sodiumTotal").textContent = `${Math.round(sodiumPerHour * hours)} mg`;

    renderTimeline(duration, interval, carbsPerHour, fluidPerHour, sodiumPerHour);
    renderPlanSummary();

}

/* ==========================================
   Render — Timeline
========================================== */

function renderTimeline(duration, interval, carbsPerHour, fluidPerHour, sodiumPerHour) {

    const container = $("fuelTimeline");

    container.innerHTML = "";

    const feeds = [];

    for (let t = interval; t <= duration; t += interval) feeds.push(t);

    // pick roughly the midpoint feed for caffeine, if wanted
    const caffeineAt = feeds.length ? feeds[Math.floor((feeds.length - 1) / 2)] : null;

    const carbsPerFeed = Math.round(carbsPerHour * (interval / 60));
    const fluidPerFeed = Math.round(fluidPerHour * (interval / 60));
    const sodiumPerFeed = Math.round(sodiumPerHour * (interval / 60));

    const rows = [{ time: 0, start: true }].concat(

        feeds.map(t => ({ time: t }))

    );

    rows.forEach((row, index) => {

        const item = document.createElement("div");

        item.className = "fuel-timeline-item";

        const tags = [];

        if (row.start) {

            tags.push(`<span class="fuel-tag start">Start — sip fluids, settle in</span>`);

        } else {

            if (carbsPerFeed > 0) tags.push(`<span class="fuel-tag carb">${carbsPerFeed} g carbs</span>`);
            if (fluidPerFeed > 0) tags.push(`<span class="fuel-tag fluid">${fluidPerFeed} oz fluid</span>`);
            if (sodiumPerFeed > 0) tags.push(`<span class="fuel-tag sodium">${sodiumPerFeed} mg sodium</span>`);

            if (lastSession && lastSession.caffeineWanted && row.time === caffeineAt) {

                tags.push(`<span class="fuel-tag caffeine">Caffeine</span>`);

            }

            if (!tags.length) tags.push(`<span class="fuel-tag start">Check in</span>`);

        }

        item.innerHTML = `

            <div class="fuel-timeline-time">${formatClock(row.time)}</div>

            <div class="fuel-timeline-rail">
                <div class="fuel-timeline-dot"></div>
                <div class="fuel-timeline-line"></div>
            </div>

            <div class="fuel-timeline-content">
                ${tags.join("")}
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

        updateTotalsAndTimeline();

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

["carbsPerHour", "fluidPerHour", "sodiumPerHour", "fuelInterval"].forEach(id => {

    $(id).addEventListener("input", updateTotalsAndTimeline);

});

/* ==========================================
   Marathon Integration
========================================== */

$("useMarathonWorkoutBtn").addEventListener("click", async () => {

    try {

        const data = await import("./marathonData.js");

        const week = data.getCurrentWeek();

        const days = data.getAdjustedWeekDays(week);

        const jsDay = new Date().getDay();          // 0 = Sun ... 6 = Sat
        const dayIndex = (jsDay + 6) % 7;            // 0 = Mon ... 6 = Sun (matches DAYS order)

        const todayWorkout = days[dayIndex];

        if (!todayWorkout) {

            $("marathonWorkoutPreview").textContent = "Couldn't find today's workout on the Marathon page.";

            return;

        }

        applyMarathonWorkout(todayWorkout, week);

    } catch (err) {

        $("marathonWorkoutPreview").textContent = "Couldn't load Marathon workout data.";

        console.error("Marathon integration error:", err);

    }

});

function applyMarathonWorkout(workout, week) {

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

    $("marathonWorkoutPreview").innerHTML =

        `Week ${week}: <strong>${escapeHTML(workout.session || "Workout")}</strong> ` +
        `— ${miles} mi @ ${escapeHTML(workout.pace || "")}${workout.race ? " (Race)" : ""}`;

    if (workout.race) setMode("race"); else setMode("training");

    runCalculation();

}

/* ==========================================
   DIY Fueling Calculator
========================================== */

$("diyCalculateBtn").addEventListener("click", () => {

    const bottleSize = Number($("diyBottleSize").value) || 0;
    const bottleCount = Math.max(1, Number($("diyBottleCount").value) || 1);
    const carbTarget = Number($("diyCarbTarget").value) || 0;
    const sodiumTarget = Number($("diySodiumTarget").value) || 0;

    const carbsPerBottle = Math.round(carbTarget / bottleCount);
    const sodiumPerBottle = Math.round(sodiumTarget / bottleCount);
    const totalFluid = bottleSize * bottleCount;

    $("diyCarbsPerBottle").textContent = `${carbsPerBottle} g`;
    $("diySodiumPerBottle").textContent = `${sodiumPerBottle} mg`;
    $("diyTotalFluid").textContent = `${totalFluid} oz`;

    $("diyResults").style.display = "flex";

    $("diyResults").dataset.snapshot = JSON.stringify({

        bottleSize, bottleCount, carbTarget, sodiumTarget,
        carbsPerBottle, sodiumPerBottle, totalFluid,
        carbSource: $("diyCarbSource").value,
        sodiumSource: $("diySodiumSource").value,
        notes: $("diyNotes").value

    });

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
                    ${r.carbsPerBottle} g carbs · ${r.sodiumPerBottle} mg sodium · ${r.totalFluid} oz total
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

        const item = library.find(i => String(i.id) === addId);

        if (!item) return;

        const existing = planItems.find(p => String(p.id) === addId);

        if (existing) existing.qty += 1;
        else planItems.push({ id: item.id, name: item.name, carbs: item.carbs, sodium: item.sodium, fluid: item.fluid, caffeine: item.caffeine, qty: 1 });

        renderPlanSummary();

    }

});

/* ==========================================
   Build a Plan
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

        html += `
            <div class="fuel-plan-row"><span>Workout</span><span>${escapeHTML(workoutSummaryLabel())}</span></div>
            <div class="fuel-plan-row"><span>Duration</span><span>${duration} min</span></div>
            <div class="fuel-plan-row"><span>Carb Target</span><span>${Math.round(lastTargets.carbsPerHour * hours)} g total (${lastTargets.carbsPerHour} g/hr)</span></div>
            <div class="fuel-plan-row"><span>Fluid Target</span><span>${Math.round(lastTargets.fluidPerHour * hours)} oz total (${lastTargets.fluidPerHour} oz/hr)</span></div>
            <div class="fuel-plan-row"><span>Sodium Target</span><span>${Math.round(lastTargets.sodiumPerHour * hours)} mg total (${lastTargets.sodiumPerHour} mg/hr)</span></div>
            <div class="fuel-plan-row"><span>Caffeine</span><span>${lastSession && lastSession.caffeineWanted ? "Yes" : "No"}</span></div>
        `;

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

    renderPlanSummary();

});

function buildPlanObject() {

    const duration = currentDurationMinutes();
    const hours = duration / 60;

    return {

        id: currentPlanId || Date.now(),
        name: $("planName").value.trim() || "Untitled Plan",
        workout: workoutSummaryLabel(),
        duration,
        mode,
        carbsPerHour: lastTargets ? lastTargets.carbsPerHour : 0,
        fluidPerHour: lastTargets ? lastTargets.fluidPerHour : 0,
        sodiumPerHour: lastTargets ? lastTargets.sodiumPerHour : 0,
        carbTotal: lastTargets ? Math.round(lastTargets.carbsPerHour * hours) : 0,
        fluidTotal: lastTargets ? Math.round(lastTargets.fluidPerHour * hours) : 0,
        sodiumTotal: lastTargets ? Math.round(lastTargets.sodiumPerHour * hours) : 0,
        caffeine: !!(lastSession && lastSession.caffeineWanted),
        items: planItems,
        session: lastSession

    };

}

$("savePlanBtn").addEventListener("click", () => {

    if (!lastTargets) {

        alert("Calculate a fueling plan first (Step 1 → Step 2) before saving.");

        return;

    }

    const plan = buildPlanObject();

    const existingIndex = plans.findIndex(p => p.id === plan.id);

    if (existingIndex >= 0) plans[existingIndex] = plan;
    else plans.push(plan);

    currentPlanId = plan.id;

    saveJSON("fueling-plans", plans);

    renderSavedPlans();
    renderPlanSummary();

});

$("duplicatePlanBtn").addEventListener("click", () => {

    if (!lastTargets) {

        alert("Calculate a fueling plan first before duplicating.");

        return;

    }

    currentPlanId = null;

    $("planName").value = ($("planName").value.trim() || "Untitled Plan") + " (Copy)";

    const plan = buildPlanObject();

    plans.push(plan);

    currentPlanId = plan.id;

    saveJSON("fueling-plans", plans);

    renderSavedPlans();
    renderPlanSummary();

});

$("clearPlanBtn").addEventListener("click", () => {

    currentPlanId = null;
    planItems = [];
    lastTargets = null;
    lastSession = null;

    $("planName").value = "";
    $("targetsPanel").style.display = "none";
    $("timelinePanel").style.display = "none";
    $("marathonWorkoutPreview").textContent = "";

    renderPlanSummary();

});

$("deletePlanBtn").addEventListener("click", () => {

    if (!currentPlanId) return;

    if (!confirm("Delete this saved plan?")) return;

    plans = plans.filter(p => p.id !== currentPlanId);

    saveJSON("fueling-plans", plans);

    currentPlanId = null;

    renderSavedPlans();
    renderPlanSummary();

});

/* ==========================================
   Saved Plans
========================================== */

function renderSavedPlans() {

    const grid = $("savedPlansGrid");

    grid.innerHTML = "";

    if (!plans.length) {

        grid.innerHTML = `<p class="fuel-empty-state">No saved plans yet.</p>`;

        return;

    }

    plans.slice().reverse().forEach(plan => {

        const card = document.createElement("div");

        card.className = "fuel-saved-plan-card";

        card.innerHTML = `

            <h4>${escapeHTML(plan.name)}</h4>

            <div class="fuel-saved-plan-meta">
                ${escapeHTML(plan.workout)} · ${plan.duration} min · ${plan.mode === "race" ? "Race" : "Training"}
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

        `;

        grid.appendChild(card);

    });

}

$("savedPlansGrid").addEventListener("click", (e) => {

    const openId = e.target.dataset.open;
    const dupId = e.target.dataset.duplicate;
    const delId = e.target.dataset.delete;

    if (openId) openPlan(Number(openId));

    if (dupId) {

        const plan = plans.find(p => p.id === Number(dupId));

        if (!plan) return;

        const copy = { ...plan, id: Date.now(), name: plan.name + " (Copy)" };

        plans.push(copy);

        saveJSON("fueling-plans", plans);

        renderSavedPlans();

    }

    if (delId) {

        if (!confirm("Delete this saved plan?")) return;

        plans = plans.filter(p => p.id !== Number(delId));

        saveJSON("fueling-plans", plans);

        if (currentPlanId === Number(delId)) currentPlanId = null;

        renderSavedPlans();
        renderPlanSummary();

    }

});

function openPlan(id) {

    const plan = plans.find(p => p.id === id);

    if (!plan) return;

    currentPlanId = plan.id;

    $("planName").value = plan.name;

    planItems = (plan.items || []).map(i => ({ ...i }));

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
    $("timelinePanel").style.display = "";

    $("carbsPerHour").value = plan.carbsPerHour;
    $("fluidPerHour").value = plan.fluidPerHour;
    $("sodiumPerHour").value = plan.sodiumPerHour;

    updateTotalsAndTimeline();
    renderPlanSummary();

    document.querySelector(".fuel-panel").scrollIntoView({ behavior: "smooth" });

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

setMode(mode);
renderLibrary();
renderDiyRecipes();
renderSavedPlans();
renderPlanSummary();
