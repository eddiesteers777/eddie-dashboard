// Southbound 3D demos: the forearm plank (our own motion, no mocap).
// A held position: one straight line from heels to head, resting on the forearms and the balls of the feet,
// elbows under the shoulders, neck long. Nothing moves except a slow breath, so the loop shows the shape to hold.
import * as THREE from "three";
import { qEuler } from "../rig.js";
import { straightBody, solveAngle, shoulderY } from "./pushup.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const plank = {
    id: "forearm-plank", seconds: 8, reps: 1,
    setup(rig) {
        this.toeZ = -0.82;
        this.elbowY = 0.045;
        // Body angle that puts the shoulders one upper-arm length above the elbows (elbows under the shoulders).
        this.angle = solveAngle(rig, this.toeZ, shoulderY, this.elbowY + rig.len.upper * 0.985, 0, 40);
        this.fore = rig.len.fore * 0.985;
        rig.reset();
    },
    pose(rig, t) {
        const breath = Math.sin(2 * Math.PI * t * 2);               // two slow breaths over the loop
        straightBody(rig, this.angle + 0.25 * breath, this.toeZ);
        for (const side of ["Left", "Right"]) {
            const sx = side === "Left" ? 1 : -1, sh = rig.wp(side + "Arm");
            const wrist = V(sh.x * 0.92, this.elbowY + 0.005, sh.z + this.fore);   // forearms flat on the floor, parallel, pointing forward
            rig.limb(side, "arm", wrist, sh.clone().add(V(sx * 0.3, -1, -0.2)));
            rig.aimAt(side + "Hand", V(sx * 0.05, 0, 1).normalize(), V(0, -1, 0));
            rig.curl(side, 25, 15);
        }
    }
};
