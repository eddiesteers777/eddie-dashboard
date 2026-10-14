// Southbound 3D exercise clips: a rigged athlete (Mixamo X Bot) posed by
// world-space targets: torso rotations, two-bone IK for arms and legs with
// fixed hand / foot targets (no sliding), aimed hands and feet, curled fingers.
import * as THREE from "three";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const DEG = Math.PI / 180;
export const qEuler = (x = 0, y = 0, z = 0, order = "YXZ") => Q().setFromEuler(new THREE.Euler(x * DEG, y * DEG, z * DEG, order));
const basis = (dir, ref) => {
    const x = dir.clone().normalize();
    const y = ref.clone().sub(x.clone().multiplyScalar(ref.dot(x))).normalize();
    const z = V().crossVectors(x, y);
    return Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
};

export class Rig {
    constructor(root) {
        this.root = root;
        root.updateMatrixWorld(true);
        this.b = {};
        root.traverse(o => { if (o.isBone) this.b[o.name.replace("mixamorig", "").replace(":", "")] = o; });
        this.rest = {};
        for (const [n, o] of Object.entries(this.b)) {
            this.rest[n] = { q: o.quaternion.clone(), p: o.position.clone(), wq: o.getWorldQuaternion(Q()), wp: o.getWorldPosition(V()) };
        }
        const d = (a, b) => this.rest[a].wp.distanceTo(this.rest[b].wp);
        this.len = {
            upper: d("LeftArm", "LeftForeArm"), fore: d("LeftForeArm", "LeftHand"),
            thigh: d("LeftUpLeg", "LeftLeg"), shin: d("LeftLeg", "LeftFoot"),
            foot: d("LeftFoot", "LeftToeBase")
        };
        // Rest aim frames: [dir, ref] for each aimed bone.
        const dir = (a, b) => this.rest[b].wp.clone().sub(this.rest[a].wp).normalize();
        this.aim = {};
        for (const [s, sx] of [["Left", 1], ["Right", -1]]) {
            const nArm = V(0, -sx, 0), nLeg = V(1, 0, 0);
            const ua = dir(s + "Arm", s + "ForeArm"), fa = dir(s + "ForeArm", s + "Hand");
            this.aim[s + "Arm"] = [ua, V().crossVectors(ua, nArm)];
            this.aim[s + "ForeArm"] = [fa, V().crossVectors(fa, nArm)];
            const th = dir(s + "UpLeg", s + "Leg"), sh = dir(s + "Leg", s + "Foot");
            this.aim[s + "UpLeg"] = [th, V().crossVectors(th, nLeg)];
            this.aim[s + "Leg"] = [sh, V().crossVectors(sh, nLeg)];
            this.aim[s + "Hand"] = [dir(s + "Hand", s + "HandMiddle1"), V(0, -1, 0)];
            this.aim[s + "Foot"] = [dir(s + "Foot", s + "ToeBase"), V(1, 0, 0)];
            this.aim[s + "ToeBase"] = [dir(s + "ToeBase", s + "Toe_End"), V(1, 0, 0)];
        }
        // Finger curl axes, in each finger bone's local frame (world rest: the axis the
        // fingers fold around toward the palm).
        this.curlAxis = {};
        for (const [s, sx] of [["Left", 1], ["Right", -1]]) {
            for (const f of ["Index", "Middle", "Ring", "Pinky", "Thumb"]) {
                for (const i of [1, 2, 3]) {
                    const n = `${s}Hand${f}${i}`;
                    if (!this.b[n]) continue;
                    const world = f === "Thumb" ? V(0, sx * 0.3, -1 * sx).normalize() : V(0, 0, -sx);
                    this.curlAxis[n] = world.applyQuaternion(this.rest[n].wq.clone().invert()).normalize();
                }
            }
        }
    }
    reset() {
        for (const [n, o] of Object.entries(this.b)) { o.quaternion.copy(this.rest[n].q); o.position.copy(this.rest[n].p); }
        this.root.updateMatrixWorld(true);
    }
    wp(n) { return this.b[n].getWorldPosition(V()); }
    wq(n) { return this.b[n].getWorldQuaternion(Q()); }
    setWorldQuat(n, wq) {
        const o = this.b[n];
        const pq = o.parent.getWorldQuaternion(Q());
        o.quaternion.copy(pq.invert().multiply(wq));
        o.updateMatrixWorld(true);
    }
    /** Rotate a bone by R relative to its rest world orientation. */
    turn(n, R) { this.setWorldQuat(n, R.clone().multiply(this.rest[n].wq)); }
    /** Aim a bone along dir with its reference axis toward ref. */
    aimAt(n, dir, ref) {
        const [d0, r0] = this.aim[n];
        const R = basis(dir, ref).multiply(basis(d0, r0).invert());
        this.setWorldQuat(n, R.multiply(this.rest[n].wq));
    }
    setHips(pos, R) {
        const o = this.b.Hips;
        o.position.copy(o.parent.worldToLocal(pos.clone()));
        o.updateMatrixWorld(true);
        this.turn("Hips", R);
    }
    /** Torso: hips rotation, chest rotation (spine blends between), neck/head. */
    torso({ pos, hips, chest, head = null, neck = null }) {
        this.setHips(pos, hips);
        this.turn("Spine", hips.clone().slerp(chest, 0.35));
        this.turn("Spine1", hips.clone().slerp(chest, 0.7));
        this.turn("Spine2", chest);
        const nk = neck || chest;
        this.turn("Neck", nk);
        this.turn("Head", head || nk);
        for (const s of ["Left", "Right"]) this.turn(s + "Shoulder", chest);
    }
    /** Clavicle: rotate relative to the chest (elevate = up, positive). */
    clavicle(side, chest, elevate = 0, protract = 0) {
        const sx = side === "Left" ? 1 : -1;
        const R = chest.clone().multiply(qEuler(0, -sx * protract, sx * elevate, "XYZ"));
        this.turn(side + "Shoulder", R);
    }
    /** Two-bone IK. Returns the clamped end position. */
    limb(side, kind, target, pole, { twist = 0 } = {}) {
        const [a, b, c, l1, l2] = kind === "arm"
            ? [side + "Arm", side + "ForeArm", side + "Hand", this.len.upper, this.len.fore]
            : [side + "UpLeg", side + "Leg", side + "Foot", this.len.thigh, this.len.shin];
        const root = this.wp(a);
        const d = target.clone().sub(root);
        const dist = Math.min(Math.max(d.length(), 0.05), (l1 + l2) * 0.9995);
        const dh = d.normalize();
        const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
        const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
        const p = pole.clone().sub(root);
        const perp = p.sub(dh.clone().multiplyScalar(p.dot(dh))).normalize();
        const mid = root.clone().add(dh.clone().multiplyScalar(x)).add(perp.clone().multiplyScalar(h));
        const end = root.clone().add(dh.clone().multiplyScalar(dist));
        const u = mid.clone().sub(root).normalize(), f = end.clone().sub(mid).normalize();
        // Hinge axis from the bend (the pole sets which way it folds).
        let n = V().crossVectors(u, f);
        if (n.length() < 1e-4) n = V().crossVectors(dh, perp).negate();
        n.normalize();
        this.aimAt(a, u, V().crossVectors(u, n));
        const fr = V().crossVectors(f, n).applyAxisAngle(f, twist * DEG);
        this.aimAt(b, f, fr);
        return end;
    }
    curl(side, amount = 0, thumb = amount) {
        for (const [n, axis] of Object.entries(this.curlAxis)) {
            if (!n.startsWith(side)) continue;
            const isThumb = n.includes("Thumb");
            const a = (isThumb ? thumb * (n.endsWith("1") ? 0.3 : 0.6) : amount * (n.endsWith("1") ? 0.85 : 1)) * DEG;
            this.b[n].quaternion.copy(this.rest[n].q).multiply(Q().setFromAxisAngle(axis, a));
        }
        this.b[side + "Hand"].updateMatrixWorld(true);
    }
}

