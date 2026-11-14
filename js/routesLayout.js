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

/** The builder's height: what is left of the screen under the header (and above a bottom nav). Never below 460. */
export function mapHeight(viewH, topPx, bottomPx = 0) {
    return Math.max(460, Math.round(viewH - topPx - bottomPx));
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
            setTimeout(() => window.__routeBuilder?.map?.invalidateSize(), 60);
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

        // Phone (2026-11-14, Eddie: "make the map full screen"): the map fills the screen and the controls sit on its
        // edges. Settings and the map look go in the panel; Undo, Find me, Safe Map and a Tools button form a rail on
        // the right; the other tools open from Tools. On a computer everything goes back where the page put it.
        const extra = document.getElementById("rbSideExtra"), bar = layout.querySelector(".rb-top"), loop = document.getElementById("rbLoopBar");
        const stage = layout.querySelector(".rb-stage"), tools = layout.querySelector(".rb-tools");
        const rail = document.createElement("div");
        rail.className = "rb-rail"; rail.setAttribute("role", "group"); rail.setAttribute("aria-label", "Map tools");
        const more = document.createElement("button");
        more.type = "button"; more.className = "rb-rail-more"; more.id = "rbToolsMore";
        more.setAttribute("aria-expanded", "false"); more.setAttribute("aria-controls", "rbToolsList");
        more.innerHTML = '<span aria-hidden="true">&#8943;</span><b>Tools</b>';
        if (tools) tools.id = tools.id || "rbToolsList";
        const homes = new Map(); // element -> [parent, next sibling] as the page put it
        const RAIL = ["rbUndo", "rbLocate", "rbSafeMap"];
        for (const id of [...RAIL, "rbPrefsOpen", "rbLooks"]) { const el = document.getElementById(id); if (el) homes.set(el, [el.parentElement, el.nextSibling]); }
        const setTools = open => { layout.classList.toggle("rb-tools-open", open); more.setAttribute("aria-expanded", String(open)); };
        more.addEventListener("click", () => setTools(!layout.classList.contains("rb-tools-open")));
        tools?.addEventListener("click", e => { if (e.target.closest("button") && window.innerWidth < WIDE) setTools(false); });
        const place = () => {
            const phone = window.innerWidth < WIDE;
            layout.classList.toggle("rb-phone", phone);
            if (phone) {
                if (stage && rail.parentElement !== stage) stage.append(rail);
                RAIL.forEach(id => { const el = document.getElementById(id); if (el && el.parentElement !== rail) rail.append(el); });
                if (more.parentElement !== rail) rail.append(more);
                for (const id of ["rbPrefsOpen", "rbLooks"]) { const el = document.getElementById(id); if (el && extra && el.parentElement !== extra) extra.append(el); }
            } else {
                setTools(false);
                for (const [el, [parent, next]] of homes) if (el.parentElement !== parent) parent.insertBefore(el, next && next.parentElement === parent ? next : null);
                rail.remove();
            }
        };
        place();
        window.addEventListener("resize", place);

        // The app's left menu starts closed here (every visit, not remembered) and opens from the Menu button.
        const menuBtn = document.getElementById("rbMenuToggle");
        const setMenu = open => {
            document.body.classList.toggle("rb-menu-closed", !open);
            if (menuBtn) { menuBtn.setAttribute("aria-expanded", String(open)); document.getElementById("rbMenuWord").textContent = open ? "Hide menu" : "Menu"; }
            [60, 260].forEach(t => setTimeout(() => window.__routeBuilder?.map?.invalidateSize(), t));
        };
        setMenu(false);
        menuBtn?.addEventListener("click", () => setMenu(document.body.classList.contains("rb-menu-closed")));

        const size = () => {
            const top = layout.getBoundingClientRect().top + window.scrollY;
            const nav = document.querySelector(".eos-bottomnav");
            const bottom = nav && getComputedStyle(nav).position === "fixed" ? nav.getBoundingClientRect().height : 0;
            layout.style.setProperty("--rb-h", mapHeight(window.innerHeight, top, bottom + (window.innerWidth < WIDE ? 0 : 14)) + "px");
            window.__routeBuilder?.map?.invalidateSize();
        };
        size();
        window.addEventListener("resize", size);
        window.addEventListener("load", size);
        [300, 1200, 2500].forEach(t => setTimeout(size, t)); // the header is added after load
    }
}
