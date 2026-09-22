/* ==========================================
   EddieOS — Get the App

   Device-aware install instructions. iOS has no API a page can call
   to trigger "Add to Home Screen" -- Apple deliberately left that
   out -- so the best a page can do is detect the platform and show
   the right manual steps, plus catch the common case where the page
   was opened in an in-app browser (Instagram, Facebook, etc.) or
   Chrome-on-iOS, neither of which can install at all; only Safari
   can. Android does expose a real install trigger
   (beforeinstallprompt), so that path gets an actual button.
========================================== */

function detectPlatform() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /Android/.test(ua);
    if (isIOS) return "ios";
    if (isAndroid) return "android";
    return "desktop";
}

function isIOSSafari() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    if (!isIOS) return true;
    const isChromeOnIOS = /CriOS/.test(ua);
    const isFirefoxOnIOS = /FxiOS/.test(ua);
    const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter/i.test(ua);
    return !isChromeOnIOS && !isFirefoxOnIOS && !isInAppBrowser;
}

function setActiveTab(platform) {
    document.querySelectorAll(".install-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.platform === platform);
    });
    document.querySelectorAll("[data-platform-panel]").forEach(panel => {
        panel.hidden = panel.dataset.platformPanel !== platform;
    });
}

function init() {
    // Already running as the installed app? Nothing to install.
    const alreadyInstalled = window.matchMedia("(display-mode: standalone)").matches
        || window.navigator.standalone === true;

    if (alreadyInstalled) {
        document.getElementById("installAlreadyInstalled").hidden = false;
        document.getElementById("installBody").hidden = true;
        return;
    }

    const platform = detectPlatform();

    document.querySelectorAll(".install-tab").forEach(tab => {
        tab.addEventListener("click", () => setActiveTab(tab.dataset.platform));
    });

    // Desktop has no tab of its own in the toggle (nothing to switch
    // to) -- it just shows the "use your phone" panel directly.
    if (platform === "desktop") {
        document.getElementById("installTabs").hidden = true;
        document.querySelectorAll("[data-platform-panel]").forEach(panel => {
            panel.hidden = panel.dataset.platformPanel !== "desktop";
        });
    } else {
        setActiveTab(platform);
    }

    if (platform === "ios" && !isIOSSafari()) {
        document.getElementById("iosBrowserWarning").hidden = false;
    }

    // ---- Android install prompt ----
    let deferredPrompt = null;
    const androidBtn = document.getElementById("androidInstallBtn");

    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();
        deferredPrompt = event;
        if (androidBtn) androidBtn.hidden = false;
    });

    androidBtn?.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        androidBtn.hidden = true;
    });

    window.addEventListener("appinstalled", () => {
        if (androidBtn) androidBtn.hidden = true;
    });

    // ---- Link + QR share ----
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

document.addEventListener("DOMContentLoaded", init, { once: true });
