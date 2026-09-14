// ==========================================
// EddieOS Dashboard
// ==========================================

import { dashboardData as localData } from "./dashboardData.js";
import { loadDashboard } from "./firestore.js";

import {

    getRaceCountdown,

    getCurrentWeek,

    getAdjustedWeekMileage,

    getUpcomingWorkouts,

    getTrainingPhase,

    getNextLongRun,

    getCompletionPercent,

    getWeekMileage

} from "./marathonData.js";

document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // Load Dashboard Data
    // ==========================================

    let dashboardData = localData;

    console.log(dashboardData.marathon);

    try {

        const cloudData = await loadDashboard();

        if (cloudData) {

            dashboardData = cloudData;

            console.log("☁️ Loaded dashboard from Firestore.");

        } else {

            console.log("💻 Using local dashboard data.");

        }

    } catch (error) {

        console.error("Firestore Error:", error);

        console.log("💻 Falling back to local dashboard data.");

    }
    // ==========================================
    // Greeting
    // ==========================================

    const hour = new Date().getHours();

    let greeting = "Good Evening";

    if (hour < 12) {

        greeting = "Good Morning";

    } else if (hour < 17) {

        greeting = "Good Afternoon";

    }

    const welcomeHeading = document.getElementById("welcomeHeading");

    if (welcomeHeading) {

        welcomeHeading.innerHTML =

            `${greeting},<br>${dashboardData.profile.firstName}`;

    }

    // ==========================================
    // Hero Card
    // ==========================================

const goalTime = document.getElementById("goalTime");

