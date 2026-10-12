/* ==========================================
   Southbound — the 3D exercise clips (pure data + lookup)

   Rendered videos of a 3D athlete doing an exercise: 1080 × 1080,
   30 fps, one seamless loop of 2–3 slow reps (a hold for the plank), no
   sound or text. Each lives in videos/ as <id>.webm (VP9, small),
   <id>.mp4 (H.264, plays everywhere) and <id>.jpg (the poster, the
   starting position). The How to sheet (js/exerciseDemoSheet.js) plays
   one when it exists and falls back to the drawn figure
   (js/exerciseDemos.js) when it can't load (offline before it was seen).
   Not precached by the service worker: a few MB each, fetched on demand.

   clipFor(name)   the clip for an exercise name, or null
   clipSources(c)  { webm, mp4, poster }
========================================== */

import { demoFor, normalizeName } from "./exerciseDemos.js";

// start / move / cue come from the figure's demo when there is one.
export const CLIPS = [
    {
        id: "barbell-back-squat", name: "Barbell Back Squat", seconds: 9,
        aliases: ["Back Squat", "Barbell Squat", "Barbell Squats", "Back Squats", "Barbell Back Squats", "High Bar Squat", "High-Bar Back Squat"],
        start: "Bar on your upper back, hands just outside your shoulders, feet about shoulder-width with your toes turned out a little.",
        move: "Sit your hips back and down until your thighs are about parallel, then drive up through your whole foot.",
        cue: "Keep the bar over the middle of your foot and your chest proud; knees track over your toes.",
        muscles: { primary: ["quadriceps", "glutes"], secondary: ["hamstrings", "adductors", "lower back", "abdominals"] }
    },
    { id: "plank", name: "Plank", seconds: 8 },
    { id: "push-up", name: "Push-Up", seconds: 8.4 },
    {
        id: "pull-up", name: "Pull-Up", seconds: 9,
        aliases: ["Pull Up", "Pullup", "Pull-Ups", "Pull Ups", "Pullups", "Overhand Pull-Up", "Bodyweight Pull-Up"],
        start: "Hang from the bar with straight arms, hands just wider than your shoulders, palms facing away.",
        move: "Pull your shoulder blades down, then pull until your chin clears the bar. Lower all the way to straight arms under control.",
        cue: "Lead with your chest and keep your legs still; no swinging or kicking.",
        muscles: { primary: ["lats"], secondary: ["biceps", "middle back", "forearms", "shoulders"] }
    }
];

const INDEX = new Map();
for (const c of CLIPS) {
    const demo = demoFor(c.name);
    const full = demo ? { ...c, aliases: [...(demo.aliases || []), ...(c.aliases || [])], start: c.start || demo.start, move: c.move || demo.move, cue: c.cue || demo.cue, muscles: c.muscles || demo.muscles } : c;
    for (const n of [c.name, ...(full.aliases || [])]) INDEX.set(normalizeName(n), full);
}

/** The clip for an exercise name ("Back Squat", "pull ups"), or null. */
export function clipFor(name) {
    return INDEX.get(normalizeName(name)) || null;
}

export function clipSources(clip) {
    const base = `videos/${clip.id}`;
    return { webm: `${base}.webm`, mp4: `${base}.mp4`, poster: `${base}.jpg` };
}
