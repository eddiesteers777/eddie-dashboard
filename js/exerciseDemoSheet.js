/* ==========================================
   Southbound — "How to" for an exercise

   openExerciseDemo(name, { muscles, note, video })
     A sheet (bottom sheet on phones) that leads with the exercise moving,
     edge to edge: the 3D clip when there is one (js/exerciseClips.js,
     videos/), else the drawn Southbound figure (js/exerciseDemos.js,
     drawn by js/demoFigure.js), which also stands in when a clip can't
     load. Tap it to pause, a progress bar, 0.5× speed, and camera angles
     for the figure. Under it: the name, Start / Move / Cue, the muscle
     map (js/muscleMap.js), the coach's note and video link.
   hasHowTo(name)   is there a clip or a demo for it?
   Opened from the set-by-set screen (js/setRunner.js) and the coach's
   strength session (js/strengthSession.js). Loads css/demo.css itself.
   Respects Reduce Motion: it opens paused on the key position.
========================================== */

import { skeleton, poseAt, frameSvg, fitBox } from "./demoFigure.js";
import { demoFor } from "./exerciseDemos.js";
import { clipFor, clipSources } from "./exerciseClips.js";
import { musclesFor, hasHowTo } from "./exerciseMuscles.js";
import { muscleMapHtml, ensureMuscleMapStyles } from "./muscleMap.js";
import { icon } from "./icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export { hasHowTo };

function ensureStyles() {
    if (typeof document === "undefined" || document.querySelector('link[href$="css/demo.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/demo.css";
    document.head.appendChild(link);
}

// Standing moves fill a square; floor moves (plank, push-up...) a wide frame. Clips are square.
const frameSize = demo => demo.mat ? { width: 480, height: 300 } : { width: 480, height: 480 };
const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// What goes inside the video box: the figure (angle pills) or a clip.
function figureInner(demo) {
    return `
        <div class="dm-stage" data-stage></div>
        ${controlsHtml(demo.views.map((v, i) => `<button type="button" data-view="${i}" aria-pressed="${i === 0}">${esc(v.label)}</button>`).join(""))}`;
}
function clipInner(clip) {
    const src = clipSources(clip);
    return `
        <video class="dm-clip" data-clip muted loop playsinline preload="auto" poster="${src.poster}" aria-hidden="true">
            <source src="${src.webm}" type="video/webm">
            <source src="${src.mp4}" type="video/mp4">
        </video>
        ${controlsHtml("")}`;
}
function controlsHtml(angles) {
    return `
        <button type="button" class="dm-tap" data-demo="play" aria-pressed="false" aria-label="Pause demo"><span class="dm-play">${icon("play")}</span></button>
        <img class="dm-bug" src="brand/sb-mark-forest.svg" alt="" width="34" height="22">
        <button type="button" class="dm-close" data-close aria-label="Close">${icon("close")}</button>
        <div class="dm-video-foot">
            <div class="dm-angles" role="group" aria-label="Camera angle">${angles}</div>
            <button type="button" class="dm-speed" data-demo="slow" aria-pressed="false" aria-label="Slow motion">0.5×</button>
        </div>
        <div class="dm-bar"><span data-progress></span></div>`;
}

// Play / pause and 0.5× for either player.
function bindControls(root, { setPlaying, setSpeed, onView }) {
    const video = root.querySelector("[data-video]");
    const playBtn = root.querySelector('[data-demo="play"]');
    const slowBtn = root.querySelector('[data-demo="slow"]');
    let playing = true, speed = 1;
    const showPlaying = on => {
        playing = on;
        video.classList.toggle("is-paused", !on);
        playBtn.setAttribute("aria-label", on ? "Pause demo" : "Play demo");
        playBtn.setAttribute("aria-pressed", String(!on));
    };
    const onClick = event => {
        const v = event.target.closest("[data-view]");
        if (v && onView) {
            root.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b === v)));
            onView(Number(v.dataset.view));
            return;
        }
        if (event.target.closest('[data-demo="play"]')) { showPlaying(!playing); setPlaying(playing); return; }
        if (event.target.closest('[data-demo="slow"]')) {
            speed = speed === 1 ? 0.5 : 1;
            slowBtn.setAttribute("aria-pressed", String(speed !== 1));
            slowBtn.setAttribute("aria-label", speed === 1 ? "Slow motion" : "Normal speed");
            setSpeed(speed);
        }
    };
    root.addEventListener("click", onClick);
    return { showPlaying, unbind: () => root.removeEventListener("click", onClick) };
}

// The 3D clip. Calls onFail when it can't play (offline before it was ever loaded).
function startClip(root, onFail) {
    const el = root.querySelector("[data-clip]");
    const bar = root.querySelector("[data-progress]");
    const reduce = reduceMotion();
    let raf = 0, failed = false;
    const fail = () => { if (failed) return; failed = true; stop(); onFail?.(); };
    const tick = () => {
        raf = requestAnimationFrame(tick);
        if (el.duration) bar.style.transform = `scaleX(${(el.currentTime / el.duration).toFixed(3)})`;
    };
    const controls = bindControls(root, {
        setPlaying: on => { if (on) el.play().catch(() => {}); else el.pause(); },
        setSpeed: s => { el.playbackRate = s; }
    });
    // The last <source> erroring means neither format could load.
    el.querySelector("source:last-of-type").addEventListener("error", fail);
    el.addEventListener("error", fail);
    if (reduce) controls.showPlaying(false);
    else {
        controls.showPlaying(true);
        el.play().catch(() => controls.showPlaying(false));
    }
    raf = requestAnimationFrame(tick);
    function stop() { cancelAnimationFrame(raf); controls.unbind(); el.pause(); }
    return { stop };
}

