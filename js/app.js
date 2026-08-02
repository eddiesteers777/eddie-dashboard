console.log("APP VERSION 2");
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

    getCompletionPercent

} from "./marathonData.js";

document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // Load Dashboard Data
    // ==========================================

    let dashboardData = localData;

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

    let greeting = "Good evening";

    if (hour < 12) {

        greeting = "Good morning";

    } else if (hour < 17) {

        greeting = "Good afternoon";

    }

    const coachHeading = document.querySelector(".coach-header h2");

    if (coachHeading) {

        coachHeading.textContent = `${greeting}, ${dashboardData.profile.firstName}`;

    }

    // ==========================================
    // Countdown
    // ==========================================

const countdown = document.getElementById("raceCountdown");

if (countdown) {

    countdown.textContent =
        `${getRaceCountdown()} Days`;

}
// ==========================================
// Goal Time
// ==========================================

const goalTime = document.getElementById("goalTime");

if (goalTime) {

    goalTime.textContent = "3:10:00";

}
// ==========================================
// Weekly Mileage
// ==========================================

const weeklyMileage = document.getElementById("weeklyMileage");

if (weeklyMileage) {

    weeklyMileage.textContent =
        `${getAdjustedWeekMileage(getCurrentWeek())} mi`;

}
// ==========================================
// Training Phase
// ==========================================

const trainingPhase = document.getElementById("trainingPhase");

if (trainingPhase) {

    trainingPhase.textContent =
        getTrainingPhase();

}

    // ==========================================
    // Readiness
    // ==========================================

    const readiness = document.getElementById("readiness");

    if (readiness) {

        readiness.textContent =
            dashboardData.health.readiness + "%";

    }

    // ==========================================
    // Streak
    // ==========================================

    const streak = document.getElementById("streak");

    if (streak) {

        streak.textContent =
            dashboardData.training.streak;

    }

// ==========================================
// Today's Workout
// ==========================================

const upcomingWorkouts = getUpcomingWorkouts();

console.log(upcomingWorkouts);

const workoutElement = document.getElementById("todayWorkout");

if (workoutElement && upcomingWorkouts.length > 0) {

    const workout = upcomingWorkouts[0];

    workoutElement.textContent =
        `${workout.session} • ${workout.miles} mi`;

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

    const todayWorkout = getUpcomingWorkouts()[0];

    notes.push(

        `Current Training Phase: ${getTrainingPhase()}.`

    );

    if (todayWorkout) {

        notes.push(

            `Today's workout: ${todayWorkout.session} (${todayWorkout.miles} mi).`

        );

    }

    const longRun = getNextLongRun();

    if (longRun) {

        notes.push(

            `Next long run: ${longRun.miles} miles during Week ${longRun.week}.`

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

    getUpcomingWorkouts()

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
