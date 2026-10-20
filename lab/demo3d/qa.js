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


/** Checks every exercise shares (ported in spirit from OpenGym3D's joint QA): the limbs keep their length, the loop closes. */
const LIMBS = [["LeftUpLeg", "LeftLeg"], ["LeftLeg", "LeftFoot"], ["RightUpLeg", "RightLeg"], ["RightLeg", "RightFoot"],
    ["LeftArm", "LeftForeArm"], ["LeftForeArm", "LeftHand"], ["RightArm", "RightForeArm"], ["RightForeArm", "RightHand"]];
export function commonChecks(frames, add) {
    let drift = 0;
    for (const [a, b] of LIMBS) {
        if (!frames[0][a] || !frames[0][b]) continue;
        const ls = frames.map(f => dist(f[a], f[b])), mean = ls.reduce((x, y) => x + y, 0) / ls.length;
        drift = Math.max(drift, ...ls.map(l => Math.abs(l - mean) / mean));
    }
    add("limb-length", "Limbs keep their length (largest change, share of the bone)", drift, 0.03, drift <= 0.03);
    const keys = Object.keys(frames[0]);
    const gap = maxOf(keys, j => dist(frames[0][j], frames[frames.length - 1][j]));
    const step = Math.max(...frames.slice(1).map((f, i) => maxOf(keys, j => dist(f[j], frames[i][j]))), 1e-6);
    add("loop-closes", "The loop closes: last frame to first, in steps", gap / step, 1.5, gap / step <= 1.5);
}

/** Squat phases (down, bottom, up) in order, a knee bend like real squats, and a teachable tempo. */
export function squatPhaseChecks(frames, fps, reps, add, kneeRange = [100, 135]) {
    const n = Math.round(frames.length / (reps || 1)), one = frames.slice(0, n);
    const y = one.map(f => f.Hips[1]), bot = y.indexOf(Math.min(...y)), top = Math.max(...y), range = top - Math.min(...y);
    let back = 0; // how much the hips move the wrong way (up while going down, down while coming up)
    for (let i = 1; i < y.length; i++) { const d = y[i] - y[i - 1]; back = Math.max(back, i <= bot ? d : -d); }
    add("phase-order", "Down, then bottom, then up (hips never go the wrong way), metres", back, 0.005, back <= 0.005);
    const first = one.findIndex(v => top - v.Hips[1] > range * 0.05), last = one.length - 1 - [...one].reverse().findIndex(v => top - v.Hips[1] > range * 0.05);
    const down = (bot - first) / fps, up = (last - bot) / fps;
    add("tempo-down", "Lowering takes at least a second (real squats in motion capture: 0.8 s; a demo is slower to be readable), seconds", down, 1, down >= 1);
    add("tempo-up", "Standing back up takes at least a second, seconds", up, 1, up >= 1);
    const b = frames[bot], v = (p, q) => sub(q, p), ang = (a, c) => deg(Math.acos((a[0] * c[0] + a[1] * c[1] + a[2] * c[2]) / len(a) / len(c)));
    const knee = 180 - ang(v(b.LeftLeg, b.LeftUpLeg), v(b.LeftLeg, b.LeftFoot));
    add("knee-bend", "Knee bend at the bottom, degrees (real squats in motion capture: 121 to 124)", knee, kneeRange[0], knee >= kneeRange[0] && knee <= kneeRange[1]);
}

/** track: { fps, frames } from tools/bake.html window.track. */
export function gradeSquat(track) {
    const { fps = 30, frames, reps = 1 } = Array.isArray(track) ? { frames: track } : track;
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
    squatPhaseChecks(frames, fps, reps, add);
    commonChecks(frames, add);
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
    commonChecks(frames, add);
    return { pass: checks.every(c => c.pass), checks };
}

