// Southbound 3D demos: the bodyweight squat (our own motion, no mocap).
// Posed by world-space targets on tools/rig.js: feet planted (two-bone IK, no
// sliding), hips back and down to thighs about parallel, chest up with a
// forward lean that keeps the body's mass over mid-foot, knees out over the
// toes, arms rising forward for balance. Scales to any body from its rest pose.
import * as THREE from "three";
import { qEuler } from "../rig.js";
import { staggerCurve, breathFromCurve, sway, repVar, repWarp } from "../motion-natural.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, s) => a + (b - a) * s;
const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
/** One rep: stand, ease down, brief pause, ease up, stand. 0..1..0 */
export function repCurve(u, [a, b, c, d] = [0.08, 0.48, 0.56, 0.94]) {
    if (u < a) return 0; if (u < b) return ease((u - a) / (b - a));
    if (u < c) return 1; if (u < d) return 1 - ease((u - c) / (d - c)); return 0;
}
const rot = (q, v) => v.clone().applyQuaternion(q);

export const squat = {
    id: "bodyweight-squat", seconds: 7, reps: 2, plantFeet: true,
    setup(rig) {
        const r = n => rig.rest[n].wp.clone();
        this.hipY = r("Hips").y;
        this.hipZ = r("Hips").z;
        this.ank = {};
        for (const s of ["Left", "Right"]) {
            const a = r(s + "Foot");
            const sx = s === "Left" ? 1 : -1;
            // Feet about shoulder-width: ankle 3.5 cm wider than at rest.
            this.ank[s] = V(a.x + sx * 0.035, a.y, a.z);
        }
        this.leg = rig.len.thigh + rig.len.shin;
        // Bottom: hip joints about level with the knees (thighs parallel).
        this.bottomY = r("LeftFoot").y + rig.len.shin * 0.93 + 0.02;
    },
    pose(rig, t) {
        // Natural motion (Step 1): hips lead, the chest follows a little behind, the arms behind that; a breath on the lift;
        // a few millimetres of sway; no two reps alike (a different depth and pace for each).
        const u = repWarp(t, this.reps, 0.012);
        const sHip = repCurve(u);
        const sChest = staggerCurve(u, 0.06, repCurve);
        const sArm = staggerCurve(u, 0.12, repCurve);
        const sHead = staggerCurve(u, 0.03, repCurve);
        const s = Math.min(1, sHip * repVar(t, 0.04));
        const br = breathFromCurve(u);
        const lean = lerp(4, 40, sChest) + (br - 0.5) * 2;
        const hips = qEuler(lerp(2, 38, s)), chest = qEuler(lean);
        // The neck and head follow the chest in small steps (a big jump between them stretches the skin of the neck).
        const neck = qEuler(lean * 0.8), head = qEuler(lean * 0.5 - 8 * sHead);
        const midfoot = this.ank.Left.z - 0.05;   // weight toward the heel keeps the knees from travelling past the toes
        let pos = V(sway(t, this.reps, 0.006), lerp(this.hipY - 0.005, this.bottomY, s), this.hipZ);
        // Shift the hips back until the upper body's mass sits over mid-foot.
        for (let pass = 0; pass < 3; pass++) {
            rig.torso({ pos, hips, chest, neck, head });
            const com = rig.wp("Hips").multiplyScalar(0.5).add(rig.wp("Spine2").multiplyScalar(0.35)).add(rig.wp("Head").multiplyScalar(0.15));
            pos = pos.clone().add(V(0, 0, (midfoot - com.z) * (s > 0.02 ? 1 : 0.4)));
        }
        rig.torso({ pos, hips, chest, neck, head });
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const a = this.ank[side];
            // Knees push out over the toes (toes turned out ~12°).
            rig.limb(side, "leg", a, a.clone().add(V(sx * 0.42, 0.5, 1.2)));
            const Ry = qEuler(0, sx * 12, 0);
            rig.aimAt(side + "Foot", rot(Ry, V(0, -0.42, 1).normalize()), rot(Ry, V(1, 0, 0)));
            rig.aimAt(side + "ToeBase", rot(Ry, V(0, 0, 1)), rot(Ry, V(1, 0, 0)));
        }
        // Arms: hanging at the top, reaching forward to shoulder height at the bottom.
        const reach = (rig.len.upper + rig.len.fore) * 0.97;
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1;
            const sh = rig.wp(side + "Arm");
            const down = V(sx * 0.12, -1, 0.12).normalize(), fwd = V(sx * 0.05, -0.02, 1).normalize();
            const dir = down.clone().lerp(fwd, sArm).normalize(); // follows the hips, a little behind: no fast swing
            const wrist = sh.clone().add(dir.multiplyScalar(reach));
            rig.limb(side, "arm", wrist, sh.clone().add(V(sx * 0.6, -1, -0.3)));
            rig.aimAt(side + "Hand", dir.clone().normalize(), V(0, -1, 0).lerp(V(-sx, 0, 0), 0.5).normalize());
            rig.curl(side, 18, 10);
        }
    }
};