if (goalTime) {

    // Prefer the user's own saved goal from Settings; fall back to
    // the placeholder default only if they haven't set one yet.
    try {

        const { getUserSettings } = await import("./userSettings.js");

        const settings = getUserSettings();

        goalTime.textContent = settings.goalTime || dashboardData.training.goalTime;

    } catch (error) {

        goalTime.textContent = dashboardData.training.goalTime;

    }

}

    const raceCountdown = document.getElementById("raceCountdown");

    if (raceCountdown) {

        raceCountdown.textContent =

            `${getRaceCountdown()} Days`;

    }

    const weeklyGoal = document.getElementById("weeklyGoal");

    if (weeklyGoal) {

        weeklyGoal.textContent =

            `${getWeekMileage(getCurrentWeek())} mi`;

    }
    // ==========================================
    // Quick Stats
    // ==========================================

    const weeklyMileage = document.getElementById("weeklyMileage");

    if (weeklyMileage) {

        weeklyMileage.textContent =

            `${getAdjustedWeekMileage(getCurrentWeek())} mi`;

    }

    const readiness = document.getElementById("readinessScore");

    if (readiness) {

        readiness.textContent =

            `${dashboardData.health.readiness}%`;

    }

    const streak = document.getElementById("streakDays");

    if (streak) {

        streak.textContent =

            dashboardData.training.streak;

    }

    const nextRace = document.getElementById("nextRace");

    if (nextRace) {

        nextRace.textContent =

            getRaceCountdown();

    }
    // ==========================================
    // Today's Workout
    // (shown as the first Upcoming Training card below)
    // ==========================================

    const upcomingWorkouts = getUpcomingWorkouts();

    // ==========================================
    // AI Coach Stats
    // ==========================================

    const coachWeek = document.getElementById("coachWeek");

    if (coachWeek) {

        coachWeek.textContent =

            `Week ${getCurrentWeek()}`;

    }

    const coachPhase = document.getElementById("coachPhase");

    if (coachPhase) {

        coachPhase.textContent =

            getTrainingPhase();

    }

    const coachCompletion = document.getElementById("coachCompletion");

    if (coachCompletion) {

        coachCompletion.textContent =

            `${getCompletionPercent()}%`;

    }

    const coachLongRun = document.getElementById("coachLongRun");

    const nextLongRun = getNextLongRun();

    if (coachLongRun && nextLongRun) {

        coachLongRun.textContent =

            `${nextLongRun.miles} mi`;

    }
    // ==========================================
    // AI Coach Notes
    // ==========================================

    const coachBrief = document.getElementById("coachBrief");

    if (coachBrief) {

        coachBrief.innerHTML = "";

        // Each note is { text } for a plain line, or { text, href } to
        // render as a link to the page that note is actually about —
        // this brief now pulls from Marathon, Fueling, Cross-Training,
        // and the Planner instead of Marathon alone.
        const notes = [];

        notes.push({

            text: `Current Training Phase: ${getTrainingPhase()}.`

        });

        // ---- Weekly mileage: your goal (Settings) vs this week's plan ----
        try {

            const { getUserSettings } = await import("./userSettings.js");

            const settings = getUserSettings();

            if (settings.weeklyMileage > 0) {

                const planned = getWeekMileage(getCurrentWeek());

                const diff = Math.round((planned - settings.weeklyMileage) * 10) / 10;

                const compareText = diff === 0
                    ? "right on your weekly goal."
                    : diff > 0
                        ? `${diff} mi above your ${settings.weeklyMileage} mi/week goal.`
                        : `${Math.abs(diff)} mi below your ${settings.weeklyMileage} mi/week goal.`;

                notes.push({

                    text: `This week's plan: ${planned} mi \u2014 ${compareText}`,
                    href: "settings.html"

                });

            }

        } catch (error) {

            console.error("Coach brief: weekly mileage comparison failed", error);

        }

        const todayWorkout = upcomingWorkouts.length > 0 ? upcomingWorkouts[0] : null;

        if (todayWorkout) {

            notes.push({

                text: `Today's workout: ${todayWorkout.session} (${todayWorkout.miles} mi).`

            });

            // ---- Fueling status for today's workout ----
            try {

                const plans = JSON.parse(localStorage.getItem("fueling-plans") || "[]");

                const plan = plans.find(p =>
                    p.marathonRef &&
                    p.marathonRef.week === todayWorkout.week &&
                    p.marathonRef.dayKey === todayWorkout.day
                );

                if (plan) {

                    notes.push({

                        text: `\u26fd Fueling plan ready: ${plan.carbTotal}g carbs, ${plan.fluidTotal}oz fluid.`,
                        href: "fueling.html"

                    });

                } else if (Number(todayWorkout.miles) >= 8) {

                    // Only nudge for a plan on runs long enough to need one.
                    notes.push({

                        text: `\u26fd No fueling plan yet for today's ${todayWorkout.miles}-mile run \u2014 build one now.`,
                        href: `fueling.html?week=${todayWorkout.week}&day=${todayWorkout.day}`

                    });

                }

            } catch (error) {

                console.error("Coach brief: fueling lookup failed", error);

            }

        }

        if (nextLongRun) {

            notes.push({

                text: `Next long run: ${nextLongRun.miles} miles during Week ${nextLongRun.week}.`

            });

        }

        // ---- Cross-training coverage this week ----
        try {

            const overrides = JSON.parse(localStorage.getItem("training-overrides") || "{}");

            const week = getCurrentWeek();

            const weekOverrides = overrides[week] || {};

            const daysCovered = Object.values(weekOverrides)
                .filter(day => Array.isArray(day.crossTraining) && day.crossTraining.length > 0)
                .length;

            if (daysCovered > 0) {

                notes.push({

                    text: `\ud83d\udeb4 Cross-training: ${daysCovered} day${daysCovered === 1 ? "" : "s"} covered this week.`,
                    href: "cross-training.html"

                });

            }

        } catch (error) {

            console.error("Coach brief: cross-training lookup failed", error);

        }

        // ---- Nearest upcoming course deadline (Planner), if any ----
        try {

            const { getUpcomingCourseEvents } = await import("./courseEvents.js");

            const upcomingDeadlines = getUpcomingCourseEvents(10)
                .filter(ev => ev.category === "deadline");

            if (upcomingDeadlines.length > 0) {

                const next = upcomingDeadlines[0];

                const whenText =
                    next.daysAway === 0 ? "today" :
                    next.daysAway === 1 ? "tomorrow" :
                    `in ${next.daysAway} days`;

                notes.push({

                    text: `\ud83d\udcda ${next.label} \u2014 ${whenText}.`,
                    href: "planner.html"

                });

            }

        } catch (error) {

            console.error("Coach brief: course events unavailable", error);

        }

        const completion = getCompletionPercent();

        if (completion >= 90) {

            notes.push({

                text: "Excellent consistency. Stay healthy and trust the training."

            });

        } else if (completion >= 70) {

            notes.push({

                text: "You're on track. Continue prioritizing your quality workouts."

            });

        } else {

            notes.push({

                text: "Focus on consistency. Completing every scheduled workout is the biggest priority."

            });

        }

        notes.forEach(note => {

            const li = document.createElement("li");

            if (note.href) {

                const a = document.createElement("a");

                a.href = note.href;
                a.textContent = note.text;

                li.appendChild(a);

            } else {

                li.textContent = note.text;

            }

            coachBrief.appendChild(li);

        });

    }
    // ==========================================
    // Upcoming Training
    // ==========================================

    const upcomingTraining = document.getElementById("upcomingTraining");

    if (upcomingTraining) {

        upcomingTraining.innerHTML = "";

        upcomingWorkouts

            .slice(0, 4)

            .forEach(workout => {

                upcomingTraining.innerHTML += `

                    <div class="training-card">

                        <span>

                            Week ${workout.week} • ${workout.day}

                        </span>

                        <h3>

                            ${workout.session}

                        </h3>

                        <p>

                            ${workout.miles} miles${workout.pace ? ` • ${workout.pace}` : ""}

                        </p>

                    </div>

                `;

            });

    }

});
