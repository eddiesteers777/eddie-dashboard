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
const VERSION = "6250e3dc9e2c";
const PRECACHE = { "75day.html": "7d17d6191fe0", "about.html": "0002a2e8348e", "analytics.html": "931953334336", "apply.html": "93b886941d4b", "brand/sb-mark-forest.svg": "a4931de181b6", "brand/sb-mark.svg": "ce34a98e276e", "brand/sb-tile.svg": "c404fa9d1bc2", "brand/southbound-logo-forest.svg": "74c43339c5f3", "brand/southbound-logo.svg": "870ae3452eb2", "checkin.html": "7bb244225b4b", "client.html": "188515ab8c49", "clients.html": "f2cf812a80d8", "coach.html": "5081f61aed5a", "coaching.html": "09f33e1bec85", "components/header.html": "e1c40238af39", "components/publicHeader.html": "d774d3382afc", "contact.html": "d07c40581817", "cross-training.html": "be870b60939c", "css/analytics.css": "2ffb1b190f32", "css/athlete-state.css": "655008025f32", "css/checkin.css": "6a1c7dcf8892", "css/client-hub.css": "20d29a4ab1c9", "css/client-model.css": "47dc8e7a064e", "css/client-profile.css": "2c5783dbf16a", "css/clients.css": "0799eb027d19", "css/coach.css": "0eb07675bd42", "css/corosCoach.css": "f06fa0c87108", "css/corosData.css": "50e8d521e396", "css/corosIntegration.css": "b9e4f12f29a7", "css/cross-training.css": "cd14bfbeb2fe", "css/dashboard.css": "1cdd7e50bbaf", "css/demo.css": "a07bbbf2ee16", "css/execution.css": "f501b575716b", "css/fueling.css": "c803b28243cc", "css/gear.css": "66cd5b6f12cb", "css/habits.css": "7342e213b6e6", "css/install.css": "ac0b6404dc5b", "css/intake.css": "0d671e02bf1c", "css/marathon.css": "3eb05195863c", "css/messages.css": "6cf9deeb59e5", "css/muscle-map.css": "7fcf12b4dad7", "css/my-plan.css": "c0aeba5243ea", "css/nutrition.css": "9e56a5647123", "css/pace-calculator.css": "72d381eaa88b", "css/planning.css": "db67ad8878b5", "css/programs.css": "f54a5c469af4", "css/progress.css": "cf690e4d3c0d", "css/public-example.css": "a38bf7de9933", "css/public-fuel.css": "bd8f3a6c7b18", "css/public.css": "bc5310bbe64a", "css/race-plans.css": "d6d77dff597f", "css/readiness.css": "7452a8e97f98", "css/running.css": "33b2f9c17877", "css/schedule.css": "3434740f495d", "css/settings.css": "e1c4c6c4c075", "css/share.css": "cb4dd0bfaea8", "css/stravaIntegration.css": "cb62c6b53804", "css/strength-progress.css": "177013564f81", "css/strength.css": "5838ce150769", "css/strengthLibrary.css": "9e335442c307", "css/style.css": "f8b6d6477ac9", "css/train.css": "320f15e91f90", "css/trends.css": "704b5f7c9633", "css/updates.css": "7ed9230a98b5", "css/week.css": "5339eb7d1991", "css/weekly-review.css": "bcbb51b2bd2c", "css/workout.css": "f39a81dbbfb7", "emoji/sb_adjust.svg": "e35874a966b5", "emoji/sb_big_effort.svg": "6495a31ba8b1", "emoji/sb_check.svg": "6232cb731332", "emoji/sb_coach_eye.svg": "1f9ae7782bd3", "emoji/sb_easy_day.svg": "c2b366ee1f4c", "emoji/sb_finish.svg": "bb12d963250e", "emoji/sb_fuel.svg": "5f18990d25d2", "emoji/sb_great_work.svg": "bb039468e003", "emoji/sb_high_five.svg": "5bab60223e88", "emoji/sb_hydrate.svg": "a1424a085604", "emoji/sb_lets_go.svg": "a5609b470a49", "emoji/sb_locked_in.svg": "cc5cd52b6587", "emoji/sb_long_run.svg": "bd34b16d3d08", "emoji/sb_pr.svg": "5f8e047c6ac6", "emoji/sb_race_day.svg": "36e5fde643d1", "emoji/sb_recovery.svg": "25722d40ea7e", "emoji/sb_scheduled.svg": "2272b9444a0f", "emoji/sb_sleep.svg": "22d45ac24d4d", "emoji/sb_soccer.svg": "0291223a631e", "emoji/sb_southbound.svg": "b1afe8ac46ea", "emoji/sb_strong.svg": "e59440821973", "emoji/sb_survived.svg": "b604942a81ce", "emoji/sb_tired_proud.svg": "300fef72cdcf", "emoji/sb_trail.svg": "c54c37c78e1e", "fonts/bebas-neue-latin-400.woff2": "a7c90c89240c", "fonts/inter-latin-var.woff2": "3100e775e861", "fonts/jetbrains-mono-latin-var.woff2": "18be452724bf", "fonts/pdf/BebasNeue.ttf": "3a4778a20b4d", "fonts/pdf/Inter-Bold.ttf": "d279f8ac89af", "fonts/pdf/Inter-Regular.ttf": "ca65811a9fe7", "fonts/pdf/JetBrainsMono-Medium.ttf": "e6e211741c79", "fonts/pdf/Saira-ExtraBold.ttf": "7dc280d344a5", "fonts/saira-latin-800.woff2": "ca7a9220a7b6", "fonts/saira-latin-900-italic.woff2": "41db7434e28b", "fuel.html": "499168598c3a", "fueling.html": "30051e76ef6a", "gear.html": "7795f4604dea", "google40072741a539d5b7.html": "46e0008c68b6", "habit-icons/ball.svg": "dfe072d0d184", "habit-icons/bible.svg": "3673dc278d2b", "habit-icons/bike.svg": "0924056d4214", "habit-icons/breathe.svg": "c42fe0e5bf5a", "habit-icons/check.svg": "6232cb731332", "habit-icons/coffee.svg": "716b3960d6cf", "habit-icons/cold.svg": "8863dd839ba6", "habit-icons/core.svg": "01f55967dc1e", "habit-icons/dog.svg": "11ff79c6295d", "habit-icons/family.svg": "c9079107a588", "habit-icons/fasting.svg": "3cb0c83a2032", "habit-icons/friends.svg": "d927f37953ee", "habit-icons/fruit.svg": "0883e51f41e9", "habit-icons/goal.svg": "e88e34bfc4cd", "habit-icons/gratitude.svg": "0944f76de211", "habit-icons/journal.svg": "b400c66f0f0e", "habit-icons/love.svg": "6ddfa4ff34d4", "habit-icons/mealprep.svg": "14d835a4dc53", "habit-icons/meals.svg": "15588d8e9661", "habit-icons/meditate.svg": "6968cd959f22", "habit-icons/money.svg": "476cbb25e8c9", "habit-icons/music.svg": "002d6ed3b01e", "habit-icons/nature.svg": "a4cabbe150bc", "habit-icons/noalcohol.svg": "0ff0cce39da8", "habit-icons/nosugar.svg": "546357099fc7", "habit-icons/pray.svg": "58833e69b510", "habit-icons/protein.svg": "49252ed9717b", "habit-icons/read.svg": "74df63280210", "habit-icons/run.svg": "86e44a548dfb", "habit-icons/sauna.svg": "04add853735d", "habit-icons/screens.svg": "5cbb3c31e31f", "habit-icons/sleep.svg": "639bda34583e", "habit-icons/star.svg": "a514134b76c9", "habit-icons/steps.svg": "b8d940eef6aa", "habit-icons/strength.svg": "e59440821973", "habit-icons/stretch.svg": "970b9de7cfc2", "habit-icons/study.svg": "226dd19a88c3", "habit-icons/sun.svg": "5f42cd693cd6", "habit-icons/swim.svg": "5610c3300e76", "habit-icons/teeth.svg": "943e045c0c1a", "habit-icons/tidy.svg": "61fd17587396", "habit-icons/veggies.svg": "aaeced722a0b", "habit-icons/vitamins.svg": "a2eb2116f338", "habit-icons/water.svg": "333957146a64", "habit-icons/weigh.svg": "3cd851367c92", "habit-icons/work.svg": "b170559704b2", "habit-icons/workout.svg": "105a25014658", "habits.html": "ee7a07723662", "home.html": "9e8b4a2875f4", "icons/apple-touch-icon.png": "fdcea045a12c", "icons/favicon-32.png": "197bd214730d", "icons/icon-192.png": "17f5fa972d82", "icons/icon-512.png": "236b9f965f1d", "icons/icon-maskable-512.png": "f6ffd8417443", "icons/install-qr.svg": "cc50ce72bf4c", "icons/running-bg-map.svg": "e51158d2f6a5", "index.html": "67de3b8282d8", "install.html": "0c3c14759d12", "js/activeProgramSources.js": "3f497e8f5247", "js/analytics.js": "87f703dbf70c", "js/analyticsLayout.js": "4597e2f85612", "js/analyticsSummary.js": "0bf2de2c2718", "js/app.js": "eac5561c54b8", "js/applicationForm.js": "07d88abaf885", "js/applications.js": "297b7245d283", "js/apply.js": "e23cdf930be4", "js/athleteData.js": "dcbc419ad3e7", "js/athleteLedger.js": "3b58b2a94ec4", "js/athleteParams.js": "3b71d513f6f8", "js/athleteShare.js": "eedd68fc5d72", "js/athleteSources.js": "97ccd72eca87", "js/athleteState.js": "cdb95f39ab84", "js/athleteStateView.js": "a1c78fc8888b", "js/auth.js": "7f6a83d8909a", "js/barcodeScanner.js": "22ee051e9e89", "js/calendarButton.js": "a3a84920492c", "js/calendarExport.js": "80e0f4eb104d", "js/changeRequestDialog.js": "7ab9817c2a2b", "js/changeRequests.js": "f69a9b56f2d1", "js/checkin.js": "c16401695c44", "js/checkinView.js": "79bb7ddf3c88", "js/checkins.js": "6737f2c9bc30", "js/clientAssignmentModel.js": "32028f62e116", "js/clientDirectory.js": "de0846623414", "js/clientHub.js": "5cfd62bfd45d", "js/clientModel.js": "47ca6ed70a96", "js/clientModelTab.js": "1791cfb634b7", "js/clientNotes.js": "2bb358050921", "js/clientPackageCard.js": "c16a9f65876f", "js/clientPackageModel.js": "41f54580980e", "js/clientPackages.js": "fdc54fd0ff5b", "js/clientProfileForm.js": "dd7df6af23e5", "js/clientProgress.js": "877fa7885c4b", "js/clientRecordSchema.js": "4fe08935ec1a", "js/clientRecords.js": "93ce8de3da75", "js/clientSummary.js": "3ee315298cd6", "js/clientTimeline.js": "bcf911282ba9", "js/clients.js": "baa10199337f", "js/cloudSync.js": "b870991acfc9", "js/coach.js": "4e60f4baea9b", "js/coachAccess.js": "b15321d10425", "js/coachCard.js": "04522cdae0b5", "js/coachLibrary.js": "57b7348440a8", "js/coachNotesLocal.js": "eee6fc4a43d7", "js/coachPlanGenerator.js": "b64bfe7788f4", "js/coachPlanStore.js": "62c2dd9fb7e7", "js/coachPlanSync.js": "18a1f9cc3f64", "js/coachToday.js": "3c4a6ec809fa", "js/coachingPlanModel.js": "600f2185c235", "js/coachingPlans.js": "738650d3ff8e", "js/completedSessions.js": "ce2587fb94c7", "js/contact.js": "ed8dbae55c82", "js/contactRequests.js": "b3275a56ad5c", "js/corosAuth.js": "d62a7089233a", "js/corosAutoSend.js": "8a97725b2d2e", "js/corosClient.js": "12cff09eec0f", "js/corosData.js": "074cda057269", "js/corosDiagnostic.js": "63bca757fd49", "js/corosHealth.js": "94610cda7b2b", "js/corosHistory.js": "694aee1e1b41", "js/corosMetrics.js": "c6e41c7ac5d2", "js/corosParse.js": "cec7c08f79bc", "js/corosRuns.js": "4978f441b1d4", "js/corosSend.js": "d76a8accc06d", "js/corosSettings.js": "aa0cd95c8758", "js/corosStatus.js": "2766d6e56868", "js/corosTools.js": "0c04c87ba3f7", "js/corosWorkout.js": "47b1f31e4d9a", "js/cross-training.js": "ac81884a07b3", "js/dashboardData.js": "3b2df7b54aff", "js/decisionCard.js": "189896f5cec6", "js/demoFigure.js": "74aa42c50d34", "js/effortCard.js": "f0986a5e6c15", "js/effortScale.js": "7f7188c5e058", "js/emailNotify.js": "69ed4780fc07", "js/emoji.js": "ca79cda2b711", "js/emojiPicker.js": "e59507dea33a", "js/executionShare.js": "acd5f5a47db4", "js/executionView.js": "7248067eb41b", "js/exerciseClips.js": "2012dbcec871", "js/exerciseDemoSheet.js": "22dccb78acc8", "js/exerciseDemos.js": "cf4c56eed747", "js/exerciseMuscles.js": "da55c49e055e", "js/exerciseSearch.js": "0be94a6dc23b", "js/featuredTraining.js": "7286d001c776", "js/featuredTrainingModel.js": "52db59c26251", "js/feedbackModel.js": "73e95754cc63", "js/firebase.js": "c7270c6c3cb3", "js/firestore.js": "a39d3ceb6608", "js/fitParse.js": "78d43d773a57", "js/fluidUnits.js": "322aebc41e02", "js/foodSearch.js": "b303701a30fe", "js/formDraft.js": "29bda0a2850c", "js/fuelDetails.js": "50498dde02a0", "js/fuelDrafts.js": "efa6a59a8476", "js/fuelPdf.js": "77a97b9133d6", "js/fuelPdfModel.js": "ea0e22a46327", "js/fuelProfile.js": "22e0ecb45aa3", "js/fuelSchedule.js": "dc231d7400d8", "js/fuelScheduleView.js": "f22ea3becafa", "js/fuelSources.js": "acfad160469c", "js/fuelTargets.js": "628c2f079306", "js/fueling.js": "2df985f97147", "js/fuelingPlans.js": "01ffef800808", "js/gear.js": "eb30f8111e42", "js/habitDefaults.js": "7886e9ef6661", "js/habitIconPicker.js": "42cf8ed45a4d", "js/habitIconSet.js": "e898f2e319c4", "js/habitImpact.js": "9421367d4d9b", "js/habits.js": "d763cc297eda", "js/habitsCard.js": "bb782d265ec1", "js/healthReviewed.js": "95455d7e64ee", "js/icons.js": "e013bfcb7a22", "js/inquiries.js": "1a9362b8e12c", "js/install.js": "6896f68d20b6", "js/intakeFlow.js": "1c4b785af366", "js/intakeGuide.js": "7d40668bb962", "js/interestPicker.js": "371677a788dc", "js/loadCard.js": "5cc4f746164d", "js/loadHeader.js": "a76b831980c3", "js/loadPublicHeader.js": "b5ffc901add1", "js/loadState.js": "2aa574ac19c7", "js/marathonCoros.js": "c99c6e0515b3", "js/marathonCorosButton.js": "247ea5970c86", "js/marathonData.js": "0244912586bd", "js/messageThread.js": "27bd5ad17fe2", "js/messageView.js": "3466cfa9401e", "js/messages.js": "f7e31434b533", "js/messagesPage.js": "81108022636d", "js/muscleMap.js": "b07ea393d077", "js/myPlan.js": "024d75c0cc9b", "js/navAccess.js": "176fafbbef0a", "js/netStatus.js": "d4e8fada44a1", "js/nutrition.js": "80c87a0d0023", "js/nutritionGoals.js": "fdc181c33f1a", "js/offlineWrite.js": "49f551296a50", "js/pace-calculator.js": "bd2a8419b2b3", "js/paceSegments.js": "9e9317c2ac21", "js/packageCatalog.js": "cd485d74c6e0", "js/personalRecords.js": "552f645b0ec9", "js/planGenerateDialogs.js": "a1a886d41b00", "js/planLaps.js": "7ed9bd5d5e29", "js/planOps.js": "84288ac16423", "js/planOutcome.js": "9ab8d3789bd1", "js/planPrompt.js": "9deb986993f3", "js/planPromptDialogs.js": "fdfb4e38f7b9", "js/planRelease.js": "289e67c5041c", "js/planShape.js": "ddadec632b2f", "js/planWindow.js": "45188cbb26a4", "js/planWorkspace.js": "ec77f213387e", "js/plannerEvents.js": "08f25cee96db", "js/planningBrief.js": "ef9b322bf6e9", "js/planningContext.js": "1d6275de8408", "js/planningCycle.js": "b3b1dff54a37", "js/planningCycles.js": "aa5ddf2f0880", "js/planningData.js": "40bb440884d4", "js/planningPage.js": "2915740d4282", "js/planningView.js": "3c6a4b497613", "js/profile.js": "1ca2b9db681a", "js/profileCheckCard.js": "95c654db9bed", "js/profileChecks.js": "55d0c20df72c", "js/programs.js": "6da40514ce79", "js/progressView.js": "64c013a69d9f", "js/publicFuel.js": "efd29ed013ed", "js/publicFuelModel.js": "36a36c4c01b9", "js/raceBacktest.js": "a2296165b6a0", "js/raceCapability.js": "48d93d636774", "js/raceCapabilityCard.js": "a59ed5be8f81", "js/raceCountdown.js": "d74f67cccc43", "js/racePlanEditor.js": "6bcb58060cac", "js/racePlanGenerator.js": "b1a5f567ec36", "js/racePlanStrengthIntegration.js": "3260d2f3f2a7", "js/racePlans.js": "33ee8b7fd77b", "js/racesCard.js": "ae47d4c8d943", "js/readiness.js": "0b6f1d856b42", "js/readinessBacktest.js": "73f636e12b59", "js/readinessCard.js": "4c655f5b34ee", "js/readinessData.js": "51c5afdafb6b", "js/readinessV2.js": "a5bcad0a6586", "js/readinessV2Data.js": "21bcef754c77", "js/registerSW.js": "790992fae5bb", "js/role.js": "013795db34f2", "js/runCard.js": "a67f0de72630", "js/runCardData.js": "1efa7f906b7f", "js/runWalk.js": "54a8543a474f", "js/runWorkout.js": "9bf2760d6783", "js/runningCalendar.js": "4ca0abf4f839", "js/runningLog.js": "2709a1ff3982", "js/runningProgramCalendar.js": "4e27dfdcf1ea", "js/runningPrograms.js": "746cfdef0844", "js/schedule.js": "a2d164b31cd1", "js/scheduling.js": "7b5aad51f2ac", "js/services.js": "b2af25a0bac7", "js/sessionDialogs.js": "eaf0fa6cb714", "js/sessionDose.js": "25c1a4f742e7", "js/sessionLogs.js": "655b5d2cb74b", "js/sessionModel.js": "d505d3d47629", "js/sessionShare.js": "903cd5045e23", "js/sessionStore.js": "5c291da4c598", "js/setRunner.js": "2d3615c9b1b0", "js/settings.js": "a0feb3311ff9", "js/signInErrors.js": "87587dab7bd1", "js/stravaArchive.js": "f3362a6e3a11", "js/stravaAuth.js": "71c62ea997c4", "js/stravaConfig.js": "a0d7645995e2", "js/stravaData.js": "4d45943824e5", "js/stravaHistory.js": "f1ff33e66fad", "js/stravaImport.js": "1e760d9d89ff", "js/stravaStore.js": "2675308386cc", "js/strength.js": "dd96930f7e2e", "js/strengthBuilder.js": "3961cd9f798e", "js/strengthBuilderModel.js": "c2a137634fc2", "js/strengthHistory.js": "72284754d885", "js/strengthLibrary.js": "f8743d844f45", "js/strengthLibraryData.js": "a0885a3f9b4e", "js/strengthProgress.js": "74ed179ad206", "js/strengthProgressHtml.js": "be21be491676", "js/strengthProgressView.js": "64b2c7797e4e", "js/strengthRunSteps.js": "8b3df1850852", "js/strengthSchedule.js": "729315286b81", "js/strengthSession.js": "32f9ad8f22c3", "js/strengthUnits.js": "064e15a6ce20", "js/strengthWorkout.js": "648540d18cdc", "js/strengthWorkoutList.js": "be9cfa60d943", "js/strengthWorkoutMode.js": "7119409c8824", "js/stripeBilling.js": "35b86b6e6e6e", "js/svgCharts.js": "2c46820776f3", "js/syncMerge.js": "cb5c7c4414c4", "js/thisWeekCard.js": "27b210bf0e2a", "js/todayClient.js": "3bfb8864312a", "js/todayGlance.js": "f1a7c14d15a4", "js/todayHabits.js": "7b65db91788e", "js/todayLayout.js": "2b87b241e20d", "js/train.js": "975cd21a764e", "js/trainingPlanGenerator.js": "ec1828c914c0", "js/trainingPlanStrengthIntegration.js": "b3d9b7d065bb", "js/trainingPrograms.js": "23256fee56d2", "js/trainingResponse.js": "1cf4346995c8", "js/trends.js": "492b7c554ff5", "js/trendsData.js": "c0e160a504b7", "js/trendsView.js": "f42b88612092", "js/ui.js": "c992a7151961", "js/updates.js": "30df09940001", "js/userProfile.js": "521b79809a0f", "js/userSettings.js": "ce787b73ba2a", "js/vdot.js": "ae8846a72964", "js/wearableActivity.js": "6e35ce095abf", "js/wearablePerformance.js": "e4e9a8023554", "js/wearableRecovery.js": "2e0323509c08", "js/weekChangeData.js": "9a52b286258f", "js/weekChangeDialogs.js": "2f9d049e79f9", "js/weekChanges.js": "972eaa51c050", "js/weekData.js": "b898909c68d4", "js/weekModel.js": "98848428e16e", "js/weekStory.js": "4cda07fa76fa", "js/weekView.js": "f275cec3f2fc", "js/weekly-review.js": "02cf04e05ad5", "js/weeklyDecision.js": "d400f4adb037", "js/weeklyDecisionData.js": "c57ecc678bec", "js/weeklyLoad.js": "4057ca4a2362", "js/weeklyStory.js": "fc272ac18115", "js/workoutBuilder.js": "7f251f124842", "js/workoutExecution.js": "14f89b9da437", "js/workoutFuel.js": "46b5e3769a17", "js/workoutPage.js": "795a65bb065a", "js/workoutResults.js": "5d284e39a8a9", "manifest.json": "73d874cb2f1b", "marathon.html": "ad5e4c178d62", "messages.html": "f9106d04305b", "more.html": "0c852a77fb7e", "nutrition.html": "fc1ec6b9c2e4", "pace-calculator.html": "ce04afea14b2", "pace.html": "845cee2ece04", "packages.html": "355b6e004af2", "plan.html": "bf7e6239d9b1", "planner.html": "7d1d5ce19071", "planning.html": "d648258dd29a", "privacy.html": "79486fd18fec", "profile.html": "ba93b393d343", "programs.html": "5d7f51cf391a", "progress.html": "d7dcb7f30eee", "running.html": "12411f035560", "schedule.html": "084232fa3ddd", "settings.html": "e634301fb66d", "site-check.html": "0e2e7e1a50e2", "soccer.html": "9a421c5302d0", "strength.html": "9ac26cc73101", "train.html": "77db2950b27a", "updates.html": "726aed8e01de", "weekly-review.html": "883fc49ff2f8", "workout.html": "e17dc1d5ad30" };
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
