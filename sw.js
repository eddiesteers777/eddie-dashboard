/* ==========================================
   Southbound Service Worker

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

const CACHE_NAME = "eddieos-shell-v5";

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
    "icons/icon-512.png",
    "brand/sb-mark.svg",
    "fonts/inter-latin-var.woff2",
    "fonts/bebas-neue-latin-400.woff2",
    "fonts/saira-latin-800.woff2"
];

// Shown instead of a browser error page when a page that was never
// opened online is opened offline. Self-contained (no network needed).
const OFFLINE_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offline | Southbound</title><meta name="theme-color" content="#0F2019">
<style>
@font-face{font-family:'Inter';font-weight:100 900;src:url('fonts/inter-latin-var.woff2') format('woff2');}
html,body{margin:0;height:100%;background:#0F2019;color:#F2EEE4;font-family:'Inter',system-ui,sans-serif;}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;box-sizing:border-box;}
img{width:64px;height:auto;opacity:.9;}
h1{margin:0;font-size:22px;}
p{margin:0;max-width:320px;color:#C3C9BD;line-height:1.55;}
a{display:inline-block;margin-top:6px;padding:12px 22px;border-radius:999px;background:#C9AD84;color:#0F2019;font-weight:700;text-decoration:none;}
</style></head><body><main>
<img src="brand/sb-mark.svg" alt="">
<h1>You're offline</h1>
<p>This page hasn't been saved on this device yet. Reconnect and try again, or go back to Today.</p>
<a href="index.html">Go to Today</a>
</main></body></html>`;

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
                if (cached) return cached;
                const isPage = request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
                return isPage
                    ? new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })
                    : new Response("", { status: 503 });
            })
    );

});
