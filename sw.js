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
const VERSION = "05160afe82d9";
const PRECACHE = { "75.html": "248154f428f5", "75day.html": "0c51116f0fd9", "about.html": "bacd8952d35f", "analytics.html": "2e885e0ba5a3", "apply.html": "fad2eb77fd82", "auth-return.html": "ab2baaa48dfe", "brand/sb-mark-forest.svg": "a1d3a8cfefac", "brand/sb-mark.svg": "1e19a4da9968", "brand/sb-tile.svg": "c0b219e69f4c", "brand/southbound-logo-forest.svg": "74c43339c5f3", "brand/southbound-logo.svg": "f2b4424b7337", "checkin.html": "a0c583cad74d", "client.html": "5da46af4eddf", "clients.html": "9760105d11b1", "coach-messages.html": "612c23805867", "coach.html": "acb187591c4f", "coaching.html": "bdca04c77477", "components/header.html": "222f36ad1465", "components/publicHeader.html": "807644b9ac84", "contact.html": "366dc01dabaa", "cross-training.html": "3ef7df1e006f", "css/analytics.css": "f606154e2a13", "css/appLook.css": "f9ef288f9a45", "css/athlete-state.css": "1940cec1c90d", "css/checkin.css": "4e4a326570ff", "css/client-hub.css": "c0e29e908c22", "css/client-model.css": "4020f45d7e4c", "css/client-profile.css": "e1f631bff437", "css/clients.css": "9459cb62be3b", "css/coach.css": "fd7d98aaec24", "css/coachMessages.css": "33d0e158c8da", "css/corosCoach.css": "f06fa0c87108", "css/corosData.css": "50e8d521e396", "css/corosIntegration.css": "b9e4f12f29a7", "css/cross-training.css": "cd14bfbeb2fe", "css/dashboard.css": "b05c74b0a160", "css/demo.css": "f0aa38d0852a", "css/execution.css": "f501b575716b", "css/fueling.css": "512e5d77e0fd", "css/gear.css": "b0def970eb88", "css/habitScenes.css": "3b1be83fb24b", "css/habits.css": "f1e49b51be66", "css/home.css": "cf406dbd59e5", "css/homework.css": "79f22baea796", "css/install.css": "6dcb22ed1d9e", "css/intake.css": "41fa52529bbf", "css/marathon.css": "4c6a77e63283", "css/marathonSetup.css": "1ac3e077b2a2", "css/messages.css": "8003be31cdc0", "css/more.css": "072cde3ffda8", "css/muscle-map.css": "7fcf12b4dad7", "css/my-plan.css": "22c9b381b7ac", "css/nutrition.css": "6b8ec22b38f3", "css/pace-calculator.css": "a07480f4b015", "css/planning.css": "02435ffa0076", "css/playbook.css": "ee142af62d57", "css/programs.css": "7d1e31885d35", "css/progress.css": "efc7473a864f", "css/public-example.css": "819193b212fa", "css/public.css": "bd682b501a00", "css/publicFog.css": "ae2846bfadeb", "css/publicLook.css": "89ca38982835", "css/race-plans.css": "105e9d12acfd", "css/readiness.css": "4b83f8ea8ca8", "css/routes.css": "bafa13ed24e9", "css/running.css": "b64b0ab6e644", "css/schedule.css": "f0720c46c262", "css/settings.css": "23607b0fe49d", "css/seventyfive.css": "fafe8121b1a2", "css/share.css": "cb4dd0bfaea8", "css/soccerPage.css": "96a9549812d6", "css/start.css": "39623c9eb4a9", "css/stravaIntegration.css": "cb62c6b53804", "css/strength-progress.css": "6e8b3bc0ee6f", "css/strength.css": "7e189777760b", "css/strengthLibrary.css": "9e335442c307", "css/style.css": "5348255643b8", "css/tools.css": "6601d888b7e8", "css/train.css": "b588d50e625d", "css/trends.css": "704b5f7c9633", "css/updates.css": "36c6bbd10628", "css/waterSheet.css": "2c7a11a4db6b", "css/week.css": "7ea8da8e8e59", "css/weekly-review.css": "474f7b34f7d3", "css/workout.css": "60a18574f572", "emoji/sb_adjust.svg": "e35874a966b5", "emoji/sb_big_effort.svg": "6495a31ba8b1", "emoji/sb_campfire.svg": "00ee94acdf83", "emoji/sb_check.svg": "6232cb731332", "emoji/sb_coach_eye.svg": "1f9ae7782bd3", "emoji/sb_coffee.svg": "1355b2a60960", "emoji/sb_early_miles.svg": "55b25f9e0162", "emoji/sb_easy_day.svg": "c2b366ee1f4c", "emoji/sb_finish.svg": "bb12d963250e", "emoji/sb_foam_roll.svg": "5af6ddfc78fb", "emoji/sb_forest_miles.svg": "bbc8e3fd1cb5", "emoji/sb_fuel.svg": "5f18990d25d2", "emoji/sb_gel.svg": "f79f7e535f6e", "emoji/sb_great_work.svg": "bb039468e003", "emoji/sb_heading_south.svg": "bfb3e7e08ad4", "emoji/sb_high_five.svg": "5bab60223e88", "emoji/sb_hill_repeats.svg": "1563a9449a42", "emoji/sb_hydrate.svg": "a1424a085604", "emoji/sb_ice_bath.svg": "520765127e33", "emoji/sb_lets_go.svg": "a5609b470a49", "emoji/sb_locked_in.svg": "cc5cd52b6587", "emoji/sb_long_run.svg": "bd34b16d3d08", "emoji/sb_negative_split.svg": "e9f321bfa967", "emoji/sb_pr.svg": "5f8e047c6ac6", "emoji/sb_race_day.svg": "36e5fde643d1", "emoji/sb_rain_run.svg": "da12bf8a0005", "emoji/sb_recovery.svg": "25722d40ea7e", "emoji/sb_scheduled.svg": "2272b9444a0f", "emoji/sb_sleep.svg": "22d45ac24d4d", "emoji/sb_soccer.svg": "0291223a631e", "emoji/sb_southbound.svg": "b1afe8ac46ea", "emoji/sb_strong.svg": "e59440821973", "emoji/sb_survived.svg": "b604942a81ce", "emoji/sb_tired_proud.svg": "300fef72cdcf", "emoji/sb_trail.svg": "c54c37c78e1e", "emoji/sb_trail_blaze.svg": "e3b86685bf6c", "fonts/albert-sans-latin-var.woff2": "c2fb6fda415c", "fonts/big-shoulders-display-latin-var.woff2": "698f9960927e", "fonts/ibm-plex-mono-latin-500.woff2": "01d285447409", "fonts/ibm-plex-mono-latin-600.woff2": "0d1f0b8d0722", "fonts/instrument-sans-latin-var.woff2": "2ee17598a98d", "fonts/inter-latin-var.woff2": "3100e775e861", "fonts/pdf/BigShouldersDisplay-Bold.ttf": "2494a54b4e60", "fonts/pdf/IBMPlexMono-Medium.ttf": "c0af3193c312", "fonts/pdf/InstrumentSans-Bold.ttf": "b8b1cd8ca50e", "fonts/pdf/InstrumentSans-Regular.ttf": "84a515acb294", "fonts/pdf/Saira-ExtraBold.ttf": "7dc280d344a5", "fonts/saira-latin-800.woff2": "ca7a9220a7b6", "fonts/saira-latin-900-italic.woff2": "41db7434e28b", "fuel.html": "418913a14fab", "fueling.html": "1790957c6bf8", "gear.html": "ae7b3c2a7d7b", "google40072741a539d5b7.html": "46e0008c68b6", "habit-icons/ball.svg": "dfe072d0d184", "habit-icons/bible.svg": "3673dc278d2b", "habit-icons/bike.svg": "0924056d4214", "habit-icons/breathe.svg": "c42fe0e5bf5a", "habit-icons/check.svg": "6232cb731332", "habit-icons/coffee.svg": "716b3960d6cf", "habit-icons/cold.svg": "8863dd839ba6", "habit-icons/core.svg": "01f55967dc1e", "habit-icons/dog.svg": "11ff79c6295d", "habit-icons/family.svg": "c9079107a588", "habit-icons/fasting.svg": "3cb0c83a2032", "habit-icons/friends.svg": "d927f37953ee", "habit-icons/fruit.svg": "0883e51f41e9", "habit-icons/goal.svg": "e88e34bfc4cd", "habit-icons/gratitude.svg": "0944f76de211", "habit-icons/journal.svg": "b400c66f0f0e", "habit-icons/love.svg": "6ddfa4ff34d4", "habit-icons/mealprep.svg": "14d835a4dc53", "habit-icons/meals.svg": "15588d8e9661", "habit-icons/meditate.svg": "6968cd959f22", "habit-icons/money.svg": "476cbb25e8c9", "habit-icons/music.svg": "002d6ed3b01e", "habit-icons/nature.svg": "a4cabbe150bc", "habit-icons/noalcohol.svg": "0ff0cce39da8", "habit-icons/nosugar.svg": "546357099fc7", "habit-icons/pray.svg": "58833e69b510", "habit-icons/protein.svg": "49252ed9717b", "habit-icons/read.svg": "74df63280210", "habit-icons/run.svg": "86e44a548dfb", "habit-icons/sauna.svg": "04add853735d", "habit-icons/screens.svg": "5cbb3c31e31f", "habit-icons/sleep.svg": "639bda34583e", "habit-icons/star.svg": "a514134b76c9", "habit-icons/steps.svg": "b8d940eef6aa", "habit-icons/strength.svg": "e59440821973", "habit-icons/stretch.svg": "970b9de7cfc2", "habit-icons/study.svg": "226dd19a88c3", "habit-icons/sun.svg": "5f42cd693cd6", "habit-icons/swim.svg": "5610c3300e76", "habit-icons/teeth.svg": "943e045c0c1a", "habit-icons/tidy.svg": "61fd17587396", "habit-icons/veggies.svg": "aaeced722a0b", "habit-icons/vitamins.svg": "a2eb2116f338", "habit-icons/water.svg": "333957146a64", "habit-icons/weigh.svg": "3cd851367c92", "habit-icons/work.svg": "b170559704b2", "habit-icons/workout.svg": "105a25014658", "habits.html": "632f9153b6c3", "home.html": "5c67ab939fd5", "homework.html": "e37c346c5161", "icons/apple-touch-icon.png": "ff5180d64400", "icons/favicon-32.png": "62d951488dd3", "icons/icon-192.png": "dbf9b88fb97c", "icons/icon-512.png": "c7f8f07b078f", "icons/icon-maskable-512.png": "e8d1626c114f", "icons/install-qr.svg": "cc50ce72bf4c", "icons/running-bg-map.svg": "e51158d2f6a5", "index.html": "f53ce4ed4a4c", "install.html": "f2977666c5ab", "js/account.js": "756f9aaaf0ee", "js/accountModel.js": "59c4c86c401d", "js/activeProgramSources.js": "c4f76fa77ec2", "js/analytics.js": "cf91853a8563", "js/analyticsLayout.js": "f58c27638760", "js/analyticsSummary.js": "0bf2de2c2718", "js/app.js": "c0060ebdc961", "js/appLook.js": "c3185f368f7b", "js/appMotion.js": "40c0a6d81dc4", "js/applicationForm.js": "07d88abaf885", "js/applications.js": "297b7245d283", "js/athleteData.js": "dcbc419ad3e7", "js/athleteLedger.js": "3b58b2a94ec4", "js/athleteParams.js": "3b71d513f6f8", "js/athleteShare.js": "eedd68fc5d72", "js/athleteSources.js": "97ccd72eca87", "js/athleteState.js": "cdb95f39ab84", "js/athleteStateView.js": "a1c78fc8888b", "js/auth.js": "93931f8675ed", "js/authReturn.js": "c6c14934e367", "js/barcodeScanner.js": "a86e81304ef8", "js/bodyModel.js": "7b4e96016583", "js/bodyView.js": "1fb4ef851421", "js/calendarButton.js": "a3a84920492c", "js/calendarExport.js": "510b9c0f5b20", "js/celebrate.js": "960dee2016e7", "js/celebrateWeek.js": "e4608ffbacd6", "js/changeRequestDialog.js": "7ab9817c2a2b", "js/changeRequests.js": "f69a9b56f2d1", "js/chartTips.js": "1ab7bbbf610e", "js/checkin.js": "8b8aecb1b52f", "js/checkinView.js": "79bb7ddf3c88", "js/checkins.js": "6737f2c9bc30", "js/clientAssignmentModel.js": "32028f62e116", "js/clientDirectory.js": "de0846623414", "js/clientHub.js": "b7d3a5622e89", "js/clientModel.js": "47ca6ed70a96", "js/clientModelTab.js": "1791cfb634b7", "js/clientNotes.js": "2bb358050921", "js/clientPackageCard.js": "c16a9f65876f", "js/clientPackageModel.js": "41f54580980e", "js/clientPackages.js": "fdc54fd0ff5b", "js/clientProfileForm.js": "dd7df6af23e5", "js/clientProgress.js": "f0c6275ceb83", "js/clientRecordSchema.js": "4fe08935ec1a", "js/clientRecords.js": "93ce8de3da75", "js/clientSummary.js": "ce695f9f379c", "js/clientTimeline.js": "bcf911282ba9", "js/clients.js": "e7621d1a56e7", "js/cloudSync.js": "70de40dd5693", "js/coach.js": "462c5204ef1a", "js/coachAccess.js": "683ea8753247", "js/coachCard.js": "de6a216aeb7c", "js/coachInbox.js": "a983b6be4d88", "js/coachInvite.js": "db2f0ddb340c", "js/coachLibrary.js": "57b7348440a8", "js/coachMessages.js": "505e3d7a8886", "js/coachNotesLocal.js": "eee6fc4a43d7", "js/coachPlanGenerator.js": "e7b47586bd67", "js/coachPlanRemoval.js": "e7afb218a943", "js/coachPlanStore.js": "62c2dd9fb7e7", "js/coachPlanSync.js": "089aa096064b", "js/coachPlansCard.js": "a98afdc4de2f", "js/coachPlaybook.js": "f1e2b0c8c8ac", "js/coachToday.js": "03809006328e", "js/coachingPlanModel.js": "600f2185c235", "js/coachingPlans.js": "738650d3ff8e", "js/completedSessions.js": "ce2587fb94c7", "js/contact.js": "ed8dbae55c82", "js/contactRequests.js": "b3275a56ad5c", "js/corosAuth.js": "d62a7089233a", "js/corosAutoSend.js": "8a97725b2d2e", "js/corosClient.js": "12cff09eec0f", "js/corosData.js": "a1d515ed23b7", "js/corosDiagnostic.js": "63bca757fd49", "js/corosHealth.js": "94610cda7b2b", "js/corosHistory.js": "694aee1e1b41", "js/corosMetrics.js": "c6e41c7ac5d2", "js/corosParse.js": "cec7c08f79bc", "js/corosRuns.js": "4978f441b1d4", "js/corosSend.js": "d76a8accc06d", "js/corosSettings.js": "fe27fcd2886e", "js/corosStatus.js": "2766d6e56868", "js/corosTools.js": "0c04c87ba3f7", "js/corosWorkout.js": "47b1f31e4d9a", "js/cross-training.js": "ad302f68004c", "js/dashboardData.js": "3a03ede06efa", "js/decisionCard.js": "5c9cf840f6d3", "js/demoFigure.js": "4541dbf94562", "js/effortCard.js": "d508295e1653", "js/effortScale.js": "7f7188c5e058", "js/emailNotify.js": "69ed4780fc07", "js/emoji.js": "b53783c2daa2", "js/emojiPicker.js": "1bd998bf9862", "js/executionShare.js": "ee848f2fd1f1", "js/executionView.js": "7248067eb41b", "js/exerciseClips.js": "2012dbcec871", "js/exerciseDemoConfig.js": "812e7dfd2939", "js/exerciseDemoRemote.js": "02716be0d378", "js/exerciseDemoSheet.js": "e00c0b458cd8", "js/exerciseDemos.js": "0d35fb54909b", "js/exerciseMuscles.js": "e2c6cb1f5473", "js/exerciseSearch.js": "0be94a6dc23b", "js/featuredTraining.js": "74c3b802c95a", "js/featuredTrainingModel.js": "52db59c26251", "js/feedbackModel.js": "16ea7ec5bf0c", "js/firebase.js": "ac38a29c9b23", "js/firestore.js": "a39d3ceb6608", "js/fitParse.js": "78d43d773a57", "js/fitWorkout.js": "b745a134cac3", "js/fluidUnits.js": "322aebc41e02", "js/foodSearch.js": "c7176be4e502", "js/footerRail.js": "50cdfdcbd883", "js/formDraft.js": "29bda0a2850c", "js/fuelClock.js": "2ae68c41a2cf", "js/fuelClockModel.js": "efa7846ef2e7", "js/fuelCourse.js": "0f721ca958c2", "js/fuelDetails.js": "8175768b7430", "js/fuelDrafts.js": "efa6a59a8476", "js/fuelPdf.js": "9a5bb92b52a7", "js/fuelPdfModel.js": "2854c5eb5da7", "js/fuelProfile.js": "22e0ecb45aa3", "js/fuelSchedule.js": "44da8400a587", "js/fuelScheduleView.js": "a66fc3a8349e", "js/fuelSources.js": "acfad160469c", "js/fuelSteps.js": "cc17ae73b007", "js/fuelStepsModel.js": "cc1640a9e4f3", "js/fuelTargets.js": "60a2dc192265", "js/fueling.js": "f9cd46c11393", "js/fuelingPlans.js": "3163d4e945cc", "js/gear.js": "eb30f8111e42", "js/googleRedirect.js": "410ee04a05d7", "js/googleSignIn.js": "a0ec669a5e08", "js/guestFuel.js": "b55edf0cd830", "js/habitDefaults.js": "7886e9ef6661", "js/habitIconPicker.js": "909b9b93a037", "js/habitIconSet.js": "e898f2e319c4", "js/habitImpact.js": "9421367d4d9b", "js/habitLineIcons.js": "3f7a406a3237", "js/habitProgress.js": "1c7bd0b18fa5", "js/habitScenes.js": "6550359c0057", "js/habits.js": "c0841f157327", "js/habitsCard.js": "8f7fb2cb8490", "js/healthReviewed.js": "95455d7e64ee", "js/healthStatsSetting.js": "9c228dd8ad53", "js/heatCard.js": "94e89c0ac010", "js/homeHero.js": "91bf479d88e6", "js/homeSky.js": "4e212fca01f2", "js/homeSkyModel.js": "61d82560bc01", "js/homeStoryModel.js": "92a254783a29", "js/homework.js": "8b1a6e606bb0", "js/homeworkClient.js": "af151e7a7862", "js/homeworkCoach.js": "38de181fea40", "js/homeworkModel.js": "159fe1ba4771", "js/homeworkQuality.js": "70dc82236b3f", "js/homeworkView.js": "d90111d0a759", "js/hrZones.js": "676e335a5576", "js/hrZonesTool.js": "a6795fd0d526", "js/icons.js": "f0c7bebbdfaa", "js/inquiries.js": "1a9362b8e12c", "js/install.js": "6896f68d20b6", "js/intakeFlow.js": "1c4b785af366", "js/intakeGuide.js": "7d40668bb962", "js/interestPicker.js": "a5f98061ac02", "js/loadCard.js": "0e751aa2aeda", "js/loadHeader.js": "6a8b70ca0a82", "js/loadPublicHeader.js": "4046fe36f7f3", "js/loadState.js": "2aa574ac19c7", "js/marathonCoros.js": "c99c6e0515b3", "js/marathonCorosButton.js": "fe91f1ff3541", "js/marathonData.js": "d14d6160f411", "js/marathonEngine.js": "7fbdcb58fb6e", "js/marathonProfile.js": "2a1cf02ad0f7", "js/marathonSetup.js": "b094ffb3d43a", "js/marathonSwap.js": "217659bae2f9", "js/marathonToday.js": "26ece48ac2da", "js/marathonWeek.js": "02ec6264dbb5", "js/messageThread.js": "18c4f8a9e1c3", "js/messageView.js": "36eb631d2c4d", "js/messages.js": "7a0db68129e7", "js/messagesPage.js": "ada0395cfd8c", "js/monthModel.js": "1b5e88f0a5e7", "js/muscleMap.js": "295573e58e18", "js/myPlan.js": "e0b3bec5351b", "js/navAccess.js": "b18d8caadc13", "js/netStatus.js": "d4e8fada44a1", "js/notifications.js": "6df5f2d340ec", "js/notificationsModel.js": "94eca84031e5", "js/nutrition.js": "f6d9675a17e2", "js/nutritionGoals.js": "fdc181c33f1a", "js/offlineWrite.js": "49f551296a50", "js/pace-calculator.js": "407f4daa6bea", "js/paceSegments.js": "9e9317c2ac21", "js/paceSuggestions.js": "f979bd67bc8f", "js/packageCatalog.js": "cd485d74c6e0", "js/painLog.js": "d264c8eba657", "js/personalRecords.js": "de469471b9f1", "js/planGenerateDialogs.js": "bb253b0043af", "js/planLaps.js": "7ed9bd5d5e29", "js/planLoadState.js": "d1737453c5d4", "js/planOps.js": "84288ac16423", "js/planOutcome.js": "82a4f800a722", "js/planPrompt.js": "071a4ca221b4", "js/planPromptDialogs.js": "fdfb4e38f7b9", "js/planRelease.js": "289e67c5041c", "js/planRules.js": "5eb58134f466", "js/planShape.js": "aec764cc7040", "js/planSuggestions.js": "4d7431cb34f3", "js/planSuggestionsView.js": "566df83f9e39", "js/planWindow.js": "45188cbb26a4", "js/planWorkspace.js": "df358e33fa03", "js/plannerEvents.js": "08f25cee96db", "js/planningBrief.js": "ef9b322bf6e9", "js/planningContext.js": "1d6275de8408", "js/planningCycle.js": "b3b1dff54a37", "js/planningCycles.js": "aa5ddf2f0880", "js/planningData.js": "40bb440884d4", "js/planningPage.js": "2915740d4282", "js/planningView.js": "3c6a4b497613", "js/prepModel.js": "9f4f32966e32", "js/profile.js": "1ca2b9db681a", "js/profileCheckCard.js": "95c654db9bed", "js/profileChecks.js": "55d0c20df72c", "js/programDayEdit.js": "8c1989183d80", "js/programPrecedence.js": "06f42400d856", "js/programs.js": "b06a4dfed8ed", "js/programsView.js": "1381f7bb91a1", "js/progressView.js": "64c013a69d9f", "js/publicLook.js": "aae08bff440b", "js/publicTour.js": "f6ea6da9cd82", "js/raceBacktest.js": "a2296165b6a0", "js/raceCapability.js": "befc59dc1daa", "js/raceCapabilityCard.js": "a59ed5be8f81", "js/raceCountdown.js": "d74f67cccc43", "js/racePlanEditor.js": "6bcb58060cac", "js/racePlanGenerator.js": "b1a5f567ec36", "js/racePlanStrengthIntegration.js": "3260d2f3f2a7", "js/racePlans.js": "33ee8b7fd77b", "js/raceStrip.js": "21a1437275d6", "js/racesCard.js": "ae47d4c8d943", "js/readiness.js": "0b6f1d856b42", "js/readinessBacktest.js": "73f636e12b59", "js/readinessCard.js": "9e5ff4edbbbc", "js/readinessData.js": "51c5afdafb6b", "js/readinessV2.js": "a5bcad0a6586", "js/readinessV2Data.js": "21bcef754c77", "js/registerSW.js": "790992fae5bb", "js/role.js": "013795db34f2", "js/routeApi.js": "54fb2838b6c5", "js/routeElevation.js": "117b52c8f63c", "js/routeExplain.js": "3ff175ca4274", "js/routeFuel.js": "d7cb60da6a06", "js/routeGeo.js": "06a206730f0c", "js/routeGlobe.js": "bf9916c00caf", "js/routeGpx.js": "7c21bd9d1791", "js/routeLoop.js": "2cc98a75cb8c", "js/routeOptimise.js": "8433d6ff0356", "js/routePrefs.js": "783b1b711105", "js/routeProfile.js": "6127f1ec3294", "js/routeSafety.js": "22cdadd75cb0", "js/routeSafetyStrip.js": "b6bca215b800", "js/routeScore.js": "32681c4e4a9c", "js/routeSettings.js": "8e3d3fd5f793", "js/routeStore.js": "d339f7017dd1", "js/routeSun.js": "0d7ff42be6dd", "js/routes.js": "bca1ca2bef5b", "js/routesShell.js": "fc8e00ee018b", "js/routesTabs.js": "082ae1beb8cc", "js/runCard.js": "a67f0de72630", "js/runCardData.js": "1efa7f906b7f", "js/runConditions.js": "a55da1542f87", "js/runWalk.js": "54a8543a474f", "js/runWorkout.js": "9bf2760d6783", "js/runningCalendar.js": "16a8f920dd12", "js/runningLog.js": "93e44aa09100", "js/runningPlanned.js": "33cfb3e9e778", "js/runningProgramCalendar.js": "c47324317701", "js/runningPrograms.js": "746cfdef0844", "js/schedule.js": "beb4dbf65982", "js/scheduleWeek.js": "06ab12a5031f", "js/scheduling.js": "ccd93b8fc0be", "js/screenCheck.js": "4a9d08ecd938", "js/services.js": "a8c6cd852e44", "js/sessionDialogs.js": "eaf0fa6cb714", "js/sessionDose.js": "0cc9d4751e3e", "js/sessionLogs.js": "3a29918ba46a", "js/sessionModel.js": "23244dbcb87a", "js/sessionPlanCoach.js": "c80aa64f48ce", "js/sessionPlanModel.js": "8ec154a1d91e", "js/sessionPlans.js": "c0cc49f80eee", "js/sessionReport.js": "efce0de5d5ad", "js/sessionShare.js": "903cd5045e23", "js/sessionStore.js": "5c291da4c598", "js/setRunner.js": "2d3615c9b1b0", "js/settings.js": "3ee46915f490", "js/seventyFive.js": "e8e3d7529917", "js/seventyFiveCloud.js": "ffa3709b1f1e", "js/seventyFivePage.js": "135204c1defb", "js/signInCheck.js": "c3b2967546fd", "js/signInErrors.js": "c846f8c99cf7", "js/signInRetry.js": "f281bd423af4", "js/signInTrail.js": "6d4b264f2182", "js/slotBookings.js": "97dce9036189", "js/soccerBooking.js": "674d723fa8cb", "js/soccerPage.js": "4ab3c31bf073", "js/soccerProgress.js": "b415733e4657", "js/start.js": "e47e9cff2834", "js/startCarry.js": "c74c3a1629de", "js/startFlow.js": "bc8d46a94308", "js/stravaArchive.js": "f3362a6e3a11", "js/stravaAuth.js": "71c62ea997c4", "js/stravaConfig.js": "a0d7645995e2", "js/stravaData.js": "5686f818edcc", "js/stravaHistory.js": "f1ff33e66fad", "js/stravaImport.js": "1e760d9d89ff", "js/stravaStore.js": "2675308386cc", "js/strength.js": "dd96930f7e2e", "js/strengthBuilder.js": "3961cd9f798e", "js/strengthBuilderModel.js": "c2a137634fc2", "js/strengthHistory.js": "72284754d885", "js/strengthLibrary.js": "f8743d844f45", "js/strengthLibraryData.js": "a0885a3f9b4e", "js/strengthProgress.js": "74ed179ad206", "js/strengthProgressHtml.js": "be21be491676", "js/strengthProgressView.js": "64b2c7797e4e", "js/strengthRunSteps.js": "8b3df1850852", "js/strengthSchedule.js": "44b4343e0cb0", "js/strengthSession.js": "ed3460e1209a", "js/strengthUnits.js": "064e15a6ce20", "js/strengthWorkout.js": "648540d18cdc", "js/strengthWorkoutList.js": "be9cfa60d943", "js/strengthWorkoutMode.js": "7119409c8824", "js/stripeBilling.js": "35b86b6e6e6e", "js/subnavSwipe.js": "7960997f19cb", "js/svgCharts.js": "bbc7a997059e", "js/syncGuard.js": "da0a6b93ead1", "js/syncMerge.js": "f9db84793d27", "js/syncTimeout.js": "e00c02ba4a8d", "js/testedRuns.js": "c6795fc4382b", "js/testedRunsView.js": "6229758ef074", "js/thisWeekCard.js": "27b210bf0e2a", "js/todayClient.js": "4241b1b74996", "js/todayColumns.js": "935b6efa5e83", "js/todayCues.js": "1188ac678bd8", "js/todayGlance.js": "f1a7c14d15a4", "js/todayHabits.js": "d1db67707cca", "js/todayLayout.js": "907e278838da", "js/tools.js": "c76a518ba3f3", "js/train.js": "c67ef55c4479", "js/trainShapes.js": "255226932235", "js/trainingPlanGenerator.js": "ec1828c914c0", "js/trainingPlanStrengthIntegration.js": "b3d9b7d065bb", "js/trainingPrograms.js": "23256fee56d2", "js/trainingResponse.js": "8f0362886713", "js/trends.js": "492b7c554ff5", "js/trendsData.js": "a3c2260cb16b", "js/trendsView.js": "1c8cca4cb2cb", "js/ui.js": "2de2ebf25be7", "js/updates.js": "66661f9de520", "js/userProfile.js": "253e38a1d228", "js/userSettings.js": "ce787b73ba2a", "js/vdot.js": "ae8846a72964", "js/viewportFix.js": "910275ec6ece", "js/viewportFixModel.js": "b46802d195d9", "js/waterModel.js": "c9b6d5bdc8e7", "js/waterPresets.js": "37b8045b1ad9", "js/waterSea.js": "0c2dfd29db9d", "js/waterSheet.js": "09b648c83cfc", "js/waterSound.js": "ccd377f2055a", "js/waterTide.js": "402fda14707d", "js/wearableActivity.js": "6e35ce095abf", "js/wearablePerformance.js": "e4e9a8023554", "js/wearableRecovery.js": "2e0323509c08", "js/weekChangeData.js": "9a52b286258f", "js/weekChangeDialogs.js": "2f9d049e79f9", "js/weekChanges.js": "972eaa51c050", "js/weekData.js": "b898909c68d4", "js/weekModel.js": "9893bb2ceefd", "js/weekRidge.js": "89c247c6d252", "js/weekStory.js": "4cda07fa76fa", "js/weekTrail.js": "a207fe4c3270", "js/weekView.js": "a569f9e9cef0", "js/weekly-review.js": "a352d8fda53a", "js/weeklyDecision.js": "d400f4adb037", "js/weeklyDecisionData.js": "c57ecc678bec", "js/weeklyLoad.js": "4057ca4a2362", "js/weeklyStory.js": "fc272ac18115", "js/workoutBuilder.js": "7f251f124842", "js/workoutContour.js": "e7e3aac592e5", "js/workoutExecution.js": "14f89b9da437", "js/workoutFuel.js": "46b5e3769a17", "js/workoutPage.js": "7e26e94405e8", "js/workoutQuestions.js": "7e89e527ac9b", "js/workoutResults.js": "7ea26a3acb0c", "js/workoutRibbon.js": "3b5d8494cf1e", "manifest.json": "464767717e8e", "marathon.html": "962758598dd9", "messages.html": "eee399372ffd", "more.html": "4dc5cdf09d1e", "nutrition.html": "de021d37a6d0", "pace-calculator.html": "487f633886b9", "pace.html": "d1d781ccf47b", "packages.html": "87ad26bbaa2e", "plan.html": "6b010c133bfd", "planner.html": "795c3bb87f7a", "planning.html": "c8b7a99bf8b4", "playbook-board.html": "38ad34f455af", "playbook-conditioning.html": "79a384591e52", "playbook-drills.html": "97dbfb76e184", "playbook-fitness.html": "7b1106f7429f", "playbook-game.html": "38b9609ade93", "playbook-practice.html": "6f2a6ddad828", "playbook-results.html": "ae2de7eb1a63", "playbook-roster.html": "18e8ce0fdea4", "playbook-run.html": "52754f818c4b", "playbook-season.html": "1ca726a0086e", "playbook-team.html": "f30e85725a06", "playbook-view.html": "990de0e1980b", "playbook.html": "eaa48738f2de", "privacy.html": "feb8a0322555", "profile.html": "b896ecc0fc45", "programs.html": "b00ef0672cb1", "progress.html": "9c2c263da296", "routes.html": "0a0715f12bf2", "running.html": "6ed27b7494a6", "schedule.html": "eb8961893761", "settings.html": "7fbf27fb6ca8", "site-check.html": "0e2e7e1a50e2", "soccer.html": "c0b5d51d47b0", "start.html": "8568d029dd27", "strength.html": "72627a3bcbd8", "terms.html": "3c09ee4162f6", "tools.html": "9c3e9c978193", "train.html": "3c55f7f50c25", "updates.html": "24a6217dccff", "vendor/leaflet/images/layers-2x.png": "066daca850d8", "vendor/leaflet/images/layers.png": "1dbbe9d028e2", "vendor/leaflet/images/marker-icon-2x.png": "00179c4c1ee8", "vendor/leaflet/images/marker-icon.png": "574c3a5cca85", "vendor/leaflet/images/marker-shadow.png": "264f5c640339", "vendor/leaflet/leaflet.css": "a78371028241", "vendor/leaflet/leaflet.js": "db49d009c841", "weekly-review.html": "81bf1aa0ab01", "workout.html": "ca3834d1a62d" };
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
// At most one switch per half minute: if a new version never takes over, the next page opens
// normally instead of getting the reload page again and again.
let lastSwitchAt = 0;
async function switchVersion() {
    const waiting = self.registration.waiting;
    if (!waiting) return null;
    if (Date.now() - lastSwitchAt < 30000) return null;
    lastSwitchAt = Date.now();
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
