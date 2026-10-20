// Southbound 3D demos: the bent-over dumbbell row (our own motion, no mocap).
// Feet planted, knees soft, hips hinged back with a flat back (about 50° from upright), a dumbbell in
// each hand hanging under the shoulders. Pull both elbows back past the ribs, squeeze, lower under control.
// The torso holds still; only the arms move. The dumbbells are props added by the player (props.js).
import * as THREE from "three";
import { qEuler } from "../rig.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, s) => a + (b - a) * s;
const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const rot = (q, v) => v.clone().applyQuaternion(q);

// Phases of one rep (fractions): hang, pull, squeeze, lower, hang.
export const ROW_PHASES = [0.1, 0.4, 0.5, 0.92];
export function rowCurve(u, [a, b, c, d] = ROW_PHASES) {
    if (u < a) return 0; if (u < b) return ease((u - a) / (b - a));
    if (u < c) return 1; if (u < d) return 1 - ease((u - c) / (d - c)); return 0;
}

export const row = {
    id: "dumbbell-row", seconds: 10, reps: 2, plantFeet: true,
    setup(rig) {
        const r = n => rig.rest[n].wp.clone();
        this.hipY = r("Hips").y; this.hipZ = r("Hips").z;
        this.ank = {};
        for (const s of ["Left", "Right"]) { const a = r(s + "Foot"), sx = s === "Left" ? 1 : -1; this.ank[s] = V(a.x + sx * 0.035, a.y, a.z); }
        this.reach = (rig.len.upper + rig.len.fore) * 0.97;
    },
    pose(rig, t) {
        const u = (t * this.reps) % 1, s = rowCurve(u);
        const lean = 52;
        const hips = qEuler(62), chest = qEuler(lean), neck = qEuler(lean * 0.78), head = qEuler(lean * 0.42);
        const midfoot = this.ank.Left.z + 0.06;
        let pos = V(0, this.hipY - 0.1, this.hipZ);
        for (let pass = 0; pass < 3; pass++) {
            rig.torso({ pos, hips, chest, neck, head });
            const com = rig.wp("Hips").multiplyScalar(0.45).add(rig.wp("Spine2").multiplyScalar(0.4)).add(rig.wp("Head").multiplyScalar(0.15));
            pos = pos.clone().add(V(0, 0, midfoot - com.z));
        }
        rig.torso({ pos, hips, chest, neck, head });
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1, a = this.ank[side];
            rig.limb(side, "leg", a, a.clone().add(V(sx * 0.3, 0.5, 1.2)));
            const Ry = qEuler(0, sx * 10, 0);
            rig.aimAt(side + "Foot", rot(Ry, V(0, -0.42, 1).normalize()), rot(Ry, V(1, 0, 0)));
            rig.aimAt(side + "ToeBase", rot(Ry, V(0, 0, 1)), rot(Ry, V(1, 0, 0)));
        }
        // Arms: wrists hang under the shoulders, then come up beside the ribs; elbows drive back and a little out.
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1, sh = rig.wp(side + "Arm");
            const hang = sh.clone().add(V(sx * 0.02, -this.reach, 0.02));
            const top = sh.clone().add(V(sx * 0.07, -0.12, -0.2));
            const wrist = hang.clone().lerp(top, s);
            rig.limb(side, "arm", wrist, sh.clone().add(V(sx * 0.5, -0.1 - 0.2 * s, -1)));
            const dir = V(sx * 0.0, -1, 0.1 - 0.3 * s).normalize();   // forearm stays close to vertical
            rig.aimAt(side + "Hand", dir, V(-sx, 0, 0));              // palms face each other (neutral grip)
            rig.curl(side, 75, 45);
        }
    }
};
