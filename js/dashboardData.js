// ==========================================
// EddieOS Data Store
// ==========================================

export const dashboardData = {

    // ======================================
    // User Profile
    // ======================================

    profile: {

        firstName: "Eddie",

        lastName: "Steers",

        homeLocation: "Pelham, AL",

        timezone: "America/Chicago"

    },

    // ======================================
    // Marathon
    // ======================================

    marathon: {

        race: "Indianapolis Monumental Marathon",

        raceDate: "2026-11-08",

        goalTime: "3:05:00",

        goalPace: "7:03",

        currentWeeklyMileage: 44,

        targetWeeklyMileage: 55,

        longestRun: 18,

        nextRace: "Indianapolis"

    },

    // ======================================
    // Health
    // ======================================

    health: {

        readiness: 91,

        recovery: "Good",

        fatigue: "Low",

        sleepGoal: 8,

        hydrationGoal: 90,

        restingHR: 49,

        weight: null

    },

    // ======================================
    // Training
    // ======================================

    training: {

        streak: 19,

        workouts: [

            {
                id: 1,
                day: "Sunday",
                workout: "Rest Day",
                miles: 0,
                type: "Recovery",
                completed: false
            },

            {
                id: 2,
                day: "Monday",
                workout: "Easy Run",
                miles: 5,
                type: "Zone 2",
                completed: false
            },

            {
                id: 3,
                day: "Tuesday",
                workout: "Intervals",
                miles: 8,
                type: "Speed",
                completed: false
            },

            {
                id: 4,
                day: "Wednesday",
                workout: "Recovery Run",
                miles: 4,
                type: "Recovery",
                completed: false
            },

            {
                id: 5,
                day: "Thursday",
                workout: "Tempo Run",
                miles: 7,
                type: "Threshold",
                completed: false
            },

            {
                id: 6,
                day: "Friday",
                workout: "Easy Run",
                miles: 5,
                type: "Zone 2",
                completed: false
            },

            {
                id: 7,
                day: "Saturday",
                workout: "Long Run",
                miles: 18,
                type: "Long Run",
                completed: false
            }

        ]

    },

    // ======================================
    // Shoe Rotation
    // ======================================

    shoes: [

        {
            id: 1,
            name: "Saucony Endorphin Speed 5",
            type: "Daily Trainer",
            miles: 248,
            maxMiles: 500,
            active: true
        },

        {
            id: 2,
            name: "Race Shoe",
            type: "Marathon",
            miles: 0,
            maxMiles: 250,
            active: false
        }

    ],

    // ======================================
    // Habits
    // ======================================

    habits: [

        {
            name: "Drink Water",
            goal: "90 oz",
            completed: false
        },

        {
            name: "Stretch",
            goal: "15 min",
            completed: false
        },

        {
            name: "Foam Roll",
            goal: "10 min",
            completed: false
        },

        {
            name: "Sleep 8 Hours",
            goal: "8 hrs",
            completed: false
        }

    ],

    // ======================================
    // Planner
    // ======================================

    planner: {

        today: [],

        upcoming: []

    },

    // ======================================
    // AI Coach
    // ======================================

    coach: {

        status: "ONLINE",

        brief: [

            "✅ Great recovery after yesterday's workout.",

            "🏃 Stay in Zone 2 today.",

            "💧 Drink at least 90 oz of water.",

            "🥗 Increase carbs tonight.",

            "😴 Target 8 hours of sleep."

        ]

    }

};
