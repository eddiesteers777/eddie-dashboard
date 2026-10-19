/* ==========================================
   Southbound — Public Nav Loader

   Same fetch-a-partial pattern as js/loadHeader.js, deliberately
   much smaller: no cloud sync bootstrap, no mobile bottom nav, no
   search overlay -- a guest here never touches any of that. The one
   thing this page needs from the internal app is auth itself, so
   "Sign In" can actually sign someone in.
========================================== */

fetch("components/publicHeader.html")
    .then(response => response.text())
    .then(async html => {
        const mount = document.getElementById("publicHeader");
        if (!mount) return;
        mount.innerHTML = html;

        const page = window.location.pathname.split("/").pop() || "home.html";
        document.querySelectorAll(".pub-nav-link, .pub-nav-cta").forEach(link => {
            if (link.dataset.page === page) link.classList.add("active");
        });

        // The partial lands after icons.js's own load-time pass.
        import("./icons.js").then(m => m.hydrate()).catch(() => {});

        // Phone menu: the links fold into a sheet under the bar.
        const menuBtn = document.getElementById("pubMenuBtn");
        const nav = document.querySelector(".pub-navbar");
        const setMenu = open => {
            nav.classList.toggle("pub-nav-open", open);
            menuBtn.setAttribute("aria-expanded", String(open));
        };
        menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("pub-nav-open")));
        document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });
        document.getElementById("pubNavLinks").addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });

        const signInBtn = document.getElementById("pubSignInBtn");
        if (!signInBtn) return;

        try {
            const { login, listenForAuth } = await import("./auth.js");

            listenForAuth(user => {
                signInBtn.textContent = user ? "Dashboard" : "Sign In";
            });

            signInBtn.addEventListener("click", async () => {
                const { getCurrentUser } = await import("./auth.js");
                if (getCurrentUser()) {
                    window.location.href = "index.html";
                    return;
                }
                signInBtn.disabled = true;
                signInBtn.textContent = "Signing in…";
                const success = await login();
                if (success) {
                    window.location.href = "index.html";
                } else {
                    signInBtn.disabled = false;
                    signInBtn.textContent = "Sign In";
                }
            });
        } catch (error) {
            console.warn("Southbound: public nav sign-in wiring failed.", error);
        }
    });
