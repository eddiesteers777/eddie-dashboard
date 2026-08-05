/* ==========================================
   EddieOS Marathon Data
========================================== */

export const START_DATE = new Date(

    "2026-07-20T00:00:00"

);

export const RACE_DATE = new Date(

    "2026-11-07T00:00:00"

);

export const DAY_MS = 86400000;

/* ==========================================
   Helper Functions
========================================== */

export function formatDate(date){

    return date.toLocaleDateString(

        "en-US",

        {

            month:"short",

            day:"numeric"

        }

    );

}

export function weekStart(week){

    return new Date(

        START_DATE.getTime()

        +

        (week-1)

        *

        7

        *

        DAY_MS

    );

}

export function weekEnd(week){

    return new Date(

        weekStart(week).getTime()

        +

        6

        *

        DAY_MS

    );

}

export function weekRange(week){

    return `${formatDate(

        weekStart(week)

    )} - ${formatDate(

        weekEnd(week)

    )}, 2026`;

}
/* ==========================================
   Training Phases
========================================== */

export const PHASES = {

    rebuild:{

        label:"Rebuild & Consistency",

        color:"#4C8B6E"

    },

    build:{

        label:"Aerobic & Threshold Build",

        color:"#2FD4C0"

    },

    mp:{

        label:"Marathon-Specific Development",

        color:"#6C8CFF"

    },

    peak:{

        label:"Peak & Race Simulation",

        color:"#F0A742"

    },

    taper:{

        label:"Taper & Race",

        color:"#C2694A"

    }

};

/* ==========================================
   Days
========================================== */

export const DAYS = [

    "Mon",

    "Tue",

    "Wed",

    "Thu",

    "Fri",

    "Sat",

    "Sun"

];

export const DAY_TIMES = [

    "Before school",

    "Afternoon / Evening",

    "Before school",

    "Afternoon / Evening",

    "Before school",

    "Morning",

    "Morning"

];

/* ==========================================
   Workout Builder
========================================== */

export function workout(

    session,

    miles,

    pace,

    race=false

){

    return {

    session,

    miles,

    pace,

    race,

    strength: [],

    crossTraining: [],

    mobility: [],

    recovery: [],

    notes: ""

};
}
/* ==========================================
   Cross Training Templates
========================================== */

