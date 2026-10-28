/* ==========================================
   Southbound — home page week story

   The hero is a still photo (the old soccer clip is still in videos/hero).
   The story steps sit stacked in the page; with
   motion allowed they become one full-width sticky panel whose example
   week fills in as the visitor scrolls (js/homeStoryModel.js).
========================================== */

import { storyState, storyProgress } from "./homeStoryModel.js";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const saveData = navigator.connection?.saveData === true;
// Visitors who skip the scroll experience see the photo straight away, with no black opening.
if (saveData) document.querySelectorAll(".sbh-leader, .sbh-film").forEach((el) => el.remove());

// The hero and the sticky story sit under the public top bar, which loads after this script.
let barH = 0;
const measureBar = () => {
    const h = document.querySelector(".pub-navbar")?.offsetHeight || 0;
    if (h && h !== barH) { barH = h; document.documentElement.style.setProperty("--sbh-bar", h + "px"); }
};
measureBar();
document.addEventListener("DOMContentLoaded", measureBar);
window.addEventListener("load", measureBar);
window.addEventListener("resize", measureBar);
if ("MutationObserver" in window) {
    const host = document.getElementById("publicHeader");
    if (host) new MutationObserver(measureBar).observe(host, { childList: true });
}

// ---- "How a week gets made" ----
const story = document.getElementById("sbhStory");
if (story && !reduce) {
    const stick = story.querySelector(".sbh-stick");
    const steps = [...story.querySelectorAll(".sbh-step")];
    const bars = [...story.querySelectorAll(".sbh-bar > div")];
    story.classList.add("is-live");
    let last = 0, queued = false;
    const update = () => {
        queued = false;
        const r = story.getBoundingClientRect();
        const { step, fills } = storyState(storyProgress(r.top, r.height, window.innerHeight), steps.length);
        bars.forEach((b, i) => {
            b.firstElementChild.style.width = fills[i] + "%";
            b.className = i < step - 1 ? "is-done" : i === step - 1 ? "is-cur" : "";
        });
        if (step === last) return;
        last = step;
        stick.dataset.s = String(step);
        steps.forEach((s, i) => s.classList.toggle("is-on", i === step - 1));
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    update();
}
