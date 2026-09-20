// The mobile app shell (bottom tab bar + the pill row that lets a
// tab covering several real pages switch between them) is built
// here and injected at runtime rather than duplicated into every
// page's own markup. Desktop keeps the existing dropdown navbar
// untouched; both are simply hidden/shown by a CSS breakpoint.
const BOTTOM_TABS = [
    { key: "today", label: "Today", icon: "home", href: "index.html" },
    { key: "train", label: "Train", icon: "dumbbell", href: "running.html" },
    { key: "health", label: "Health", icon: "heart", href: "nutrition.html" },
    { key: "more", label: "More", icon: "grid", href: "more.html" }
];

const PAGE_TAB = {
    "index.html": "today",
    "running.html": "train",
    "strength.html": "train",
    "cross-training.html": "train",
    "habits.html": "train",
    "nutrition.html": "health",
    "fueling.html": "health",
    "analytics.html": "more",
    "weekly-review.html": "more",
    "gear.html": "more",
    "marathon.html": "more",
    "75day.html": "more",
    "planner.html": "more",
    "pace-calculator.html": "more",
    "settings.html": "more",
    "more.html": "more"
};

// Only tabs that actually bundle multiple real pages need a way to
// switch between siblings -- Today and More are single destinations
// (More's own page is a menu of everything else), so they get none.
const SUBNAV_GROUPS = {
    train: [
        { href: "running.html", label: "Running" },
        { href: "strength.html", label: "Strength" },
        { href: "cross-training.html", label: "Cross-Training" },
        { href: "habits.html", label: "Habits" }
    ],
    health: [
        { href: "nutrition.html", label: "Nutrition" },
        { href: "fueling.html", label: "Fueling" }
    ]
};

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
                    <a href="${tab.href}" class="eos-bottomnav-item ${tab.key === activeTab ? "active" : ""}">
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

        const { login, logout, listenForAuth } = await import("./auth.js");

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

    });
