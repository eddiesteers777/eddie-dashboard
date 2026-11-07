// Sign-in check: a readout of the last sign-in steps on this device, for finding why sign-in
// loops in the Home Screen app. Open any page with ?signincheck to turn it on for this tab,
// ?signincheck=off to turn it off. Shows step names and times only; nothing is sent.
import { readTrail } from "./signInTrail.js";

const box = document.createElement("div");
box.setAttribute("aria-hidden", "true");
box.style.cssText = "position:fixed;top:calc(8px + env(safe-area-inset-top));left:8px;z-index:9999;max-width:calc(100% - 16px);padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.86);color:#fff;font:11px/1.35 monospace;white-space:pre-wrap;pointer-events:none;";
document.body.appendChild(box);

function paint() {
    let hasAuth = false;
    try { for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith("firebase:authUser:")) hasAuth = true; } catch { /* blocked */ }
    let owner = "n/a";
    try { owner = localStorage.getItem("sb-account-storage-owner") ? "yes" : "no"; } catch { /* blocked */ }
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const t0 = Date.now();
    const rows = readTrail().slice(-14).map(([at, page, step, detail]) =>
        `${String(Math.round((t0 - at) / 1000)).padStart(4)}s ${page} ${step}${detail ? " " + detail : ""}`);
    box.textContent = [`${standalone ? "home-screen app" : "browser"}  saved sign-in: ${hasAuth ? "yes" : "no"}  owner mark: ${owner}`, ...rows].join("\n");
}
paint();
setInterval(paint, 1500);
