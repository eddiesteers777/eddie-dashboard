// Southbound billing cache sync marker — generated precache block follows.
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
const VERSION = "01068ef10d71";
const PRECACHE = { "75day.html": "7d17d6191fe0", "about.html": "0002a2e8348e", "analytics.html": "a13f8a2379a3", "apply.html": "93b886941d4b", "brand/sb-mark-forest.svg": "a4931de181b6", "brand/sb-mark.svg": "ce34a98e276e", "brand/sb-tile.svg": "c404fa9d1bc2", "brand/southbound-logo-forest.svg": "74c43339c5f3", "brand/southbound-logo.svg": "870ae3452eb2", "checkin.html": "7bb244225b4b", "client.html": "6e2d7fe1c741", "clients.html": "f2cf812a80d8", "coach.html": "5081f61aed5a", "coaching.html": "d5c171029718", "components/header.html": "47f6301db0b8", "components/publicHeader.html": "d774d3382afc", "contact.html": "d07c40581817", "cross-training.html": "36cbbeeced78", "css/analytics.css": "7589368b8910", "css/checkin.css": "6a1c7dcf8892", "css/client-hub.css": "e406bb54cc9a", "css/client-profile.css": "2c5783dbf16a", "css/clients.css": "2485e6c700ed", "css/coach.css": "0eb07675bd42", "css/corosCoach.css": "f06fa0c87108", "css/corosData.css": "50e8d521e396", "css/corosIntegration.css": "b9e4f12f29a7", "css/cross-training.css": "92238e3d1112", "css/dashboard.css": "b75a2ba7f178", "css/fueling.css": "9b7958368506", "css/gear.css": "66cd5b6f12cb", "css/habits.css": "7342e213b6e6", "css/install.css": "ac0b6404dc5b", "css/intake.css": "0d671e02bf1c", "css/marathon.css": "e2db06eb5aca", "css/my-plan.css": "c0aeba5243ea", "css/nutrition.css": "9e56a5647123", "css/pace-calculator.css": "72d381eaa88b", "css/programs.css": "f54a5c469af4", "css/public.css": "2947f36017e5", "css/race-plans.css": "d6d77dff597f", "css/readiness.css": "c17224c36c2c", "css/running.css": "33b2f9c17877", "css/schedule.css": "24b5492b5893", "css/settings.css": "d2b72307c9b2", "css/stravaIntegration.css": "cb62c6b53804", "css/strength.css": "f584e0030da8", "css/strengthLibrary.css": "9e335442c307", "css/style.css": "de65dd206135", "css/trends.css": "f3b51046dd40", "css/updates.css": "7ed9230a98b5", "css/week.css": "629680e0a2df", "css/weekly-review.css": "2cab6ced771a", "css/workout.css": "afb8b2e12e05", "emoji/sb_adjust.svg": "e35874a966b5", "emoji/sb_big_effort.svg": "6495a31ba8b1", "emoji/sb_check.svg": "6232cb731332", "emoji/sb_coach_eye.svg": "1f9ae7782bd3", "emoji/sb_easy_day.svg": "c2b366ee1f4c", "emoji/sb_finish.svg": "bb12d963250e", "emoji/sb_fuel.svg": "5f18990d25d2", "emoji/sb_great_work.svg": "bb039468e003", "emoji/sb_high_five.svg": "5bab60223e88", "emoji/sb_hydrate.svg": "a1424a085604", "emoji/sb_lets_go.svg": "a5609b470a49", "emoji/sb_locked_in.svg": "cc5cd52b6587", "emoji/sb_long_run.svg": "bd34b16d3d08", "emoji/sb_pr.svg": "5f8e047c6ac6", "emoji/sb_race_day.svg": "36e5fde643d1", "emoji/sb_recovery.svg": "25722d40ea7e", "emoji/sb_scheduled.svg": "2272b9444a0f", "emoji/sb_sleep.svg": "22d45ac24d4d", "emoji/sb_soccer.svg": "0291223a631e", "emoji/sb_southbound.svg": "b1afe8ac46ea", "emoji/sb_strong.svg": "e59440821973", "emoji/sb_survived.svg": "b604942a81ce", "emoji/sb_tired_proud.svg": "300fef72cdcf", "emoji/sb_trail.svg": "c54c37c78e1e", "fonts/bebas-neue-latin-400.woff2": "a7c90c89240c", "fonts/inter-latin-var.woff2": "3100e775e861", "fonts/jetbrains-mono-latin-var.woff2": "18be452724bf", "fonts/saira-latin-800.woff2": "ca7a9220a7b6", "fonts/saira-latin-900-italic.woff2": "41db7434e28b", "fueling.html": "bfdd65acb29d", "gear.html": "7795f4604dea", "habit-icons/ball.svg": "dfe072d0d184", "habit-icons/bible.svg": "3673dc278d2b", "habit-icons/bike.svg": "0924056d4214", "habit-icons/breathe.svg": "c42fe0e5bf5a", "habit-icons/check.svg": "6232cb731332", "habit-icons/coffee.svg": "716b3960d6cf", "habit-icons/cold.svg": "8863dd839ba6", "habit-icons/core.svg": "01f55967dc1e", "habit-icons/dog.svg": "11ff79c6295d", "habit-icons/family.svg": "c9079107a588", "habit-icons/fasting.svg": "3cb0c83a2032", "habit-icons/friends.svg": "d927f37953ee", "habit-icons/fruit.svg": "0883e51f41e9", "habit-icons/goal.svg": "e88e34bfc4cd", "habit-icons/gratitude.svg": "0944f76de211", "habit-icons/journal.svg": "b400c66f0f0e", "habit-icons/love.svg": "6ddfa4ff34d4", "habit-icons/mealprep.svg": "14d835a4dc53", "habit-icons/meals.svg": "15588d8e9661", "habit-icons/meditate.svg": "6968cd959f22", "habit-icons/money.svg": "476cbb25e8c9", "habit-icons/music.svg": "002d6ed3b01e", "habit-icons/nature.svg": "a4cabbe150bc", "habit-icons/noalcohol.svg": "0ff0cce39da8", "habit-icons/nosugar.svg": "546357099fc7", "habit-icons/pray.svg": "58833e69b510", "habit-icons/protein.svg": "49252ed9717b", "habit-icons/read.svg": "74df63280210", "habit-icons/run.svg": "86e44a548dfb", "habit-icons/sauna.svg": "04add853735d", "habit-icons/screens.svg": "5cbb3c31e31f", "habit-icons/sleep.svg": "639bda34583e", "habit-icons/star.svg": "a514134b76c9", "habit-icons/steps.svg": "b8d940eef6aa", "habit-icons/strength.svg": "e59440821973", "habit-icons/stretch.svg": "970b9de7cfc2", "habit-icons/study.svg": "226dd19a88c3", "habit-icons/sun.svg": "5f42cd693cd6", "habit-icons/swim.svg": "5610c3300e76", "habit-icons/teeth.svg": "943e045c0c1a", "habit-icons/tidy.svg": "61fd17587396", "habit-icons/veggies.svg": "aaeced722a0b", "habit-icons/vitamins.svg": "a2eb2116f338", "habit-icons/water.svg": "333957146a64", "habit-icons/weigh.svg": "3cd851367c92", "habit-icons/work.svg": "b170559704b2", "habit-icons/workout.svg": "105a25014658", "habits.html": "ee7a07723662", "home.html": "d4a2565ee4e3", "icons/apple-touch-icon.png": "fdcea045a12c", "icons/favicon-32.png": "197bd214730d", "icons/icon-192.png": "17f5fa972d82", "icons/icon-512.png": "236b9f965f1d", "icons/icon-maskable-512.png": "f6ffd8417443", "icons/install-qr.svg": "cc50ce72bf4c", "icons/running-bg-map.svg": "e51158d2f6a5", "index.html": "8045cee71096", "install.html": "0c3c14759d12", "js/activeProgramSources.js": "3f497e8f5247", "js/analytics.js": "3be95376ef1d", "js/app.js": "9fc1333612b9", "js/applicationForm.js": "9e4b73ee8b91", "js/applications.js": "297b7245d283", "js/apply.js": "e23cdf930be4", "js/auth.js": "935bf9feddd9", "js/barcodeScanner.js": "22ee051e9e89", "js/calendarButton.js": "a3a84920492c", "js/calendarExport.js": "80e0f4eb104d", "js/changeRequestDialog.js": "33918ae04b85", "js/changeRequests.js": "f69a9b56f2d1", "js/checkin.js": "5c39a315fd29", "js/checkinView.js": "79bb7ddf3c88", "js/checkins.js": "6737f2c9bc30", "js/clientAssignmentModel.js": "32028f62e116", "js/clientDirectory.js": "9734701567f4", "js/clientHub.js": "79092618d15f", "js/clientNotes.js": "2bb358050921", "js/clientPackageCard.js": "9d4b497841de", "js/clientPackageModel.js": "0e9007b963d8", "js/clientPackages.js": "74ce6c4b985f", "js/clientProfileForm.js": "dd7df6af23e5", "js/clientRecordSchema.js": "4fe08935ec1a", "js/clientRecords.js": "93ce8de3da75", "js/clientSummary.js": "68cc9883bfef", "js/clientTimeline.js": "bcf911282ba9", "js/clients.js": "0740c62b83af", "js/cloudSync.js": "780a48e0f7ea", "js/coach.js": "25e26ed47aef", "js/coachAccess.js": "d525b174d6c1", "js/coachCard.js": "ae0444e55706", "js/coachLibrary.js": "57b7348440a8", "js/coachNotesLocal.js": "eee6fc4a43d7", "js/coachPlanGenerator.js": "b64bfe7788f4", "js/coachPlanStore.js": "62c2dd9fb7e7", "js/coachPlanSync.js": "18a1f9cc3f64", "js/coachToday.js": "b7c0efba5c13", "js/coachingPlanModel.js": "600f2185c235", "js/coachingPlans.js": "738650d3ff8e", "js/contact.js": "1eeeda2d7f49", "js/corosAuth.js": "d62a7089233a", "js/corosAutoSend.js": "8a97725b2d2e", "js/corosClient.js": "12cff09eec0f", "js/corosCoach.js": "8a67f79b56f6", "js/corosData.js": "312d425a78a5", "js/corosDiagnostic.js": "f1b652c00670", "js/corosHealth.js": "94610cda7b2b", "js/corosHistory.js": "694aee1e1b41", "js/corosMetrics.js": "c6e41c7ac5d2", "js/corosParse.js": "cec7c08f79bc", "js/corosSend.js": "d76a8accc06d", "js/corosSettings.js": "380046332d24", "js/corosStatus.js": "2766d6e56868", "js/corosTools.js": "1adae227aae2", "js/corosWorkout.js": "47b1f31e4d9a", "js/cross-training.js": "c4f05badc93e", "js/dashboardData.js": "3b2df7b54aff", "js/emailNotify.js": "3cc14cf015bd", "js/emoji.js": "ca79cda2b711", "js/emojiPicker.js": "e8f504962b70", "js/exerciseSearch.js": "0be94a6dc23b", "js/feedbackModel.js": "5d10d74752da", "js/firebase.js": "c7270c6c3cb3", "js/firestore.js": "a39d3ceb6608", "js/fitParse.js": "78d43d773a57", "js/foodSearch.js": "b303701a30fe", "js/fuelSchedule.js": "7a3494739629", "js/fuelScheduleView.js": "0d08aa67d693", "js/fuelTargets.js": "824e46987299", "js/fueling.js": "1324b118db3f", "js/gear.js": "eb30f8111e42", "js/habitIconPicker.js": "42cf8ed45a4d", "js/habitIconSet.js": "e898f2e319c4", "js/habits.js": "cd56256324f4", "js/healthReviewed.js": "95455d7e64ee", "js/icons.js": "26ac0224d3e5", "js/inquiries.js": "1a9362b8e12c", "js/install.js": "6896f68d20b6", "js/intakeFlow.js": "137b85984740", "js/intakeGuide.js": "7d40668bb962", "js/loadHeader.js": "b455f4f91316", "js/loadPublicHeader.js": "b5ffc901add1", "js/marathonCoros.js": "f37b7cbfa4d0", "js/marathonCorosButton.js": "c7729fe2453f", "js/marathonData.js": "f6129f0e6581", "js/myPlan.js": "f3dbbd443d51", "js/navAccess.js": "cfd1152be2c6", "js/netStatus.js": "d4e8fada44a1", "js/nutrition.js": "9ccbb7911b62", "js/nutritionGoals.js": "fdc181c33f1a", "js/offlineWrite.js": "49f551296a50", "js/pace-calculator.js": "bd2a8419b2b3", "js/packageCatalog.js": "cd485d74c6e0", "js/personalRecords.js": "552f645b0ec9", "js/planGenerateDialogs.js": "a1a886d41b00", "js/planOps.js": "84288ac16423", "js/planPrompt.js": "173db36fc102", "js/planPromptDialogs.js": "fdfb4e38f7b9", "js/planRelease.js": "289e67c5041c", "js/planShape.js": "ddadec632b2f", "js/planWindow.js": "45188cbb26a4", "js/planWorkspace.js": "672268d90be9", "js/plannerEvents.js": "08f25cee96db", "js/profile.js": "1ca2b9db681a", "js/profileCheckCard.js": "95c654db9bed", "js/profileChecks.js": "55d0c20df72c", "js/programs.js": "6da40514ce79", "js/racePlanEditor.js": "6bcb58060cac", "js/racePlanGenerator.js": "b1a5f567ec36", "js/racePlanStrengthIntegration.js": "3260d2f3f2a7", "js/racePlans.js": "33ee8b7fd77b", "js/readiness.js": "e53035aa7dd0", "js/readinessCard.js": "9fa03e131d4c", "js/readinessData.js": "51c5afdafb6b", "js/registerSW.js": "790992fae5bb", "js/role.js": "013795db34f2", "js/runWalk.js": "54a8543a474f", "js/runWorkout.js": "9bf2760d6783", "js/runningCalendar.js": "4ca0abf4f839", "js/runningLog.js": "17719c3a4acd", "js/runningProgramCalendar.js": "4e27dfdcf1ea", "js/runningPrograms.js": "746cfdef0844", "js/schedule.js": "b0e97c431d62", "js/scheduling.js": "7124e593eaf5", "js/sessionLogs.js": "655b5d2cb74b", "js/sessionModel.js": "2942dc3c72bd", "js/settings.js": "7ba74cbb1c7d", "js/stravaArchive.js": "f3362a6e3a11", "js/stravaAuth.js": "71c62ea997c4", "js/stravaConfig.js": "a0d7645995e2", "js/stravaData.js": "4d45943824e5", "js/stravaHistory.js": "f1ff33e66fad", "js/stravaImport.js": "1e760d9d89ff", "js/stravaStore.js": "2675308386cc", "js/strength.js": "fcd21b019e55", "js/strengthBuilder.js": "717a727a868e", "js/strengthHistory.js": "f32e73218e6c", "js/strengthLibrary.js": "f8743d844f45", "js/strengthLibraryData.js": "a0885a3f9b4e", "js/strengthSchedule.js": "76ae197d44ea", "js/strengthSession.js": "122fe542f401", "js/strengthWorkout.js": "648540d18cdc", "js/strengthWorkoutMode.js": "411811d04564", "js/stripeBilling.js": "35b86b6e6e6e", "js/svgCharts.js": "e54d422ad77e", "js/todayClient.js": "bc7620c98b5f", "js/trainingPlanGenerator.js": "ec1828c914c0", "js/trainingPlanStrengthIntegration.js": "b3d9b7d065bb", "js/trainingPrograms.js": "23256fee56d2", "js/trends.js": "8ce08c6abb1a", "js/trendsData.js": "6eef58d0d5b3", "js/trendsView.js": "2d2a95bd18b6", "js/ui.js": "ff20b80edffb", "js/updates.js": "30df09940001", "js/userProfile.js": "5d3a53804c29", "js/userSettings.js": "ce787b73ba2a", "js/wearableActivity.js": "6e35ce095abf", "js/wearablePerformance.js": "e4e9a8023554", "js/wearableRecovery.js": "2e0323509c08", "js/weekData.js": "4df1032bcb5a", "js/weekModel.js": "90aa62b41616", "js/weekView.js": "d9c574e9555d", "js/weekly-review.js": "915c6a33ae4d", "js/workoutBuilder.js": "7f251f124842", "js/workoutFuel.js": "953f5c099038", "js/workoutPage.js": "34433a9cebb9", "js/workoutResults.js": "5d284e39a8a9", "manifest.json": "73d874cb2f1b", "marathon.html": "ad5e4c178d62", "more.html": "051bc75c9d0f", "nutrition.html": "fc1ec6b9c2e4", "pace-calculator.html": "ce04afea14b2", "packages.html": "355b6e004af2", "plan.html": "bf7e6239d9b1", "planner.html": "7d1d5ce19071", "privacy.html": "eadf0c56e9fe", "profile.html": "ba93b393d343", "programs.html": "5d7f51cf391a", "running.html": "12411f035560", "schedule.html": "33cf87aafa3d", "settings.html": "990f6f4f1122", "site-check.html": "0e2e7e1a50e2", "soccer.html": "9a421c5302d0", "strength.html": "06f0c9189277", "updates.html": "726aed8e01de", "weekly-review.html": "e3e43ac94321", "workout.html": "a1e1ab43aefc" };
const CDN_PRECACHE = ["https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js"];
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
