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
 const VERSION = "9b0bfd6198c4";
 const PRECACHE = { "75day.html": "7d17d6191fe0", "about.html": "0002a2e8348e", "analytics.html": "baa17897b94a", "apply.html": "93b886941d4b", "brand/sb-mark-forest.svg": "a4931de181b6", "brand/sb-mark.svg": "ce34a98e276e", "brand/sb-tile.svg": "c404fa9d1bc2", "brand/southbound-logo-forest.svg": "74c43339c5f3", "brand/southbound-logo.svg": "870ae3452eb2", "checkin.html": "7bb244225b4b", "client.html": "071f95e3682d", "clients.html": "f2cf812a80d8", "coach.html": "5081f61aed5a", "coaching.html": "d5c171029718", "components/header.html": "492201c372fa", "components/publicHeader.html": "d774d3382afc", "contact.html": "d07c40581817", "cross-training.html": "36cbbeeced78", "css/analytics.css": "2f4e336ec52f", "css/athlete-state.css": "655008025f32", "css/checkin.css": "6a1c7dcf8892", "css/client-hub.css": "1175e01511f8", "css/client-model.css": "47dc8e7a064e", "css/client-profile.css": "2c5783dbf16a", "css/clients.css": "c1d7b8534918", "css/coach.css": "0eb07675bd42", "css/corosCoach.css": "f06fa0c87108", "css/corosData.css": "50e8d521e396", "css/corosIntegration.css": "b9e4f12f29a7", "css/cross-training.css": "92238e3d1112", "css/dashboard.css": "bce0b2677a9d", "css/execution.css": "c82cda5cb4f8", "css/fueling.css": "9b7958368506", "css/gear.css": "66cd5b6f12cb", "css/habits.css": "7342e213b6e6", "css/install.css": "ac0b6404dc5b", "css/intake.css": "0d671e02bf1c", "css/marathon.css": "e2db06eb5aca", "css/my-plan.css": "c0aeba5243ea", "css/nutrition.css": "9e56a5647123", "css/pace-calculator.css": "72d381eaa88b", "css/planning.css": "db67ad8878b5", "css/programs.css": "f54a5c469af4", "css/progress.css": "cf690e4d3c0d", "css/public.css": "2947f36017e5", "css/race-plans.css": "d6d77dff597f", "css/readiness.css": "9c349c13243a", "css/running.css": "33b2f9c17877", "css/schedule.css": "3434740f495d", "css/settings.css": "e1c4c6c4c075", "css/stravaIntegration.css": "cb62c6b53804", "css/strength.css": "2a4650e49e6b", "css/strengthLibrary.css": "9e335442c307", "css/style.css": "30704d2310ea", "css/trends.css": "704b5f7c9633", "css/updates.css": "7ed9230a98b5", "css/week.css": "c944bddc730e", "css/weekly-review.css": "bcbb51b2bd2c", "css/workout.css": "b2aa78df5941", "emoji/sb_adjust.svg": "e35874a966b5", "emoji/sb_big_effort.svg": "6495a31ba8b1", "emoji/sb_check.svg": "6232cb731332", "emoji/sb_coach_eye.svg": "1f9ae7782bd3", "emoji/sb_easy_day.svg": "c2b366ee1f4c", "emoji/sb_finish.svg": "bb12d963250e", "emoji/sb_fuel.svg": "5f18990d25d2", "emoji/sb_great_work.svg": "bb039468e003", "emoji/sb_high_five.svg": "5bab60223e88", "emoji/sb_hydrate.svg": "a1424a085604", "emoji/sb_lets_go.svg": "a5609b470a49", "emoji/sb_locked_in.svg": "cc5cd52b6587", "emoji/sb_long_run.svg": "bd34b16d3d08", "emoji/sb_pr.svg": "5f8e047c6ac6", "emoji/sb_race_day.svg": "36e5fde643d1", "emoji/sb_recovery.svg": "25722d40ea7e", "emoji/sb_scheduled.svg": "2272b9444a0f", "emoji/sb_sleep.svg": "22d45ac24d4d", "emoji/sb_soccer.svg": "0291223a631e", "emoji/sb_southbound.svg": "b1afe8ac46ea", "emoji/sb_strong.svg": "e59440821973", "emoji/sb_survived.svg": "b604942a81ce", "emoji/sb_tired_proud.svg": "300fef72cdcf", "emoji/sb_trail.svg": "c54c37c78e1e", "fonts/bebas-neue-latin-400.woff2": "a7c90c89240c", "fonts/inter-latin-var.woff2": "3100e775e861", "fonts/jetbrains-mono-latin-var.woff2": "18be452724bf", "fonts/saira-latin-800.woff2": "ca7a9220a7b6", "fonts/saira-latin-900-italic.woff2": "41db7434e28b", "fueling.html": "bfdd65acb29d", "gear.html": "7795f4604dea", "google40072741a539d5b7.html": "46e0008c68b6", "habit-icons/ball.svg": "dfe072d0d184", "habit-icons/bible.svg": "3673dc278d2b", "habit-icons/bike.svg": "0924056d4214", "habit-icons/breathe.svg": "c42fe0e5bf5a", "habit-icons/check.svg": "6232cb731332", "habit-icons/coffee.svg": "716b3960d6cf", "habit-icons/cold.svg": "8863dd839ba6", "habit-icons/core.svg": "01f55967dc1e", "habit-icons/dog.svg": "11ff79c6295d", "habit-icons/family.svg": "c9079107a588", "habit-icons/fasting.svg": "3cb0c83a2032", "habit-icons/friends.svg": "d927f37953ee", "habit-icons/fruit.svg": "0883e51f41e9", "habit-icons/goal.svg": "e88e34bfc4cd", "habit-icons/gratitude.svg": "0944f76de211", "habit-icons/journal.svg": "b400c66f0f0e", "habit-icons/love.svg": "6ddfa4ff34d4", "habit-icons/mealprep.svg": "14d835a4dc53", "habit-icons/meals.svg": "15588d8e9661", "habit-icons/meditate.svg": "6968cd959f22", "habit-icons/money.svg": "476cbb25e8c9", "habit-icons/music.svg": "002d6ed3b01e", "habit-icons/nature.svg": "a4cabbe150bc", "habit-icons/noalcohol.svg": "0ff0cce39da8", "habit-icons/nosugar.svg": "546357099fc7", "habit-icons/pray.svg": "58833e69b510", "habit-icons/protein.svg": "49252ed9717b", "habit-icons/read.svg": "74df63280210", "habit-icons/run.svg": "86e44a548dfb", "habit-icons/sauna.svg": "04add853735d", "habit-icons/screens.svg": "5cbb3c31e31f", "habit-icons/sleep.svg": "639bda34583e", "habit-icons/star.svg": "a514134b76c9", "habit-icons/steps.svg": "b8d940eef6aa", "habit-icons/strength.svg": "e59440821973", "habit-icons/stretch.svg": "970b9de7cfc2", "habit-icons/study.svg": "226dd19a88c3", "habit-icons/sun.svg": "5f42cd693cd6", "habit-icons/swim.svg": "5610c3300e76", "habit-icons/teeth.svg": "943e045c0c1a", "habit-icons/tidy.svg": "61fd17587396", "habit-icons/veggies.svg": "aaeced722a0b", "habit-icons/vitamins.svg": "a2eb2116f338", "habit-icons/water.svg": "333957146a64", "habit-icons/weigh.svg": "3cd851367c92", "habit-icons/work.svg": "b170559704b2", "habit-icons/workout.svg": "105a25014658", "habits.html": "ee7a07723662", "home.html": "d4a2565ee4e3", "icons/apple-touch-icon.png": "fdcea045a12c", "icons/favicon-32.png": "197bd214730d", "icons/icon-192.png": "17f5fa972d82", "icons/icon-512.png": "236b9f965f1d", "icons/icon-maskable-512.png": "f6ffd8417443", "icons/install-qr.svg": "cc50ce72bf4c", "icons/running-bg-map.svg": "e51158d2f6a5", "index.html": "7770d159a5ee", "install.html": "0c3c14759d12", "js/activeProgramSources.js": "3f497e8f5247", "js/analytics.js": "87f703dbf70c", "js/analyticsLayout.js": "4597e2f85612", "js/analyticsSummary.js": "0bf2de2c2718", "js/app.js": "75eddea59491", "js/applicationForm.js": "07d88abaf885", "js/applications.js": "297b7245d283", "js/apply.js": "e23cdf930be4", "js/athleteData.js": "dcbc419ad3e7", "js/athleteLedger.js": "3b58b2a94ec4", "js/athleteParams.js": "3b71d513f6f8", "js/athleteShare.js": "eedd68fc5d72", "js/athleteSources.js": "97ccd72eca87", "js/athleteState.js": "cdb95f39ab84", "js/athleteStateView.js": "a1c78fc8888b", "js/auth.js": "3e6926cdfcf2", "js/barcodeScanner.js": "22ee051e9e89", "js/calendarButton.js": "a3a84920492c", "js/calendarExport.js": "80e0f4eb104d", "js/changeRequestDialog.js": "33918ae04b85", "js/changeRequests.js": "f69a9b56f2d1", "js/checkin.js": "5c39a315fd29", "js/checkinView.js": "79bb7ddf3c88", "js/checkins.js": "6737f2c9bc30", "js/clientAssignmentModel.js": "32028f62e116", "js/clientDirectory.js": "70206fc60806", "js/clientHub.js": "4bac0a45c9da", "js/clientModel.js": "47ca6ed70a96", "js/clientModelTab.js": "1791cfb634b7", "js/clientNotes.js": "2bb358050921", "js/clientPackageCard.js": "c16a9f65876f", "js/clientPackageModel.js": "41f54580980e", "js/clientPackages.js": "fdc54fd0ff5b", "js/clientProfileForm.js": "dd7df6af23e5", "js/clientProgress.js": "877fa7885c4b", "js/clientRecordSchema.js": "4fe08935ec1a", "js/clientRecords.js": "93ce8de3da75", "js/clientSummary.js": "b3280b8baa71", "js/clientTimeline.js": "bcf911282ba9", "js/clients.js": "baa10199337f", "js/cloudSync.js": "9faee3d747b2", "js/coach.js": "4e60f4baea9b", "js/coachAccess.js": "b15321d10425", "js/coachCard.js": "affc48a7fed6", "js/coachLibrary.js": "57b7348440a8", "js/coachNotesLocal.js": "eee6fc4a43d7", "js/coachPlanGenerator.js": "b64bfe7788f4", "js/coachPlanStore.js": "62c2dd9fb7e7", "js/coachPlanSync.js": "18a1f9cc3f64", "js/coachToday.js": "452724676eee", "js/coachingPlanModel.js": "600f2185c235", "js/coachingPlans.js": "738650d3ff8e", "js/contact.js": "1eeeda2d7f49", "js/corosAuth.js": "d62a7089233a", "js/corosAutoSend.js": "8a97725b2d2e", "js/corosClient.js": "12cff09eec0f", "js/corosData.js": "074cda057269", "js/corosDiagnostic.js": "f1b652c00670", "js/corosHealth.js": "94610cda7b2b", "js/corosHistory.js": "694aee1e1b41", "js/corosMetrics.js": "c6e41c7ac5d2", "js/corosParse.js": "cec7c08f79bc", "js/corosRuns.js": "4978f441b1d4", "js/corosSend.js": "d76a8accc06d", "js/corosSettings.js": "aa0cd95c8758", "js/corosStatus.js": "2766d6e56868", "js/corosTools.js": "1adae227aae2", "js/corosWorkout.js": "47b1f31e4d9a", "js/cross-training.js": "c4f05badc93e", "js/dashboardData.js": "3b2df7b54aff", "js/decisionCard.js": "189896f5cec6", "js/effortCard.js": "f0986a5e6c15", "js/effortScale.js": "7f7188c5e058", "js/emailNotify.js": "21ff01ab2f20", "js/emoji.js": "ca79cda2b711", "js/emojiPicker.js": "e8f504962b70", "js/executionShare.js": "29cba6222790", "js/executionView.js": "d827eaf5bea4", "js/exerciseSearch.js": "0be94a6dc23b", "js/featuredTraining.js": "4aa46e2fd804", "js/featuredTrainingModel.js": "52db59c26251", "js/feedbackModel.js": "3e8a4948e420", "js/firebase.js": "c7270c6c3cb3", "js/firestore.js": "a39d3ceb6608", "js/fitParse.js": "78d43d773a57", "js/foodSearch.js": "b303701a30fe", "js/fuelSchedule.js": "7a3494739629", "js/fuelScheduleView.js": "0d08aa67d693", "js/fuelTargets.js": "824e46987299", "js/fueling.js": "1324b118db3f", "js/gear.js": "eb30f8111e42", "js/habitIconPicker.js": "42cf8ed45a4d", "js/habitIconSet.js": "e898f2e319c4", "js/habits.js": "cd56256324f4", "js/healthReviewed.js": "95455d7e64ee", "js/icons.js": "26ac0224d3e5", "js/inquiries.js": "1a9362b8e12c", "js/install.js": "6896f68d20b6", "js/intakeFlow.js": "1c4b785af366", "js/intakeGuide.js": "7d40668bb962", "js/loadCard.js": "5cc4f746164d", "js/loadHeader.js": "2975674cd9bf", "js/loadPublicHeader.js": "b5ffc901add1", "js/loadState.js": "2aa574ac19c7", "js/marathonCoros.js": "c99c6e0515b3", "js/marathonCorosButton.js": "c7729fe2453f", "js/marathonData.js": "0244912586bd", "js/myPlan.js": "f3dbbd443d51", "js/navAccess.js": "f1ff949e3679", "js/netStatus.js": "d4e8fada44a1", "js/nutrition.js": "9ccbb7911b62", "js/nutritionGoals.js": "fdc181c33f1a", "js/offlineWrite.js": "49f551296a50", "js/pace-calculator.js": "bd2a8419b2b3", "js/packageCatalog.js": "cd485d74c6e0", "js/personalRecords.js": "552f645b0ec9", "js/planGenerateDialogs.js": "a1a886d41b00", "js/planLaps.js": "7ed9bd5d5e29", "js/planOps.js": "84288ac16423", "js/planOutcome.js": "9ab8d3789bd1", "js/planPrompt.js": "9deb986993f3", "js/planPromptDialogs.js": "fdfb4e38f7b9", "js/planRelease.js": "289e67c5041c", "js/planShape.js": "ddadec632b2f", "js/planWindow.js": "45188cbb26a4", "js/planWorkspace.js": "9d795bbe625b", "js/plannerEvents.js": "08f25cee96db", "js/planningBrief.js": "ef9b322bf6e9", "js/planningContext.js": "1d6275de8408", "js/planningCycle.js": "b3b1dff54a37", "js/planningCycles.js": "aa5ddf2f0880", "js/planningData.js": "40bb440884d4", "js/planningPage.js": "2915740d4282", "js/planningView.js": "3c6a4b497613", "js/profile.js": "1ca2b9db681a", "js/profileCheckCard.js": "95c654db9bed", "js/profileChecks.js": "55d0c20df72c", "js/programs.js": "6da40514ce79", "js/progressView.js": "f1aec088de66", "js/raceBacktest.js": "a2296165b6a0", "js/raceCapability.js": "48d93d636774", "js/raceCapabilityCard.js": "a59ed5be8f81", "js/racePlanEditor.js": "6bcb58060cac", "js/racePlanGenerator.js": "b1a5f567ec36", "js/racePlanStrengthIntegration.js": "3260d2f3f2a7", "js/racePlans.js": "33ee8b7fd77b", "js/racesCard.js": "ae47d4c8d943", "js/readiness.js": "0791692f6de2", "js/readinessBacktest.js": "73f636e12b59", "js/readinessCard.js": "bcf5d05ef48d", "js/readinessData.js": "51c5afdafb6b", "js/readinessV2.js": "a5bcad0a6586", "js/readinessV2Data.js": "21bcef754c77", "js/registerSW.js": "790992fae5bb", "js/role.js": "013795db34f2", "js/runWalk.js": "54a8543a474f", "js/runWorkout.js": "9bf2760d6783", "js/runningCalendar.js": "4ca0abf4f839", "js/runningLog.js": "17719c3a4acd", "js/runningProgramCalendar.js": "4e27dfdcf1ea", "js/runningPrograms.js": "746cfdef0844", "js/schedule.js": "a2d164b31cd1", "js/scheduling.js": "7b5aad51f2ac", "js/services.js": "90680ebb805d", "js/sessionDose.js": "25c1a4f742e7", "js/sessionLogs.js": "655b5d2cb74b", "js/sessionModel.js": "d505d3d47629", "js/settings.js": "a0feb3311ff9", "js/stravaArchive.js": "f3362a6e3a11", "js/stravaAuth.js": "71c62ea997c4", "js/stravaConfig.js": "a0d7645995e2", "js/stravaData.js": "4d45943824e5", "js/stravaHistory.js": "f1ff33e66fad", "js/stravaImport.js": "1e760d9d89ff", "js/stravaStore.js": "2675308386cc", "js/strength.js": "426c84d89e3f", "js/strengthBuilder.js": "717a727a868e", "js/strengthHistory.js": "f32e73218e6c", "js/strengthLibrary.js": "f8743d844f45", "js/strengthLibraryData.js": "a0885a3f9b4e", "js/strengthSchedule.js": "76ae197d44ea", "js/strengthSession.js": "59878a514958", "js/strengthWorkout.js": "648540d18cdc", "js/strengthWorkoutMode.js": "411811d04564", "js/stripeBilling.js": "35b86b6e6e6e", "js/svgCharts.js": "2c46820776f3", "js/thisWeekCard.js": "747a6193e8a0", "js/todayClient.js": "65ee77bf6fdb", "js/todayGlance.js": "f1a7c14d15a4", "js/todayLayout.js": "238decf45546", "js/trainingPlanGenerator.js": "ec1828c914c0", "js/trainingPlanStrengthIntegration.js": "b3d9b7d065bb", "js/trainingPrograms.js": "23256fee56d2", "js/trainingResponse.js": "1cf4346995c8", "js/trends.js": "492b7c554ff5", "js/trendsData.js": "c0e160a504b7", "js/trendsView.js": "1df69afdd5f3", "js/ui.js": "cc66e005fc31", "js/updates.js": "30df09940001", "js/userProfile.js": "521b79809a0f", "js/userSettings.js": "ce787b73ba2a", "js/vdot.js": "ae8846a72964", "js/wearableActivity.js": "6e35ce095abf", "js/wearablePerformance.js": "e4e9a8023554", "js/wearableRecovery.js": "2e0323509c08", "js/weekData.js": "4df1032bcb5a", "js/weekModel.js": "356fb49232ca", "js/weekStory.js": "4cda07fa76fa", "js/weekView.js": "30c37af56739", "js/weekly-review.js": "2caaa054279f", "js/weeklyDecision.js": "d400f4adb037", "js/weeklyDecisionData.js": "c57ecc678bec", "js/weeklyLoad.js": "4057ca4a2362", "js/weeklyStory.js": "fc272ac18115", "js/workoutBuilder.js": "7f251f124842", "js/workoutExecution.js": "14f89b9da437", "js/workoutFuel.js": "953f5c099038", "js/workoutPage.js": "bfbff035700e", "js/workoutResults.js": "5d284e39a8a9", "manifest.json": "73d874cb2f1b", "marathon.html": "ad5e4c178d62", "more.html": "1d1100d96863", "nutrition.html": "fc1ec6b9c2e4", "pace-calculator.html": "ce04afea14b2", "packages.html": "355b6e004af2", "plan.html": "bf7e6239d9b1", "planner.html": "7d1d5ce19071", "planning.html": "d648258dd29a", "privacy.html": "12ac7bf06229", "profile.html": "ba93b393d343", "programs.html": "5d7f51cf391a", "progress.html": "d7dcb7f30eee", "running.html": "12411f035560", "schedule.html": "084232fa3ddd", "settings.html": "4a2dde907494", "site-check.html": "0e2e7e1a50e2", "soccer.html": "9a421c5302d0", "strength.html": "06f0c9189277", "updates.html": "726aed8e01de", "weekly-review.html": "883fc49ff2f8", "workout.html": "6bdb0e62514f" };
 const CDN_PRECACHE = ["https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js"];
 // ---- end precache ----
