/* ==========================================
   Southbound — the exercise demo figure (pure: strings, no DOM)

   A 3D skeleton posed by joint angles, seen from any camera angle and
   drawn as a shaded, human-shaped figure in SVG: muscled limbs (thighs,
   calves, biceps, shoulders), a chest and narrower waist, glutes, a head
   with jaw, nose, ears and short hair, mitten hands, shoes; the Southbound
   shirt (forest, the tan SB slash on the chest) and shorts. Equipment
   (dumbbells, barbell, bench, box, band, mat) is drawn in the same space.

   How a body part is drawn: a "sweep" along a bone, sampled at a few
   points, each with its own width (side to side), depth (front to back)
   and offset (a calf sits behind the shin, a quad in front of the thigh).
   Seen from the camera, each sample's width on screen comes from its
   ellipse, so the same thigh looks right from the front, the side or a
   three-quarter angle. Parts are sorted far to near.

   skeleton(pose, opts)      joint positions + frames (grounded, anchored)
   poseAt(keys, t)           a pose between key poses (eased)
   frameSvg(sk, cam, box)    one frame
   fitBox(skeletons, cam)    a fixed frame for a whole animation
   Joint angles are degrees [x, y, z] in the parent's frame. x: a negative
   angle swings a limb forward (hip / shoulder flexion, elbow bend),
   positive backward (knee bend); z: sideways. Unit-tested in
   tests/exerciseDemos.test.mjs; the exercises are js/exerciseDemos.js.
========================================== */

