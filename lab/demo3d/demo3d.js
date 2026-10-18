/* ==========================================
   Southbound 3D demos — the player

   mountDemo3D(host, { name, catalogUrl, sex, includeReview, onFallback })
   plays one exercise from exercises.json: a male or female athlete (a
   GLB with its baked, looping clip), play/pause (or tap the stage),
   Male/Female, 3/4 · Side · Front, 0.5×, drag to turn the body.

   Light on phones: Three.js loads only when a demo opens, pixel ratio
   at most 1.5, nothing draws while paused, off screen or in a hidden
   tab, and everything is disposed on close. Reduce Motion starts paused
   at the bottom of the rep. With no WebGL, or a model that won't load,
   it calls onFallback(reason) so the page can show the drawn figure.
   Controls sit under the stage, never over the athlete.
========================================== */
import { VIEWS, SPEEDS, findDemo, playable, pickSex, viewsFor, cameraFor, modelUrl } from "./catalog.js";

const BACKDROP = "#ECE8E0"; // the clips' backdrop: the athlete sits edge to edge on the cream stage
const SEX_LABEL = { male: "Male", female: "Female" };

/** Can this device draw WebGL at all? */
export function webglAvailable() {
    try {
        const c = document.createElement("canvas");
        return Boolean(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch { return false; }
}

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let catalogCache = null;
/** exercises.json, fetched once per page. */
export function loadCatalog(url = new URL("./exercises.json", import.meta.url).href) {
    if (!catalogCache || catalogCache.url !== url) {
        catalogCache = { url, promise: fetch(url).then(r => { if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json(); }) };
        catalogCache.promise.catch(() => { catalogCache = null; });
    }
    return catalogCache.promise.then(catalog => ({ catalog, base: url }));
}

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function playerHtml(entry, views, sexes, inReview) {
    const pills = (group, items, label) => `<div class="d3-group" role="group" aria-label="${label}">${items.map(([v, text]) =>
        `<button type="button" class="d3-pill" data-${group}="${v}" aria-pressed="false">${esc(text)}</button>`).join("")}</div>`;
    return `
    <div class="d3-stage" data-stage>
        <button type="button" class="d3-tap" data-tap aria-label="Pause the demo">
            <span class="d3-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></span>
        </button>
        <div class="d3-loading" data-loading role="status"><span class="d3-spinner" aria-hidden="true"></span><span data-loading-text>Loading the athlete</span></div>
        ${inReview ? `<span class="d3-badge">In review</span>` : ""}
        <div class="d3-bar" aria-hidden="true"><span data-progress></span></div>
    </div>
    <div class="d3-controls">
        <button type="button" class="d3-pill d3-playbtn" data-toggle aria-pressed="true">Pause</button>
        ${sexes.length > 1 ? pills("sex", sexes.map(s => [s, SEX_LABEL[s]]), "Athlete") : ""}
        ${views.length > 1 ? pills("view", views.map(v => [v, VIEWS[v].label]), "Angle") : ""}
        <button type="button" class="d3-pill" data-speed aria-pressed="false" aria-label="Half speed">0.5×</button>
    </div>
    <p class="d3-hint">Drag the athlete to turn them.</p>`;
}

/**
 * Mount a demo. Resolves to a controller { play, pause, setSex, setView,
 * setSpeed, dispose, get state } or null when it fell back.
 */
export async function mountDemo3D(host, { name, catalogUrl, sex = "male", includeReview = false, onFallback = () => {} } = {}) {
    const fail = reason => { host.classList.remove("d3-player"); host.innerHTML = ""; onFallback(reason); return null; };
    if (!webglAvailable()) return fail("no-webgl");
    let catalog, base;
    try { ({ catalog, base } = await loadCatalog(catalogUrl)); } catch { return fail("catalog"); }
    const entry = findDemo(catalog, name);
    if (!playable(entry, { includeReview })) return fail("no-demo");

    const [THREE, { GLTFLoader }] = await Promise.all([
        import("./vendor/three/three.module.min.js"),
        import("./vendor/three/addons/loaders/GLTFLoader.js")
    ]).catch(() => [null, {}]);
    if (!THREE) return fail("three");

    const sexes = ["male", "female"].filter(s => entry.models?.[s]);
    const { views, start } = viewsFor(entry);
    host.classList.add("d3-player");
    host.innerHTML = playerHtml(entry, views, sexes, entry.status !== "ready");
    const $ = sel => host.querySelector(sel);
    const stage = $("[data-stage]"), tap = $("[data-tap]"), loading = $("[data-loading]"), bar = $("[data-progress]");

    // Renderer, scene, light: the same set-up the review renders use.
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, powerPreference: "low-power" });
    } catch { return fail("no-webgl"); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = "d3-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    stage.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKDROP);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b0a2, 1.4));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    key.position.set(2.5, 5, 3.5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.2, bottom: -0.4, near: 1, far: 12 });
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);

    const state = { sex: pickSex(entry, sex), view: start, speed: 1, playing: !reduceMotion(), yawOffset: 0, disposed: false };
    const loader = new GLTFLoader();
    const loaded = new Map(); // url -> Promise<{ scene, mixer, action, height }>
    let current = null, raf = 0, last = 0, visible = true;

    const placeCamera = () => {
        const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
        camera.aspect = w / h;
        const { position, target } = cameraFor(state.view, { height: current?.height || 1.75, fovDeg: camera.fov, aspect: camera.aspect, yawOffset: state.yawOffset });
        camera.position.set(...position); camera.lookAt(...target); camera.updateProjectionMatrix();
    };
    const render = () => {
        if (state.disposed) return;
        if (current) {
            const d = current.action.getClip().duration;
            bar.style.transform = `scaleX(${((current.action.time % d) / d).toFixed(3)})`;
        }
        renderer.render(scene, camera);
    };
    const loop = now => {
        raf = 0;
        if (state.disposed || !state.playing || !visible || document.hidden || !current) return;
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        current.mixer.update(dt);
        render();
        raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf && state.playing && visible && !document.hidden && current) { last = 0; raf = requestAnimationFrame(loop); } };

    const resize = () => {
        const w = stage.clientWidth, h = stage.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        placeCamera(); render();
    };

    function load(s) {
        const url = modelUrl(entry, s, new URL(base, location.href));
        if (!loaded.has(url)) {
            loaded.set(url, loader.loadAsync(url, e => {
                if (e.total) $("[data-loading-text]").textContent = `Loading the athlete · ${Math.round(e.loaded / e.total * 100)}%`;
            }).then(gltf => {
                const clip = gltf.animations.find(a => a.name === entry.clip) || gltf.animations[0];
                if (!clip) throw new Error("no clip");
                const root = gltf.scene;
                root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
                const mixer = new THREE.AnimationMixer(root);
                const action = mixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat, Infinity).play();
                mixer.update(0);
                // Height from the head bone (a skinned mesh's box ignores the rig's scale).
                let head = null;
                root.traverse(o => { if (o.isBone && /Head$/.test(o.name)) head = o; });
                const height = head ? head.getWorldPosition(new THREE.Vector3()).y + 0.13 : 1.75;
                return { scene: root, mixer, action, height: Math.min(2.2, Math.max(1.4, height)) };
            }));
            loaded.get(url).catch(() => loaded.delete(url));
        }
        return loaded.get(url);
    }

    async function show(s) {
        const keepTime = current ? current.action.time : (state.playing ? 0 : (entry.seconds / (entry.reps || 1)) * 0.5);
        loading.hidden = false;
        let next;
        try { next = await load(s); } catch { if (!current) { dispose(); return fail("model"); } loading.hidden = true; return controller; }
        if (state.disposed) return null;
        if (current) scene.remove(current.scene);
        current = next;
        current.action.time = keepTime;
        current.mixer.timeScale = state.speed;
        current.mixer.update(0);
        scene.add(current.scene);
        state.sex = s;
        loading.hidden = true;
        sync(); placeCamera(); render(); kick();
        return controller;
    }

    function sync() {
        host.querySelectorAll("[data-sex]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sex === state.sex)));
        host.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === state.view && !state.yawOffset)));
        const sp = $("[data-speed]"); sp.setAttribute("aria-pressed", String(state.speed !== 1));
        const tg = $("[data-toggle]"); tg.textContent = state.playing ? "Pause" : "Play"; tg.setAttribute("aria-pressed", String(state.playing));
        tap.setAttribute("aria-label", state.playing ? "Pause the demo" : "Play the demo");
        stage.classList.toggle("is-paused", !state.playing);
        host.dataset.d3Sex = state.sex; host.dataset.d3View = state.view; host.dataset.d3Playing = String(state.playing);
    }

    const controller = {
        play() { state.playing = true; sync(); kick(); },
        pause() { state.playing = false; cancelAnimationFrame(raf); raf = 0; sync(); render(); },
        toggle() { state.playing ? controller.pause() : controller.play(); },
        setSex(s) { return entry.models?.[s] && s !== state.sex ? show(s) : Promise.resolve(controller); },
        setView(v) { if (VIEWS[v] && views.includes(v)) { state.view = v; state.yawOffset = 0; sync(); placeCamera(); render(); } },
        setSpeed(x) { if (SPEEDS.includes(x)) { state.speed = x; if (current) current.mixer.timeScale = x; sync(); } },
        get state() { return { ...state, time: current?.action.time ?? 0 }; },
        dispose
    };

    // Controls.
    $("[data-toggle]").addEventListener("click", () => controller.toggle());
    $("[data-speed]").addEventListener("click", () => controller.setSpeed(state.speed === 1 ? 0.5 : 1));
    host.querySelectorAll("[data-sex]").forEach(b => b.addEventListener("click", () => controller.setSex(b.dataset.sex)));
    host.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => controller.setView(b.dataset.view)));

    // Tap the stage to pause or play; drag sideways to turn the athlete.
    let drag = null;
    tap.addEventListener("pointerdown", e => { drag = { x: e.clientX, start: state.yawOffset, moved: false }; tap.setPointerCapture?.(e.pointerId); });
    tap.addEventListener("pointermove", e => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 6) drag.moved = true;
        if (drag.moved) { state.yawOffset = drag.start - dx * 0.5; placeCamera(); if (!state.playing) render(); }
    });
    const endDrag = () => { if (drag?.moved) { tap.dataset.dragged = "1"; sync(); } drag = null; };
    tap.addEventListener("pointerup", endDrag);
    tap.addEventListener("pointercancel", endDrag);
    tap.addEventListener("click", () => { if (tap.dataset.dragged) { delete tap.dataset.dragged; return; } controller.toggle(); });

    // Off screen or in a hidden tab: draw nothing.
    const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }) : null;
    io?.observe(stage);
    const onVis = () => kick();
    document.addEventListener("visibilitychange", onVis);
    const ro = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    ro?.observe(stage);
    renderer.domElement.addEventListener("webglcontextlost", e => { if (state.disposed) return; e.preventDefault(); dispose(); fail("context-lost"); });

    function dispose() {
        if (state.disposed) return;
        state.disposed = true;
        cancelAnimationFrame(raf);
        io?.disconnect(); ro?.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        for (const p of loaded.values()) p.then(m => {
            m.mixer.stopAllAction();
            m.scene.traverse(o => {
                if (!o.isMesh) return;
                o.geometry.dispose();
                for (const mat of [].concat(o.material)) {
                    for (const v of Object.values(mat)) if (v && v.isTexture) v.dispose();
                    mat.dispose();
                }
            });
        }).catch(() => {});
        floor.geometry.dispose(); floor.material.dispose();
        renderer.dispose();
        renderer.forceContextLoss?.();
        renderer.domElement.remove();
    }

    sync();
    resize();
    return show(state.sex);
}
