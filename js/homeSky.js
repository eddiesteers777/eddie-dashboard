/* ==========================================
   Southbound — home page scrolling backdrop (browser side)

   Adds a fixed backdrop behind the page and moves it with the scroll
   (js/homeSkyModel.js). Skipped for reduced motion, reduced data and
   very old browsers: the page stays the plain forest green. Only
   opacity and transform change per frame, nothing repaints.
========================================== */

import { skyState, runProgress, sidewaysProgress, storyClipAt, featureStep, featureClipAt, manualFrac, manualActive, phoneFade, CLIPS, CHIP_ORDER, CHAT, bubbleOn, PASS_COUNT, passAt, PLAYERS, PASS_SEQ, playerPos } from "./homeSkyModel.js";

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

        // The opening: the hero stays pinned for about one more screen while the picture comes up from black,
        // like the start of an old film (flicker, scratches, grain), then the headline arrives.
        const leader = hero.querySelector(".sbh-leader"), film = hero.querySelector(".sbh-film"), heroInner = hero.querySelector(".sbh-hero-inner");
        let open = null, scratches = [], cue = null;
        if (leader && film && heroInner) {
            open = document.createElement("div");
            open.className = "sbh-open";
            hero.before(open); open.append(hero);
            scratches = [...film.querySelectorAll("i")];
            cue = film.querySelector(".sbh-cue");
            root.classList.add("sbh-open-live");
        }

        // The pitch: fixed behind the page, with a ball passed from player to player as the visitor scrolls.
        // Lines and mown stripes only; the ball and the passes already made are the only things that move.
        const NS = "http://www.w3.org/2000/svg";
        const pitch = document.createElementNS(NS, "svg");
        pitch.setAttribute("class", "sbh-pitch");
        pitch.setAttribute("aria-hidden", "true");
        pitch.setAttribute("preserveAspectRatio", "none");
        sky.append(pitch);
        let pLayout = "", passEls = [], dotEls = {}, liveEl = null, ballEl = null, haloEl = null, golEl = null, passXY = null, lastPass = -1;
        const layoutPitch = () => {
            const W = sky.clientWidth || window.innerWidth, H = sky.clientHeight || window.innerHeight, portrait = H > W;
            if (pLayout === (portrait ? "p" : "l") + W) return;
            pLayout = (portrait ? "p" : "l") + W;
            const m = portrait ? 14 : 26, L = (portrait ? H : W) - 2 * m, Wd = (portrait ? W : H) - 2 * m;
            const P = ([u, v]) => (portrait ? [m + v * Wd, m + u * L] : [m + u * L, m + v * Wd]);
            const f = (n) => n.toFixed(1);
            const pt = (uv) => P(uv).map(f).join(" ");
            const rect = (u0, v0, u1, v1) => `M${pt([u0, v0])}L${pt([u1, v0])}L${pt([u1, v1])}L${pt([u0, v1])}Z`;
            const pbU = 16.5 / 105, pbV = 40.3 / 68, gbU = 5.5 / 105, gbV = 18.3 / 68, r = (9.15 / 105) * L;
            const [cx, cy] = P([0.5, 0.5]);
            const lines = rect(0, 0, 1, 1) + `M${pt([0.5, 0])}L${pt([0.5, 1])}` + `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`
                + rect(0, 0.5 - pbV / 2, pbU, 0.5 + pbV / 2) + rect(1 - pbU, 0.5 - pbV / 2, 1, 0.5 + pbV / 2)
                + rect(0, 0.5 - gbV / 2, gbU, 0.5 + gbV / 2) + rect(1 - gbU, 0.5 - gbV / 2, 1, 0.5 + gbV / 2);
            let stripes = "";
            for (let i = 0; i < 10; i += 2) stripes += rect(i / 10, 0, (i + 1) / 10, 1);
            const xy = (k) => P(playerPos(k));
            passXY = [];
            for (let i = 0; i < PASS_COUNT; i++) {
                const [x0, y0] = xy(PASS_SEQ[i]), [x1, y1] = xy(PASS_SEQ[i + 1]), dx = x1 - x0, dy = y1 - y0;
                passXY.push([x0, y0, (x0 + x1) / 2 - dy * 0.12, (y0 + y1) / 2 + dx * 0.12, x1, y1]);
            }
            pitch.setAttribute("viewBox", `0 0 ${f(W)} ${f(H)}`);
            pitch.innerHTML = `<path class="sbh-pitch-stripes" d="${stripes}"/><path class="sbh-pitch-lines" d="${lines}"/>`
                + passXY.map((q) => `<path class="sbh-pass" d="M${f(q[0])} ${f(q[1])}Q${f(q[2])} ${f(q[3])} ${f(q[4])} ${f(q[5])}"/>`).join("")
                + `<path class="sbh-pass-live" pathLength="1"/>`
                + Object.keys(PLAYERS).map((k) => { const [x, y] = xy(k); return `<circle class="sbh-player" data-k="${k}" cx="${f(x)}" cy="${f(y)}" r="${portrait ? 5 : 6}"/>`; }).join("")
                + (() => { const [gx, gy] = P([portrait ? 0.985 : 0.93, 0.5]); return `<text class="sbh-gol" x="${f(gx)}" y="${f(gy + (portrait ? 0 : 52))}" text-anchor="${portrait ? "middle" : "end"}" aria-hidden="true">¡Gooooool!</text>`; })()
                + `<circle class="sbh-ball-halo" r="16"/><circle class="sbh-ball" r="6"/>`;
            passEls = [...pitch.querySelectorAll(".sbh-pass")];
            liveEl = pitch.querySelector(".sbh-pass-live"); ballEl = pitch.querySelector(".sbh-ball"); haloEl = pitch.querySelector(".sbh-ball-halo"); golEl = pitch.querySelector(".sbh-gol");
            dotEls = {}; pitch.querySelectorAll(".sbh-player").forEach((c) => { dotEls[c.dataset.k] = c; });
            lastPass = -1; lastRun = -1;
        };
        const layoutRoute = layoutPitch;

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

        // A phone beside the story and the "More in the app" section, showing the real recordings of the app.
        // The scroll drives the recording (forwards and backwards at the visitor's pace); it never plays on its own.
        // Chips under it let a visitor pick any of the seven; it then follows the scroll for a screen or so.
        const feat = document.getElementById("sbhFeat");
        if (feat) feat.hidden = false;
        const ride = document.createElement("div");
        ride.className = "sbh-ride";
        ride.innerHTML = '<div class="sbh-dev"><i class="sbh-key sbh-key-1"></i><i class="sbh-key sbh-key-2"></i><i class="sbh-key sbh-key-3"></i><div class="sbh-phone"><video class="sbh-pv" muted playsinline preload="auto" aria-hidden="true" tabindex="-1" poster="videos/tour/checkin.webp" src="videos/tour/scrub/checkin.mp4"></video><div class="sbh-push" aria-hidden="true"><b>E</b><span><strong>Coach Eddie <em>now</em></strong>Thursday\'s tempo is now an easy 4 miles. Your legs need it.</span></div><i class="sbh-glare"></i></div><div class="sbh-chat" aria-hidden="true"></div></div><span class="sbh-pex" aria-hidden="true">Example screens and data</span><div class="sbh-chips" role="group" aria-label="Pick a feature of the app"></div>';
        document.body.append(ride);
        ride.style.visibility = "hidden";
        const phone = ride.firstElementChild, pv = phone.querySelector("video"), chipsEl = ride.querySelector(".sbh-chips"), push = phone.querySelector(".sbh-push"), chat = ride.querySelector(".sbh-chat"), pops = [null, null];
        pv.defaultMuted = true; pv.muted = true; pv.playsInline = true; pv.pause();
        root.classList.add("sbh-ride-on");
        // A popped bubble throws water: drops fall to the bottom of the screen and settle there as small puddles.
        const splash = (r) => {
            if (!r.width || !r.height) return;
            const vh = window.innerHeight, rnd = (a, b) => a + Math.random() * (b - a);
            for (let i = 0; i < 16; i++) {
                const d = document.createElement("i");
                const w = rnd(4, 10), x0 = r.left + rnd(0.1, 0.9) * r.width, y0 = r.top + rnd(0.35, 1) * r.height, fall = Math.max(40, vh - y0 - 2), dx = rnd(-46, 46);
                const dur = 520 + Math.sqrt(fall) * 26 + rnd(0, 160);
                d.className = "sbh-drop"; d.style.cssText = `left:${x0.toFixed(0)}px;top:${y0.toFixed(0)}px;width:${w.toFixed(1)}px;height:${(w * 1.35).toFixed(1)}px`;
                document.body.append(d);
                d.animate({ translate: ["0 0", `${dx.toFixed(0)}px 0`] }, { duration: dur, easing: "linear", fill: "forwards" });
                const fallAnim = d.animate({ transform: ["translateY(0) scaleY(.8)", `translateY(${fall.toFixed(0)}px) scaleY(1.5)`] }, { duration: dur, easing: "cubic-bezier(.45,0,.9,.55)", fill: "forwards" });
                fallAnim.onfinish = () => {
                    const px = x0 + dx; d.remove();
                    const pd = document.createElement("i");
                    pd.className = "sbh-puddle"; pd.style.cssText = `left:${(px - w * 3).toFixed(0)}px;width:${(w * 6).toFixed(0)}px`;
                    document.body.append(pd);
                    pd.animate({ transform: ["scaleX(.3)", "scaleX(1.6)"], opacity: [0.9, 0] }, { duration: 3200, easing: "ease-out" }).onfinish = () => pd.remove();
                };
            }
        };
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
        CHIP_ORDER.forEach((id) => {
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
        let tops = { storyTop: 0, storyBottom: 0, closeTop: 0, heroH: 1, openH: 0, heroOnly: 1 };
        const measure = () => {
            const y = window.scrollY;
            tops = {
                heroH: open ? open.offsetHeight : hero.offsetHeight,
                openH: open ? open.offsetHeight - hero.offsetHeight : 0,
                heroOnly: hero.offsetHeight,
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

        let navBar = null; // the header partial arrives after this script, so it is looked up on first use
        let lastY = window.scrollY, navAway = false, navPast = false, openWas = 0, shownAt = 0;
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
            {
                // The opening (p, 0..1 over the pinned screen), then the hero scrolls away (hp, 0..1).
                const ez = (t) => t * t * (3 - 2 * t), cl01 = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
                const p = tops.openH > 0 ? cl01(y, 0, tops.openH) : 1;
                const hp = cl01(y - tops.openH, 0, tops.heroOnly);
                if (open && (p < 1 || openWas < 1)) {
                    openWas = p;
                    const flick = p < 0.6 ? 0.1 * Math.abs(Math.sin(p * 95)) : 0;
                    leader.style.opacity = Math.min(1, Math.max(0, 0.5 * (1 - ez(cl01(p, 0, 0.5))) + flick)).toFixed(3);
                    film.style.opacity = (0.2 - 0.1 * ez(p)).toFixed(3);
                    if (cue) cue.style.opacity = (1 - cl01(p, 0, 0.12)).toFixed(2);
                    const W = window.innerWidth, fade = 1 - cl01(p, 0.3, 0.7);
                    scratches.forEach((el, k) => {
                        el.style.transform = `translate3d(${(((Math.sin(p * 40 + k * 7.1) + 1) / 2) * W).toFixed(0)}px,0,0)`;
                        el.style.opacity = (fade * (k % 2 ? 0.45 : 0.85)).toFixed(2);
                    });
                    const a = ez(cl01(p, 0.55, 0.9));
                    heroInner.style.opacity = a.toFixed(3);
                    heroInner.style.transform = `translate3d(0,${((1 - a) * 24).toFixed(1)}px,0)`;
                }
                if (video && y < tops.openH + tops.heroOnly * 1.2) video.style.transform = `scale(${(1 + (p < 1 ? 0.08 * (1 - ez(p)) : hp * 0.12)).toFixed(4)})`;
                if (headline && y < tops.openH + tops.heroOnly * 1.2) headline.style.transform = `translate3d(0,${(hp * -60).toFixed(1)}px,0)`;
            }
            {
                const small = window.innerWidth <= 760, top = barH();
                const chipsH = 44, featH = tops.featBottom - tops.featTop;
                // Room left for the phone once the caption, the tabs and the device edge are counted.
                const availH = small ? vh - top - 252 - 84 - chipsH - 40 : vh - top - 116 - 14 - chipsH - 44;
                const pw = Math.max(110, Math.min(small ? 230 : 300, (availH * 440) / 928));
                if (Math.abs((phone._pw || 0) - pw) > 0.5) { phone._pw = pw; phone.style.setProperty("--pw", pw.toFixed(1) + "px"); }
                const fade = phoneFade({ scrollY: y, vh, storyTop: tops.storyTop, featTop: tops.featTop, featH });
                const vis = fade.inn * (1 - fade.out);
                ride.style.opacity = vis.toFixed(3);
                ride.style.visibility = vis > 0.01 ? "visible" : "hidden";
                ride.style.transform = small
                    ? `translate3d(0,${((1 - fade.inn) * 60 + fade.out * 60).toFixed(1)}px,0)`
                    : `translate3d(${((1 - fade.inn) * 90 + fade.out * 90).toFixed(1)}px,0,0)`;
                // The phone floats and tilts a little as you scroll, like something held in the hand.
                if (vis > 0.01) phone.style.transform = `perspective(1300px) rotateY(${(Math.sin(y / 600) * 4).toFixed(2)}deg) translateY(${(Math.sin(y / 180) * 5).toFixed(1)}px)`;
                const fp = Math.min(1, Math.max(0, (y - tops.featTop) / Math.max(1, featH - vh)));
                const fs = featureStep(fp), inFeat = y + vh * 0.5 >= tops.featTop;
                if (manual && !manualActive(y - manualAt, vh)) manual = null;
                const sp = Math.min(1, Math.max(0, (y - tops.storyTop) / Math.max(1, tops.storyBottom - tops.storyTop - vh)));
                const c = inFeat ? featureClipAt(fp) : storyClipAt(sp);
                // The coach's note slides onto the screen during "I change it by hand".
                const pushOn = !inFeat && !manual && (parseInt(stick?.dataset.s, 10) || 1) === 4;
                if (push._on !== pushOn) { push._on = pushOn; push.classList.toggle("is-on", pushOn); }
                if (manual) { showClip(manual); want = manualFrac(y - manualAt, vh); }
                else { showClip(c.id); want = c.frac; }
                {
                    const cid = manual || c.id, cf = manual ? want : c.frac;
                    if (chat._id !== cid) {
                        chat._id = cid;
                        chat.innerHTML = CHAT[cid].map(([who, name, text]) => `<div class="sbh-msg ${who}"><small>${name}</small>${text}<u></u><u></u><u></u><u></u><u></u><u></u></div>`).join("");
                    }
                    [0, 1].forEach((i) => {
                        const el = chat.children[i], on = bubbleOn(i, cf);
                        if (!el || el._on === on) return;
                        el._on = on;
                        if (on) { el.classList.remove("pop"); el.classList.add("in"); }
                        else if (el.classList.contains("in")) { el.classList.remove("in"); el.classList.add("pop"); splash(el.getBoundingClientRect()); setTimeout(() => el.classList.remove("pop"), 300); }
                    });
                }
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
            // The toolbar slides away on the way down and comes back on the way up. It stays while the menu is open or focused.
            navBar = navBar || document.querySelector(".pub-navbar");
            if (navBar) {
                const dy = y - lastY; lastY = y;
                const keep = navBar.classList.contains("pub-nav-open") || navBar.matches(":focus-within");
                // It goes only after about 600px of steady scrolling down, and comes back on any scroll up.
                if (y < 80 || dy < -4 || keep) { shownAt = y; if (navAway) { navAway = false; navBar.classList.remove("is-away"); } }
                else if (dy > 0 && !navAway && y - shownAt > 600) { navAway = true; navBar.classList.add("is-away"); }
                const past = y > tops.heroH * 0.9;
                if (past !== navPast) { navPast = past; navBar.classList.toggle("is-past", past); }
            }
            const run = runProgress({ scrollY: y, vh, heroH: tops.heroH, closeTop: tops.closeTop });
            if (passXY && Math.abs(run - lastRun) > 0.0008) {
                lastRun = run;
                const ps = passAt(run), q = passXY[ps.index], e = 1 - (1 - ps.t) * (1 - ps.t), a = 1 - e;
                if (ps.index !== lastPass) {
                    lastPass = ps.index;
                    passEls.forEach((el, i) => el.classList.toggle("is-done", i < ps.index));
                    Object.values(dotEls).forEach((c) => c.classList.remove("is-on"));
                    [ps.from, ps.to].forEach((k) => dotEls[k]?.classList.add("is-on"));
                    liveEl.setAttribute("d", `M${q[0].toFixed(1)} ${q[1].toFixed(1)}Q${q[2].toFixed(1)} ${q[3].toFixed(1)} ${q[4].toFixed(1)} ${q[5].toFixed(1)}`);
                }
                golEl?.classList.toggle("is-on", run * PASS_COUNT >= PASS_COUNT - 0.2);
                liveEl.style.strokeDashoffset = (1 - e).toFixed(3);
                const bx = a * a * q[0] + 2 * a * e * q[2] + e * e * q[4], by = a * a * q[1] + 2 * a * e * q[3] + e * e * q[5];
                ballEl.setAttribute("cx", bx.toFixed(1)); ballEl.setAttribute("cy", by.toFixed(1));
                haloEl.setAttribute("cx", bx.toFixed(1)); haloEl.setAttribute("cy", by.toFixed(1));
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
