/* ==========================================
   EddieOS Marathon Controller
========================================== */


import {

    WEEKS,

    PHASES,

    PACES,

    CROSS_TRAINING,

    DAYS,

    DAY_TIMES,

    weekStart,

    weekEnd,

    weekRange,

    getWeekMileage,

    getAdjustedWeekDays,

    loadProgress,

    loadOverrides

} from "./marathonData.js";

console.log("Marathon JS loaded");

/* ==========================================
   State
========================================== */


let progress = loadProgress();


let overrides = loadOverrides();


let selectedWeek = 1;



/* ==========================================
   DOM Helpers
========================================== */


const $ = (id)=>{

    return document.getElementById(id);

};



/* ==========================================
   Save Data
========================================== */


function saveProgress(){

    localStorage.setItem(

        "training-progress",

        JSON.stringify(progress)

    );

}



function saveOverrides(){

    localStorage.setItem(

        "training-overrides",

        JSON.stringify(overrides)

    );

}
/* ==========================================
   Marathon Stats
========================================== */


function totalCompleted(){

    let count = 0;


    Object.values(progress)

        .forEach(

            week=>{


                count +=

                    Object.values(week)

                    .filter(Boolean)

                    .length;


            }

        );


    return count;

}



function updateStats(){

    const now = new Date();


    const raceDay = weekEnd(16);


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



    let currentWeek = 1;



    for(

        let n = 1;

        n <= WEEKS.length;

        n++

    ){

        if(

            now >= weekStart(n)

            &&

            now <= weekEnd(n)

        ){

            currentWeek = n;

        }

    }



    if(now > weekEnd(16)){

        currentWeek = 16;

    }



    if(now < weekStart(1)){

        currentWeek = 1;

    }



    selectedWeek = currentWeek;



    const weekDisplay = $("mp-stat-week");


    if(weekDisplay){

        weekDisplay.textContent =

            currentWeek +

            " / " +

            WEEKS.length;

    }



    const totalMiles = WEEKS.reduce(

        (total,week,index)=>{


            return total +

            getWeekMileage(index+1);


        },

        0

    );



    const totalDisplay = $("mp-stat-total");


    if(totalDisplay){

        totalDisplay.textContent =

            Math.round(totalMiles);

    }



    const percentDisplay = $("mp-stat-pct");


    if(percentDisplay){

        percentDisplay.textContent =

            Math.round(

                (totalCompleted()/112)

                *

                100

            )

            +

            "%";

    }

}
/* ==========================================
   Week Rendering Helpers
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



function renderWeekList(){

    const container =

        $("mp-weeklist");


    if(!container){

        return;

    }


    container.innerHTML = "";


    for(

        let n = 1;

        n <= WEEKS.length;

        n++

    ){

        const chip =

            document.createElement("div");


        const completed =

            weekDone(n);



        chip.className =

            "mp-wchip"

            +

            (

                n === selectedWeek

                ?

                " active"

                :

                ""

            )

            +

            (

                completed === 7

                ?

                " done"

                :

                ""

            );



        chip.innerHTML = `

            <span class="mp-dot"></span>

            Wk ${n}

        `;



        chip.addEventListener(

            "click",

            ()=>{

                selectedWeek = n;

                renderDetail();

                renderWeekList();

            }

        );



        container.appendChild(chip);

    }

}



/* ==========================================
   Current Week Data
========================================== */


function getSelectedWeekData(){

    return {

        week:

            WEEKS[selectedWeek-1],


        days:

            getAdjustedWeekDays(

                selectedWeek

            ),


        mileage:

            getWeekMileage(

                selectedWeek

            )

    };

}
/* ==========================================
   Week Detail Rendering
========================================== */


