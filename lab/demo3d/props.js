/* ==========================================
   Southbound 3D demos — equipment props (plain shapes, no assets).

   attachProps(THREE, root, items) puts a dumbbell in each hand of a loaded
   athlete. The motion decides where the hands go; the dumbbell is a child of
   each hand bone, so it follows. It is lined up from the pose at time 0: the
   handle runs front to back (world z) in the first frame, so a motion that
   uses dumbbells starts with a neutral grip (palms facing each other); with
   grip "pronated" it runs side to side (world x) and the palms face forward.
   Returns { dispose }.
========================================== */

/** A dumbbell as a THREE.Group, handle along z, centred on the handle. Metres. */
export function buildDumbbell(THREE, { handle = 0.13, head = 0.052 } = {}) {
    const g = new THREE.Group(), geos = [], mats = [];
    const own = (geo, mat) => { geos.push(geo); mats.push(mat); const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
    const iron = new THREE.MeshStandardMaterial({ color: 0x5a626b, metalness: 0.5, roughness: 0.42 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb9bcbf, metalness: 0.9, roughness: 0.32 });
    const bar = own(new THREE.CylinderGeometry(0.016, 0.016, handle + 0.06, 20), steel);
    bar.rotation.x = Math.PI / 2;
    for (const sz of [1, -1]) {
        const h = own(new THREE.CylinderGeometry(head, head, 0.055, 6), iron);   // a hex head, like a gym dumbbell
        h.rotation.x = Math.PI / 2; h.position.z = sz * (handle / 2 + 0.03);
    }
    g.userData.dispose = () => { geos.forEach(x => x.dispose()); mats.forEach(x => x.dispose()); };
    return g;
}

export function attachProps(THREE, root, items = []) {
    const made = [];
    const find = name => { let f = null; root.traverse(o => { if (o.isBone && o.name.replace("mixamorig", "").replace(":", "") === name) f = o; }); return f; };
    root.updateMatrixWorld(true);
    for (const item of items || []) {
        if (item?.type !== "dumbbell") continue;
        for (const side of ["Left", "Right"]) {
            const hand = find(side + "Hand"), mid = find(side + "HandMiddle1");
            if (!hand || !mid) continue;
            const sx = side === "Left" ? 1 : -1;
            const db = buildDumbbell(THREE, item);
            // The fist: most of the way from the wrist to the first knuckle, a little toward the palm (inward at time 0).
            const pronated = item.grip === "pronated";
            const toPalm = pronated ? new THREE.Vector3(0, 0, 0.018) : new THREE.Vector3(-sx * 0.018, 0, 0);
            const centre = hand.getWorldPosition(new THREE.Vector3()).lerp(mid.getWorldPosition(new THREE.Vector3()), 0.85).add(toPalm);
            const q = hand.getWorldQuaternion(new THREE.Quaternion()), sc = hand.getWorldScale(new THREE.Vector3());
            hand.add(db);
            db.scale.set(1 / sc.x, 1 / sc.y, 1 / sc.z);
            const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pronated ? Math.PI / 2 : 0);   // handle z -> x for a pronated grip
            db.quaternion.copy(q.invert().multiply(want));
            db.position.copy(hand.worldToLocal(centre));
            made.push(db);
        }
    }
    return { count: made.length, dispose() { for (const d of made) { d.parent?.remove(d); d.userData.dispose(); } } };
}
