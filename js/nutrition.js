/* ==========================================
   Southbound Nutrition
========================================== */

const RACE_DAY = new Date("2026-11-08");

let currentDate = new Date();

const macros = {

    calories:{

        title:"Calories",

        unit:"kcal",

        goal:3200,

        step:100,

        color:"#C9AD84"

    },

    protein:{

        title:"Protein",

        unit:"g",

        goal:180,

        step:10,

        color:"#22C55E"

    },

    carbs:{

        title:"Carbohydrates",

        unit:"g",

        goal:450,

        step:25,

        color:"#FACC15"

    },

    fat:{

        title:"Fat",

        unit:"g",

        goal:70,

        step:5,

        color:"#F97316"

    },

    water:{

        title:"Water",

        unit:"oz",

        goal:100,

        step:8,

        color:"#38BDF8"

    },

    sodium:{

        title:"Sodium",

        unit:"mg",

        goal:3000,

        step:250,

        color:"#A855F7"

    }

};

let nutrition = {};

function getKey(date){

    return date.toISOString().split("T")[0];

}

function createBlankDay(){

    const day = {

        breakfast:"",

        lunch:"",

        dinner:"",

        snacks:"",

        workoutTitle:"Rest Day",

        workoutDescription:"No workout scheduled.",

        foodLog:{
            breakfast:[],
            lunch:[],
            dinner:[],
            snacks:[]
        }

    };

    Object.keys(macros).forEach(m=>{

        day[m]=0;

    });

    return day;

}
/* ==========================================
   Build Macro Cards
========================================== */

function renderMacroCards(){

    const grid = document.getElementById("macroGrid");

    grid.innerHTML = "";

    Object.entries(macros).forEach(([key,macro])=>{

        const card = document.createElement("div");

        card.className = "macro-card";
        card.style.setProperty("--macro-color", macro.color);

        card.innerHTML = `

            <div class="card-top">

                <div class="card-title">

                    ${macro.title}

                </div>

                <div
                    class="goal-label"
                    id="${key}Goal">

                    Goal: ${macro.goal} ${macro.unit}

                </div>

            </div>

            <div class="big-value">

                <span id="${key}Value">

                    0

                </span>

                <small>

                    ${macro.unit}

                </small>

            </div>

            <div class="progress">

                <div
                    class="progress-fill"
                    id="${key}Progress">

                </div>

            </div>

            <div class="controls">

                <button

                    class="adjust-btn"

                    data-action="minus"

                    data-macro="${key}">

                    −

                </button>

                <div class="metric-display">

                    <span

                        class="current"

                        id="${key}Display">

                        0

                    </span>

                    <span class="label">

                        Today

                    </span>

                </div>

                <button

                    class="adjust-btn"

                    data-action="plus"

                    data-macro="${key}">

                    +

                </button>

            </div>

            <div

                class="remaining"

                id="${key}Remaining">

                ${macro.goal} ${macro.unit} remaining

            </div>

            <button

                class="goal-btn"

                data-goal="${key}">

                Edit Goal

            </button>

        `;

        grid.appendChild(card);

    });

}
/* ==========================================
   Save / Load
========================================== */

function saveDay(){

    localStorage.setItem(
        "nutrition-" + getKey(currentDate),
        JSON.stringify(nutrition)
    );

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(error => console.warn("Nutrition cloud sync could not be completed:", error));

}

function loadDay(){

    const key = getKey(currentDate);

    const saved = localStorage.getItem(
        "nutrition-" + key
    );

    nutrition = saved
        ? JSON.parse(saved)
        : createBlankDay();

    Object.keys(macros).forEach(m=>{

        if(typeof nutrition[m] !== "number"){

            nutrition[m]=0;

        }

    });

    if(!nutrition.foodLog){

        nutrition.foodLog = {
            breakfast:[],
            lunch:[],
            dinner:[],
            snacks:[]
        };

    }

    ["breakfast","lunch","dinner","snacks"].forEach(meal=>{

        if(!Array.isArray(nutrition.foodLog[meal])){

            nutrition.foodLog[meal] = [];

        }

    });

    updateDate();

    updateDisplay();

    renderAllFoodLogs();

}