function renderDetail(){

    const container =

        $("mp-detail");


    if(!container){

        return;

    }


    const data =

        getSelectedWeekData();


    const week = data.week;


    const days = data.days;


    const phaseInfo =

        PHASES[week.phase];

    let rows = "";

    days.forEach(

        (day,index)=>{


            const dayName =

                DAYS[index];
           
            const completed =

                progress[selectedWeek]

                &&

                progress[selectedWeek][dayName];



            rows += `

            <div class="mp-day-row 

                ${completed ? "mp-day-done" : ""}">

                <div

                    class="mp-check ${completed ? "checked" : ""}"

                    data-toggle="${dayName}">

                    ${completed ? "✓" : ""}

                </div>


                <div class="mp-day-abbr">

                    ${dayName}

                </div>


                <input

                    class="mp-day-session-input"

                    data-day="${dayName}"

                    data-field="session"

                    value="${day.session}">


                <div class="mp-mile-box">

                    <input

                    type="number"

                    step="0.1"

                    class="mp-day-miles-input"

                    data-day="${dayName}"

                    data-field="miles"

                    value="${day.miles}">

                    mi

                </div>


                <div class="mp-pace-chip">

                    ${day.pace}

                <div class="mp-day-timing">

                    ${DAY_TIMES[index]}

                   </div>

                   <div class="mp-day-expand">

                       ▼
                       
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

                style="

                background:${phaseInfo.color}22;

                color:${phaseInfo.color}">

                    ${phaseInfo.label}

                </span>


                <h2 class="mp-week-title">

                    Week ${selectedWeek}

                </h2>


                <div class="mp-week-dates">

                    ${weekRange(selectedWeek)}

                </div>


            </div>


            <div class="mp-week-progress">


                <div class="mp-week-miles">

                    ${data.mileage} mi

                </div>


                <div>

                    ${weekDone(selectedWeek)}/7 completed

                </div>


            </div>


        </div>


        <div class="mp-days">

            ${rows}

        </div>


        <div class="mp-mental">

            "${week.mental}"

        </div>


        <div class="mp-notes-grid">


            <div class="mp-note-card">

                <div class="mp-note-label">

                    Purpose

                </div>

                <div class="mp-note-body">

                    ${week.purpose}

                </div>

            </div>


            <div class="mp-note-card">

                <div class="mp-note-label">

                    Fueling

                </div>

                <div class="mp-note-body">

                    ${week.fueling}

                </div>

            </div>


        </div>


    `;

}
/* ==========================================
   Event Listeners
========================================== */


function attachDetailEvents(){


    const container =

        $("mp-detail");


    if(!container){

        return;

    }



    /*
        Complete workout toggle
    */


    container

    .querySelectorAll("[data-toggle]")

    .forEach(

        box=>{


            box.addEventListener(

                "click",

                ()=>{


                    const day =

                        box.getAttribute(

                            "data-toggle"

                        );



                    if(!progress[selectedWeek]){

                        progress[selectedWeek]={};

                    }



                    progress[selectedWeek][day] =

                        !

                        progress[selectedWeek][day];



                    saveProgress();



                    renderDetail();

                    renderWeekList();

                    updateStats();


                }

            );


        }

    );





    /*
        Workout edits
    */


    container

    .querySelectorAll(

        ".mp-day-session-input, .mp-day-miles-input"

    )

    .forEach(

        input=>{


            input.addEventListener(

                "change",

                event=>{


                    const day =

                        event.target

                        .dataset

                        .day;



                    const field =

                        event.target

                        .dataset

                        .field;



                    let value =

                        event.target.value;



                    if(field==="miles"){

                        value =

                            Number(value);


                        if(

                            Number.isNaN(value)

                        ){

                            value = 0;

                        }

                    }



                    if(!overrides[selectedWeek]){

                        overrides[selectedWeek]={};

                    }



                    if(!overrides[selectedWeek][day]){

                        overrides[selectedWeek][day]={};

                    }



                    overrides[selectedWeek][day][field]

                        = value;



                    saveOverrides();



                    renderDetail();



                }

            );


        }

    );


}
/* ==========================================
   Chart Rendering
========================================== */


function renderChart(){

    const svg =

        $("mp-chart-svg");


    if(!svg){

        return;

    }



    const width = 900;

    const height = 120;

    const maxMiles = Math.max(

        ...WEEKS.map(

            (_,index)=>

            getWeekMileage(index+1)

        )

    );



    let html = "";



    WEEKS.forEach(

        (week,index)=>{


            const weekNumber =

                index + 1;



            const miles =

                getWeekMileage(

                    weekNumber

                );



            const barHeight =

                (miles / maxMiles)

                *

                80;



            const x =

                40 +

                index *

                52;



            const y =

                100 -

                barHeight;



            const color =

                PHASES[week.phase]

                .color;



            html += `


            <g class="mp-bar"

            data-week="${weekNumber}">


                <rect

                x="${x}"

                y="${y}"

                width="35"

                height="${barHeight}"

                rx="4"

                fill="${color}">

                </rect>


                <text

                x="${x+17}"

                y="115"

                text-anchor="middle"

                font-size="10">

                    ${weekNumber}

                </text>


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


                    selectedWeek =

                    Number(

                        bar.dataset.week

                    );


                    renderDetail();

                    renderWeekList();


                }

            );


        }

    );


}



/* ==========================================
   Initialize Marathon
========================================== */


function init(){


    const now = new Date();


    for(

        let i = 1;

        i <= WEEKS.length;

        i++

    ){

        if(

            now >= weekStart(i)

            &&

            now <= weekEnd(i)

        ){

            selectedWeek = i;

        }

    }



    updateStats();

    renderChart();

    renderWeekList();

    renderDetail();

    attachDetailEvents();


}



init();
