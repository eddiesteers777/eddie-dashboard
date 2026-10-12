/* ==========================================
   Southbound — the exercise demos (pure data + lookup)

   Each demo is a few key poses for the figure in js/demoFigure.js (joint
   angles, see there), how long one loop takes, the equipment, the camera
   angles worth showing, Southbound's own words (Start / Move / Cue) and
   the muscles (the exercise database's names, js/exerciseMuscles.js).
   A demo also answers to other names (aliases), so "Air Squat" and
   "Bodyweight Squat" find the same one.

   demoFor(name)   the demo for an exercise name, or null
   Unit-tested in tests/exerciseDemos.test.mjs (every demo renders from
   every angle, grounded, no NaN, aliases unique).
========================================== */

const STAND = { lShoulder: [2, 0, 6], rShoulder: [2, 0, -6], lElbow: [-8, 0, 0], rElbow: [-8, 0, 0] };
const both = (side, value) => ({ ["l" + side]: value.l ?? value, ["r" + side]: value.r ?? value });

export const VIEWS = {
    standing: [
        { label: "3/4", yaw: -35, pitch: 10 },
        { label: "Side", yaw: -90, pitch: 4 },
        { label: "Front", yaw: 0, pitch: 6 },
        { label: "Back", yaw: 160, pitch: 8 }
    ],
    floor: [
        { label: "3/4", yaw: -42, pitch: 16 },
        { label: "Side", yaw: -90, pitch: 6 },
        { label: "Front 3/4", yaw: 42, pitch: 16 },
        { label: "Back 3/4", yaw: 140, pitch: 16 }
    ]
};

// ---------- Poses ----------

const squatTop = { ...STAND, ...both("Hip", { l: [0, 0, 6], r: [0, 0, -6] }) };
const squatBottom = {
    root: [30, 0, 0], neck: [-22, 0, 0],
    ...both("Hip", { l: [-120, 0, 9], r: [-120, 0, -9] }), ...both("Knee", [118, 0, 0]), ...both("Ankle", [-28, 0, 0]),
    ...both("Shoulder", { l: [-120, 0, 4], r: [-120, 0, -4] }), ...both("Elbow", [0, 0, 0])
};
const squatArmsUp = { ...squatTop, ...both("Shoulder", { l: [-20, 0, 6], r: [-20, 0, -6] }) };

// Elbows bent and the forearms turned in (y), so the hands meet at the chest.
const gobletArms = { lShoulder: [-34, 0, -8], rShoulder: [-34, 0, 8], lElbow: [-108, -52, 0], rElbow: [-108, 52, 0], lWrist: [0, 0, 0], rWrist: [0, 0, 0] };
const gobletTop = { ...squatTop, ...gobletArms };
const gobletBottom = { ...squatBottom, root: [18, 0, 0], neck: [-12, 0, 0], ...both("Hip", { l: [-108, 0, 10], r: [-108, 0, -10] }), ...both("Knee", [120, 0, 0]), ...both("Ankle", [-30, 0, 0]), ...gobletArms, lShoulder: [-22, 0, -8], rShoulder: [-22, 0, 8] };

const plank = {
    root: [80, 0, 0], neck: [-6, 0, 0],
    ...both("Shoulder", [-80, 0, 0]), ...both("Elbow", [-90, 0, 0]), ...both("Wrist", [0, 0, 0]),
    ...both("Hip", { l: [0, 0, 3], r: [0, 0, -3] }), ...both("Knee", [0, 0, 0]), ...both("Ankle", [6, 0, 0])
};

const birdBase = {
    root: [90, 0, 0], spine: [-4, 0, 0], neck: [10, 0, 0],
    ...both("Shoulder", [-90, 0, 0]), ...both("Elbow", [0, 0, 0]), ...both("Wrist", [-80, 0, 0]),
    ...both("Hip", [-90, 0, 0]), ...both("Knee", [90, 0, 0]), ...both("Ankle", [72, 0, 0])
};
const birdLeft = { ...birdBase, rShoulder: [-176, 0, 0], rWrist: [0, 0, 0], lHip: [-2, 0, 0], lKnee: [2, 0, 0], lAnkle: [50, 0, 0] };
const birdRight = { ...birdBase, lShoulder: [-176, 0, 0], lWrist: [0, 0, 0], rHip: [-2, 0, 0], rKnee: [2, 0, 0], rAnkle: [50, 0, 0] };

