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

                } else {

                    userName.textContent = "Guest";

                    loginBtn.style.display = "inline-block";
                    logoutBtn.style.display = "none";

                }

            });

        }

    });
