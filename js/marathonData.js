/* ==========================================
   EddieOS Marathon Data
========================================== */

export const START_DATE = new Date(

    "2026-07-20T00:00:00"

);

export const RACE_DATE = new Date(

    "2026-11-08T00:00:00"

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

    return{

        session,

        miles,

        pace,

        race

    };

}
 const WEEKS = [
    { phase: "rebuild",
      days: [D("Recovery jog", 3, "Recovery"), D("Hill repeats: 8x45s @ strong effort", 5, "Hill effort"),
             D("Easy aerobic", 5, "Easy"), D("6mi, last 2mi @ Steady", 6, "Steady"),
             D("Recovery + Strength (Foundation phase)", 3, "Recovery"), D("Long run - comfortable, finish strong", 9, "Long run"),
             D("Recovery jog", 2, "Recovery")],
      mental: "Show up. Rebuild trust in your training.",
      purpose: "Re-establish rhythm. Hills introduce power/economy at low impact - no flat speedwork yet.",
      fueling: "No in-run fueling needed (all runs under 90 min). Protein-forward breakfast, steady hydration.",
      heat: "Peak Alabama summer - run recovery/easy by feel, not pace. Slow it down.",
      strength: "Foundation: 12-15 reps, single-leg emphasis, daily eccentric calf raises begin now." },

    { phase: "rebuild",
      days: [D("Recovery jog", 4, "Recovery"), D("Fartlek: 8x1min surge / 1min float", 6, "Fartlek"),
             D("Easy aerobic", 5, "Easy"), D("7mi, 2mi @ Steady", 7, "Steady"),
             D("Recovery + Strength", 3, "Recovery"), D("Long run - comfortable", 10, "Long run"),
             D("Recovery jog", 2, "Recovery")],
      mental: "Patience over pace. Effort first, watch second.",
      purpose: "First unstructured speed stimulus (fartlek) - teaches pace-change tolerance without rigid intervals.",
      fueling: "Long run crosses 90 min for the first time - practice one gel or 20-30g carbs mid-run.",
      heat: "Still deep summer - shift Tuesday to evening if a heat advisory is in effect.",
      strength: "Foundation continues: durability work + eccentric Achilles loading daily." },

    { phase: "rebuild",
      days: [D("Recovery jog", 4, "Recovery"), D("Hill repeats: 10x45s @ strong effort", 6, "Hill effort"),
             D("Easy aerobic", 6, "Easy"), D("Progression finish - last 3mi progressively faster", 7, "Progression"),
             D("Recovery + Strength", 3, "Recovery"), D("Long run, last 2mi @ Steady", 11, "Steady"),
             D("Recovery jog", 3, "Recovery")],
      mental: "Strength inside the effort. Hills don't lie, and neither do you.",
      purpose: "Hill volume increases; progression finish rehearses negative-split pacing discipline.",
      fueling: "Continue mid-run fueling practice on the long run - same gel each time.",
      heat: "Run hills in the coolest part of the day available - heat + hills is a bad combo.",
      strength: "Foundation phase, week 3 of 4 - loads still light, reps still high." },

    { phase: "rebuild",
      days: [D("Recovery jog", 3, "Recovery"), D("Easy + strides (down week - no hard effort)", 4, "Easy"),
             D("Easy aerobic", 3, "Easy"), D("Easy aerobic", 5, "Easy"),
             D("Recovery + light Strength", 2, "Recovery"), D("Easy long run", 8, "Long run"),
             D("Recovery jog", 2, "Recovery")],
      mental: "Recovery is training too.",
      purpose: "True cutback (~33% drop) to absorb 3 weeks of rebuilding load before the next phase begins.",
      fueling: "Nothing new this week - dial back to basics.",
      heat: "Standard summer caution - every run at easy effort regardless of pace shown.",
      strength: "End of Foundation phase - Strength phase (moderate load) begins next week.",
      checkpoint: "Checkpoint #1: How did the rebuild month feel? Easy across the board = go slightly more aggressive on Phase 2 volume. Anything forced = hold steady." },

    { phase: "build",
      days: [D("Recovery jog", 4, "Recovery"), D("Cruise intervals: 5x6min @ threshold, 2min jog", 7, "Cruise"),
             D("Easy aerobic", 6, "Easy"), D("Progression tempo - steady into threshold", 8, "Threshold"),
             D("Recovery + Strength (Strength phase begins)", 4, "Recovery"), D("Long run, last 3mi @ Steady/Tempo", 12, "Steady"),
             D("Recovery jog", 3, "Recovery")],
      mental: "Consistency compounds - this is where the base starts to show up in how workouts feel.",
      purpose: "Mileage climbs meaningfully. Cruise intervals become the primary threshold tool.",
      fueling: "Long run regularly over 90 min now - target 60-90g carbs/hr with your race-day gel.",
      heat: "Late-summer heat still demands effort-based pacing on quality days.",
      strength: "Strength phase begins: 8-10 reps, moderate load, loaded carries + RDLs added." },

    { phase: "build",
      days: [D("Recovery jog", 5, "Recovery"), D("VO2max: 6x3min @ 5K effort, 2min jog", 7, "VO2max"),
             D("Easy aerobic", 6, "Easy"), D("1K repeats: 6x1K @ 10K pace", 8, "10K pace"),
             D("Recovery + Strength", 5, "Recovery"), D("Long run w/ 4mi Cruise Intervals embedded", 13, "Cruise"),
             D("Recovery jog", 3, "Recovery")],
      mental: "Comfortable hard - let workouts feel controlled even when they're honest efforts.",
      purpose: "First of two total VO2max touches this cycle - preserves top-end speed without becoming a speed block.",
      fueling: "Continue practicing your exact race-day gel brand/flavor for consistency.",
      heat: "Watch dew point as much as temperature - humidity is the bigger pace threat right now.",
      strength: "Strength phase continues - loads increasing, still supporting (not competing with) mileage." },

    { phase: "build",
      days: [D("Recovery jog", 4, "Recovery"), D("Mile repeats: 4x1mi @ Threshold, 90s jog", 6, "Threshold"),
             D("Easy aerobic", 5, "Easy"), D("Broken tempo: 3x2mi @ Threshold", 8, "Threshold"),
             D("Recovery + Strength", 4, "Recovery"), D("Long run w/ 3mi @ Threshold", 12, "Threshold"),
             D("Recovery jog", 3, "Recovery")],
      mental: "Sharpen before racing - trust the fitness, don't chase it in the final week.",
      purpose: "Slight mileage trim to arrive at the 10K with fresh legs while keeping threshold sharp.",
      fueling: "Rehearse your full pre-race breakfast and warm-up routine ahead of the 10K.",
      heat: "Early September in Alabama is often still hot - treat exactly like the prior 6 weeks.",
      strength: "Strength phase, final full week before race-week reduction." },

    { phase: "build",
      days: [D("Recovery jog", 3, "Recovery"), D("Easy + strides", 3, "Easy"),
             D("Easy aerobic", 4, "Easy"), D("Easy aerobic", 6, "Easy"),
             D("Recovery + light Strength", 2, "Recovery"), D("Shakeout jog", 2, "Recovery"),
             D("RACE: 10K Tune-Up (Sun Sep 13) + warm-up/cooldown", 8, "Race", true)],
      mental: "Race for data, not just outcome. Notice how goal-adjacent paces feel.",
      purpose: "First tune-up race - a fitness checkpoint and full fueling/pacing rehearsal.",
      fueling: "Full race-morning fueling rehearsal: same breakfast, timing, and warm-up as marathon day.",
      heat: "Early-Sept race - expect warm conditions; don't chase a 'perfect' time in the heat.",
      strength: "Race-week reduction - light activation only.",
      race: { name: "10K Tune-Up", date: "Sun, Sep 13, 2026" },
      checkpoint: "Checkpoint #2 (post-10K): Recalculate threshold/cruise/VO2max paces from this result via Riegel/VDOT." },

    { phase: "mp",
      days: [D("Recovery jog", 5, "Recovery"), D("VO2max: 5x1000m @ 10K-5K effort", 7, "VO2max"),
             D("Easy aerobic", 6, "Easy"), D("4mi @ Marathon Pace", 9, "MP"),
             D("Recovery + Strength (Power phase begins)", 5, "Recovery"), D("Progression long run - last 3mi toward MP", 14, "MP"),
             D("Recovery jog", 4, "Recovery")],
      mental: "Marathon pace becomes familiar, not fast.",
      purpose: "Marathon pace enters the long run for the first time - the centerpiece of this phase.",
      fueling: "Practice the full 60-90g carbs/hr target now that MP miles are in the mix.",
      heat: "Conditions should start easing by late September - effort still the tiebreaker on humid days.",
      strength: "Power/Economy phase begins: 5-6 reps, controlled tempo, low-amplitude plyo only if pain-free." },

    { phase: "mp",
      days: [D("Recovery jog", 5, "Recovery"), D("Cruise intervals: 6x5min @ threshold", 8, "Cruise"),
             D("Easy aerobic", 6, "Easy"), D("5mi @ Marathon Pace", 9, "MP"),
             D("Recovery + Strength", 5, "Recovery"), D("Fast-finish long run - last 3mi hard", 16, "Fast finish"),
             D("Recovery jog", 4, "Recovery")],
      mental: "Confidence in the tired miles - notice how MP feels in mile 12, not just mile 2.",
      purpose: "Longest long run yet; fast-finish trains fast-twitch recruitment under aerobic fatigue.",
      fueling: "Treat the long run as a dress rehearsal: race shoes, race breakfast, race gels.",
      heat: "Fall conditions arriving - paces may start coming more easily at the same effort.",
      strength: "Power/Economy phase continues." },

    { phase: "mp",
      days: [D("Recovery jog", 5, "Recovery"), D("Mile repeats: 6x1mi @ Threshold", 8, "Threshold"),
             D("Easy aerobic", 5, "Easy"), D("5mi @ Marathon Pace, fueling practice", 10, "MP"),
             D("Recovery + Strength", 4, "Recovery"), D("19mi w/ 7-8mi continuous Marathon Pace, full fueling rehearsal", 19, "MP"),
             D("Recovery jog", 3, "Recovery")],
      mental: "Practice race day exactly - nothing new on race morning you haven't rehearsed here.",
      purpose: "Final full-volume build week before the half marathon; MP and threshold now sit side by side comfortably.",
      fueling: "Last full fueling rehearsal before the half marathon - lock in what's working.",
      heat: "Should feel noticeably cooler - a good sign of both season and fitness.",
      strength: "Power/Economy phase, final full week before the half-marathon taper." },

    { phase: "mp",
      days: [D("Recovery jog", 4, "Recovery"), D("Easy + strides", 3, "Easy"),
             D("Easy aerobic", 4, "Easy"), D("Easy aerobic", 6, "Easy"),
             D("Recovery + light Strength", 3, "Recovery"), D("Shakeout jog", 2, "Recovery"),
             D("RACE: Half Marathon Tune-Up (Sun Oct 11) + warm-up/cooldown", 15, "Race", true)],
      mental: "The half marathon is a checkpoint, not the goal - run it hard, then let the data speak.",
      purpose: "The single most valuable fitness checkpoint of the cycle - race it at genuine effort.",
      fueling: "Full race-day simulation: gear, breakfast, warm-up, in-race fueling exactly as planned for Nov 8.",
      heat: "Early October should be comfortable - a good early sign for marathon-day conditions.",
      strength: "Race-week reduction - light activation only.",
      race: { name: "Half Marathon Tune-Up", date: "Sun, Oct 11, 2026" },
      checkpoint: "Checkpoint #3 (post-half): Recalculate marathon-pace target directly from this result - the best predictor available this cycle." },

    { phase: "peak",
      days: [D("Recovery jog", 5, "Recovery"), D("Progression tempo - steady into threshold", 8, "Threshold"),
             D("Easy aerobic", 3, "Easy"), D("6mi @ Marathon Pace", 10, "MP"),
             D("Recovery + Strength", 4, "Recovery"), D("Broken MP long run: 3x3mi @ MP, short jog recovery", 17, "MP"),
             D("Recovery jog", 1, "Recovery")],
      mental: "Simulate, don't panic - this is the dress rehearsal, not the performance.",
      purpose: "A smoothing/step-down week after the half marathon before the true peak - protects tissue from stacking two max weeks back to back.",
      fueling: "Exact race-day fueling plan, tested at exact race effort, in exact shoes and kit.",
      heat: "Mid-October in Alabama is typically ideal training weather.",
      strength: "Power/Economy phase, reduced volume this week to match the running step-down." },

    { phase: "peak",
      days: [D("Recovery jog", 6, "Recovery"), D("Short MP-specific reps: 6x1mi @ MP/Threshold blend", 8, "MP"),
             D("Easy aerobic", 7, "Easy"), D("6mi @ Marathon Pace, full race-day fueling test", 10, "MP"),
             D("Recovery + Strength", 5, "Recovery"), D("PEAK: 20-mile long run w/ 10-12mi continuous Marathon Pace", 20, "MP", false),
             D("Recovery jog", 5, "Recovery")],
      mental: "Peak week - trust the work. Everything from here is about arriving healthy, not doing more.",
      purpose: "The single biggest week of the cycle. 10-12 miles at marathon pace inside a 20-miler is the exact stimulus that turns a 3:09 predictor into a 3:05 finisher.",
      fueling: "Final full rehearsal - whatever works here is exactly what you do Nov 8.",
      heat: "Conditions should be excellent - no heat adjustments needed most days.",
      strength: "Maintenance phase begins - minimal volume, nothing new introduced.",
      checkpoint: "Checkpoint #4: How did the marathon-pace segment feel in the final third of the 20-miler? This sets your final race-pace confidence." },

    { phase: "taper",
      days: [D("Recovery jog", 4, "Recovery"), D("3x1mi @ Marathon Pace (sharpen, not tire)", 6, "MP"),
             D("Easy aerobic", 5, "Easy"), D("3mi @ Marathon Pace", 7, "MP"),
             D("Recovery + light Strength", 3, "Recovery"), D("Long run w/ 4mi @ Marathon Pace", 12, "MP"),
             D("Recovery jog", 3, "Recovery")],
      mental: "Less is more - the fitness is already banked. This week protects it.",
      purpose: "Volume drops meaningfully; small sharp intensity touches keep race-pace feel alive.",
      fueling: "Begin thinking about race-week carb intake - nothing drastic yet, just attentive.",
      heat: "Cool, stable conditions expected - a good final data point for race-day pacing.",
      strength: "Maintenance - one short activation session, minimal volume." },

    { phase: "taper",
      days: [D("Recovery jog", 3, "Recovery"), D("Easy + strides", 4, "Easy"),
             D("Easy shakeout", 3, "Easy"), D("3x1mi @ Marathon Pace, then rest starts", 4, "MP"),
             D("Easy + light strides, gear check", 2, "Easy"), D("Shakeout jog, begin carb-load", 2, "Recovery"),
             D("RACE DAY: Indianapolis Monumental Marathon - Goal 3:05:00", 26.2, "Race", true)],
      mental: "You've earned this line. Not hoping for 3:05 - believing it, because you did the work to prove it.",
      purpose: "Arrive rested, confident, and fueled. Every hard mile that matters has already been run.",
      fueling: "Standard race-morning routine, exactly as rehearsed in Weeks 8, 12, and 14. Nothing new on race day.",
      heat: "Early-November race morning should run cool - dress in layers you can shed.",
      strength: "None this week - full rest for the legs.",
      race: { name: "Indianapolis Monumental Marathon", date: "Sun, Nov 8, 2026" } },
  ];