const deadBugBase = {
    root: [-90, 0, 0],
    ...both("Shoulder", [-90, 0, 0]), ...both("Elbow", [0, 0, 0]),
    ...both("Hip", [-90, 0, 0]), ...both("Knee", [90, 0, 0]), ...both("Ankle", [-10, 0, 0])
};
const deadBugA = { ...deadBugBase, rShoulder: [-168, 0, 0], lHip: [-22, 0, 0], lKnee: [4, 0, 0], lAnkle: [20, 0, 0] };
const deadBugB = { ...deadBugBase, lShoulder: [-168, 0, 0], rHip: [-22, 0, 0], rKnee: [4, 0, 0], rAnkle: [20, 0, 0] };

const bridgeDown = {
    root: [-90, 0, 0],
    ...both("Shoulder", { l: [0, 0, 12], r: [0, 0, -12] }),
    ...both("Hip", { l: [-45, 0, 4], r: [-45, 0, -4] }), ...both("Knee", [115, 0, 0]), ...both("Ankle", [20, 0, 0])
};
const bridgeUp = {
    root: [-118, 0, 0], neck: [26, 0, 0],
    ...both("Shoulder", { l: [28, 0, 12], r: [28, 0, -12] }),
    ...both("Hip", { l: [2, 0, 4], r: [2, 0, -4] }), ...both("Knee", [104, 0, 0]), ...both("Ankle", [10, 0, 0])
};

const calfDown = { ...STAND, ...both("Hip", { l: [0, 0, 3], r: [0, 0, -3] }) };
const calfUp = { ...calfDown, ...both("Ankle", [30, 0, 0]) };
const oneLegDown = { ...calfDown, rHip: [-4, 0, -2], rKnee: [80, 0, 0], rAnkle: [20, 0, 0], lShoulder: [2, 0, 10] };
const oneLegUp = { ...oneLegDown, lAnkle: [30, 0, 0] };

const lungeTop = { ...STAND };
const lungeBottom = {
    ...STAND, root: [6, 0, 0], neck: [-6, 0, 0],
    lHip: [-92, 0, 3], lKnee: [92, 0, 0], lAnkle: [-6, 0, 0],
    rHip: [18, 0, -3], rKnee: [82, 0, 0], rAnkle: [-50, 0, 0],
    lShoulder: [-6, 0, 8], rShoulder: [14, 0, -8]
};

const pushTop = {
    root: [74, 0, 0], neck: [-4, 0, 0],
    ...both("Shoulder", { l: [-74, 0, 6], r: [-74, 0, -6] }), ...both("Elbow", [0, 0, 0]), ...both("Wrist", [-88, 0, 0]),
    ...both("Hip", { l: [0, 0, 2], r: [0, 0, -2] }), ...both("Knee", [0, 0, 0]), ...both("Ankle", [4, 0, 0])
};
const pushBottom = { ...pushTop, ...both("Shoulder", { l: [-26, 0, 22], r: [-26, 0, -22] }), ...both("Elbow", [-64, 0, 0]), ...both("Wrist", [-88, 0, 0]) };

const rdlTop = { ...STAND, ...both("Shoulder", { l: [-8, 0, 3], r: [-8, 0, -3] }), ...both("Elbow", [0, 0, 0]), ...both("Hip", { l: [0, 0, 4], r: [0, 0, -4] }) };
const rdlBottom = {
    ...rdlTop, root: [72, 0, 0], neck: [-8, 0, 0],
    ...both("Hip", { l: [-80, 0, 4], r: [-80, 0, -4] }), ...both("Knee", [18, 0, 0]), ...both("Ankle", [-10, 0, 0]),
    ...both("Shoulder", { l: [-72, 0, 3], r: [-72, 0, -3] })
};
const rdlBarTop = { ...rdlTop, ...both("Shoulder", { l: [-8, 0, 9], r: [-8, 0, -9] }) };
const rdlBarBottom = { ...rdlBottom, ...both("Shoulder", { l: [-72, 0, 9], r: [-72, 0, -9] }) };

const rowDown = {
    root: [74, 0, 0], neck: [-8, 0, 0],
    lShoulder: [-74, 0, 0], lElbow: [0, 0, 0], lWrist: [-78, 0, 0],
    lHip: [-74, 0, 0], lKnee: [90, 0, 0], lAnkle: [72, 0, 0],
    rHip: [-68, 0, -10], rKnee: [14, 0, 0], rAnkle: [-6, 0, 0],
    rShoulder: [-74, 0, -2], rElbow: [0, 0, 0]
};
const rowUp = { ...rowDown, rShoulder: [-8, 0, -6], rElbow: [-76, 0, 0] };

