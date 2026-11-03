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
const VERSION = "a6325fa596ae";
const PRECACHE = { "75.html": "b0f37e81cdb0", "75day.html": "8cf2c754fb69", "about.html": "fb96712c5272", "analytics.html": "ad7aeebbddae", "apply.html": "c0ee67a282dc", "brand/sb-mark-forest.svg": "5e7553e173b7", "brand/sb-mark.svg": "8d950022c59c", "brand/sb-tile.svg": "0f77b317ab80", "brand/southbound-logo-forest.svg": "0f9688678ee6", "brand/southbound-logo.svg": "070f3e2656de", "checkin.html": "01bc88f2d2c7", "client.html": "92e3311c5c2a", "clients.html": "2d590c55ddc9", "coach-messages.html": "9352ce62314d", "coach.html": "9e59d98e043b", "coaching.html": "0b429fb7b097", "components/header.html": "7d4017d5de20", "components/publicHeader.html": "6cded4dfcef6", "contact.html": "ed3981005204", "cross-training.html": "24be0faa3d47", "css/analytics.css": "5baa18223c4f", "css/appLook.css": "95f5cb82043e", "css/athlete-state.css": "d3b8f83e392a", "css/checkin.css": "f23f6911179a", "css/client-hub.css": "1caaadf24d5d", "css/client-model.css": "28db7b6cf8f5", "css/client-profile.css": "333388fdcd17", "css/clients.css": "0c9047636c2a", "css/coach.css": "7a047590fb91", "css/coachMessages.css": "f6c5ad283336", "css/corosCoach.css": "afde5e002ab1", "css/corosData.css": "69a79b5dbcf8", "css/corosIntegration.css": "6fa3eeb188fc", "css/cross-training.css": "e909f664ce93", "css/dashboard.css": "89f1d62a6dd3", "css/demo.css": "13ad6f546855", "css/execution.css": "aacc76320bc8", "css/fueling.css": "1e554935cfa3", "css/gear.css": "39eb4a04b8f8", "css/habitScenes.css": "088606573801", "css/habits.css": "2e4aa4298346", "css/home.css": "8f19bd82a8c3", "css/homework.css": "fa11c2efdae4", "css/install.css": "8834402bfd82", "css/intake.css": "accdd77c84c5", "css/marathon.css": "7035216de260", "css/messages.css": "917c72ff8583", "css/more.css": "fc2d516a17af", "css/muscle-map.css": "2354e4f8232c", "css/my-plan.css": "7821123552f6", "css/nutrition.css": "4cd09ed2bcf4", "css/pace-calculator.css": "268d36b4170a", "css/planning.css": "dddd939ab8d7", "css/playbook.css": "ecbcff34571a", "css/programs.css": "f0aafcaf7b63", "css/progress.css": "0068475ede5a", "css/public-example.css": "30b36135e780", "css/public.css": "c80ab1deb1e6", "css/publicFog.css": "7ba65e387d2b", "css/publicLook.css": "b96625855aca", "css/race-plans.css": "466e1e000f34", "css/readiness.css": "0b74a992af07", "css/routes.css": "4430900a486b", "css/running.css": "c800487964dc", "css/schedule.css": "3a1aa010552b", "css/settings.css": "0ac52cda5812", "css/seventyfive.css": "1878d5bcef3d", "css/share.css": "dbd1976230b3", "css/start.css": "11207ad090f5", "css/stravaIntegration.css": "1bdf53da5394", "css/strength-progress.css": "9a185ef850f0", "css/strength.css": "22ff6c3bc75c", "css/strengthLibrary.css": "f7ec4e737cd5", "css/style.css": "8d18009999e6", "css/tools.css": "57c8c2338695", "css/train.css": "b6540167c323", "css/trends.css": "d1e4995eb0e5", "css/updates.css": "6bb0953c6635", "css/waterSheet.css": "4eca3ce967f9", "css/week.css": "252781e78b8b", "css/weekly-review.css": "b32d37befce4", "css/workout.css": "be62e3064f31", "emoji/sb_adjust.svg": "2e37b756a5b6", "emoji/sb_big_effort.svg": "5a9b0ef76052", "emoji/sb_campfire.svg": "f948fd46b224", "emoji/sb_check.svg": "56a8aa6aae8b", "emoji/sb_coach_eye.svg": "2a256b6de0f2", "emoji/sb_coffee.svg": "00507a12e1a0", "emoji/sb_early_miles.svg": "86f0333e2af5", "emoji/sb_easy_day.svg": "c395bef100c1", "emoji/sb_finish.svg": "3d76f215b66c", "emoji/sb_foam_roll.svg": "b0290bde3d9d", "emoji/sb_forest_miles.svg": "5c97bc8bd2eb", "emoji/sb_fuel.svg": "a956c84f3a54", "emoji/sb_gel.svg": "63e165454b09", "emoji/sb_great_work.svg": "745a95ea5420", "emoji/sb_heading_south.svg": "580dc71f3c34", "emoji/sb_high_five.svg": "679343a792f9", "emoji/sb_hill_repeats.svg": "d58bafb0012a", "emoji/sb_hydrate.svg": "e9fc590bd9f2", "emoji/sb_ice_bath.svg": "37c923c03af8", "emoji/sb_lets_go.svg": "7b27cf84130c", "emoji/sb_locked_in.svg": "0dbf442e734c", "emoji/sb_long_run.svg": "3efc554c587f", "emoji/sb_negative_split.svg": "ed61b2cc3569", "emoji/sb_pr.svg": "e2299a0dd4e0", "emoji/sb_race_day.svg": "747a850ecec2", "emoji/sb_rain_run.svg": "4b78ae93fcaf", "emoji/sb_recovery.svg": "8c49bca3c496", "emoji/sb_scheduled.svg": "7046872451ac", "emoji/sb_sleep.svg": "57bb2c04451a", "emoji/sb_soccer.svg": "2fca6da907e4", "emoji/sb_southbound.svg": "4a17e398cfb2", "emoji/sb_strong.svg": "513b401d668a", "emoji/sb_survived.svg": "3b9926697af3", "emoji/sb_tired_proud.svg": "ac406ae7096d", "emoji/sb_trail.svg": "f83f474c8d8c", "emoji/sb_trail_blaze.svg": "e5f938f64b94", "fonts/albert-sans-latin-var.woff2": "c2fb6fda415c", "fonts/big-shoulders-display-latin-var.woff2": "698f9960927e", "fonts/ibm-plex-mono-latin-500.woff2": "01d285447409", "fonts/ibm-plex-mono-latin-600.woff2": "0d1f0b8d0722", "fonts/instrument-sans-latin-var.woff2": "2ee17598a98d", "fonts/inter-latin-var.woff2": "3100e775e861", "fonts/pdf/BigShouldersDisplay-Bold.ttf": "2494a54b4e60", "fonts/pdf/IBMPlexMono-Medium.ttf": "c0af3193c312", "fonts/pdf/InstrumentSans-Bold.ttf": "b8b1cd8ca50e", "fonts/pdf/InstrumentSans-Regular.ttf": "84a515acb294", "fonts/pdf/Saira-ExtraBold.ttf": "7dc280d344a5", "fonts/saira-latin-800.woff2": "ca7a9220a7b6", "fonts/saira-latin-900-italic.woff2": "41db7434e28b", "fuel.html": "0d0157bb7709", "fueling.html": "05d4e5701df7", "gear.html": "1bff6d113a44", "google40072741a539d5b7.html": "46e0008c68b6", "habit-icons/ball.svg": "8469d838a3d7", "habit-icons/bible.svg": "5dea4df8f947", "habit-icons/bike.svg": "b8d7484b9df9", "habit-icons/breathe.svg": "7d9e192c5200", "habit-icons/check.svg": "56a8aa6aae8b", "habit-icons/coffee.svg": "514d7ebb591c", "habit-icons/cold.svg": "f12fdc7b56ae", "habit-icons/core.svg": "12cace49dbc9", "habit-icons/dog.svg": "f3688c986ff3", "habit-icons/family.svg": "1615f3a259c7", "habit-icons/fasting.svg": "2ef73b9a8ba4", "habit-icons/friends.svg": "00366c4178fc", "habit-icons/fruit.svg": "38b98cac9cd6", "habit-icons/goal.svg": "7f0dd6135390", "habit-icons/gratitude.svg": "9b1843df88a1", "habit-icons/journal.svg": "d1f9f657a52b", "habit-icons/love.svg": "71e00156bc2d", "habit-icons/mealprep.svg": "ffd9c973e813", "habit-icons/meals.svg": "d1e02d9b9363", "habit-icons/meditate.svg": "053c64aa3f8f", "habit-icons/money.svg": "56afe941960a", "habit-icons/music.svg": "8cfab1d5c70d", "habit-icons/nature.svg": "bfb954ad07f9", "habit-icons/noalcohol.svg": "abd146b36d10", "habit-icons/nosugar.svg": "d0342dacef6a", "habit-icons/pray.svg": "ec9a3d6c5b73", "habit-icons/protein.svg": "5c5797f22869", "habit-icons/read.svg": "92f01dd485c0", "habit-icons/run.svg": "b159af2a22ba", "habit-icons/sauna.svg": "73687534445d", "habit-icons/screens.svg": "4e08a352cc17", "habit-icons/sleep.svg": "4c0a1e5521ba", "habit-icons/star.svg": "341c5052b608", "habit-icons/steps.svg": "a40d9178801f", "habit-icons/strength.svg": "513b401d668a", "habit-icons/stretch.svg": "9c9de338cd88", "habit-icons/study.svg": "75fd09254d57", "habit-icons/sun.svg": "64af7db0ed91", "habit-icons/swim.svg": "47e80e6a4fe7", "habit-icons/teeth.svg": "9fa8d455ed06", "habit-icons/tidy.svg": "ae42d39fb19f", "habit-icons/veggies.svg": "414ab283a76a", "habit-icons/vitamins.svg": "79ee921ab168", "habit-icons/water.svg": "2913cacc526f", "habit-icons/weigh.svg": "a5cad3457b32", "habit-icons/work.svg": "764717fe5e41", "habit-icons/workout.svg": "06830ed691d3", "habits.html": "873b2398269b", "home.html": "2fbb5e37d15e", "homework.html": "06fbc1efde3b", "icons/apple-touch-icon.png": "fdcea045a12c", "icons/favicon-32.png": "197bd214730d", "icons/icon-192.png": "17f5fa972d82", "icons/icon-512.png": "236b9f965f1d", "icons/icon-maskable-512.png": "f6ffd8417443", "icons/install-qr.svg": "8406cd2541be", "icons/running-bg-map.svg": "fa2ba20bf1d8", "index.html": "fd04aef62355", "install.html": "8dff80f203ce", "js/account.js": "c253eca3be99", "js/accountModel.js": "270c841f1dc7", "js/activeProgramSources.js": "4bb079f8c8e4", "js/analytics.js": "e635b3eccaa5", "js/analyticsLayout.js": "f2e79f439004", "js/analyticsSummary.js": "c26d79b08854", "js/app.js": "d026be9e39bb", "js/appLook.js": "4498312a61fe", "js/appMotion.js": "d039b83f0928", "js/applicationForm.js": "1e0d11da1f8d", "js/applications.js": "ac4075097909", "js/apply.js": "bac839383e18", "js/athleteData.js": "9efdf56730c0", "js/athleteLedger.js": "18c9534596e5", "js/athleteParams.js": "aab3e6d2b538", "js/athleteShare.js": "09a9f210fb34", "js/athleteSources.js": "68940418434b", "js/athleteState.js": "129b923aab28", "js/athleteStateView.js": "309530589a21", "js/auth.js": "d972c1436d63", "js/barcodeScanner.js": "6eef1ebce41d", "js/bodyModel.js": "01424de18914", "js/bodyView.js": "006f68cf10b4", "js/calendarButton.js": "ef6a16d30ff3", "js/calendarExport.js": "ba27724cb067", "js/celebrate.js": "35327302928c", "js/celebrateWeek.js": "2a44c0d7c8ff", "js/changeRequestDialog.js": "7dae9147d5b9", "js/changeRequests.js": "38a539d0aea0", "js/chartTips.js": "de65061d54ec", "js/checkin.js": "64674c94b69a", "js/checkinView.js": "a3d43f901237", "js/checkins.js": "7cce31a5a20a", "js/clientAssignmentModel.js": "358720ba712e", "js/clientDirectory.js": "e8374f426fc0", "js/clientHub.js": "58e47bfe5e8d", "js/clientModel.js": "cea6271b5ddc", "js/clientModelTab.js": "2c8aee11eb82", "js/clientNotes.js": "2d8acc98d641", "js/clientPackageCard.js": "d1be96f3a774", "js/clientPackageModel.js": "aa07bee32805", "js/clientPackages.js": "88573701a6e3", "js/clientProfileForm.js": "ae2e89fbe1c6", "js/clientProgress.js": "c9de8c87edca", "js/clientRecordSchema.js": "6a26081ab908", "js/clientRecords.js": "1fbab5f039b2", "js/clientSummary.js": "0486c934d4fb", "js/clientTimeline.js": "8bd5c910bf10", "js/clients.js": "39321a8cc890", "js/cloudSync.js": "2f05679d46a3", "js/coach.js": "9108973f672d", "js/coachAccess.js": "223e38ff881c", "js/coachCard.js": "9ba95ef1ad97", "js/coachInbox.js": "b2dfccf4012c", "js/coachLibrary.js": "1aa8fc35c222", "js/coachMessages.js": "bfc954072134", "js/coachNotesLocal.js": "6621945d1970", "js/coachPlanGenerator.js": "cc8dd9705abf", "js/coachPlanStore.js": "c8b3233ad2b1", "js/coachPlanSync.js": "f88e8e01bde1", "js/coachPlaybook.js": "874e9847d908", "js/coachToday.js": "d203d998e34b", "js/coachingPlanModel.js": "319016927a42", "js/coachingPlans.js": "90943231ec5d", "js/completedSessions.js": "0c40a362d245", "js/contact.js": "99553ac0e8b5", "js/contactRequests.js": "de825dcebd45", "js/corosAuth.js": "c7c4e9f4c598", "js/corosAutoSend.js": "2fc2d01fd36c", "js/corosClient.js": "144d509d64c7", "js/corosData.js": "9bada9979942", "js/corosDiagnostic.js": "6e6c40457c78", "js/corosHealth.js": "f3940603279e", "js/corosHistory.js": "b421ea59bb53", "js/corosMetrics.js": "ad3d76654a9f", "js/corosParse.js": "6c52a37a704f", "js/corosRuns.js": "481d370144c0", "js/corosSend.js": "e1f9f1a9f810", "js/corosSettings.js": "83ab48a18326", "js/corosStatus.js": "2620d574f487", "js/corosTools.js": "377af4bbedc7", "js/corosWorkout.js": "d76756f3d8db", "js/cross-training.js": "f3b52a6dd4f9", "js/dashboardData.js": "5b771ed4bdd9", "js/decisionCard.js": "e442efb6107b", "js/demoFigure.js": "cc0af9eb8175", "js/effortCard.js": "bf8e50017d2f", "js/effortScale.js": "dc2f3b2fd890", "js/emailNotify.js": "8b65b089cc6a", "js/emoji.js": "64f0fffed12a", "js/emojiPicker.js": "780395707dd9", "js/executionShare.js": "85b9ccebab26", "js/executionView.js": "4fd74fea13ce", "js/exerciseClips.js": "98cc5ac23023", "js/exerciseDemoConfig.js": "debb442e24e1", "js/exerciseDemoRemote.js": "2d88a1f32740", "js/exerciseDemoSheet.js": "9a6ef97ff35c", "js/exerciseDemos.js": "3bcf6f4126f4", "js/exerciseMuscles.js": "6f062c38191f", "js/exerciseSearch.js": "b72bd8658d1a", "js/featuredTraining.js": "860b86b1b095", "js/featuredTrainingModel.js": "410e874e3131", "js/feedbackModel.js": "19af41c8de5d", "js/firebase.js": "5ded88119c35", "js/firestore.js": "07ac6e647c48", "js/fitParse.js": "add4f25a9224", "js/fitWorkout.js": "3b2db6de9187", "js/fluidUnits.js": "1040e5fdc51d", "js/foodSearch.js": "593d76de08bd", "js/footerRail.js": "8f047379ace0", "js/formDraft.js": "1b6a849f9396", "js/fuelClock.js": "908555aa7c9f", "js/fuelClockModel.js": "24b5a09df5cc", "js/fuelCourse.js": "3db0c2facb75", "js/fuelDetails.js": "34cd7954168e", "js/fuelDrafts.js": "baf7520c9b70", "js/fuelPdf.js": "a66db61f36e6", "js/fuelPdfModel.js": "fba22b787cb6", "js/fuelProfile.js": "2f89611a7d11", "js/fuelSchedule.js": "701564ffa847", "js/fuelScheduleView.js": "43d3400e2a6a", "js/fuelSources.js": "436ca087b49c", "js/fuelSteps.js": "fc47c410eda2", "js/fuelStepsModel.js": "5afb3f575110", "js/fuelTargets.js": "369979bb5478", "js/fueling.js": "db823aa358b2", "js/fuelingPlans.js": "2e2716215fa9", "js/gear.js": "4cca2841c569", "js/guestFuel.js": "2b4166f2d98d", "js/habitDefaults.js": "02e179656c33", "js/habitIconPicker.js": "edf38a1fa4c7", "js/habitIconSet.js": "292c0f0563a5", "js/habitImpact.js": "4fdc34d99f3e", "js/habitLineIcons.js": "8298057c836a", "js/habitProgress.js": "ddbebfa20609", "js/habitScenes.js": "158b864efcb6", "js/habits.js": "fc2c4eb43b1f", "js/habitsCard.js": "691a8773f3e3", "js/healthReviewed.js": "34b306fcc2b4", "js/healthStatsSetting.js": "7134477ededd", "js/heatCard.js": "642425c085a9", "js/homeHero.js": "0122a0f15534", "js/homeSky.js": "eb2729e819b4", "js/homeSkyModel.js": "a739b64ef0d1", "js/homeStoryModel.js": "e1f819a17cf6", "js/homework.js": "90c8bc2db968", "js/homeworkClient.js": "8269d815c357", "js/homeworkCoach.js": "4d2a78b92a33", "js/homeworkModel.js": "8c0ecd679296", "js/homeworkQuality.js": "d6da410347b4", "js/homeworkView.js": "bfd011eb13ea", "js/hrZones.js": "affacd995657", "js/hrZonesTool.js": "afec77a5575b", "js/icons.js": "1d0222bbbae9", "js/inquiries.js": "39a38ee35151", "js/install.js": "e162025b205c", "js/intakeFlow.js": "12fee371fd5d", "js/intakeGuide.js": "18db51e3955d", "js/interestPicker.js": "f801d78d92c9", "js/loadCard.js": "9c2116eef9c9", "js/loadHeader.js": "e2c8fdd56441", "js/loadPublicHeader.js": "a5522c5563ec", "js/loadState.js": "57dcec013bf1", "js/marathonCoros.js": "effa4d360910", "js/marathonCorosButton.js": "f77c4fc6cbb8", "js/marathonData.js": "41c993ae3e11", "js/marathonSwap.js": "cf4fcc98acf2", "js/marathonToday.js": "15f5a7c95166", "js/marathonWeek.js": "82a950b556af", "js/messageThread.js": "c8c79b92e0d6", "js/messageView.js": "43d17706f57f", "js/messages.js": "074f5b07042d", "js/messagesPage.js": "3e10fa5e7872", "js/monthModel.js": "914f8c1e8933", "js/muscleMap.js": "f5ce73f9c296", "js/myPlan.js": "f297184422e1", "js/navAccess.js": "dd33819ba41a", "js/netStatus.js": "dfac122a7fc7", "js/notifications.js": "7520e97d728d", "js/notificationsModel.js": "8f09c1d64ccf", "js/nutrition.js": "d14b3c20d554", "js/nutritionGoals.js": "a48a63169d73", "js/offlineWrite.js": "b279543d24f7", "js/pace-calculator.js": "162cba62e245", "js/paceSegments.js": "e77e7919d190", "js/paceSuggestions.js": "925df91cc188", "js/packageCatalog.js": "4ea272ba8025", "js/painLog.js": "fa97d24b213b", "js/personalRecords.js": "525c6a6d940d", "js/planGenerateDialogs.js": "cf6da9fa46b6", "js/planLaps.js": "11c4bbf61729", "js/planLoadState.js": "0d400424c50a", "js/planOps.js": "91cdd9ffa9e7", "js/planOutcome.js": "2221e8356488", "js/planPrompt.js": "32ff69446f68", "js/planPromptDialogs.js": "1054128c2f0d", "js/planRelease.js": "dc09174e6ccd", "js/planRules.js": "4584d9986aae", "js/planShape.js": "d8eabce3be19", "js/planSuggestions.js": "ecd8e4e4b771", "js/planSuggestionsView.js": "db8ad146bf49", "js/planWindow.js": "d67c517e4ced", "js/planWorkspace.js": "04c8593c0827", "js/plannerEvents.js": "bbd566f3cef7", "js/planningBrief.js": "405ee06b0e34", "js/planningContext.js": "104d178d5c41", "js/planningCycle.js": "b0debdf75749", "js/planningCycles.js": "d85bb4a30f22", "js/planningData.js": "059ba108b8b2", "js/planningPage.js": "ad9380bf70cb", "js/planningView.js": "f564c0a62f76", "js/prepModel.js": "e48f8ae02588", "js/profile.js": "3da84d54de4e", "js/profileCheckCard.js": "87b1121e4038", "js/profileChecks.js": "846ccd73d015", "js/programs.js": "048f9e1a0167", "js/programsView.js": "2b41f3cbe179", "js/progressView.js": "d07b98166725", "js/publicLook.js": "41768523d6e2", "js/publicTour.js": "4ba3f605f853", "js/raceBacktest.js": "32d22d09cc84", "js/raceCapability.js": "ecd4d81d86e8", "js/raceCapabilityCard.js": "490de8409571", "js/raceCountdown.js": "6a4c9675b5cf", "js/racePlanEditor.js": "6532a668debc", "js/racePlanGenerator.js": "9e3d58e7546f", "js/racePlanStrengthIntegration.js": "958d108d35f5", "js/racePlans.js": "aaea4e1be69d", "js/raceStrip.js": "b70745101b2a", "js/racesCard.js": "1d11e0b33275", "js/readiness.js": "0adcbc749ec5", "js/readinessBacktest.js": "66404a026511", "js/readinessCard.js": "0c31c2da2acc", "js/readinessData.js": "4df901df90bb", "js/readinessV2.js": "b4d828d22420", "js/readinessV2Data.js": "5bc4801f091a", "js/registerSW.js": "5210257b3cc5", "js/role.js": "e82f7b0b8d96", "js/routeApi.js": "51c1d2a7f02d", "js/routeElevation.js": "d647361fbd08", "js/routeExplain.js": "eadd8dd53755", "js/routeFuel.js": "e437f3956de1", "js/routeGeo.js": "acc20e9b9c60", "js/routeGlobe.js": "78dbcf309ce1", "js/routeGpx.js": "9b1845923259", "js/routeLoop.js": "dd9838f1d8b1", "js/routeOptimise.js": "3c2d08b729ee", "js/routePrefs.js": "fc8ca6ec20dc", "js/routeProfile.js": "5fb02a56e10c", "js/routeSafety.js": "4b8eac07388f", "js/routeSafetyStrip.js": "639682a269a0", "js/routeScore.js": "50d814710398", "js/routeSettings.js": "f8d6d6938a78", "js/routeStore.js": "1804f06217d6", "js/routeSun.js": "eeac8be922b6", "js/routes.js": "64bbcbb6c139", "js/routesShell.js": "1cc8f54e7766", "js/routesTabs.js": "2d12dd9e9d51", "js/runCard.js": "6fc39d3da1d1", "js/runCardData.js": "4bb802d4445e", "js/runConditions.js": "30479ce6e6d8", "js/runWalk.js": "b92918c88047", "js/runWorkout.js": "a66694ab648f", "js/runningCalendar.js": "680a781a0753", "js/runningLog.js": "c82523053af1", "js/runningProgramCalendar.js": "540f3700e0f5", "js/runningPrograms.js": "7e50a63234de", "js/schedule.js": "80b892fad781", "js/scheduleWeek.js": "205a35db7ff5", "js/scheduling.js": "f700a578bf5c", "js/screenCheck.js": "b4b24f456814", "js/services.js": "f36229936f95", "js/sessionDialogs.js": "7eb562a59151", "js/sessionDose.js": "12ca374b88c3", "js/sessionLogs.js": "4ddcd4cd817f", "js/sessionModel.js": "11a49ce8671b", "js/sessionPlanCoach.js": "56357aea5ba2", "js/sessionPlanModel.js": "e01ceff458d9", "js/sessionPlans.js": "0dddc1936699", "js/sessionReport.js": "1d83c2d5dc9a", "js/sessionShare.js": "7a0aa07e3d76", "js/sessionStore.js": "df78fd0086bf", "js/setRunner.js": "717a2671ff5b", "js/settings.js": "d29270156f15", "js/seventyFive.js": "d54a4ece6895", "js/seventyFiveCloud.js": "5114b8a816cb", "js/seventyFivePage.js": "537a213e8ad8", "js/signInErrors.js": "07047910683c", "js/slotBookings.js": "ab9b987ada35", "js/soccerBooking.js": "74f2f02b52c6", "js/start.js": "85f079d27c95", "js/startCarry.js": "42351f4d2983", "js/startFlow.js": "9035e6b944f0", "js/stravaArchive.js": "8f7f3bae0eb8", "js/stravaAuth.js": "ce8f485981ff", "js/stravaConfig.js": "f99bd18a591e", "js/stravaData.js": "436e6db95aa5", "js/stravaHistory.js": "f1d7bac5929c", "js/stravaImport.js": "970f54a6bb40", "js/stravaStore.js": "f403c36bbaa4", "js/strength.js": "71af9f785ce7", "js/strengthBuilder.js": "de3ef77e09f0", "js/strengthBuilderModel.js": "616b52c33c27", "js/strengthHistory.js": "499b128cdecb", "js/strengthLibrary.js": "22e0c5e35ee3", "js/strengthLibraryData.js": "5c2e8d1e6e9e", "js/strengthProgress.js": "60ca864c960f", "js/strengthProgressHtml.js": "3a97db822757", "js/strengthProgressView.js": "32f5ac2c08b7", "js/strengthRunSteps.js": "1a772ad73fde", "js/strengthSchedule.js": "17335b367895", "js/strengthSession.js": "eb8083da7824", "js/strengthUnits.js": "b03afd2b0f38", "js/strengthWorkout.js": "8f81d13cc868", "js/strengthWorkoutList.js": "bb50538c5dff", "js/strengthWorkoutMode.js": "8cc66be91288", "js/stripeBilling.js": "e8ea7f7d38f8", "js/subnavSwipe.js": "421fc8eba231", "js/svgCharts.js": "36ef399b2dc8", "js/syncMerge.js": "5dc529ad47c6", "js/thisWeekCard.js": "94ce03d9892c", "js/todayClient.js": "f78d0f2a64bc", "js/todayColumns.js": "9b6a365c59aa", "js/todayCues.js": "e99330a8b43d", "js/todayGlance.js": "fe0223dd28c0", "js/todayHabits.js": "ed69eb578f97", "js/todayLayout.js": "f994c118fe92", "js/tools.js": "f7c3c3b19ba4", "js/train.js": "c2121f3dc657", "js/trainShapes.js": "e15b06195be9", "js/trainingPlanGenerator.js": "23ca04e0833d", "js/trainingPlanStrengthIntegration.js": "62f149ea5861", "js/trainingPrograms.js": "41d645b60946", "js/trainingResponse.js": "9c133621ead2", "js/trends.js": "37ce896df050", "js/trendsData.js": "0a8ecf9b6365", "js/trendsView.js": "47971b16dc52", "js/ui.js": "0352c9ccf213", "js/updates.js": "895f079a0d28", "js/userProfile.js": "bc31d0352cdf", "js/userSettings.js": "ac4f78538432", "js/vdot.js": "9dc06a0e27ce", "js/viewportFix.js": "d86199db5d96", "js/viewportFixModel.js": "69745980a3ad", "js/waterModel.js": "54ac253034c4", "js/waterSea.js": "ea597a983297", "js/waterSheet.js": "053eabc4c9c5", "js/waterSound.js": "80802cfa370a", "js/waterTide.js": "f2c1e5e0c28f", "js/wearableActivity.js": "a8fdd9fe5785", "js/wearablePerformance.js": "dedd30b0b17b", "js/wearableRecovery.js": "821734cf4354", "js/weekChangeData.js": "c7442c89f342", "js/weekChangeDialogs.js": "e0c30ede60d3", "js/weekChanges.js": "fba25038f46d", "js/weekData.js": "04a8ae03f3d2", "js/weekModel.js": "31e5c1676c43", "js/weekRidge.js": "0b981714f7f6", "js/weekStory.js": "ae8f1d71a900", "js/weekTrail.js": "b16c9e0da006", "js/weekView.js": "3e6c99ad7d08", "js/weekly-review.js": "ad4ad68ffb0a", "js/weeklyDecision.js": "39441e177c07", "js/weeklyDecisionData.js": "ba456129e005", "js/weeklyLoad.js": "33a04749a219", "js/weeklyStory.js": "ba1790e5acc8", "js/workoutBuilder.js": "364c4bc8d7cb", "js/workoutContour.js": "fccdc2fa3477", "js/workoutExecution.js": "f271ea878549", "js/workoutFuel.js": "daccc81d477c", "js/workoutPage.js": "00a24aa00421", "js/workoutQuestions.js": "9f47ad9c60f1", "js/workoutResults.js": "cadfb2ed1f89", "js/workoutRibbon.js": "076f73073a76", "manifest.json": "8212c853eb0f", "marathon.html": "4c6414c39a74", "messages.html": "94b21164012f", "more.html": "b532cf66df16", "nutrition.html": "ee717783fc25", "pace-calculator.html": "3ba8b4ae876f", "pace.html": "9d1012000f23", "packages.html": "c0e88e942f31", "plan.html": "6114f6f3030b", "planner.html": "8d57e44a03ac", "planning.html": "0c2f5400a8ce", "playbook-board.html": "37372895db39", "playbook-conditioning.html": "7920c93c708e", "playbook-drills.html": "f4d97ae12da7", "playbook-fitness.html": "d9bf4835c70f", "playbook-game.html": "9acb67c9fa10", "playbook-practice.html": "e50c4727fb50", "playbook-results.html": "d5a3f99c7756", "playbook-roster.html": "fa048af34ecc", "playbook-run.html": "2dae9117b77c", "playbook-season.html": "ad07be5fb693", "playbook-team.html": "d87379d090c1", "playbook-view.html": "0ef3563d44fd", "playbook.html": "6d669eaedb06", "privacy.html": "9fb16eab0b67", "profile.html": "92164e4d7677", "programs.html": "129e559c89e3", "progress.html": "8a34d3b0ec13", "routes.html": "cc7919c14403", "running.html": "23f7a91ed203", "schedule.html": "f782660b6bc3", "settings.html": "6874f6301255", "site-check.html": "445b7023f802", "soccer.html": "48b2ad9cea1b", "start.html": "c02b48588f13", "strength.html": "24d8d774b0fd", "tools.html": "f37a1bfc946b", "train.html": "051953d4b028", "updates.html": "a5e63454427c", "vendor/leaflet/images/layers-2x.png": "066daca850d8", "vendor/leaflet/images/layers.png": "1dbbe9d028e2", "vendor/leaflet/images/marker-icon-2x.png": "00179c4c1ee8", "vendor/leaflet/images/marker-icon.png": "574c3a5cca85", "vendor/leaflet/images/marker-shadow.png": "264f5c640339", "vendor/leaflet/leaflet.css": "a78371028241", "vendor/leaflet/leaflet.js": "3104b526504d", "weekly-review.html": "ac671ecd74e6", "workout.html": "4e0d5654c78a" };
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
