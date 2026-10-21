// Southbound Playbook: which header the page wears.
// Signed out: the public site's header (and the page stays a free public tool).
// Signed in: the app's own navigation, so the Playbook sits inside the dashboard the person already knows.
// A tiny inline script in each page's <head> adds html.pb-app early from the account sentinel, so the
// public header never flashes for a signed-in person; this confirms it once Firebase answers.
const html = document.documentElement;

async function start() {
    let app = html.classList.contains("pb-app");
    if (app) {
        try {
            const { waitForUser } = await import("../auth.js");
            if (!(await waitForUser())) app = false;
        } catch { /* auth could not load (offline): the sentinel says signed in, so stay in the app */ }
    }
    if (!app) {
        html.classList.remove("pb-app");
        await import("../loadPublicHeader.js");
        return;
    }
    document.body.classList.remove("pub-body");
    document.body.classList.add("pb-in-app");
    document.querySelectorAll("[data-app-text]").forEach(el => { el.textContent = el.dataset.appText; });
    document.querySelectorAll(".pb-head .pub-hero-kicker").forEach(el => { el.textContent = el.textContent.replace("Free tool", "Coach tools"); });
    const main = document.getElementById("main");
    if (main) { main.classList.remove("pub-page"); main.classList.add("container"); }
    const mount = document.createElement("div");
    mount.id = "header";
    document.body.prepend(mount);
    const s = document.createElement("script");
    s.src = "js/loadHeader.js";
    document.body.append(s);
    const reg = document.createElement("script");
    reg.src = "js/registerSW.js";
    document.body.append(reg);
}
start();