export const CROSS_TRAINING = {

    strength: {

        title: "Tuesday Strength",

        workouts: [

            "Bench Press - 3 × 8",
            "Pull-Ups - 3 × 8",
            "Shoulder Press - 3 × 10",
            "Chest Supported Rows - 3 × 10",
            "Face Pulls - 3 × 15"

        ]

    },

    maintenance: {

        title: "Friday Maintenance",

        workouts: [

            "Goblet Squat - 2 × 10",
            "Single Leg RDL - 2 × 10",
            "Push-Ups - 2 × 15",
            "Band Pull Aparts - 2 × 20"

        ]

    },

    stretch: {

        title: "Stretching",

        workouts: [

            "Hip Flexors",
            "Hamstrings",
            "Calves",
            "Thoracic Mobility"

        ]

    },

    recovery: {

        title: "Recovery",

        workouts: [

            "Foam Roll",

            "Stretch",

            "Hydrate",

            "Protein Goal"

        ]

    }

};
 export const WEEKS = [
    { phase: "rebuild",
      days: [workout("Recovery jog", 3, "Recovery"), workout("Hill repeats: 8x45s @ strong effort", 5, "Hill effort"),
             workout("Easy aerobic", 5, "Easy"), workout("6mi, last 2mi @ Steady", 6, "Steady"),
             workout("Recovery + Strength (Foundation phase)", 3, "Recovery"), workout("Long run - comfortable, finish strong", 9, "Long run"),
             workout("Recovery jog", 2, "Recovery")],
      mental: "Show up. Rebuild trust in your training.",
      purpose: "Re-establish rhythm. Hills introduce power/economy at low impact - no flat speedwork yet.",
      fueling: "No in-run fueling needed (all runs under 90 min). Protein-forward breakfast, steady hydration.",
      heat: "Peak Alabama summer - run recovery/easy by feel, not pace. Slow it down.",
      strength: "Foundation: 12-15 reps, single-leg emphasis, daily eccentric calf raises begin now." },

    { phase: "rebuild",
      days: [workout("Recovery jog", 4, "Recovery"), workout("Fartlek: 8x1min surge / 1min float", 6, "Fartlek"),
             workout("Easy aerobic", 5, "Easy"), workout("7mi, 2mi @ Steady", 7, "Steady"),
             workout("Recovery + Strength", 3, "Recovery"), workout("Long run - comfortable", 10, "Long run"),
             workout("Recovery jog", 2, "Recovery")],
      mental: "Patience over pace. Effort first, watch second.",
      purpose: "First unstructured speed stimulus (fartlek) - teaches pace-change tolerance without rigid intervals.",
      fueling: "Long run crosses 90 min for the first time - practice one gel or 20-30g carbs mid-run.",
      heat: "Still deep summer - shift Tuesday to evening if a heat advisory is in effect.",
      strength: "Foundation continues: durability work + eccentric Achilles loading daily." },

    { phase: "rebuild",
      days: [workout("Recovery jog", 4, "Recovery"), workout("Hill repeats: 10x45s @ strong effort", 6, "Hill effort"),
             workout("Easy aerobic", 6, "Easy"), workout("Progression finish - last 3mi progressively faster", 7, "Progression"),
             workout("Recovery + Strength", 3, "Recovery"), workout("Long run, last 2mi @ Steady", 11, "Steady"),
             workout("Recovery jog", 3, "Recovery")],
      mental: "Strength inside the effort. Hills don't lie, and neither do you.",
      purpose: "Hill volume increases; progression finish rehearses negative-split pacing discipline.",
      fueling: "Continue mid-run fueling practice on the long run - same gel each time.",
      heat: "Run hills in the coolest part of the day available - heat + hills is a bad combo.",
      strength: "Foundation phase, week 3 of 4 - loads still light, reps still high." },

    { phase: "rebuild",
      days: [workout("Recovery jog", 3, "Recovery"), workout("Easy + strides (down week - no hard effort)", 4, "Easy"),
             workout("Easy aerobic", 3, "Easy"), workout("Easy aerobic", 5, "Easy"),
             workout("Recovery + light Strength", 2, "Recovery"), workout("Easy long run", 8, "Long run"),
             workout("Recovery jog", 2, "Recovery")],
      mental: "Recovery is training too.",
      purpose: "True cutback (~33% drop) to absorb 3 weeks of rebuilding load before the next phase begins.",
      fueling: "Nothing new this week - dial back to basics.",
      heat: "Standard summer caution - every run at easy effort regardless of pace shown.",
      strength: "End of Foundation phase - Strength phase (moderate load) begins next week.",
      checkpoint: "Checkpoint #1: How did the rebuild month feel? Easy across the board = go slightly more aggressive on Phase 2 volume. Anything forced = hold steady." },

    { phase: "build",
      days: [workout("Recovery jog", 4, "Recovery"), workout("Cruise intervals: 5x6min @ threshold, 2min jog", 7, "Cruise"),
             workout("Easy aerobic", 6, "Easy"), workout("Progression tempo - steady into threshold", 8, "Threshold"),
             workout("Recovery + Strength (Strength phase begins)", 4, "Recovery"), workout("Long run, last 3mi @ Steady/Tempo", 12, "Steady"),
             workout("Recovery jog", 3, "Recovery")],
      mental: "Consistency compounds - this is where the base starts to show up in how workouts feel.",
      purpose: "Mileage climbs meaningfully. Cruise intervals become the primary threshold tool.",
      fueling: "Long run regularly over 90 min now - target 60-90g carbs/hr with your race-day gel.",
      heat: "Late-summer heat still demands effort-based pacing on quality days.",
      strength: "Strength phase begins: 8-10 reps, moderate load, loaded carries + RDLs added." },

    { phase: "build",
      days: [workout("Recovery jog", 5, "Recovery"), workout("VO2max: 6x3min @ 5K effort, 2min jog", 7, "VO2max"),
             workout("Easy aerobic", 6, "Easy"), workout("1K repeats: 6x1K @ 10K pace", 8, "10K pace"),
             workout("Recovery + Strength", 5, "Recovery"), workout("Long run w/ 4mi Cruise Intervals embedded", 13, "Cruise"),
             workout("Recovery jog", 3, "Recovery")],
      mental: "Comfortable hard - let workouts feel controlled even when they're honest efforts.",
      purpose: "First of two total VO2max touches this cycle - preserves top-end speed without becoming a speed block.",
      fueling: "Continue practicing your exact race-day gel brand/flavor for consistency.",
      heat: "Watch dew point as much as temperature - humidity is the bigger pace threat right now.",
      strength: "Strength phase continues - loads increasing, still supporting (not competing with) mileage." },

    { phase: "build",
      days: [workout("Recovery jog", 4, "Recovery"), workout("Mile repeats: 4x1mi @ Threshold, 90s jog", 6, "Threshold"),
             workout("Easy aerobic", 5, "Easy"), workout("Broken tempo: 3x2mi @ Threshold", 8, "Threshold"),
             workout("Recovery + Strength", 4, "Recovery"), workout("Long run w/ 3mi @ Threshold", 12, "Threshold"),
             workout("Recovery jog", 3, "Recovery")],
      mental: "Sharpen before racing - trust the fitness, don't chase it in the final week.",
      purpose: "Slight mileage trim to arrive at the 10K with fresh legs while keeping threshold sharp.",
      fueling: "Rehearse your full pre-race breakfast and warm-up routine ahead of the 10K.",
      heat: "Early September in Alabama is often still hot - treat exactly like the prior 6 weeks.",
      strength: "Strength phase, final full week before race-week reduction." },

    { phase: "build",
      days: [workout("Recovery jog", 3, "Recovery"), workout("Easy + strides", 3, "Easy"),
             workout("Easy aerobic", 4, "Easy"), workout("Easy aerobic", 6, "Easy"),
             workout("Recovery + light Strength", 2, "Recovery"), workout("Shakeout jog", 2, "Recovery"),
             workout("RACE: 10K Tune-Up (Sun Sep 13) + warm-up/cooldown", 8, "Race", true)],
      mental: "Race for data, not just outcome. Notice how goal-adjacent paces feel.",
      purpose: "First tune-up race - a fitness checkpoint and full fueling/pacing rehearsal.",
      fueling: "Full race-morning fueling rehearsal: same breakfast, timing, and warm-up as marathon day.",
      heat: "Early-Sept race - expect warm conditions; don't chase a 'perfect' time in the heat.",
      strength: "Race-week reduction - light activation only.",
      race: { name: "10K Tune-Up", date: "Sun, Sep 13, 2026" },
      checkpoint: "Checkpoint #2 (post-10K): Recalculate threshold/cruise/VO2max paces from this result via Riegel/VDOT." },

    { phase: "mp",
      days: [workout("Recovery jog", 5, "Recovery"), workout("VO2max: 5x1000m @ 10K-5K effort", 7, "VO2max"),
             workout("Easy aerobic", 6, "Easy"), workout("4mi @ Marathon Pace", 9, "MP"),
             workout("Recovery + Strength (Power phase begins)", 5, "Recovery"), workout("Progression long run - last 3mi toward MP", 14, "MP"),
             workout("Recovery jog", 4, "Recovery")],
      mental: "Marathon pace becomes familiar, not fast.",
      purpose: "Marathon pace enters the long run for the first time - the centerpiece of this phase.",
      fueling: "Practice the full 60-90g carbs/hr target now that MP miles are in the mix.",
      heat: "Conditions should start easing by late September - effort still the tiebreaker on humid days.",
      strength: "Power/Economy phase begins: 5-6 reps, controlled tempo, low-amplitude plyo only if pain-free." },

    { phase: "mp",
      days: [workout("Recovery jog", 5, "Recovery"), workout("Cruise intervals: 6x5min @ threshold", 8, "Cruise"),
             workout("Easy aerobic", 6, "Easy"), workout("5mi @ Marathon Pace", 9, "MP"),
             workout("Recovery + Strength", 5, "Recovery"), workout("Fast-finish long run - last 3mi hard", 16, "Fast finish"),
             workout("Recovery jog", 4, "Recovery")],
      mental: "Confidence in the tired miles - notice how MP feels in mile 12, not just mile 2.",
      purpose: "Longest long run yet; fast-finish trains fast-twitch recruitment under aerobic fatigue.",
      fueling: "Treat the long run as a dress rehearsal: race shoes, race breakfast, race gels.",
      heat: "Fall conditions arriving - paces may start coming more easily at the same effort.",
      strength: "Power/Economy phase continues." },

    { phase: "mp",
      days: [workout("Recovery jog", 5, "Recovery"), workout("Mile repeats: 6x1mi @ Threshold", 8, "Threshold"),
             workout("Easy aerobic", 5, "Easy"), workout("5mi @ Marathon Pace, fueling practice", 10, "MP"),
             workout("Recovery + Strength", 4, "Recovery"), workout("19mi w/ 7-8mi continuous Marathon Pace, full fueling rehearsal", 19, "MP"),
             workout("Recovery jog", 3, "Recovery")],
      mental: "Practice race day exactly - nothing new on race morning you haven't rehearsed here.",
      purpose: "Final full-volume build week before the half marathon; MP and threshold now sit side by side comfortably.",
      fueling: "Last full fueling rehearsal before the half marathon - lock in what's working.",
      heat: "Should feel noticeably cooler - a good sign of both season and fitness.",
      strength: "Power/Economy phase, final full week before the half-marathon taper." },

    { phase: "mp",
      days: [workout("Recovery jog", 4, "Recovery"), workout("Easy + strides", 3, "Easy"),
             workout("Easy aerobic", 4, "Easy"), workout("Easy aerobic", 6, "Easy"),
             workout("Recovery + light Strength", 3, "Recovery"), workout("Shakeout jog", 2, "Recovery"),
             workout("RACE: Half Marathon Tune-Up (Sun Oct 11) + warm-up/cooldown", 15, "Race", true)],
      mental: "The half marathon is a checkpoint, not the goal - run it hard, then let the data speak.",
      purpose: "The single most valuable fitness checkpoint of the cycle - race it at genuine effort.",
      fueling: "Full race-day simulation: gear, breakfast, warm-up, in-race fueling exactly as planned for Nov 8.",
      heat: "Early October should be comfortable - a good early sign for marathon-day conditions.",
      strength: "Race-week reduction - light activation only.",
      race: { name: "Half Marathon Tune-Up", date: "Sun, Oct 11, 2026" },
      checkpoint: "Checkpoint #3 (post-half): Recalculate marathon-pace target directly from this result - the best predictor available this cycle." },

    { phase: "peak",
      days: [workout("Recovery jog", 5, "Recovery"), workout("Progression tempo - steady into threshold", 8, "Threshold"),
             workout("Easy aerobic", 3, "Easy"), workout("6mi @ Marathon Pace", 10, "MP"),
             workout("Recovery + Strength", 4, "Recovery"), workout("Broken MP long run: 3x3mi @ MP, short jog recovery", 17, "MP"),
             workout("Recovery jog", 1, "Recovery")],
      mental: "Simulate, don't panic - this is the dress rehearsal, not the performance.",
      purpose: "A smoothing/step-down week after the half marathon before the true peak - protects tissue from stacking two max weeks back to back.",
      fueling: "Exact race-day fueling plan, tested at exact race effort, in exact shoes and kit.",
      heat: "Mid-October in Alabama is typically ideal training weather.",
      strength: "Power/Economy phase, reduced volume this week to match the running step-down." },

    { phase: "peak",
      days: [workout("Recovery jog", 6, "Recovery"), workout("Short MP-specific reps: 6x1mi @ MP/Threshold blend", 8, "MP"),
             workout("Easy aerobic", 7, "Easy"), workout("6mi @ Marathon Pace, full race-day fueling test", 10, "MP"),
             workout("Recovery + Strength", 5, "Recovery"), workout("PEAK: 20-mile long run w/ 10-12mi continuous Marathon Pace", 20, "MP", false),
             workout("Recovery jog", 5, "Recovery")],
      mental: "Peak week - trust the work. Everything from here is about arriving healthy, not doing more.",
      purpose: "The single biggest week of the cycle. 10-12 miles at marathon pace inside a 20-miler is the exact stimulus that turns a 3:09 predictor into a 3:05 finisher.",
      fueling: "Final full rehearsal - whatever works here is exactly what you do Nov 8.",
      heat: "Conditions should be excellent - no heat adjustments needed most days.",
      strength: "Maintenance phase begins - minimal volume, nothing new introduced.",
      checkpoint: "Checkpoint #4: How did the marathon-pace segment feel in the final third of the 20-miler? This sets your final race-pace confidence." },

    { phase: "taper",
      days: [workout("Recovery jog", 4, "Recovery"), workout("3x1mi @ Marathon Pace (sharpen, not tire)", 6, "MP"),
             workout("Easy aerobic", 5, "Easy"), workout("3mi @ Marathon Pace", 7, "MP"),
             workout("Recovery + light Strength", 3, "Recovery"), workout("Long run w/ 4mi @ Marathon Pace", 12, "MP"),
             workout("Recovery jog", 3, "Recovery")],
      mental: "Less is more - the fitness is already banked. This week protects it.",
      purpose: "Volume drops meaningfully; small sharp intensity touches keep race-pace feel alive.",
      fueling: "Begin thinking about race-week carb intake - nothing drastic yet, just attentive.",
      heat: "Cool, stable conditions expected - a good final data point for race-day pacing.",
      strength: "Maintenance - one short activation session, minimal volume." },

    { phase: "taper",
      days: [workout("Recovery jog", 3, "Recovery"), workout("Easy + strides", 4, "Easy"),
             workout("Easy shakeout", 3, "Easy"), workout("3x1mi @ Marathon Pace, then rest starts", 4, "MP"),
             workout("Easy + light strides, gear check", 2, "Easy"), workout("Shakeout jog, begin carb-load", 2, "Recovery"),
             workout("RACE DAY: Indianapolis Monumental Marathon - Goal 3:05:00", 26.2, "Race", true)],
      mental: "You've earned this line. Not hoping for 3:05 - believing it, because you did the work to prove it.",
      purpose: "Arrive rested, confident, and fueled. Every hard mile that matters has already been run.",
      fueling: "Standard race-morning routine, exactly as rehearsed in Weeks 8, 12, and 14. Nothing new on race day.",
      heat: "Early-November race morning should run cool - dress in layers you can shed.",
      strength: "None this week - full rest for the legs.",
      race: { name: "Indianapolis Monumental Marathon", date: "Sun, Nov 8, 2026" } },
  ];
