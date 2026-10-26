/* ==========================================
   Southbound — home page hero video and week story

   The hero video starts only for visitors who haven't asked for less
   motion or reduced data, and pauses while it's off screen. A button
   pauses it for good. The story steps sit stacked in the page; with
   motion allowed they become one full-width sticky panel whose example
   week fills in as the visitor scrolls (js/homeStoryModel.js).
========================================== */

import { storyState, storyProgress } from "./homeStoryModel.js";

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const saveData = navigator.connection?.saveData === true;

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

// ---- Hero video ----
const video = document.getElementById("sbhVideo");
const motionBtn = document.getElementById("sbhMotion");
if (video && !reduce && !saveData) {
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    let userPaused = false, onScreen = true;
    const setBtn = () => {
        if (!motionBtn) return;
        motionBtn.hidden = false;
        motionBtn.setAttribute("aria-label", userPaused ? "Play the background video" : "Pause the background video");
        motionBtn.innerHTML = `<span data-icon="${userPaused ? "play" : "pause"}"></span>`;
        import("./icons.js").then(m => m.hydrate());
    };
    const sync = () => {
        if (userPaused || !onScreen) video.pause();
        else video.play().catch(() => {});
    };
    video.preload = "auto";
    video.addEventListener("playing", setBtn, { once: true });
    motionBtn?.addEventListener("click", () => { userPaused = !userPaused; setBtn(); sync(); });
    if ("IntersectionObserver" in window) {
        new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(video);
    } else {
        sync();
    }
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
