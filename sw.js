/* ==========================================
   Southbound Service Worker

   Goal: open instantly, work offline, and never trap anyone on an old
   version.

   - The app itself (every page, script, stylesheet, font, icon, the
     logo and reaction drawings) is kept as one VERSION, listed below
     with a fingerprint per file (written by `npm run manifest`). Those
     files are served from this device first: no waiting on a slow or
     missing connection. Pages ignore their ?query (workout.html?date=…
     is workout.html).
   - A new deploy changes the list, so the browser sees a new sw.js,
     downloads only the files whose fingerprint changed (the rest are
     copied from the old version) and holds the new version as
     "waiting". The page offers "A new version of Southbound is
     available. Refresh", and the next page the person opens switches to
     it (switchVersion below), so nobody stays on an old version.
     Old versions are deleted once the new one takes over. A version
     only takes over complete: a failed download leaves the old one in
     place and the browser tries again on the next visit.
   - The Firebase SDK (gstatic, versioned URLs) is kept too, so the app
     can start offline. Photos and CDN libraries (EmailJS, the exercise
     library) are served from the device and refreshed in the background.
   - Never touched: Firestore, sign-in, COROS and every other API call
     (they always go to the network, and Firestore keeps its own offline
     copy of the account's data, js/firebase.js), and anything that
     isn't a GET.
========================================== */

