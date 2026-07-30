// ==========================================
// EddieOS Dashboard
// ==========================================

import { dashboardData } from "./dashboardData.js";

document.addEventListener("DOMContentLoaded", () => {

    // --------------------------
    // Greeting
    // --------------------------

    const hour = new Date().getHours();

    let greeting = "Good evening";

    if (hour < 12) {

        greeting = "Good morning";

    } else if (hour < 17) {

        greeting = "Good afternoon";

    }

    // AI Coach Greeting
    const coachHeading = document.querySelector(".coach-header h2");

    if (coachHeading) {

        coachHeading.textContent = `${greeting}, Eddie`;

    }

    // --------------------------
    // Dashboard Stats
    // --------------------------

    const countdown = document.getElementById("countdown");

    if (countdown) {

        countdown.textContent = dashboardData.marathon.countdown;

    }

    const weeklyMileage = document.getElementById("weeklyMileage");

    if (weeklyMileage) {

        weeklyMileage.textContent = dashboardData.marathon.weeklyMileage;

    }

    const readiness = document.getElementById("readiness");

    if (readiness) {

        readiness.textContent = dashboardData.health.readiness + "%";

    }

    const streak = document.getElementById("streak");

    if (streak) {

        streak.textContent = dashboardData.training.streak;

    }

    // --------------------------
    // AI Coach Brief
    // --------------------------

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