/* ==========================================
   Pace Reference
========================================== */

export const PACES = [

    ["Recovery", "8:45–9:30 /mi"],

    ["Easy", "8:15–9:00 /mi"],

    ["Long Run", "7:50–8:40 /mi"],

    ["Marathon Pace", "6:58–7:05 /mi"],

    ["Steady", "7:20–7:40 /mi"],

    ["Threshold", "6:35–6:50 /mi"],

    ["Cruise Intervals", "6:30–6:45 /mi"],

    ["10K Pace", "6:15–6:25 /mi"],

    ["5K / VO₂max", "6:00–6:10 /mi"],

    ["Hill Repeats / Fartlek", "Run by effort"]

];

/* ==========================================
   Week Helpers
========================================== */

export function getWeek(weekNumber){

    return WEEKS[weekNumber-1];

}

export function getWeekDays(weekNumber){

    return getWeek(

        weekNumber

    ).days;

}

export function getWeekMileage(weekNumber){

    return getWeekDays(

        weekNumber

    ).reduce(

        (sum,day)=>

            sum+

            Number(day.miles||0),

        0

    );

}

export function getPeakMileage(){

    return Math.max(

        ...WEEKS.map(

            (_,i)=>

            getWeekMileage(i+1)

        )

    );

}
/* ==========================================
   Marathon Analytics Helpers
========================================== */


