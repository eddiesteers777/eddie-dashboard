/* ==========================================
   EddieOS Icons

   One shared set of small inline SVG icons
   (lucide-style: 24x24, stroke-based,
   currentColor) used across the whole site in
   place of raw emoji characters and ASCII
   symbols like ×, ✓, −, +. Inline SVG (not an
   icon font or CDN) so there's no extra network
   request and no flash of missing icons.

   Usage:
     import { icon } from "./icons.js";
     el.innerHTML = `${icon("check")} Done`;
========================================== */

const PATHS = {
    // UI chrome
    chevronDown: `<polyline points="6 9 12 15 18 9"></polyline>`,
    chevronRight: `<polyline points="9 18 15 12 9 6"></polyline>`,
    arrowUp: `<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>`,
    arrowDown: `<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline>`,
    check: `<polyline points="20 6 9 17 4 12"></polyline>`,
    checkCircle: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>`,
    close: `<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>`,
    play: `<polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none"></polygon>`,
    plus: `<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>`,
    minus: `<line x1="5" y1="12" x2="19" y2="12"></line>`,
    alertTriangle: `<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>`,
    refresh: `<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>`,
    link: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>`,
    edit: `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"></path>`,
    trash: `<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>`,
    swap: `<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>`,
    scale: `<path d="M6.5 6.5 3 12l3.5 5.5M17.5 6.5 21 12l-3.5 5.5"></path><line x1="6.5" y1="6.5" x2="17.5" y2="6.5"></line><line x1="12" y1="6.5" x2="12" y2="19"></line><line x1="8" y1="19" x2="16" y2="19"></line>`,

    // Training / activity
    dumbbell: `<path d="m6.5 6.5 11 11"></path><path d="m21 21-1-1"></path><path d="m3 3 1 1"></path><path d="m18 22 4-4"></path><path d="m2 6 4-4"></path><path d="m3 10 7-7"></path><path d="m14 21 7-7"></path>`,
    activity: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>`,
    bike: `<circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-3 11.5V14l-3-3 4-3 2 3h2"></path>`,
    flame: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>`,
    timer: `<line x1="10" y1="2" x2="14" y2="2"></line><line x1="12" y1="14" x2="12" y2="10"></line><circle cx="12" cy="14" r="8"></circle>`,
    target: `<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>`,
    trophy: `<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21A3 3 0 0 0 7 21M14 14.66V17c0 .55.47.98.97 1.21A3 3 0 0 1 17 21M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>`,
    medal: `<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"></path><circle cx="12" cy="17" r="5"></circle><path d="M12 18v-2h-.5"></path>`,
    calendar: `<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>`,
    clock: `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`,
    fuel: `<line x1="3" y1="22" x2="15" y2="22"></line><line x1="4" y1="9" x2="14" y2="9"></line><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"></path><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2v-8l-3-3"></path>`,
    droplet: `<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.5-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>`,
    chart: `<line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line>`,
    trendingUp: `<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>`,
    footprint: `<path d="M4 16v-3a4 4 0 0 1 4-4h1l3-3 5 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"></path><line x1="4" y1="19" x2="20" y2="19"></line>`,
    clipboard: `<rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>`,
    flag: `<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>`,

    // Habits / lifestyle
    pray: `<path d="M12 2v20"></path><path d="M8 4c0 4-2 5-2 9a2 2 0 0 0 2 2"></path><path d="M16 4c0 4 2 5 2 9a2 2 0 0 1-2 2"></path>`,
    bookOpen: `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"></path>`,
    moon: `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"></path>`,
    heart: `<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z"></path>`,
    drumstick: `<path d="M15.5 8.5c2 2 2.5 5 .5 7s-5-1.5-7-3.5-4-6.5-2-8.5 5.5.5 8.5 5z"></path><path d="M5 19l3-3"></path>`,
    stretch: `<circle cx="12" cy="4" r="2"></circle><path d="M12 6v4"></path><path d="M8 12l4-2 4 2"></path><path d="M8 18l4-4 4 4"></path>`,
    utensils: `<path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"></path><path d="M5 12v10"></path><path d="M19 2c-1 0-3 1-3 5v3c0 1 1 2 2 2h1v8"></path>`,
    apple: `<path d="M12 20c-4 0-7-3.5-7-8 0-3 2-5 4.5-5 1 0 1.8.4 2.5 1 .7-.6 1.5-1 2.5-1C17 7 19 9 19 12c0 4.5-3 8-7 8Z"></path><path d="M12 7c0-2 1-3.5 3-4"></path>`,

    // People / system
    user: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>`,
    gear: `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>`,
    info: `<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>`,
    robot: `<rect x="3" y="8" width="18" height="12" rx="2"></rect><circle cx="8.5" cy="14" r="1.5"></circle><circle cx="15.5" cy="14" r="1.5"></circle><path d="M12 8V4"></path><circle cx="12" cy="3" r="1"></circle><path d="M3 13H1"></path><path d="M23 13h-2"></path>`,
    save: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline>`,
    upload: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>`,
    download: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>`,
    search: `<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>`,
    cloud: `<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>`,
    copy: `<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>`,
    moreVertical: `<circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"></circle><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"></circle>`,
    dot: `<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"></circle>`,
    star: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>`,
    starFilled: `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor"></polygon>`,

    // Cross-training activities
    swim: `<path d="M2 12c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"></path><path d="M2 17c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"></path>`,
    row: `<path d="M2 18s2 2 5 2 4-2 5-2 2 2 5 2 5-2 5-2"></path><line x1="12" y1="15" x2="12" y2="3"></line><path d="M9 6h6"></path>`,
    bolt: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>`,
    camera: `<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"></path><circle cx="12" cy="13" r="4"></circle>`
};

function icon(name, className = "") {
    const path = PATHS[name];

    if (!path) {
        console.warn(`EddieOS icons: unknown icon "${name}"`);
        return "";
    }

    return `<span class="ui-icon ${className}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}

// Lets plain HTML declare an icon (<span data-icon="calendar"></span>)
// without every page needing its own script -- this module fills
// them in on load. A page only has to include this one script tag.
function hydrate() {
    document.querySelectorAll("[data-icon]").forEach(el => {
        if (el.dataset.iconHydrated) {
            return;
        }

        el.innerHTML = icon(el.dataset.icon, el.dataset.iconClass || "");
        el.dataset.iconHydrated = "true";
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hydrate);
} else {
    hydrate();
}

export { icon, hydrate };
