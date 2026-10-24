// Screen check: a small readout of the phone's screen numbers, for finding
// why the bottom tab bar sits too high on some iPhones (js/viewportFix.js).
// Open any app page with ?screencheck to turn it on for this tab, and
// ?screencheck=off to turn it off. Shows numbers only, nothing is saved or sent.

const root = document.documentElement;
const vv = window.visualViewport;
const box = document.createElement("div");
box.className = "sb-screencheck";
box.setAttribute("aria-hidden", "true");
box.style.cssText = "position:fixed;top:calc(8px + env(safe-area-inset-top));left:8px;z-index:9999;max-width:calc(100% - 16px);padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.82);color:#fff;font:12px/1.35 var(--font-mono, monospace);white-space:pre;pointer-events:none;";
document.body.appendChild(box);

const n = v => (typeof v === "number" ? Math.round(v * 10) / 10 : "—");
const ios = (navigator.userAgent.match(/OS (\d+)_(\d+)/) || []).slice(1).join(".") || "not iOS";

function paint() {
    const dock = document.querySelector(".eos-bottomnav")?.getBoundingClientRect();
    const bar = document.getElementById("fuelStepBar");
    const barRect = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
    box.textContent = [
        `iOS ${ios}  ${matchMedia("(display-mode: standalone)").matches ? "home-screen app" : "browser"}`,
        `screen      ${screen.width} x ${screen.height}`,
        `innerHeight ${n(window.innerHeight)}`,
        `clientH     ${n(root.clientHeight)}`,
        `vv height   ${n(vv?.height)}  top ${n(vv?.offsetTop)}`,
        `vv scale    ${n(vv?.scale)}  pageTop ${n(vv?.pageTop)}`,
        `scrollY     ${n(window.scrollY)} of ${n(root.scrollHeight - window.innerHeight)}`,
        `dock        ${dock ? `${n(dock.top)} to ${n(dock.bottom)}` : "none"}`,
        `fuel bar    ${barRect ? `${n(barRect.top)} to ${n(barRect.bottom)}` : "none"}`,
        `fix         ${root.style.getPropertyValue("--sb-vv-fix") || "0"}  typing ${root.classList.contains("sb-typing") ? "yes" : "no"}`
    ].join("\n");
}

let frame = 0;
const soon = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); }); };
vv?.addEventListener("resize", soon);
vv?.addEventListener("scroll", soon);
window.addEventListener("scroll", soon, { passive: true });
window.addEventListener("resize", soon);
document.addEventListener("focusin", soon);
document.addEventListener("focusout", () => setTimeout(soon, 100));
setInterval(paint, 1000);
paint();