/* ==========================================
   Date
========================================== */

function updateDate(){

    document.getElementById(

        "currentDate"

    ).textContent = currentDate.toLocaleDateString(

        "en-US",

        {

            weekday:"long",

            month:"long",

            day:"numeric",

            year:"numeric"

        }

    );

    const days = Math.ceil(

        (

            RACE_DAY -

            currentDate

        ) /

        86400000

    );

    // The race countdown is the coach's own race (js/role.js); clients
    // just see the date.
    let personalPlan = false;
    try { personalPlan = localStorage.getItem("sb-account-role") === "coach"; } catch {}

    document.getElementById(

        "countdown"

    ).innerHTML =

        !personalPlan ? "" :

        days >= 0

        ?

        days +

        " days until the Indianapolis Marathon"

        :

        `Race Complete ${window.icon ? window.icon("flag") : ""}`;

}

/* ==========================================
   Update UI
========================================== */

function updateDisplay(){

    Object.entries(macros).forEach(

        ([key,macro])=>{

            const value = nutrition[key];

            const goal = macro.goal;

            const percent = Math.min(

                value / goal * 100,

                100

            );

            const remaining = Math.max(

                goal - value,

                0

            );

            document.getElementById(

                key + "Value"

            ).textContent = value;

            document.getElementById(

                key + "Display"

            ).textContent = value;

            document.getElementById(

                key + "Goal"

            ).textContent =

                "Goal: " +

                goal +

                " " +

                macro.unit;

            document.getElementById(

                key + "Remaining"

            ).textContent =

                remaining +

                " " +

                macro.unit +

                " remaining";

            const bar = document.getElementById(

                key + "Progress"

            );

            bar.style.width =

                percent + "%";

            if(percent >= 100){

                bar.style.background =

                    "var(--green)";

            }

            else if(percent >= 75){

                bar.style.background =

                    "var(--yellow)";

            }

            else{

                bar.style.background =

                    macro.color;

            }

        }

    );

    document.getElementById(

        "breakfast"

    ).value = nutrition.breakfast;

    document.getElementById(

        "lunch"

    ).value = nutrition.lunch;

    document.getElementById(

        "dinner"

    ).value = nutrition.dinner;

    document.getElementById(

        "snacks"

    ).value = nutrition.snacks;

    document.getElementById(

        "workoutTitle"

    ).textContent = nutrition.workoutTitle;

    document.getElementById(

        "workoutDescription"

    ).textContent = nutrition.workoutDescription;

    updateSummary();

}
/* ==========================================
   Summary & Score
========================================== */

function updateSummary(){

    let score = 0;

    const total = Object.keys(macros).length;

    let html = "";

    Object.entries(macros).forEach(([key,macro])=>{

        const percent = Math.min(

            nutrition[key] / macro.goal,

            1

        );

        score += percent;

        const remaining = Math.max(

            macro.goal - nutrition[key],

            0

        );

        html += `

            <div class="stat-row">

                <span class="stat-name">

                    ${macro.title}

                </span>

                <span class="stat-value">

                    ${remaining} ${macro.unit}

                </span>

            </div>

        `;

    });

    document.getElementById(

        "remainingCard"

    ).innerHTML =

        "<h3>Remaining Today</h3>" +

        html;

    score = Math.round(

        score / total * 100

    );

    document.getElementById(

        "nutritionScore"

    ).textContent =

        score + "%";

    const message = document.getElementById(

        "scoreMessage"

    );

    if(score >= 95){

        message.textContent =

            "Outstanding! You're fully fueled.";

    }

    else if(score >= 80){

        message.textContent =

            "Great job. Keep it up.";

    }

    else if(score >= 60){

        message.textContent =

            "Solid progress today.";

    }

    else{

        message.textContent =

            "Let's keep fueling.";

    }

}

