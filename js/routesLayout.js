/* ==========================================
   Southbound — Build a Route: big map, side panel (routes.html)

   The map fills the page and the Route / Safety / Fuel / Save panel
   slides over it. Open on a computer, closed on a phone, and the last
   choice on this device is remembered (device-only key, not account data).
========================================== */

export const PANEL_KEY = "sb-route-panel";
export const WIDE = 900; // px: the same break the rest of the page uses

/** Should the panel start open? A saved choice wins; otherwise open on a wide screen only. */
export function panelStartsOpen(width, saved) {
    if (saved === "open") return true;
    if (saved === "closed") return false;
    return width >= WIDE;
}

/** The map's height: what is left of the screen under the header (and above a bottom nav). Never below 420. */
export function mapHeight(viewH, topPx, bottomPx = 0) {
    return Math.max(420, Math.round(viewH - topPx - bottomPx));
}

if (typeof document !== "undefined") {
    const layout = document.getElementById("rbLayout");
    const toggle = document.getElementById("rbPanelToggle");
    const close = document.getElementById("rbPanelClose");
    if (layout && toggle) {
        const set = (open, remember) => {
            layout.classList.toggle("rb-panel-closed", !open);
            toggle.setAttribute("aria-expanded", String(open));
            toggle.hidden = false;
            if (remember) { try { localStorage.setItem(PANEL_KEY, open ? "open" : "closed"); } catch { /* private mode */ } }
        };
        let saved = null;
        try { saved = localStorage.getItem(PANEL_KEY); } catch { /* none */ }
        set(panelStartsOpen(window.innerWidth, saved), false);
        toggle.addEventListener("click", () => set(layout.classList.contains("rb-panel-closed"), true));
        close?.addEventListener("click", () => { set(false, true); toggle.focus(); });
        // A tapped stretch on the map or the Safe Map button asks for the Safety tab: show the panel.
        document.addEventListener("rb:show-tab", () => set(true, false));
        layout.addEventListener("keydown", e => { if (e.key === "Escape" && !layout.classList.contains("rb-panel-closed") && window.innerWidth < WIDE) { set(false, true); toggle.focus(); } });

        const size = () => {
            const top = layout.getBoundingClientRect().top + window.scrollY;
            const nav = document.querySelector(".eos-bottomnav");
            const bottom = nav && getComputedStyle(nav).position === "fixed" ? nav.getBoundingClientRect().height : 0;
            layout.style.setProperty("--rb-h", mapHeight(window.innerHeight, top, bottom) + "px");
            window.__routeBuilder?.map?.invalidateSize();
        };
        size();
        window.addEventListener("resize", size);
        window.addEventListener("load", size);
        [300, 1200, 2500].forEach(t => setTimeout(size, t)); // the header is added after load
    }
}