// ---- precache (written by `npm run manifest`; don't edit by hand) ----
const VERSION = "00100e481804";
const PRECACHE = { "75day.html": "988757732e55", "about.html": "0002a2e8348e", "analytics.html": "a13f8a2379a3", "apply.html": "533d27a5d4a8", "brand/sb-mark-forest.svg": "a4931de181b6", "brand/sb-mark.svg": "ce34a98e276e", "brand/sb-tile.svg": "c404fa9d1bc2", "brand/southbound-logo-forest.svg": "74c43339c5f3", "brand/southbound-logo.svg": "870ae3452eb2", "checkin.html": "030b58e00a50", "client.html": "c74555a05944", "clients.html": "9a6c0cac5df2", "coach.html": "2391a9a10eb0", "coaching.html": "d5c171029718", "components/header.html": "47f6301db0b8", "components/publicHeader.html": "d774d3382afc", "contact.html": "d07c40581817", "cross-training.html": "36cbbeeced78", "css/analytics.css": "9974c065bcc7", "css/checkin.css": "7214127da31e", "css/client-hub.css": "48fee0bcf069", "css/client-profile.css": "1f0c5827cb59", "css/clients.css": "d85fd17e5652", "css/coach.css": "940e77528a95", "css/corosCoach.css": "f06fa0c87108", "css/corosData.css": "590f7d8c3034", "css/corosIntegration.css": "0f8ef6f510a7", "css/cross-training.css": "f27d53661084", "css/dashboard.css": "97a62f8977b5", "css/fueling.css": "37f14540e796", "css/gear.css": "7632a9da78c6", "css/habits.css": "1cd2d2ddb4a5", "css/install.css": "4485dc10bf48", "css/marathon.css": "e05bfc936a55", "css/my-plan.css": "c0aeba5243ea", "css/nutrition.css": "77ba69320b1b", "css/pace-calculator.css": "abb78b8ff3ce", "css/programs.css": "28ad4cd78707", "css/public.css": "f4cce42e341c", "css/race-plans.css": "5833805dbb41", "css/readiness.css": "3be572599524", "css/running.css": "b4cc7ce30ea0", "css/schedule.css": "e96d03cfdf7f", "css/settings.css": "7816d20001b5", "css/stravaIntegration.css": "44ce0abb336f", "css/strength.css": "72e48515a299", "css/strengthLibrary.css": "62c55bf57d5d", "css/style.css": "3cfdea75b176", "css/trends.css": "f3b51046dd40", "css/updates.css": "313c79fb6042", "css/week.css": "8ea77b2741df", "css/weekly-review.css": "ccf740e4d447", "css/workout.css": "32b10140d9c0", "emoji/sb_adjust.svg": "e35874a966b5", "emoji/sb_big_effort.svg": "6495a31ba8b1", "emoji/sb_check.svg": "6232cb731332", "emoji/sb_coach_eye.svg": "1f9ae7782bd3", "emoji/sb_easy_day.svg": "c2b366ee1f4c", "emoji/sb_finish.svg": "bb12d963250e", "emoji/sb_fuel.svg": "5f18990d25d2", "emoji/sb_great_work.svg": "bb039468e003", "emoji/sb_high_five.svg": "5bab60223e88", "emoji/sb_hydrate.svg": "a1424a085604", "emoji/sb_lets_go.svg": "a5609b470a49", "emoji/sb_locked_in.svg": "cc5cd52b6587", "emoji/sb_long_run.svg": "bd34b16d3d08", "emoji/sb_pr.svg": "5f8e047c6ac6", "emoji/sb_race_day.svg": "36e5fde643d1", "emoji/sb_recovery.svg": "25722d40ea7e", "emoji/sb_scheduled.svg": "2272b9444a0f", "emoji/sb_sleep.svg": "22d45ac24d4d", "emoji/sb_soccer.svg": "0291223a631e", "emoji/sb_southbound.svg": "b1afe8ac46ea", "emoji/sb_strong.svg": "e59440821973", "emoji/sb_survived.svg": "b604942a81ce", "emoji/sb_tired_proud.svg": "300fef72cdcf", "emoji/sb_trail.svg": "c54c37c78e1e", "fonts/bebas-neue-latin-400.woff2": "a7c90c89240c", "fonts/inter-latin-var.woff2": "3100e775e861", "fonts/jetbrains-mono-latin-var.woff2": "18be452724bf", "fonts/saira-latin-800.woff2": "ca7a9220a7b6", "fonts/saira-latin-900-italic.woff2": "41db7434e28b", "fueling.html": "bfdd65acb29d", "gear.html": "7795f4604dea", "habits.html": "ee7a07723662", "home.html": "d4a2565ee4e3", "icons/apple-touch-icon.png": "fdcea045a12c", "icons/favicon-32.png": "197bd214730d", "icons/icon-192.png": "17f5fa972d82", "icons/icon-512.png": "236b9f965f1d", "icons/icon-maskable-512.png": "f6ffd8417443", "icons/install-qr.svg": "cc50ce72bf4c", "icons/running-bg-map.svg": "e51158d2f6a5", "index.html": "11fa18f84dc5", "install.html": "0c3c14759d12", "js/activeProgramSources.js": "3f497e8f5247", "js/analytics.js": "3be95376ef1d", "js/app.js": "dd7a2c06cf37", "js/apply.js": "44778798c77b", "js/auth.js": "b50e4616421b", "js/barcodeScanner.js": "22ee051e9e89", "js/calendarButton.js": "a3a84920492c", "js/calendarExport.js": "80e0f4eb104d", "js/changeRequestDialog.js": "33918ae04b85", "js/changeRequests.js": "f69a9b56f2d1", "js/checkin.js": "5c39a315fd29", "js/checkinView.js": "79bb7ddf3c88", "js/checkins.js": "6737f2c9bc30", "js/clientDirectory.js": "0929529b61ea", "js/clientHub.js": "dd325a8f4d7d", "js/clientNotes.js": "2bb358050921", "js/clientProfileForm.js": "c999c07e2ae6", "js/clientRecordSchema.js": "96956bd59403", "js/clientRecords.js": "33daee0eebbb", "js/clientSummary.js": "f4ef7eb89d14", "js/clients.js": "a202e1f0cc92", "js/cloudSync.js": "1f4e3130ca9f", "js/coach.js": "42aa619501d5", "js/coachAccess.js": "341c099569d4", "js/coachCard.js": "06c89a221dd0", "js/coachLibrary.js": "57b7348440a8", "js/coachNotesLocal.js": "eee6fc4a43d7", "js/coachPlanGenerator.js": "00616ebe2901", "js/coachPlanStore.js": "62c2dd9fb7e7", "js/coachPlanSync.js": "18a1f9cc3f64", "js/coachingPlanModel.js": "600f2185c235", "js/coachingPlans.js": "738650d3ff8e", "js/contact.js": "1eeeda2d7f49", "js/corosAuth.js": "9b0d537e17c8", "js/corosAutoSend.js": "8a97725b2d2e", "js/corosClient.js": "12cff09eec0f", "js/corosCoach.js": "8a67f79b56f6", "js/corosData.js": "fc13335a4dcb", "js/corosDiagnostic.js": "f1b652c00670", "js/corosHealth.js": "94610cda7b2b", "js/corosHistory.js": "694aee1e1b41", "js/corosMetrics.js": "c6e41c7ac5d2", "js/corosParse.js": "cec7c08f79bc", "js/corosSend.js": "d76a8accc06d", "js/corosSettings.js": "51ddf0d063ba", "js/corosStatus.js": "2766d6e56868", "js/corosTools.js": "1adae227aae2", "js/corosWorkout.js": "47b1f31e4d9a", "js/cross-training.js": "db6f1f171eca", "js/dashboardData.js": "3b2df7b54aff", "js/emailNotify.js": "7e1fa1dd4e97", "js/emoji.js": "ca79cda2b711", "js/emojiPicker.js": "e8f504962b70", "js/exerciseSearch.js": "0be94a6dc23b", "js/feedbackModel.js": "fa97a0ea6501", "js/firebase.js": "5b843e9bde1a", "js/firestore.js": "9d5661ce5e7a", "js/fitParse.js": "78d43d773a57", "js/foodSearch.js": "b303701a30fe", "js/fuelSchedule.js": "7a3494739629", "js/fuelScheduleView.js": "0d08aa67d693", "js/fuelTargets.js": "824e46987299", "js/fueling.js": "1324b118db3f", "js/gear.js": "eb30f8111e42", "js/habitIcons.js": "ec95b513c635", "js/habits.js": "8695800012e8", "js/icons.js": "26ac0224d3e5", "js/inquiries.js": "1a9362b8e12c", "js/install.js": "6896f68d20b6", "js/loadHeader.js": "45595669d0a9", "js/loadPublicHeader.js": "b5ffc901add1", "js/marathonCoros.js": "f37b7cbfa4d0", "js/marathonCorosButton.js": "c7729fe2453f", "js/marathonData.js": "fb046fb92520", "js/myPlan.js": "ac94839b7b35", "js/navAccess.js": "cfd1152be2c6", "js/netStatus.js": "d4e8fada44a1", "js/nutrition.js": "c16a90e16c1b", "js/nutritionGoals.js": "fdc181c33f1a", "js/offlineWrite.js": "49f551296a50", "js/pace-calculator.js": "bd2a8419b2b3", "js/personalRecords.js": "552f645b0ec9", "js/planGenerateDialogs.js": "42087aa30f37", "js/planOps.js": "84288ac16423", "js/planRelease.js": "289e67c5041c", "js/planShape.js": "ddadec632b2f", "js/planWindow.js": "45188cbb26a4", "js/planWorkspace.js": "1da2115162e2", "js/plannerEvents.js": "08f25cee96db", "js/profile.js": "53427765098f", "js/programs.js": "6da40514ce79", "js/racePlanEditor.js": "6bcb58060cac", "js/racePlanGenerator.js": "b1a5f567ec36", "js/racePlanStrengthIntegration.js": "3260d2f3f2a7", "js/racePlans.js": "33ee8b7fd77b", "js/readiness.js": "e53035aa7dd0", "js/readinessCard.js": "9fa03e131d4c", "js/readinessData.js": "b1f2e79a310d", "js/registerSW.js": "790992fae5bb", "js/role.js": "013795db34f2", "js/runWalk.js": "54a8543a474f", "js/runWorkout.js": "9bf2760d6783", "js/runningCalendar.js": "4ca0abf4f839", "js/runningLog.js": "17719c3a4acd", "js/runningProgramCalendar.js": "4e27dfdcf1ea", "js/runningPrograms.js": "746cfdef0844", "js/schedule.js": "32392c003e23", "js/scheduling.js": "e2979b0de4a4", "js/settings.js": "1e84912929dd", "js/stravaArchive.js": "f3362a6e3a11", "js/stravaAuth.js": "c5ec05e2a19b", "js/stravaConfig.js": "a0d7645995e2", "js/stravaData.js": "4d45943824e5", "js/stravaHistory.js": "f1ff33e66fad", "js/stravaImport.js": "1e760d9d89ff", "js/stravaStore.js": "2675308386cc", "js/strength.js": "fcd21b019e55", "js/strengthBuilder.js": "717a727a868e", "js/strengthHistory.js": "f32e73218e6c", "js/strengthLibrary.js": "f8743d844f45", "js/strengthLibraryData.js": "a0885a3f9b4e", "js/strengthSchedule.js": "76ae197d44ea", "js/strengthSession.js": "122fe542f401", "js/strengthWorkout.js": "648540d18cdc", "js/strengthWorkoutMode.js": "411811d04564", "js/svgCharts.js": "e54d422ad77e", "js/todayClient.js": "bc7620c98b5f", "js/trainingPlanGenerator.js": "ec1828c914c0", "js/trainingPlanStrengthIntegration.js": "b3d9b7d065bb", "js/trainingPrograms.js": "23256fee56d2", "js/trends.js": "8ce08c6abb1a", "js/trendsData.js": "6eef58d0d5b3", "js/trendsView.js": "2d2a95bd18b6", "js/ui.js": "ff20b80edffb", "js/updates.js": "30df09940001", "js/userProfile.js": "e1fdb6f78725", "js/userSettings.js": "ce787b73ba2a", "js/weekData.js": "4df1032bcb5a", "js/weekModel.js": "90aa62b41616", "js/weekView.js": "d9c574e9555d", "js/weekly-review.js": "915c6a33ae4d", "js/workoutBuilder.js": "7f251f124842", "js/workoutFuel.js": "953f5c099038", "js/workoutPage.js": "34433a9cebb9", "js/workoutResults.js": "5d284e39a8a9", "manifest.json": "73d874cb2f1b", "marathon.html": "78f6a5d149e0", "more.html": "63f72e998f17", "nutrition.html": "fc1ec6b9c2e4", "pace-calculator.html": "ce04afea14b2", "packages.html": "355b6e004af2", "plan.html": "bf7e6239d9b1", "planner.html": "6c5efafbaa08", "privacy.html": "2344821f65dd", "profile.html": "2355dcfe1fef", "programs.html": "5d7f51cf391a", "running.html": "12411f035560", "schedule.html": "33cf87aafa3d", "settings.html": "cdd34140f78d", "site-check.html": "2c3cb6b05d7e", "soccer.html": "9a421c5302d0", "strength.html": "06f0c9189277", "updates.html": "726aed8e01de", "weekly-review.html": "e3e43ac94321", "workout.html": "a1e1ab43aefc" };
const CDN_PRECACHE = ["https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"];
// ---- end precache ----

