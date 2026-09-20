/* ==========================================
   EddieOS Service Worker

   Goal: make the app usable offline / feel like
   a real installed app, without ever risking
   stale data for things that must always be
   live (COROS activity data, Firebase auth/sync).

   Strategy:
   - Same-origin requests (this site's own HTML,
     CSS, JS): network-first, falling back to the
     cache only when the network fetch fails (i.e.
     actually offline). This was cache-first with a
     background refresh (stale-while-revalidate)
     until it caused real bugs: a page could keep
     serving yesterday's cached CSS/JS indefinitely
     whenever the background refetch hadn't
     happened to run yet, even though the live site
     had long since moved on. Network-first trades
     a normally-imperceptible round trip for never
     showing stale UI while online.
   - Cross-origin requests (Firebase, COROS,
     jsDelivr, Google Fonts, etc.): never touched
     at all -- always go straight to the network,
     exactly as if this service worker didn't exist.

   Bump CACHE_NAME whenever CORE_ASSETS changes, so
   the old cache (and whatever it has stale) gets
   dropped on activate instead of lingering.
========================================== */

const CACHE_NAME = "eddieos-shell-v2";

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
        fetch(request)
            .then(response => {
                if (response && response.ok) {
                    caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
                }
                return response;
            })
            .catch(async () => {
                const cached = await caches.match(request);
                return cached || new Response(
                    "Offline and this page hasn't been cached yet.",
                    { status: 503, headers: { "Content-Type": "text/plain" } }
                );
            })
    );

});
