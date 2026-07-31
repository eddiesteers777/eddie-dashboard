/* ==========================================
   EddieOS Analytics
========================================== */

const RACE_DATE = new Date("2026-11-07");

const today = new Date();

let marathonPlan = [];

let charts = {};

const analytics = {

    weeklyMileage:0,

    totalMileage:0,

    peakMileage:0,

    completion:0,

    longestRun:0,

    longRuns:0,

    completedLongRuns:0,

    trainingWeek:1,

    nextLongRun:null,

    todayWorkout:null

};

/* ==========================================
   Utilities
========================================== */

function formatDate(date){

    return date.toLocaleDateString(

        "en-US",

        {

            weekday:"long",

            month:"long",

            day:"numeric"

        }

    );

}

function daysUntilRace(){

    return Math.max(

        0,

        Math.ceil(

            (RACE_DATE - today) /

            86400000

        )

    );

}
/* ==========================================
   Load Marathon Data
========================================== */

function loadMarathonPlan(){

    const storedPlan = localStorage.getItem(

        "marathonPlan"

    );

    if(storedPlan){

        marathonPlan = JSON.parse(

            storedPlan

        );

    }

    else{

        marathonPlan = [];

    }

}

/* ==========================================
   Calculate Analytics
========================================== */

function calculateAnalytics(){

    if(marathonPlan.length===0){

        return;

    }

    analytics.totalMileage = 0;

    analytics.weeklyMileage = 0;

    analytics.peakMileage = 0;

    analytics.longRuns = 0;

    analytics.completedLongRuns = 0;

    marathonPlan.forEach(week=>{

        analytics.totalMileage +=

            week.totalMileage || 0;

        analytics.peakMileage = Math.max(

            analytics.peakMileage,

            week.totalMileage || 0

        );

        if(

            week.totalMileage >

            analytics.weeklyMileage &&

            week.current

        ){

            analytics.weeklyMileage =

                week.totalMileage;

        }

        week.workouts.forEach(workout=>{

            if(

                workout.type ===

                "Long Run"

            ){

                analytics.longRuns++;

            }

        });

    });

}
