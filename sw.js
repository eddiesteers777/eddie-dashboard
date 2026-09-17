/* ==========================================
   EddieOS Service Worker

   Goal: make the app usable offline / feel like
   a real installed app, without ever risking
   stale data for things that must always be
   live (COROS activity data, Firebase auth/sync).

   Strategy:
   - Same-origin requests (this site's own HTML,
     CSS, JS): cache-first, but always kick off a
     network fetch in the background to refresh
     the cache for next time (stale-while-revalidate).
   - Cross-origin requests (Firebase, COROS,
     jsDelivr, Google Fonts, etc.): never touched
     at all -- always go straight to the network,
     exactly as if this service worker didn't exist.
========================================== */

const CACHE_NAME = "eddieos-shell-v1";

const CORE_ASSETS = [
    "index.html",
    "css/style.css",
    "css/dashboard.css",
    "js/loadHeader.js",
    "js/firebase.js",
    "js/app.js",
    "components/header.html",
    "manifest.json",
    "icons/icon-192.png",
    "icons/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_ASSETS))
            .catch(error => {
                // A single missing/renamed asset shouldn't block
                // installation entirely -- the runtime cache-as-you-go
                // behavior in fetch() below still works fine either way.
                console.warn("Service worker: core precache incomplete", error);
            })
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(names =>
            Promise.all(
                names
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {

    const request = event.request;

    // Only ever intercept GET requests to this same origin. Anything
    // else -- COROS API calls, Firebase, CDN scripts, POSTs -- passes
    // straight through untouched.
    if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(async cache => {
            const cached = await cache.match(request);

            const networkFetch = fetch(request)
                .then(response => {
                    if (response && response.ok) {
                        cache.put(request, response.clone());
                    }
                    return response;
                })
                .catch(() => null);

            // Serve from cache immediately if we have it, refreshing
            // in the background; otherwise wait on the network.
            return cached || (await networkFetch) || new Response(
                "Offline and this page hasn't been cached yet.",
                { status: 503, headers: { "Content-Type": "text/plain" } }
            );
        })
    );

});
