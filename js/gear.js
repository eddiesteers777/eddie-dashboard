/* ==========================================
   EddieOS Gear
========================================== */

import {
    getCurrentWeek,
    getWeekMileage
} from "./marathonData.js";

const STORAGE_KEY = "gear-shoes";

let shoes = [];
let pendingLogShoeId = null;

function uid() {
    return crypto.randomUUID();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* ==========================================
   Persistence
========================================== */

function loadShoes() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        shoes = Array.isArray(saved) ? saved : [];
    } catch (error) {
        console.error("Gear: could not read saved shoes", error);
        shoes = [];
    }
}

function saveShoes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shoes));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

function totalMiles(shoe) {
    const logged = shoe.mileageLog.reduce(
        (sum, entry) => sum + (Number(entry.miles) || 0),
        0
    );

    return (Number(shoe.startingMiles) || 0) + logged;
}

/* ==========================================
   Week banner -- pulls this week's real
   marathon mileage and offers to log it
========================================== */

function renderWeekBanner() {
    const banner = document.getElementById("gearWeekBanner");
    const text = document.getElementById("gearWeekBannerText");
    const select = document.getElementById("gearWeekBannerSelect");

    if (!banner || !text || !select) {
        return;
    }

    const activeShoes = shoes.filter(s => !s.retired);

    if (!activeShoes.length) {
        banner.classList.remove("visible");
        return;
    }

    let weekMiles = 0;

    try {
        weekMiles = getWeekMileage(getCurrentWeek());
    } catch {
        weekMiles = 0;
    }

    if (!weekMiles) {
        banner.classList.remove("visible");
        return;
    }

    banner.classList.add("visible");
    text.textContent =
        `Your marathon plan has ${weekMiles} mi logged this week.`;

    select.innerHTML = activeShoes.map(s =>
        `<option value="${s.id}">${escapeHtml(s.name)}</option>`
    ).join("");

    banner.dataset.weekMiles = weekMiles;
}

/* ==========================================
   Rendering
========================================== */

function statusClass(pct) {
    if (pct >= 100) return "danger";
    if (pct >= 80) return "warn";
    return "ok";
}

function shoeCard(shoe) {
    const miles = totalMiles(shoe);
    const pct = Math.min(
        100,
        Math.round((miles / (shoe.threshold || 400)) * 100)
    );
    const remaining = Math.max(0, (shoe.threshold || 400) - miles);

    return `
        <div class="gear-card ${shoe.retired ? "retired" : ""} ${pct >= 100 ? "over-threshold" : ""}" data-shoe-id="${shoe.id}">

            <div class="gear-card-header">
                <div>
                    <div class="gear-card-name">${escapeHtml(shoe.name)}</div>
                    ${shoe.brand ? `<div class="gear-card-brand">${escapeHtml(shoe.brand)}</div>` : ""}
                </div>
                <button
                    type="button"
                    class="gear-card-menu"
                    data-delete-shoe="${shoe.id}"
                    title="Delete">
                    ×
                </button>
            </div>

            <div class="gear-card-mileage">
                <span class="gear-card-mileage-current">${miles.toFixed(0)}</span>
                <span class="gear-card-mileage-total">/ ${shoe.threshold || 400} mi</span>
            </div>

            <div class="gear-progress-track">
                <div
                    class="gear-progress-fill ${statusClass(pct)}"
                    style="width:${pct}%"></div>
            </div>

            <div class="gear-card-meta">
                ${pct >= 100
                    ? "Past its typical replacement point"
                    : `${remaining.toFixed(0)} mi until replacement`}
            </div>

            ${shoe.retired ? "" : `
                <div class="gear-card-actions">
                    <button type="button" data-log-miles="${shoe.id}">+ Log Miles</button>
                    <button type="button" data-retire-shoe="${shoe.id}">Retire</button>
                </div>
            `}

        </div>
    `;
}

function renderAll() {
    const activeGrid = document.getElementById("gearActiveGrid");
    const retiredSection = document.getElementById("gearRetiredSection");
    const retiredGrid = document.getElementById("gearRetiredGrid");
    const emptyState = document.getElementById("gearEmptyState");

    if (!activeGrid) {
        return;
    }

    const active = shoes.filter(s => !s.retired);
    const retired = shoes.filter(s => s.retired);

    if (!shoes.length) {
        emptyState?.classList.add("visible");
    } else {
        emptyState?.classList.remove("visible");
    }

    activeGrid.innerHTML = active.map(shoeCard).join("");

    if (retired.length) {
        retiredSection?.classList.add("visible");
        retiredGrid.innerHTML = retired.map(shoeCard).join("");
    } else {
        retiredSection?.classList.remove("visible");
    }

    renderWeekBanner();
}

