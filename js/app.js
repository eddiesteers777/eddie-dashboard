// ==========================================
// EddieOS AI Coach v1.0
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    const hour = new Date().getHours();

    let greeting = "Good evening";

    if(hour < 12){

        greeting = "Good morning";

    }else if(hour < 17){

        greeting = "Good afternoon";

    }

    const intro = document.querySelector(".coach-intro");

    if(intro){

        intro.textContent = `${greeting}, Eddie.`;

    }

});