/** Reverse lunge: the front foot stays put, the back foot steps back and rests on its toes, the front thigh gets about level, the back knee comes close to the floor, torso upright. */
export function gradeLunge(track) {
    const { fps = 30, frames, reps = 1 } = Array.isArray(track) ? { frames: track } : track;
    if (!Array.isArray(frames) || frames.length < 8) return { pass: false, checks: [{ id: "frames", label: "Enough frames to judge", pass: false, value: frames?.length || 0, limit: 8 }] };
    const checks = [];
    const add = (id, label, value, limit, ok) => checks.push({ id, label, value: Math.round(value * 1000) / 1000, limit, pass: Boolean(ok) });
    const first = frames[0], bot = bottomFrame(frames);
    let slide = 0;
    for (const j of ["LeftFoot", "LeftToeBase"]) slide = Math.max(slide, maxOf(frames, f => dist(f[j], first[j])));
    add("front-planted", "Front foot stays planted, metres", slide, 0.015, slide <= 0.015);
    const step = first.RightFoot[2] - bot.RightFoot[2];
    add("step-back", "Back foot steps back, metres", step, 0.4, step >= 0.4);
    const toe = bot.RightToeBase[1] - first.RightToeBase[1];
    add("back-toe-down", "Back toes rest on the floor at the bottom (height change of the toe joint), metres", toe, 0.02, toe <= 0.02);
    const thigh = fromHorizontal(bot.LeftUpLeg, bot.LeftLeg);
    add("front-thigh", "Front thigh about level at the bottom, degrees from level", thigh, 20, thigh <= 20);
    const knee = bot.RightLeg[1];
    add("back-knee-low", "Back knee close to the floor at the bottom, metres", knee, 0.16, knee <= 0.16);
    const ahead = bot.LeftLeg[2] - bot.LeftFoot[2];
    add("front-knee", "Front knee stays over the foot (not far past the ankle), metres", ahead, 0.12, ahead <= 0.12);
    const lean = fromVertical(bot.Hips, bot.Spine2);
    add("chest-up", "Torso lean at the bottom, degrees", lean, 25, lean <= 25);
    const drop = first.Hips[1] - bot.Hips[1];
    add("range", "Hips travel down, metres", drop, 0.3, drop >= 0.3);
    const loopGap = maxOf(Object.keys(first), j => dist(first[j], frames[frames.length - 1][j]));
    const stepMax = Math.max(...frames.slice(1).map((f, i) => maxOf(Object.keys(f), j => dist(f[j], frames[i][j]))));
    const speed = Math.max(stepMax, loopGap) * fps;
    add("smooth", "Fastest joint, metres per second", speed, MAX_JOINT_SPEED, speed <= MAX_JOINT_SPEED);
    squatPhaseChecks(frames, fps, reps, add, [80, 120]);
    commonChecks(frames, add);
    return { pass: checks.every(c => c.pass), checks };
}

