// Southbound 3D demos: the bodyweight reverse lunge (our own motion, no mocap).
// The front foot stays put. The back foot steps back on an arc, lands on the ball of the foot with the heel
// up, the hips lower until the front thigh is about level and the back knee hovers just above the floor,
// then press back up and the foot returns. Torso upright, hands clasped at the chest.
import * as THREE from "three";
import { qEuler } from "../rig.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, s) => a + (b - a) * s;
const clamp01 = x => Math.min(1, Math.max(0, x));
const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(u));
const rot = (q, v) => v.clone().applyQuaternion(q);

// Phases of one rep (fractions): stand, step back, lower, bottom, rise (the foot comes in during it), stand.
export const LUNGE_PHASES = [0.05, 0.27, 0.5, 0.58, 0.84, 0.95];

export const lunge = {
    id: "reverse-lunge", seconds: 9, reps: 2, plantFeet: true,
    setup(rig) {
        const r = n => rig.rest[n].wp.clone();
        this.hipY = r("Hips").y;
        this.ank = { Left: r("LeftFoot"), Right: r("RightFoot") };
        this.thigh = rig.len.thigh; this.shin = rig.len.shin;
        // Hips at the bottom: knee height, with the knee a little ahead of the ankle.
        this.bottomY = this.ank.Left.y + this.shin * 0.93 + 0.02;
        this.bottomZ = this.ank.Left.z + 0.03 - this.thigh * 0.97;
        this.stepIn = 0.6;
        this.landZ = this.bottomZ - 0.33;          // where the back ankle lands (ball of the foot down)
    },
    pose(rig, t) {
        const u = (t * this.reps) % 1;
        const [a, b, c, d, e, f] = LUNGE_PHASES;
        const m = this.stepIn;                       // the back foot starts coming in while the hips are still rising
        const out = u < c ? ease((u - a) / (b - a)) : u < m ? 1 : 1 - ease((u - m) / (f - m));
        const swing = u < c ? clamp01((u - a) / (b - a)) : u >= m ? clamp01((u - m) / (f - m)) : 0;
        const d0 = a + 0.03, down = u < d0 ? 0 : u < c ? ease((u - d0) / (c - d0)) : u < d ? 1 : u < e ? 1 - ease((u - d) / (e - d)) : 0;
        const lean = lerp(3, 10, down);
        const hips = qEuler(lerp(1, 7, down)), chest = qEuler(lean), neck = qEuler(lean * 0.4), head = qEuler(lean * 0.1 - 3 * down);
        const pos = V(0, lerp(this.hipY - 0.004, this.bottomY, down), lerp(this.ank.Left.z + 0.0, this.bottomZ, down) + 0.0);
        rig.torso({ pos, hips, chest, neck, head });
        // Front foot (Left): never moves.
        const fa = this.ank.Left.clone();
        rig.limb("Left", "leg", fa, fa.clone().add(V(0.05, 0.5, 1.2)));
        rig.aimAt("LeftFoot", V(0, -0.42, 1).normalize(), V(1, 0, 0));
        rig.aimAt("LeftToeBase", V(0, -0.3, 1).normalize(), V(1, 0, 0));
        // Back foot (Right): steps back on an arc, then stays on the ball of the foot.
        const ra = this.ank.Right.clone();
        const lift = Math.sin(Math.PI * swing) * 0.13;
        const heelUp = ease(out) * 0.055;
        const z = lerp(ra.z, this.landZ, out);
        const target = V(ra.x, ra.y + lift + heelUp - 0.0095 * ease(out) * (1 - clamp01(lift * 40)), z); // the toe pad rests on the floor
        rig.limb("Right", "leg", target, V(-0.05, lerp(0.5, -0.3, down), lerp(1.2, 0.7, down)).add(target));
        const tilt = lerp(-0.42, -1.0, ease(out)) + lift * 1.5;
        rig.aimAt("RightFoot", V(0, tilt, 1).normalize(), V(1, 0, 0));
        rig.aimAt("RightToeBase", V(0, lerp(-0.3, -0.6, ease(out)), 1).normalize(), V(1, 0, 0));
        // Arms: hands clasped in front of the chest.
        const ch = rig.wp("Spine2"), fwd = rot(chest, V(0, 0, 1));
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const hand = ch.clone().add(V(sx * 0.035, -0.07, 0)).add(fwd.clone().multiplyScalar(0.2));
            rig.limb(side, "arm", hand, rig.wp(side + "Arm").add(V(sx * 0.5, -0.6, -0.1)));
            rig.aimAt(side + "Hand", V(-sx * 0.3, 0.2, 1).normalize(), V(0, -1, 0));
            rig.curl(side, 40, 20);
        }
    }
};
