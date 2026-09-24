/* ==========================================
   Southbound Course Events

   Single source of truth for grad-school course dates
   (ED 450/550, MATH 501) — used by planner.html to render
   the calendar and by the Dashboard's AI Coach to surface
   upcoming deadlines. Every date here was verified against
   each syllabus's own day-of-week statements for Fall 2026
   before being added.

   Month is 0-indexed (0=Jan...11=Dec); months 7-11 fall in
   2026, months 0-6 in 2027, matching the school year the
   Planner page displays.
========================================== */

export const COURSE_EVENTS = {

    7:{ // August
        18:[{c:"ed550",t:"ED550: No Class (Intro Week)"}],
        24:[{c:"ed550",t:"ED550: Syllabus Quiz + Intro Due"}],
        25:[
            {c:"ed550",t:"ED550: Class 5\u20138pm"},
            {c:"deadline",t:"MATH501: Drop Deadline (no W)"}
        ],
        31:[{c:"ed550",t:"ED550: Ch1 Study Guide + How I Teach Chart Due"}]
    },

    8:{ // September
        1:[{c:"ed550",t:"ED550: Class 5\u20138pm"}],
        7:[{c:"ed550",t:"ED550: Ch2 Study Guide Due"}],
        8:[{c:"ed550",t:"ED550: No Class"}],
        14:[{c:"ed550",t:"ED550: Ch3 SG + How I Teach Chart Due"}],
        15:[{c:"ed550",t:"ED550: Class 5\u20138pm"}],
        21:[{c:"ed550",t:"ED550: Ch4 Study Guide Due"}],
        22:[{c:"ed550",t:"ED550: No Class"}],
        28:[{c:"ed550",t:"ED550: Ch5 SG + Lesson Plan #1 Due"}],
        29:[{c:"ed550",t:"ED550: Class 5\u20138pm"}]
    },

    9:{ // October
        5:[{c:"ed550",t:"ED550: Ch6 Study Guide Due"}],
        6:[{c:"ed550",t:"ED550: No Class"}],
        8:[{c:"math501",t:"MATH501: Founder's Day (No Class)"}],
        12:[{c:"ed550",t:"ED550: Ch7 SG + Lesson Plan #2 Due"}],
        13:[{c:"ed550",t:"ED550: Class 5\u20138pm"}],
        16:[{c:"deadline",t:"MATH501: Midterm Exam"}],
        19:[{c:"ed550",t:"ED550: Ch8 Study Guide Due"}],
        20:[{c:"ed550",t:"ED550: Class 5\u20138pm (Teacher Interview)"}],
        26:[
            {c:"ed550",t:"ED550: Ch9 Study Guide Due"},
            {c:"deadline",t:"MATH501: Withdraw Deadline"}
        ],
        27:[
            {c:"ed550",t:"ED550: No Class (Lesson Plan #3)"},
            {c:"deadline",t:"ED550: WITHDRAW DEADLINE"}
        ]
    },

    10:{ // November
        2:[{c:"ed550",t:"ED550: Ch10 SG + Lesson Plan #3 Due"}],
        3:[{c:"ed550",t:"ED550: No Class (3-Day Learning Segment)"}],
        9:[{c:"ed550",t:"ED550: Assessment of Prof. Practices Due"}],
        10:[{c:"ed550",t:"ED550: No Class (3-Day Learning Segment)"}],
        16:[{c:"ed550",t:"ED550: Graduate Presentation Slides Due"}],
        17:[{c:"ed550",t:"ED550: Presentations Begin"}],
        23:[{c:"ed550",t:"ED550: Final 3-Day LS Plans + Day 1 Video Due"}],
        24:[{c:"ed550",t:"ED550: Presentations"}]
    },

    11:{ // December
        1:[{c:"ed550",t:"ED550: Presentations (No Final Exam)"}],
        4:[
            {c:"ed550",t:"ED550: Disposition Conference Due"},
            {c:"math501",t:"MATH501: Last Day of Term"}
        ],
        9:[{c:"deadline",t:"MATH501: Final Exam"}]
    }

};

function yearForMonth(month){

    return month >= 6 ? 2026 : 2027;

}

// Returns course events within `daysAhead` days from today (inclusive),
// soonest first, each annotated with its real Date and how many days
// away it is. Used by the Dashboard's AI Coach to surface what's
// actually coming up without duplicating the calendar data.
export function getUpcomingCourseEvents(daysAhead = 10){

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const results = [];

    Object.keys(COURSE_EVENTS).forEach(monthKey => {

        const month = Number(monthKey);

        const year = yearForMonth(month);

        Object.keys(COURSE_EVENTS[month]).forEach(dayKey => {

            const day = Number(dayKey);

            const date = new Date(year, month, day);

            date.setHours(0, 0, 0, 0);

            const daysAway = Math.round((date - today) / 86400000);

            if (daysAway >= 0 && daysAway <= daysAhead) {

                COURSE_EVENTS[month][day].forEach(ev => {

                    results.push({

                        date,
                        daysAway,
                        category: ev.c,
                        label: ev.t

                    });

                });

            }

        });

    });

    results.sort((a, b) => a.date - b.date);

    return results;

}
