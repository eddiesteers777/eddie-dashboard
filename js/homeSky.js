/* ==========================================
   Southbound — home page scrolling backdrop (browser side)

   Adds a fixed backdrop behind the page and moves it with the scroll
   (js/homeSkyModel.js). Skipped for reduced motion, reduced data and
   very old browsers: the page stays the plain forest green. Only
   opacity and transform change per frame, nothing repaints.
========================================== */

import { skyState } from "./homeSkyModel.js";

const mq = (q) => window.matchMedia(q).matches;
if (!mq("(prefers-reduced-motion: reduce)") && navigator.connection?.saveData !== true) {
    const root = document.documentElement;
    const hero = document.querySelector(".sbh-hero");
    const story = document.getElementById("sbhStory");
    const close = document.querySelector(".sbh-close");
    const video = document.getElementById("sbhVideo");
    const headline = document.getElementById("sbhHeadline");
    const rises = [...document.querySelectorAll("[data-rise]")];

    if (hero && story && close) {
        const sky = document.createElement("div");
        sky.className = "sbh-sky";
        sky.setAttribute("aria-hidden", "true");
        sky.innerHTML = '<i class="sbh-sky-dusk"></i><i class="sbh-sky-night"></i><i class="sbh-sky-dawn"></i><div class="sbh-sun"></div>';
        document.body.prepend(sky);
        const [dusk, night, dawn] = sky.querySelectorAll("i");
        const sun = sky.querySelector(".sbh-sun");
        root.classList.add("sbh-sky-on");

        // The route: a sand line down the left edge, from the hero to the close, drawn as the visitor scrolls.
        const main = document.getElementById("main");
        const NS = "http://www.w3.org/2000/svg";
        const route = document.createElementNS(NS, "svg");
        route.setAttribute("class", "sbh-route");
        route.setAttribute("aria-hidden", "true");
        route.innerHTML = '<path class="sbh-route-base"/><path class="sbh-route-draw"/><g class="sbh-route-tip"><circle class="sbh-route-halo" r="13"/><circle r="5.5"/><text x="18" y="4"></text></g>';
        main.prepend(route);
        const [rBase, rDraw] = route.querySelectorAll("path");
        const tip = route.querySelector(".sbh-route-tip");
        const tipText = tip.querySelector("text");
        let rLen = 0, rTop = 0;
        const layoutRoute = () => {
            const mr = main.getBoundingClientRect(), y = window.scrollY;
            rTop = hero.getBoundingClientRect().bottom + y - (mr.top + y);
            const bottom = close.getBoundingClientRect().top + y - (mr.top + y);
            const H = Math.max(200, bottom - rTop), W = mr.width;
            const phone = W <= 760;
            const x0 = phone ? 8 : 30, wob = phone ? 5 : 16;
            route.setAttribute("width", W); route.setAttribute("height", H);
            route.setAttribute("viewBox", `0 0 ${W} ${H}`);
            route.style.top = rTop + "px";
            const n = Math.max(3, Math.round(H / 520));
            let d = `M${x0} 0`;
            for (let i = 1; i <= n; i++) {
                const x = x0 + (i % 2 ? wob : -wob), y1 = (H * i) / n, y0 = (H * (i - 1)) / n, m = (y1 - y0) / 2;
                d += ` C${i % 2 ? x0 - wob : x0 + wob} ${y0 + m} ${x} ${y1 - m} ${x} ${y1}`;
            }
            rBase.setAttribute("d", d); rDraw.setAttribute("d", d);
            rLen = rDraw.getTotalLength();
            rDraw.style.strokeDasharray = rLen;
        };

        let tops = { storyTop: 0, storyBottom: 0, closeTop: 0, heroH: 1 };
        const measure = () => {
            const y = window.scrollY;
            tops = {
                heroH: hero.offsetHeight,
                storyTop: story.getBoundingClientRect().top + y,
                storyBottom: story.getBoundingClientRect().bottom + y,
                closeTop: close.getBoundingClientRect().top + y,
            };
        };

        let queued = false;
        const update = () => {
            queued = false;
            const vh = window.innerHeight, y = window.scrollY;
            const s = skyState({ scrollY: y, vh, ...tops });
            dusk.style.opacity = s.dusk;
            night.style.opacity = s.night;
            dawn.style.opacity = s.dawn;
            const sunY = (0.22 + s.set * 1.0 - s.rise * 0.75) * vh;
            sun.style.transform = `translate3d(${(vh * 0.12 * (1 - s.set)).toFixed(1)}px,${sunY.toFixed(1)}px,0)`;
            sun.style.opacity = (1 - s.set * 0.9 + s.rise * 0.8).toFixed(3);
            if (video && y < tops.heroH * 1.2) video.style.transform = `scale(${(1 + s.hero * 0.12).toFixed(4)})`;
            if (headline && y < tops.heroH * 1.2) headline.style.transform = `translate3d(0,${(s.hero * -60).toFixed(1)}px,0)`;
            if (rLen) {
                const done = Math.min(1, Math.max(0, (y + vh * 0.6 - (tops.heroH * 0.6 + 0)) / Math.max(1, tops.closeTop - tops.heroH * 0.6)));
                rDraw.style.strokeDashoffset = rLen * (1 - done);
                const pt = rDraw.getPointAtLength(rLen * done);
                tip.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
                tip.style.opacity = done > 0.005 ? 1 : 0;
                tipText.textContent = (done * 13.1).toFixed(1) + " MI";
            }
            for (const el of rises) {
                const t = Math.min(1, Math.max(0, (vh - el.getBoundingClientRect().top) / (vh * 0.55)));
                const e = t * t * (3 - 2 * t);
                el.style.setProperty("--t", e.toFixed(3));
            }
        };
        const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
        const remeasure = () => { measure(); layoutRoute(); queue(); };

        measure(); layoutRoute(); update();
        addEventListener("scroll", queue, { passive: true });
        addEventListener("resize", remeasure);
        addEventListener("load", remeasure);
        document.fonts?.ready.then(remeasure);
        if ("ResizeObserver" in window) new ResizeObserver(remeasure).observe(document.body);
    }
}
