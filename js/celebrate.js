/* ==========================================
   Southbound — completion moments (2026-10-17)

   celebrateRun({ kind, title, miles })   a workout just marked done or
       logged: a glass sheet springs up from the bottom with a tan check,
       a soft tan bloom lights behind it and thin slivers drift down.
       Resolves when it has gone, so the effort question
       (js/effortCard.js) opens after it, not over it.
   celebrateHabit(habit, { allDone, card })   a habit just checked off: a
       full-page moment made for that habit. Its own drawn icon, its own
       name and line ("Hydrated."), and a scene for its family: water
       rises for Water, streaks run past for Run, shockwaves for
       Strength, stars for Sleep, light for Prayer, and so on. The day's
       last habit says "Day complete" and sweeps a shine over its card.

   Light on purpose: CSS keyframes (css/style.css "COMPLETION MOMENTS"),
   no library, never blocks a tap. Reduced motion: the run sheet only
   fades; habits show nothing extra (the filled circle already says
   done). The toast stays the spoken message; everything here is
   aria-hidden. The pure parts are unit-tested (tests/celebrate.test.mjs).
========================================== */

import { habitIconId, habitIconSrc, habitIconById } from "./habitIconSet.js";

// What falls from the top when a workout completes: the drawn running shoe for a run.
const FALLERS = { run: "habit-icons/run.svg", strength: "habit-icons/strength.svg", session: "habit-icons/workout.svg" };
const KICKERS = { run: "Run complete", strength: "Strength complete", session: "Session complete" };

// What the run sheet says. Pure, so it's unit-tested.
export function celebrationFor({ kind = "run", title = "", miles = 0 } = {}) {
    const name = String(title || "").replace(/\s+/g, " ").trim();
    const mi = Number(miles);
    const detail = kind === "run" && mi > 0 ? `${Number.isInteger(mi) ? mi : mi.toFixed(1)} mi` : "";
    return { kicker: KICKERS[kind] || "Workout complete", title: name.length > 26 ? `${name.slice(0, 25)}…` : name, detail };
}

// Each habit icon gets its own line; the scene is shared by its family.
export const HABIT_LINES = Object.freeze({
    pray: "Time given.", bible: "In the Word.", read: "Pages turned.", journal: "Thoughts captured.", meditate: "Stillness found.",
    gratitude: "Thankful.", study: "Learning stacks up.",
    run: "Miles banked.", workout: "Sweat logged.", strength: "Stronger today.", stretch: "Loosened up.", steps: "Steps counted.",
    bike: "Wheels turned.", swim: "Laps done.", core: "Core strong.", ball: "Touches in.",
    protein: "Fuel in.", water: "Hydrated.", veggies: "Greens in.", fruit: "Fruit in.", meals: "Fueled well.", mealprep: "Prepped for the week.",
    nosugar: "Sugar skipped.", noalcohol: "Clear head.", coffee: "Cup done.", vitamins: "Covered.", fasting: "Fast held.",
    sleep: "Rested well.", cold: "Cold conquered.", sauna: "Heat done.", sun: "Light caught.", screens: "Screens down.", breathe: "Breath steady.",
    love: "Time well spent.", family: "Family first.", friends: "Connected.", tidy: "Space cleared.", money: "Money minded.", work: "Deep work done.",
    music: "Practice in.", nature: "Fresh air.", dog: "Good dog.", weigh: "Weighed in.", teeth: "Smile ready.", goal: "Goal moved.",
    star: "Gold star.", check: "Checked off."
});

const SCENES = {
    water: ["water", "cold", "swim"],
    stride: ["run", "steps", "bike", "ball"],
    impact: ["strength", "workout", "core"],
    flow: ["stretch", "breathe", "meditate", "sauna"],
    night: ["sleep"],
    nourish: ["protein", "meals", "mealprep", "fruit", "veggies", "vitamins", "coffee", "fasting", "nosugar", "noalcohol"],
    light: ["pray", "bible", "gratitude", "sun", "nature"],
    heart: ["love", "family", "friends", "dog"]
    // everything else (read, journal, study, work, money, goal…) gets "focus"
};
const SCENE_OF = Object.fromEntries(Object.entries(SCENES).flatMap(([scene, ids]) => ids.map(id => [id, scene])));

export function sceneFor(iconId) {
    return SCENE_OF[iconId] || "focus";
}

// What a habit's moment says. Pure.
export function habitMoment(habit, { allDone = false, noun = "Habit" } = {}) {
    const iconId = habitIconId(habit);
    const name = String(habit?.name ?? "").replace(/^\s*\p{Extended_Pictographic}️?\s*/u, "").replace(/\s+/g, " ").trim();
    return {
        iconId,
        scene: sceneFor(iconId),
        kicker: allDone ? "Day complete" : `${noun} done`,
        title: (name || habitIconById(iconId)?.label || "Habit").slice(0, 28),
        line: allDone ? `Every ${noun.toLowerCase()}, done.` : (HABIT_LINES[iconId] || "Done.")
    };
}

