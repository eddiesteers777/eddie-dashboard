// The mobile app shell (bottom tab bar + the pill row that lets a
// tab covering several real pages switch between them) is built
// here and injected at runtime rather than duplicated into every
// page's own markup. Desktop keeps the existing dropdown navbar
// untouched; both are simply hidden/shown by a CSS breakpoint.
const BOTTOM_TABS = [
    { key: "today", label: "Today", icon: "home", href: "index.html", color: "var(--primary)" },
    { key: "train", label: "Train", icon: "dumbbell", href: "running.html", color: "var(--orange)" },
    { key: "health", label: "Health", icon: "heart", href: "nutrition.html", color: "var(--pink)" },
    { key: "habits", label: "Habits", icon: "checkCircle", href: "habits.html", color: "var(--purple)" },
    { key: "more", label: "More", icon: "grid", href: "more.html", color: "var(--muted)" }
];

const PAGE_TAB = {
    "index.html": "today",
    "running.html": "train",
    "strength.html": "train",
    "cross-training.html": "train",
    "habits.html": "habits",
    "nutrition.html": "health",
    "fueling.html": "health",
    "analytics.html": "more",
    "weekly-review.html": "more",
    "gear.html": "more",
    "marathon.html": "more",
    "75day.html": "more",
    "planner.html": "more",
    "programs.html": "more",
    "pace-calculator.html": "more",
    "settings.html": "more",
    "more.html": "more"
};

// Only tabs that actually bundle multiple real pages need a way to
// switch between siblings -- Today, Habits, and More are each a
// single destination (More's own page is a menu of everything
// else), so they get none.
const SUBNAV_GROUPS = {
    train: [
        { href: "running.html", label: "Running" },
        { href: "strength.html", label: "Strength" },
        { href: "cross-training.html", label: "Cross-Training" }
    ],
    health: [
        { href: "nutrition.html", label: "Nutrition" },
        { href: "fueling.html", label: "Fueling" }
    ]
};

// Destinations the mobile search overlay can jump to -- a quick-jump
// list of real pages, not a search over logged content (runs, meals,
// etc.). Simple on purpose; can grow into real content search later.
// Colors match the same destination everywhere it shows up (bottom
// nav, More's rows, here) instead of everything defaulting to blue.
const SEARCH_DESTINATIONS = [
    { label: "Today", href: "index.html", icon: "home", color: "var(--primary)" },
    { label: "Running", href: "running.html", icon: "activity", color: "var(--primary-dark)" },
    { label: "Strength", href: "strength.html", icon: "dumbbell", color: "var(--orange)" },
    { label: "Cross-Training", href: "cross-training.html", icon: "bike", color: "var(--cyan)" },
    { label: "Habits", href: "habits.html", icon: "checkCircle", color: "var(--purple)" },
    { label: "Nutrition", href: "nutrition.html", icon: "apple", color: "var(--green)" },
    { label: "Fueling", href: "fueling.html", icon: "fuel", color: "var(--red)" },
    { label: "Marathon Plan", href: "marathon.html", icon: "activity", color: "var(--primary-dark)" },
    { label: "75-Day Challenge", href: "75day.html", icon: "flame", color: "var(--green)" },
    { label: "Analytics", href: "analytics.html", icon: "trendingUp", color: "var(--amber)" },
    { label: "Weekly Review", href: "weekly-review.html", icon: "clipboard", color: "var(--purple-light)" },
    { label: "Gear", href: "gear.html", icon: "footprint", color: "var(--pink)" },
    { label: "Planner", href: "planner.html", icon: "calendar", color: "var(--cyan-light)" },
    { label: "Programs", href: "programs.html", icon: "target", color: "var(--indigo)" },
    { label: "Pace Calculator", href: "pace-calculator.html", icon: "timer", color: "var(--primary)" },
    { label: "Settings", href: "settings.html", icon: "user", color: "var(--muted)" },
    { label: "More", href: "more.html", icon: "grid", color: "var(--muted)" }
];

function escapeForHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

