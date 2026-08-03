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

    getWeeklyGoal

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

    goalTime.textContent =
        dashboardData.training.goalTime;

}

    const raceCountdown = document.getElementById("raceCountdown");

    if (raceCountdown) {

        raceCountdown.textContent =

            `${getRaceCountdown()} Days`;

    }

    const weeklyGoal = document.getElementById("weeklyGoal");

    if (weeklyGoal) {

        weeklyGoal.textContent =

            `${getWeeklyGoal()} mi`;

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
    // ==========================================

    const upcomingWorkouts = getUpcomingWorkouts();

    const todayWorkout = document.getElementById("todayWorkout");

    if (todayWorkout && upcomingWorkouts.length > 0) {

        todayWorkout.textContent =

            `${upcomingWorkouts[0].session} • ${upcomingWorkouts[0].miles} mi`;

    }

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

        const notes = [];

        notes.push(

            `Current Training Phase: ${getTrainingPhase()}.`

        );

        if (upcomingWorkouts.length > 0) {

            notes.push(

                `Today's workout: ${upcomingWorkouts[0].session} (${upcomingWorkouts[0].miles} mi).`

            );

        }

        if (nextLongRun) {

            notes.push(

                `Next long run: ${nextLongRun.miles} miles during Week ${nextLongRun.week}.`

            );

        }

        const completion = getCompletionPercent();

        if (completion >= 90) {

            notes.push(

                "Excellent consistency. Stay healthy and trust the training."

            );

        } else if (completion >= 70) {

            notes.push(

                "You're on track. Continue prioritizing your quality workouts."

            );

        } else {

            notes.push(

                "Focus on consistency. Completing every scheduled workout is the biggest priority."

            );

        }

        notes.forEach(note => {

            const li = document.createElement("li");

            li.textContent = note;

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