/** Dumbbell row: feet planted, hinged flat back that holds still, elbows bend and drive back, a controlled pull and lower. */
export function gradeRow(track) {
    const { fps = 30, frames, reps = 1 } = Array.isArray(track) ? { frames: track } : track;
    if (!Array.isArray(frames) || frames.length < 8) return { pass: false, checks: [{ id: "frames", label: "Enough frames to judge", pass: false, value: frames?.length || 0, limit: 8 }] };
    const checks = [];
    const add = (id, label, value, limit, ok) => checks.push({ id, label, value: Math.round(value * 1000) / 1000, limit, pass: Boolean(ok) });
    const first = frames[0];
    let slide = 0;
    for (const j of ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) slide = Math.max(slide, maxOf(frames, f => dist(f[j], first[j])));
    add("feet-planted", "Feet stay planted, metres", slide, 0.015, slide <= 0.015);
    const leans = frames.map(f => fromVertical(f.Hips, f.Spine2));
    const lo = Math.min(...leans), hi = Math.max(...leans);
    add("hinge", "Torso leans well forward (smallest lean from upright), degrees", lo, 35, lo >= 35 && hi <= 75);
    add("back-still", "Torso holds still while the arms row (change in lean), degrees", hi - lo, 6, hi - lo <= 6);
    const hipMove = maxOf(frames, f => dist(f.Hips, first.Hips));
    add("hips-still", "Hips hold still, metres", hipMove, 0.03, hipMove <= 0.03);
    const wristY = f => (f.LeftHand[1] + f.RightHand[1]) / 2;
    const ys = frames.map(wristY), travel = Math.max(...ys) - Math.min(...ys);
    add("range", "Hands travel up toward the ribs, metres", travel, 0.3, travel >= 0.3);
    const top = frames[ys.indexOf(Math.max(...ys))], eTop = Math.max(angleBetween(top.LeftArm, top.LeftForeArm, top.LeftHand), angleBetween(top.RightArm, top.RightForeArm, top.RightHand));
    const eHang = Math.min(angleBetween(first.LeftArm, first.LeftForeArm, first.LeftHand), angleBetween(first.RightArm, first.RightForeArm, first.RightHand));
    add("elbow-top", "Elbows bend at the top of the pull, degrees", eTop, 100, eTop <= 100);
    add("elbow-hang", "Arms hang long at the bottom, degrees", eHang, 150, eHang >= 150);
    const sym = Math.abs(top.LeftHand[1] - top.RightHand[1]);
    add("symmetry", "Both hands reach the same height, metres", sym, 0.03, sym <= 0.03);
    // Pull then lower, never the wrong way, and neither slower than a second nor a jerk.
    const n = Math.round(frames.length / (reps || 1)), one = ys.slice(0, n), peak = one.indexOf(Math.max(...one)), rangeY = Math.max(...one) - Math.min(...one);
    let back = 0;
    for (let i = 1; i < one.length; i++) { const d = one[i] - one[i - 1]; back = Math.max(back, i <= peak ? -d : d); }
    add("phase-order", "Pull up, then lower (hands never go the wrong way), metres", back, 0.005, back <= 0.005);
    const start = one.findIndex(v => v - Math.min(...one) > rangeY * 0.05), end = one.length - 1 - [...one].reverse().findIndex(v => v - Math.min(...one) > rangeY * 0.05);
    const pull = (peak - start) / fps, lower = (end - peak) / fps;
    add("tempo-pull", "The pull takes at least a second, seconds", pull, 1, pull >= 1);
    add("tempo-lower", "Lowering takes at least a second and a half, seconds", lower, 1.5, lower >= 1.5);
    const loopGap = maxOf(Object.keys(first), j => dist(first[j], frames[frames.length - 1][j]));
    const stepMax = Math.max(...frames.slice(1).map((f, i) => maxOf(Object.keys(f), j => dist(f[j], frames[i][j]))));
    const speed = Math.max(stepMax, loopGap) * fps;
    add("smooth", "Fastest joint, metres per second", speed, MAX_JOINT_SPEED, speed <= MAX_JOINT_SPEED);
    commonChecks(frames, add);
    return { pass: checks.every(c => c.pass), checks };
}

