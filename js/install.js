/* ==========================================
   Southbound — Get the App

   Device-aware install instructions. iOS has no API a page can call
   to trigger "Add to Home Screen" -- Apple deliberately left that
   out -- so the best a page can do is detect the device and show the
   right manual steps, one at a time, plus catch in-app browsers
   (Instagram, Facebook...) that can't install at all. Android and
   desktop Chrome / Edge do expose a real install trigger
   (beforeinstallprompt), so those get an actual button, and only
   when the browser offers it.

   The steps are written to be read BEFORE opening the Share sheet
   (it covers this page), so each guide ends with a one-line recap.
   Without JavaScript every step shows as a plain list.
========================================== */

const COPY = {
    ios: {
        title: "Add Southbound to your Home Screen",
        lead: "Add Southbound to your Home Screen so it works like an app: full screen and one tap away."
    },
    android: {
        title: "Install Southbound",
        lead: "Install Southbound so it works like an app: full screen, on your home screen, one tap away."
    },
    desktop: {
        title: "Install Southbound",
        lead: "Get it on your phone with the code below, or install it on this computer."
    }
};

function isIOSDevice() {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // iPadOS asks for desktop sites and says it's a Mac; a Mac has no touch screen.
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function detectPlatform() {
    if (isIOSDevice()) return "ios";
    if (/Android/i.test(navigator.userAgent || "")) return "android";
    return "desktop";
}

// Which browser on iOS: Safari, another real browser (Chrome, Firefox,
// Edge: iOS 16.4+ lets them add to the Home Screen from their own Share
// button), or an app's built-in browser, which can't.
function iosBrowser() {
    const ua = navigator.userAgent || "";
    if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|Snapchat|TikTok|LinkedInApp/i.test(ua)) return "in-app";
    if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return "other";
    return "safari";
}

function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches
        || window.navigator.standalone === true;
}

// ---- Real install button (Android, desktop Chrome / Edge) ----
// Listened for at load, not after init, so an early event isn't missed.
let deferredPrompt = null;

function showInstallButtons(on) {
    document.querySelectorAll("[data-install-ready]").forEach(el => { el.hidden = !on; });
    const lead = document.querySelector("[data-manual-lead]");
    if (lead) {
        lead.textContent = on
            ? "Button not doing anything? The browser's menu works too:"
            : "Install it from your browser's menu:";
    }
}

function showInstalledNote() {
    const note = document.getElementById("installSuccess");
    if (note) note.hidden = false;
}

window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallButtons(true);
});

window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    showInstallButtons(false);
    showInstalledNote();
});

async function runInstallPrompt() {
    if (!deferredPrompt) return;
    // The browser lets a prompt be used once.
    const prompt = deferredPrompt;
    deferredPrompt = null;
    showInstallButtons(false);
    try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === "accepted") showInstalledNote();
    } catch {
        // Nothing to undo: the menu steps stay on screen.
    }
}