const APP_CACHE = `sb-app-${VERSION}`;
const RUNTIME_CACHE = "sb-runtime";
const CDN_CACHE = "sb-cdn";
const RUNTIME_MAX = 80;

// Shown instead of a browser error page when a page that isn't saved on
// this device is opened offline. Self-contained (no network needed).
const OFFLINE_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offline | Southbound</title><meta name="theme-color" content="#0F2019">
<style>
@font-face{font-family:'Inter';font-weight:100 900;src:url('fonts/inter-latin-var.woff2') format('woff2');}
html,body{margin:0;height:100%;background:#0F2019;color:#F2EEE4;font-family:'Inter',system-ui,sans-serif;}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;box-sizing:border-box;}
img{width:72px;height:auto;}
h1{margin:0;font-size:22px;}
p{margin:0;max-width:320px;color:#C3C9BD;line-height:1.55;}
a{display:inline-block;margin-top:6px;padding:12px 22px;border-radius:999px;background:#C9AD84;color:#0F2019;font-weight:700;text-decoration:none;}
</style></head><body><main>
<img src="brand/sb-tile.svg" alt="">
<h1>You're offline</h1>
<p>This page hasn't been saved on this device yet. Reconnect and try again, or go back to Today.</p>
<a href="index.html">Go to Today</a>
</main></body></html>`;

const scopeUrl = () => new URL(self.registration.scope);
const keyFor = rel => new URL(rel, self.registration.scope).href;

// "workout.html?x" -> "workout.html"; "" -> "index.html". null if outside scope.
function relPath(url) {
    const base = scopeUrl().pathname;
    if (!url.pathname.startsWith(base)) return null;
    const rel = decodeURIComponent(url.pathname.slice(base.length));
    return rel === "" ? "index.html" : rel;
}

async function withHash(response, hash) {
    const headers = new Headers(response.headers);
    headers.set("X-SB-Hash", hash);
    return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers });
}

async function installVersion() {
    const names = await caches.keys();
    const older = names.filter(n => n.startsWith("sb-app-") && n !== APP_CACHE);
    const cache = await caches.open(APP_CACHE);
    const entries = Object.entries(PRECACHE);
    let next = 0;
    async function worker() {
        while (next < entries.length) {
            const [rel, hash] = entries[next++];
            const key = keyFor(rel);
            const have = await cache.match(key);
            if (have && have.headers.get("X-SB-Hash") === hash) continue;
            let copied = false;
            for (const name of older) {
                const old = await (await caches.open(name)).match(key);
                if (old && old.headers.get("X-SB-Hash") === hash) { await cache.put(key, old); copied = true; break; }
            }
            if (copied) continue;
            // no-cache: revalidate with the server, never a stale HTTP-cache copy.
            const response = await fetch(key, { cache: "no-cache" });
            if (response.status === 404) { console.warn("Service worker: missing file", rel); continue; }
            if (!response.ok) throw new Error(`${rel}: ${response.status}`);
            await cache.put(key, await withHash(response, hash));
        }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    // The SDK: fetched once, kept (its URL changes when its version does).
    const cdn = await caches.open(CDN_CACHE);
    await Promise.all(CDN_PRECACHE.map(async url => {
        if (await cdn.match(url)) return;
        try {
            const response = await fetch(url, { mode: "cors" });
            if (response.ok) await cdn.put(url, response);
        } catch { /* offline for this bit: it's fetched the first time it's used */ }
    }));
    return older.length === 0;
}

self.addEventListener("install", event => {
    event.waitUntil(installVersion().then(firstVersion => {
        // First install, or replacing the old always-from-the-network worker:
        // nothing to swap mid-page, so take over straight away.
        if (firstVersion) return self.skipWaiting();
    }));
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        const legacy = names.some(n => n.startsWith("eddieos-shell-"));
        const hadApp = names.some(n => n.startsWith("sb-app-") && n !== APP_CACHE);
        await Promise.all(names
            .filter(n => (n.startsWith("sb-app-") && n !== APP_CACHE) || n.startsWith("eddieos-shell-"))
            .map(n => caches.delete(n)));
        if (legacy || !hadApp) await self.clients.claim();
    })());
});

self.addEventListener("message", event => {
    if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function trim(cache) {
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - RUNTIME_MAX))) await cache.delete(key);
}

const offlineResponse = request => (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html"))
    ? new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })
    : new Response("", { status: 503 });

async function fromApp(rel, request) {
    const cached = await caches.match(keyFor(rel), { cacheName: APP_CACHE });
    if (cached) return cached;
    try {
        return await fetch(request);
    } catch {
        return offlineResponse(request);
    }
}

async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            await cache.put(request, response.clone());
            trim(cache);
        }
        return response;
    } catch {
        return (await caches.match(request, { cacheName })) || offlineResponse(request);
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const refresh = fetch(request).then(response => {
        if (response.ok || response.type === "opaque") {
            cache.put(request, response.clone()).then(() => trim(cache));
        }
        return response;
    }).catch(() => null);
    return cached || (await refresh) || offlineResponse(request);
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
}

// A new version finished downloading and someone opens a page: that's the
// safe moment to switch (nothing typed on the new page yet). Answer at once
// with a tiny page that reloads itself, and let the new version take over;
// the reload is served by it. (Switching from the page being left, on
// pagehide, raced the new page's own request and could leave it loading
// forever, 2026-09-28.) Not while another Southbound tab is open: that tab
// keeps its version until the person taps Refresh there.
async function switchVersion() {
    const waiting = self.registration.waiting;
    if (!waiting) return null;
    const windows = await self.clients.matchAll({ type: "window" });
    if (windows.length > 1) return null;
    waiting.postMessage({ type: "SKIP_WAITING" });
    return new Response("<!DOCTYPE html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0\"><title>Southbound</title><body style=\"background:#0F2019\"></body>", {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Refresh": "0" }
    });
}

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        const rel = relPath(url);
        if (request.mode === "navigate" && self.registration.waiting) {
            event.respondWith(switchVersion().then(r => r || (rel !== null && Object.prototype.hasOwnProperty.call(PRECACHE, rel) ? fromApp(rel, request) : networkFirst(request, RUNTIME_CACHE))));
        } else if (rel !== null && Object.prototype.hasOwnProperty.call(PRECACHE, rel)) {
            event.respondWith(fromApp(rel, request));
        } else if (/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(url.pathname)) {
            event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        } else {
            event.respondWith(networkFirst(request, RUNTIME_CACHE));
        }
        return;
    }

    if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
        event.respondWith(cacheFirst(request, CDN_CACHE));
        return;
    }
    if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "cdnjs.cloudflare.com") {
        event.respondWith(staleWhileRevalidate(request, CDN_CACHE));
    }
    // Everything else (Firestore, sign-in, COROS...) goes straight to the network.
});
