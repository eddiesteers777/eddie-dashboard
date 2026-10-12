/* ==========================================
   Southbound — "How to" for an exercise

   openExerciseDemo(name, { muscles, note, video })
     A sheet (bottom sheet on phones) with, when there's one, the
     Southbound demo figure doing the exercise (js/exerciseDemos.js,
     drawn by js/demoFigure.js): camera angles to tap, Pause, Slow motion;
     then Start / Move / Cue in Southbound's words; the coach's note and
     video link; and the muscle map, front and back, the main muscles in
     clay and the ones helping in tan (js/exerciseMuscles.js).
   hasHowTo(name, given)   is there anything to show?
   Opened from the set-by-set screen (js/setRunner.js) and the coach's
   strength session (js/strengthSession.js). Loads css/demo.css itself.
   Respects Reduce Motion: it opens paused on the key position.
========================================== */

import { skeleton, poseAt, frameSvg, fitBox } from "./demoFigure.js";
import { demoFor } from "./exerciseDemos.js";
import { musclesFor, muscleWords, hasHowTo } from "./exerciseMuscles.js";
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

const STANDING = { lShoulder: [2, 0, 6], rShoulder: [2, 0, -6], lElbow: [-6, 0, 0], rElbow: [-6, 0, 0], lHip: [0, 0, 2], rHip: [0, 0, -2] };

/** The muscle map, front and back, as one block of HTML. */
export function muscleMapHtml(muscles) {
    const levels = {};
    for (const m of muscles.secondary || []) levels[m] = "secondary";
    for (const m of muscles.primary || []) levels[m] = "primary";
    const sk = skeleton(STANDING);
    const views = [{ label: "Front", yaw: 0, pitch: 0 }, { label: "Back", yaw: 180, pitch: 0 }];
    const figs = views.map((v, i) => frameSvg(sk, v, fitBox([sk], v, { aspect: 0.62, pad: 8 }), { width: 150, height: 242, map: true, muscles: levels, id: `mm${i}`, background: false, label: `Muscles worked, ${v.label.toLowerCase()}` }));
    return `
        <div class="dm-map">
            <div class="dm-map-figs">${figs.map((f, i) => `<figure>${f}<figcaption>${views[i].label}</figcaption></figure>`).join("")}</div>
            <div class="dm-map-key">
                ${muscles.primary?.length ? `<p><span class="dm-dot is-primary"></span><span><strong>Main</strong> ${esc(muscleWords(muscles.primary))}</span></p>` : ""}
                ${muscles.secondary?.length ? `<p><span class="dm-dot is-secondary"></span><span><strong>Helping</strong> ${esc(muscleWords(muscles.secondary))}</span></p>` : ""}
            </div>
        </div>`;
}