export function getCycleMileage(){

    let total = 0;

    for(

        let i = 1;

        i <= WEEKS.length;

        i++

    ){

        total += getWeekMileage(i);

    }

    return Math.round(total * 10) / 10;

}



export function getCurrentWeek(){

    const today = new Date();


    for(

        let i = 1;

        i <= WEEKS.length;

        i++

    ){

        if(

            today >= weekStart(i)

            &&

            today <= weekEnd(i)

        ){

            return i;

        }

    }


    if(today < START_DATE){

        return 1;

    }


    return WEEKS.length;

}



export function getRaceCountdown(){

    const today = new Date();

    today.setHours(0,0,0,0);

    const race = new Date(RACE_DATE);

    race.setHours(0,0,0,0);

    return Math.max(

        0,

        Math.round(

            (race - today) / DAY_MS

        )

    );

}



export function getLongestRun(){

    let longest = 0;


    WEEKS.forEach(

        week => {

            week.days.forEach(

                day => {

                    if(

                        Number(day.miles)

                        >

                        longest

                    ){

                        longest =

                            Number(day.miles);

                    }

                }

            );

        }

    );


    return longest;

}



export function getLongRuns(){

    const runs = [];


    WEEKS.forEach(

        (week,index)=>{


            week.days.forEach(

                day=>{


                    if(

                        day.pace === "Long run"

                        ||

                        day.session.toLowerCase()

                        .includes("long run")

                    ){

                        runs.push({

                            week:index+1,

                            session:day.session,

                            miles:day.miles

                        });

                    }


                }

            );


        }

    );


    return runs;

}



