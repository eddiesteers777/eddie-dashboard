/* ==========================================
   Southbound 3D demos — automatic movement checks (pure)

   gradeSquat({ fps, frames })  checks a squat's joint positions over one loop
   (from tools/bake.html window.track): planted feet, depth, knees over
   toes, chest up, balance over the feet, a clean loop, no jumps.
   Returns { pass, checks: [{ id, label, pass, value, limit }] }.
   A demo is "ready" only when this passes AND a person has watched it
   (exercises.json "review"); see README.md "Quality review".
   Unit-tested in tests/demo3dQa.test.mjs.
========================================== */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = v => Math.hypot(v[0], v[1], v[2]);
const deg = r => r * 180 / Math.PI;
const dist = (a, b) => len(sub(a, b));
const maxOf = (xs, f) => xs.reduce((m, x) => Math.max(m, f(x)), -Infinity);

/** The frame with the lowest hips. */
export const bottomFrame = frames => frames.reduce((b, f) => (f.Hips[1] < b.Hips[1] ? f : b), frames[0]);

/** Angle of a segment from horizontal, degrees (0 = level). */
export const fromHorizontal = (a, b) => { const d = sub(b, a); return deg(Math.atan2(Math.abs(d[1]), Math.hypot(d[0], d[2]))); };
/** Angle of a segment from vertical, degrees (0 = upright). */
export const fromVertical = (a, b) => 90 - fromHorizontal(a, b);

/** Joint speed above this (m/s) means a pop, not a controlled rep. */
export const MAX_JOINT_SPEED = 1.5;

/** track: { fps, frames } from tools/bake.html window.track. */
export function gradeSquat(track) {
    const { fps = 30, frames } = Array.isArray(track) ? { frames: track } : track;
    if (!Array.isArray(frames) || frames.length < 8) return { pass: false, checks: [{ id: "frames", label: "Enough frames to judge", pass: false, value: frames?.length || 0, limit: 8 }] };
    const checks = [];
    const add = (id, label, value, limit, ok) => checks.push({ id, label, value: Math.round(value * 1000) / 1000, limit, pass: Boolean(ok) });
    const first = frames[0];
    // 1. Feet stay planted: no slide, heels down.
    let slide = 0;
    for (const j of ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) slide = Math.max(slide, maxOf(frames, f => dist(f[j], first[j])));
    add("feet-planted", "Feet stay planted (no slide, heels down), metres", slide, 0.015, slide <= 0.015);
    // 2. Depth: hip joints come down to about knee height.
    const bot = bottomFrame(frames);
    const thigh = Math.min(fromHorizontal(bot.LeftUpLeg, bot.LeftLeg), fromHorizontal(bot.RightUpLeg, bot.RightLeg));
    add("depth", "Thighs about parallel at the bottom, degrees from level", thigh, 22, thigh <= 22);
    const drop = first.Hips[1] - bot.Hips[1];
    add("range", "Hips travel down, metres", drop, 0.3, drop >= 0.3);
    // 3. Knees track over the toes (not caving in).
    const cave = Math.max(
        Math.abs(bot.LeftFoot[0]) - Math.abs(bot.LeftLeg[0]),
        Math.abs(bot.RightFoot[0]) - Math.abs(bot.RightLeg[0]));
    add("knees-out", "Knees no narrower than the feet, metres", cave, 0.02, cave <= 0.02);
    // 4. Chest up: torso lean from vertical at the bottom.
    const lean = fromVertical(bot.Hips, bot.Spine2);
    add("chest-up", "Torso lean at the bottom, degrees", lean, 50, lean <= 50);
    // 5. Balance: the upper body's mass over the feet (heel to toe).
    const heel = Math.min(bot.LeftFoot[2], bot.RightFoot[2]) - 0.05;
    const toe = Math.max(bot.LeftToeBase[2], bot.RightToeBase[2]) + 0.05;
    const com = bot.Hips[2] * 0.5 + bot.Spine2[2] * 0.35 + bot.Head[2] * 0.15;
    const off = com < heel ? heel - com : com > toe ? com - toe : 0;
    add("balance", "Body mass over the feet, metres outside", off, 0, off === 0);
    // 6. Seamless loop and no pops between frames.
    const loopGap = maxOf(Object.keys(first), j => dist(first[j], frames[frames.length - 1][j]));
    const step = Math.max(...frames.slice(1).map((f, i) => maxOf(Object.keys(f), j => dist(f[j], frames[i][j]))));
    const speed = Math.max(step, loopGap) * fps; // a pop or IK flip shows as a joint moving far faster than a controlled rep
    add("smooth", "Fastest joint, metres per second", speed, MAX_JOINT_SPEED, speed <= MAX_JOINT_SPEED);
    return { pass: checks.every(c => c.pass), checks };
}

