/* ==========================================
   Southbound — home page scrolling backdrop (browser side)

   Adds a fixed backdrop behind the page and moves it with the scroll
   (js/homeSkyModel.js). Skipped for reduced motion, reduced data and
   very old browsers: the page stays the plain forest green. Only
   opacity and transform change per frame, nothing repaints.
========================================== */

import { skyState, runProgress, chapterIndex, sidewaysProgress, storyClipAt, featureStep, featureClipAt, manualFrac, manualActive, phoneFade, CLIPS, CLIP_ORDER, CHAPTERS, RACE_MILES } from "./homeSkyModel.js";

const mq = (q) => window.matchMedia(q).matches;
if (!mq("(prefers-reduced-motion: reduce)") && navigator.connection?.saveData !== true) {
    const root = document.documentElement;
    const hero = document.querySelector(".sbh-hero");
    const story = document.getElementById("sbhStory");
    const close = document.querySelector(".sbh-close");
    const video = document.getElementById("sbhPhoto");
    const headline = document.getElementById("sbhHeadline");
    const rises = [...document.querySelectorAll("[data-rise]")];
    const svc = document.querySelector(".sbh-svc");
    const cards = svc?.querySelector(".sbh-cards");
    const stick = story?.querySelector(".sbh-stick");

    if (hero && story && close) {
        const sky = document.createElement("div");
        sky.className = "sbh-sky";
        sky.setAttribute("aria-hidden", "true");
        sky.innerHTML = '<i class="sbh-sky-dusk"></i><i class="sbh-sky-night"></i><i class="sbh-sky-dawn"></i><div class="sbh-sun"></div><i class="sbh-glow sbh-glow-amber"></i><i class="sbh-glow sbh-glow-teal"></i><i class="sbh-glow sbh-glow-clay"></i><i class="sbh-glow sbh-glow-sage"></i>';
        document.body.prepend(sky);
        const [dusk, night, dawn] = sky.querySelectorAll("i");
        const glows = sky.querySelectorAll(".sbh-glow");
        const sun = sky.querySelector(".sbh-sun");
        root.classList.add("sbh-sky-on");

        // The route: a sand line that switches back across the page from the hero to the close, drawn as the visitor scrolls.
        const main = document.getElementById("main");
        const NS = "http://www.w3.org/2000/svg";
        const route = document.createElementNS(NS, "svg");
        route.setAttribute("class", "sbh-route");
        route.setAttribute("aria-hidden", "true");
        route.innerHTML = '<path class="sbh-route-base"/><path class="sbh-route-under"/><path class="sbh-route-draw"/><g class="sbh-route-tip"><circle class="sbh-route-halo" r="13"/><circle r="5.5"/><text x="18" y="4"></text></g>';
        main.prepend(route);
        const rBase = route.querySelector(".sbh-route-base"), rUnder = route.querySelector(".sbh-route-under"), rDraw = route.querySelector(".sbh-route-draw");
        const tip = route.querySelector(".sbh-route-tip");
        const tipText = tip.querySelector("text");
        let rLen = 0, rTop = 0;
        const layoutRoute = () => {
            const mr = main.getBoundingClientRect(), y = window.scrollY;
            rTop = hero.getBoundingClientRect().bottom + y - (mr.top + y);
            const bottom = close.getBoundingClientRect().top + y - (mr.top + y);
            const H = Math.max(200, bottom - rTop), W = mr.width;
            const phone = W <= 760;
            const xl = W * (phone ? 0.1 : 0.08), xr = W * (phone ? 0.9 : 0.92);
            route.setAttribute("width", W); route.setAttribute("height", H);
            route.setAttribute("viewBox", `0 0 ${W} ${H}`);
            route.style.top = rTop + "px";
            // One turn about every 700px (900px on a phone), each leaving and arriving straight down.
            const n = Math.max(3, Math.round(H / (phone ? 900 : 700)));
            let d = `M${xl} 0`, xp = xl;
            for (let i = 1; i <= n; i++) {
                const x = i % 2 ? xr : xl, y1 = (H * i) / n, y0 = (H * (i - 1)) / n, m = (y0 + y1) / 2;
                d += ` C${xp} ${m} ${x} ${m} ${x} ${y1}`; xp = x;
            }
            rBase.setAttribute("d", d); rUnder.setAttribute("d", d); rDraw.setAttribute("d", d);
            rLen = rDraw.getTotalLength();
            rDraw.style.strokeDasharray = rLen; rUnder.style.strokeDasharray = rLen;
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

        // A phone beside the story and the "More in the app" section, showing the real recordings of the app.
        // The scroll drives the recording (forwards and backwards at the visitor's pace); it never plays on its own.
        // Chips under it let a visitor pick any of the seven; it then follows the scroll for a screen or so.
        const feat = document.getElementById("sbhFeat");
        if (feat) feat.hidden = false;
        const ride = document.createElement("div");
        ride.className = "sbh-ride";
        ride.innerHTML = '<div class="sbh-phone"><video class="sbh-pv" muted playsinline preload="auto" aria-hidden="true" tabindex="-1" poster="videos/tour/checkin.webp" src="videos/tour/scrub/checkin.mp4"></video><span class="sbh-pex" aria-hidden="true">Example screens and data</span></div><div class="sbh-chips" role="group" aria-label="Pick a feature of the app"></div>';
        document.body.append(ride);
        ride.style.visibility = "hidden";
        const phone = ride.firstElementChild, pv = phone.querySelector("video"), chipsEl = ride.querySelector(".sbh-chips");
        pv.defaultMuted = true; pv.muted = true; pv.playsInline = true; pv.pause();
        root.classList.add("sbh-ride-on");
        let shown = "checkin", manual = null, manualAt = 0, want = 0, at = 0, scrubRaf = 0, snapNext = true;
        // Walk the video's time toward the wanted time; one seek at a time so it keeps up on a phone.
        const scrub = () => {
            scrubRaf = 0;
            const d = pv.duration;
            if (!(d > 0) || !Number.isFinite(d)) return;
            // Land on the recording's own frames (15 a second) so a seek is always a cheap jump to a key frame.
            const target = Math.min(d - 0.001, Math.round(want * d * 15) / 15);
            at = snapNext ? target : at + (target - at) * 0.4;
            if (Math.abs(target - at) < 0.04) at = target;
            snapNext = false;
            const q = Math.round(at * 15) / 15;
            if (!pv.seeking && Math.abs(pv.currentTime - q) > 0.03) { try { pv.currentTime = q; } catch (e) { /* not ready yet */ } }
            if (Math.abs(target - at) > 0.01 || pv.seeking) scrubRaf = requestAnimationFrame(scrub);
        };
        const kick = () => { if (!scrubRaf) scrubRaf = requestAnimationFrame(scrub); };
        pv.addEventListener("loadedmetadata", () => { snapNext = true; kick(); });
        pv.addEventListener("seeked", kick);
        const showClip = (id) => {
            if (id === shown) return;
            shown = id; snapNext = true;
            chipsEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
            pv.classList.remove("is-swap"); void pv.offsetWidth; pv.classList.add("is-swap");
            pv.poster = `videos/tour/${id}.webp`; pv.src = `videos/tour/scrub/${id}.mp4`; pv.load();
        };
        CLIP_ORDER.forEach((id) => {
            const b = document.createElement("button");
            b.type = "button"; b.dataset.id = id; b.textContent = CLIPS[id][0];
            b.setAttribute("aria-pressed", String(id === shown));
            b.addEventListener("click", () => { manual = id; manualAt = window.scrollY; showClip(id); want = 0; kick(); });
            chipsEl.append(b);
        });
        const featTitle = document.getElementById("sbhFeatTitle"), featText = document.getElementById("sbhFeatP"), featBox = feat?.querySelector(".sbh-ftxt");
        const featSegs = feat ? [...feat.querySelectorAll(".sbh-fsegs i")] : [];
        let lastFeat = -1, lastWordsT = -1, lastRun = -1;

        let riseTops = [], bigTop = 0, bigH = 0;
        let tops = { storyTop: 0, storyBottom: 0, closeTop: 0, heroH: 1 };
        const measure = () => {
            const y = window.scrollY;
            tops = {
                heroH: hero.offsetHeight,
                hzTop: hz ? hz.getBoundingClientRect().top + y : 0,
                storyTop: story.getBoundingClientRect().top + y,
                storyBottom: story.getBoundingClientRect().bottom + y,
                closeTop: close.getBoundingClientRect().top + y,
                featTop: feat ? feat.getBoundingClientRect().top + y : 0,
                featBottom: feat ? feat.getBoundingClientRect().bottom + y : 0,
            };
            // Positions of the reveal elements, read once here so the scroll loop never touches layout.
            riseTops = rises.map((el) => el.getBoundingClientRect().top + y);
            if (bigEl) { const r = bigEl.getBoundingClientRect(); bigTop = r.top + y; bigH = r.height; }
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
            {
                const mid = y + vh * 0.5, { storyTop: st, featTop: ft, hzTop: zt } = tops;
                const r = (v, a, b) => (b > a ? Math.min(1, Math.max(0, (v - a) / (b - a))) : 0);
                const p = y / Math.max(1, root.scrollHeight - vh);
                const a = [
                    1 - r(mid, st - vh * 0.4, st + vh * 0.4),
                    r(mid, st - vh * 0.2, st + vh * 0.6) * (1 - r(mid, ft - vh * 0.2, ft + vh * 0.6)),
                    r(mid, ft - vh * 0.2, ft + vh * 0.6) * (1 - r(mid, zt - vh * 0.2, zt + vh * 0.5)),
                    r(mid, zt - vh * 0.2, zt + vh * 0.8),
                ];
                glows.forEach((g, i) => {
                    g.style.opacity = a[i].toFixed(3);
                    if (a[i] > 0.005) g.style.transform = `translate3d(${(Math.sin(p * 7 + i * 1.7) * 22 + (i % 2 ? 30 : -30)).toFixed(1)}vw,${(((p * 60 + i * 18) % 90) - 20).toFixed(1)}vh,0)`;
                });
            }
            const sunY = (0.22 + s.set * 1.0 - s.rise * 0.75) * vh;
            sun.style.transform = `translate3d(${(vh * 0.12 * (1 - s.set)).toFixed(1)}px,${sunY.toFixed(1)}px,0)`;
            sun.style.opacity = (1 - s.set * 0.9 + s.rise * 0.8).toFixed(3);
            if (video && y < tops.heroH * 1.2) video.style.transform = `scale(${(1 + s.hero * 0.12).toFixed(4)})`;
            if (headline && y < tops.heroH * 1.2) headline.style.transform = `translate3d(0,${(s.hero * -60).toFixed(1)}px,0)`;
            {
                const small = window.innerWidth <= 760, top = barH();
                const chipsH = 44, featH = tops.featBottom - tops.featTop;
                const availH = small ? vh - top - 252 - 84 - chipsH - 10 : vh - top - 90 - 14 - chipsH - 12;
                const pw = Math.max(110, Math.min(small ? 230 : 300, (availH * 440) / 928));
                if (Math.abs((phone._pw || 0) - pw) > 0.5) { phone._pw = pw; phone.style.setProperty("--pw", pw.toFixed(1) + "px"); }
                const fade = phoneFade({ scrollY: y, vh, storyTop: tops.storyTop, featTop: tops.featTop, featH });
                const vis = fade.inn * (1 - fade.out);
                ride.style.opacity = vis.toFixed(3);
                ride.style.visibility = vis > 0.01 ? "visible" : "hidden";
                ride.style.transform = small
                    ? `translate3d(0,${((1 - fade.inn) * 60 + fade.out * 60).toFixed(1)}px,0)`
                    : `translate3d(${((1 - fade.inn) * 90 + fade.out * 90).toFixed(1)}px,0,0)`;
                const fp = Math.min(1, Math.max(0, (y - tops.featTop) / Math.max(1, featH - vh)));
                const fs = featureStep(fp), inFeat = y + vh * 0.5 >= tops.featTop;
                if (manual && !manualActive(y - manualAt, vh)) manual = null;
                const sp = Math.min(1, Math.max(0, (y - tops.storyTop) / Math.max(1, tops.storyBottom - tops.storyTop - vh)));
                const c = inFeat ? featureClipAt(fp) : storyClipAt(sp);
                if (manual) { showClip(manual); want = manualFrac(y - manualAt, vh); }
                else { showClip(c.id); want = c.frac; }
                kick();
                if (feat && featTitle) {
                    featSegs.forEach((sg, i) => { sg.style.width = (i < fs ? 100 : i === fs ? Math.max(6, (fp * 3 - fs) * 100) : 0) + "%"; });
                    if (fs !== lastFeat) {
                        lastFeat = fs; const cl = CLIPS[featureClipAt(fp).id];
                        featTitle.textContent = cl[1]; featText.textContent = cl[2];
                        featBox.classList.remove("is-swap"); void featBox.offsetWidth; featBox.classList.add("is-swap");
                    }
                }
            }
            const step = parseInt(stick?.dataset.s, 10) || 1;
            if (numeral && numeral.textContent !== String(step)) numeral.textContent = step;
            if (hz && cards) cards.style.transform = `translate3d(${(-sidewaysProgress(tops.hzTop - y - barH(), hzMax) * hzMax).toFixed(1)}px,0,0)`;
            if (words.length && bigEl) {
                const t = Math.min(1, Math.max(0, (vh * 0.82 - (bigTop - y)) / (vh * 0.5 + bigH)));
                if (t > 0 && t < 1 || t !== lastWordsT) {
                    lastWordsT = t;
                    words.forEach((w, i) => { w.style.opacity = (0.2 + 0.8 * Math.min(1, Math.max(0, t * (words.length + 3) - i))).toFixed(2); });
                }
            }
            const run = runProgress({ scrollY: y, vh, heroH: tops.heroH, closeTop: tops.closeTop });
            hudMi.textContent = (run * RACE_MILES).toFixed(1);
            hudBar.style.width = (run * 100).toFixed(1) + "%";
            hudCh.textContent = CHAPTERS[chapterIndex({ scrollY: y, vh, ...tops, step })];
            hud.classList.toggle("is-on", y > tops.heroH * 0.35 && tops.closeTop - y > vh * 0.5);
            if (rLen && Math.abs(run - lastRun) > 0.0015) {
                lastRun = run;
                const done = run;
                rDraw.style.strokeDashoffset = rLen * (1 - done); rUnder.style.strokeDashoffset = rLen * (1 - done);
                const pt = rDraw.getPointAtLength(rLen * done);
                tip.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
                tip.style.opacity = done > 0.005 ? 1 : 0;
                tipText.textContent = (done * 13.1).toFixed(1) + " MI";
            }
            rises.forEach((el, i) => {
                const t = Math.min(1, Math.max(0, (vh - (riseTops[i] - y)) / (vh * 0.55)));
                const e = (t * t * (3 - 2 * t)).toFixed(2);
                if (el._t !== e) { el._t = e; el.style.setProperty("--t", e); }
            });
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
