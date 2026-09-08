/* ==========================================
   EddieOS Marathon Controller (V2)
========================================== */

import {

    WEEKS,

    PHASES,

    PACES,

    DAYS,

    DAY_TIMES,

    weekStart,

    weekEnd,

    weekRange,

    getPeakMileage,

    getAdjustedWeekDays,

    getAdjustedWeekMileage,

    loadProgress,

    saveProgress,

    loadOverrides,

    saveOverrides

} from "./marathonData.js";

console.log("EddieOS Marathon V2");

/* ==========================================
   State
========================================== */

let progress = loadProgress();

let overrides = loadOverrides();

let selectedWeek = 1;

/* Which day rows are expanded, keyed "week-day" */
let expandedDays = {};

/* Which accordion sub-sections are open, keyed "week-day-section" */
let expandedSections = {};

/* ==========================================
   DOM Helpers
========================================== */

const $ = (id)=>{

    return document.getElementById(id);

};

function escapeAttr(value){

    return String(value)

        .replace(/&/g,"&amp;")

        .replace(/"/g,"&quot;")

        .replace(/</g,"&lt;");

}

/* ==========================================
   Extra-Section Field Configs
   (UI-only metadata — the underlying data is
   just plain objects stored in marathonData.js)
========================================== */

const SECTION_FIELDS = {

    strength: [

        { key:"exercise", label:"Exercise", type:"text" },
        { key:"sets",     label:"Sets",     type:"text" },
        { key:"reps",     label:"Reps",     type:"text" },
        { key:"weight",   label:"Weight/Load", type:"text" },
        { key:"notes",    label:"Notes",    type:"text" }

    ],

    crossTraining: [

        { key:"activity",  label:"Activity",  type:"text" },
        { key:"duration",  label:"Duration",  type:"text" },
        { key:"intensity", label:"Intensity", type:"text" },
        { key:"notes",     label:"Notes",     type:"text" }

    ],

    mobility: [

        { key:"exercise", label:"Exercise", type:"text" },
        { key:"duration", label:"Duration", type:"text" },
        { key:"notes",    label:"Notes",    type:"text" }

    ],

    recovery: [

        { key:"activity", label:"Activity", type:"text" },
        { key:"duration", label:"Duration", type:"text" },
        { key:"notes",    label:"Notes",    type:"text" }

    ]

};

const SECTION_META = {

    strength:      { icon:"💪", title:"Strength" },
    crossTraining: { icon:"🚴", title:"Cross Training" },
    mobility:      { icon:"🧘", title:"Mobility" },
    recovery:      { icon:"❤️", title:"Recovery" }

};

function blankEntry(sectionKey){

    const entry = {};

    SECTION_FIELDS[sectionKey].forEach(field=>{

        entry[field.key] = "";

    });

    return entry;

}

/* ==========================================
   Save Data
========================================== */

function persistProgress(){

    saveProgress(progress);

}

function persistOverrides(){

    saveOverrides(overrides);

}

/* ==========================================
   Marathon Stats
========================================== */

function weekDone(weekNumber){

    const weekProgress =

        progress[weekNumber]

        ||

        {};

    return DAYS.filter(

        day =>

        weekProgress[day]

    ).length;

}

function totalDone(){

    let count = 0;

    for(let n=1; n<=WEEKS.length; n++){

        count += weekDone(n);

    }

    return count;

}

function updateStats(){

    const now = new Date();

    const raceDay = weekEnd(WEEKS.length);

    const daysLeft = Math.ceil(

        (raceDay - now)

        /

        86400000

    );

    const countdown = $("mp-countdown");

    if(countdown){

        countdown.textContent =

            daysLeft >= 0

            ?

            daysLeft + " days to race day"

            :

            "Race complete!";

    }

    const weekDisplay = $("mp-stat-week");

    if(weekDisplay){

        weekDisplay.textContent =

            selectedWeek +

            " / " +

            WEEKS.length;

    }

    let totalMiles = 0;

    for(let n=1; n<=WEEKS.length; n++){

        totalMiles += getAdjustedWeekMileage(n, overrides);

    }

    const totalDisplay = $("mp-stat-total");

    if(totalDisplay){

        totalDisplay.textContent = Math.round(totalMiles);

    }

    const peakDisplay = $("mp-stat-peak");

    if(peakDisplay){

        peakDisplay.textContent = Math.round(getPeakMileage());

    }

    const percentDisplay = $("mp-stat-pct");

    if(percentDisplay){

        percentDisplay.textContent =

            Math.round(

                (totalDone()/(WEEKS.length*DAYS.length))

                *

                100

            )

            +

            "%";

    }

}

/* ==========================================
   Chart Rendering
========================================== */

function renderChart(){

    const svg = $("mp-chart-svg");

    if(!svg){

        return;

    }

    const width = 900;

    const height = 120;

    const padL = 34;

    const padB = 22;

    const barGap = 6;

    const barW = (width - padL - 10) / WEEKS.length - barGap;

    const now = new Date();

    const mileages = WEEKS.map(

        (_,index)=>

        getAdjustedWeekMileage(index+1, overrides)

    );

    const maxMiles = Math.max(...mileages);

    let html = "";

    WEEKS.forEach(

        (week,index)=>{

            const weekNumber = index + 1;

            const total = mileages[index];

            const barHeight =

                (total / maxMiles)

                *

                (height - padB - 14);

            const x =

                padL +

                index * (barW + barGap);

            const y =

                height - padB - barHeight;

            const color =

                PHASES[week.phase]

                .color;

            const isSelected = weekNumber === selectedWeek;

            const isRace = week.days.some(day=>day.race);

            const inWeek =

                now >= weekStart(weekNumber)

                &&

                now <= weekEnd(weekNumber);

            html += `

<g class="mp-bar" data-week="${weekNumber}">

    <rect

        x="${x}"

        y="${y}"

        width="${barW}"

        height="${barHeight}"

        rx="3"

        fill="${color}"

        opacity="${isSelected ? 1 : 0.85}"

        class="${isSelected ? "mp-bar-selected" : ""}">

    </rect>

    <text

        x="${x + barW/2}"

        y="${height - padB + 13}"

        text-anchor="middle"

        font-size="9.5"

        fill="#8b96a3">

        ${weekNumber}

    </text>

    ${isRace ? `<text x="${x+barW/2}" y="${y-5}" text-anchor="middle" font-size="11">&#127937;</text>` : ""}

    ${inWeek ? `<text x="${x+barW/2}" y="${height-4}" text-anchor="middle" font-size="8" fill="#f0a742" font-weight="700">TODAY</text>` : ""}

</g>

`;

        }

    );

    svg.setAttribute(

        "viewBox",

        `0 0 ${width} ${height}`

    );

    svg.innerHTML = html;

    svg

    .querySelectorAll(".mp-bar")

    .forEach(

        bar=>{

            bar.addEventListener(

                "click",

                ()=>{

                    selectWeek(

                        Number(bar.dataset.week)

                    );

                }

            );

        }

    );

}

/* ==========================================
   Week Chip List
========================================== */

function renderWeekList(){

    const container = $("mp-weeklist");

    if(!container){

        return;

    }

    container.innerHTML = "";

    for(let n=1; n<=WEEKS.length; n++){

        const chip = document.createElement("div");

        const completed = weekDone(n);

        chip.className =

            "mp-wchip"

            +

            (n === selectedWeek ? " active" : "")

            +

            (completed === DAYS.length ? " done" : "");

        chip.innerHTML = `

            <span class="mp-dot"></span>

            Wk ${n}

        `;

        chip.addEventListener(

            "click",

            ()=>{

                selectWeek(n);

            }

        );

        container.appendChild(chip);

    }

}

/* ==========================================
   Extras Section Rendering (Strength /
   Cross Training / Mobility / Recovery)
========================================== */

function renderEntryList(sectionKey, weekNumber, dayKey, entries){

    const fields = SECTION_FIELDS[sectionKey];

    const rows = entries.map((entry,index)=>{

        const cells = fields.map(field=>`

            <input

                type="text"

                class="mp-entry-input"

                data-day="${dayKey}"

                data-array-field="${sectionKey}"

                data-index="${index}"

                data-subfield="${field.key}"

                data-placeholder="${field.label}"

                placeholder="${field.label}"

                value="${escapeAttr(entry[field.key] || "")}">

        `).join("");

        return `

<div class="mp-entry-row">

    ${cells}

    <button

        type="button"

        class="mp-entry-remove"

        data-remove-array="${sectionKey}"

        data-day="${dayKey}"

        data-index="${index}"

        title="Remove">

        ✕

    </button>

</div>

`;

    }).join("");

    const empty = entries.length === 0

        ? `<div class="mp-entry-empty">Nothing planned yet.</div>`

        : "";

    return `

${empty}

${rows}

<button

    type="button"

    class="mp-entry-add"

    data-add-array="${sectionKey}"

    data-day="${dayKey}">

    + Add ${SECTION_META[sectionKey].title.toLowerCase()}

</button>

`;

}

function renderDaySections(weekNumber, dayKey, day){

    const secKey = (name)=> `${weekNumber}-${dayKey}-${name}`;

    const open = (name)=> expandedSections[secKey(name)] ? "open" : "";

    const fuelingHref =

        `fueling.html?week=${weekNumber}&day=${encodeURIComponent(dayKey)}`;

    return `

<details class="mp-accordion" data-section-toggle="main" ${open("main")}>

    <summary class="mp-accordion-summary">Main Workout</summary>

    <div class="mp-accordion-body">

        <label class="mp-field-label">Description</label>

        <textarea

            class="mp-day-textarea"

            data-day="${dayKey}"

            data-field="description"

            rows="2"

            placeholder="What this workout looks like...">${day.description || ""}</textarea>

        <div class="mp-field-row">

            <div>

                <label class="mp-field-label">Pace</label>

                <input

                    type="text"

                    class="mp-day-session-input"

                    data-day="${dayKey}"

                    data-field="pace"

                    value="${escapeAttr(day.pace || "")}">

            </div>

            <div>

                <label class="mp-field-label">Duration</label>

                <input

                    type="text"

                    class="mp-day-session-input"

                    data-day="${dayKey}"

                    data-field="duration"

                    placeholder="e.g. 45 min"

                    value="${escapeAttr(day.duration || "")}">

            </div>

        </div>

    </div>

</details>

<details class="mp-accordion" data-section-toggle="strength" ${open("strength")}>

    <summary class="mp-accordion-summary">💪 Strength</summary>

    <div class="mp-accordion-body">

        ${renderEntryList("strength", weekNumber, dayKey, day.strength || [])}

    </div>

</details>

<details class="mp-accordion" data-section-toggle="crossTraining" ${open("crossTraining")}>

    <summary class="mp-accordion-summary">🚴 Cross Training</summary>

    <div class="mp-accordion-body">

        ${renderEntryList("crossTraining", weekNumber, dayKey, day.crossTraining || [])}

    </div>

</details>

<details class="mp-accordion" data-section-toggle="mobility" ${open("mobility")}>

    <summary class="mp-accordion-summary">🧘 Mobility</summary>

    <div class="mp-accordion-body">

        ${renderEntryList("mobility", weekNumber, dayKey, day.mobility || [])}

    </div>

</details>

<details class="mp-accordion" data-section-toggle="recovery" ${open("recovery")}>

    <summary class="mp-accordion-summary">❤️ Recovery</summary>

    <div class="mp-accordion-body">

        ${renderEntryList("recovery", weekNumber, dayKey, day.recovery || [])}

    </div>

</details>

<details class="mp-accordion" data-section-toggle="notes" ${open("notes")}>

    <summary class="mp-accordion-summary">📝 Notes</summary>

    <div class="mp-accordion-body">

        <textarea

            class="mp-day-textarea"

            data-day="${dayKey}"

            data-field="notes"

            rows="3"

            placeholder="Anything worth remembering about this day...">${day.notes || ""}</textarea>

    </div>

</details>

<details class="mp-accordion" data-section-toggle="fueling" ${open("fueling")}>

    <summary class="mp-accordion-summary">🍽️ Fueling Plan</summary>

    <div class="mp-accordion-body">

        <div class="mp-fueling-stub">

            <div class="mp-fueling-stub-text">

                Fueling details for this workout will live on the Fueling page.

            </div>

            <a class="mp-drawer-toggle mp-fueling-link" href="${fuelingHref}">

                Build Fueling Plan →

            </a>

        </div>

    </div>

</details>

`;

}

/* ==========================================
   Current Week Data
========================================== */

function getSelectedWeekData(){

    return {

        week: WEEKS[selectedWeek-1],

        days: getAdjustedWeekDays(selectedWeek, overrides),

        mileage: getAdjustedWeekMileage(selectedWeek, overrides)

    };

}

/* ==========================================
   Week Detail Rendering
========================================== */

function renderDetail(){

    const container = $("mp-detail");

    if(!container){

        return;

    }

    const data = getSelectedWeekData();

    const week = data.week;

    const days = data.days;

    const phaseInfo = PHASES[week.phase];

    let raceBanner = "";

    if(week.race){

        raceBanner = `

<div class="mp-banner mp-banner-race">

    &#127942;

    <div><strong>${week.race.name}</strong> - ${week.race.date}</div>

</div>

`;

    }

    let checkBanner = "";

    if(week.checkpoint){

        checkBanner = `

<div class="mp-banner mp-banner-check">

    &#128260;

    <div>${week.checkpoint}</div>

</div>

`;

    }

    let rows = "";

    days.forEach(

        (day,index)=>{

            const dayKey = DAYS[index];

            const completed =

                progress[selectedWeek]

                &&

                progress[selectedWeek][dayKey];

            const expandKey = `${selectedWeek}-${dayKey}`;

            const expanded = !!expandedDays[expandKey];

            rows += `

<div class="mp-day-wrapper">

<div

    class="mp-day-row ${completed ? "mp-day-done" : ""} ${day.race ? "mp-race" : ""}"

    data-day="${dayKey}">

    <div

        class="mp-check ${completed ? "checked" : ""}"

        data-toggle="${dayKey}">

        ${completed ? "&#10003;" : ""}

    </div>

    <div class="mp-day-abbr">

        ${dayKey}

    </div>

    <input

        class="mp-day-session-input ${day.race ? "mp-day-race-tag" : ""}"

        data-day="${dayKey}"

        data-field="session"

        value="${escapeAttr(day.session)}"

        spellcheck="false">

    <div style="display:flex;align-items:center;justify-content:flex-end;">

        <input

            type="number"

            step="0.1"

            min="0"

            class="mp-day-miles-input mp-mono"

            data-day="${dayKey}"

            data-field="miles"

            value="${day.miles}">

        <span class="mp-mono" style="color:var(--text-light);font-size:11px;">mi</span>

    </div>

    <div class="mp-pace-chip">

        ${escapeAttr(day.pace)}

    </div>

    <div class="mp-day-timing">

        ${DAY_TIMES[index]}${day.edited ? '<span class="mp-edited-flag" title="Edited from default plan">&#9998;</span>' : ""}

    </div>

    <div

        class="mp-day-expand"

        data-day-toggle="${dayKey}"

        title="${expanded ? "Collapse" : "Expand"}">

        ${expanded ? "▲" : "▼"}

    </div>

</div>

<div class="mp-day-dropdown ${expanded ? "open" : ""}">

    ${expanded ? renderDaySections(selectedWeek, dayKey, day) : ""}

</div>

</div>

`;

        }

    );

    container.innerHTML = `

<div class="mp-detail-head">

    <div>

        <span

            class="mp-phase-pill"

            style="background:${phaseInfo.color}22; color:${phaseInfo.color}">

            ${phaseInfo.label}

        </span>

        <h2 class="mp-week-title mp-display">

            Week ${selectedWeek}

        </h2>

        <div class="mp-week-dates mp-mono">

            ${weekRange(selectedWeek)}

        </div>

    </div>

    <div class="mp-week-progress">

        <div class="mp-week-miles mp-mono">

            ${data.mileage}<span style="font-size:14px;color:var(--text-light)">mi</span>

        </div>

        <div class="mp-week-miles-label">

            ${weekDone(selectedWeek)}/${DAYS.length} days logged

        </div>

    </div>

</div>

${raceBanner}${checkBanner}

<div class="mp-days">

    ${rows}

</div>

<div class="mp-mental">

    "${week.mental}"

</div>

<div class="mp-notes-grid">

    <div class="mp-note-card">

        <div class="mp-note-label">Purpose of the week</div>

        <div class="mp-note-body">${week.purpose}</div>

    </div>

    <div class="mp-note-card">

        <div class="mp-note-label">Strength phase</div>

        <div class="mp-note-body">${week.strength}</div>

    </div>

    <div class="mp-note-card">

        <div class="mp-note-label">Fueling</div>

        <div class="mp-note-body">${week.fueling}</div>

    </div>

    <div class="mp-note-card">

        <div class="mp-note-label">Heat / humidity</div>

        <div class="mp-note-body">${week.heat}</div>

    </div>

</div>

<button class="mp-drawer-toggle" id="mp-pace-toggle">Pace reference &#9662;</button>

<button class="mp-drawer-toggle" id="mp-reset-week-btn">Reset this week's edits</button>

<button class="mp-reset-btn" id="mp-reset-btn">Reset all progress</button>

<div class="mp-drawer" id="mp-pace-drawer">

    <table class="mp-pace-table">

        ${PACES.map(p=>`<tr><td>${p[0]}</td><td class="mp-mono">${p[1]}</td></tr>`).join("")}

    </table>

    <div style="font-size:12px;color:var(--text-light);margin-top:8px;">

        In Alabama summer heat, run by effort first - these ranges assume mild conditions. See the week's heat note above for adjustments.

    </div>

</div>

`;

    attachDetailEvents();

}

/* ==========================================
   Event Listeners
========================================== */

function attachDetailEvents(){

    const container = $("mp-detail");

    if(!container){

        return;

    }

    /* Complete Workout Toggle */

    container

    .querySelectorAll("[data-toggle]")

    .forEach(box=>{

        box.addEventListener("click", event=>{

            event.stopPropagation();

            const day = box.getAttribute("data-toggle");

            if(!progress[selectedWeek]){

                progress[selectedWeek] = {};

            }

            progress[selectedWeek][day] = !progress[selectedWeek][day];

            persistProgress();

            renderDetail();

            renderWeekList();

            renderChart();

            updateStats();

        });

    });

    /* Expand / Collapse Day */

    container

    .querySelectorAll("[data-day-toggle]")

    .forEach(toggle=>{

        toggle.addEventListener("click", event=>{

            event.stopPropagation();

            const day = toggle.getAttribute("data-day-toggle");

            const key = `${selectedWeek}-${day}`;

            expandedDays[key] = !expandedDays[key];

            renderDetail();

        });

    });

    /* Accordion Sub-Section Open/Close (native <details> toggle) */

    container

    .querySelectorAll("[data-section-toggle]")

    .forEach(details=>{

        details.addEventListener("toggle", ()=>{

            const dayRow = details.closest(".mp-day-wrapper")

                .querySelector("[data-day]");

            const dayKey = dayRow.getAttribute("data-day");

            const section = details.getAttribute("data-section-toggle");

            const key = `${selectedWeek}-${dayKey}-${section}`;

            expandedSections[key] = details.open;

        });

    });

    /* Simple field edits: session / miles / pace / duration / description / notes */

    container

    .querySelectorAll(

        ".mp-day-session-input, .mp-day-miles-input, .mp-day-textarea"

    )

    .forEach(input=>{

        input.addEventListener("change", event=>{

            const day = event.target.dataset.day;

            const field = event.target.dataset.field;

            let value = event.target.value;

            if(field === "miles"){

                value = parseFloat(value);

                if(Number.isNaN(value) || value < 0){

                    value = 0;

                }

            }
            else if(typeof value === "string"){

                value = value.trim();

            }

            if(!overrides[selectedWeek]){

                overrides[selectedWeek] = {};

            }

            if(!overrides[selectedWeek][day]){

                overrides[selectedWeek][day] = {};

            }

            overrides[selectedWeek][day][field] = value;

            persistOverrides();

            renderDetail();

            renderChart();

            updateStats();

        });

        input.addEventListener("keydown", event=>{

            if(event.key === "Enter" && event.target.tagName !== "TEXTAREA"){

                event.target.blur();

            }

        });

    });

    /* Dynamic list entries: strength / crossTraining / mobility / recovery */

    function currentArray(dayKey, sectionKey){

        const merged = getAdjustedWeekDays(selectedWeek, overrides);

        const index = DAYS.indexOf(dayKey);

        const value = merged[index][sectionKey];

        return Array.isArray(value) ? [...value.map(e=>({...e}))] : [];

    }

    function writeArray(dayKey, sectionKey, nextArray){

        if(!overrides[selectedWeek]){

            overrides[selectedWeek] = {};

        }

        if(!overrides[selectedWeek][dayKey]){

            overrides[selectedWeek][dayKey] = {};

        }

        overrides[selectedWeek][dayKey][sectionKey] = nextArray;

        persistOverrides();

        renderDetail();

    }

    container

    .querySelectorAll("[data-array-field]")

    .forEach(input=>{

        input.addEventListener("change", event=>{

            const dayKey = event.target.dataset.day;

            const sectionKey = event.target.dataset.arrayField;

            const index = Number(event.target.dataset.index);

            const subfield = event.target.dataset.subfield;

            const nextArray = currentArray(dayKey, sectionKey);

            if(!nextArray[index]){

                nextArray[index] = blankEntry(sectionKey);

            }

            nextArray[index][subfield] = event.target.value;

            writeArray(dayKey, sectionKey, nextArray);

        });

    });

    container

    .querySelectorAll("[data-add-array]")

    .forEach(button=>{

        button.addEventListener("click", event=>{

            const dayKey = event.target.dataset.day;

            const sectionKey = event.target.dataset.addArray;

            const nextArray = currentArray(dayKey, sectionKey);

            nextArray.push(blankEntry(sectionKey));

            /* keep this section open across the re-render */

            expandedSections[`${selectedWeek}-${dayKey}-${sectionKey}`] = true;

            writeArray(dayKey, sectionKey, nextArray);

        });

    });

    container

    .querySelectorAll("[data-remove-array]")

    .forEach(button=>{

        button.addEventListener("click", event=>{

            const dayKey = event.target.dataset.day;

            const sectionKey = event.target.dataset.removeArray;

            const index = Number(event.target.dataset.index);

            const nextArray = currentArray(dayKey, sectionKey);

            nextArray.splice(index, 1);

            expandedSections[`${selectedWeek}-${dayKey}-${sectionKey}`] = true;

            writeArray(dayKey, sectionKey, nextArray);

        });

    });

    /* Pace reference drawer */

    const paceToggle = $("mp-pace-toggle");

    if(paceToggle){

        paceToggle.addEventListener("click", ()=>{

            $("mp-pace-drawer").classList.toggle("open");

        });

    }

    /* Reset this week's edits */

    const resetWeekBtn = $("mp-reset-week-btn");

    if(resetWeekBtn){

        resetWeekBtn.addEventListener("click", ()=>{

            if(overrides[selectedWeek] &&

                confirm("Reset this week's mileage/workout edits back to the default plan?")){

                delete overrides[selectedWeek];

                persistOverrides();

                renderDetail();

                renderChart();

                updateStats();

            }
            else if(!overrides[selectedWeek]){

                alert("No edits to reset for this week.");

            }

        });

    }

    /* Reset all progress */

    const resetAllBtn = $("mp-reset-btn");

    if(resetAllBtn){

        resetAllBtn.addEventListener("click", ()=>{

            if(confirm("Reset all logged progress? This can't be undone.")){

                progress = {};

                persistProgress();

                renderDetail();

                renderWeekList();

                renderChart();

                updateStats();

            }

        });

    }

}

/* ==========================================
   Week Selection
========================================== */

function selectWeek(weekNumber){

    selectedWeek = weekNumber;

    renderDetail();

    renderWeekList();

    renderChart();

    updateStats();

}

/* ==========================================
   Initialize Marathon
========================================== */

function init(){

    const now = new Date();

    let currentWeek = 1;

    for(let i=1; i<=WEEKS.length; i++){

        if(now >= weekStart(i) && now <= weekEnd(i)){

            currentWeek = i;

        }

    }

    if(now > weekEnd(WEEKS.length)){

        currentWeek = WEEKS.length;

    }

    if(now < weekStart(1)){

        currentWeek = 1;

    }

    selectedWeek = currentWeek;

    updateStats();

    renderChart();

    renderWeekList();

    renderDetail();

}

init();
