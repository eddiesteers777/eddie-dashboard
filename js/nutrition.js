/* ==========================================
   EddieOS Nutrition
========================================== */

const RACE_DAY = new Date("2026-11-07");

let currentDate = new Date();

const macros = {

    calories:{

        title:"Calories",

        unit:"kcal",

        goal:3200,

        step:100,

        color:"#4EA8FF"

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

        workoutDescription:"No workout scheduled."

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

    updateDate();

    updateDisplay();

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

    document.getElementById(

        "countdown"

    ).textContent =

        days >= 0

        ?

        days +

        " days until the Indianapolis Marathon"

        :

        "Race Complete 🏁";

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

loadDay();
