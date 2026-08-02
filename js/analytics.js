/* ==========================================
   EddieOS Analytics
========================================== */

import {

    WEEKS,

    DAYS,

    getCurrentWeek,

    getRaceCountdown,

    getCycleMileage,

    getPeakMileage,

    getLongestRun,

    getCompletionPercent,

    getAdjustedWeekDays,

    getAdjustedWeekMileage,

    getWorkoutBreakdown,

    getUpcomingWorkouts,

    getTrainingPhase,

    getNextLongRun

} from "./marathonData.js";


let charts = {};


const analytics = {

    trainingWeek:1,

    weeklyMileage:0,

    totalMileage:0,

    peakMileage:0,

    completion:0,

    longestRun:0,

    nextLongRun:null,

    todayWorkout:null,

    workoutBreakdown:null

};


/* ==========================================
   Utilities
========================================== */

function $(id){

    return document.getElementById(id);

}


function setText(id,value){

    const element = $(id);

    if(element){

        element.textContent = value;

    }

}
/* ==========================================
   Load Analytics Data
========================================== */

function loadAnalyticsData(){

    analytics.trainingWeek =

        getCurrentWeek();


    analytics.weeklyMileage =

        getAdjustedWeekMileage(

            analytics.trainingWeek

        );


    analytics.totalMileage =

        getCycleMileage();


    analytics.peakMileage =

        getPeakMileage();


    analytics.longestRun =

        getLongestRun();


    analytics.completion =

        getCompletionPercent();


    analytics.nextLongRun =

        getNextLongRun();


    analytics.workoutBreakdown =

        getWorkoutBreakdown();


    const upcoming =

        getUpcomingWorkouts();


    analytics.todayWorkout =

        upcoming.length

            ? upcoming[0]

            : null;

}
/* ==========================================
   Update Dashboard
========================================== */

function updateDashboard(){

    setText(

        "countdownDays",

        `${getRaceCountdown()} Days`

    );


    setText(

        "trainingWeek",

        `Week ${analytics.trainingWeek}`

    );


    setText(

        "trainingPhase",

        getTrainingPhase()

    );


    setText(

        "weeklyMileage",

        `${analytics.weeklyMileage} mi`

    );


    setText(

        "completionPercent",

        `${analytics.completion}%`

    );


    setText(

        "peakMileage",

        `${analytics.peakMileage} mi`

    );


    setText(

        "totalMileage",

        `${analytics.totalMileage} mi`

    );


    setText(

        "longestRun",

        `${analytics.longestRun} mi`

    );


    if(analytics.nextLongRun){

        setText(

            "nextLongRun",

            `${analytics.nextLongRun.miles} mi`

        );


        setText(

            "nextLongRunDate",

            `Week ${analytics.nextLongRun.week}`

        );

    }


    if(analytics.todayWorkout){

        setText(

            "todayWorkout",

            analytics.todayWorkout.session

        );


        setText(

            "todayWorkoutDetails",

            `${analytics.todayWorkout.day} • ${analytics.todayWorkout.miles} mi • ${analytics.todayWorkout.pace}`

        );

    }

}
/* ==========================================
   Update Performance Cards
========================================== */

function updatePerformanceCards(){

    const fitness = Math.min(

        100,

        Math.round(

            (analytics.completion * 0.40)

            +

            (analytics.weeklyMileage * 1.25)

        )

    );


    let status =

        "Building";


    if(analytics.trainingWeek >= 13){

        status = "Peak";

    }

    else if(analytics.trainingWeek >= 9){

        status = "Marathon Build";

    }

    else if(analytics.trainingWeek >= 5){

        status = "Base Build";

    }


    const readiness = Math.min(

        100,

        Math.round(

            fitness * 0.95

        )

    );


    const recovery =

        analytics.completion >= 90

            ? "Excellent"

            : analytics.completion >= 70

            ? "Good"

            : analytics.completion >= 50

            ? "Fair"

            : "Needs Work";


    setText(

        "fitnessScore",

        fitness

    );


    setText(

        "trainingStatus",

        status

    );


    setText(

        "recoveryScore",

        recovery

    );


    setText(

        "raceReadiness",

        `${readiness}%`

    );


    if(analytics.workoutBreakdown){

        setText(

            "easyRunCount",

            analytics.workoutBreakdown.easy

        );


        setText(

            "qualityRunCount",

            analytics.workoutBreakdown.quality

        );


        setText(

            "longRunCount",

            analytics.workoutBreakdown.long

        );


        setText(

            "restDayCount",

            analytics.workoutBreakdown.recovery

        );

    }

}
/* ==========================================
   Weekly Mileage Chart
========================================== */

