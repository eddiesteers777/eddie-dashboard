// ==========================================
// Southbound — Service Worker Registration
//
// Registers sw.js and loads the connection / version pill
// (js/netStatus.js). When a new version of the site has finished
// downloading in the background (a "waiting" worker), the pill offers
// Refresh; otherwise the new version simply takes over on the next page
// the person opens: every in-app link is a fresh page load, so asking
// the waiting worker to take over as this page is left never swaps
// code under something they're typing. The page is only ever reloaded
// by their own Refresh tap.
// ==========================================

(function () {
    const netStatus = import("./netStatus.js").catch(error => {
        console.warn("Southbound: status pill unavailable.", error);
        return null;
    });

    if (!("serviceWorker" in navigator)) return;

    function watch(registration) {
        const offer = worker => {
            if (!worker || !navigator.serviceWorker.controller) return; // first install: nothing to replace
            netStatus.then(m => m?.announceUpdate(worker));
            // Leaving this page: let the next one start on the new version.
            window.addEventListener("pagehide", () => worker.postMessage({ type: "SKIP_WAITING" }), { once: true });
        };
        if (registration.waiting) offer(registration.waiting);
        registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
                if (worker.state === "installed") offer(worker);
            });
        });
    }

    // Only the person's own Refresh tap reloads the page.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (sessionStorage.getItem("sb-sw-refresh")) {
            sessionStorage.removeItem("sb-sw-refresh");
            window.location.reload();
        }
    });

    function register() {
        navigator.serviceWorker
            .register("sw.js", { updateViaCache: "none" })
            .then(registration => {
                watch(registration);
                // An installed app can stay open for days: look for a new
                // version whenever it comes back to the foreground.
                document.addEventListener("visibilitychange", () => {
                    if (!document.hidden && navigator.onLine !== false) registration.update().catch(() => {});
                });
            })
            .catch(error => {
                console.warn("Service worker registration failed:", error);
            });
    }

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
})();
