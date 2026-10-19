// Southbound 3D demos: the push-up (our own motion, no mocap).
// A straight line from heels to head pivoting on the toes; hands planted
// under the shoulders (two-bone IK, no sliding); the chest comes to a fist
// above the floor and presses back up; elbows about 45 degrees from the ribs.
import * as THREE from "three";
import { qEuler } from "../rig.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, s) => a + (b - a) * s;
const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const rot = (q, v) => v.clone().applyQuaternion(q);
export function repCurve(u, [a, b, c, d] = [0.08, 0.5, 0.57, 0.9]) {
    if (u < a) return 0; if (u < b) return ease((u - a) / (b - a));
    if (u < c) return 1; if (u < d) return 1 - ease((u - c) / (d - c)); return 0;
}
const FLOOR = 0;

// The body laid out at angle a (degrees above the floor), straight from heels
// to head, toes tucked, with the toe joints on the floor at toeZ.
function straightBody(rig, a, toeZ) {
    const R = qEuler(90 - a), chest = qEuler(90 - a);
    let pos = V(0, 0.5, 0);
    for (let pass = 0; pass < 2; pass++) {
        rig.torso({ pos, hips: R, chest, neck: chest, head: qEuler(90 - a - 14) });
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const hip = rig.wp(side + "UpLeg");
            const L = (rig.len.thigh + rig.len.shin) * 0.997;
            const ankle = hip.clone().add(rot(R, V(sx * -0.012, -L, 0)));
            rig.limb(side, "leg", ankle, ankle.clone().add(rot(R, V(0, 0.4, 1))));
            rig.aimAt(side + "Foot", rot(R, V(0, -0.1, 1)).normalize(), V(1, 0, 0));
            rig.aimAt(side + "ToeBase", V(0, -0.05, 1).normalize(), V(1, 0, 0));
        }
        const toe = rig.wp("LeftToeBase");
        pos = pos.clone().add(V(0, FLOOR + 0.022 - toe.y, toeZ - toe.z));
    }
}
const shoulderY = rig => (rig.wp("LeftArm").y + rig.wp("RightArm").y) / 2;
function solveAngle(rig, toeZ, f, goal, lo = 0, hi = 40) {
    for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2;
        rig.reset(); straightBody(rig, mid, toeZ);
        if (f(rig) < goal) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

export const pushup = {
    id: "push-up", seconds: 13.5, reps: 3,
    setup(rig) {
        this.toeZ = -0.82;
        this.wristY = FLOOR + 0.04;
        const reach = (rig.len.upper + rig.len.fore) * 0.985;
        let hz = 0.5;
        for (let k = 0; k < 4; k++) {
            const d = r => { const s = r.wp("LeftArm"); return Math.hypot(s.x - 0.22, s.y - this.wristY, s.z - hz); };
            this.top = solveAngle(rig, this.toeZ, d, reach);
            rig.reset(); straightBody(rig, this.top, this.toeZ);
            hz = rig.wp("LeftArm").z + 0.02;
        }
        this.hz = hz;
        this.bottom = solveAngle(rig, this.toeZ, shoulderY, 0.215); // chest a fist off the floor
        rig.reset();
    },
    pose(rig, t) {
        const u = (t * this.reps) % 1;
        const s = repCurve(u);
        straightBody(rig, lerp(this.top, this.bottom, s), this.toeZ);
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const sh = rig.wp(side + "Arm");
            const wrist = V(sx * 0.22, this.wristY, this.hz);
            rig.limb(side, "arm", wrist, sh.clone().add(V(sx * 0.7, 0.6, -1))); // elbows out and back ~45 degrees
            rig.aimAt(side + "Hand", V(sx * 0.18, 0, 1).normalize(), V(0, -1, 0));
            rig.curl(side, 8, 5);
        }
    }
};