export function getTrainingPhase(){

    const week = getCurrentWeek();


    const phase =

        WEEKS[week-1]?.phase;


    return PHASES[phase]?.label || "";

}
/* ==========================================
   Progress Tracking
========================================== */


export function loadProgress(){

    try{

        return JSON.parse(

            localStorage.getItem(

                "training-progress"

            )

            ||

            "{}"

        );

    }

    catch(error){

        return {};

    }

}



export function loadOverrides(){

    try{

        return JSON.parse(

            localStorage.getItem(

                "training-overrides"

            )

            ||

            "{}"

        );

    }

    catch(error){

        return {};

    }

}



/* ==========================================
   Completed Workout Helpers
========================================== */


export function getCompletedWorkouts(){

    const progress = loadProgress();

    let completed = 0;


    Object.values(progress)

        .forEach(

            week=>{

                completed +=

                    Object.values(week)

                    .filter(Boolean)

                    .length;

            }

        );


    return completed;

}



export function getCompletionPercent(){

    const completed =

        getCompletedWorkouts();


    const total =

        WEEKS.length *

        DAYS.length;


    return Math.round(

        (completed / total) *

        100

    );

}



/* ==========================================
   Override Handling
========================================== */


export function getAdjustedWeekDays(weekNumber){

    const week =

        getWeek(

            weekNumber

        );


    const overrides =

        loadOverrides();



    const weekOverrides =

        overrides[weekNumber]

        ||

        {};



    return week.days.map(

        (day,index)=>{


            const key =

                DAYS[index];


            const edit =

                weekOverrides[key]

                ||

                {};



            return {


                session:

                    edit.session !== undefined

                    ?

                    edit.session

                    :

                    day.session,



                miles:

                    edit.miles !== undefined

                    ?

                    edit.miles

                    :

                    day.miles,



                pace:

                    day.pace,



                race:

                    day.race || false,


                edited:

                    Object.keys(edit)

                    .length > 0


            };


        }

    );

}