/* ==========================================
   Add / edit shoe modal
========================================== */

function openShoeModal() {
    document.getElementById("shoeNameInput").value = "";
    document.getElementById("shoeBrandInput").value = "";
    document.getElementById("shoeThresholdInput").value = "400";
    document.getElementById("shoeStartingMilesInput").value = "0";
    document.getElementById("shoeModalOverlay").classList.add("open");
    document.getElementById("shoeNameInput").focus();
}

function closeShoeModal() {
    document.getElementById("shoeModalOverlay").classList.remove("open");
}

function saveNewShoe() {
    const name = document.getElementById("shoeNameInput").value.trim();

    if (!name) {
        return;
    }

    shoes.push({
        id: uid(),
        name,
        brand: document.getElementById("shoeBrandInput").value.trim(),
        threshold: Number(document.getElementById("shoeThresholdInput").value) || 400,
        startingMiles: Number(document.getElementById("shoeStartingMilesInput").value) || 0,
        retired: false,
        addedAt: Date.now(),
        mileageLog: []
    });

    saveShoes();
    closeShoeModal();
    renderAll();
}

/* ==========================================
   Log miles modal
========================================== */

function openLogMilesModal(shoeId) {
    pendingLogShoeId = shoeId;

    const shoe = shoes.find(s => s.id === shoeId);

    document.getElementById("logMilesTitle").textContent =
        shoe ? `Log Miles — ${shoe.name}` : "Log Miles";
    document.getElementById("logMilesInput").value = "";
    document.getElementById("logMilesNote").value = "";
    document.getElementById("logMilesOverlay").classList.add("open");
    document.getElementById("logMilesInput").focus();
}

function closeLogMilesModal() {
    document.getElementById("logMilesOverlay").classList.remove("open");
    pendingLogShoeId = null;
}

function saveLogMiles() {
    const shoe = shoes.find(s => s.id === pendingLogShoeId);
    const miles = Number(document.getElementById("logMilesInput").value);

    if (!shoe || !miles || miles <= 0) {
        closeLogMilesModal();
        return;
    }

    shoe.mileageLog.push({
        id: uid(),
        date: new Date().toISOString().slice(0, 10),
        miles,
        note: document.getElementById("logMilesNote").value.trim()
    });

    saveShoes();
    closeLogMilesModal();
    renderAll();
}

/* ==========================================
   Event wiring
========================================== */

document.addEventListener("click", e => {

    if (e.target.matches("#addShoeBtn") || e.target.matches("#gearEmptyAddBtn")) {
        openShoeModal();
        return;
    }

    if (e.target.matches("#shoeModalClose") || e.target.matches("#shoeModalCancel") || e.target.matches("#shoeModalOverlay")) {
        closeShoeModal();
        return;
    }

    if (e.target.matches("#shoeModalSave")) {
        saveNewShoe();
        return;
    }

    if (e.target.matches("[data-log-miles]")) {
        openLogMilesModal(e.target.dataset.logMiles);
        return;
    }

    if (e.target.matches("#logMilesClose") || e.target.matches("#logMilesCancel") || e.target.matches("#logMilesOverlay")) {
        closeLogMilesModal();
        return;
    }

    if (e.target.matches("#logMilesSave")) {
        saveLogMiles();
        return;
    }

    if (e.target.matches("[data-retire-shoe]")) {
        const shoe = shoes.find(s => s.id === e.target.dataset.retireShoe);
        if (shoe) {
            shoe.retired = true;
            shoe.retiredAt = Date.now();
            saveShoes();
            renderAll();
        }
        return;
    }

    if (e.target.matches("[data-delete-shoe]")) {
        shoes = shoes.filter(s => s.id !== e.target.dataset.deleteShoe);
        saveShoes();
        renderAll();
        return;
    }

    if (e.target.matches("#gearWeekBannerApply")) {
        const select = document.getElementById("gearWeekBannerSelect");
        const banner = document.getElementById("gearWeekBanner");
        const shoe = shoes.find(s => s.id === select.value);
        const weekMiles = Number(banner.dataset.weekMiles) || 0;

        if (shoe && weekMiles) {
            shoe.mileageLog.push({
                id: uid(),
                date: new Date().toISOString().slice(0, 10),
                miles: weekMiles,
                note: "This week's marathon plan mileage"
            });

            saveShoes();
            renderAll();
        }
        return;
    }

});

document.getElementById("logMilesInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        saveLogMiles();
    }
});

/* ==========================================
   Init
========================================== */

loadShoes();
renderAll();

import("./cloudSync.js").then(({ initCloudSync }) => {
    initCloudSync().then(() => {
        loadShoes();
        renderAll();
    });
}).catch(() => {});
