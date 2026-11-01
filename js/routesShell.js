// Build a Route (routes.html) is a free tool. Signed out: the public site's header and footer, no sign-in,
// and saving routes is replaced by a sign-in card. Signed in: the app's own navigation and saved routes.
// Same switch the Free tools page and the 75-day tracker use (the page's inline script adds html.rb-app
// from the account sentinel; Firebase confirms it here).
const html = document.documentElement;

async function chooseShell() {
    let app = html.classList.contains("rb-app");
    if (app) {
        try {
            const { waitForUser } = await import("./auth.js");
            if (!(await waitForUser())) app = false;
        } catch { /* offline: the sentinel says signed in, so stay in the app */ }
    }
    if (!app) {
        html.classList.remove("rb-app");
        // The public header owns the sign-in pop-up; the card's button opens the same one.
        document.getElementById("rbSignIn")?.addEventListener("click", () => document.getElementById("pubSignInBtn")?.click());
        import("./loadPublicHeader.js");
        import("./publicLook.js");
        return;
    }
    document.body.classList.remove("pub-body");
    document.body.classList.add("rb-in-app");
    document.querySelectorAll("[data-public-only], [data-guest-only]").forEach(el => el.remove());
    document.getElementById("main").classList.add("container");
    const mount = document.createElement("div");
    mount.id = "header";
    document.body.prepend(mount);
    for (const src of ["js/loadHeader.js", "js/registerSW.js"]) {
        const s = document.createElement("script");
        s.src = src;
        document.body.append(s);
    }
}

await chooseShell();