export function getAdjustedWeekMileage(weekNumber){

    return getAdjustedWeekDays(

        weekNumber

    )

    .reduce(

        (total,day)=>

            total +

            Number(day.miles || 0),

        0

    );

}
/* ==========================================
   Workout Type Analytics
========================================== */


export function getWorkoutBreakdown(){

    const breakdown = {

        easy:0,

        quality:0,

        long:0,

        recovery:0,

        race:0

    };


    WEEKS.forEach(

        week=>{


            week.days.forEach(

                day=>{


                    const session =

                        day.session.toLowerCase();



                    if(day.race){

                        breakdown.race++;

                    }

                    else if(

                        session.includes("long")

                    ){

                        breakdown.long++;

                    }

                    else if(

                        session.includes("recovery")

                    ){

                        breakdown.recovery++;

                    }

                    else if(

                        session.includes("tempo")

                        ||

                        session.includes("threshold")

                        ||

                        session.includes("interval")

                        ||

                        session.includes("vo2")

                        ||

                        session.includes("repeat")

                    ){

                        breakdown.quality++;

                    }

                    else{

                        breakdown.easy++;

                    }


                }

            );


        }

    );


    return breakdown;

}



/* ==========================================
   Upcoming Workouts
========================================== */


export function getUpcomingWorkouts(){

    const today = new Date();

    today.setHours(0,0,0,0);

    const workouts = [];

    for(

        let week = getCurrentWeek();

        week <= WEEKS.length;

        week++

    ){

        const weekDays = getAdjustedWeekDays(week);

        weekDays.forEach((day,index)=>{

            const workoutDate = new Date(

                weekStart(week).getTime()

                +

                index * DAY_MS

            );

            workoutDate.setHours(0,0,0,0);

            if(workoutDate >= today){

                workouts.push({

                    week,

                    day:DAYS[index],

                    date:workoutDate,

                    session:day.session,

                    miles:day.miles,

                    pace:day.pace,

                    race:day.race || false

                });

            }

        });

    }

    return workouts;

}


/* ==========================================
   Next Long Run
========================================== */


export function getNextLongRun(){

    const workouts =

        getUpcomingWorkouts();



    return workouts.find(

        workout=>


            workout.session

            .toLowerCase()

            .includes("long")

    )

    ||

    null;

}



/* ==========================================
   Marathon Data Export Check
========================================== */


export default {

    START_DATE,

    RACE_DATE,

    WEEKS,

    PHASES,

    PACES,

    getCurrentWeek,

    getCycleMileage,

    getPeakMileage,

    getLongestRun,

    getCompletionPercent

};