const D2R = Math.PI / 180;
const rx = a => { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const ry = a => { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rz = a => { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const mul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const app = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
const len3 = v => Math.hypot(v[0], v[1], v[2]);
const norm3 = v => { const l = len3(v) || 1; return scale(v, 1 / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rot = ([x = 0, y = 0, z = 0] = []) => mul(rz(z), mul(ry(y), rx(x)));
const IDENT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const r1 = n => Math.round(n * 10) / 10;

/** Bone lengths (cm). */
export const BONES = { spine: 50, neck: 10, head: 23, shoulderW: 19.5, hipW: 9.5, upper: 29, fore: 26, hand: 9, thigh: 44, shin: 42 };

export const JOINTS = ["root", "spine", "neck", "lShoulder", "lElbow", "lWrist", "rShoulder", "rElbow", "rWrist", "lHip", "lKnee", "lAnkle", "rHip", "rKnee", "rAnkle"];
export const NEUTRAL = Object.freeze(Object.fromEntries(JOINTS.map(j => [j, [0, 0, 0]])));

function rawSkeleton(pose) {
    const p = { ...NEUTRAL, ...pose };
    const R0 = rot(p.root);
    const S = mul(R0, rot(p.spine));
    const pelvis = [0, 0, 0];
    const chest = add(pelvis, app(S, [0, BONES.spine, 0]));
    const N = mul(S, rot(p.neck));
    const neckTop = add(chest, app(N, [0, BONES.neck, 0]));
    const headTop = add(neckTop, app(N, [0, BONES.head, 0]));
    const pts = { pelvis, chest, neckTop, headTop };
    const frames = { pelvis: R0, spine: S, head: N };
    for (const [s, sx] of [["l", 1], ["r", -1]]) {
        const sh = add(chest, app(S, [sx * BONES.shoulderW, -5, -1]));
        const U = mul(S, rot(p[s + "Shoulder"]));
        const el = add(sh, app(U, [0, -BONES.upper, 0]));
        const F = mul(U, rot(p[s + "Elbow"]));
        const wr = add(el, app(F, [0, -BONES.fore, 0]));
        const H = mul(F, rot(p[s + "Wrist"]));
        const hd = add(wr, app(H, [0, -BONES.hand, 0]));
        const hp = add(pelvis, app(R0, [sx * BONES.hipW, -3, 0]));
        const T = mul(R0, rot(p[s + "Hip"]));
        const kn = add(hp, app(T, [0, -BONES.thigh, 0]));
        const K = mul(T, rot(p[s + "Knee"]));
        const an = add(kn, app(K, [0, -BONES.shin, 0]));
        const A = mul(K, rot(p[s + "Ankle"]));
        const heel = add(an, app(A, [0, -6.5, -5]));
        const toe = add(an, app(A, [0, -6.5, 16]));
        Object.assign(pts, { [s + "Sh"]: sh, [s + "El"]: el, [s + "Wr"]: wr, [s + "Hd"]: hd, [s + "Hp"]: hp, [s + "Kn"]: kn, [s + "An"]: an, [s + "Heel"]: heel, [s + "Toe"]: toe });
        Object.assign(frames, { [s + "Upper"]: U, [s + "Fore"]: F, [s + "Hand"]: H, [s + "Thigh"]: T, [s + "Shin"]: K, [s + "Foot"]: A });
    }
    return { pts, frames };
}

// The lowest point of the body (with the parts' thickness).
const SOLES = ["lHeel", "lToe", "rHeel", "rToe"];
function lowest(pts) {
    let min = Infinity;
    for (const [k, v] of Object.entries(pts)) {
        const pad = SOLES.includes(k) ? 1 : k.endsWith("Hd") ? 2.5 : k.endsWith("Kn") || k.endsWith("El") ? 5 : k === "headTop" || k === "neckTop" ? 6 : k === "pelvis" || k === "chest" ? 10 : 4;
        min = Math.min(min, v[1] - pad);
    }
    return min;
}

/**
 * Joint positions and frames for a pose, standing on the floor (y = 0).
 *   anchor  point names whose average stays put side to side (the feet in a squat)
 *   level   [a, b, gap]: tilt the whole body (root x) until a sits gap above b
 *           (a push-up pivots on its toes and keeps both hands down)
 *   lift    raise the body (on a bench) by this much
 */
export function skeleton(pose, { anchor = null, level = null, lift = 0 } = {}) {
    let p = { ...NEUTRAL, ...pose };
    if (level) {
        // Bisect the root's tilt so both points sit at the same height.
        const h = q => { const { pts } = rawSkeleton(q); return pts[level[0]][1] - pts[level[1]][1] - (level[2] || 0); };
        let lo = p.root[0] - 40, hi = p.root[0] + 40;
        const f = a => h({ ...p, root: [a, p.root[1], p.root[2]] });
        if (Math.sign(f(lo)) !== Math.sign(f(hi))) {
            for (let i = 0; i < 30; i++) {
                const mid = (lo + hi) / 2;
                if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid;
            }
            p = { ...p, root: [(lo + hi) / 2, p.root[1], p.root[2]] };
        }
    }
    const { pts, frames } = rawSkeleton(p);
    const dy = -lowest(pts) + lift;
    let dx = 0, dz = 0;
    if (anchor?.length) {
        for (const k of anchor) { dx -= pts[k][0]; dz -= pts[k][2]; }
        dx /= anchor.length; dz /= anchor.length;
    }
    for (const k of Object.keys(pts)) pts[k] = [pts[k][0] + dx, pts[k][1] + dy, pts[k][2] + dz];
    return { pts, frames, pose: p };
}

const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const lerpPose = (a, b, t) => Object.fromEntries(JOINTS.map(k => {
    const A = a[k] || [0, 0, 0], B = b[k] || [0, 0, 0];
    return [k, A.map((v, i) => v + (B[i] - v) * t)];
}));

/** keys: [{ at: 0..1, pose }], the first at 0 and the last at 1. */
export function poseAt(keys, t) {
    const x = ((t % 1) + 1) % 1;
    for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i], b = keys[i + 1];
        if (x >= a.at && x <= b.at) return lerpPose({ ...NEUTRAL, ...a.pose }, { ...NEUTRAL, ...b.pose }, ease((x - a.at) / Math.max(1e-6, b.at - a.at)));
    }
    return { ...NEUTRAL, ...keys[keys.length - 1].pose };
}

// ---------- Drawing ----------

export const PALETTE = {
    skin: [226, 214, 196],      // warm stone
    hair: [52, 46, 40],
    shirt: [30, 62, 46],        // forest
    shorts: [24, 40, 33],
    shoe: [201, 173, 132],      // tan
    sole: [243, 239, 230],
    mark: [201, 173, 132],
    iron: [58, 62, 60],
    chrome: [176, 180, 176],
    plate: [40, 44, 42],
    bench: [44, 70, 56],
    benchLeg: [70, 74, 72],
    box: [184, 155, 110],
    band: [201, 173, 132],
    mat: [205, 196, 178],
    primary: [210, 112, 74],    // clay: the muscle doing the work
    secondary: [227, 172, 120]  // the ones that help
};
const rgb = ([r, g, b], k = 1) => `rgb(${Math.round(Math.min(255, r * k))},${Math.round(Math.min(255, g * k))},${Math.round(Math.min(255, b * k))})`;

function camera(cam) { return mul(rx(cam.pitch || 0), ry(cam.yaw || 0)); }
function proj(M, p) { const q = app(M, p); return { x: q[0], y: -q[1], z: q[2] }; }
function dirOnScreen(M, v) { const q = app(M, v); return { x: q[0], y: -q[1], z: q[2] }; }

const smooth = t => t * t * (3 - 2 * t);
function sampleProfile(profile, t) {
    if (t <= profile[0].t) return profile[0];
    for (let i = 0; i < profile.length - 1; i++) {
        const a = profile[i], b = profile[i + 1];
        if (t <= b.t) {
            const u = smooth((t - a.t) / Math.max(1e-6, b.t - a.t));
            const m = (k, d = 0) => (a[k] ?? d) + ((b[k] ?? d) - (a[k] ?? d)) * u;
            return { t, w: m("w"), d: m("d"), ox: m("ox"), oz: m("oz") };
        }
    }
    return profile[profile.length - 1];
}

/**
 * A shaded sweep from a to b. frame: the local axes (x side, z front) at the
 * part; profile: [{ t, w, d, ox?, oz? }]; cap "round" (limbs) or "flat" (iron).
 * Returns { z, svg } (z = depth for sorting) or null.
 */
function sweep(ctx, { a, b, frame = IDENT, profile, color, k = 1, cap = "round", steps = 9, shine = 1 }) {
    const { M, defs } = ctx;
    const X = app(frame, [1, 0, 0]), Y = app(frame, [0, 1, 0]), Z = app(frame, [0, 0, 1]);
    // The cross-section lies across the part: the frame's side and front
    // axes, squared up to the part's own direction (a shoe runs along the
    // foot's front axis, so its thickness comes from the frame's up axis).
    const u0 = norm3(sub(b, a));
    const flatten = (v, ...against) => { let w = v; for (const g of against) { const k = w[0] * g[0] + w[1] * g[1] + w[2] * g[2]; w = sub(w, scale(g, k)); } return w; };
    let XS = flatten(X, u0); if (len3(XS) < 0.35) XS = flatten(Y, u0); XS = norm3(XS);
    let ZS = flatten(Z, u0, XS); if (len3(ZS) < 0.35) ZS = flatten(Y, u0, XS); ZS = norm3(ZS);
    const ex = dirOnScreen(M, XS), ez = dirOnScreen(M, ZS);
    const pa = proj(M, a), pb = proj(M, b);
    let dx = pb.x - pa.x, dy = pb.y - pa.y;
    const sl = Math.hypot(dx, dy);
    const axis = norm3(sub(b, a));
    const axisCam = app(M, axis);
    if (sl < 1e-3) { dx = 0; dy = 1; } else { dx /= sl; dy /= sl; }
    const nx = -dy, ny = dx;
    const L = [], R = [], hws = [];
    let zsum = 0;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const s = sampleProfile(profile, t);
        const c3 = add(add(add(a, scale(sub(b, a), t)), scale(X, s.ox || 0)), scale(Z, s.oz || 0));
        const c = proj(M, c3);
        const hw = Math.hypot(s.w * (ex.x * nx + ex.y * ny), s.d * (ez.x * nx + ez.y * ny));
        L.push([c.x + nx * hw, c.y + ny * hw]);
        R.push([c.x - nx * hw, c.y - ny * hw]);
        hws.push(hw);
        zsum += c.z;
    }
    const n = steps;
    // Round ends bulge by their half-width; flat ends (a dumbbell head, a plate)
    // only by how much of the end face the camera sees.
    const endK = cap === "flat" ? Math.abs(axisCam[2]) : 1;
    const bulge0 = 1.33 * hws[0] * endK, bulgeN = 1.33 * hws[n] * endK;
    const f = v => `${r1(v[0])} ${r1(v[1])}`;
    let path = `M${f(L[0])}`;
    for (let i = 1; i <= n; i++) path += ` L${f(L[i])}`;
    path += ` C${f([L[n][0] + dx * bulgeN, L[n][1] + dy * bulgeN])} ${f([R[n][0] + dx * bulgeN, R[n][1] + dy * bulgeN])} ${f(R[n])}`;
    for (let i = n - 1; i >= 0; i--) path += ` L${f(R[i])}`;
    path += ` C${f([R[0][0] - dx * bulge0, R[0][1] - dy * bulge0])} ${f([L[0][0] - dx * bulge0, L[0][1] - dy * bulge0])} ${f(L[0])} Z`;
    // Light from the upper left: bright on that side, falling into shadow.
    const mid = proj(M, add(a, scale(sub(b, a), 0.5)));
    const r = Math.max(...hws, 0.5);
    const sign = (nx * -0.55 + ny * -0.83) > 0 ? 1 : -1;
    const id = `${ctx.prefix}${ctx.gid++}`;
    defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r1(mid.x + nx * r * sign)}" y1="${r1(mid.y + ny * r * sign)}" x2="${r1(mid.x - nx * r * sign)}" y2="${r1(mid.y - ny * r * sign)}"><stop offset="0" stop-color="${rgb(color, (1.08 + 0.06 * shine) * k)}"/><stop offset=".38" stop-color="${rgb(color, 1.0 * k)}"/><stop offset=".78" stop-color="${rgb(color, 0.78 * k)}"/><stop offset="1" stop-color="${rgb(color, 0.6 * k)}"/></linearGradient>`);
    return { z: zsum / (n + 1), svg: `<path d="${path}" fill="url(#${id})"/>` };
}

// A ball (a joint cap, the glutes, an ear).
function ball(ctx, c3, r, color, k = 1) {
    const c = proj(ctx.M, c3);
    const id = `${ctx.prefix}${ctx.gid++}`;
    ctx.defs.push(`<radialGradient id="${id}" cx="${r1(c.x - r * 0.35)}" cy="${r1(c.y - r * 0.45)}" r="${r1(r * 1.55)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${rgb(color, 1.1 * k)}"/><stop offset=".55" stop-color="${rgb(color, 0.94 * k)}"/><stop offset="1" stop-color="${rgb(color, 0.62 * k)}"/></radialGradient>`);
    return { z: c.z, svg: `<circle cx="${r1(c.x)}" cy="${r1(c.y)}" r="${r1(r)}" fill="url(#${id})"/>` };
}

// A box (bench, plyo box, mat): visible faces only, each shaded.
function cuboid(ctx, center, size, color, frame = IDENT) {
    const [w, h, d] = size.map(v => v / 2);
    const corner = (sx, sy, sz) => add(center, app(frame, [sx * w, sy * h, sz * d]));
    const faces = [
        { n: [0, 1, 0], c: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], k: 1.08 },
        { n: [0, -1, 0], c: [[-1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, -1, -1]], k: 0.6 },
        { n: [1, 0, 0], c: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]], k: 0.8 },
        { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]], k: 0.86 },
        { n: [0, 0, 1], c: [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]], k: 0.92 },
        { n: [0, 0, -1], c: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], k: 0.72 }
    ];
    const out = [];
    for (const f of faces) {
        const nCam = app(ctx.M, app(frame, f.n));
        if (nCam[2] <= 0.02) continue;
        const pts = f.c.map(([a, b, c]) => proj(ctx.M, corner(a, b, c)));
        out.push(`<polygon points="${pts.map(p => `${r1(p.x)},${r1(p.y)}`).join(" ")}" fill="${rgb(color, f.k)}"/>`);
    }
    const zc = proj(ctx.M, center).z;
    return { z: zc - Math.max(w, h, d) * 0.6, svg: out.join("") };
}

