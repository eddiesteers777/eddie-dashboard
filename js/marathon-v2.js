import {
    WEEKS,
    PHASES,
    DAYS,
    DAY_TIMES,
    getAdjustedWeekDays,
    getWeekMileage,
    weekRange
} from "./marathonData.js";

let selectedWeek = 1;

const expandedDays = {};

function $(id) {
    return document.getElementById(id);
}

function createDayCard(day, index) {

    const dayName = DAYS[index];

    const details = day.details || {

        strength: [],

        crossTraining: [],

        mobility: [],

        recovery: [],

        notes: ""

    };

    return `

<div class="mp-card">

    <div class="mp-day-header">

        <div>

            <div class="mp-day-name">

                ${dayName}

            </div>

            <div class="mp-workout">

                ${day.session}

            </div>

            <div class="mp-meta">

                ${day.pace}

                •

                ${DAY_TIMES[index]}

            </div>

        </div>

        <div class="mp-miles">

            ${day.miles} mi

        </div>

    </div>

    <button
        class="mp-toggle"
        data-day="${dayName}">

        ${expandedDays[dayName] ? "Hide Details" : "Show Details"}

    </button>

    <div class="mp-details ${expandedDays[dayName] ? "open" : ""}">

        <div class="mp-section">

            <h4>💪 Strength</h4>

            ${(details.strength.length
                ? details.strength.map(x => `<div>${x}</div>`).join("")
                : "<div>None</div>")}

        </div>

        <div class="mp-section">

            <h4>🚴 Cross Training</h4>

            ${(details.crossTraining.length
                ? details.crossTraining.map(x => `<div>${x}</div>`).join("")
                : "<div>None</div>")}

        </div>

        <div class="mp-section">

            <h4>🧘 Mobility</h4>

            ${(details.mobility.length
                ? details.mobility.map(x => `<div>${x}</div>`).join("")
                : "<div>None</div>")}

        </div>

        <div class="mp-section">

            <h4>❤️ Recovery</h4>

            ${(details.recovery.length
                ? details.recovery.map(x => `<div>${x}</div>`).join("")
                : "<div>None</div>")}

        </div>

        <div class="mp-section">

            <h4>📝 Notes</h4>

            <div>

                ${details.notes || "None"}

            </div>

        </div>

    </div>

</div>

`;

}

function renderDetail(){

    const app = $("marathon-app");

    const days = getAdjustedWeekDays(selectedWeek);

    const phase = PHASES[WEEKS[selectedWeek - 1].phase];

    app.innerHTML = `

<section class="mp-hero">

    <h1>

        Week ${selectedWeek}

    </h1>

    <p>

        ${weekRange(selectedWeek)}

    </p>

    <h2>

        ${getWeekMileage(selectedWeek)} Miles

    </h2>

    <div>

        ${phase.label}

    </div>

</section>

${days.map(createDayCard).join("")}

`;

    document.querySelectorAll(".mp-toggle").forEach(button => {

        button.onclick = () => {

            const day = button.dataset.day;

            expandedDays[day] = !expandedDays[day];

            render();

        };

    });

}

render();