function renderWeeklyMileageChart(){

    const canvas =

        $("weeklyMileageChart");


    if(!canvas){

        return;

    }


    if(charts.weeklyMileage){

        charts.weeklyMileage.destroy();

    }


    charts.weeklyMileage =

        new Chart(

            canvas,

            {

                type:"line",

                data:{

                    labels:

                        WEEKS.map(

                            (_,index)=>

                            `W${index+1}`

                        ),

                    datasets:[

                        {

                            label:"Weekly Mileage",

                            data:

                                WEEKS.map(

                                    (_,index)=>

                                    getAdjustedWeekMileage(

                                        index+1

                                    )

                                ),

                            borderWidth:3,

                            tension:.35,

                            fill:false

                        }

                    ]

                },

                options:{

                    responsive:true,

                    maintainAspectRatio:false,

                    plugins:{

                        legend:{

                            display:false

                        }

                    },

                    scales:{

                        y:{

                            beginAtZero:true

                        }

                    }

                }

            }

        );

}
/* ==========================================
   Workout Breakdown Chart
========================================== */

function renderWorkoutTypeChart(){

    const canvas =

        $("workoutTypeChart");


    if(!canvas){

        return;

    }


    if(charts.workoutType){

        charts.workoutType.destroy();

    }


    const breakdown =

        analytics.workoutBreakdown;


    charts.workoutType =

        new Chart(

            canvas,

            {

                type:"doughnut",

                data:{

                    labels:[

                        "Easy",

                        "Quality",

                        "Long",

                        "Recovery",

                        "Race"

                    ],

                    datasets:[

                        {

                            data:[

                                breakdown.easy,

                                breakdown.quality,

                                breakdown.long,

                                breakdown.recovery,

                                breakdown.race

                            ]

                        }

                    ]

                },

                options:{

                    responsive:true,

                    maintainAspectRatio:false,

                    plugins:{

                        legend:{

                            position:"bottom"

                        }

                    }

                }

            }

        );

}
/* ==========================================
   Upcoming Workouts
========================================== */

function renderUpcomingWorkouts(){

    const container =

        $("upcomingRuns");


    if(!container){

        return;

    }


    const workouts =

        getUpcomingWorkouts()

        .slice(0,7);


    container.innerHTML = "";


    workouts.forEach(

        workout=>{

            const card =

                document.createElement(

                    "div"

                );


            card.className =

                "upcoming-workout";


            card.innerHTML = `

                <div class="upcoming-left">

                    <strong>

                        Week ${workout.week}

                    </strong>

                    <span>

                        ${workout.day}

                    </span>

                </div>

                <div class="upcoming-middle">

                    ${workout.session}

                </div>

                <div class="upcoming-right">

                    ${workout.miles} mi

                </div>

            `;


            container.appendChild(

                card

            );

        }

    );

}
/* ==========================================
   AI Coach
========================================== */

function renderAIInsights(){

    const container =

        $("aiInsights");


    if(!container){

        return;

    }


    const insights = [];


    if(analytics.completion >= 90){

        insights.push({

            title:"Excellent Consistency",

            text:"You've completed nearly every scheduled workout. Stay healthy and trust the process."

        });

    }

    else if(analytics.completion >= 70){

        insights.push({

            title:"Good Progress",

            text:"You're staying consistent. Focus on hitting every quality workout and long run."

        });

    }

    else{

        insights.push({

            title:"Build Consistency",

            text:"The biggest improvement right now comes from completing more scheduled workouts."

        });

    }


    if(analytics.nextLongRun){

        insights.push({

            title:"Next Long Run",

            text:`${analytics.nextLongRun.miles} miles scheduled during Week ${analytics.nextLongRun.week}. Prioritize sleep and fueling before this session.`

        });

    }


    if(analytics.trainingWeek >= 13){

        insights.push({

            title:"Peak Phase",

            text:"You're entering the highest training load of the cycle. Recovery is just as important as mileage."

        });

    }

    else if(analytics.trainingWeek >= 9){

        insights.push({

            title:"Marathon Specific Training",

            text:"Marathon pace workouts are becoming the priority. Practice race-day nutrition during these sessions."

        });

    }

    else{

        insights.push({

            title:"Building Your Base",

            text:"Stay patient. Aerobic fitness built now will pay off during the peak weeks."

        });

    }


    container.innerHTML =

        insights.map(

            insight => `

                <div class="insight-card">

                    <h4>

                        ${insight.title}

                    </h4>

                    <p>

                        ${insight.text}

                    </p>

                </div>

            `

        ).join("");

}
/* ==========================================
   Initialize Analytics
========================================== */

function initAnalytics(){

    loadAnalyticsData();

    updateDashboard();

    updatePerformanceCards();

    renderWeeklyMileageChart();

    renderWorkoutTypeChart();

    renderUpcomingWorkouts();

    renderAIInsights();

}


/* ==========================================
   Buttons
========================================== */

const marathonButton =

    $("viewMarathonPlan");


if(marathonButton){

    marathonButton.addEventListener(

        "click",

        ()=>{

            window.location.href =

                "marathon.html";

        }

    );

}


const todayButton =

    $("viewTodayWorkout");


if(todayButton){

    todayButton.addEventListener(

        "click",

        ()=>{

            window.location.href =

                "marathon.html";

        }

    );

}


/* ==========================================
   Start
========================================== */

document.addEventListener(

    "DOMContentLoaded",

    ()=>{

        initAnalytics();

    }

);
