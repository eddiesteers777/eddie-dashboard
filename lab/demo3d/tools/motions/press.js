// Southbound 3D demos: the standing dumbbell overhead press (our own motion, no mocap).
// Feet hip-width and planted, ribs down, a dumbbell in each hand resting at the shoulders with palms forward.
// Press both dumbbells straight up until the arms are long and the weights sit over the shoulders, then lower
// under control. Only the arms (and the shoulder blades, which rise at the top) move. The dumbbells are props
// added by the player (props.js, grip "pronated": the handle runs side to side in the first frame).
import * as THREE from "three";
import { qEuler } from "../rig.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, s) => a + (b - a) * s;
const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const rot = (q, v) => v.clone().applyQuaternion(q);

// Phases of one rep (fractions): rack, press, lockout, lower, rack.
export const PRESS_PHASES = [0.08, 0.4, 0.5, 0.92];
export function pressCurve(u, [a, b, c, d] = PRESS_PHASES) {
    if (u < a) return 0; if (u < b) return ease((u - a) / (b - a));
    if (u < c) return 1; if (u < d) return 1 - ease((u - c) / (d - c)); return 0;
}

export const press = {
    id: "dumbbell-press", seconds: 10, reps: 2, plantFeet: true,
    setup(rig) {
        const r = n => rig.rest[n].wp.clone();
        this.hipY = r("Hips").y; this.hipZ = r("Hips").z;
        this.ank = {};
        for (const s of ["Left", "Right"]) { const a = r(s + "Foot"), sx = s === "Left" ? 1 : -1; this.ank[s] = V(a.x + sx * 0.035, a.y, a.z); }
        this.reach = (rig.len.upper + rig.len.fore) * 0.985;
    },
    pose(rig, t) {
        const u = (t * this.reps) % 1, s = pressCurve(u);
        const hips = qEuler(1), chest = qEuler(lerp(1, -2, s)), neck = qEuler(lerp(0, -2, s)), head = qEuler(lerp(0, -3, s));
        rig.torso({ pos: V(0, this.hipY - 0.004, this.hipZ), hips, chest, neck, head });
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1, a = this.ank[side];
            rig.limb(side, "leg", a, a.clone().add(V(sx * 0.3, 0.5, 1.2)));
            const Ry = qEuler(0, sx * 8, 0);
            rig.aimAt(side + "Foot", rot(Ry, V(0, -0.42, 1).normalize()), rot(Ry, V(1, 0, 0)));
            rig.aimAt(side + "ToeBase", rot(Ry, V(0, 0, 1)), rot(Ry, V(1, 0, 0)));
            rig.clavicle(side, chest, 16 * s);          // the shoulder blades rise as the weights go overhead
        }
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1, sh = rig.wp(side + "Arm");
            const rack = sh.clone().add(V(sx * 0.06, 0.07, 0.1)), top = sh.clone().add(V(sx * 0.03, this.reach, 0.02));
            const wrist = rack.clone().lerp(top, s);
            rig.limb(side, "arm", wrist, sh.clone().add(V(sx * 0.5, -0.6, 0.25)));
            rig.aimAt(side + "Hand", V(sx * 0.02, 1, 0.04).normalize(), V(0, 0, 1));   // forearm vertical, palm forward
            rig.curl(side, 75, 45);
        }
    }
};
