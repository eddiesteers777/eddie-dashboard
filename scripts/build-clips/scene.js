import * as THREE from "three";
import { GLTFLoader } from "./vendor/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "./vendor/examples/jsm/environments/RoomEnvironment.js";
import { Rig, dressAthlete } from "./rig.js";

export const BG = "#ECE8E0";
export const COLORS = { shirt: "#1E3A2C", shorts: "#2A2E2B", skin: "#B48C72", shoe: "#B89B6E", sole: "#F3EFE6", sock: "#B48C72" };

export async function makeScene(size = 1080) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b0a2, 1.1));
    const key = new THREE.DirectionalLight(0xfff6ea, 2.4);
    key.position.set(2.5, 5, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3, bottom: -1.5, near: 0.5, far: 14 });
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8eef0, 0.9);
    rim.position.set(-3, 3, -3);
    scene.add(rim);

    // An unlit floor in the background colour (no horizon line) with only
    // the shadows drawn on it.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: BG, toneMapped: false, fog: false }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ color: 0x2a2620, opacity: 0.2 }));
    shade.rotation.x = -Math.PI / 2;
    shade.position.y = 0.0005;
    shade.receiveShadow = true;
    scene.add(shade);

    const gltf = await new Promise((res, rej) => new GLTFLoader().load("vendor/examples/models/gltf/Xbot.glb", res, undefined, rej));
    const model = gltf.scene;
    scene.add(model);
    model.updateMatrixWorld(true);
    model.traverse(o => {
        if (!o.isSkinnedMesh) return;
        dressAthlete(o, COLORS);
        o.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
    });
    const rig = new Rig(model);
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    return { renderer, scene, camera, rig, THREE };
}

// Equipment
const steel = () => new THREE.MeshStandardMaterial({ color: "#A3A6A3", metalness: 0.85, roughness: 0.32 });
const rubber = () => new THREE.MeshStandardMaterial({ color: "#1F2321", roughness: 0.85 });
const coat = () => new THREE.MeshStandardMaterial({ color: "#2C312E", roughness: 0.55, metalness: 0.2 });
const shadowy = m => { m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };

export function barbell() {
    const g = new THREE.Group();
    const cyl = (r, l, mat, x = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 40), mat); m.rotation.z = Math.PI / 2; m.position.x = x; return m; };
    g.add(cyl(0.0145, 1.31, steel()));
    for (const s of [-1, 1]) {
        g.add(cyl(0.025, 0.42, steel(), s * (0.655 + 0.21)));
        g.add(cyl(0.04, 0.03, steel(), s * 0.67));
        g.add(cyl(0.225, 0.055, rubber(), s * 0.72));
        g.add(cyl(0.225 * 0.86, 0.045, rubber(), s * 0.78));
        g.add(cyl(0.06, 0.062, steel(), s * 0.72));
    }
    return shadowy(g);
}

export function pullupRig(barY = 2.3, half = 0.62) {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, half * 2 + 0.08, 32), steel());
    bar.rotation.z = Math.PI / 2; bar.position.y = barY; g.add(bar);
    for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, barY + 0.12, 0.06), coat());
        post.position.set(s * (half + 0.07), (barY + 0.12) / 2, 0); g.add(post);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 1.1), coat());
        foot.position.set(s * (half + 0.07), 0.02, 0); g.add(foot);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.08), coat());
        cap.position.set(s * (half + 0.07), barY, 0); g.add(cap);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.2, 0.06, 0.06), coat());
    top.position.set(0, barY + 0.15, 0); g.add(top);
    return shadowy(g);
}

export function mat(length = 1.9, width = 0.62) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, 0.008, length), new THREE.MeshStandardMaterial({ color: "#3A4A40", roughness: 0.95 }));
    m.position.y = 0.004; m.receiveShadow = true;
    return m;
}