// ---------- Demos ----------

export const DEMOS = [
    {
        id: "bodyweight-squat", name: "Bodyweight Squat", aliases: ["Squat", "Air Squat", "Bodyweight Squats", "Squats"],
        seconds: 3.4, anchor: ["lAn", "rAn"], views: VIEWS.standing,
        keys: [{ at: 0, pose: squatTop }, { at: 0.42, pose: squatBottom }, { at: 0.56, pose: squatBottom }, { at: 1, pose: squatTop }],
        start: "Feet a little wider than your hips, toes turned out slightly.",
        move: "Sit your hips back and down until your thighs are about level, arms reaching forward for balance. Drive through your whole foot to stand.",
        cue: "Knees track over your toes; chest proud the whole way.",
        muscles: { primary: ["quadriceps", "glutes"], secondary: ["hamstrings", "calves", "lower back", "abdominals"] }
    },
    {
        id: "goblet-squat", name: "Goblet Squat", aliases: ["Dumbbell Goblet Squat", "Kettlebell Goblet Squat", "Goblet Squats"],
        seconds: 3.6, anchor: ["lAn", "rAn"], views: VIEWS.standing, equipment: [{ type: "goblet" }],
        keys: [{ at: 0, pose: gobletTop }, { at: 0.44, pose: gobletBottom }, { at: 0.56, pose: gobletBottom }, { at: 1, pose: gobletTop }],
        start: "Hold one dumbbell upright against your chest, elbows under it. Feet just wider than your hips.",
        move: "Sit down between your heels, elbows brushing the inside of your knees. Stand back up the same way.",
        cue: "Keep the weight close and your chest tall, like you're showing the logo on your shirt.",
        muscles: { primary: ["quadriceps", "glutes"], secondary: ["hamstrings", "abdominals", "calves", "forearms"] }
    },
    {
        id: "plank", name: "Plank", aliases: ["Forearm Plank", "Front Plank", "Elbow Plank", "Planks"],
        seconds: 4, views: VIEWS.floor, mat: true, level: ["lEl", "lToe", 4],
        keys: [{ at: 0, pose: plank }, { at: 0.5, pose: { ...plank, spine: [-2, 0, 0], ...both("Hip", { l: [2, 0, 3], r: [2, 0, -3] }) } }, { at: 1, pose: plank }],
        start: "Forearms on the floor, elbows under your shoulders, legs long, up on your toes.",
        move: "Hold one straight line from your head to your heels. Breathe steadily.",
        cue: "Squeeze your glutes and pull your belly button in; don't let your hips sag or pike up.",
        muscles: { primary: ["abdominals"], secondary: ["shoulders", "glutes", "quadriceps", "lower back"] }
    },
    {
        id: "bird-dog", name: "Bird Dog", aliases: ["Bird Dogs", "Birddog", "Quadruped Bird Dog"],
        seconds: 5, views: VIEWS.floor, mat: true,
        keys: [{ at: 0, pose: birdBase }, { at: 0.2, pose: birdLeft }, { at: 0.32, pose: birdLeft }, { at: 0.5, pose: birdBase }, { at: 0.7, pose: birdRight }, { at: 0.82, pose: birdRight }, { at: 1, pose: birdBase }],
        start: "On all fours: hands under shoulders, knees under hips, back flat.",
        move: "Reach one arm forward and the opposite leg back until both are level with your back. Hold for a breath, return, switch sides.",
        cue: "Hips stay square to the floor, like a glass of water on your lower back.",
        muscles: { primary: ["lower back", "glutes"], secondary: ["abdominals", "shoulders", "hamstrings"] }
    },
    {
        id: "dead-bug", name: "Dead Bug", aliases: ["Dead Bugs", "Deadbug"],
        seconds: 5, views: VIEWS.floor, mat: true,
        keys: [{ at: 0, pose: deadBugBase }, { at: 0.22, pose: deadBugA }, { at: 0.32, pose: deadBugA }, { at: 0.5, pose: deadBugBase }, { at: 0.72, pose: deadBugB }, { at: 0.82, pose: deadBugB }, { at: 1, pose: deadBugBase }],
        start: "On your back, arms straight up to the ceiling, knees bent at 90° over your hips.",
        move: "Lower one arm overhead and the opposite leg toward the floor at the same time. Come back, switch sides.",
        cue: "Press your lower back into the floor the whole time; only go as low as you can keep it there.",
        muscles: { primary: ["abdominals"], secondary: ["quadriceps", "shoulders", "lower back"] }
    },
    {
        id: "glute-bridge", name: "Glute Bridge", aliases: ["Bridge", "Hip Raise", "Glute Bridges", "Bodyweight Glute Bridge"],
        seconds: 3.4, views: VIEWS.floor, mat: true, anchor: ["lAn", "rAn"], level: ["chest", "lHeel", 9],
        keys: [{ at: 0, pose: bridgeDown }, { at: 0.4, pose: bridgeUp }, { at: 0.6, pose: bridgeUp }, { at: 1, pose: bridgeDown }],
        start: "On your back, knees bent, feet flat and hip-width apart, arms by your sides.",
        move: "Drive through your heels and lift your hips until your body is straight from shoulders to knees. Pause, then lower slowly.",
        cue: "Finish with your glutes, not your lower back; ribs stay down.",
        muscles: { primary: ["glutes"], secondary: ["hamstrings", "lower back", "abdominals"] }
    },
    {
        id: "band-hip-raise", name: "Band Hip Raise", aliases: ["Banded Glute Bridge", "Band Glute Bridge", "Banded Hip Raise"],
        seconds: 3.4, views: VIEWS.floor, mat: true, anchor: ["lAn", "rAn"], level: ["chest", "lHeel", 9], equipment: [{ type: "band" }],
        keys: [{ at: 0, pose: bridgeDown }, { at: 0.4, pose: bridgeUp }, { at: 0.6, pose: bridgeUp }, { at: 1, pose: bridgeDown }],
        start: "A band just above your knees. On your back, knees bent, feet flat.",
        move: "Push your knees out against the band and lift your hips until you're straight from shoulders to knees. Lower slowly.",
        cue: "Keep the band tight the whole rep; knees never cave in.",
        muscles: { primary: ["glutes"], secondary: ["abductors", "hamstrings", "lower back"] }
    },
    {
        id: "standing-calf-raise", name: "Standing Calf Raise", aliases: ["Calf Raise", "Calf Raises", "Standing Calf Raises", "Bodyweight Calf Raise"],
        seconds: 2.6, anchor: ["lToe", "rToe"], views: VIEWS.standing,
        keys: [{ at: 0, pose: calfDown }, { at: 0.4, pose: calfUp }, { at: 0.55, pose: calfUp }, { at: 1, pose: calfDown }],
        start: "Stand tall, feet hip-width, weight on the balls of your feet.",
        move: "Rise as high as you can onto your toes, pause at the top, then lower slowly all the way down.",
        cue: "Straight up and down; don't roll out onto your little toes.",
        muscles: { primary: ["calves"], secondary: [] }
    },
    {
        id: "single-leg-calf-raise", name: "Single-Leg Calf Raise", aliases: ["Single Leg Calf Raise", "One-Leg Calf Raise", "Single-Leg Calf Raises"],
        seconds: 2.8, anchor: ["lToe"], views: VIEWS.standing,
        keys: [{ at: 0, pose: oneLegDown }, { at: 0.4, pose: oneLegUp }, { at: 0.55, pose: oneLegUp }, { at: 1, pose: oneLegDown }],
        start: "Stand on one foot, the other foot lifted behind you. A hand on a wall for balance is fine.",
        move: "Rise onto your toes as high as you can, pause, lower slowly. Do every rep, then switch legs.",
        cue: "The slow way down is where the work is.",
        muscles: { primary: ["calves"], secondary: [] }
    },
    {
        id: "reverse-lunge", name: "Reverse Lunge", aliases: ["Reverse Lunges", "Bodyweight Reverse Lunge", "Dumbbell Reverse Lunge"],
        seconds: 3.6, anchor: ["lAn"], views: [{ label: "3/4", yaw: -62, pitch: 8 }, ...VIEWS.standing.slice(1)],
        keys: [{ at: 0, pose: lungeTop }, { at: 0.44, pose: lungeBottom }, { at: 0.56, pose: lungeBottom }, { at: 1, pose: lungeTop }],
        start: "Stand tall, feet hip-width.",
        move: "Step one foot back and lower until your back knee nearly touches the floor and your front thigh is level. Push through your front foot to stand.",
        cue: "Front shin stays nearly vertical; most of your weight on the front heel.",
        muscles: { primary: ["quadriceps", "glutes"], secondary: ["hamstrings", "adductors", "calves"] }
    },
    {
        id: "push-up", name: "Push-Up", aliases: ["Push Up", "Pushup", "Push-Ups", "Push Ups", "Pushups"],
        seconds: 2.8, views: VIEWS.floor, mat: true, level: ["lHd", "lToe", 1.5],
        keys: [{ at: 0, pose: pushTop }, { at: 0.45, pose: pushBottom }, { at: 0.55, pose: pushBottom }, { at: 1, pose: pushTop }],
        start: "Hands just wider than your shoulders, body straight from head to heels.",
        move: "Lower your chest toward the floor with your elbows about 45° from your body, then press back up.",
        cue: "Move as one plank: hips rise and fall with your shoulders.",
        muscles: { primary: ["chest"], secondary: ["triceps", "shoulders", "abdominals"] }
    },
    {
        id: "dumbbell-rdl", name: "Dumbbell Romanian Deadlift", aliases: ["Dumbbell RDL", "DB RDL", "DB Romanian Deadlift", "Dumbbell Romanian Deadlifts"],
        seconds: 3.8, anchor: ["lAn", "rAn"], views: VIEWS.standing, equipment: [{ type: "dumbbell" }],
        keys: [{ at: 0, pose: rdlTop }, { at: 0.46, pose: rdlBottom }, { at: 0.56, pose: rdlBottom }, { at: 1, pose: rdlTop }],
        start: "Stand tall with a dumbbell in each hand in front of your thighs, knees soft.",
        move: "Push your hips back and let the weights slide down your legs until you feel your hamstrings stretch, about mid-shin. Drive your hips forward to stand.",
        cue: "Flat back, weights close; it's a hip hinge, not a squat.",
        muscles: { primary: ["hamstrings", "glutes"], secondary: ["lower back", "forearms", "traps"] }
    },
    {
        id: "romanian-deadlift", name: "Romanian Deadlift", aliases: ["RDL", "Barbell RDL", "Barbell Romanian Deadlift", "Romanian Deadlifts"],
        seconds: 3.8, anchor: ["lAn", "rAn"], views: VIEWS.standing, equipment: [{ type: "barbell" }],
        keys: [{ at: 0, pose: rdlBarTop }, { at: 0.46, pose: rdlBarBottom }, { at: 0.56, pose: rdlBarBottom }, { at: 1, pose: rdlBarTop }],
        start: "Hold the bar at hip height, hands just outside your thighs, knees soft.",
        move: "Push your hips back, sliding the bar down your thighs until your hamstrings stretch. Drive your hips through to stand.",
        cue: "Bar stays touching your legs; shoulders over the bar.",
        muscles: { primary: ["hamstrings", "glutes"], secondary: ["lower back", "forearms", "traps"] }
    },
    {
        id: "one-arm-dumbbell-row", name: "One-Arm Dumbbell Row", aliases: ["Single-Arm Dumbbell Row", "One Arm Dumbbell Row", "Dumbbell Row", "One-Arm Row", "Single Arm Row"],
        seconds: 3, views: VIEWS.standing, level: ["lHd", "lKn", -2.5],
        equipment: [{ type: "bench", under: ["lKn", "lHd"], pad: 4.5, size: [32, 120], dz: 6 }, { type: "dumbbell", hands: ["r"], axis: "front" }],
        keys: [{ at: 0, pose: rowDown }, { at: 0.42, pose: rowUp }, { at: 0.55, pose: rowUp }, { at: 1, pose: rowDown }],
        start: "One knee and the same hand on a bench, the other foot on the floor, back flat. Dumbbell hanging in your free hand.",
        move: "Pull the dumbbell up toward your hip, elbow close to your side, then lower it until your arm is straight.",
        cue: "Lead with your elbow and keep your shoulders square; don't twist to lift it.",
        muscles: { primary: ["lats", "middle back"], secondary: ["biceps", "shoulders", "forearms"] }
    }
];

export const normalizeName = name => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const INDEX = new Map();
for (const d of DEMOS) for (const n of [d.name, ...(d.aliases || [])]) INDEX.set(normalizeName(n), d);

/** The demo for an exercise name ("Goblet Squat", "goblet squats"), or null. */
export function demoFor(name) {
    return INDEX.get(normalizeName(name)) || null;
}