/** Push-up: straight line heels to head, chest to a fist off the floor, hands and toes planted, elbows bent, clean loop. */
export function gradePushup(track) {
    const { fps = 30, frames } = Array.isArray(track) ? { frames: track } : track;
    if (!Array.isArray(frames) || frames.length < 8) return { pass: false, checks: [{ id: "frames", label: "Enough frames to judge", pass: false, value: frames?.length || 0, limit: 8 }] };
    const checks = [];
    const add = (id, label, value, limit, ok) => checks.push({ id, label, value: Math.round(value * 1000) / 1000, limit, pass: Boolean(ok) });
    const first = frames[0];
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const shoulder = f => mid(f.LeftArm, f.RightArm);
    const angleAt = (a, b, c) => { const u = sub(a, b), v = sub(c, b); return deg(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (len(u) * len(v) || 1))))); };
    // 1. One straight line from shoulders through hips to ankles, in every frame.
    const bend = maxOf(frames, f => 180 - angleAt(shoulder(f), f.Hips, mid(f.LeftFoot, f.RightFoot)));
    add("body-line", "Worst bend in the shoulder-hip-ankle line, degrees", bend, 8, bend <= 8);
    // 2. Hands and toes stay planted.
    let slide = 0;
    for (const j of ["LeftHand", "RightHand", "LeftToeBase", "RightToeBase"]) slide = Math.max(slide, maxOf(frames, f => dist(f[j], first[j])));
    add("planted", "Hands and toes stay planted, metres", slide, 0.02, slide <= 0.02);
    // 3. Depth: chest comes down to about a fist off the floor.
    const low = Math.min(...frames.map(f => shoulder(f)[1]));
    add("depth", "Shoulders at the bottom, metres off the floor", low, 0.3, low <= 0.3);
    const rise = Math.max(...frames.map(f => shoulder(f)[1])) - low;
    add("range", "Chest travel, metres", rise, 0.2, rise >= 0.2);
    // 4. Elbows really bend at the bottom and extend almost straight at the top.
    const elbow = f => Math.min(angleAt(f.LeftArm, f.LeftForeArm, f.LeftHand), angleAt(f.RightArm, f.RightForeArm, f.RightHand));
    const bottom = frames.reduce((b, f) => (shoulder(f)[1] < shoulder(b)[1] ? f : b), frames[0]);
    const eb = elbow(bottom), et = elbow(first);
    add("elbow-bottom", "Elbow angle at the bottom, degrees", eb, 100, eb <= 100);
    add("elbow-top", "Elbow angle at the top (arms long, not hyperextended), degrees", et, 150, et >= 150);
    // 5. Seamless loop, no pops.
    const loopGap = maxOf(Object.keys(first), j => dist(first[j], frames[frames.length - 1][j]));
    const step = Math.max(...frames.slice(1).map((f, i) => maxOf(Object.keys(f), j => dist(f[j], frames[i][j]))));
    const speed = Math.max(step, loopGap) * fps;
    add("smooth", "Fastest joint, metres per second", speed, MAX_JOINT_SPEED, speed <= MAX_JOINT_SPEED);
    return { pass: checks.every(c => c.pass), checks };
}

export const GRADERS = { "bodyweight-squat": gradeSquat, "push-up": gradePushup };