// The figure, playing like a video. Returns { stop }.
function startPlayer(root, demo) {
    const opts = { anchor: demo.anchor, level: demo.level };
    const size = frameSize(demo);
    const sample = Array.from({ length: 32 }, (_, i) => skeleton(poseAt(demo.keys, i / 32), opts));
    const boxes = demo.views.map(v => fitBox(sample, v, { aspect: size.width / size.height, pad: 28, bottom: 26, extra: demo.equipment?.some(e => e.type === "barbell") ? 10 : 0 }));
    const reduce = reduceMotion();
    // The key position (the bottom of a squat): the first key between start and end.
    const peak = demo.keys.find(k => k.at > 0 && k.at < 1)?.at ?? 0.5;
    const draw = { equipment: demo.equipment || [], mat: Boolean(demo.mat) };
    const stage = root.querySelector("[data-stage]");
    const bar = root.querySelector("[data-progress]");
    let view = 0, playing = !reduce, speed = 1, t = reduce ? peak : 0, last = 0, raf = 0, lastDraw = 0;

    const paint = () => {
        stage.innerHTML = frameSvg(skeleton(poseAt(demo.keys, t), opts), demo.views[view], boxes[view], { ...size, id: "ds", ...draw, label: `${demo.name}, ${demo.views[view].label} view` });
        bar.style.transform = `scaleX(${t.toFixed(3)})`;
    };
    const loop = now => {
        raf = requestAnimationFrame(loop);
        if (!last) last = now;
        const dt = (now - last) / 1000;
        last = now;
        if (!playing) return;
        t = (t + dt / demo.seconds * speed) % 1;
        // About 30 frames a second is smooth and light on a phone.
        if (now - lastDraw < 32) return;
        lastDraw = now;
        paint();
    };
    paint();
    raf = requestAnimationFrame(loop);
    const controls = bindControls(root, {
        setPlaying: on => { playing = on; last = 0; },
        setSpeed: s => { speed = s; },
        onView: i => { view = i; paint(); }
    });
    controls.showPlaying(playing);
    // A hidden tab doesn't need to draw.
    const onVisibility = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = 0; raf = requestAnimationFrame(loop); } };
    document.addEventListener("visibilitychange", onVisibility);
    return { stop: () => { cancelAnimationFrame(raf); controls.unbind(); document.removeEventListener("visibilitychange", onVisibility); } };
}

/** Opens the How to sheet. Resolves when it closes. Nothing opens without a demo. */
export function openExerciseDemo(name, { muscles: given = {}, note = "", video = "" } = {}) {
    const demo = demoFor(name);
    const clip = clipFor(name);
    const info = clip || demo;
    if (!info) return Promise.resolve();
    ensureStyles();
    ensureMuscleMapStyles();
    const muscles = musclesFor(name, given);
    const size = clip ? { width: 1, height: 1 } : frameSize(demo);
    return new Promise(resolve => {
        const d = document.createElement("dialog");
        d.className = "sb-dialog dm-dialog";
        d.setAttribute("aria-label", `How to do ${name}`);
        d.innerHTML = `
            <div class="dm-video${clip ? " is-clip" : ""}" data-video style="aspect-ratio:${size.width} / ${size.height}">${clip ? clipInner(clip) : figureInner(demo)}</div>
            <div class="dm-sheet">
                <div>
                    <span class="dm-eyebrow">How to</span>
                    <h2 class="dm-title">${esc(name)}</h2>
                </div>
                <ol class="dm-steps">
                    <li><h3>Start</h3><p>${esc(info.start)}</p></li>
                    <li><h3>Move</h3><p>${esc(info.move)}</p></li>
                    <li><h3>Cue</h3><p>${esc(info.cue)}</p></li>
                </ol>
                ${muscleMapHtml(muscles, { id: "dmm" })}
                ${note ? `<div class="dm-note"><h3>From your coach</h3><p>${esc(note)}</p></div>` : ""}
                ${/^https:\/\//i.test(video) ? `<a class="sb-btn sb-btn-tertiary dm-link" href="${esc(video)}" target="_blank" rel="noopener noreferrer">${icon("play")} Watch your coach's video</a>` : ""}
            </div>`;
        document.body.appendChild(d);
        let player;
        if (clip) {
            // No connection and never loaded: the drawn figure stands in, or the poster stays.
            player = startClip(d, () => {
                if (!demo) { d.querySelector("[data-video]").classList.add("is-offline"); return; }
                const box = d.querySelector("[data-video]");
                const fs = frameSize(demo);
                box.classList.remove("is-clip");
                box.style.aspectRatio = `${fs.width} / ${fs.height}`;
                box.innerHTML = figureInner(demo);
                player = startPlayer(d, demo);
                import("./icons.js").then(m => m.hydrate?.()).catch(() => {});
            });
        } else {
            player = startPlayer(d, demo);
        }
        d.addEventListener("click", event => {
            if (event.target === d || event.target.closest("[data-close]")) d.close();
        });
        d.addEventListener("close", () => { player?.stop(); d.remove(); resolve(); });
        d.showModal();
        import("./icons.js").then(m => m.hydrate?.()).catch(() => {});
    });
}