/* ==========================================
   Food Search & Log
========================================== */

const MEALS = ["breakfast","lunch","dinner","snacks"];

let lastSearchResults = {};
let pendingFood = {};
let searchDebounceTimers = {};

function debounce(fn, delay){

    let timer = null;

    return (...args) => {

        clearTimeout(timer);

        timer = setTimeout(() => fn(...args), delay);

    };

}

function renderFoodLog(meal){

    const container = document.getElementById("foodLog-" + meal);

    if(!container){
        return;
    }

    const entries = nutrition.foodLog[meal] || [];

    if(!entries.length){

        container.innerHTML = "";
        return;

    }

    container.innerHTML = entries.map(entry => `

        <div class="food-log-item">

            <div class="food-log-item-main">

                <strong>${escapeHtml(entry.name)}</strong>

                <span>

                    ${entry.brand ? escapeHtml(entry.brand) + " · " : ""}${entry.grams}g

                </span>

            </div>

            <div class="food-log-item-macros">

                ${entry.calories} cal · ${entry.protein}p · ${entry.carbs}c · ${entry.fat}f

            </div>

            <button

                class="food-log-remove"

                data-meal="${meal}"

                data-entry-id="${entry.id}"

                title="Remove">

                ×

            </button>

        </div>

    `).join("");

}

function renderAllFoodLogs(){

    MEALS.forEach(renderFoodLog);

}

function escapeHtml(value){

    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");

}

function addFoodToLog(meal, food, grams){

    import("./foodSearch.js").then(({ scaleFood }) => {

        const scaled = scaleFood(food, grams);

        const entry = {
            id: crypto.randomUUID(),
            name: food.name,
            brand: food.brand,
            source: food.source,
            grams: Math.round(grams),
            ...scaled
        };

        nutrition.foodLog[meal].push(entry);

        ["calories","protein","carbs","fat","sodium"].forEach(key => {

            nutrition[key] = Math.round(
                (nutrition[key] || 0) + entry[key]
            );

        });

        saveDay();

        updateDisplay();

        renderFoodLog(meal);

        clearFoodSearch(meal);

    });

}

function removeFoodFromLog(meal, entryId){

    const entries = nutrition.foodLog[meal] || [];

    const index = entries.findIndex(e => e.id === entryId);

    if(index === -1){
        return;
    }

    const entry = entries[index];

    ["calories","protein","carbs","fat","sodium"].forEach(key => {

        nutrition[key] = Math.max(
            0,
            Math.round((nutrition[key] || 0) - (entry[key] || 0))
        );

    });

    entries.splice(index, 1);

    saveDay();

    updateDisplay();

    renderFoodLog(meal);

}

function clearFoodSearch(meal){

    const input = document.querySelector(
        `.food-search-input[data-meal="${meal}"]`
    );

    const results = document.querySelector(
        `.food-search-results[data-meal="${meal}"]`
    );

    if(input){
        input.value = "";
    }

    if(results){
        results.innerHTML = "";
    }

    delete pendingFood[meal];
    delete lastSearchResults[meal];

}

function renderSearchResults(meal, results){

    const container = document.querySelector(
        `.food-search-results[data-meal="${meal}"]`
    );

    if(!container){
        return;
    }

    lastSearchResults[meal] = results;

    if(!results.length){

        container.innerHTML = `

            <div class="food-search-empty">
                No matches. Try a different search.
            </div>

        `;

        return;

    }

    container.innerHTML = results.map((food, index) => `

        <div
            class="food-result"
            data-meal="${meal}"
            data-food-index="${index}">

            <div class="food-result-main">

                <strong>${escapeHtml(food.name)}</strong>

                <span>
                    ${food.brand ? escapeHtml(food.brand) + " · " : ""}${escapeHtml(food.source)}
                </span>

            </div>

            <div class="food-result-cals">
                ${food.per100g.calories} cal / 100g
            </div>

        </div>

    `).join("");

}

