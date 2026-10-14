import * as THREE from "three";
import { qEuler } from "./rig.js";
import { barbell, pullupRig, mat } from "./scene.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, s) => a + (b - a) * s;
const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
/** One rep: hold, go (ease), hold, come back (ease), hold. Returns 0..1..0. */
export function repCurve(u, [a, b, c, d]) {
    if (u < a) return 0;
    if (u < b) return ease((u - a) / (b - a));
    if (u < c) return 1;
    if (u < d) return 1 - ease((u - c) / (d - c));
    return 0;
}
const rot = (q, v) => v.clone().applyQuaternion(q);

function flatFoot(rig, side, yaw) {
    const sx = side === "Left" ? 1 : -1;
    const [d0] = rig.aim[side + "Foot"];
    const Ry = qEuler(0, sx * yaw, 0);
    rig.aimAt(side + "Foot", rot(Ry, d0), rot(Ry, V(1, 0, 0)));
    const [t0] = rig.aim[side + "ToeBase"];
    rig.aimAt(side + "ToeBase", rot(Ry, t0), rot(Ry, V(1, 0, 0)));
}

// ---------- Barbell back squat ----------
export const squat = {
    id: "barbell-back-squat", seconds: 9, reps: 3,
    camera: { target: [0, 0.82, -0.08], yaw: 58, pitch: 6, dist: 4.7 },
    setup(scene) { this.bar = barbell(); scene.add(this.bar); },
    pose(rig, t) {
        const u = (t * this.reps) % 1;
        const s = repCurve(u, [0.06, 0.5, 0.58, 0.92]);
        const lean = lerp(5, 41, s);
        const hipsQ = qEuler(lerp(3, 36, s)), chest = qEuler(lean);
        const neck = qEuler(lean * 0.55), head = qEuler(lean * 0.18);
        const ank = { Left: V(0.17, 0.084, 0), Right: V(-0.17, 0.084, 0) };
        let pos = V(0, lerp(1.005, 0.5, s), lerp(0, -0.25, s));
        let barPos;
        for (let pass = 0; pass < 2; pass++) {
            rig.torso({ pos, hips: hipsQ, chest, neck, head });
            barPos = rig.wp("Neck").add(rot(chest, V(0, -0.045, -0.075)));
            pos = pos.clone().add(V(0, 0, 0.045 - barPos.z));
        }
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            rig.limb(side, "leg", ank[side], ank[side].clone().add(V(sx * 0.32, 0.45, 1.2)));
            flatFoot(rig, side, 14);
        }
        this.bar.position.copy(barPos);
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const grip = barPos.clone().add(V(sx * 0.34, 0, 0));
            const hd = rot(chest, V(sx * 0.05, 0.92, 0.38)).normalize();
            const palm = rot(chest, V(0, -0.38, 0.92)).normalize();
            const wrist = grip.clone().sub(hd.clone().multiplyScalar(0.075)).sub(palm.clone().multiplyScalar(0.03));
            const sh = rig.wp(side + "Arm");
            rig.limb(side, "arm", wrist, sh.clone().add(rot(chest, V(sx * 0.5, -1, -0.7))), { twist: 0 });
            rig.aimAt(side + "Hand", hd, palm);
            rig.curl(side, 78, 45);
        }
    }
};


// ---------- Floor work: a straight body pivoting on its toes ----------
const MAT = 0.008;
// Lay the body out at angle a (degrees above the floor), straight from heels to head,
// toes tucked, then move it so the toe joints sit on the floor at toeZ.
function straightBody(rig, a, toeZ, { breathe = 0 } = {}) {
    const R = qEuler(90 - a);
    const chest = qEuler(90 - a + breathe);
    let pos = V(0, 0.5, 0);
    for (let pass = 0; pass < 2; pass++) {
        rig.torso({ pos, hips: R, chest, neck: chest, head: qEuler(90 - a - 14) });
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const hip = rig.wp(side + "UpLeg");
            const L = (rig.len.thigh + rig.len.shin) * 0.997;
            const ankle = hip.clone().add(rot(R, V(sx * -0.012, -L, 0)));
            rig.limb(side, "leg", ankle, ankle.clone().add(rot(R, V(0, 0.4, 1))));
            const fd = rot(R, V(0, -0.1, 1)).normalize();
            rig.aimAt(side + "Foot", fd, V(1, 0, 0));
            rig.aimAt(side + "ToeBase", V(0, -0.05, 1).normalize(), V(1, 0, 0));
        }
        const toe = rig.wp("LeftToeBase");
        pos = pos.clone().add(V(0, MAT + 0.022 - toe.y, toeZ - toe.z));
    }
    return { R, chest };
}
function shoulderY(rig) { return (rig.wp("LeftArm").y + rig.wp("RightArm").y) / 2; }
function solveAngle(rig, toeZ, f, goal, lo = 0, hi = 40) {
    // f(rig) grows with the angle; find the angle where it equals goal.
    for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2;
        rig.reset(); straightBody(rig, mid, toeZ);
        if (f(rig) < goal) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

export const plank = {
    id: "plank", seconds: 8,
    camera: { target: [0, 0.24, 0.02], yaw: 90, pitch: 8, dist: 3.9 },
    setup(scene, rig) {
        scene.add(mat());
        this.toeZ = -0.78;
        this.elbowY = MAT + 0.05;
        this.a = solveAngle(rig, this.toeZ, r => shoulderY(r) - r.len.upper, this.elbowY);
    },
    pose(rig, t) {
        const breathe = Math.sin(t * Math.PI * 4) * 0.8;
        const { chest } = straightBody(rig, this.a, this.toeZ, { breathe });
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const sh = rig.wp(side + "Arm");
            const elbow = V(sx * 0.17, this.elbowY, sh.z);
            const wrist = V(sx * 0.07, MAT + 0.045, sh.z + rig.len.fore * 0.98);
            rig.limb(side, "arm", wrist, elbow.clone().add(V(0, -0.5, -0.4)), { twist: 0 });
            rig.aimAt(side + "Hand", V(-sx * 0.25, -0.12, 1).normalize(), V(-sx * 0.6, -1, 0).normalize());
            rig.curl(side, 70, 30);
        }
    }
};