// The local frame of a body part, for its sweeps.
const partFrame = (sk, name) => sk.frames[name];
const along = (a, b, t) => add(a, scale(sub(b, a), t));

// ---------- The body ----------

/**
 * Every part of the figure as { z, svg }. opts.shirt (false = bare torso,
 * the muscle map), opts.muscles { name: "primary" | "secondary" }.
 */
function bodyParts(ctx, sk, { shirt = true, muscles = {}, map = false } = {}) {
    const P = sk.pts, Fr = sk.frames, C = map ? { ...PALETTE, skin: [236, 231, 222], shorts: [222, 215, 203], hair: [205, 197, 184], shoe: [222, 215, 203] } : PALETTE;
    const parts = [];
    const push = x => { if (x) parts.push(x); };
    const shade = z => Math.max(0.78, Math.min(1.06, 0.95 + z / 160));
    const zc = proj(ctx.M, along(P.pelvis, P.chest, 0.5)).z;
    const torsoColor = shirt ? C.shirt : C.skin;

    for (const s of ["l", "r"]) {
        const sx = s === "l" ? 1 : -1;
        const zLimb = (a, b) => shade((proj(ctx.M, a).z + proj(ctx.M, b).z) / 2 - zc);
        // Thigh: full at the top, a quad in front, tapering to the knee.
        push(sweep(ctx, { a: P[s + "Hp"], b: P[s + "Kn"], frame: Fr[s + "Thigh"], color: C.skin, k: zLimb(P[s + "Hp"], P[s + "Kn"]),
            profile: [{ t: 0, w: 8.6, d: 9 }, { t: 0.35, w: 8, d: 8.6, oz: 1.6 }, { t: 0.8, w: 6, d: 6.4, oz: 0.8 }, { t: 1, w: 5.4, d: 5.8 }] }));
        // Shorts over the top of the thigh.
        push(sweep(ctx, { a: P[s + "Hp"], b: along(P[s + "Hp"], P[s + "Kn"], 0.42), frame: Fr[s + "Thigh"], color: C.shorts, k: zLimb(P[s + "Hp"], P[s + "Kn"]) * 1.02,
            profile: [{ t: 0, w: 9.4, d: 9.8 }, { t: 1, w: 8.9, d: 9.3, oz: 1.2 }] }));
        // Shin: the calf behind it, slim at the ankle.
        push(sweep(ctx, { a: P[s + "Kn"], b: P[s + "An"], frame: Fr[s + "Shin"], color: C.skin, k: zLimb(P[s + "Kn"], P[s + "An"]),
            profile: [{ t: 0, w: 5.3, d: 5.6 }, { t: 0.28, w: 5.4, d: 6.4, oz: -1.9 }, { t: 0.7, w: 3.9, d: 4.2, oz: -0.6 }, { t: 1, w: 3.2, d: 3.4 }] }));
        // Shoe: heel to toe.
        push(sweep(ctx, { a: P[s + "Heel"], b: P[s + "Toe"], frame: Fr[s + "Foot"], color: C.shoe, k: zLimb(P[s + "Heel"], P[s + "Toe"]),
            profile: [{ t: 0, w: 3.8, d: 3.6 }, { t: 0.45, w: 4.6, d: 4 }, { t: 1, w: 3.8, d: 2.4 }] }));
        // Upper arm: shoulder, biceps in front, triceps behind.
        push(sweep(ctx, { a: P[s + "Sh"], b: P[s + "El"], frame: Fr[s + "Upper"], color: C.skin, k: zLimb(P[s + "Sh"], P[s + "El"]),
            profile: [{ t: 0, w: 6, d: 6.2 }, { t: 0.45, w: 5.2, d: 6, oz: 0.5 }, { t: 1, w: 4, d: 4.2 }] }));
        // Sleeve + the shoulder cap.
        if (shirt) {
            push(sweep(ctx, { a: along(P[s + "Sh"], P.chest, 0.12), b: along(P[s + "Sh"], P[s + "El"], 0.42), frame: Fr[s + "Upper"], color: C.shirt, k: zLimb(P[s + "Sh"], P[s + "El"]) * 1.02,
                profile: [{ t: 0, w: 6.8, d: 6.6 }, { t: 1, w: 5.8, d: 6.1, oz: 0.3 }] }));
        } else {
            push(ball(ctx, add(P[s + "Sh"], app(Fr.spine, [sx * 1.5, 1, 0])), 6.4, C.skin, shade(proj(ctx.M, P[s + "Sh"]).z - zc)));
        }
        // Forearm, then the hand (a mitten).
        push(sweep(ctx, { a: P[s + "El"], b: P[s + "Wr"], frame: Fr[s + "Fore"], color: C.skin, k: zLimb(P[s + "El"], P[s + "Wr"]),
            profile: [{ t: 0, w: 4.3, d: 4.2 }, { t: 0.22, w: 4.8, d: 4.5, oz: 0.3 }, { t: 1, w: 3.1, d: 2.5 }] }));
        push(sweep(ctx, { a: P[s + "Wr"], b: P[s + "Hd"], frame: Fr[s + "Hand"], color: C.skin, k: zLimb(P[s + "Wr"], P[s + "Hd"]),
            profile: [{ t: 0, w: 3.1, d: 1.9 }, { t: 0.55, w: 4, d: 2.2, oz: 0.4 }, { t: 1, w: 3.1, d: 1.8 }] }));
        // Glute (under the shorts).
        push(ball(ctx, add(P[s + "Hp"], app(Fr.pelvis, [sx * 1.5, 2, -5.5])), 7.6, C.shorts, shade(proj(ctx.M, P[s + "Hp"]).z - zc - 4)));
    }
    // Hips (shorts) and torso: waist narrower than the chest, the chest forward.
    push(sweep(ctx, { a: add(P.pelvis, app(Fr.pelvis, [0, -4, 0])), b: along(P.pelvis, P.chest, 0.3), frame: Fr.pelvis, color: C.shorts, k: shade(0),
        profile: [{ t: 0, w: 14, d: 9.6 }, { t: 1, w: 13, d: 9.4 }] }));
    push(sweep(ctx, { a: along(P.pelvis, P.chest, 0.24), b: add(P.chest, app(Fr.spine, [0, 3, -1])), frame: Fr.spine, color: torsoColor, k: shade(0), shine: 1.4,
        profile: [{ t: 0, w: 13.4, d: 9.6 }, { t: 0.3, w: 12.8, d: 9.2, oz: 0.3 }, { t: 0.68, w: 15.2, d: 10.6, oz: 1.6 }, { t: 0.9, w: 18.6, d: 9.8, oz: 0.6 }, { t: 1, w: 16, d: 8 }] }));
    // Trapezius slope into the neck, then the neck.
    push(sweep(ctx, { a: add(P.chest, app(Fr.spine, [0, -2, -1.5])), b: P.neckTop, frame: Fr.head, color: C.skin, k: shade(0),
        profile: [{ t: 0, w: 6.2, d: 5.6 }, { t: 1, w: 5, d: 5.2, oz: 0.4 }] }));
    if (shirt) {
        // The collar sits over the base of the neck.
        push(sweep(ctx, { a: add(P.chest, app(Fr.spine, [0, -3, -1])), b: add(P.chest, app(Fr.spine, [0, 3.4, -1])), frame: Fr.spine, color: C.shirt, k: shade(0) * 1.03,
            profile: [{ t: 0, w: 13, d: 7.6 }, { t: 1, w: 7.4, d: 6.6 }] }));
        // The SB slash on the chest, when the chest faces the camera.
        const front = app(ctx.M, app(Fr.spine, [0, 0, 1]));
        if (front[2] > 0.25) {
            const c = add(P.chest, app(Fr.spine, [-5, -10, 10.4]));
            const pt = (x, y) => proj(ctx.M, add(c, app(Fr.spine, [x, y, 0])));
            const q = [pt(-2.2, -2.6), pt(1.1, 2.6), pt(2.6, 2.6), pt(-0.7, -2.6)];
            const z = proj(ctx.M, c).z + 30;
            parts.push({ z, svg: `<polygon points="${q.map(p => `${r1(p.x)},${r1(p.y)}`).join(" ")}" fill="${rgb(C.mark)}" opacity="${Math.min(1, (front[2] - 0.25) * 2.2)}"/>` });
        }
    }
    // Head: jaw, cheeks, the cranium; hair over the top and back; nose; ears.
    const H = Fr.head, base = P.neckTop, top = P.headTop;
    push(sweep(ctx, { a: base, b: top, frame: H, color: C.skin, k: 1,
        profile: [{ t: 0, w: 4.8, d: 5.2, oz: 1 }, { t: 0.2, w: 6.4, d: 8, oz: 2.2 }, { t: 0.5, w: 8.2, d: 9.6, oz: 0.8 }, { t: 0.78, w: 8.5, d: 9.8, oz: -0.4 }, { t: 1, w: 5, d: 6, oz: -0.8 }] }));
    push(sweep(ctx, { a: along(base, top, 0.55), b: add(top, app(H, [0, 0.6, -0.8])), frame: H, color: C.hair, k: 1,
        profile: [{ t: 0, w: 8.7, d: 8.8, oz: -1.4 }, { t: 0.45, w: 8.9, d: 10, oz: -0.6 }, { t: 1, w: 5.6, d: 6.4, oz: -0.6 }] }));
    push(ball(ctx, add(along(base, top, 0.45), app(H, [0, 0, 9.4])), 1.7, C.skin, 0.98));
    for (const sx of [1, -1]) push(ball(ctx, add(along(base, top, 0.48), app(H, [sx * 8.2, 0, -0.6])), 2.1, C.skin, 0.9));

    // The muscle map: every muscle faint, the ones being worked in clay
    // (primary) or tan (helping), flat so they read as regions.
    if (map) {
        for (const name of Object.keys(MUSCLE_SHAPES)) {
            const level = muscles[name];
            const color = level === "primary" ? C.primary : level === "secondary" ? C.secondary : [216, 209, 196];
            for (const m of MUSCLE_SHAPES[name](P, Fr)) {
                const x = m.ball ? ball(ctx, m.ball, m.r, color) : sweep(ctx, { ...m, color, k: 1, shine: 0 });
                if (x) parts.push({ z: x.z + (m.lift ?? 2), svg: x.svg });
            }
        }
    }
    return parts;
}

