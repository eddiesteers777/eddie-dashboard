fetch("components/header.html")
    .then(response => response.text())
    .then(data => {

        document.getElementById("header").innerHTML = data;

        const page = window.location.pathname.split("/").pop() || "index.html";

        document.querySelectorAll(".nav-links a").forEach(link => {

            if (link.getAttribute("href") === page) {
                link.classList.add("active");
            }

        });

    });
