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
