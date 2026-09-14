fetch("components/header.html")
    .then(response => response.text())
    .then(async (data) => {

        document.getElementById("header").innerHTML = data;

        const page = window.location.pathname.split("/").pop() || "index.html";

        document.querySelectorAll(".nav-links a").forEach(link => {

            if (link.getAttribute("href") === page) {
                link.classList.add("active");
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
