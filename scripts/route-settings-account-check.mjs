// Route builder Settings follow the ACCOUNT, not the browser: real sign-in, cloud sync and sign-out
// against the Firebase emulators (real js/auth.js, js/cloudSync.js and firestore.rules; only
// js/firebase.js is pointed at the emulators). Account A saves settings, signs out (the device copy
// is cleared), account B on the same browser gets the defaults, then A signs back in and gets A's.
//
// Serve the repo (python3 -m http.server 8934), then from the repo folder:
//   npx firebase emulators:exec --config <a firebase.json with auth 9099 + firestore 8080 and
//     "rules": "<repo>/firestore.rules"> --only auth,firestore --project demo-eddie \
//     "node scripts/route-settings-account-check.mjs"
import fs from "node:fs";
import { chromium } from "./fakeBrowser.mjs"; // only its Playwright import; this check uses the real modules

const ORIGIN = "http://localhost:8934";
const PROJECT = "demo-eddie";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

// js/firebase.js, pointed at the emulators
let fb = fs.readFileSync(new URL("../js/firebase.js", import.meta.url), "utf8");
const swaps = [
    ['projectId: "eddie-s-dashboard"', `projectId: "${PROJECT}"`],
    ['import { getAuth, setPersistence, browserLocalPersistence } from', 'import { getAuth, setPersistence, browserLocalPersistence, connectAuthEmulator } from'],
    ['terminate, clearIndexedDbPersistence\n}', 'terminate, clearIndexedDbPersistence, connectFirestoreEmulator\n}'],
    ['const auth = getAuth(app);', 'const auth = getAuth(app);\nconnectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });'],
    ['setPersistence(auth, browserLocalPersistence)', 'connectFirestoreEmulator(db, "127.0.0.1", 8080);\nsetPersistence(auth, browserLocalPersistence)']
];
for (const [a, b] of swaps) { if (!fb.includes(a)) throw new Error("firebase.js changed; can't point it at the emulator: " + a); fb = fb.replace(a, b); }

