/* ==========================================
   Southbound — home page scrolling backdrop (browser side)

   Adds a fixed backdrop behind the page and moves it with the scroll
   (js/homeSkyModel.js). Skipped for reduced motion, reduced data and
   very old browsers: the page stays the plain forest green. Only
   opacity and transform change per frame, nothing repaints.
========================================== */

import { skyState, runProgress, chapterIndex, sidewaysProgress, phoneFeed, phoneFade, CHAPTERS, RACE_MILES } from "./homeSkyModel.js";

const mq = (q) => window.matchMedia(q).matches;
if (!mq("(prefers-reduced-motion: reduce)") && navigator.connection?.saveData !== true) {
    const root = document.documentElement;
    const hero = document.querySelector(".sbh-hero");
    const story = document.getElementById("sbhStory");
    const close = document.querySelector(".sbh-close");
    const video = document.getElementById("sbhVideo");
    const headline = document.getElementById("sbhHeadline");
    const rises = [...document.querySelectorAll("[data-rise]")];
    const svc = document.querySelector(".sbh-svc");
    const cards = svc?.querySelector(".sbh-cards");
    const stick = story?.querySelector(".sbh-stick");

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

        // The headline arrives a letter at a time; the intro words light up as you reach them.
        const splitLetters = (el) => {
            const label = el.textContent.replace(/\s+/g, " ").trim();
            let i = 0;
            const walk = (node) => [...node.childNodes].forEach((n) => {
                if (n.nodeType === 3) {
                    const f = document.createDocumentFragment();
                    for (const c of n.textContent) {
                        if (c === " ") { f.append(" "); continue; }
                        const sp = document.createElement("span");
                        sp.className = "sbh-ch"; sp.setAttribute("aria-hidden", "true");
                        sp.style.setProperty("--i", i++); sp.textContent = c; f.append(sp);
                    }
                    n.replaceWith(f);
                } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
            });
            el.setAttribute("aria-label", label); walk(el);
        };
        if (headline) splitLetters(headline);
        const bigEl = document.querySelector(".sbh-big");
        const words = [];
        if (bigEl) {
            bigEl.setAttribute("aria-label", bigEl.textContent.replace(/\s+/g, " ").trim());
            const walk = (node) => [...node.childNodes].forEach((n) => {
                if (n.nodeType === 3) {
                    const f = document.createDocumentFragment();
                    n.textContent.split(/(\s+)/).forEach((t) => {
                        if (!t) return;
                        if (/^\s+$/.test(t)) { f.append(" "); return; }
                        const sp = document.createElement("span");
                        sp.className = "sbh-w"; sp.setAttribute("aria-hidden", "true"); sp.textContent = t; f.append(sp); words.push(sp);
                    });
                    n.replaceWith(f);
                } else if (n.nodeType === 1) walk(n);
            });
            walk(bigEl);
        }

        // A big outlined step number behind the story.
        let numeral = null;
        if (stick) { numeral = document.createElement("span"); numeral.className = "sbh-numeral"; numeral.setAttribute("aria-hidden", "true"); numeral.textContent = "1"; stick.prepend(numeral); }

        // The run readout: miles, chapter, a thin bar.
        const hud = document.createElement("div");
        hud.className = "sbh-hud"; hud.setAttribute("aria-hidden", "true");
        hud.innerHTML = '<div class="sbh-hud-mi"><b>0.0</b><small>/ 13.1 MI</small></div><span class="sbh-hud-ch">Start line</span><div class="sbh-hud-bar"><i></i></div>';
        document.body.append(hud);
        const hudMi = hud.querySelector("b"), hudCh = hud.querySelector(".sbh-hud-ch"), hudBar = hud.querySelector("i");

        // The three services slide sideways while the section stays pinned.
        let hz = null, hzMax = 0;
        if (svc && cards) {
            hz = document.createElement("div");
            hz.className = "sbh-hzw";
            svc.before(hz); hz.append(svc);
            svc.classList.add("is-hz");
            cards.addEventListener("focusin", (e) => {
                const card = e.target.closest(".sbh-card");
                if (!card || !hzMax) return;
                const want = Math.min(hzMax, Math.max(0, card.offsetLeft - (window.innerWidth - card.offsetWidth) / 2));
                window.scrollTo({ top: hz.getBoundingClientRect().top + window.scrollY - barH() + want, behavior: "instant" });
            });
        }
        const barH = () => document.querySelector(".pub-navbar")?.offsetHeight || 64;

        // The finish line at the top of the cream close.
        const fin = document.createElement("div");
        fin.className = "sbh-finish"; fin.setAttribute("aria-hidden", "true");
        fin.innerHTML = "<i></i><span>Finish · 13.1 mi · Race day</span>";
        close.prepend(fin);

        // A phone beside the story: the app scrolls through its screens as the week story moves on (wide screens only).
        const ride = document.createElement("div");
        ride.className = "sbh-ride"; ride.setAttribute("aria-hidden", "true");
        ride.innerHTML = '<div class="sbh-phone"><div class="sbh-screen"><div class="sbh-feed">' + `<div class="sbh-fs"><div class="sbh-fh"><b>Apply</b><span>Example</span></div><div class="sbh-ans"><div><span>Goal</span><b>Half marathon</b></div><div><span>Days free</span><b>Mon Tue Thu Sat</b></div><div><span>Longest run</span><b>8 miles</b></div></div><div class="sbh-go2">Send application</div></div>
<div class="sbh-fs"><span class="sbh-mini">Today · Example</span><div class="sbh-hi">Good morning,<br>Maya</div><div class="sbh-r2"><div class="sbh-ring">7</div><div class="sbh-box" style="flex:1"><b>Readiness</b>Good to train. Sleep 7 h.</div></div><div class="sbh-box"><b>Planned · Threshold</b>4 × 1 mi at 10K pace</div><div class="sbh-go2">Start check-in</div></div>
<div class="sbh-fs"><div class="sbh-fh"><b>Your week</b><span>Example</span></div><div><div class="sbh-dy"><span class="sbh-dd">MON</span><span>Easy 5 mi</span><span class="sbh-dt"></span></div><div class="sbh-dy"><span class="sbh-dd">TUE</span><span>Strength A · 40 min</span><span class="sbh-dt"></span></div><div class="sbh-dy"><span class="sbh-dd">THU</span><span>Tempo 6 mi</span><span class="sbh-dt"></span></div><div class="sbh-dy"><span class="sbh-dd">SAT</span><span>Long run 9 mi</span><span class="sbh-dt"></span></div></div><div class="sbh-box"><b>This week</b>19 miles · one strength day</div></div>
<div class="sbh-fs"><div class="sbh-fh"><b>Workout</b><span>Thu</span></div><div class="sbh-hi">Tempo 6 mi</div><div><div class="sbh-st"><b>10 MIN</b><span>Easy warm-up</span></div><div class="sbh-st"><b>4 × 1 MI</b><span>10K pace, 2 min jog</span></div><div class="sbh-st"><b>10 MIN</b><span>Easy cool-down</span></div></div><div class="sbh-go2">Start workout</div></div>
<div class="sbh-fs"><div class="sbh-fh"><b>Check-in</b><span>Sun</span></div><span class="sbh-mini">How do your legs feel</span><div class="sbh-feel"><i class="f"></i><i class="f"></i><i class="f"></i><i class="h"></i><i></i><i></i></div><div class="sbh-dy is-done"><span class="sbh-dd">MON</span><span>Easy 5 mi</span><span class="sbh-dt"></span></div><div class="sbh-dy is-done"><span class="sbh-dd">TUE</span><span>Strength A</span><span class="sbh-dt"></span></div><div class="sbh-box"><b>Your check-in</b>Legs heavy after Tuesday. Slept about 6 hours.</div><div class="sbh-go2">Send to Eddie</div></div>
<div class="sbh-fs"><div class="sbh-fh"><b>Eddie</b><span>Example</span></div><div class="sbh-msg me">Legs heavy after Tuesday. Slept about 6 hours.</div><div class="sbh-msg">Moved the tempo to next week. Easy Thursday, keep Saturday.</div><div class="sbh-dy"><span class="sbh-dd">THU</span><span><span class="sbh-was">Tempo 6 mi</span><span class="sbh-chg">Easy 4 mi</span></span><span class="sbh-dt"></span></div><div class="sbh-dy"><span class="sbh-dd">SAT</span><span>Long run 9 mi</span><span class="sbh-dt"></span></div><span class="sbh-tag">Example screens and data</span></div>` + '</div></div></div>';
        document.body.append(ride);
        const phone = ride.firstElementChild, feed = ride.querySelector(".sbh-feed");
        const wide = window.matchMedia("(min-width: 761px)");
        const setRide = () => root.classList.toggle("sbh-ride-on", wide.matches);
        setRide(); wide.addEventListener?.("change", () => { setRide(); remeasure(); });

        let tops = { storyTop: 0, storyBottom: 0, closeTop: 0, heroH: 1 };
        const measure = () => {
            const y = window.scrollY;
            tops = {
                heroH: hero.offsetHeight,
                storyTop: story.getBoundingClientRect().top + y,
                storyBottom: story.getBoundingClientRect().bottom + y,
                closeTop: close.getBoundingClientRect().top + y,
            };
            if (hz && cards) {
                const hh = Math.max(320, window.innerHeight - barH());
                hzMax = Math.max(0, cards.scrollWidth + 2 * parseFloat(getComputedStyle(cards).paddingLeft || 0) - window.innerWidth);
                const want = hh + hzMax + "px";
                if (hz.style.height !== want) hz.style.height = want;
                svc.style.height = hh + "px";
            }
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
            if (root.classList.contains("sbh-ride-on")) {
                const top = parseFloat(getComputedStyle(root).getPropertyValue("--sbh-bar")) || barH();
                const availH = vh - top - 90 - 24;
                const pw = Math.max(150, Math.min(300, availH / 2));
                if (Math.abs((phone._pw || 0) - pw) > 0.5) {
                    phone._pw = pw; phone.style.setProperty("--pw", pw.toFixed(1) + "px");
                    phone.style.setProperty("--sh", Math.round(pw * 1.946) + "px");
                }
                const sp = Math.min(1, Math.max(0, (y - tops.storyTop) / Math.max(1, tops.storyBottom - tops.storyTop - vh)));
                const f = phoneFeed(sp), fade = phoneFade({ scrollY: y, vh, storyTop: tops.storyTop, storyH: tops.storyBottom - tops.storyTop });
                feed.style.transform = `translate3d(0,${(-f * pw * 1.946).toFixed(1)}px,0)`;
                ride.style.opacity = (fade.inn * (1 - fade.out)).toFixed(3);
                ride.style.transform = `translate3d(${((1 - fade.inn) * 90 + fade.out * 90).toFixed(1)}px,0,0)`;
                phone.style.transform = `rotate(${(3 - f * 0.9).toFixed(2)}deg)`;
            }
            const step = parseInt(stick?.dataset.s, 10) || 1;
            if (numeral && numeral.textContent !== String(step)) numeral.textContent = step;
            if (hz && cards) cards.style.transform = `translate3d(${(-sidewaysProgress(hz.getBoundingClientRect().top - barH(), hzMax) * hzMax).toFixed(1)}px,0,0)`;
            if (words.length && bigEl) {
                const r = bigEl.getBoundingClientRect(), t = Math.min(1, Math.max(0, (vh * 0.82 - r.top) / (vh * 0.5 + r.height)));
                words.forEach((w, i) => { w.style.opacity = (0.2 + 0.8 * Math.min(1, Math.max(0, t * (words.length + 3) - i))).toFixed(2); });
            }
            const run = runProgress({ scrollY: y, vh, heroH: tops.heroH, closeTop: tops.closeTop });
            hudMi.textContent = (run * RACE_MILES).toFixed(1);
            hudBar.style.width = (run * 100).toFixed(1) + "%";
            hudCh.textContent = CHAPTERS[chapterIndex({ scrollY: y, vh, ...tops, step })];
            hud.classList.toggle("is-on", y > tops.heroH * 0.35 && tops.closeTop - y > vh * 0.5);
            if (rLen) {
                const done = run;
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