2026-10-07T19:35:50.6696131Z   actual: |-
 // ---- precache (written by `npm run manifest`; don't edit by hand) ----
 const VERSION = "5cb17c0334c7";
 const PRECACHE = { "75day.html": "7d17d6191fe0", "about.html": "0002a2e8348e", "analytics.html": "baa17897b94a", "apply.html": "93b886941d4b", "brand/sb-mark-forest.svg": "a4931de181b6", "brand/sb-mark.svg": "ce34a98e276e", "brand/sb-tile.svg": "c404fa9d1bc2", "brand/southbound-logo-forest.svg": "74c43339c5f3", "brand/southbound-logo.svg": "870ae3452eb2", "checkin.html": "7bb244225b4b", "client.html": "071f95e3682d", "clients.html": "f2cf812a80d8", "coach.html": "5081f61aed5a", "coaching.html": "d5c171029718", "components/header.html": "492201c372fa", "components/publicHeader.html": "d774d3382afc", "contact.html": "d07c40581817", "cross-training.html": "36cbbeeced78", "css/analytics.css": "2f4e336ec52f", "css/athlete-state.css": "655008025f32", "css/checkin.css": "6a1c7dcf8892", "css/client-hub.css": "1175e01511f8", "css/client-model.css": "47dc8e7a064e", "css/client-profile.css": "2c5783dbf16a", "css/clients.css": "c1d7b8534918", "css/coach.css": "0eb07675bd42", "css/corosCoach.css": "f06fa0c87108", "css/corosData.css": "50e8d521e396", "css/corosIntegration.css": "b9e4f12f29a7", "css/cross-training.css": "92238e3d1112", "css/dashboard.css": "bce0b2677a9d", "css/execution.css": "c82cda5cb4f8", "css/fueling.css": "9b7958368506", "css/gear.css": "66cd5b6f12cb", "css/habits.css": "7342e213b6e6", "css/install.css": "ac0b6404dc5b", "css/intake.css": "0d671e02bf1c", "css/marathon.css": "e2db06eb5aca", "css/my-plan.css": "c0aeba5243ea", "css/nutrition.css": "9e56a5647123", "css/pace-calculator.css": "72d381eaa88b", "css/planning.css": "db67ad8878b5", "css/programs.css": "f54a5c469af4", "css/progress.css": "cf690e4d3c0d", "css/public.css": "2947f36017e5", "css/race-plans.css": "d6d77dff597f", "css/readiness.css": "9c349c13243a", "css/running.css": "33b2f9c17877", "css/schedule.css": "3434740f495d", "css/settings.css": "e1c4c6c4c075", "css/stravaIntegration.css": "cb62c6b53804", "css/strength.css": "f584e0030da8", "css/strengthLibrary.css": "9e335442c307", "css/style.css": "30704d2310ea", "css/trends.css": "704b5f7c9633", "css/updates.css": "7ed9230a98b5", "css/week.css": "c944bddc730e", "css/weekly-review.css": "bcbb51b2bd2c", "css/workout.css": "b2aa78df5941", "emoji/sb_adjust.svg": "e35874a966b5", "emoji/sb_big_effort.svg": "6495a31ba8b1", "emoji/sb_check.svg": "6232cb731332", "emoji/sb_coach_eye.svg": "1f9ae7782bd3", "emoji/sb_easy_day.svg": "c2b366ee1f4c", "emoji/sb_finish.svg": "bb12d963250e", "emoji/sb_fuel.svg": "5f18990d25d2", "emoji/sb_great_work.svg": "bb039468e003", "emoji/sb_high_five.svg": "5bab60223e88", "emoji/sb_hydrate.svg": "a1424a085604", "emoji/sb_lets_go.svg": "a5609b470a49", "emoji/sb_locked_in.svg": "cc5cd52b6587", "emoji/sb_long_run.svg": "bd34b16d3d08", "emoji/sb_pr.svg": "5f8e047c6ac6", "emoji/sb_race_day.svg": "36e5fde643d1", "emoji/sb_recovery.svg": "25722d40ea7e", "emoji/sb_scheduled.svg": "2272b9444a0f", "emoji/sb_sleep.svg": "22d45ac24d4d", "emoji/sb_soccer.svg": "0291223a631e", "emoji/sb_southbound.svg": "b1afe8ac46ea", "emoji/sb_strong.svg": "e59440821973", "emoji/sb_survived.svg": "b604942a81ce", "emoji/sb_tired_proud.svg": "300fef72cdcf", "emoji/sb_trail.svg": "c54c37c78e1e", "fonts/bebas-neue-latin-400.woff2": "a7c90c89240c", "fonts/inter-latin-var.woff2": "3100e775e861", "fonts/jetbrains-mono-latin-var.woff2": "18be452724bf", "fonts/saira-latin-800.woff2": "ca7a9220a7b6", "fonts/saira-latin-900-italic.woff2": "41db7434e28b", "fueling.html": "bfdd65acb29d", "gear.html": "7795f4604dea", "google40072741a539d5b7.html": "46e0008c68b6", "habit-icons/ball.svg": "dfe072d0d184", "habit-icons/bible.svg": "3673dc278d2b", "habit-icons/bike.svg": "0924056d4214", "habit-icons/breathe.svg": "c42fe0e5bf5a", "habit-icons/check.svg": "6232cb731332", "habit-icons/coffee.svg": "716b3960d6cf", "habit-icons/cold.svg": "8863dd839ba6", "habit-icons/core.svg": "01f55967dc1e", "habit-icons/dog.svg": "11ff79c6295d", "habit-icons/family.svg": "c9079107a588", "habit-icons/fasting.svg": "3cb0c83a2032", "habit-icons/friends.svg": "d927f37953ee", "habit-icons/fruit.svg": "0883e51f41e9", "habit-icons/goal.svg": "e88e34bfc4cd", "habit-icons/gratitude.svg": "0944f76de211", "habit-icons/journal.svg": "b400c66f0f0e", "habit-icons/love.svg": "6ddfa4ff34d4", "habit-icons/mealprep.svg": "14d835a4dc53", "habit-icons/meals.svg": "15588d8e9661", "habit-icons/meditate.svg": "6968cd959f22", "habit-icons/money.svg": "476cbb25e8c9", "habit-icons/music.svg": "002d6ed3b01e", "habit-icons/nature.svg": "a4cabbe150bc", "habit-icons/noalcohol.svg": "0ff0cce39da8", "habit-icons/nosugar.svg": "546357099fc7", "habit-icons/pray.svg": "58833e69b510", "habit-icons/protein.svg": "49252ed9717b", "habit-icons/read.svg": "74df63280210", "habit-icons/run.svg": "86e44a548dfb", "habit-icons/sauna.svg": "04add853735d", "habit-icons/screens.svg": "5cbb3c31e31f", "habit-icons/sleep.svg": "639bda34583e", "habit-icons/star.svg": "a514134b76c9", "habit-icons/steps.svg": "b8d940eef6aa", "habit-icons/strength.svg": "e59440821973", "habit-icons/stretch.svg": "970b9de7cfc2", "habit-icons/study.svg": "226dd19a88c3", "habit-icons/sun.svg": "5f42cd693cd6", "habit-icons/swim.svg": "5610c3300e76", "habit-icons/teeth.svg": "943e045c0c1a", "habit-icons/tidy.svg": "61fd17587396", "habit-icons/veggies.svg": "aaeced722a0b", "habit-icons/vitamins.svg": "a2eb2116f338", "habit-icons/water.svg": "333957146a64", "habit-icons/weigh.svg": "3cd851367c92", "habit-icons/work.svg": "b170559704b2", "habit-icons/workout.svg": "105a25014658", "habits.html": "ee7a07723662", "home.html": "d4a2565ee4e3", "icons/apple-touch-icon.png": "fdcea045a12c", "icons/favicon-32.png": "197bd214730d", "icons/icon-192.png": "17f5fa972d82", "icons/icon-512.png": "236b9f965f1d", "icons/icon-maskable-512.png": "f6ffd8417443", "icons/install-qr.svg": "cc50ce72bf4c", "icons/running-bg-map.svg": "e51158d2f6a5", "index.html": "7770d159a5ee", "install.html": "0c3c14759d12", "js/activeProgramSources.js": "3f497e8f5247", "js/analytics.js": "87f703dbf70c", "js/analyticsLayout.js": "4597e2f85612", "js/analyticsSummary.js": "0bf2de2c2718", "js/app.js": "75eddea59491", "js/applicationForm.js": "07d88abaf885", "js/applications.js": "297b7245d283", "js/apply.js": "e23cdf930be4", "js/athleteData.js": "dcbc419ad3e7", "js/athleteLedger.js": "3b58b2a94ec4", "js/athleteParams.js": "3b71d513f6f8", "js/athleteShare.js": "eedd68fc5d72", "js/athleteSources.js": "97ccd72eca87", "js/athleteState.js": "cdb95f39ab84", "js/athleteStateView.js": "a1c78fc8888b", "js/auth.js": "3e6926cdfcf2", "js/barcodeScanner.js": "22ee051e9e89", "js/calendarButton.js": "a3a84920492c", "js/calendarExport.js": "80e0f4eb104d", "js/changeRequestDialog.js": "33918ae04b85", "js/changeRequests.js": "f69a9b56f2d1", "js/checkin.js": "5c39a315fd29", "js/checkinView.js": "79bb7ddf3c88", "js/checkins.js": "6737f2c9bc30", "js/clientAssignmentModel.js": "32028f62e116", "js/clientDirectory.js": "70206fc60806", "js/clientHub.js": "4bac0a45c9da", "js/clientModel.js": "47ca6ed70a96", "js/clientModelTab.js": "1791cfb634b7", "js/clientNotes.js": "2bb358050921", "js/clientPackageCard.js": "c16a9f65876f", "js/clientPackageModel.js": "41f54580980e", "js/clientPackages.js": "fdc54fd0ff5b", "js/clientProfileForm.js": "dd7df6af23e5", "js/clientProgress.js": "877fa7885c4b", "js/clientRecordSchema.js": "4fe08935ec1a", "js/clientRecords.js": "93ce8de3da75", "js/clientSummary.js": "b3280b8baa71", "js/clientTimeline.js": "bcf911282ba9", "js/clients.js": "baa10199337f", "js/cloudSync.js": "9faee3d747b2", "js/coach.js": "4e60f4baea9b", "js/coachAccess.js": "b15321d10425", "js/coachCard.js": "affc48a7fed6", "js/coachLibrary.js": "57b7348440a8", "js/coachNotesLocal.js": "eee6fc4a43d7", "js/coachPlanGenerator.js": "b64bfe7788f4", "js/coachPlanStore.js": "62c2dd9fb7e7", "js/coachPlanSync.js": "18a1f9cc3f64", "js/coachToday.js": "452724676eee", "js/coachingPlanModel.js": "600f2185c235", "js/coachingPlans.js": "738650d3ff8e", "js/contact.js": "1eeeda2d7f49", "js/corosAuth.js": "d62a7089233a", "js/corosAutoSend.js": "8a97725b2d2e", "js/corosClient.js": "12cff09eec0f", "js/corosData.js": "074cda057269", "js/corosDiagnostic.js": "f1b652c00670", "js/corosHealth.js": "94610cda7b2b", "js/corosHistory.js": "694aee1e1b41", "js/corosMetrics.js": "c6e41c7ac5d2", "js/corosParse.js": "cec7c08f79bc", "js/corosRuns.js": "4978f441b1d4", "js/corosSend.js": "d76a8accc06d", "js/corosSettings.js": "aa0cd95c8758", "js/corosStatus.js": "2766d6e56868", "js/corosTools.js": "1adae227aae2", "js/corosWorkout.js": "47b1f31e4d9a", "js/cross-training.js": "c4f05badc93e", "js/dashboardData.js": "3b2df7b54aff", "js/decisionCard.js": "189896f5cec6", "js/effortCard.js": "f0986a5e6c15", "js/effortScale.js": "7f7188c5e058", "js/emailNotify.js": "21ff01ab2f20", "js/emoji.js": "ca79cda2b711", "js/emojiPicker.js": "e8f504962b70", "js/executionShare.js": "29cba6222790", "js/executionView.js": "d827eaf5bea4", "js/exerciseSearch.js": "0be94a6dc23b", "js/featuredTraining.js": "4aa46e2fd804", "js/featuredTrainingModel.js": "52db59c26251", "js/feedbackModel.js": "3e8a4948e420", "js/firebase.js": "c7270c6c3cb3", "js/firestore.js": "a39d3ceb6608", "js/fitParse.js": "78d43d773a57", "js/foodSearch.js": "b303701a30fe", "js/fuelSchedule.js": "7a3494739629", "js/fuelScheduleView.js": "0d08aa67d693", "js/fuelTargets.js": "824e46987299", "js/fueling.js": "1324b118db3f", "js/gear.js": "eb30f8111e42", "js/habitIconPicker.js": "42cf8ed45a4d", "js/habitIconSet.js": "e898f2e319c4", "js/habits.js": "cd56256324f4", "js/healthReviewed.js": "95455d7e64ee", "js/icons.js": "26ac0224d3e5", "js/inquiries.js": "1a9362b8e12c", "js/install.js": "6896f68d20b6", "js/intakeFlow.js": "1c4b785af366", "js/intakeGuide.js": "7d40668bb962", "js/loadCard.js": "5cc4f746164d", "js/loadHeader.js": "2975674cd9bf", "js/loadPublicHeader.js": "b5ffc901add1", "js/loadState.js": "2aa574ac19c7", "js/marathonCoros.js": "c99c6e0515b3", "js/marathonCorosButton.js": "c7729fe2453f", "js/marathonData.js": "0244912586bd", "js/myPlan.js": "f3dbbd443d51", "js/navAccess.js": "f1ff949e3679", "js/netStatus.js": "d4e8fada44a1", "js/nutrition.js": "9ccbb7911b62", "js/nutritionGoals.js": "fdc181c33f1a", "js/offlineWrite.js": "49f551296a50", "js/pace-calculator.js": "bd2a8419b2b3", "js/packageCatalog.js": "cd485d74c6e0", "js/personalRecords.js": "552f645b0ec9", "js/planGenerateDialogs.js": "a1a886d41b00", "js/planLaps.js": "7ed9bd5d5e29", "js/planOps.js": "84288ac16423", "js/planOutcome.js": "9ab8d3789bd1", "js/planPrompt.js": "9deb986993f3", "js/planPromptDialogs.js": "fdfb4e38f7b9", "js/planRelease.js": "289e67c5041c", "js/planShape.js": "ddadec632b2f", "js/planWindow.js": "45188cbb26a4", "js/planWorkspace.js": "9d795bbe625b", "js/plannerEvents.js": "08f25cee96db", "js/planningBrief.js": "ef9b322bf6e9", "js/planningContext.js": "1d6275de8408", "js/planningCycle.js": "b3b1dff54a37", "js/planningCycles.js": "aa5ddf2f0880", "js/planningData.js": "40bb440884d4", "js/planningPage.js": "2915740d4282", "js/planningView.js": "3c6a4b497613", "js/profile.js": "1ca2b9db681a", "js/profileCheckCard.js": "95c654db9bed", "js/profileChecks.js": "55d0c20df72c", "js/programs.js": "6da40514ce79", "js/progressView.js": "f1aec088de66", "js/raceBacktest.js": "a2296165b6a0", "js/raceCapability.js": "48d93d636774", "js/raceCapabilityCard.js": "a59ed5be8f81", "js/racePlanEditor.js": "6bcb58060cac", "js/racePlanGenerator.js": "b1a5f567ec36", "js/racePlanStrengthIntegration.js": "3260d2f3f2a7", "js/racePlans.js": "33ee8b7fd77b", "js/racesCard.js": "ae47d4c8d943", "js/readiness.js": "0791692f6de2", "js/readinessBacktest.js": "73f636e12b59", "js/readinessCard.js": "bcf5d05ef48d", "js/readinessData.js": "51c5afdafb6b", "js/readinessV2.js": "a5bcad0a6586", "js/readinessV2Data.js": "21bcef754c77", "js/registerSW.js": "790992fae5bb", "js/role.js": "013795db34f2", "js/runWalk.js": "54a8543a474f", "js/runWorkout.js": "9bf2760d6783", "js/runningCalendar.js": "4ca0abf4f839", "js/runningLog.js": "17719c3a4acd", "js/runningProgramCalendar.js": "4e27dfdcf1ea", "js/runningPrograms.js": "746cfdef0844", "js/schedule.js": "a2d164b31cd1", "js/scheduling.js": "7b5aad51f2ac", "js/services.js": "90680ebb805d", "js/sessionDose.js": "25c1a4f742e7", "js/sessionLogs.js": "655b5d2cb74b", "js/sessionModel.js": "d505d3d47629", "js/settings.js": "a0feb3311ff9", "js/stravaArchive.js": "f3362a6e3a11", "js/stravaAuth.js": "71c62ea997c4", "js/stravaConfig.js": "a0d7645995e2", "js/stravaData.js": "4d45943824e5", "js/stravaHistory.js": "f1ff33e66fad", "js/stravaImport.js": "1e760d9d89ff", "js/stravaStore.js": "2675308386cc", "js/strength.js": "fcd21b019e55", "js/strengthBuilder.js": "717a727a868e", "js/strengthHistory.js": "f32e73218e6c", "js/strengthLibrary.js": "f8743d844f45", "js/strengthLibraryData.js": "a0885a3f9b4e", "js/strengthSchedule.js": "76ae197d44ea", "js/strengthSession.js": "59878a514958", "js/strengthWorkout.js": "648540d18cdc", "js/strengthWorkoutMode.js": "411811d04564", "js/stripeBilling.js": "35b86b6e6e6e", "js/svgCharts.js": "2c46820776f3", "js/thisWeekCard.js": "747a6193e8a0", "js/todayClient.js": "65ee77bf6fdb", "js/todayGlance.js": "f1a7c14d15a4", "js/todayLayout.js": "238decf45546", "js/trainingPlanGenerator.js": "ec1828c914c0", "js/trainingPlanStrengthIntegration.js": "b3d9b7d065bb", "js/trainingPrograms.js": "23256fee56d2", "js/trainingResponse.js": "1cf4346995c8", "js/trends.js": "492b7c554ff5", "js/trendsData.js": "c0e160a504b7", "js/trendsView.js": "1df69afdd5f3", "js/ui.js": "cc66e005fc31", "js/updates.js": "30df09940001", "js/userProfile.js": "521b79809a0f", "js/userSettings.js": "ce787b73ba2a", "js/vdot.js": "ae8846a72964", "js/wearableActivity.js": "6e35ce095abf", "js/wearablePerformance.js": "e4e9a8023554", "js/wearableRecovery.js": "2e0323509c08", "js/weekData.js": "4df1032bcb5a", "js/weekModel.js": "356fb49232ca", "js/weekStory.js": "4cda07fa76fa", "js/weekView.js": "30c37af56739", "js/weekly-review.js": "2caaa054279f", "js/weeklyDecision.js": "d400f4adb037", "js/weeklyDecisionData.js": "c57ecc678bec", "js/weeklyLoad.js": "4057ca4a2362", "js/weeklyStory.js": "fc272ac18115", "js/workoutBuilder.js": "7f251f124842", "js/workoutExecution.js": "14f89b9da437", "js/workoutFuel.js": "953f5c099038", "js/workoutPage.js": "bfbff035700e", "js/workoutResults.js": "5d284e39a8a9", "manifest.json": "73d874cb2f1b", "marathon.html": "ad5e4c178d62", "more.html": "1d1100d96863", "nutrition.html": "fc1ec6b9c2e4", "pace-calculator.html": "ce04afea14b2", "packages.html": "355b6e004af2", "plan.html": "bf7e6239d9b1", "planner.html": "7d1d5ce19071", "planning.html": "d648258dd29a", "privacy.html": "12ac7bf06229", "profile.html": "ba93b393d343", "programs.html": "5d7f51cf391a", "progress.html": "d7dcb7f30eee", "running.html": "12411f035560", "schedule.html": "084232fa3ddd", "settings.html": "4a2dde907494", "site-check.html": "0e2e7e1a50e2", "soccer.html": "9a421c5302d0", "strength.html": "06f0c9189277", "updates.html": "726aed8e01de", "weekly-review.html": "883fc49ff2f8", "workout.html": "6bdb0e62514f" };
 const CDN_PRECACHE = ["https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js","https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js"];
 // ---- end precache ----
