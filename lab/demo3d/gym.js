// The garage gym the demos are set in: forest walls, rubber floor, a rack, dumbbells, a bench, a mirror and
// the Southbound mark. Plain shapes only (no outside models), built once per demo and disposed with it.
// Two walls behind the athlete (the cameras look in from +x, +z); the rest is dark and fades into fog.

const DARK = 0x1a201d;

/** Adds the gym to `scene`. `floorMat` = lay a mat under the athlete (push-ups and other floor work). */
export function buildGym(THREE, scene, { floorMat = false, logoUrl = null } = {}) {
    const group = new THREE.Group();
    scene.add(group);
    const owned = [];   // textures and materials to dispose
    const own = x => { owned.push(x); return x; };
    const std = (c, r = 0.7, m = 0) => own(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
    const box = (w, h, d, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    const cyl = (r, h, mat, x, y, z, rot = [0, 0, 0], parent = group) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat); m.position.set(x, y, z); m.rotation.set(...rot); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    const tex = (w, h, draw, rep) => {
        const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
        const t = own(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); }
        return t;
    };

    // Floor: dark rubber tiles. Walls: forest green.
    const rubber = tex(512, 512, (c, w, h) => {
        c.fillStyle = "#3a3835"; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 3500; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},0.06)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
        c.strokeStyle = "#171615"; c.lineWidth = 3; c.strokeRect(0, 0, w, h);
    }, [8, 8]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), own(new THREE.MeshStandardMaterial({ map: rubber, roughness: 0.85 })));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
    const wall = (color, x, z, ry) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), std(color, 0.95)); w.position.set(x, 3, z); w.rotation.y = ry; w.receiveShadow = true; group.add(w); };
    wall(0x41664f, 0, -3.2, 0); wall(0x385845, -3.2, 0, Math.PI / 2);

    const plate = (x, y, z, r, t, col, rot) => cyl(r, t, std(col, 0.5, 0.3), x, y, z, rot);
    // Power rack with a loaded bar.
    { const g = new THREE.Group(); g.position.set(-1.9, 0, -2.2); group.add(g);
      const m = std(0x1b1d1c, 0.45, 0.5), tan = std(0xc9ad84, 0.4, 0.5), steel = std(0xb8b8b8, 0.3, 0.9);
      for (const dx of [-0.7, 0.7]) for (const dz of [-0.55, 0.55]) box(0.1, 2.3, 0.1, m, dx, 1.15, dz, g);
      for (const dz of [-0.55, 0.55]) { box(1.5, 0.08, 0.08, m, 0, 2.25, dz, g); box(1.5, 0.06, 0.06, tan, 0, 1.35, dz, g); }
      for (const dx of [-0.7, 0.7]) box(0.08, 0.08, 1.2, m, dx, 2.25, 0, g);
      cyl(0.017, 2.2, steel, 0, 1.45, 0.4, [0, 0, Math.PI / 2], g);
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { const p = plate(0, 0, 0, 0.225 - i * 0.03, 0.04, 0x1d1f1e, [0, 0, Math.PI / 2]); group.remove(p); p.position.set(s * (0.8 + i * 0.045), 1.45, 0.4); g.add(p); } }
    // Dumbbell racks.
    const dumbbells = (x, z, ry) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; group.add(g);
      const fr = std(0x151716, 0.5, 0.4), db = std(0x2a2d2c, 0.4, 0.5);
      for (const dx of [-0.8, 0.8]) box(0.06, 0.8, 0.5, fr, dx, 0.4, 0, g);
      for (const [y, dz] of [[0.35, 0.1], [0.62, -0.05]]) { box(1.7, 0.05, 0.12, fr, 0, y, dz, g);
          for (let i = 0; i < 9; i++) { const s = 0.05 + i * 0.006; cyl(s, 0.08, db, -0.7 + i * 0.175, y + s + 0.03, dz, [0, 0, Math.PI / 2], g); } } };
    dumbbells(1.6, -2.85, 0); dumbbells(-2.85, 1.2, Math.PI / 2);
    // Bench, plates on the floor, kettlebells.
    { const g = new THREE.Group(); g.position.set(-1.4, 0, 0.2); g.rotation.y = 0.2; group.add(g);
      box(0.3, 0.1, 1.2, std(0x1a1a1a, 0.6), 0, 0.43, 0, g);
      for (const dz of [-0.3, 0.3]) box(0.05, 0.4, 0.05, std(0x2b2b2b, 0.4, 0.6), 0, 0.2, dz, g); }
    for (let i = 0; i < 3; i++) plate(1.2 + i * 0.05, 0.03 + i * 0.045, -2.3, 0.225, 0.04, 0x1d1f1e, [0, 0, 0]);
    for (const [x, z, col] of [[2.2, -1.6, 0x1c1e1d], [2.45, -1.5, 0x3a2a1c]]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), std(col, 0.4, 0.5)); s.position.set(x, 0.12, z); s.castShadow = true; group.add(s);
        const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 18, Math.PI), std(col, 0.4, 0.5)); h.position.set(x, 0.21, z); h.castShadow = true; group.add(h); }
    // Mirror on the side wall, light strips, the mark on the back wall.
    { const g = new THREE.Group(); g.position.set(-3.17, 1.35, -0.6); g.rotation.y = Math.PI / 2; group.add(g);
      const glass = tex(64, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#c9d6d3"); gr.addColorStop(0.45, "#9fb3ae"); gr.addColorStop(0.5, "#dfe9e6"); gr.addColorStop(1, "#7d928d"); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), own(new THREE.MeshBasicMaterial({ map: glass, toneMapped: false }))); g.add(m);
      box(2.66, 1.86, 0.03, std(0x15201a, 0.5, 0.4), 0, 0, -0.025, g); }
    for (const x of [-1.2, 0.6, 2.2]) box(0.7, 0.04, 0.12, own(new THREE.MeshBasicMaterial({ color: 0xfff1d6 })), x, 2.75, -1.5);
    let logo = null;
    if (logoUrl) new THREE.TextureLoader().load(logoUrl, t => {
        t.colorSpace = THREE.SRGBColorSpace; owned.push(t);
        const w = 2.2; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * t.image.height / t.image.width), own(new THREE.MeshBasicMaterial({ map: t, transparent: true })));
        m.position.set(0.2, 2.1, -3.18); group.add(m); logo = m; scene.userData.redraw?.();
    });
    if (floorMat) box(1.2, 0.025, 2.8, std(0x24372d, 0.9), 0, 0.0125, -0.05);

    return {
        background: DARK, fogNear: 7, fogFar: 15,
        ambient: [0xfff0dc, 1.9], key: [0xffe6c8, 2.6],
        dispose() {
            group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
            for (const x of owned) x.dispose();
            scene.remove(group);
        }
    };
}
