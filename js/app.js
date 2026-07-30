// ==========================================
// EddieOS Dashboard
// ==========================================

import { dashboardData as localData } from "./dashboardData.js";
import { loadDashboard } from "./firestore.js";

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

    const countdown = document.getElementById("countdown");

    if (countdown) {

        const today = new Date();

        const raceDate = new Date(dashboardData.marathon.raceDate);

        const difference = raceDate - today;

        const daysRemaining = Math.ceil(
            difference / (1000 * 60 * 60 * 24)
        );

        countdown.textContent = daysRemaining;

    }

    // ==========================================
    // Weekly Mileage
    // ==========================================

    const weeklyMileage = document.getElementById("weeklyMileage");

    if (weeklyMileage) {

        weeklyMileage.textContent =
            dashboardData.marathon.currentWeeklyMileage;

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

    const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
    ];

    const todayName = days[new Date().getDay()];

    const todayWorkout = dashboardData.training.workouts.find(
        workout => workout.day === todayName
    );

    const workoutElement = document.getElementById("todayWorkout");

    if (workoutElement && todayWorkout) {

        workoutElement.textContent =
            `${todayWorkout.workout} • ${todayWorkout.miles} Miles`;

    }

    // ==========================================
    // AI Coach Brief
    // ==========================================

    const coachBrief = document.getElementById("coachBrief");

    if (coachBrief) {

        coachBrief.innerHTML = "";

        dashboardData.coach.brief.forEach(item => {

            const li = document.createElement("li");

            li.textContent = item;

            coachBrief.appendChild(li);

        });

    }

});