2026-10-07T19:35:50.6805298Z   operator: 'strictEqual'
2026-10-07T19:35:50.6805544Z   stack: |-
 TestContext.<anonymous> (file:///home/runner/work/eddie-dashboard/eddie-dashboard/tests/static.test.mjs:40:12)
 Test.runInAsyncScope (node:async_hooks:206:9)
 Test.run (node:internal/test_runner/test:796:25)
 Test.processPendingSubtests (node:internal/test_runner/test:526:18)
 Test.postRun (node:internal/test_runner/test:889:19)
 Test.run (node:internal/test_runner/test:835:12)
 async Test.processPendingSubtests (node:internal/test_runner/test:526:7)
2026-10-07T19:35:50.6809763Z   ...
2026-10-07T19:35:50.6810127Z # Subtest: every script parses
2026-10-07T19:35:50.6810408Z ok 434 - every script parses
2026-10-07T19:35:50.6810658Z   ---
2026-10-07T19:35:50.6810860Z   duration_ms: 6170.896888
2026-10-07T19:35:50.6811081Z   ...
2026-10-07T19:35:50.6811472Z # Subtest: every local link, script, stylesheet and image in the HTML exists
2026-10-07T19:35:50.6812067Z ok 435 - every local link, script, stylesheet and image in the HTML exists
2026-10-07T19:35:50.6812441Z   ---
2026-10-07T19:35:50.6812633Z   duration_ms: 7.326521
2026-10-07T19:35:50.6812855Z   ...
2026-10-07T19:35:50.6813178Z # Subtest: every relative JS import points at a real module
2026-10-07T19:35:50.6813635Z ok 436 - every relative JS import points at a real module
2026-10-07T19:35:50.6813953Z   ---
2026-10-07T19:35:50.6814146Z   duration_ms: 19.898955
2026-10-07T19:35:50.6814365Z   ...
2026-10-07T19:35:50.6814701Z # Subtest: logout clears known account-sensitive browser storage
2026-10-07T19:35:50.6815201Z ok 437 - logout clears known account-sensitive browser storage
2026-10-07T19:35:50.6815528Z   ---
2026-10-07T19:35:50.6815722Z   duration_ms: 0.522904
2026-10-07T19:35:50.6815943Z   ...
2026-10-07T19:35:50.6816229Z # Subtest: auth consumers wait for account isolation
2026-10-07T19:35:50.6816631Z ok 438 - auth consumers wait for account isolation
2026-10-07T19:35:50.6816935Z   ---
2026-10-07T19:35:50.6817124Z   duration_ms: 0.387923
2026-10-07T19:35:50.6817334Z   ...
2026-10-07T19:35:50.6817715Z # Subtest: client profiles repair their directory projection when loaded
2026-10-07T19:35:50.6818263Z ok 439 - client profiles repair their directory projection when loaded
2026-10-07T19:35:50.6818615Z   ---
2026-10-07T19:35:50.6819041Z   duration_ms: 0.265946
2026-10-07T19:35:50.6819358Z   ...
2026-10-07T19:35:50.6819737Z # Subtest: client assignment search refreshes the directory per search
2026-10-07T19:35:50.6820277Z ok 440 - client assignment search refreshes the directory per search
2026-10-07T19:35:50.6820630Z   ---
2026-10-07T19:35:50.6820826Z   duration_ms: 0.5476
2026-10-07T19:35:50.6821034Z   ...
2026-10-07T19:35:50.6821376Z # Subtest: Firestore uses single-tab persistent caching
2026-10-07T19:35:50.6821804Z ok 441 - Firestore uses single-tab persistent caching
2026-10-07T19:35:50.6822103Z   ---
2026-10-07T19:35:50.6822298Z   duration_ms: 0.302654
2026-10-07T19:35:50.6822512Z   ...
2026-10-07T19:35:50.6822871Z # Subtest: auth-dependent modules use the centralized isolation guard
2026-10-07T19:35:50.6823399Z ok 442 - auth-dependent modules use the centralized isolation guard
2026-10-07T19:35:50.6823750Z   ---
2026-10-07T19:35:50.6823940Z   duration_ms: 0.278639
2026-10-07T19:35:50.6824148Z   ...
2026-10-07T19:35:50.6824642Z # Subtest: Firebase auth-state listeners are centralized
2026-10-07T19:35:50.6825082Z ok 443 - Firebase auth-state listeners are centralized
2026-10-07T19:35:50.6825385Z   ---
2026-10-07T19:35:50.6825584Z   duration_ms: 9.242039
2026-10-07T19:35:50.6825796Z   ...
2026-10-07T19:35:50.6826158Z # Subtest: every cloud-synced local key is included in account cleanup
2026-10-07T19:35:50.6826798Z ok 444 - every cloud-synced local key is included in account cleanup
2026-10-07T19:35:50.6827148Z   ---
2026-10-07T19:35:50.6827338Z   duration_ms: 0.495082
2026-10-07T19:35:50.6827543Z   ...
2026-10-07T19:35:50.6827881Z # Subtest: cloud sync cannot reuse account A state for account B
2026-10-07T19:35:50.6828362Z ok 445 - cloud sync cannot reuse account A state for account B
2026-10-07T19:35:50.6828683Z   ---
2026-10-07T19:35:50.6829171Z   duration_ms: 0.302043
2026-10-07T19:35:50.6829458Z   ...
2026-10-07T19:35:50.6829788Z # Subtest: a pull never marks an unpushed change as synced
2026-10-07T19:35:50.6830261Z ok 446 - a pull never marks an unpushed change as synced
2026-10-07T19:35:50.6830571Z   ---
2026-10-07T19:35:50.6830761Z   duration_ms: 0.255817
2026-10-07T19:35:50.6830977Z   ...
2026-10-07T19:35:50.6831366Z # Subtest: shared plan sync verifies the source account before applying data
2026-10-07T19:35:50.6831941Z ok 447 - shared plan sync verifies the source account before applying data
2026-10-07T19:35:50.6832314Z   ---
2026-10-07T19:35:50.6832506Z   duration_ms: 0.312322
2026-10-07T19:35:50.6832719Z   ...
2026-10-07T19:35:50.6833031Z # Subtest: firestore.rules has no leftover wide-open rules
2026-10-07T19:35:50.6833483Z ok 448 - firestore.rules has no leftover wide-open rules
2026-10-07T19:35:50.6833795Z   ---
2026-10-07T19:35:50.6833983Z   duration_ms: 0.561546
2026-10-07T19:35:50.6834196Z   ...
2026-10-07T19:35:50.6834549Z # Subtest: public pages have a search description and share preview
2026-10-07T19:35:50.6835063Z ok 449 - public pages have a search description and share preview
2026-10-07T19:35:50.6835410Z   ---
2026-10-07T19:35:50.6835598Z   duration_ms: 0.531991
2026-10-07T19:35:50.6835811Z   ...
2026-10-07T19:35:50.6836118Z # Subtest: public pages show no leftover placeholder text
2026-10-07T19:35:50.6836559Z ok 450 - public pages show no leftover placeholder text
2026-10-07T19:35:50.6836860Z   ---
2026-10-07T19:35:50.6837051Z   duration_ms: 1.108245
2026-10-07T19:35:50.6837264Z   ...
2026-10-07T19:35:50.6837552Z # Subtest: no browser alert/confirm/prompt dialogs
2026-10-07T19:35:50.6837946Z ok 451 - no browser alert/confirm/prompt dialogs
2026-10-07T19:35:50.6838241Z   ---
2026-10-07T19:35:50.6838432Z   duration_ms: 32.587987
2026-10-07T19:35:50.6838665Z   ...
2026-10-07T19:35:50.6839175Z # Subtest: visible copy uses real dashes and the Southbound name
2026-10-07T19:35:50.6839668Z ok 452 - visible copy uses real dashes and the Southbound name
2026-10-07T19:35:50.6839990Z   ---
2026-10-07T19:35:50.6840183Z   duration_ms: 40.799687
2026-10-07T19:35:50.6840403Z   ...
2026-10-07T19:35:50.6840788Z # Subtest: fonts are self-hosted (no Google Fonts) and every font file exists
2026-10-07T19:35:50.6841365Z ok 453 - fonts are self-hosted (no Google Fonts) and every font file exists
2026-10-07T19:35:50.6841738Z   ---
2026-10-07T19:35:50.6841925Z   duration_ms: 4.380071
2026-10-07T19:35:50.6842137Z   ...
2026-10-07T19:35:50.6842630Z # Subtest: photo size copies match their photos (run `python3 scripts/build-images.py` if this fails)
2026-10-07T19:35:50.6843401Z ok 454 - photo size copies match their photos (run `python3 scripts/build-images.py` if this fails)
2026-10-07T19:35:50.6843856Z   ---
2026-10-07T19:35:50.6844049Z   duration_ms: 1.944723
2026-10-07T19:35:50.6844263Z   ...
2026-10-07T19:35:50.6844663Z # Subtest: no neon colors from before the rebrand (use the tokens in css/style.css)
2026-10-07T19:35:50.6845271Z ok 455 - no neon colors from before the rebrand (use the tokens in css/style.css)
2026-10-07T19:35:50.6845661Z   ---
2026-10-07T19:35:50.6845853Z   duration_ms: 31.589917
2026-10-07T19:35:50.6846218Z   ...
2026-10-07T19:35:50.6846569Z # Subtest: csv: quoted commas, quotes and line breaks; a leading BOM
2026-10-07T19:35:50.6847068Z ok 456 - csv: quoted commas, quotes and line breaks; a leading BOM
2026-10-07T19:35:50.6847399Z   ---
2026-10-07T19:35:50.6847594Z   duration_ms: 2.872341
2026-10-07T19:35:50.6847804Z   ...
2026-10-07T19:35:50.6848108Z # Subtest: csv dates are read as UTC in Strava's formats
2026-10-07T19:35:50.6848638Z ok 457 - csv dates are read as UTC in Strava's formats
2026-10-07T19:35:50.6849217Z   ---
2026-10-07T19:35:50.6849422Z   duration_ms: 0.894887
2026-10-07T19:35:50.6849634Z   ...
2026-10-07T19:35:50.6850042Z # Subtest: activities.csv: meters from the right Distance column, types, names
2026-10-07T19:35:50.6850643Z ok 458 - activities.csv: meters from the right Distance column, types, names
2026-10-07T19:35:50.6851018Z   ---
2026-10-07T19:35:50.6851216Z   duration_ms: 2.145667
2026-10-07T19:35:50.6851423Z   ...
2026-10-07T19:35:50.6851822Z # Subtest: zip: entries listed from the directory, stored and deflated both read
2026-10-07T19:35:50.6852433Z ok 459 - zip: entries listed from the directory, stored and deflated both read
2026-10-07T19:35:50.6852813Z   ---
2026-10-07T19:35:50.6853013Z   duration_ms: 55.587457
2026-10-07T19:35:50.6853244Z   ...
2026-10-07T19:35:50.6853631Z # Subtest: the whole archive: the watch file for its run, the csv for the rest
2026-10-07T19:35:50.6854209Z ok 460 - the whole archive: the watch file for its run, the csv for the rest
2026-10-07T19:35:50.6854578Z   ---
2026-10-07T19:35:50.6854784Z   duration_ms: 152.477557
2026-10-07T19:35:50.6855014Z   ...
2026-10-07T19:35:50.6855493Z # Subtest: loose files work too, and a csv written in local time is corrected by the watch files
2026-10-07T19:35:50.6856222Z ok 461 - loose files work too, and a csv written in local time is corrected by the watch files
2026-10-07T19:35:50.6856647Z   ---
2026-10-07T19:35:50.6856839Z   duration_ms: 106.051967
2026-10-07T19:35:50.6857065Z   ...
2026-10-07T19:35:50.6857408Z # Subtest: an activity has the same key from its file or its csv row
2026-10-07T19:35:50.6857911Z ok 462 - an activity has the same key from its file or its csv row
2026-10-07T19:35:50.6858249Z   ---
2026-10-07T19:35:50.6858445Z   duration_ms: 0.347116
2026-10-07T19:35:50.6858654Z   ...
2026-10-07T19:35:50.6859215Z # Subtest: merging imports: new, unchanged, a csv row after its file only adds the name
2026-10-07T19:35:50.6859874Z ok 463 - merging imports: new, unchanged, a csv row after its file only adds the name
2026-10-07T19:35:50.6860279Z   ---
2026-10-07T19:35:50.6860469Z   duration_ms: 2.857153
2026-10-07T19:35:50.6860684Z   ...
2026-10-07T19:35:50.6860999Z # Subtest: the same run on COROS and Strava is counted once
2026-10-07T19:35:50.6861443Z ok 464 - the same run on COROS and Strava is counted once
2026-10-07T19:35:50.6861760Z   ---
2026-10-07T19:35:50.6861948Z   duration_ms: 0.510381
2026-10-07T19:35:50.6862158Z   ...
2026-10-07T19:35:50.6862539Z # Subtest: combining: COROS first, Strava fills the rest, overlap counted
2026-10-07T19:35:50.6863102Z ok 465 - combining: COROS first, Strava fills the rest, overlap counted
2026-10-07T19:35:50.6863458Z   ---
2026-10-07T19:35:50.6863659Z   duration_ms: 14.727075
2026-10-07T19:35:50.6863877Z   ...
2026-10-07T19:35:50.6864314Z # Subtest: all-time numbers: years (with empty ones), this year vs last by today, records
2026-10-07T19:35:50.6864991Z ok 466 - all-time numbers: years (with empty ones), this year vs last by today, records
2026-10-07T19:35:50.6865395Z   ---
2026-10-07T19:35:50.6865585Z   duration_ms: 1.217929
2026-10-07T19:35:50.6865802Z   ...
2026-10-07T19:35:50.6866101Z # Subtest: fastest efforts, other activities, summary
2026-10-07T19:35:50.6866508Z ok 467 - fastest efforts, other activities, summary
2026-10-07T19:35:50.6866804Z   ---
2026-10-07T19:35:50.6867003Z   duration_ms: 0.657405
2026-10-07T19:35:50.6867219Z   ...
2026-10-07T19:35:50.6867589Z # Subtest: cleaning: blanks dropped, numbers bounded, only https videos
2026-10-07T19:35:50.6868138Z ok 468 - cleaning: blanks dropped, numbers bounded, only https videos
2026-10-07T19:35:50.6868642Z   ---
2026-10-07T19:35:50.6869097Z   duration_ms: 2.308441
2026-10-07T19:35:50.6869375Z   ...
2026-10-07T19:35:50.6869726Z # Subtest: labels, text and summary read like a coach wrote them
2026-10-07T19:35:50.6870212Z ok 469 - labels, text and summary read like a coach wrote them
2026-10-07T19:35:50.6870536Z   ---
2026-10-07T19:35:50.6870734Z   duration_ms: 1.590093
2026-10-07T19:35:50.6871086Z   ...
2026-10-07T19:35:50.6871511Z # Subtest: guided order: supersets alternate, rest after the round, none at the end
2026-10-07T19:35:50.6872148Z ok 470 - guided order: supersets alternate, rest after the round, none at the end
2026-10-07T19:35:50.6872539Z   ---
2026-10-07T19:35:50.6872727Z   duration_ms: 0.566015
2026-10-07T19:35:50.6872949Z   ...
2026-10-07T19:35:50.6873329Z # Subtest: planned vs actual: sets done, heavier/lighter, unplanned extras
2026-10-07T19:35:50.6873894Z ok 471 - planned vs actual: sets done, heavier/lighter, unplanned extras
2026-10-07T19:35:50.6874267Z   ---
2026-10-07T19:35:50.6874455Z   duration_ms: 0.987981
2026-10-07T19:35:50.6874664Z   ...
2026-10-07T19:35:50.6875097Z # Subtest: in the plan: day text, the change list sees a weight change, runtime kept apart
2026-10-07T19:35:50.6875753Z ok 472 - in the plan: day text, the change list sees a weight change, runtime kept apart
2026-10-07T19:35:50.6876151Z   ---
2026-10-07T19:35:50.6876345Z   duration_ms: 1.900711
2026-10-07T19:35:50.6876566Z   ...
2026-10-07T19:35:50.6876896Z # Subtest: when: today, tomorrow, a date, with a session's time
2026-10-07T19:35:50.6877373Z ok 473 - when: today, tomorrow, a date, with a session's time
2026-10-07T19:35:50.6877698Z   ---
2026-10-07T19:35:50.6877888Z   duration_ms: 16.526929
2026-10-07T19:35:50.6878106Z   ...
2026-10-07T19:35:50.6878395Z # Subtest: what: a few words for each kind of item
2026-10-07T19:35:50.6878979Z ok 474 - what: a few words for each kind of item
2026-10-07T19:35:50.6879420Z   ---
2026-10-07T19:35:50.6879630Z   duration_ms: 0.285673
2026-10-07T19:35:50.6879854Z   ...
2026-10-07T19:35:50.6880213Z # Subtest: the NEXT line: a session carries its time, a run doesn't
2026-10-07T19:35:50.6880721Z ok 475 - the NEXT line: a session carries its time, a run doesn't
2026-10-07T19:35:50.6881066Z   ---
2026-10-07T19:35:50.6881262Z   duration_ms: 1.06288
2026-10-07T19:35:50.6881480Z   ...
2026-10-07T19:35:50.6881867Z # Subtest: a quiet day: Rest day with a plan, No session today without one
2026-10-07T19:35:50.6882421Z ok 476 - a quiet day: Rest day with a plan, No session today without one
2026-10-07T19:35:50.6882777Z   ---
2026-10-07T19:35:50.6882975Z   duration_ms: 0.168143
2026-10-07T19:35:50.6883193Z   ...
2026-10-07T19:35:50.6883557Z # Subtest: check-in: due Sunday early in the week, a prompt from Friday
2026-10-07T19:35:50.6884092Z ok 477 - check-in: due Sunday early in the week, a prompt from Friday
2026-10-07T19:35:50.6884437Z   ---
2026-10-07T19:35:50.6884623Z   duration_ms: 1.344815
2026-10-07T19:35:50.6884837Z   ...
2026-10-07T19:35:50.6885177Z # Subtest: check-in: sent, then the coach's reply while it's news
2026-10-07T19:35:50.6885661Z ok 478 - check-in: sent, then the coach's reply while it's news
2026-10-07T19:35:50.6885991Z   ---
2026-10-07T19:35:50.6886189Z   duration_ms: 1.344364
2026-10-07T19:35:50.6886398Z   ...
2026-10-07T19:35:50.6886723Z # Subtest: running client: Today, then the coach, then the rest
2026-10-07T19:35:50.6887202Z ok 479 - running client: Today, then the coach, then the rest
2026-10-07T19:35:50.6887521Z   ---
2026-10-07T19:35:50.6887712Z   duration_ms: 2.06675
2026-10-07T19:35:50.6887954Z   ...
2026-10-07T19:35:50.6888315Z # Subtest: soccer client: sessions first, no readiness, no nutrition
2026-10-07T19:35:50.6889079Z ok 480 - soccer client: sessions first, no readiness, no nutrition
2026-10-07T19:35:50.6889449Z   ---
2026-10-07T19:35:50.6889657Z   duration_ms: 0.408801
2026-10-07T19:35:50.6889873Z   ...
2026-10-07T19:35:50.6890279Z # Subtest: pending: just the waiting card (with the profile link) and the tools
2026-10-07T19:35:50.6891117Z ok 481 - pending: just the waiting card (with the profile link) and the tools
2026-10-07T19:35:50.6891497Z   ---
2026-10-07T19:35:50.6891688Z   duration_ms: 0.184654
2026-10-07T19:35:50.6891913Z   ...
2026-10-07T19:35:50.6892189Z # Subtest: fail-open shows every client section
2026-10-07T19:35:50.6892570Z ok 482 - fail-open shows every client section
2026-10-07T19:35:50.6892853Z   ---
2026-10-07T19:35:50.6893160Z   duration_ms: 0.23088
2026-10-07T19:35:50.6893380Z   ...
2026-10-07T19:35:50.6893636Z # Subtest: the hero line says what's here
2026-10-07T19:35:50.6893981Z ok 483 - the hero line says what's here
2026-10-07T19:35:50.6894243Z   ---
2026-10-07T19:35:50.6894437Z   duration_ms: 0.486697
2026-10-07T19:35:50.6894660Z   ...
2026-10-07T19:35:50.6894918Z # Subtest: every section id exists on Today
2026-10-07T19:35:50.6895264Z ok 484 - every section id exists on Today
2026-10-07T19:35:50.6895539Z   ---
2026-10-07T19:35:50.6895724Z   duration_ms: 0.596402
2026-10-07T19:35:50.6895939Z   ...
2026-10-07T19:35:50.6896373Z # Subtest: fitHrSpeed: robust slope from many runs, the prior when speeds barely differ
2026-10-07T19:35:50.6897044Z ok 485 - fitHrSpeed: robust slope from many runs, the prior when speeds barely differ
2026-10-07T19:35:50.6897450Z   ---
2026-10-07T19:35:50.6897636Z   duration_ms: 5.862161
2026-10-07T19:35:50.6897852Z   ...
2026-10-07T19:35:50.6898257Z # Subtest: easy runs that count: not treadmill, race, hilly, too short or too hard
2026-10-07T19:35:50.6899003Z ok 486 - easy runs that count: not treadmill, race, hilly, too short or too hard
2026-10-07T19:35:50.6899397Z   ---
2026-10-07T19:35:50.6899589Z   duration_ms: 0.680227
2026-10-07T19:35:50.6899801Z   ...
2026-10-07T19:35:50.6900302Z # Subtest: efficiency: easy HR 6 bpm lower in the last 2 weeks reads as 'lower', with the pace it's worth
2026-10-07T19:35:50.6901066Z ok 487 - efficiency: easy HR 6 bpm lower in the last 2 weeks reads as 'lower', with the pace it's worth
2026-10-07T19:35:50.6901517Z   ---
2026-10-07T19:35:50.6901716Z   duration_ms: 35.616281
2026-10-07T19:35:50.6901938Z   ...
2026-10-07T19:35:50.6902379Z # Subtest: efficiency: steady HR = no change; noise alone doesn't call one; few runs say so
2026-10-07T19:35:50.6903049Z ok 488 - efficiency: steady HR = no change; noise alone doesn't call one; few runs say so
2026-10-07T19:35:50.6903458Z   ---
2026-10-07T19:35:50.6903650Z   duration_ms: 23.997997
2026-10-07T19:35:50.6903871Z   ...
2026-10-07T19:35:50.6904272Z # Subtest: sessionClass: race, long, intervals, threshold, tempo, steady, easy
2026-10-07T19:35:50.6904863Z ok 489 - sessionClass: race, long, intervals, threshold, tempo, steady, easy
2026-10-07T19:35:50.6905241Z   ---
2026-10-07T19:35:50.6905438Z   duration_ms: 0.423599
2026-10-07T19:35:50.6905652Z   ...
2026-10-07T19:35:50.6906144Z # Subtest: effort vs expected: defaults first, then your own; 3 harder-than-usual runs = costing more
2026-10-07T19:35:50.6906909Z ok 490 - effort vs expected: defaults first, then your own; 3 harder-than-usual runs = costing more
2026-10-07T19:35:50.6907362Z   ---
2026-10-07T19:35:50.6907552Z   duration_ms: 1.573943
2026-10-07T19:35:50.6907775Z   ...
2026-10-07T19:35:50.6908180Z # Subtest: quality HR: reps at the same speed 5 bpm higher than the 8 weeks before
2026-10-07T19:35:50.6908903Z ok 491 - quality HR: reps at the same speed 5 bpm higher than the 8 weeks before
2026-10-07T19:35:50.6909296Z   ---
2026-10-07T19:35:50.6909489Z   duration_ms: 2.36742
2026-10-07T19:35:50.6909705Z   ...
2026-10-07T19:35:50.6909948Z # Subtest: execution and long-run drift
2026-10-07T19:35:50.6910287Z ok 492 - execution and long-run drift
2026-10-07T19:35:50.6910541Z   ---
2026-10-07T19:35:50.6910728Z   duration_ms: 1.53532
2026-10-07T19:35:50.6910937Z   ...
2026-10-07T19:35:50.6911289Z # Subtest: reading: every combination, honest about the ambiguous ones
2026-10-07T19:35:50.6911812Z ok 493 - reading: every combination, honest about the ambiguous ones
2026-10-07T19:35:50.6912159Z   ---
2026-10-07T19:35:50.6912481Z   duration_ms: 0.878857
2026-10-07T19:35:50.6912693Z   ...
2026-10-07T19:35:50.6913125Z # Subtest: dose test: a response that follows recent load is found; too few probes say so
2026-10-07T19:35:50.6913784Z ok 494 - dose test: a response that follows recent load is found; too few probes say so
2026-10-07T19:35:50.6914183Z   ---
2026-10-07T19:35:50.6914371Z   duration_ms: 63.378069
2026-10-07T19:35:50.6914590Z   ...
2026-10-07T19:35:50.6915192Z # Subtest: effort vs expected (audit B5): answers given more than a day late count half in the baseline
2026-10-07T19:35:50.6915982Z ok 495 - effort vs expected (audit B5): answers given more than a day late count half in the baseline
2026-10-07T19:35:50.6916440Z   ---
2026-10-07T19:35:50.6916634Z   duration_ms: 0.80514
2026-10-07T19:35:50.6916846Z   ...
2026-10-07T19:35:50.6917347Z # Subtest: execution: a structured workout is judged step by step, not against one pooled pace band
2026-10-07T19:35:50.6918098Z ok 496 - execution: a structured workout is judged step by step, not against one pooled pace band
2026-10-07T19:35:50.6918545Z   ---
2026-10-07T19:35:50.6918745Z   duration_ms: 47.241438
2026-10-07T19:35:50.6919090Z   ...
2026-10-07T19:35:50.6919442Z # Subtest: plan vs actual by week; this week so far; last 4 weeks
2026-10-07T19:35:50.6919945Z ok 497 - plan vs actual by week; this week so far; last 4 weeks
2026-10-07T19:35:50.6920277Z   ---
2026-10-07T19:35:50.6920471Z   duration_ms: 2.428024
2026-10-07T19:35:50.6920688Z   ...
2026-10-07T19:35:50.6920982Z # Subtest: long runs: each week's longest 10+ miler
2026-10-07T19:35:50.6921413Z ok 498 - long runs: each week's longest 10+ miler
2026-10-07T19:35:50.6921717Z   ---
2026-10-07T19:35:50.6921924Z   duration_ms: 7.652687
2026-10-07T19:35:50.6922136Z   ...
2026-10-07T19:35:50.6922498Z # Subtest: aerobic fitness: easy pace at 140 bpm, and how it changed
2026-10-07T19:35:50.6923028Z ok 499 - aerobic fitness: easy pace at 140 bpm, and how it changed
2026-10-07T19:35:50.6923373Z   ---
2026-10-07T19:35:50.6923572Z   duration_ms: 0.691288
2026-10-07T19:35:50.6923798Z   ...
2026-10-07T19:35:50.6924298Z # Subtest: laps: COROS's lap reply -> meters, seconds, heart rate; workout laps preferred over auto miles
2026-10-07T19:35:50.6925073Z ok 500 - laps: COROS's lap reply -> meters, seconds, heart rate; workout laps preferred over auto miles
2026-10-07T19:35:50.6925529Z   ---
2026-10-07T19:35:50.6925719Z   duration_ms: 0.470587
2026-10-07T19:35:50.6925930Z   ...
2026-10-07T19:35:50.6926248Z # Subtest: key workout check: reps against the target pace
2026-10-07T19:35:50.6926713Z ok 501 - key workout check: reps against the target pace
2026-10-07T19:35:50.6927019Z   ---
2026-10-07T19:35:50.6927207Z   duration_ms: 0.952594
2026-10-07T19:35:50.6927419Z   ...
2026-10-07T19:35:50.6927712Z # Subtest: body trend rows, summaries, prediction trend
2026-10-07T19:35:50.6928127Z ok 502 - body trend rows, summaries, prediction trend
2026-10-07T19:35:50.6928435Z   ---
2026-10-07T19:35:50.6928621Z   duration_ms: 0.78364
2026-10-07T19:35:50.6929102Z   ...
2026-10-07T19:35:50.6929552Z # Subtest: charts: bars with planned behind actual; a line with gaps, band and goal
2026-10-07T19:35:50.6930188Z ok 503 - charts: bars with planned behind actual; a line with gaps, band and goal
2026-10-07T19:35:50.6930584Z   ---
2026-10-07T19:35:50.6930780Z   duration_ms: 0.926056
2026-10-07T19:35:50.6931002Z   ...
2026-10-07T19:35:50.6931406Z # Subtest: buildSharedActivity keeps only the 28-day Training activity window
2026-10-07T19:35:50.6932012Z ok 504 - buildSharedActivity keeps only the 28-day Training activity window
2026-10-07T19:35:50.6932398Z   ---
2026-10-07T19:35:50.6932591Z   duration_ms: 14.062898
2026-10-07T19:35:50.6932810Z   ...
2026-10-07T19:35:50.6933181Z # Subtest: recent runs are newest first and expose only activity fields
2026-10-07T19:35:50.6933716Z ok 505 - recent runs are newest first and expose only activity fields
2026-10-07T19:35:50.6934063Z   ---
2026-10-07T19:35:50.6934260Z   duration_ms: 1.123363
2026-10-07T19:35:50.6934475Z   ...
2026-10-07T19:35:50.6935017Z # Subtest: the projection is compact and empty when there are no recent runs
2026-10-07T19:35:50.6935608Z ok 506 - the projection is compact and empty when there are no recent runs
2026-10-07T19:35:50.6935976Z   ---
2026-10-07T19:35:50.6936169Z   duration_ms: 0.345534
2026-10-07T19:35:50.6936381Z   ...
2026-10-07T19:35:50.6936789Z # Subtest: distance is rounded to one decimal mile and duration is whole seconds
2026-10-07T19:35:50.6937495Z ok 507 - distance is rounded to one decimal mile and duration is whole seconds
2026-10-07T19:35:50.6937877Z   ---
2026-10-07T19:35:50.6938077Z   duration_ms: 0.324144
2026-10-07T19:35:50.6938284Z   ...
2026-10-07T19:35:50.6938656Z # Subtest: the projection does not copy calories or other raw COROS fields
2026-10-07T19:35:50.6939360Z ok 508 - the projection does not copy calories or other raw COROS fields
2026-10-07T19:35:50.6939728Z   ---
2026-10-07T19:35:50.6939917Z   duration_ms: 0.56338
2026-10-07T19:35:50.6940136Z   ...
2026-10-07T19:35:50.6940550Z # Subtest: performance summary uses the 28-day window and weighted pace/heart rate
2026-10-07T19:35:50.6941179Z ok 509 - performance summary uses the 28-day window and weighted pace/heart rate
2026-10-07T19:35:50.6941571Z   ---
2026-10-07T19:35:50.6941765Z   duration_ms: 16.769825
2026-10-07T19:35:50.6941985Z   ...
2026-10-07T19:35:50.6942363Z # Subtest: recent performance rows expose only approved performance fields
2026-10-07T19:35:50.6942941Z ok 510 - recent performance rows expose only approved performance fields
2026-10-07T19:35:50.6943306Z   ---
2026-10-07T19:35:50.6943494Z   duration_ms: 1.259677
2026-10-07T19:35:50.6943710Z   ...
2026-10-07T19:35:50.6944086Z # Subtest: fitness indicators use the latest entry inside the shared window
2026-10-07T19:35:50.6944656Z ok 511 - fitness indicators use the latest entry inside the shared window
2026-10-07T19:35:50.6945026Z   ---
2026-10-07T19:35:50.6945217Z   duration_ms: 0.420263
2026-10-07T19:35:50.6945430Z   ...
2026-10-07T19:35:50.6945705Z # Subtest: empty performance data stays compact
2026-10-07T19:35:50.6946100Z ok 512 - empty performance data stays compact
2026-10-07T19:35:50.6946384Z   ---
2026-10-07T19:35:50.6946573Z   duration_ms: 0.342057
2026-10-07T19:35:50.6946787Z   ...
2026-10-07T19:35:50.6947161Z # Subtest: recovery summary combines the 28-day health and recovery window
2026-10-07T19:35:50.6947711Z ok 513 - recovery summary combines the 28-day health and recovery window
2026-10-07T19:35:50.6948092Z   ---
2026-10-07T19:35:50.6948283Z   duration_ms: 14.319961
2026-10-07T19:35:50.6948503Z   ...
2026-10-07T19:35:50.6949048Z # Subtest: recovery projection never copies readiness or unrelated private fields
2026-10-07T19:35:50.6949671Z ok 514 - recovery projection never copies readiness or unrelated private fields
2026-10-07T19:35:50.6950065Z   ---
2026-10-07T19:35:50.6950264Z   duration_ms: 1.060906
2026-10-07T19:35:50.6950478Z   ...
2026-10-07T19:35:50.6950846Z # Subtest: recovery projection is newest first and capped at eight days
2026-10-07T19:35:50.6951392Z ok 515 - recovery projection is newest first and capped at eight days
2026-10-07T19:35:50.6951752Z   ---
2026-10-07T19:35:50.6951937Z   duration_ms: 0.589959
2026-10-07T19:35:50.6952141Z   ...
2026-10-07T19:35:50.6952415Z # Subtest: empty recovery history stays compact
2026-10-07T19:35:50.6952783Z ok 516 - empty recovery history stays compact
2026-10-07T19:35:50.6953061Z   ---
2026-10-07T19:35:50.6953256Z   duration_ms: 0.250937
2026-10-07T19:35:50.6953466Z   ...
2026-10-07T19:35:50.6953898Z # Subtest: a week combines plan runs, strength days, extras, schedule, sessions and logs
2026-10-07T19:35:50.6954555Z ok 517 - a week combines plan runs, strength days, extras, schedule, sessions and logs
2026-10-07T19:35:50.6954955Z   ---
2026-10-07T19:35:50.6955144Z   duration_ms: 3.779232
2026-10-07T19:35:50.6955351Z   ...
2026-10-07T19:35:50.6955756Z # Subtest: a plan's strength session copied onto the Strength schedule shows once
2026-10-07T19:35:50.6956347Z ok 518 - a plan's strength session copied onto the Strength schedule shows once
2026-10-07T19:35:50.6956876Z   ---
2026-10-07T19:35:50.6957103Z   duration_ms: 0.342248
2026-10-07T19:35:50.6957312Z   ...
2026-10-07T19:35:50.6957697Z # Subtest: logging most of a planned run counts as done; a short log doesn't
2026-10-07T19:35:50.6958266Z ok 519 - logging most of a planned run counts as done; a short log doesn't
2026-10-07T19:35:50.6958630Z   ---
2026-10-07T19:35:50.6958938Z   duration_ms: 0.674887
2026-10-07T19:35:50.6959281Z   ...
2026-10-07T19:35:50.6959676Z # Subtest: day status: rest, done, missed, upcoming; sessions are never missed
2026-10-07T19:35:50.6960248Z ok 520 - day status: rest, done, missed, upcoming; sessions are never missed
2026-10-07T19:35:50.6960617Z   ---
2026-10-07T19:35:50.6960808Z   duration_ms: 0.607342
2026-10-07T19:35:50.6961021Z   ...
2026-10-07T19:35:50.6961394Z # Subtest: next workout after a rest day, and the plan week a date falls in
2026-10-07T19:35:50.6961954Z ok 521 - next workout after a rest day, and the plan week a date falls in
2026-10-07T19:35:50.6962317Z   ---
2026-10-07T19:35:50.6962505Z   duration_ms: 1.644945
2026-10-07T19:35:50.6962724Z   ...
2026-10-07T19:35:50.6963196Z # Subtest: a coach's strength session: the day itself on a strength day, its own item next to a run
2026-10-07T19:35:50.6963925Z ok 522 - a coach's strength session: the day itself on a strength day, its own item next to a run
2026-10-07T19:35:50.6964368Z   ---
2026-10-07T19:35:50.6964562Z   duration_ms: 0.733497
2026-10-07T19:35:50.6964782Z   ...
2026-10-07T19:35:50.6965215Z # Subtest: week at a glance: planned vs done by day, key workouts marked, totals so far
2026-10-07T19:35:50.6965854Z ok 523 - week at a glance: planned vs done by day, key workouts marked, totals so far
2026-10-07T19:35:50.6966252Z   ---
2026-10-07T19:35:50.6966471Z   duration_ms: 2.220607
2026-10-07T19:35:50.6966680Z   ...
2026-10-07T19:35:50.6966991Z # Subtest: the week in one sentence, ending in the decision
2026-10-07T19:35:50.6967438Z ok 524 - the week in one sentence, ending in the decision
2026-10-07T19:35:50.6967752Z   ---
2026-10-07T19:35:50.6967943Z   duration_ms: 0.360922
2026-10-07T19:35:50.6968155Z   ...
2026-10-07T19:35:50.6968394Z # Subtest: one reading for the week
2026-10-07T19:35:50.6968702Z ok 525 - one reading for the week
2026-10-07T19:35:50.6969184Z   ---
2026-10-07T19:35:50.6969385Z   duration_ms: 0.463243
2026-10-07T19:35:50.6969596Z   ...
2026-10-07T19:35:50.6970012Z # Subtest: this week's responses: rated N of M, the runs that stood out, execution
2026-10-07T19:35:50.6970636Z ok 526 - this week's responses: rated N of M, the runs that stood out, execution
2026-10-07T19:35:50.6971015Z   ---
2026-10-07T19:35:50.6971210Z   duration_ms: 0.392772
2026-10-07T19:35:50.6971419Z   ...
2026-10-07T19:35:50.6971886Z # Subtest: next week: the plan's days with the decision's changes inline, and one thing to watch
2026-10-07T19:35:50.6972593Z ok 527 - next week: the plan's days with the decision's changes inline, and one thing to watch
2026-10-07T19:35:50.6973013Z   ---
2026-10-07T19:35:50.6973217Z   duration_ms: 0.502356
2026-10-07T19:35:50.6973428Z   ...
2026-10-07T19:35:50.6973920Z # Subtest: recovery as changes from usual: last 7 nights against the 28 before, sleep against the need
2026-10-07T19:35:50.6974673Z ok 528 - recovery as changes from usual: last 7 nights against the 28 before, sleep against the need
2026-10-07T19:35:50.6975118Z   ---
2026-10-07T19:35:50.6975305Z   duration_ms: 1.171052
2026-10-07T19:35:50.6975530Z   ...
2026-10-07T19:35:50.6975945Z # Subtest: the level counts agreeing domains: one noisy signal never moves the plan
2026-10-07T19:35:50.6976572Z ok 529 - the level counts agreeing domains: one noisy signal never moves the plan
2026-10-07T19:35:50.6976967Z   ---
2026-10-07T19:35:50.6977155Z   duration_ms: 2.481373
2026-10-07T19:35:50.6977369Z   ...
2026-10-07T19:35:50.6977869Z # Subtest: grouped votes (audit B6): HRV, sleep and feel count at most twice; load and response once each
2026-10-07T19:35:50.6978634Z ok 530 - grouped votes (audit B6): HRV, sleep and feel count at most twice; load and response once each
2026-10-07T19:35:50.6979351Z   ---
2026-10-07T19:35:50.6979548Z   duration_ms: 6.202646
2026-10-07T19:35:50.6979766Z   ...
2026-10-07T19:35:50.6980164Z # Subtest: Absorb: easy runs to 90%, quality at the slow end, long run untouched
2026-10-07T19:35:50.6980818Z ok 531 - Absorb: easy runs to 90%, quality at the slow end, long run untouched
2026-10-07T19:35:50.6981194Z   ---
2026-10-07T19:35:50.6981500Z   duration_ms: 0.400225
2026-10-07T19:35:50.6981717Z   ...
2026-10-07T19:35:50.6982217Z # Subtest: Ease: easy 80%, long 85%, one quality session loses a quarter of its reps at the same pace
2026-10-07T19:35:50.6982975Z ok 532 - Ease: easy 80%, long 85%, one quality session loses a quarter of its reps at the same pace
2026-10-07T19:35:50.6983422Z   ---
2026-10-07T19:35:50.6983623Z   duration_ms: 0.467782
2026-10-07T19:35:50.6983837Z   ...
2026-10-07T19:35:50.6984215Z # Subtest: Recover: 3 days easy at 65% (quality becomes easy), then the plan
2026-10-07T19:35:50.6984784Z ok 533 - Recover: 3 days easy at 65% (quality becomes easy), then the plan
2026-10-07T19:35:50.6985143Z   ---
2026-10-07T19:35:50.6985330Z   duration_ms: 0.350924
2026-10-07T19:35:50.6985550Z   ...
2026-10-07T19:35:50.6986014Z # Subtest: race week and taper protection; the athlete's own percentages; never above the plan
2026-10-07T19:35:50.6986723Z ok 534 - race week and taper protection; the athlete's own percentages; never above the plan
2026-10-07T19:35:50.6987153Z   ---
2026-10-07T19:35:50.6987351Z   duration_ms: 0.593276
2026-10-07T19:35:50.6987565Z   ...
2026-10-07T19:35:50.6988015Z # Subtest: concern domains from real inputs: low HRV and a sleep debt; pain flags a check-in
2026-10-07T19:35:50.6988714Z ok 535 - concern domains from real inputs: low HRV and a sleep debt; pain flags a check-in
2026-10-07T19:35:50.6989264Z   ---
2026-10-07T19:35:50.6989454Z   duration_ms: 3.525648
2026-10-07T19:35:50.6989672Z   ...
2026-10-07T19:35:50.6990233Z # Subtest: what happened next, and the replay's hit / false-alarm / miss rates (judged on missed sessions and new pain)
2026-10-07T19:35:50.6991114Z ok 536 - what happened next, and the replay's hit / false-alarm / miss rates (judged on missed sessions and new pain)
2026-10-07T19:35:50.6991621Z   ---
2026-10-07T19:35:50.6991819Z   duration_ms: 50.193839
2026-10-07T19:35:50.6992044Z   ...
2026-10-07T19:35:50.6992487Z # Subtest: no double count (audit A3): the same runs felt harder move 'response', not 'load'
2026-10-07T19:35:50.6993150Z ok 537 - no double count (audit A3): the same runs felt harder move 'response', not 'load'
2026-10-07T19:35:50.6993558Z   ---
2026-10-07T19:35:50.6993754Z   duration_ms: 125.86437
2026-10-07T19:35:50.6993976Z   ...
2026-10-07T19:35:50.6994454Z # Subtest: the plan reads into steps: rep time kept as written, recovery after the last rep optional
2026-10-07T19:35:50.6995200Z ok 538 - the plan reads into steps: rep time kept as written, recovery after the last rep optional
2026-10-07T19:35:50.6995639Z   ---
2026-10-07T19:35:50.6995829Z   duration_ms: 3.5425
2026-10-07T19:35:50.6996036Z   ...
2026-10-07T19:35:50.6996434Z # Subtest: warm-ups, cool-downs and recoveries show pace but are never judged
2026-10-07T19:35:50.6997014Z ok 539 - warm-ups, cool-downs and recoveries show pace but are never judged
2026-10-07T19:35:50.6997384Z   ---
2026-10-07T19:35:50.6997578Z   duration_ms: 12.375678
2026-10-07T19:35:50.6997792Z   ...
2026-10-07T19:35:50.6998172Z # Subtest: Eddie's example, run as a workout on the watch: rep by rep, exact
2026-10-07T19:35:50.6998747Z ok 540 - Eddie's example, run as a workout on the watch: rep by rep, exact
2026-10-07T19:35:50.6999341Z   ---
2026-10-07T19:35:50.6999533Z   duration_ms: 8.151979
2026-10-07T19:35:50.6999758Z   ...
2026-10-07T19:35:50.7000236Z # Subtest: no subtracting rounded paces: GPS lap distances are normalized to the planned distance
2026-10-07T19:35:50.7000973Z ok 541 - no subtracting rounded paces: GPS lap distances are normalized to the planned distance
2026-10-07T19:35:50.7001430Z   ---
2026-10-07T19:35:50.7001758Z   duration_ms: 6.345292
2026-10-07T19:35:50.7001974Z   ...
2026-10-07T19:35:50.7002456Z # Subtest: a missed rep and a rep cut short: 5/6, partial, approximate; completion and execution apart
2026-10-07T19:35:50.7003209Z ok 542 - a missed rep and a rep cut short: 5/6, partial, approximate; completion and execution apart
2026-10-07T19:35:50.7003651Z   ---
2026-10-07T19:35:50.7003841Z   duration_ms: 4.601163
2026-10-07T19:35:50.7004169Z   ...
2026-10-07T19:35:50.7004569Z # Subtest: an extra lap press in the warm-up is joined, the rest still lines up
2026-10-07T19:35:50.7005156Z ok 543 - an extra lap press in the warm-up is joined, the rest still lines up
2026-10-07T19:35:50.7005532Z   ---
2026-10-07T19:35:50.7005722Z   duration_ms: 10.494863
2026-10-07T19:35:50.7005939Z   ...
2026-10-07T19:35:50.7006416Z # Subtest: auto mile laps: reps can't be seen (unobserved, not missed); the warm-up still lines up
2026-10-07T19:35:50.7007283Z ok 544 - auto mile laps: reps can't be seen (unobserved, not missed); the warm-up still lines up
2026-10-07T19:35:50.7007887Z   ---
2026-10-07T19:35:50.7008097Z   duration_ms: 4.185689
2026-10-07T19:35:50.7008314Z   ...
2026-10-07T19:35:50.7008634Z # Subtest: no laps / no workout: says so, nothing invented
2026-10-07T19:35:50.7009218Z ok 545 - no laps / no workout: says so, nothing invented
2026-10-07T19:35:50.7009531Z   ---
2026-10-07T19:35:50.7009723Z   duration_ms: 3.890038
2026-10-07T19:35:50.7009934Z   ...
2026-10-07T19:35:50.7010439Z # Subtest: a range is a range: inside = 0, outside measured from the nearer end; timed reps compare pace
2026-10-07T19:35:50.7011200Z ok 546 - a range is a range: inside = 0, outside measured from the nearer end; timed reps compare pace
2026-10-07T19:35:50.7011653Z   ---
2026-10-07T19:35:50.7011851Z   duration_ms: 4.329186
2026-10-07T19:35:50.7012062Z   ...
2026-10-07T19:35:50.7012757Z # Subtest: a mixed repeat (4 × (1 mi @ MP, 1 mi @ threshold)) and an effort-only rep
2026-10-07T19:35:50.7013437Z ok 547 - a mixed repeat (4 × (1 mi @ MP, 1 mi @ threshold)) and an effort-only rep
2026-10-07T19:35:50.7013827Z   ---
2026-10-07T19:35:50.7014023Z   duration_ms: 5.194288
2026-10-07T19:35:50.7014456Z   ...
2026-10-07T19:35:50.7015049Z # Subtest: lap groups keep their kind; clock and delta words
2026-10-07T19:35:50.7015610Z ok 548 - lap groups keep their kind; clock and delta words
2026-10-07T19:35:50.7016056Z   ---
2026-10-07T19:35:50.7016399Z   duration_ms: 0.603645
2026-10-07T19:35:50.7016729Z   ...
2026-10-07T19:35:50.7028072Z # Subtest: mile laps: a block that starts and ends on a mile is found by its pace, lap by lap
2026-10-07T19:35:50.7028998Z ok 549 - mile laps: a block that starts and ends on a mile is found by its pace, lap by lap
2026-10-07T19:35:50.7029473Z   ---
2026-10-07T19:35:50.7029700Z   duration_ms: 1.451564
2026-10-07T19:35:50.7029936Z   ...
2026-10-07T19:35:50.7030409Z # Subtest: a long block run with the lap button every mile: the six laps join into the block
2026-10-07T19:35:50.7031121Z ok 550 - a long block run with the lap button every mile: the six laps join into the block
2026-10-07T19:35:50.7031551Z   ---
2026-10-07T19:35:50.7031741Z   duration_ms: 0.9286
2026-10-07T19:35:50.7031953Z   ...
2026-10-07T19:35:50.7032482Z # Subtest: a recovery cut short before the next block never gets folded into it (the Oct 6 threshold mile)
2026-10-07T19:35:50.7033300Z ok 551 - a recovery cut short before the next block never gets folded into it (the Oct 6 threshold mile)
2026-10-07T19:35:50.7033784Z   ---
2026-10-07T19:35:50.7033982Z   duration_ms: 12.653719
2026-10-07T19:35:50.7034205Z   ...
2026-10-07T19:35:50.7034517Z # Subtest: targets: the Fueling page's math, now shared
2026-10-07T19:35:50.7034967Z ok 552 - targets: the Fueling page's math, now shared
2026-10-07T19:35:50.7035274Z   ---
2026-10-07T19:35:50.7035465Z   duration_ms: 2.124088
2026-10-07T19:35:50.7035688Z   ...
2026-10-07T19:35:50.7036082Z # Subtest: a long run: before, gels by time and mile (caffeine last), after
2026-10-07T19:35:50.7036659Z ok 553 - a long run: before, gels by time and mile (caffeine last), after
2026-10-07T19:35:50.7037235Z   ---
2026-10-07T19:35:50.7037429Z   duration_ms: 1.442198
2026-10-07T19:35:50.7037641Z   ...
2026-10-07T19:35:50.7038051Z # Subtest: short and easy: nothing to carry; hard: eat before and refuel after
2026-10-07T19:35:50.7038656Z ok 554 - short and easy: nothing to carry; hard: eat before and refuel after
2026-10-07T19:35:50.7039173Z   ---
2026-10-07T19:35:50.7039492Z   duration_ms: 0.441292
2026-10-07T19:35:50.7039720Z   ...
2026-10-07T19:35:50.7040026Z # Subtest: their inputs and gels, or sensible defaults
2026-10-07T19:35:50.7040450Z ok 555 - their inputs and gels, or sensible defaults
2026-10-07T19:35:50.7040754Z   ---
2026-10-07T19:35:50.7040948Z   duration_ms: 8.150515
2026-10-07T19:35:50.7041158Z   ...
2026-10-07T19:35:50.7041339Z 1..555
2026-10-07T19:35:50.7041528Z # tests 555
2026-10-07T19:35:50.7041719Z # suites 0
2026-10-07T19:35:50.7041903Z # pass 554
2026-10-07T19:35:50.7042091Z # fail 1
2026-10-07T19:35:50.7042276Z # cancelled 0
2026-10-07T19:35:50.7042480Z # skipped 0
2026-10-07T19:35:50.7042676Z # todo 0
2026-10-07T19:35:50.7042891Z # duration_ms 11004.867525
2026-10-07T19:35:50.7046097Z ##[error]Process completed with exit code 1.
2026-10-07T19:35:50.7152456Z Post job cleanup.
2026-10-07T19:35:50.8529318Z (node:4859) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
2026-10-07T19:35:50.8530812Z (Use `node --trace-deprecation ...` to show where the warning was created)
2026-10-07T19:35:50.8719743Z Post job cleanup.
2026-10-07T19:35:50.9711789Z [command]/usr/bin/git version
2026-10-07T19:35:50.9758757Z git version 2.55.0
2026-10-07T19:35:50.9805367Z Temporarily overriding HOME='/home/runner/work/_temp/896d3398-509f-49e6-8f50-1071c3063923' before making global git config changes
2026-10-07T19:35:50.9807814Z Adding repository directory to the temporary git global config as a safe directory
2026-10-07T19:35:50.9811618Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/eddie-dashboard/eddie-dashboard
2026-10-07T19:35:50.9854521Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-10-07T19:35:50.9890621Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-10-07T19:35:51.0140222Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-10-07T19:35:51.0187352Z http.https://github.com/.extraheader
2026-10-07T19:35:51.0193603Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-10-07T19:35:51.0232388Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-10-07T19:35:51.0485502Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-10-07T19:35:51.0523230Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-10-07T19:35:51.0932605Z Cleaning up orphan processes
2026-10-07T19:35:51.1212934Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-java@v4, actions/setup-node@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/


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
