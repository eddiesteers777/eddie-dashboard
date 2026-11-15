// Load check: an opt-in readout of how this page's load went on this device, for finding why the
// app is slow to open. Open any app page with ?loadcheck (or Settings > About > Load check) to turn it on
// for this tab, ?loadcheck=off to turn it off. Shows times and counts only; nothing is sent.
// It keeps the last few loads of the session, so a page that reloads itself shows as two loads.
import { loadLines } from "./loadTrail.js";
import { readTrail } from "./signInTrail.js";

const KEY = "sb-loadcheck-log";
const box = document.createElement("div");
box.setAttribute("aria-hidden", "true");
box.style.cssText = "position:fixed;bottom:calc(76px + env(safe-area-inset-bottom));left:8px;z-index:9999;max-width:calc(100% - 16px);padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.82);color:#e8eef4;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none";
document.body.appendChild(box);

const nav = performance.getEntriesByType("navigation")[0];
const milestones = {};
const seen = (key, test) => { if (milestones[key] === undefined && test()) milestones[key] = Math.round(performance.now()); };

function worker() {
    if (!("serviceWorker" in navigator)) return "no saved copy support";
    if (!navigator.serviceWorker.controller) return "no saved copy active";
    return "saved copy active";
}

function paint() {
    seen("header", () => !!document.querySelector("#header *"));
    seen("splashGone", () => !document.getElementById("splashScreen"));
    seen("greeting", () => !!document.getElementById("welcomeHeading")?.textContent.trim());
    seen("filled", () => !!document.getElementById("welcomeHeading")?.textContent.trim() && !document.querySelector(".sb-wait:empty"));
    const lines = loadLines({
        navType: nav?.type || "navigate",
        milestones,
        resources: performance.getEntriesByType("resource"),
        worker: worker(),
        now: performance.now()
    });
    let past = [];
    try {
        past = JSON.parse(sessionStorage.getItem(KEY) || "[]");
        const mine = { at: Math.round(performance.timeOrigin), type: nav?.type || "navigate", ...milestones };
        const rest = past.filter(p => p.at !== mine.at);
        sessionStorage.setItem(KEY, JSON.stringify([...rest, mine].slice(-5)));
        past = rest;
    } catch { /* storage blocked */ }
    const before = past.slice(-3).map(p => `earlier load (${p.type}): greeting ${p.greeting === undefined ? "never" : (p.greeting / 1000).toFixed(1) + "s"}`);
    const t0 = Date.now();
    const trailLines = readTrail().slice(-4).map(([at, page, step, detail]) => `  ${String(Math.round((t0 - at) / 1000)).padStart(4)}s ago ${page} ${step}${detail ? " " + detail : ""}`);
    box.textContent = [...before, ...lines, ...probeLines(), "sign-in steps:", ...trailLines].join("\n");
}

// Three quick tests of the cloud connection, run once per page load:
// did sign-in answer, does an SDK read answer, does a plain HTTPS read answer.
const probe = { auth: "testing…", sdk: "testing…", rest: "testing…", idb: "testing…", memLong: "testing…", memAuto: "testing…" };
const probeLines = () => [
    `sign-in answered: ${probe.auth}`,
    `cloud read (app): ${probe.sdk}`,
    `cloud read (https): ${probe.rest}`,
    `saved storage opens: ${probe.idb}`,
    `app read, no saved copy, plain requests: ${probe.memLong}`,
    `app read, no saved copy, streaming: ${probe.memAuto}`
];
const timed = async (label, work, limit = 15000) => {
    const start = performance.now();
    try {
        const out = await Promise.race([work(), new Promise((_, no) => setTimeout(() => no(new Error("no answer in " + limit / 1000 + "s")), limit))]);
        probe[label] = `${((performance.now() - start) / 1000).toFixed(1)}s ${out || "ok"}`;
    } catch (error) { probe[label] = `${error?.code || error?.message || "failed"} (${((performance.now() - start) / 1000).toFixed(1)}s)`; }
};
(async () => {
    let user = null;
    await timed("auth", async () => {
        const { waitForUser } = await import("./auth.js");
        user = await waitForUser();
        return user ? "signed in" : "signed OUT";
    });
    // Does the phone's saved storage (IndexedDB, where the app's offline copy lives) open at all?
    timed("idb", () => new Promise((resolve, reject) => {
        const request = indexedDB.open("sb-loadcheck-probe");
        request.onsuccess = () => { request.result.close(); resolve("ok"); };
        request.onerror = () => reject(new Error("error"));
        request.onblocked = () => reject(new Error("blocked"));
    }), 8000);
    if (!user) { probe.sdk = probe.rest = probe.memLong = probe.memAuto = "skipped (no sign-in)"; return; }
    await Promise.all([
        timed("sdk", async () => {
            const [{ db }, fs] = await Promise.all([import("./firebase.js"), import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")]);
            const snap = await fs.getDoc(fs.doc(db, "userProfiles", user.uid));
            return snap.exists() ? "ok" : "ok (no profile)";
        }),
        // The same read from a second, throwaway connection that keeps nothing on the phone. It isn't signed in, so a
        // quick "permission-denied" counts as answered: it proves the connection works.
        ...[["memLong", { experimentalForceLongPolling: true }], ["memAuto", { experimentalAutoDetectLongPolling: true }]].map(([label, opts]) =>
            timed(label, async () => {
                const [{ app }, fa, fs] = await Promise.all([import("./firebase.js"), import("https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js"), import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")]);
                const copy = fa.initializeApp(app.options, "loadcheck-" + label + Date.now());
                const db2 = fs.initializeFirestore(copy, { localCache: fs.memoryLocalCache(), ...opts });
                try { await fs.getDoc(fs.doc(db2, "userProfiles", user.uid)); return "ok"; }
                catch (error) { if (error?.code === "permission-denied") return "answered (denied, as expected)"; throw error; }
            })),
        timed("rest", async () => {
            const { firestoreRestBase } = await import("./firebase.js");
            const token = await user.getIdToken();
            const response = await fetch(`${firestoreRestBase}/userProfiles/${user.uid}`, { headers: { Authorization: `Bearer ${token}` } });
            return response.ok ? "ok" : "http " + response.status;
        })
    ]);
})();
paint();
setInterval(paint, 1000);
