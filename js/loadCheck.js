// Load check: an opt-in readout of how this page's load went on this device, for finding why the
// app is slow to open. Open any app page with ?loadcheck (or Settings > About > Load check) to turn it on
// for this tab, ?loadcheck=off to turn it off. Shows times and counts only; nothing is sent.
// It keeps the last few loads of the session, so a page that reloads itself shows as two loads.
import { loadLines } from "./loadTrail.js";

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
    box.textContent = [...before, ...lines].join("\n");
}
paint();
setInterval(paint, 1000);
