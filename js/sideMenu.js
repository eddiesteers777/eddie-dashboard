// The side menu (step 5 of the premium look, 2026-11-25; after Anchor Board's side panel, css/home.css .hm-side).
// The menu is the same markup everywhere (components/header.html .eos-navbar); css/skin.css part 4 draws it.
//   Computer (901px and wider): the left side menu. The button beside the wordmark folds it to icons (html.sb-side-min,
//     saved on this device under "southbound-side-min"; js/appLookBoot.js adds the class before the page paints).
//     Tapping a section while folded opens the menu again with that section open.
//   Phone: the top bar's Menu button slides the same menu in from the left as a drawer (html.sb-drawer) over a dimmed
//     page. The bottom tabs stay as they are. A tap outside, the X, Escape or picking a page closes it.
const KEY = "southbound-side-min";
const h = document.documentElement;

export function wireSideMenu() {
    const nav = document.getElementById("sbSideNav");
    if (!nav || nav.dataset.sideWired) return;
    nav.dataset.sideWired = "1";
    const wide = window.matchMedia("(min-width:901px)");
    const fold = nav.querySelector(".sb-side-fold");
    const closeBtn = nav.querySelector(".sb-side-close");
    const menuBtn = document.querySelector(".sb-menu-btn");
    const sections = [...nav.querySelectorAll(".eos-nav-item, .eos-dropdown-trigger")];
    const label = el => el.querySelector(".sb-side-txt > span")?.textContent.trim() || "";

    // ---- fold to icons (computer) ----
    function showFold() {
        const min = h.classList.contains("sb-side-min");
        if (fold) {
            fold.setAttribute("aria-pressed", String(min));
            const words = min ? "Open the menu" : "Fold the menu";
            fold.setAttribute("aria-label", words);
            fold.title = words;
        }
        // Folded, the names are hidden, so each icon says what it is on hover.
        sections.forEach(el => { if (min) el.title = label(el); else el.removeAttribute("title"); });
    }
    function setMin(min) {
        h.classList.toggle("sb-side-min", min);
        try { localStorage.setItem(KEY, min ? "1" : "0"); } catch { /* storage unavailable: this page still changes */ }
        showFold();
    }
    fold?.addEventListener("click", () => setMin(!h.classList.contains("sb-side-min")));
    // A section tapped while folded: open the menu with that section open (not closed by the same tap).
    nav.addEventListener("click", event => {
        const trigger = event.target.closest(".eos-dropdown-trigger");
        if (!trigger || !wide.matches || !h.classList.contains("sb-side-min")) return;
        event.preventDefault();
        setMin(false);
        trigger.parentElement.open = true;
    }, true);
    showFold();

    // ---- drawer (phone) ----
    if (!menuBtn) return;
    let scrim = null;
    let lastFocus = null;
    const isOpen = () => h.classList.contains("sb-drawer");

    function openDrawer() {
        if (isOpen() || wide.matches) return;
        lastFocus = document.activeElement;
        h.classList.add("sb-drawer");
        menuBtn.setAttribute("aria-expanded", "true");
        nav.setAttribute("role", "dialog");
        nav.setAttribute("aria-modal", "true");
        scrim = document.createElement("div");
        scrim.className = "sb-scrim";
        scrim.setAttribute("aria-hidden", "true");
        scrim.addEventListener("click", closeDrawer);
        document.body.append(scrim);
        // The section you're in starts open.
        const here = nav.querySelector(".section-active")?.closest(".eos-dropdown");
        if (here) here.open = true;
        requestAnimationFrame(() => closeBtn?.focus());
    }
    function closeDrawer() {
        if (!isOpen()) return;
        h.classList.remove("sb-drawer");
        menuBtn.setAttribute("aria-expanded", "false");
        nav.removeAttribute("role");
        nav.removeAttribute("aria-modal");
        scrim?.remove();
        scrim = null;
        (lastFocus && document.contains(lastFocus) ? lastFocus : menuBtn).focus?.();
    }
    menuBtn.addEventListener("click", openDrawer);
    closeBtn?.addEventListener("click", closeDrawer);
    nav.addEventListener("click", event => { if (isOpen() && event.target.closest("a[href]")) closeDrawer(); });
    // The account, bell and search buttons in the drawer open their own sheets: close the drawer first.
    nav.querySelectorAll("[data-account], [data-bell], .search-btn").forEach(b => b.addEventListener("click", () => { if (isOpen()) closeDrawer(); }));
    document.addEventListener("keydown", event => {
        if (!isOpen()) return;
        if (event.key === "Escape") { closeDrawer(); return; }
        if (event.key !== "Tab") return;
        // Keep the keyboard inside the drawer while it's open.
        const items = [...nav.querySelectorAll("a[href], button, summary")].filter(el => el.offsetParent !== null && !el.closest("[hidden]"));
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    // Turned sideways or widened past the phone size: the drawer isn't a drawer any more.
    const onWide = () => { if (wide.matches) closeDrawer(); };
    if (wide.addEventListener) wide.addEventListener("change", onWide); else if (wide.addListener) wide.addListener(onWide);
    // Coming back to a page from the back button with the drawer still marked open.
    window.addEventListener("pageshow", () => { if (isOpen()) closeDrawer(); });
}