const sv = v => Array.isArray(v) ? { arrayValue: { values: v.map(sv) } } : typeof v === "boolean" ? { booleanValue: v } : { stringValue: String(v) };
async function seedClient(uid, name) { // an approved running client, written as the emulator's admin
    const fields = { uid, role: "client", isCoachApproved: false, status: "active", services: ["running"], displayName: name, email: `${name.toLowerCase().replace(/\W/g, "")}@example.test` };
    const res = await fetch(`${FS}/userProfiles/${uid}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, sv(v)])) }) });
    if (!res.ok) throw new Error("seed failed " + res.status);
}
const cloudText = async uid => { const r = await fetch(`${FS}/users/${uid}/sync/localStorage`, { headers: { Authorization: "Bearer owner" } }); return r.ok ? r.text() : ""; };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", hasTouch: true, isMobile: true });
await ctx.route("**/js/firebase.js", r => r.fulfill({ contentType: "application/javascript", body: fb }));
await ctx.route(/overpass-api\.de|valhalla1\.openstreetmap\.de|tile\.openstreetmap\.org/, r => r.fulfill({ status: 503, body: "" })); // not needed here
const page = await ctx.newPage();
const errors = []; page.on("pageerror", e => errors.push(String(e)));

async function signIn(email, create) {
    await page.goto(`${ORIGIN}/home.html`, { waitUntil: "load" });
    await page.evaluate(async ([email, create]) => {
        const { auth } = await import("/js/firebase.js");
        const m = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js");
        await (create ? m.createUserWithEmailAndPassword : m.signInWithEmailAndPassword)(auth, email, "test-pass-1234");
    }, [email, create]).catch(() => {}); // the account guard may reload the page mid-call
    await page.waitForTimeout(2500);
    await page.waitForLoadState("load");
    return page.evaluate(async () => { const { auth } = await import("/js/firebase.js"); await auth.authStateReady(); return auth.currentUser && auth.currentUser.uid; });
}
async function openRoutes() {
    await page.goto(`${ORIGIN}/routes.html`, { waitUntil: "load" });
    await page.waitForTimeout(4000); // the first cloud pull reloads the page once when it brings anything in
    await page.waitForLoadState("load");
    await page.waitForFunction(() => window.__routeBuilder, null, { timeout: 20000 });
    return page.evaluate(() => ({
        url: location.pathname,
        layers: Object.fromEntries([...document.querySelectorAll("#rbLayers [data-layer]")].map(b => [b.dataset.layer, b.getAttribute("aria-pressed") === "true"])),
        sidewalkFirst: document.getElementById("rbSidewalkFirst").getAttribute("aria-pressed") === "true",
        fuelCard: !document.getElementById("rbFuelCard").hidden, globeBtn: !document.getElementById("rbGlobeBtn").hidden
    }));
}
const flipAndPush = async keys => {
    await page.evaluate(async keys => {
        for (const k of keys) (k === "sidewalk" ? document.getElementById("rbSidewalkFirst") : document.querySelector(`#rbLayers [data-layer='${k}']`)).click();
        const { pushToCloud } = await import("/js/cloudSync.js");
        await pushToCloud({ force: true });
    }, keys);
};
async function signOut() {
    await page.evaluate(async () => { const { logout } = await import("/js/auth.js"); await logout(); }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.goto(`${ORIGIN}/home.html`, { waitUntil: "load" });
    return page.evaluate(() => ({ settings: localStorage.getItem("route-settings"), owner: localStorage.getItem("sb-account-storage-owner") }));
}

// ----- account A: change settings -----
const uidA = await signIn("route-a@example.test", true);
await seedClient(uidA, "Runner A");
let a1 = await openRoutes();
check("A, first visit: the full builder (all layers on, sidewalk-first on)", a1.url === "/routes.html" && Object.values(a1.layers).every(Boolean) && a1.sidewalkFirst, JSON.stringify(a1));
await flipAndPush(["fuel", "globe", "sidewalk"]);
const cloudA = await cloudText(uidA);
check("A's settings reach A's own cloud copy (users/A/sync)", /route-settings/.test(cloudA) && /\\"fuel\\":false/.test(cloudA), cloudA ? "saved" : "no sync doc");

// ----- sign out: nothing left on the device -----
const out1 = await signOut();
check("sign-out clears the builder settings from this browser", out1.settings === null, JSON.stringify(out1));

// ----- account B on the same browser: defaults, nothing from A -----
const uidB = await signIn("route-b@example.test", true);
await seedClient(uidB, "Runner B");
const bView = await openRoutes();
check("B on the same browser gets the defaults, not A's choices", bView.url === "/routes.html" && Object.values(bView.layers).every(Boolean) && bView.sidewalkFirst && bView.fuelCard && bView.globeBtn, JSON.stringify(bView));
await flipAndPush(["markers"]);
const cloudB = await cloudText(uidB);
check("B's change lands in B's cloud copy only", /\\"markers\\":false/.test(cloudB) && !/\\"markers\\":false/.test(await cloudText(uidA)));
await signOut();

// ----- A signs back in: A's settings come back from the account -----
const uidA2 = await signIn("route-a@example.test", false);
const a2 = await openRoutes();
check("A signs back in: fuel off, globe off, sidewalk-first off restored from the account; B's markers change not here", uidA2 === uidA && !a2.layers.fuel && !a2.layers.globe && !a2.sidewalkFirst && a2.layers.markers && a2.layers.safe && !a2.fuelCard && !a2.globeBtn, JSON.stringify(a2));
// Page-to-page view transitions get cut short when this script navigates during the account guard's reload: that's the test, not the app.
const real = errors.filter(e => !/Failed to fetch|NetworkError|503|Transition was (skipped|aborted)/.test(e));
check("no page errors", real.length === 0, real.join(" | "));
await b.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