fetch("components/header.html")
    .then(response => response.text())
    .then(async (data) => {

        document.getElementById("header").innerHTML = data;

        // The header's icons are injected after icons.js's own
        // DOMContentLoaded hydration already ran, so this content
        // needs a manual pass.
        const { hydrate, icon } = await import("./icons.js");
        hydrate();

        const page = window.location.pathname.split("/").pop() || "index.html";

        const activeTab = PAGE_TAB[page] || null;

        document.body.insertAdjacentHTML("beforeend", `
            <nav class="eos-bottomnav" aria-label="Primary">
                ${BOTTOM_TABS.map(tab => `
                    <a href="${tab.href}" class="eos-bottomnav-item ${tab.key === activeTab ? "active" : ""}" style="--tab-color:${tab.color}">
                        <span class="eos-bottomnav-icon">${icon(tab.icon)}</span>
                        <span>${tab.label}</span>
                    </a>
                `).join("")}
            </nav>
        `);

        const subnavPages = SUBNAV_GROUPS[activeTab];

        if (subnavPages) {
            document.getElementById("header").insertAdjacentHTML("afterend", `
                <div class="eos-subnav" aria-label="Section pages">
                    ${subnavPages.map(p => `
                        <a href="${p.href}" class="eos-subnav-link ${p.href === page ? "active" : ""}">${p.label}</a>
                    `).join("")}
                </div>
            `);
        }

        // ---- Mobile quick-add (+) menu ----

        const quickAddWrap = document.querySelector(".eos-mobile-quickadd");
        const quickAddBtn = document.getElementById("quickAddBtn");
        const quickAddWorkoutLink = document.getElementById("quickAddWorkoutLink");

        function closeQuickAdd() {
            quickAddWrap?.classList.remove("open");
            quickAddBtn?.setAttribute("aria-expanded", "false");
        }

        if (quickAddWrap && quickAddBtn) {

            // Point "Start a Workout" at today's actual scheduled
            // workout when there is one, same lookup the dashboard's
            // own Today card uses -- falls back to plain
            // strength.html (its default href) otherwise.
            try {
                const today = new Date();
                const scheduleKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                const schedule = JSON.parse(localStorage.getItem("strength-schedule") || "null");
                const plan = JSON.parse(localStorage.getItem("strength-plan") || "null");
                const planDayIds = new Set((plan?.days || []).map(day => day.id));

                const todayItem = (schedule?.items || []).find(
                    item => item.date === scheduleKey && !item.completed
                );

                const dayId = todayItem?.workoutId?.startsWith("plan-")
                    ? todayItem.workoutId.slice(5)
                    : null;

                if (dayId && planDayIds.has(dayId) && quickAddWorkoutLink) {
                    quickAddWorkoutLink.href = `strength.html?startWorkout=${dayId}`;
                }
            } catch {
                // No schedule data -- link already defaults to strength.html.
            }

            quickAddBtn.addEventListener("click", event => {
                event.stopPropagation();
                const isOpen = quickAddWrap.classList.toggle("open");
                quickAddBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
            });

            quickAddWrap.querySelectorAll(".eos-mobile-quickadd-link").forEach(link => {
                link.addEventListener("click", closeQuickAdd);
            });

            document.addEventListener("click", event => {
                if (!event.target.closest(".eos-mobile-quickadd")) {
                    closeQuickAdd();
                }
            });

        }

        // ---- Mobile search overlay ----

        const searchBtn = document.getElementById("mobileSearchBtn");
        const searchOverlay = document.getElementById("searchOverlay");
        const searchInput = document.getElementById("searchInput");
        const searchResults = document.getElementById("searchResults");
        const searchCloseBtn = document.getElementById("searchCloseBtn");

        function renderSearchResults(query) {
            if (!searchResults) return;

            const q = query.trim().toLowerCase();
            const matches = q
                ? SEARCH_DESTINATIONS.filter(d => d.label.toLowerCase().includes(q))
                : SEARCH_DESTINATIONS;

            searchResults.innerHTML = matches.length
                ? matches.map(d => `
                    <a href="${d.href}" class="eos-search-result">
                        <span class="eos-search-result-icon" style="color:${d.color}">${icon(d.icon)}</span>
                        <span>${escapeForHtml(d.label)}</span>
                    </a>
                `).join("")
                : `<div class="eos-search-empty">No matches for "${escapeForHtml(query)}"</div>`;
        }

        function openSearch() {
            if (!searchOverlay) return;
            renderSearchResults("");
            searchOverlay.classList.add("open");
            searchInput?.focus();
        }

        function closeSearch() {
            if (!searchOverlay) return;
            searchOverlay.classList.remove("open");
            if (searchInput) searchInput.value = "";
        }

        if (searchBtn && searchOverlay) {

            searchBtn.addEventListener("click", openSearch);
            searchCloseBtn?.addEventListener("click", closeSearch);
            searchInput?.addEventListener("input", () => renderSearchResults(searchInput.value));

            searchInput?.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    searchResults?.querySelector(".eos-search-result")?.click();
                }
            });

        }

        document.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            closeQuickAdd();
            if (searchOverlay?.classList.contains("open")) closeSearch();
        });

        document.querySelectorAll(".nav-links a").forEach(link => {

            if (link.getAttribute("href") === page) {
                link.classList.add("active");

                // Also give the parent dropdown's own trigger a
                // persistent highlight, so it's clear which section
                // you're in even after the menu itself closes --
                // not just the one link inside it.
                const parentDropdown = link.closest(".eos-dropdown");
                const trigger = parentDropdown?.querySelector(".eos-dropdown-trigger");
                trigger?.classList.add("section-active");
            }

        });

        // ---- Dropdown coordination ----
        // Native <details> elements have zero built-in awareness of
        // each other or of clicks elsewhere on the page: opening one
        // doesn't close another, and clicking outside does nothing.
        // Both are needed for the menu to feel like one coordinated
        // nav bar rather than five independent widgets.

        const dropdowns = Array.from(document.querySelectorAll(".eos-dropdown"));

        function closeAllDropdowns(except = null) {
            dropdowns.forEach(dropdown => {
                if (dropdown !== except && dropdown.open) {
                    dropdown.open = false;
                }
            });
        }

        dropdowns.forEach(dropdown => {

            dropdown.addEventListener("toggle", () => {
                if (dropdown.open) {
                    closeAllDropdowns(dropdown);
                }
            });

            dropdown.querySelectorAll(".eos-dropdown-link").forEach(link => {
                // Close immediately on selection rather than leaving
                // the menu open while the page navigates away.
                link.addEventListener("click", () => {
                    dropdown.open = false;
                });
            });

        });

        document.addEventListener("click", event => {
            if (!event.target.closest(".eos-dropdown")) {
                closeAllDropdowns();
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                closeAllDropdowns();
            }
        });

        // ---- Wire up Google Sign-In / Sign-Out ----
        // auth.js pulls in the Firebase SDK from gstatic.com -- if
        // that fetch ever fails (offline, a blocked domain, a CDN
        // hiccup), the dynamic import throws. Previously nothing
        // downstream of it was wrapped, so that one failure silently
        // killed dropdown coordination, the mobile quick-add menu,
        // search, everything else this function still had left to
        // wire up. No-op stubs here mean a broken/unavailable auth.js
        // just leaves sign-in non-functional (the only thing it
        // actually can't do without Firebase) instead of taking the
        // rest of the header down with it.

        let login = async () => false;
        let logout = async () => {};
        let listenForAuth = () => {};

        try {
            ({ login, logout, listenForAuth } = await import("./auth.js"));
        } catch (error) {
            console.warn("EddieOS: auth.js unavailable this session -- sign-in features disabled.", error);
        }

        const userName = document.getElementById("user-name");
        const loginBtn = document.getElementById("loginBtn");
        const logoutBtn = document.getElementById("logoutBtn");
        const syncBtn = document.getElementById("syncStatusBtn");
        const syncText = document.getElementById("syncStatusText");

        function formatRelativeTime(ts) {

            if (!ts) return "never synced on this device";

            const diffSec = Math.round((Date.now() - ts) / 1000);

            if (diffSec < 10) return "just now";
            if (diffSec < 60) return diffSec + "s ago";

            const diffMin = Math.round(diffSec / 60);

            if (diffMin < 60) return diffMin + "m ago";

            const diffHr = Math.round(diffMin / 60);

            if (diffHr < 24) return diffHr + "h ago";

            return Math.round(diffHr / 24) + "d ago";

        }

        async function refreshSyncStatus() {

            if (!syncBtn || !syncText) return;

            const { getSyncStatus } = await import("./cloudSync.js");

            const status = getSyncStatus();

            if (status.lastError && status.lastError !== "not-signed-in") {

                syncBtn.classList.add("sync-error");
                syncText.textContent = "Sync error \u2014 tap to retry";
                syncBtn.title = "Last sync error: " + status.lastError;

            } else {

                syncBtn.classList.remove("sync-error");
                syncText.textContent = "Synced " + formatRelativeTime(status.lastSyncedAt);
                syncBtn.title = "Click to sync now";

            }

        }

        if (syncBtn) {

            syncBtn.addEventListener("click", async () => {

                syncBtn.disabled = true;
                syncBtn.classList.add("sync-syncing");
                syncText.textContent = "Syncing\u2026";

                const { pullFromCloud, pushToCloud } = await import("./cloudSync.js");

                // Pull first (grab anything newer from another device),
                // then push (make sure this device's current state is
                // saved too) \u2014 a manual tap should leave both sides
                // fully caught up, not just check one direction.
                await pullFromCloud();
                await pushToCloud();

                syncBtn.classList.remove("sync-syncing");
                syncBtn.disabled = false;

                // Reload so whatever was just pulled actually shows up
                // on screen, instead of sitting correctly in
                // localStorage but not reflected in this page's render.
                window.location.reload();

            });

        }

        if (loginBtn) {

            loginBtn.addEventListener("click", async () => {

                loginBtn.disabled = true;
                loginBtn.textContent = "Signing in…";

                const success = await login();

                if (success) {

                    window.location.reload();

                } else {

                    loginBtn.disabled = false;
                    loginBtn.textContent = "Sign In";

                }

            });

        }

        if (logoutBtn) {

            logoutBtn.addEventListener("click", async () => {

                await logout();
                window.location.reload();

            });

        }

        if (userName && loginBtn && logoutBtn) {

            listenForAuth((user) => {

                if (user) {

                    userName.textContent = user.displayName ? user.displayName.split(" ")[0] : "Runner";

                    loginBtn.style.display = "none";
                    logoutBtn.style.display = "inline-block";

                    if (syncBtn) {

                        syncBtn.style.display = "inline-flex";

                        refreshSyncStatus();

                        // Keep the displayed "Xm ago" honest without
                        // requiring a reload \u2014 background syncs
                        // (visibilitychange/interval) update the
                        // underlying status even if this tab never
                        // reloads.
                        setInterval(refreshSyncStatus, 15000);

                    }

                } else {

                    userName.textContent = "Guest";

                    loginBtn.style.display = "inline-block";
                    logoutBtn.style.display = "none";

                    if (syncBtn) syncBtn.style.display = "none";

                }

            });

        }

        // ---- Sign-in prompt ----
        // Nudges a guest to sign in, once per browser session
        // (same gating pattern as the launch splash), regardless of
        // which page happens to be the first one this session lands
        // on. Dismissible -- this is a nudge, not a hard gate; guest
        // use stays fully functional, just device-local.

        const SIGNIN_PROMPT_KEY = "eddieos-signin-prompt-shown";

        function closeSigninPrompt() {
            const overlay = document.getElementById("signinPromptOverlay");

            if (!overlay) return;

            overlay.classList.remove("open");
            setTimeout(() => overlay.remove(), 250);
        }

        function showSigninPrompt() {
            if (document.getElementById("signinPromptOverlay")) return;

            document.body.insertAdjacentHTML("beforeend", `
                <div class="eos-signin-overlay" id="signinPromptOverlay">
                    <div class="eos-signin-modal">
                        <div class="eos-signin-icon">${icon("cloud")}</div>
                        <h2>Sign in to save your progress</h2>
                        <p>
                            You're using EddieOS as a guest. Changes you make --
                            workouts, habits, nutrition logs, and more -- are only
                            saved on this device. Sign in with Google to back
                            everything up and keep it in sync if you ever switch
                            devices.
                        </p>
                        <div class="eos-signin-actions">
                            <button type="button" class="eos-signin-btn primary" id="signinPromptLoginBtn">
                                Sign In with Google
                            </button>
                            <button type="button" class="eos-signin-btn secondary" id="signinPromptDismissBtn">
                                Continue as Guest
                            </button>
                        </div>
                    </div>
                </div>
            `);

            const overlay = document.getElementById("signinPromptOverlay");
            const promptLoginBtn = document.getElementById("signinPromptLoginBtn");
            const dismissBtn = document.getElementById("signinPromptDismissBtn");

            requestAnimationFrame(() => overlay.classList.add("open"));

            overlay.addEventListener("click", event => {
                if (event.target === overlay) closeSigninPrompt();
            });

            dismissBtn.addEventListener("click", closeSigninPrompt);

            promptLoginBtn.addEventListener("click", async () => {
                promptLoginBtn.disabled = true;
                promptLoginBtn.textContent = "Signing in…";

                const success = await login();

                if (success) {
                    window.location.reload();
                } else {
                    promptLoginBtn.disabled = false;
                    promptLoginBtn.textContent = "Sign In with Google";
                }
            });
        }

        listenForAuth(user => {
            if (user) return;

            let alreadyShown = false;

            try {
                alreadyShown = !!sessionStorage.getItem(SIGNIN_PROMPT_KEY);
                sessionStorage.setItem(SIGNIN_PROMPT_KEY, "1");
            } catch {
                // Storage unavailable -- fall through and show it
                // this once rather than nag on every render.
            }

            if (!alreadyShown) {
                showSigninPrompt();
            }
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                closeSigninPrompt();
            }
        });

    });