export const pushup = {
    id: "push-up", seconds: 8.4, reps: 3,
    camera: { target: [0, 0.32, 0.0], yaw: 70, pitch: 9, dist: 4.0 },
    setup(scene, rig) {
        scene.add(mat());
        this.toeZ = -0.82;
        this.wristY = MAT + 0.04;
        const reach = (rig.len.upper + rig.len.fore) * 0.985;
        let hz = 0.5;
        for (let k = 0; k < 4; k++) {
            const d = r => { const s = r.wp("LeftArm"); return Math.hypot(s.x - 0.22, s.y - this.wristY, s.z - hz); };
            this.top = solveAngle(rig, this.toeZ, d, reach);
            rig.reset(); straightBody(rig, this.top, this.toeZ);
            hz = rig.wp("LeftArm").z + 0.02;
        }
        this.hz = hz;
        this.bottom = solveAngle(rig, this.toeZ, shoulderY, 0.215);
    },
    pose(rig, t) {
        const u = (t * this.reps) % 1;
        const s = repCurve(u, [0.08, 0.5, 0.57, 0.9]);
        straightBody(rig, lerp(this.top, this.bottom, s), this.toeZ);
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const sh = rig.wp(side + "Arm");
            const wrist = V(sx * 0.22, this.wristY, this.hz);
            rig.limb(side, "arm", wrist, sh.clone().add(V(sx * 0.7, 0.6, -1)));
            rig.aimAt(side + "Hand", V(sx * 0.18, 0, 1).normalize(), V(0, -1, 0));
            rig.curl(side, 8, 5);
        }
    }
};

// ---------- Pull-up ----------
const BAR_Y = 2.42;
export const pullup = {
    id: "pull-up", seconds: 9, reps: 3,
    camera: { target: [0, 1.3, 0], yaw: 32, pitch: 4, dist: 6.9 },
    setup(scene) { scene.add(pullupRig(BAR_Y, 0.62)); },
    pose(rig, t) {
        const u = (t * this.reps) % 1;
        const s = repCurve(u, [0.06, 0.46, 0.56, 0.94]);
        const lean = lerp(0, -10, s);
        const hips = qEuler(lean * 0.6), chest = qEuler(lean);
        const head = qEuler(lerp(0, -12, s));
        const grips = { Left: V(0.3, BAR_Y, 0), Right: V(-0.3, BAR_Y, 0) };
        const hd = V(0, 1, -0.12).normalize(), palm = V(0, 0.12, 1).normalize();
        const wristOf = g => g.clone().sub(hd.clone().multiplyScalar(0.075)).sub(palm.clone().multiplyScalar(0.03));
        const reach = (rig.len.upper + rig.len.fore) * 0.98;
        const hang = wristOf(grips.Left).y - Math.sqrt(reach * reach - 0.15 * 0.15);
        const goal = V(0, lerp(hang, BAR_Y - 0.06, s), lerp(-0.03, -0.11, s));
        let pos = V(0, 1.4, 0);
        const elev = lerp(24, 4, Math.min(1, s * 1.6));
        for (let pass = 0; pass < 2; pass++) {
            rig.torso({ pos, hips, chest, neck: chest, head });
            for (const side of ["Left", "Right"]) rig.clavicle(side, chest, elev, 0);
            const sh = rig.wp("LeftArm").add(rig.wp("RightArm")).multiplyScalar(0.5);
            pos = pos.clone().add(goal.clone().sub(sh));
        }
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const hip = rig.wp(side + "UpLeg");
            const L = (rig.len.thigh + rig.len.shin) * 0.975;
            const ankle = hip.clone().add(rot(hips, V(-sx * 0.035, -L * 0.99, L * 0.14)));
            rig.limb(side, "leg", ankle, ankle.clone().add(rot(hips, V(0, 0.5, 1.2))));
            const shin = ankle.clone().sub(rig.wp(side + "Leg")).normalize();
            const fd = shin.clone().multiplyScalar(0.75).add(rot(hips, V(0, 0, 0.66))).normalize();
            rig.aimAt(side + "Foot", fd, V(1, 0, 0));
            rig.aimAt(side + "ToeBase", fd, V(1, 0, 0));
            const sh = rig.wp(side + "Arm");
            rig.limb(side, "arm", wristOf(grips[side]), sh.clone().add(V(sx * 1, -0.35, 0.25)));
            rig.aimAt(side + "Hand", hd, palm);
            rig.curl(side, 82, 55);
        }
    }
};

export const ALL = { squat, plank, pushup, pullup };
