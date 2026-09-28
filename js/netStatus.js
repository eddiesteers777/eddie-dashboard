/* ==========================================
   Southbound — connection and version status

   One small pill above the tab bar (never a popup):
     offline        "You're offline. Changes will sync when you're back
                    online." (+ when this device last synced), shrinking
                    to "Offline" after a few seconds; tap to expand.
     back online    "Back online. Syncing your changes…", then "Synced"
                    once cloud sync (js/cloudSync.js) and any Firestore
                    writes kept on the phone (js/offlineWrite.js) are sent.
     new version    "A new version of Southbound is available." + Refresh
                    (the service worker has it ready; js/registerSW.js).
   A write kept on the phone that syncs later, or is refused, gets a toast.
   Loaded by js/registerSW.js on every page that registers the worker.
========================================== */

const APP_PAGE = !!document.getElementById("header");
let el = null;
let hideTimer = null;
let compactTimer = null;
let mode = null; // "offline" | "syncing" | "synced" | "update" | null

function ensureEl() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "sb-net";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `<span class="sb-net-dot" aria-hidden="true"></span><span class="sb-net-text"></span><button type="button" class="sb-net-action" hidden></button><button type="button" class="sb-net-close" aria-label="Dismiss" hidden>×</button>`;
    el.addEventListener("click", event => {
        if (event.target.closest(".sb-net-action, .sb-net-close")) return;
        if (mode === "offline") showOffline({ expand: true });
    });
    el.querySelector(".sb-net-close").addEventListener("click", () => hide());
    document.body.appendChild(el);
    return el;
}

function show(state, text, { action = null, closable = false, hideAfter = 0, compactAfter = 0 } = {}) {
    const node = ensureEl();
    mode = state;
    clearTimeout(hideTimer);
    clearTimeout(compactTimer);
    node.dataset.state = state;
    node.classList.remove("is-compact");
    node.querySelector(".sb-net-text").textContent = text;
    const btn = node.querySelector(".sb-net-action");
    btn.hidden = !action;
    if (action) {
        btn.textContent = action.label;
        btn.onclick = action.onClick;
    }
    node.querySelector(".sb-net-close").hidden = !closable;
    requestAnimationFrame(() => node.classList.add("is-on"));
    document.body.classList.add("sb-net-on");
    if (hideAfter) hideTimer = setTimeout(hide, hideAfter);
    if (compactAfter) compactTimer = setTimeout(() => node.classList.add("is-compact"), compactAfter);
}

function hide() {
    clearTimeout(hideTimer);
    clearTimeout(compactTimer);
    mode = null;
    if (!el) return;
    el.classList.remove("is-on");
    document.body.classList.remove("sb-net-on");
    if (updateWaiting) setTimeout(showUpdate, 400);
}

function ago(ts) {
    if (!ts) return "";
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} h ago`;
    return `${Math.round(hr / 24)} d ago`;
}
function lastSyncedAt() {
    try { return JSON.parse(localStorage.getItem("__cloudSyncMeta") || "null")?.lastSyncedAt || null; } catch { return null; }
}

function showOffline({ expand = false } = {}) {
    const when = APP_PAGE ? ago(lastSyncedAt()) : "";
    const text = APP_PAGE
        ? `You're offline. Changes will sync when you're back online.${when ? ` Last synced ${when}.` : ""}`
        : "You're offline.";
    show("offline", text, { compactAfter: expand ? 8000 : 6000 });
    if (el) el.dataset.short = "Offline";
}

async function syncNow() {
    if (!APP_PAGE) return true;
    const waits = [];
    waits.push(import("./cloudSync.js").then(m => m.pushToCloud()).catch(() => false));
    waits.push(import("./firebase.js").then(async ({ db }) => {
        const { waitForPendingWrites } = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
        return waitForPendingWrites(db).then(() => true);
    }).catch(() => true));
    const timeout = new Promise(resolve => setTimeout(() => resolve("slow"), 20000));
    const result = await Promise.race([Promise.all(waits), timeout]);
    return result !== "slow" && !result.includes(false);
}

async function backOnline() {
    show("syncing", APP_PAGE ? "Back online. Syncing your changes…" : "Back online.");
    import("./emailNotify.js").then(m => m.flushEmailOutbox()).catch(() => {});
    if (!APP_PAGE) { setTimeout(hide, 2500); return; }
    const ok = await syncNow();
    if (navigator.onLine === false) return showOffline();
    if (ok) show("synced", "Synced", { hideAfter: 2500 });
    else show("syncing", "Couldn't sync everything yet. Southbound will keep trying.", { hideAfter: 6000, closable: true });
}

// ---- New version ----
let updateWaiting = null;
function showUpdate() {
    if (!updateWaiting || (mode && mode !== "update")) return;
    show("update", "A new version of Southbound is available.", {
        action: {
            label: "Refresh",
            onClick: () => {
                sessionStorage.setItem("sb-sw-refresh", "1");
                updateWaiting.postMessage({ type: "SKIP_WAITING" });
            }
        },
        closable: true
    });
}
export function announceUpdate(worker) {
    updateWaiting = worker;
    showUpdate();
}

// ---- Wiring ----
window.addEventListener("offline", () => showOffline());
window.addEventListener("online", backOnline);
window.addEventListener("sb:write-synced", event => {
    import("./ui.js").then(({ toast }) => toast(`${event.detail?.label || "Your change"} synced.`)).catch(() => {});
});
window.addEventListener("sb:write-failed", event => {
    import("./ui.js").then(({ toast }) => toast(`${event.detail?.label || "A change"} couldn't be saved to your account. Try it again.`, { type: "error", duration: 8000 })).catch(() => {});
});

if (navigator.onLine === false) showOffline();
else {
    try {
        if (localStorage.getItem("sb-email-outbox")) import("./emailNotify.js").then(m => m.flushEmailOutbox()).catch(() => {});
    } catch { /* storage unavailable */ }
}