// Where each muscle sits on the figure (the names the exercise database uses).
const LR = fn => ["l", "r"].flatMap(s => fn(s, s === "l" ? 1 : -1));
const MUSCLE_SHAPES = {
    chest: (P, F) => LR((s, sx) => [{ a: add(P.chest, app(F.spine, [sx * 2, -10, 9.8])), b: add(P.chest, app(F.spine, [sx * 13, -7, 7.6])), frame: F.spine, profile: [{ t: 0, w: 7.4, d: 2.4 }, { t: 0.45, w: 8, d: 2.6 }, { t: 1, w: 4.4, d: 2.2 }], lift: 6 }]),
    abdominals: (P, F) => [{ a: along(P.pelvis, P.chest, 0.08), b: along(P.pelvis, P.chest, 0.62), frame: F.spine, profile: [{ t: 0, w: 5, d: 4, oz: 6.6 }, { t: 0.6, w: 6, d: 4, oz: 7.6 }, { t: 1, w: 5.5, d: 4, oz: 8.2 }], lift: 6 }],
    shoulders: (P, F) => LR(s => [{ ball: add(P[s + "Sh"], app(F.spine, [0, 1.5, 0.5])), r: 6.6, lift: 3 }]),
    biceps: (P, F) => LR(s => [{ a: along(P[s + "Sh"], P[s + "El"], 0.2), b: along(P[s + "Sh"], P[s + "El"], 0.85), frame: F[s + "Upper"], profile: [{ t: 0, w: 2.5, d: 2, oz: 3.6 }, { t: 0.5, w: 3.2, d: 2.4, oz: 4.2 }, { t: 1, w: 2.2, d: 2, oz: 3 }] }]),
    triceps: (P, F) => LR(s => [{ a: along(P[s + "Sh"], P[s + "El"], 0.18), b: along(P[s + "Sh"], P[s + "El"], 0.9), frame: F[s + "Upper"], profile: [{ t: 0, w: 2.8, d: 2.2, oz: -3.8 }, { t: 0.5, w: 3.2, d: 2.4, oz: -4 }, { t: 1, w: 2.2, d: 2, oz: -3 }] }]),
    forearms: (P, F) => LR(s => [{ a: along(P[s + "El"], P[s + "Wr"], 0.1), b: along(P[s + "El"], P[s + "Wr"], 0.75), frame: F[s + "Fore"], profile: [{ t: 0, w: 3.6, d: 3, oz: 0.4 }, { t: 1, w: 2.4, d: 2 }], lift: 1 }]),
    quadriceps: (P, F) => LR(s => [{ a: along(P[s + "Hp"], P[s + "Kn"], 0.12), b: along(P[s + "Hp"], P[s + "Kn"], 0.9), frame: F[s + "Thigh"], profile: [{ t: 0, w: 5, d: 3, oz: 6.4 }, { t: 0.45, w: 6.2, d: 3.4, oz: 6.6 }, { t: 1, w: 4, d: 2.4, oz: 4.4 }] }]),
    hamstrings: (P, F) => LR(s => [{ a: along(P[s + "Hp"], P[s + "Kn"], 0.15), b: along(P[s + "Hp"], P[s + "Kn"], 0.9), frame: F[s + "Thigh"], profile: [{ t: 0, w: 5, d: 3, oz: -6.2 }, { t: 0.5, w: 5.6, d: 3.2, oz: -6.4 }, { t: 1, w: 3.6, d: 2.4, oz: -4.2 }] }]),
    glutes: (P, F) => LR((s, sx) => [{ ball: add(P[s + "Hp"], app(F.pelvis, [sx * 1.5, 2, -8.5])), r: 7.6, lift: 6 }]),
    calves: (P, F) => LR(s => [{ a: along(P[s + "Kn"], P[s + "An"], 0.08), b: along(P[s + "Kn"], P[s + "An"], 0.62), frame: F[s + "Shin"], profile: [{ t: 0, w: 4, d: 2.4, oz: -4.4 }, { t: 0.35, w: 4.8, d: 3, oz: -6 }, { t: 1, w: 2.6, d: 2, oz: -3.6 }] }]),
    adductors: (P, F) => LR((s, sx) => [{ a: along(P[s + "Hp"], P[s + "Kn"], 0.08), b: along(P[s + "Hp"], P[s + "Kn"], 0.6), frame: F[s + "Thigh"], profile: [{ t: 0, w: 2.4, d: 4, ox: -sx * 6.4 }, { t: 1, w: 1.6, d: 2.6, ox: -sx * 4.8 }] }]),
    abductors: (P, F) => LR((s, sx) => [{ a: add(P[s + "Hp"], app(F.pelvis, [sx * 3, 4, 0])), b: along(P[s + "Hp"], P[s + "Kn"], 0.3), frame: F[s + "Thigh"], profile: [{ t: 0, w: 2.6, d: 5, ox: sx * 7 }, { t: 1, w: 2, d: 3.4, ox: sx * 8 }] }]),
    lats: (P, F) => LR((s, sx) => [{ a: add(P.chest, app(F.spine, [sx * 12, -8, -5])), b: along(P.pelvis, P.chest, 0.45), frame: F.spine, profile: [{ t: 0, w: 4.4, d: 3, ox: sx * 1 }, { t: 0.5, w: 4, d: 3, ox: sx * 6, oz: -6 }, { t: 1, w: 2.4, d: 2.4, ox: sx * 6, oz: -7 }] }]),
    "middle back": (P, F) => [{ a: add(P.chest, app(F.spine, [0, -18, -8.6])), b: add(P.chest, app(F.spine, [0, -4, -8])), frame: F.spine, profile: [{ t: 0, w: 4, d: 2 }, { t: 1, w: 8, d: 2 }], lift: 5 }],
    "lower back": (P, F) => [{ a: along(P.pelvis, P.chest, 0.15), b: along(P.pelvis, P.chest, 0.45), frame: F.spine, profile: [{ t: 0, w: 5, d: 2, oz: -8.4 }, { t: 1, w: 4, d: 2, oz: -8.4 }], lift: 5 }],
    traps: (P, F) => [{ a: add(P.chest, app(F.spine, [0, -12, -7.4])), b: add(P.chest, app(F.spine, [0, 3.5, -4.4])), frame: F.spine, profile: [{ t: 0, w: 2, d: 2 }, { t: 0.7, w: 11, d: 2.4 }, { t: 1, w: 7, d: 2 }], lift: 5 }],
    neck: (P, F) => [{ a: P.chest, b: P.neckTop, frame: F.head, profile: [{ t: 0, w: 4, d: 2, oz: 2.6 }, { t: 1, w: 3.4, d: 2, oz: 2.6 }], lift: 3 }]
};
export const MUSCLE_NAMES = Object.keys(MUSCLE_SHAPES);