// The figure, playing. Returns { stop }.
function startPlayer(root, demo) {
    const opts = { anchor: demo.anchor, level: demo.level };
    const sample = Array.from({ length: 32 }, (_, i) => skeleton(poseAt(demo.keys, i / 32), opts));
    const boxes = demo.views.map(v => fitBox(sample, v, { extra: demo.equipment?.some(e => e.type === "barbell") ? 10 : 0 }));
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The key position (the bottom of a squat): the first key between start and end.
    const peak = demo.keys.find(k => k.at > 0 && k.at < 1)?.at ?? 0.5;
    const draw = { equipment: demo.equipment || [], mat: Boolean(demo.mat) };
    const stage = root.querySelector("[data-stage]");
    const thumbs = root.querySelector("[data-thumbs]");
    const playBtn = root.querySelector('[data-demo="play"]');
    const slowBtn = root.querySelector('[data-demo="slow"]');
    let view = 0, playing = !reduce, speed = 1, t = reduce ? peak : 0, last = 0, raf = 0, lastDraw = 0;

    const peakSk = skeleton(poseAt(demo.keys, peak), opts);
    thumbs.innerHTML = demo.views.map((v, i) => `
        <button type="button" data-view="${i}" aria-pressed="${i === 0}" aria-label="${esc(v.label)} view">
            ${frameSvg(peakSk, v, boxes[i], { width: 120, height: 75, id: `dt${i}`, ...draw })}
            <span>${esc(v.label)}</span>
        </button>`).join("");

    const paint = () => {
        stage.innerHTML = frameSvg(skeleton(poseAt(demo.keys, t), opts), demo.views[view], boxes[view], { width: 480, height: 300, id: "ds", ...draw, label: `${demo.name}, ${demo.views[view].label} view` });
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

    const setPlaying = on => {
        playing = on;
        playBtn.innerHTML = playing ? `${icon("pause")} Pause` : `${icon("play")} Play`;
        playBtn.setAttribute("aria-pressed", String(!playing));
    };
    setPlaying(playing);
    root.addEventListener("click", event => {
        const v = event.target.closest("[data-view]");
        if (v) {
            view = Number(v.dataset.view);
            thumbs.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b === v)));
            paint();
            return;
        }
        if (event.target.closest('[data-demo="play"]')) { setPlaying(!playing); last = 0; return; }
        if (event.target.closest('[data-demo="slow"]')) {
            speed = speed === 1 ? 0.4 : 1;
            slowBtn.textContent = speed === 1 ? "Slow motion" : "Normal speed";
            slowBtn.setAttribute("aria-pressed", String(speed !== 1));
        }
    });
    // A hidden tab doesn't need to draw.
    const onVisibility = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = 0; raf = requestAnimationFrame(loop); } };
    document.addEventListener("visibilitychange", onVisibility);
    return { stop: () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVisibility); } };
}

/** Opens the How to sheet. Resolves when it closes. */
export function openExerciseDemo(name, { muscles: given = {}, note = "", video = "" } = {}) {
    ensureStyles();
    const demo = demoFor(name);
    const muscles = musclesFor(name, given);
    return new Promise(resolve => {
        const d = document.createElement("dialog");
        d.className = "sb-dialog dm-dialog";
        d.setAttribute("aria-label", `How to do ${name}`);
        d.innerHTML = `
            <div class="dm-sheet">
                <div class="dm-head">
                    <div>
                        <span class="dm-eyebrow">How to</span>
                        <h2 class="dm-title">${esc(name)}</h2>
                    </div>
                    <button type="button" class="dm-close" data-close aria-label="Close">${icon("close")}</button>
                </div>
                ${demo ? `
                    <div class="dm-stage" data-stage></div>
                    <div class="dm-thumbs" data-thumbs role="group" aria-label="Camera angle"></div>
                    <div class="dm-controls">
                        <button type="button" class="sb-btn sb-btn-secondary" data-demo="play"></button>
                        <button type="button" class="sb-btn sb-btn-secondary" data-demo="slow" aria-pressed="false">Slow motion</button>
                    </div>
                    <div class="dm-steps">
                        <div><h3>Start</h3><p>${esc(demo.start)}</p></div>
                        <div><h3>Move</h3><p>${esc(demo.move)}</p></div>
                        <div><h3>Cue</h3><p>${esc(demo.cue)}</p></div>
                    </div>` : `<p class="dm-none">No moving demo for this one yet.</p>`}
                ${note ? `<div class="dm-note"><h3>From your coach</h3><p>${esc(note)}</p></div>` : ""}
                ${/^https:\/\//i.test(video) ? `<a class="sb-btn sb-btn-tertiary dm-video" href="${esc(video)}" target="_blank" rel="noopener noreferrer">${icon("play")} Watch your coach's video</a>` : ""}
                ${muscles.primary.length ? `<h3 class="dm-section">Muscles worked</h3>${muscleMapHtml(muscles)}` : ""}
            </div>`;
        document.body.appendChild(d);
        const player = demo ? startPlayer(d, demo) : null;
        d.addEventListener("click", event => {
            if (event.target === d || event.target.closest("[data-close]")) d.close();
        });
        d.addEventListener("close", () => { player?.stop(); d.remove(); resolve(); });
        d.showModal();
        import("./icons.js").then(m => m.hydrate?.()).catch(() => {});
    });
}