// ---- Step-by-step guide: one step at a time, Back / Next ----
function setupGuide(guide) {
    const steps = [...guide.querySelectorAll(".install-guide-step")];
    if (steps.length < 2) return;

    const head = guide.querySelector("[data-guide-head]");
    const nav = guide.querySelector("[data-guide-nav]");
    const current = guide.querySelector("[data-guide-current]");
    const total = guide.querySelector("[data-guide-total]");
    const dotsBox = guide.querySelector("[data-guide-dots]");
    const back = guide.querySelector("[data-guide-back]");
    const next = guide.querySelector("[data-guide-next]");
    const nextLabel = next.firstChild;

    const dots = steps.map((_, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "install-guide-dot";
        dot.setAttribute("aria-label", `Step ${i + 1} of ${steps.length}`);
        dot.addEventListener("click", () => show(i));
        dotsBox.append(dot);
        return dot;
    });

    let index = 0;
    function show(i, { focus = false } = {}) {
        index = Math.max(0, Math.min(steps.length - 1, i));
        // The steps share one grid cell (css/install.css), so the card keeps
        // its height; the ones not shown are inert (no focus, not read out).
        steps.forEach((step, n) => {
            step.inert = n !== index;
            step.classList.toggle("is-current", n === index);
        });
        dots.forEach((dot, n) => {
            dot.classList.toggle("active", n === index);
            dot.classList.toggle("done", n < index);
            if (n === index) dot.setAttribute("aria-current", "step");
            else dot.removeAttribute("aria-current");
        });
        current.textContent = String(index + 1);
        back.disabled = index === 0;
        const last = index === steps.length - 1;
        nextLabel.textContent = last ? "Start over" : "Next";
        next.classList.toggle("sb-btn-primary", !last);
        next.classList.toggle("sb-btn-secondary", last);
        next.classList.toggle("is-restart", last);
        if (focus) steps[index].querySelector("h2")?.focus({ preventScroll: true });
    }

    back.addEventListener("click", () => show(index - 1, { focus: true }));
    next.addEventListener("click", () => show(index === steps.length - 1 ? 0 : index + 1, { focus: true }));

    // Arrow keys while the guide has focus; a swipe on a phone.
    guide.addEventListener("keydown", event => {
        if (event.target.closest("input, textarea")) return;
        if (event.key === "ArrowRight") show(index + 1, { focus: true });
        if (event.key === "ArrowLeft") show(index - 1, { focus: true });
    });
    let startX = null;
    let startY = null;
    guide.addEventListener("touchstart", event => {
        const touch = event.changedTouches[0];
        startX = touch.clientX;
        startY = touch.clientY;
    }, { passive: true });
    guide.addEventListener("touchend", event => {
        if (startX === null) return;
        const touch = event.changedTouches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        startX = null;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        show(index + (dx < 0 ? 1 : -1));
    }, { passive: true });

    steps.forEach(step => step.querySelector("h2")?.setAttribute("tabindex", "-1"));
    total.textContent = String(steps.length);
    guide.classList.add("is-stepper");
    head.hidden = false;
    nav.hidden = false;
    show(0);
}

// ---- Tabs: the visitor's device first, the others one tap away ----
function setActiveTab(platform) {
    document.querySelectorAll(".install-tab").forEach(tab => {
        const on = tab.dataset.platform === platform;
        tab.classList.toggle("active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-platform-panel]").forEach(panel => {
        panel.hidden = panel.dataset.platformPanel !== platform;
    });
    const copy = COPY[platform];
    document.getElementById("installTitle").textContent = copy.title;
    document.getElementById("installLead").textContent = copy.lead;
}

function init() {
    if (isInstalled()) {
        document.getElementById("installTitle").textContent = "You're all set";
        document.getElementById("installLead").hidden = true;
        document.getElementById("installAlreadyInstalled").hidden = false;
        document.getElementById("installBody").hidden = true;
        return;
    }

    const platform = detectPlatform();
    document.body.dataset.device = platform;

    // A computer can pick any tab; a phone sees iPhone and Android only.
    document.querySelector('.install-tab[data-platform="desktop"]').hidden = platform !== "desktop";
    document.querySelectorAll(".install-tab").forEach(tab => {
        tab.addEventListener("click", () => setActiveTab(tab.dataset.platform));
    });
    // Hidden in the HTML: without this script the tabs couldn't switch.
    document.getElementById("installTabs").hidden = false;
    setActiveTab(platform);

    if (platform === "ios") {
        const browser = iosBrowser();
        document.getElementById("iosInAppWarning").hidden = browser !== "in-app";
        document.getElementById("iosOtherBrowserNote").hidden = browser !== "other";
    }

    document.querySelectorAll("[data-guide]").forEach(setupGuide);

    document.querySelectorAll("[data-install-btn]").forEach(button => {
        button.addEventListener("click", runInstallPrompt);
    });
    showInstallButtons(!!deferredPrompt);

    // ---- Link + QR share ----
    if (platform !== "desktop") {
        document.querySelector("[data-share-title]").textContent = "Installing on another phone?";
        document.querySelector("[data-share-text]").textContent = "Copy the link and send it over.";
    }
    const linkInput = document.getElementById("installLinkInput");
    if (linkInput) {
        linkInput.value = window.location.href.split("?")[0].split("#")[0];
    }

    document.getElementById("installCopyBtn")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        try {
            await navigator.clipboard.writeText(linkInput.value);
        } catch {
            linkInput.select();
            document.execCommand("copy");
        }
        const label = button.querySelector(".install-copy-label");
        if (!label) return;
        const original = label.textContent;
        button.classList.add("copied");
        label.textContent = "Copied";
        setTimeout(() => {
            button.classList.remove("copied");
            label.textContent = original;
        }, 1800);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
    init();
}