function renderFoodConfirm(meal){

    const container = document.querySelector(
        `.food-search-results[data-meal="${meal}"]`
    );

    const food = pendingFood[meal];

    if(!container || !food){
        return;
    }

    import("./foodSearch.js").then(({ scaleFood }) => {

        const grams = food._pendingGrams || food.servingGrams || 100;

        const scaled = scaleFood(food, grams);

        container.innerHTML = `

            <div class="food-confirm">

                <div class="food-confirm-name">
                    ${escapeHtml(food.name)}
                </div>

                <div class="food-confirm-row">

                    <input
                        type="number"
                        class="food-confirm-grams"
                        data-meal="${meal}"
                        min="1"
                        step="1"
                        value="${grams}">

                    <span>g</span>

                    ${food.servingDesc ? `<span class="food-confirm-serving">(${escapeHtml(food.servingDesc)})</span>` : ""}

                </div>

                <div
                    class="food-confirm-preview"
                    data-meal="${meal}">
                    ${scaled.calories} cal · ${scaled.protein}p · ${scaled.carbs}c · ${scaled.fat}f · ${scaled.sodium}mg sodium
                </div>

                <div class="food-confirm-actions">

                    <button
                        class="food-confirm-add"
                        data-meal="${meal}">
                        Add to ${meal[0].toUpperCase() + meal.slice(1)}
                    </button>

                    <button
                        class="food-confirm-cancel"
                        data-meal="${meal}">
                        Cancel
                    </button>

                </div>

            </div>

        `;

    });

}

function performSearch(meal, query){

    if(!query.trim()){

        const container = document.querySelector(
            `.food-search-results[data-meal="${meal}"]`
        );

        if(container){
            container.innerHTML = "";
        }

        return;

    }

    const container = document.querySelector(
        `.food-search-results[data-meal="${meal}"]`
    );

    if(container){

        container.innerHTML = `
            <div class="food-search-loading">Searching…</div>
        `;

    }

    import("./foodSearch.js").then(({ searchFoods }) => {

        searchFoods(query).then(results => {

            renderSearchResults(meal, results);

        });

    });

}

const runSearch = debounce(performSearch, 450);

document
    .querySelectorAll(".food-search-input")
    .forEach(input => {

        input.addEventListener("input", e => {

            const meal = e.target.dataset.meal;

            delete pendingFood[meal];

            runSearch(meal, e.target.value);

        });

    });

document
    .querySelectorAll(".food-scan-btn")
    .forEach(button => {

        button.addEventListener("click", () => {

            const meal = button.dataset.meal;

            import("./barcodeScanner.js").then(({ openBarcodeScanner }) => {

                openBarcodeScanner(code => {

                    const input = document.querySelector(
                        `.food-search-input[data-meal="${meal}"]`
                    );

                    if (input) {
                        input.value = code;
                    }

                    delete pendingFood[meal];
                    performSearch(meal, code);

                });

            });

        });

    });