export function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function buzz(pattern) {
    try { navigator.vibrate?.(pattern); } catch { /* not on iPhone; fine */ }
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rnd = (a, b) => a + Math.random() * (b - a);
const many = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join("");
const CHECK = '<svg viewBox="0 0 64 64"><path pathLength="100" d="M16 34l12 12 22-26"/></svg>';

let current = null;
function mount(el, life) {
    current?.remove();
    document.body.appendChild(el);
    current = el;
    return new Promise(resolve => {
        setTimeout(() => el.classList.add("is-out"), life);
        setTimeout(() => { el.remove(); if (current === el) current = null; resolve(); }, life + 420);
    });
}

export function celebrateRun(info = {}) {
    if (typeof document === "undefined") return Promise.resolve();
    const { kicker, title, detail } = celebrationFor(info);
    const still = reducedMotion();
    const el = document.createElement("div");
    el.className = `sb-cel-run${still ? " is-still" : ""}`;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `${still ? "" : `<div class="sb-cel-bloom"></div>${many(18, i => `<img class="sb-cel-fall" src="${esc(FALLERS[info.kind] || FALLERS.run)}" alt="" width="40" height="40" style="left:${3 + i * 5.4}%;--s:${Math.round(rnd(26, 46))}px;--d:${rnd(.25, 1.3).toFixed(2)}s;--r:${Math.round(rnd(-45, 45))}deg;--x:${Math.round(rnd(-30, 30))}px">`)}`}
        <div class="sb-cel-sheet">
            <div class="sb-cel-lens">${CHECK}</div>
            <div class="sb-cel-txt"><small>${esc(kicker)}</small>${title ? `<h4>${esc(title)}</h4>` : ""}${detail ? `<p>${esc(detail)}</p>` : ""}</div>
        </div>`;
    if (!still) buzz([14, 50, 24]);
    return mount(el, still ? 1100 : 2500);
}

function sceneHtml(scene) {
    switch (scene) {
        case "water":
            return `<div class="hm-wave"></div><div class="hm-wave is-2"></div>${many(14, () => `<i class="hm-bubble" style="left:${rnd(6, 94).toFixed(0)}%;--s:${rnd(6, 16).toFixed(0)}px;--d:${rnd(.2, 1.1).toFixed(2)}s"></i>`)}`;
        case "stride":
            return many(10, i => `<i class="hm-streak" style="top:${8 + i * 9}%;--w:${Math.round(rnd(90, 240))}px;--d:${rnd(0, .7).toFixed(2)}s"></i>`) +
                many(7, i => `<i class="hm-step" style="left:${10 + i * 13}%;top:${72 - i * 6}%;--d:${(.15 + i * .13).toFixed(2)}s"></i>`);
        case "impact":
            return many(3, i => `<i class="hm-shock" style="--d:${(i * .16).toFixed(2)}s"></i>`) + many(14, i => `<i class="hm-shard" style="--a:${i * (360 / 14)}deg;--d:${(i % 3) * 40}ms"></i>`);
        case "flow":
            return many(3, i => `<i class="hm-breath" style="--d:${(i * .45).toFixed(2)}s"></i>`);
        case "night":
            return `<div class="hm-moon"></div>${many(26, () => `<i class="hm-star" style="left:${rnd(4, 96).toFixed(0)}%;top:${rnd(4, 90).toFixed(0)}%;--s:${rnd(2, 4.5).toFixed(1)}px;--d:${rnd(0, 1.2).toFixed(2)}s"></i>`)}`;
        case "nourish":
            return many(16, i => `<i class="hm-leaf${i % 3 === 0 ? " is-tan" : ""}" style="--a:${i * (360 / 16)}deg;--r:${Math.round(rnd(150, 300))}px;--d:${rnd(0, .35).toFixed(2)}s"></i>`);
        case "light":
            return `<div class="hm-beams"></div>${many(14, () => `<i class="hm-mote" style="left:${rnd(8, 92).toFixed(0)}%;--d:${rnd(.1, 1.2).toFixed(2)}s;--s:${rnd(3, 6).toFixed(0)}px"></i>`)}`;
        case "heart":
            return many(2, i => `<i class="hm-beat" style="--d:${(i * .42).toFixed(2)}s"></i>`) + many(12, () => `<i class="hm-ember" style="left:${rnd(10, 90).toFixed(0)}%;--d:${rnd(.2, 1.3).toFixed(2)}s;--s:${rnd(4, 8).toFixed(0)}px"></i>`);
        default:
            return many(6, i => `<i class="hm-rule" style="top:${14 + i * 14}%;--d:${(i * .09).toFixed(2)}s"></i>`) + many(10, () => `<i class="hm-tick" style="left:${rnd(8, 92).toFixed(0)}%;top:${rnd(10, 88).toFixed(0)}%;--d:${rnd(.3, 1.3).toFixed(2)}s"></i>`);
    }
}

export function celebrateHabit(habit, { allDone = false, card = null, noun = "Habit" } = {}) {
    if (typeof document === "undefined" || reducedMotion()) return Promise.resolve();
    const m = habitMoment(habit, { allDone, noun });
    const el = document.createElement("div");
    el.className = `sb-hm sb-hm-${m.scene}${allDone ? " is-day" : ""}`;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<div class="hm-scene">${sceneHtml(m.scene)}</div>
        <div class="hm-core">
            <div class="hm-lens"><svg viewBox="0 0 96 96" class="hm-ring"><circle cx="48" cy="48" r="45" pathLength="100"/></svg><img src="${esc(habitIconSrc(m.iconId))}" alt="" width="56" height="56"></div>
            <p class="hm-kicker">${esc(m.kicker)}</p>
            <p class="hm-title">${esc(m.title)}</p>
            <p class="hm-line">${esc(m.line)}</p>
        </div>`;
    buzz(allDone ? [10, 40, 18, 40, 24] : [12, 40, 12]);
    const done = mount(el, allDone ? 2900 : 2300);
    if (allDone && card) done.then(() => {
        card.classList.remove("sb-cel-all");
        void card.offsetWidth;
        card.classList.add("sb-cel-all");
        setTimeout(() => card.classList.remove("sb-cel-all"), 1300);
    });
    return done;
}