// Colour the X Bot as an athlete: shirt, shorts, shoes, skin, by bone weights.
export function dressAthlete(mesh, colors) {
    const g = mesh.geometry;
    const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const bones = mesh.skeleton.bones.map(b => b.name.replace("mixamorig", "").replace(":", ""));
    const col = new Float32Array(pos.count * 3);
    const v = V();
    mesh.updateMatrixWorld(true);
    const c = {};
    for (const [k, hex] of Object.entries(colors)) c[k] = new THREE.Color(hex);
    for (let i = 0; i < pos.count; i++) {
        let best = 0, bw = -1;
        const w = {};
        for (let k = 0; k < 4; k++) {
            const name = bones[si.getComponent(i, k)], wt = sw.getComponent(i, k);
            w[name] = (w[name] || 0) + wt;
            if (wt > bw) { bw = wt; best = name; }
        }
        v.fromBufferAttribute(pos, i); // raw positions are already in metres
        const y = v.y, ax = Math.abs(v.x);
        let part = "skin";
        if (/^Spine|Shoulder$/.test(best)) part = "shirt";
        else if (/Arm$/.test(best) && !/Fore/.test(best) && ax < 0.31) part = "shirt";
        else if (best === "Neck" && y < 1.47) part = "shirt";
        else if (best === "Hips") part = y > 1.0 ? "shirt" : "shorts";
        else if (/UpLeg$/.test(best) && y > 0.68) part = "shorts";
        else if (/Foot$|ToeBase$|Toe_End$/.test(best) || y < 0.115) part = y < 0.022 ? "sole" : "shoe";
        else if (/Leg$/.test(best) && y < 0.2) part = "sock";
        const cc = c[part] || c.skin;
        col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}