// ---------- Equipment ----------

function frameFromAxis(axis) {
    const y = norm3(axis);
    const helper = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const x = norm3(cross(helper, y));
    const z = cross(x, y);
    return [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
}

function dumbbell(ctx, center, axis, size = 1) {
    const u = norm3(axis), f = frameFromAxis(u);
    const at = t => add(center, scale(u, t * size));
    const out = [
        sweep(ctx, { a: at(-5), b: at(5), frame: f, color: PALETTE.chrome, cap: "flat", steps: 2, profile: [{ t: 0, w: 1.4, d: 1.4 }, { t: 1, w: 1.4, d: 1.4 }] })
    ];
    for (const sgn of [-1, 1]) {
        out.push(sweep(ctx, { a: at(sgn * 5), b: at(sgn * 10), frame: f, color: PALETTE.iron, cap: "flat", steps: 2, profile: [{ t: 0, w: 4.4 * size, d: 4.4 * size }, { t: 1, w: 4.4 * size, d: 4.4 * size }] }));
    }
    return out;
}

function barbell(ctx, center, axis) {
    const u = norm3(axis), f = frameFromAxis(u);
    const at = t => add(center, scale(u, t));
    const out = [sweep(ctx, { a: at(-95), b: at(95), frame: f, color: PALETTE.chrome, cap: "flat", steps: 2, profile: [{ t: 0, w: 1.3, d: 1.3 }, { t: 1, w: 1.3, d: 1.3 }] })];
    for (const sgn of [-1, 1]) {
        out.push(sweep(ctx, { a: at(sgn * 62), b: at(sgn * 70), frame: f, color: PALETTE.plate, cap: "flat", steps: 2, profile: [{ t: 0, w: 22, d: 22 }, { t: 1, w: 22, d: 22 }] }));
    }
    return out;
}

/** The demo's equipment for a skeleton. spec: [{ type, ... }] (js/exerciseDemos.js). */
function equipmentParts(ctx, sk, specs = []) {
    const P = sk.pts, F = sk.frames;
    const parts = [];
    for (const e of specs) {
        if (e.type === "dumbbell") {
            for (const s of e.hands || ["l", "r"]) {
                const c = along(P[s + "Wr"], P[s + "Hd"], 0.5);
                const axis = app(F[s + "Hand"], e.axis === "front" ? [0, 0, 1] : [1, 0, 0]);
                parts.push(...dumbbell(ctx, c, axis));
            }
        } else if (e.type === "goblet") {
            const c = add(along(P.lHd, P.rHd, 0.5), app(F.spine, [0, 1, 3]));
            parts.push(...dumbbell(ctx, c, app(F.spine, [0, 1, 0]), 1.05).map(p => p && { ...p, z: p.z + 6 }));
        } else if (e.type === "barbell") {
            const c = along(along(P.lWr, P.lHd, 0.45), along(P.rWr, P.rHd, 0.45), 0.5);
            parts.push(...barbell(ctx, c, sub(P.lHd, P.rHd)));
        } else if (e.type === "bench" || e.type === "box") {
            const pts = (e.under || []).map(k => P[k]).filter(Boolean);
            if (!pts.length) continue;
            const top = Math.min(...pts.map(p => p[1])) - (e.pad ?? 5);
            const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length + (e.dx || 0);
            const cz = pts.reduce((s, p) => s + p[2], 0) / pts.length + (e.dz || 0);
            const [w, d] = e.size || (e.type === "bench" ? [32, 110] : [50, 45]);
            const color = e.type === "bench" ? PALETTE.bench : PALETTE.box;
            if (e.type === "bench") {
                parts.push(cuboid(ctx, [cx, top - 3, cz], [w, 6, d], color));
                for (const zz of [-d / 2 + 8, d / 2 - 8]) parts.push(cuboid(ctx, [cx, (top - 6) / 2, cz + zz], [w - 6, top - 6, 5], PALETTE.benchLeg));
            } else {
                parts.push(cuboid(ctx, [cx, top / 2, cz], [w, top, d], color));
            }
        } else if (e.type === "band") {
            const a = along(P.lHp, P.lKn, 0.82), b = along(P.rHp, P.rKn, 0.82);
            parts.push(sweep(ctx, { a, b, frame: frameFromAxis(sub(a, b)), color: PALETTE.band, cap: "round", steps: 2, profile: [{ t: 0, w: 1.6, d: 1.6 }, { t: 1, w: 1.6, d: 1.6 }] }));
            if (parts[parts.length - 1]) parts[parts.length - 1].z += 9;
        }
    }
    return parts.filter(Boolean);
}

/**
 * One frame as an SVG string.
 *   cam   { yaw, pitch }   box { x, y, w, h } (fitBox)
 *   opts  { width, height, equipment, mat, shirt, muscles, id (unique per svg), background }
 */
export function frameSvg(sk, cam, box, { width = 480, height = 300, equipment = [], mat = false, shirt = true, muscles = {}, map = false, id = "f", background = true, label = "" } = {}) {
    const ctx = { M: camera(cam), defs: [], gid: 0, prefix: `${id}g` };
    const parts = [...bodyParts(ctx, sk, { shirt: shirt && !map, muscles, map }), ...equipmentParts(ctx, sk, equipment)];
    parts.sort((a, b) => a.z - b.z);
    const floor = proj(ctx.M, [0, 0, 0]);
    const P = sk.pts;
    const xs = Object.values(P).map(p => proj(ctx.M, p).x);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2, spread = (Math.max(...xs) - Math.min(...xs)) / 2;
    let under = `<ellipse cx="${r1(mx)}" cy="${r1(floor.y + 1)}" rx="${r1(Math.max(30, spread + 24))}" ry="${r1(5 + 6 * Math.sin(Math.abs(cam.pitch || 0) * D2R) * 4)}" fill="rgba(15,32,25,.14)"/>`;
    if (mat) {
        const m = cuboid(ctx, [P.pelvis[0], 0.4, (Math.min(...Object.values(P).map(p => p[2])) + Math.max(...Object.values(P).map(p => p[2]))) / 2], [60, 0.8, 190], PALETTE.mat);
        under = m.svg + under;
    }
    const bg = background ? `<defs><linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F4EE"/><stop offset="1" stop-color="#E7E0D2"/></linearGradient></defs><rect x="${r1(box.x)}" y="${r1(box.y)}" width="${r1(box.w)}" height="${r1(box.h)}" fill="url(#${id}bg)"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${r1(box.x)} ${r1(box.y)} ${r1(box.w)} ${r1(box.h)}" role="img"${label ? ` aria-label="${label.replace(/"/g, "&quot;")}"` : ""}>${bg}<defs>${ctx.defs.join("")}</defs>${under}${parts.map(p => p.svg).join("")}</svg>`;
}

/** A frame box that fits every frame of an animation from one camera.
 *  bottom: extra room under the floor, e.g. for controls drawn over the frame. */
export function fitBox(skeletons, cam, { aspect = 480 / 300, pad = 18, extra = 0, bottom = 0 } = {}) {
    const M = camera(cam);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const sk of skeletons) for (const v of Object.values(sk.pts)) {
        const p = proj(M, v);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    x0 -= extra; x1 += extra; y0 -= extra;
    // bottom: room kept under the floor (for controls drawn over the frame).
    y1 += bottom;
    let w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2 + 10;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 4;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}
