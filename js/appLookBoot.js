// The app's look from the first frame (Eddie, 2026-11-25: Southbound should feel as smooth as Anchor Board).
// A plain script in each app page's <head>, beside a static link to css/skin.css, so the page
// paints in the fog-blue look straight away. Before, js/loadHeader.js loaded js/appLook.js once the page was running,
// so every page showed the plain dark colours first and then swapped to the mist ground. Same idea as Anchor Board's
// js/scheme.js. This only adds html.al-on and, once the body exists, the still background layer (.al-bg);
// js/appLook.js still starts the dark-panel tagging. The Playbook keeps its own look (html.pb-app).
(function () {
    var h = document.documentElement;
    if (h.classList.contains("pb-app")) return;
    h.classList.add("al-on");
    function layer() {
        if (!document.body || document.querySelector("body>.al-bg")) return;
        var bg = document.createElement("div");
        bg.className = "al-bg";
        bg.setAttribute("aria-hidden", "true");
        document.body.prepend(bg);
    }
    if (document.body) layer(); else document.addEventListener("DOMContentLoaded", layer);
})();
