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

const TOOLS = ["pace", "fueling", "playbook"];
const loaders = { pace: loadPace, fueling: loadFueling };
const started = {};

// One tool shows at a time. The link (#pace, #fueling, #playbook) picks it, so every tool keeps its own address.
// The sections are named tool-pace and so on, so the browser has nothing to jump to and the hero and tabs stay in view.
// A calculator is fetched and started the first time its tab opens, so the page only pays for what is used.
function show(name, { scroll = false } = {}) {
    if (!TOOLS.includes(name)) name = "pace";
    document.querySelectorAll(".tl-tab").forEach(tab => {
        const on = tab.dataset.tool === name;
        tab.classList.toggle("on", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
    });
    TOOLS.forEach(t => { const sec = $("tool-" + t); if (sec) sec.hidden = t !== name; });
    document.querySelectorAll(".tl-photos img").forEach(img => img.classList.toggle("on", img.dataset.photo === name));
    // The phone's fueling step bar belongs to the Fueling tab only.
    html.classList.toggle("tl-fuel-view", name === "fueling");
    if (loaders[name] && !started[name]) { started[name] = true; loaders[name](); }
    if (scroll) $("tlTabs")?.scrollIntoView({ block: "start" });
}

function fromHash() {
    return decodeURIComponent(location.hash.slice(1));
}

function wireTabs() {
    const tabs = [...document.querySelectorAll(".tl-tab")];
    tabs.forEach((tab, i) => tab.addEventListener("keydown", e => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        location.hash = next.dataset.tool;
    }));
    window.addEventListener("hashchange", () => show(fromHash()));
}

await chooseShell();
wireTabs();
show(fromHash());
