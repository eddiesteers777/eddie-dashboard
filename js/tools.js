// Free tools page (tools.html): the pace calculator, the fueling calculator and the Playbook on one page.
// Signed out: the public site's header and footer, and a guest's fueling work stays on the device.
// Signed in: the app's own navigation (the same switch the Playbook pages use).
// The two calculators are loaded from pace.html and fueling.html, so each keeps one source of truth.
const html = document.documentElement;
const $ = id => document.getElementById(id);

async function chooseShell() {
    let app = html.classList.contains("tl-app");
    if (app) {
        try {
            const { waitForUser } = await import("./auth.js");
            if (!(await waitForUser())) app = false;
        } catch { /* auth could not load (offline): the sentinel says signed in, so stay in the app */ }
    }
    if (!app) {
        html.classList.remove("tl-app");
        // Same mark loadHeader.js sets for a guest on the Fueling page, so their work is set aside, not wiped, at sign-in.
        html.classList.add("sb-guest");
        try { localStorage.setItem("sb-guest-fueling", "1"); } catch { /* storage unavailable */ }
        import("./loadPublicHeader.js");
        return false;
    }
    document.body.classList.remove("pub-body");
    document.body.classList.add("tl-in-app");
    document.querySelectorAll("[data-public-only]").forEach(el => el.remove());
    document.querySelectorAll("[data-app-text]").forEach(el => { el.textContent = el.dataset.appText; });
    const page = $("main");
    page.classList.add("container");
    const mount = document.createElement("div");
    mount.id = "header";
    document.body.prepend(mount);
    for (const src of ["js/loadHeader.js", "js/registerSW.js"]) {
        const s = document.createElement("script");
        s.src = src;
        document.body.append(s);
    }
    return true;
}

async function sourceDoc(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(url + " " + res.status);
    return new DOMParser().parseFromString(await res.text(), "text/html");
}

function loadScript(src, type) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        if (type) s.type = type;
        s.onload = resolve;
        s.onerror = () => reject(new Error(src));
        document.body.append(s);
    });
}

function failed(mount, name, href) {
    mount.innerHTML = `<p class="tl-fail">The ${name} didn't load. <a href="${href}">Open it on its own page</a>.</p>`;
}

async function loadPace() {
    const mount = $("paceMount");
    try {
        const doc = await sourceDoc("pace.html");
        const root = doc.getElementById("pc-root");
        if (!root) throw new Error("no pace markup");
        mount.replaceChildren(document.importNode(root, true));
        await loadScript("js/pace-calculator.js");
        await import("./hrZonesTool.js");
        import("./icons.js").then(m => m.hydrate()).catch(() => {});
    } catch { failed(mount, "pace calculator", "pace.html"); }
}

async function loadFueling() {
    const mount = $("fuelMount");
    try {
        const doc = await sourceDoc("fueling.html");
        const main = doc.querySelector("main.fueling-page");
        if (!main) throw new Error("no fueling markup");
        mount.replaceChildren(document.importNode(main, true));
        // The step bar, screen-reader line and saved-plan sheet sit outside <main> on the Fueling page.
        for (const id of ["fuelStepBar", "fuelAnnounce", "fuelPlanSheet"]) {
            const el = doc.getElementById(id);
            if (el) document.body.append(document.importNode(el, true));
        }
        await import("./fueling.js");
        await import("./fuelSteps.js");
        import("./icons.js").then(m => m.hydrate()).catch(() => {});
    } catch { failed(mount, "fueling calculator", "fueling.html"); }
}

// The chips follow the tool on screen; the phone's fueling step bar shows only while the Fueling section is in view.
function watchSections() {
    const chips = [...document.querySelectorAll(".tl-chip")];
    const mark = name => chips.forEach(c => {
        const on = c.dataset.tool === name;
        c.classList.toggle("on", on);
        if (on) c.setAttribute("aria-current", "true"); else c.removeAttribute("aria-current");
    });
    if (!("IntersectionObserver" in window)) return;
    const seen = new Map();
    const io = new IntersectionObserver(entries => {
        entries.forEach(e => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
        const best = [...seen.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0) mark(best[0]);
        html.classList.toggle("tl-fuel-view", (seen.get("fueling") || 0) > 0);
    }, { rootMargin: "-120px 0px -35% 0px", threshold: [0, .1, .3, .6] });
    document.querySelectorAll(".tl-sec[id]").forEach(s => io.observe(s));
}

function scrollToHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && $(id);
    if (el && el.classList.contains("tl-sec")) el.scrollIntoView({ block: "start" });
}

await chooseShell();
watchSections();
// Both calculators load at once; the page scrolls to the one in the link once they have their height.
await Promise.all([loadPace(), loadFueling()]);
scrollToHash();
window.addEventListener("hashchange", scrollToHash);