/** Standing dumbbell press: feet planted, upright body that holds still, hands start at the shoulders, end overhead with long arms, controlled up and down. */
export function gradePress(track) {
    const { fps = 30, frames, reps = 1 } = Array.isArray(track) ? { frames: track } : track;
    if (!Array.isArray(frames) || frames.length < 8) return { pass: false, checks: [{ id: "frames", label: "Enough frames to judge", pass: false, value: frames?.length || 0, limit: 8 }] };
    const checks = [];
    const add = (id, label, value, limit, ok) => checks.push({ id, label, value: Math.round(value * 1000) / 1000, limit, pass: Boolean(ok) });
    const first = frames[0];
    let slide = 0;
    for (const j of ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) slide = Math.max(slide, maxOf(frames, f => dist(f[j], first[j])));
    add("feet-planted", "Feet stay planted, metres", slide, 0.015, slide <= 0.015);
    const lean = maxOf(frames, f => fromVertical(f.Hips, f.Spine2));
    add("upright", "Torso stays upright (largest lean from vertical), degrees", lean, 12, lean <= 12);
    const hipMove = maxOf(frames, f => dist(f.Hips, first.Hips));
    add("hips-still", "Hips hold still, metres", hipMove, 0.03, hipMove <= 0.03);
    const handY = f => (f.LeftHand[1] + f.RightHand[1]) / 2;
    const ys = frames.map(handY), travel = Math.max(...ys) - Math.min(...ys);
    add("range", "Hands travel up, metres", travel, 0.35, travel >= 0.35);
    const shoulderY = (first.LeftArm[1] + first.RightArm[1]) / 2, rack = handY(first) - shoulderY;
    add("start-at-shoulders", "Hands start near shoulder height, metres above the shoulders", rack, 0.2, rack >= -0.05 && rack <= 0.2);
    const topFrame = frames[ys.indexOf(Math.max(...ys))];
    const over = handY(topFrame) - topFrame.Head[1];
    add("overhead", "Hands finish above the head, metres", over, 0.1, over >= 0.1);
    const eTop = Math.min(angleBetween(topFrame.LeftArm, topFrame.LeftForeArm, topFrame.LeftHand), angleBetween(topFrame.RightArm, topFrame.RightForeArm, topFrame.RightHand));
    const eRack = Math.max(angleBetween(first.LeftArm, first.LeftForeArm, first.LeftHand), angleBetween(first.RightArm, first.RightForeArm, first.RightHand));
    add("elbow-top", "Arms long at the top (smaller elbow angle), degrees", eTop, 160, eTop >= 160);
    add("elbow-rack", "Elbows bent at the shoulders, degrees", eRack, 90, eRack <= 90);
    const sym = Math.abs(topFrame.LeftHand[1] - topFrame.RightHand[1]);
    add("symmetry", "Both hands reach the same height, metres", sym, 0.03, sym <= 0.03);
    const n = Math.round(frames.length / (reps || 1)), one = ys.slice(0, n), peak = one.indexOf(Math.max(...one)), rangeY = Math.max(...one) - Math.min(...one);
    let back = 0;
    for (let i = 1; i < one.length; i++) { const d = one[i] - one[i - 1]; back = Math.max(back, i <= peak ? -d : d); }
    add("phase-order", "Press up, then lower (hands never go the wrong way), metres", back, 0.005, back <= 0.005);
    const start = one.findIndex(v => v - Math.min(...one) > rangeY * 0.05), end = one.length - 1 - [...one].reverse().findIndex(v => v - Math.min(...one) > rangeY * 0.05);
    const up = (peak - start) / fps, down = (end - peak) / fps;
    add("tempo-press", "The press takes at least a second, seconds", up, 1, up >= 1);
    add("tempo-lower", "Lowering takes at least a second and a half, seconds", down, 1.5, down >= 1.5);
    const loopGap = maxOf(Object.keys(first), j => dist(first[j], frames[frames.length - 1][j]));
    const stepMax = Math.max(...frames.slice(1).map((f, i) => maxOf(Object.keys(f), j => dist(f[j], frames[i][j]))));
    const speed = Math.max(stepMax, loopGap) * fps;
    add("smooth", "Fastest joint, metres per second", speed, MAX_JOINT_SPEED, speed <= MAX_JOINT_SPEED);
    commonChecks(frames, add);
    return { pass: checks.every(c => c.pass), checks };
}

const angleBetween = (a, b, c) => { const u = sub(a, b), v = sub(c, b); return deg(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (len(u) * len(v) || 1))))); };

export const GRADERS = { "bodyweight-squat": gradeSquat, "push-up": gradePushup, "reverse-lunge": gradeLunge, "dumbbell-row": gradeRow, "dumbbell-press": gradePress };