document.addEventListener("click", e => {

    /* Meal tab switching */

    const mealTabEl = e.target.closest("[data-meal-tab]");

    if(mealTabEl){

        const meal = mealTabEl.dataset.mealTab;

        document.querySelectorAll(".meal-tab").forEach(tab => {
            tab.classList.toggle("active", tab.dataset.mealTab === meal);
        });

        document.querySelectorAll(".meal-card").forEach(card => {
            card.classList.toggle("active", card.dataset.mealPanel === meal);
        });

        return;

    }

    /* Clicking a search result -> show quantity confirm */

    const resultEl = e.target.closest(".food-result");

    if(resultEl){

        const meal = resultEl.dataset.meal;
        const index = Number(resultEl.dataset.foodIndex);
        const food = (lastSearchResults[meal] || [])[index];

        if(food){

            pendingFood[meal] = food;
            renderFoodConfirm(meal);

        }

        return;

    }

    /* Confirm-quantity Add button */

    if(e.target.matches(".food-confirm-add")){

        const meal = e.target.dataset.meal;

        const gramsInput = document.querySelector(
            `.food-confirm-grams[data-meal="${meal}"]`
        );

        const grams = Number(gramsInput?.value) || 100;

        const food = pendingFood[meal];

        if(food){
            addFoodToLog(meal, food, grams);
        }

        return;

    }

    /* Confirm-quantity Cancel button */

    if(e.target.matches(".food-confirm-cancel")){

        const meal = e.target.dataset.meal;

        clearFoodSearch(meal);

        return;

    }

    /* Remove a logged food item */

    if(e.target.matches(".food-log-remove")){

        removeFoodFromLog(
            e.target.dataset.meal,
            e.target.dataset.entryId
        );

        return;

    }

});

document.addEventListener("input", e => {

    if(e.target.matches(".food-confirm-grams")){

        const meal = e.target.dataset.meal;
        const food = pendingFood[meal];
        const grams = Number(e.target.value) || 1;

        if(!food){
            return;
        }

        food._pendingGrams = grams;

        const preview = document.querySelector(
            `.food-confirm-preview[data-meal="${meal}"]`
        );

        if(!preview){
            return;
        }

        import("./foodSearch.js").then(({ scaleFood }) => {

            const scaled = scaleFood(food, grams);

            preview.textContent =
                `${scaled.calories} cal · ${scaled.protein}p · ${scaled.carbs}c · ${scaled.fat}f · ${scaled.sodium}mg sodium`;

        });

    }

});

/* ==========================================
   Button Events
========================================== */

document.addEventListener(

    "click",

    e=>{

        /* + and - buttons */

        if(

            e.target.matches(

                ".adjust-btn"

            )

        ){

            const macro =

                e.target.dataset.macro;

            const step =

                macros[macro].step;

            if(

                e.target.dataset.action ===

                "plus"

            ){

                nutrition[macro] += step;

            }

            else{

                nutrition[macro] = Math.max(

                    0,

                    nutrition[macro] - step

                );

            }

            saveDay();

            updateDisplay();

        }

        /* Goal Buttons */

        if(

            e.target.matches(

                ".goal-btn"

            )

        ){

            const macro =

                e.target.dataset.goal;

            const value = Number(

                prompt(

                    "Enter new goal",

                    macros[macro].goal

                )

            );

            if(

                !isNaN(value) &&

                value > 0

            ){

                macros[macro].goal = value;

                updateDisplay();

            }

        }

    }

);

/* ==========================================
   Notes
========================================== */

[

    "breakfast",

    "lunch",

    "dinner",

    "snacks"

].forEach(field=>{

    document

        .getElementById(field)

        .addEventListener(

            "input",

            e=>{

                nutrition[field] =

                    e.target.value;

                saveDay();

            }

        );

});

/* ==========================================
   Previous / Next Day
========================================== */

document

    .getElementById(

        "previousDay"

    )

    .addEventListener(

        "click",

        ()=>{

            currentDate.setDate(

                currentDate.getDate()-1

            );

            loadDay();

        }

);

document

    .getElementById(

        "nextDay"

    )

    .addEventListener(

        "click",

        ()=>{

            currentDate.setDate(

                currentDate.getDate()+1

            );

            loadDay();

        }

);

/* ==========================================
   Initialize
========================================== */

renderMacroCards();

import("./cloudSync.js")
    .then(({ initCloudSync }) => initCloudSync().then(loadDay))
    .catch(error => {
        console.warn("Nutrition cloud sync could not be completed:", error);
        // Cloud sync failing (offline, Firebase SDK blocked, etc.)
        // shouldn't leave the page blank -- still load whatever's
        // already in localStorage.
        loadDay();
    });
