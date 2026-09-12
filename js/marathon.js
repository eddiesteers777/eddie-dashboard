/* ==========================================
   EddieOS Marathon Controller
   Focused cohesion version:
   - Per-day expandable dropdown
   - Uses existing Marathon data + overrides
   - Reads linked Fueling plans from fueling-plans
   - Reads Cross Training / Strength / Mobility /
     Recovery / Notes from training-overrides
   - Keeps existing progress + override storage
   - Renders locally first so cloud sync cannot leave
     the page blank if Firebase/auth is slow or unavailable
========================================== */

import {
    WEEKS,
    PHASES,
    PACES,
    DAYS,
    DAY_TIMES,
    weekStart,
    weekEnd,
    weekRange,
    getAdjustedWeekMileage,
    getAdjustedWeekDays,
    loadProgress,
    loadOverrides
} from "./marathonData.js";

console.log("EddieOS Marathon — cohesion controller");

let progress = loadProgress();
let overrides = loadOverrides();
let selectedWeek = 1;
const expandedDays = {};

const $ = (id) => document.getElementById(id);

function saveProgress(){
    localStorage.setItem("training-progress", JSON.stringify(progress));
    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

function saveOverrides(){
    localStorage.setItem("training-overrides", JSON.stringify(overrides));
    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

function escapeHTML(value){
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
}

function getAdjustedDays(weekNumber){
    try {
        return getAdjustedWeekDays(weekNumber, overrides);
    } catch(error){
        console.warn("getAdjustedWeekDays fallback:", error);
        const week = WEEKS[weekNumber - 1];
        const weekOverrides = overrides[weekNumber] || {};
        return week.days.map((day, index) => ({
            ...day,
            ...(weekOverrides[DAYS[index]] || {}),
            race: !!day.race
        }));
    }
}

function getArray(day, key){
    return Array.isArray(day?.[key]) ? day[key] : [];
}

function getString(day, key){
    return typeof day?.[key] === "string" ? day[key] : "";
}

function loadFuelingPlans(){
    try {
        const raw = localStorage.getItem("fueling-plans") || "[]";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch(error){
        return [];
    }
}

function getFuelingPlan(week, dayKey){
    return loadFuelingPlans().find(plan =>
        plan &&
        plan.marathonRef &&
        Number(plan.marathonRef.week) === Number(week) &&
        plan.marathonRef.dayKey === dayKey
    ) || null;
}

function renderList(items, emptyText = "None scheduled"){
    if(!items.length){
        return `<div class="mp-extras-body mp-empty-extra">${escapeHTML(emptyText)}</div>`;
    }
    return `<div class="mp-extras-body">${items.map(item =>
        `<div class="mp-extra-item">${escapeHTML(item)}</div>`
    ).join("")}</div>`;
}

function renderDayDropdown(day, weekNumber, dayKey){
    const fueling = getFuelingPlan(weekNumber, dayKey);
    const strength = getArray(day, "strength");
    const crossTraining = getArray(day, "crossTraining");
    const mobility = getArray(day, "mobility");
    const recovery = getArray(day, "recovery");
    const notes = getString(day, "notes");
    const description = getString(day, "description");
    const duration = getString(day, "duration");
    const key = `${weekNumber}-${dayKey}`;
    const open = !!expandedDays[key];

    return `
        <div class="mp-day-dropdown ${open ? "open" : ""}" id="mp-day-dropdown-${weekNumber}-${dayKey}">
            <div class="mp-day-dropdown-inner">

                <div class="mp-extra-group">
                    <div class="mp-extra-title">🏃 Workout</div>
                    <div class="mp-extras-body">
                        <div class="mp-extra-item"><strong>${escapeHTML(day.session)}</strong></div>
                        <div class="mp-extra-item">${escapeHTML(day.miles)} mi • ${escapeHTML(day.pace)}</div>
                        ${duration ? `<div class="mp-extra-item">Duration: ${escapeHTML(duration)}</div>` : ""}
                        ${description ? `<div class="mp-extra-item">${escapeHTML(description)}</div>` : ""}
                    </div>
                </div>

                <div class="mp-extra-group">
                    <div class="mp-extra-title">⛽ Fueling</div>
                    ${fueling ? `
                        <div class="mp-extras-body">
                            <div class="mp-extra-item"><strong>${escapeHTML(fueling.name || "Saved Fueling Plan")}</strong></div>
                            <div class="mp-extra-item">${Number(fueling.carbTotal || 0)}g carbs • ${Number(fueling.fluidTotal || 0)}oz fluid • ${Number(fueling.sodiumTotal || 0)}mg sodium</div>
                            <a class="mp-extra-link" href="fueling.html?week=${weekNumber}&day=${encodeURIComponent(dayKey)}">Open / Edit Fueling Plan →</a>
                        </div>
                    ` : `<div class="mp-extras-body mp-empty-extra"><a class="mp-extra-link" href="fueling.html?week=${weekNumber}&day=${encodeURIComponent(dayKey)}">Build Fueling Plan →</a></div>`}
                </div>

                <div class="mp-extra-group">
                    <div class="mp-extra-title">💪 Strength</div>
                    ${renderList(strength)}
                </div>

                <div class="mp-extra-group">
                    <div class="mp-extra-title">🚴 Cross Training</div>
                    ${renderList(crossTraining)}
                </div>

                <div class="mp-extra-group">
                    <div class="mp-extra-title">🧘 Mobility</div>
                    ${renderList(mobility)}
                </div>

                <div class="mp-extra-group">
                    <div class="mp-extra-title">❤️ Recovery</div>
                    ${renderList(recovery)}
                </div>

                <div class="mp-extra-group">
                    <div class="mp-extra-title">📝 Notes</div>
                    ${notes ? `<div class="mp-extras-body"><div class="mp-extra-item">${escapeHTML(notes)}</div></div>` : `<div class="mp-extras-body mp-empty-extra">None</div>`}
                </div>

            </div>
        </div>
    `;
}

function weekDone(weekNumber){
    const weekProgress = progress[weekNumber] || {};
    return DAYS.filter(day => weekProgress[day]).length;
}

function totalCompleted(){
    return Object.values(progress).reduce((total, week) => {
        return total + Object.values(week || {}).filter(Boolean).length;
    }, 0);
}

function getCurrentWeek(){
    const now = new Date();
    let current = 1;

    for(let n = 1; n <= WEEKS.length; n++){
        if(now >= weekStart(n) && now <= weekEnd(n)) current = n;
    }

    if(now < weekStart(1)) current = 1;
    if(now > weekEnd(WEEKS.length)) current = WEEKS.length;

    return current;
}

function updateStats(){
    const raceDay = weekEnd(WEEKS.length);
    const now = new Date();
    const daysLeft = Math.ceil((raceDay - now) / 86400000);

    const countdown = $("mp-countdown");
    if(countdown){
        countdown.textContent = daysLeft >= 0 ? `${daysLeft} days to race day` : "Race complete!";
    }

    const weekDisplay = $("mp-stat-week");
    if(weekDisplay){
        weekDisplay.textContent = `${getCurrentWeek()} / ${WEEKS.length}`;
    }

    const totalDisplay = $("mp-stat-total");
    if(totalDisplay){
        const totalMiles = WEEKS.reduce((sum, _, index) => {
            try {
                return sum + Number(getAdjustedWeekMileage(index + 1, overrides) || 0);
            } catch(error){
                return sum;
            }
        }, 0);
        totalDisplay.textContent = Math.round(totalMiles);
    }

    const peakDisplay = $("mp-stat-peak");
    if(peakDisplay){
        const peak = Math.max(...WEEKS.map((_, index) => {
            try { return Number(getAdjustedWeekMileage(index + 1, overrides) || 0); }
            catch(error){ return 0; }
        }));
        peakDisplay.textContent = Math.round(peak);
    }

    const pctDisplay = $("mp-stat-pct");
    if(pctDisplay){
        pctDisplay.textContent = `${Math.round((totalCompleted() / (WEEKS.length * DAYS.length)) * 100)}%`;
    }
}

function renderWeekList(){
    const container = $("mp-weeklist");
    if(!container) return;

    container.innerHTML = "";

    for(let weekNumber = 1; weekNumber <= WEEKS.length; weekNumber++){
        const chip = document.createElement("div");
        const completed = weekDone(weekNumber);

        chip.className = `mp-wchip${weekNumber === selectedWeek ? " active" : ""}${completed === 7 ? " done" : ""}`;
        chip.innerHTML = `<span class="mp-dot"></span>Wk ${weekNumber}`;

        chip.addEventListener("click", () => {
            selectedWeek = weekNumber;
            renderDetail();
            renderWeekList();
            renderChart();
        });

        container.appendChild(chip);
    }
}

function renderDetail(){
    const container = $("mp-detail");
    if(!container) return;

    const week = WEEKS[selectedWeek - 1];
    if(!week) return;

    const days = getAdjustedDays(selectedWeek);
    const phaseInfo = PHASES[week.phase] || { label: "Marathon", color: "#3b82f6" };

    const rows = days.map((day, index) => {
        const dayName = DAYS[index];
        const completed = !!(progress[selectedWeek] && progress[selectedWeek][dayName]);
        const key = `${selectedWeek}-${dayName}`;
        const open = !!expandedDays[key];
        const today = getCurrentWeek() === selectedWeek && getTodayDayName() === dayName;

        return `
            <div class="mp-day-wrapper ${today ? "mp-day-today" : ""}">
                <div class="mp-day-row ${completed ? "mp-day-done" : ""}" data-expand-day="${dayName}">
                    <div class="mp-check ${completed ? "checked" : ""}" data-toggle="${dayName}">
                        ${completed ? "✓" : ""}
                    </div>
                    <div class="mp-day-abbr">${dayName}</div>
                    <input class="mp-day-session-input" data-day="${dayName}" data-field="session" value="${escapeHTML(day.session)}">
                    <div class="mp-mile-box">
                        <input type="number" step="0.1" class="mp-day-miles-input" data-day="${dayName}" data-field="miles" value="${escapeHTML(day.miles)}"> mi
                    </div>
                    <div class="mp-pace-chip">${escapeHTML(day.pace)}</div>
                    <div class="mp-day-timing">${escapeHTML(DAY_TIMES[index] || "")}</div>
                    <button type="button" class="mp-day-expand-btn" data-expand-day="${dayName}" aria-expanded="${open ? "true" : "false"}">${open ? "▲" : "▼"}</button>
                </div>
                ${renderDayDropdown(day, selectedWeek, dayName)}
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="mp-detail-head">
            <div>
                <span class="mp-phase-pill" style="background:${phaseInfo.color}22;color:${phaseInfo.color}">${escapeHTML(phaseInfo.label)}</span>
                <h2 class="mp-week-title">Week ${selectedWeek}</h2>
                <div class="mp-week-dates">${escapeHTML(weekRange(selectedWeek))}</div>
            </div>
            <div class="mp-week-progress">
                <div class="mp-week-miles">${getAdjustedWeekMileageSafe(selectedWeek)} mi</div>
                <div>${weekDone(selectedWeek)}/7 completed</div>
            </div>
        </div>

        <div class="mp-days">${rows}</div>

        <div class="mp-mental">"${escapeHTML(week.mental || "")}"</div>

        <div class="mp-notes-grid">
            <div class="mp-note-card">
                <div class="mp-note-label">Purpose</div>
                <div class="mp-note-body">${escapeHTML(week.purpose || "")}</div>
            </div>
            <div class="mp-note-card">
                <div class="mp-note-label">Fueling</div>
                <div class="mp-note-body">${escapeHTML(week.fueling || "")}</div>
            </div>
            <div class="mp-note-card">
                <div class="mp-note-label">Heat / Humidity</div>
                <div class="mp-note-body">${escapeHTML(week.heat || "")}</div>
            </div>
            <div class="mp-note-card">
                <div class="mp-note-label">Strength Phase</div>
                <div class="mp-note-body">${escapeHTML(week.strength || "")}</div>
            </div>
        </div>

        <button class="mp-drawer-toggle" id="mp-pace-toggle" type="button">Pace reference ▼</button>
        <button class="mp-drawer-toggle" id="mp-reset-week-btn" type="button">Reset this week's edits</button>
        <button class="mp-reset-btn" id="mp-reset-btn" type="button">Reset all progress</button>
        <div class="mp-drawer" id="mp-pace-drawer">
            <table class="mp-pace-table">
                ${PACES.map(p => `<tr><td>${escapeHTML(p[0])}</td><td class="mp-mono">${escapeHTML(p[1])}</td></tr>`).join("")}
            </table>
        </div>
    `;

    attachDetailEvents();
}

function getAdjustedWeekMileageSafe(weekNumber){
    try {
        return Math.round(Number(getAdjustedWeekMileage(weekNumber, overrides) || 0) * 10) / 10;
    } catch(error){
        return 0;
    }
}

function getTodayDayName(){
    const jsDay = new Date().getDay();
    return DAYS[jsDay === 0 ? 6 : jsDay - 1];
}

function attachDetailEvents(){
    const container = $("mp-detail");
    if(!container) return;

    container.querySelectorAll("[data-toggle]").forEach(box => {
        box.addEventListener("click", event => {
            event.stopPropagation();
            const day = box.getAttribute("data-toggle");
            if(!progress[selectedWeek]) progress[selectedWeek] = {};
            progress[selectedWeek][day] = !progress[selectedWeek][day];
            saveProgress();
            renderDetail();
            renderWeekList();
            updateStats();
        });
    });

    container.querySelectorAll("[data-expand-day]").forEach(trigger => {
        trigger.addEventListener("click", event => {
            if(event.target.closest(".mp-check, .mp-day-session-input, .mp-day-miles-input")) return;
            event.stopPropagation();
            const day = trigger.getAttribute("data-expand-day");
            const key = `${selectedWeek}-${day}`;
            expandedDays[key] = !expandedDays[key];
            renderDetail();
        });
    });

    container.querySelectorAll(".mp-day-session-input, .mp-day-miles-input").forEach(input => {
        input.addEventListener("click", event => event.stopPropagation());
        input.addEventListener("change", event => {
            const day = event.target.dataset.day;
            const field = event.target.dataset.field;
            let value = event.target.value;

            if(field === "miles"){
                value = Number(value);
                if(Number.isNaN(value) || value < 0) value = 0;
            } else {
                value = String(value).trim();
            }

            if(!overrides[selectedWeek]) overrides[selectedWeek] = {};
            if(!overrides[selectedWeek][day]) overrides[selectedWeek][day] = {};
            overrides[selectedWeek][day][field] = value;
            saveOverrides();
            renderDetail();
            renderChart();
            updateStats();
        });

        input.addEventListener("keydown", event => {
            if(event.key === "Enter") event.target.blur();
        });
    });

    const paceButton = $("mp-pace-toggle");
    const paceDrawer = $("mp-pace-drawer");
    if(paceButton && paceDrawer){
        paceButton.addEventListener("click", () => paceDrawer.classList.toggle("open"));
    }

    const resetWeekButton = $("mp-reset-week-btn");
    if(resetWeekButton){
        resetWeekButton.addEventListener("click", () => {
            if(overrides[selectedWeek]){
                if(confirm("Reset this week's mileage/workout edits back to the default plan?")){
                    delete overrides[selectedWeek];
                    saveOverrides();
                    renderDetail();
                    renderChart();
                    updateStats();
                }
            } else {
                alert("No edits to reset for this week.");
            }
        });
    }

    const resetButton = $("mp-reset-btn");
    if(resetButton){
        resetButton.addEventListener("click", () => {
            if(confirm("Reset all logged progress? This can't be undone.")){
                progress = {};
                saveProgress();
                renderDetail();
                renderWeekList();
                renderChart();
                updateStats();
            }
        });
    }
}

function ensureCohesionStyles(){
    if(document.getElementById("mp-cohesion-inline-styles")) return;

    const style = document.createElement("style");
    style.id = "mp-cohesion-inline-styles";
    style.textContent = `
        .mp-day-expand-btn{
            appearance:none;
            border:0;
            background:transparent;
            color:var(--text-light,#9aa8c7);
            cursor:pointer;
            font-size:.9rem;
            padding:8px;
            border-radius:8px;
        }
        .mp-day-expand-btn:hover{color:var(--primary-light,#60a5fa);background:rgba(59,130,246,.08);}
        .mp-day-dropdown{display:none;margin:-4px 0 8px 0;padding:0 18px 16px 18px;}
        .mp-day-dropdown.open{display:block;}
        .mp-day-dropdown-inner{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:14px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);}
        .mp-extra-group{padding:12px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);}
        .mp-extra-title{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--primary-light,#60a5fa);margin-bottom:7px;}
        .mp-extras-body{color:var(--text-light,#9aa8c7);font-size:.84rem;line-height:1.55;}
        .mp-extra-item{margin-top:4px;}
        .mp-extra-item:first-child{margin-top:0;}
        .mp-empty-extra{opacity:.6;font-style:italic;}
        .mp-extra-link{display:inline-block;margin-top:7px;color:var(--primary-light,#60a5fa);font-weight:700;text-decoration:none;}
        .mp-extra-link:hover{text-decoration:underline;}
        .mp-day-today .mp-day-row{box-shadow:inset 3px 0 0 var(--primary,#3b82f6);}
        @media(max-width:800px){.mp-day-dropdown-inner{grid-template-columns:1fr;}.mp-day-row{grid-template-columns:30px 45px 1fr 65px 95px 85px 35px;gap:8px;padding:18px 12px;}}
    `;
    document.head.appendChild(style);
}

function renderChart(){
    const svg = $("mp-chart-svg");
    if(!svg) return;

    const width = 900;
    const height = 120;
    const values = WEEKS.map((_, index) => getAdjustedWeekMileageSafe(index + 1));
    const maxMiles = Math.max(...values, 1);

    let html = "";
    WEEKS.forEach((week, index) => {
        const weekNumber = index + 1;
        const miles = values[index];
        const barHeight = (miles / maxMiles) * 80;
        const x = 40 + index * 52;
        const y = 100 - barHeight;
        const color = (PHASES[week.phase] || {}).color || "#3b82f6";

        html += `
            <g class="mp-bar" data-week="${weekNumber}">
                <rect x="${x}" y="${y}" width="35" height="${barHeight}" rx="4" fill="${color}"></rect>
                <text x="${x+17}" y="115" text-anchor="middle" font-size="10">${weekNumber}</text>
            </g>
        `;
    });

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = html;

    svg.querySelectorAll(".mp-bar").forEach(bar => {
        bar.addEventListener("click", () => {
            selectedWeek = Number(bar.dataset.week);
            renderDetail();
            renderWeekList();
        });
    });
}

function renderAll(){
    ensureCohesionStyles();
    updateStats();
    renderChart();
    renderWeekList();
    renderDetail();
}

function boot(){
    selectedWeek = getCurrentWeek();
    renderAll();

    import("./cloudSync.js")
        .then(({ initCloudSync }) => initCloudSync())
        .then(() => {
            progress = loadProgress();
            overrides = loadOverrides();
            renderAll();
        })
        .catch(error => {
            console.warn("EddieOS Marathon cloud sync unavailable:", error);
        });
}

boot();
