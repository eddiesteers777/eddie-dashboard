/* ==========================================
   EddieOS Cross Training Studio
   Plain classic script — no import/export.
   Depends on marathonData.js being loaded
   first (see cross-training.html), sharing
   WEEKS, DAYS, PHASES, weekRange,
   getCurrentWeek, getAdjustedWeekDays,
   loadOverrides, saveOverrides.
========================================== */

console.log("EddieOS Cross Training Studio");

/* ==========================================
   Constants
========================================== */

var LIBRARY_KEY = "cross-training-library";

var CATEGORIES = {

    cycling:    { label:"Cycling",          icon:"🚴", color:"#3b82f6" },
    swimming:   { label:"Swimming",          icon:"🏊", color:"#22d3ee" },
    elliptical: { label:"Elliptical",        icon:"🌀", color:"#a855f7" },
    rowing:     { label:"Rowing",            icon:"🚣", color:"#f59e0b" },
    yoga:       { label:"Yoga",              icon:"🧘", color:"#22c55e" },
    circuit:    { label:"Strength Circuit",  icon:"🏋️", color:"#ef4444" },
    mobility:   { label:"Mobility",          icon:"🤸", color:"#60a5fa" },
    other:      { label:"Other",             icon:"⚡", color:"#9aa8c7" }

};

var INTENSITIES = ["easy","moderate","hard"];

/* ==========================================
   State
========================================== */

var library = [];

var filterCategory = "all";

var searchQuery = "";

var builderEditingId = null;

var builderCategory = "cycling";

var builderBlocks = [];

var draggedBlockId = null;

var attachWeek = 1;

var attachDay = "Mon";

/* ==========================================
   DOM Helpers
========================================== */

function ct$(id){

    return document.getElementById(id);

}

function makeId(prefix){

    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8);

}

function escapeHtml(value){

    return String(value)

        .replace(/&/g,"&amp;")

        .replace(/</g,"&lt;")

        .replace(/>/g,"&gt;")

        .replace(/"/g,"&quot;");

}

function parseMinutes(durationText){

    var value = parseFloat(durationText);

    return isNaN(value) ? 0 : value;

}

/* ==========================================
   Persistence: Library
========================================== */

function loadLibrary(){

    try{

        return JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");

    }
    catch(error){

        return [];

    }

}

function saveLibraryToStorage(){

    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));

}

/* ==========================================
   Workout Helpers
========================================== */

function workoutTotalMinutes(workout){

    return workout.blocks.reduce(function(sum, block){

        return sum + (Number(block.duration) || 0);

    }, 0);

}

function workoutDominantIntensity(workout){

    var counts = { easy:0, moderate:0, hard:0 };

    workout.blocks.forEach(function(block){

        if(counts[block.intensity] !== undefined){

            counts[block.intensity]++;

        }

    });

    var top = "easy";

    var max = -1;

    INTENSITIES.forEach(function(level){

        if(counts[level] > max){

            max = counts[level];

            top = level;

        }

    });

    return top;

}

function getWorkoutById(id){

    return library.find(function(w){ return w.id === id; }) || null;

}

/* ==========================================
   Filter Chips (Library)
========================================== */

function renderFilterChips(){

    var container = ct$("ct-filter-chips");

    var html = '<button type="button" class="ct-filter-chip' +

        (filterCategory === "all" ? " active" : "") +

        '" data-filter="all">All</button>';

    Object.keys(CATEGORIES).forEach(function(key){

        var cat = CATEGORIES[key];

        html += '<button type="button" class="ct-filter-chip' +

            (filterCategory === key ? " active" : "") +

            '" data-filter="' + key + '">' + cat.icon + ' ' + cat.label + '</button>';

    });

    container.innerHTML = html;

    container.querySelectorAll("[data-filter]").forEach(function(btn){

        btn.addEventListener("click", function(){

            filterCategory = btn.dataset.filter;

            renderFilterChips();

            renderLibraryGrid();

        });

    });

}

/* ==========================================
   Library Grid
========================================== */

function getFilteredLibrary(){

    var query = searchQuery.trim().toLowerCase();

    return library.filter(function(workout){

        var matchesCategory =

            filterCategory === "all" || workout.category === filterCategory;

        var matchesSearch =

            query === "" || workout.name.toLowerCase().indexOf(query) !== -1;

        return matchesCategory && matchesSearch;

    });

}

function renderLibraryGrid(){

    var grid = ct$("ct-library-grid");

    var emptyState = ct$("ct-library-empty");

    var filtered = getFilteredLibrary();

    if(library.length === 0){

        grid.innerHTML = "";

        emptyState.classList.add("visible");

        emptyState.innerHTML =

            'No cross-training workouts yet. Click <strong>+ New Workout</strong> to build your first one.';

        return;

    }

    if(filtered.length === 0){

        grid.innerHTML = "";

        emptyState.classList.add("visible");

        emptyState.innerHTML = "No workouts match your search or filter.";

        return;

    }

    emptyState.classList.remove("visible");

    var html = "";

    filtered.forEach(function(workout){

        var cat = CATEGORIES[workout.category] || CATEGORIES.other;

        var total = workoutTotalMinutes(workout);

        var dominant = workoutDominantIntensity(workout);

        var blockRows = workout.blocks.slice(0,4).map(function(block){

            return '<div class="ct-card-block-row">' +

                '<span>' + escapeHtml(block.label || "Block") + '</span>' +

                '<span>' + (Number(block.duration)||0) + ' min · ' + block.intensity + '</span>' +

            '</div>';

        }).join("");

        var moreCount = workout.blocks.length - 4;

        if(moreCount > 0){

            blockRows += '<div class="ct-card-block-row"><span>+' + moreCount + ' more</span><span></span></div>';

        }

        html += '<div class="ct-card" data-workout-id="' + workout.id + '">' +

            '<div class="ct-card-top">' +

                '<div class="ct-card-icon" style="background:' + cat.color + '22;color:' + cat.color + ';">' + cat.icon + '</div>' +

                '<div>' +

                    '<div class="ct-card-name">' + escapeHtml(workout.name) + '</div>' +

                    '<div class="ct-card-category">' + cat.label + '</div>' +

                '</div>' +

            '</div>' +

            '<div class="ct-card-meta">' +

                '<span class="ct-card-meta-chip">' + total + ' min</span>' +

                '<span class="ct-card-meta-chip">' + workout.blocks.length + ' block' + (workout.blocks.length===1?"":"s") + '</span>' +

                '<span class="ct-card-meta-chip">' + dominant + '</span>' +

            '</div>' +

            '<div class="ct-card-blocks">' + blockRows + '</div>' +

            '<div class="ct-card-actions">' +

                '<button type="button" class="ct-card-btn ct-card-btn-primary" data-action="attach" data-id="' + workout.id + '">Attach</button>' +

                '<button type="button" class="ct-card-btn" data-action="edit" data-id="' + workout.id + '">Edit</button>' +

                '<button type="button" class="ct-card-btn" data-action="duplicate" data-id="' + workout.id + '">Duplicate</button>' +

                '<button type="button" class="ct-card-btn ct-card-btn-danger" data-action="delete" data-id="' + workout.id + '">Delete</button>' +

            '</div>' +

        '</div>';

    });

    grid.innerHTML = html;

    grid.querySelectorAll("[data-action]").forEach(function(btn){

        btn.addEventListener("click", function(){

            var id = btn.dataset.id;

            var action = btn.dataset.action;

            if(action === "attach"){

                ct$("ct-attach-workout-select").value = id;

                renderDayPreview();

                document.querySelector(".ct-attach-panel").scrollIntoView({ behavior:"smooth", block:"start" });

            }
            else if(action === "edit"){

                openBuilder(getWorkoutById(id));

            }
            else if(action === "duplicate"){

                duplicateWorkout(id);

            }
            else if(action === "delete"){

                deleteWorkout(id);

            }

        });

    });

}

function duplicateWorkout(id){

    var source = getWorkoutById(id);

    if(!source){

        return;

    }

    var clone = {

        id: makeId("ct"),

        name: source.name + " (Copy)",

        category: source.category,

        blocks: source.blocks.map(function(block){

            return { id: makeId("blk"), label:block.label, duration:block.duration, intensity:block.intensity, notes:block.notes };

        }),

        notes: source.notes || "",

        createdAt: new Date().toISOString(),

        updatedAt: new Date().toISOString()

    };

    library.push(clone);

    saveLibraryToStorage();

    renderLibraryGrid();

    renderAttachWorkoutSelect();

    renderStats();

}

function deleteWorkout(id){

    var workout = getWorkoutById(id);

    if(!workout){

        return;

    }

    if(!confirm('Delete "' + workout.name + '" from your library? Days it\'s already attached to keep their entry.')){

        return;

    }

    library = library.filter(function(w){ return w.id !== id; });

    saveLibraryToStorage();

    renderLibraryGrid();

    renderAttachWorkoutSelect();

    renderStats();

}

/* ==========================================
   Builder Modal
========================================== */

function defaultNewBlocks(){

    return [

        { id: makeId("blk"), label:"Warm-up",  duration:10, intensity:"easy",     notes:"" },
        { id: makeId("blk"), label:"Main Set",  duration:20, intensity:"moderate", notes:"" },
        { id: makeId("blk"), label:"Cooldown",  duration:5,  intensity:"easy",     notes:"" }

    ];

}

function openBuilder(existingWorkout){

    if(existingWorkout){

        builderEditingId = existingWorkout.id;

        ct$("ct-modal-title").textContent = "Edit Cross-Training Workout";

        ct$("ct-builder-name").value = existingWorkout.name;

        ct$("ct-builder-notes").value = existingWorkout.notes || "";

        builderCategory = existingWorkout.category;

        builderBlocks = existingWorkout.blocks.map(function(block){

            return { id: makeId("blk"), label:block.label, duration:block.duration, intensity:block.intensity, notes:block.notes };

        });

    }
    else{

        builderEditingId = null;

        ct$("ct-modal-title").textContent = "New Cross-Training Workout";

        ct$("ct-builder-name").value = "";

        ct$("ct-builder-notes").value = "";

        builderCategory = "cycling";

        builderBlocks = defaultNewBlocks();

    }

    renderCategoryChips();

    renderBlocksList();

    updateBuilderTotal();

    ct$("ct-modal-overlay").classList.add("open");

}

function closeBuilder(){

    ct$("ct-modal-overlay").classList.remove("open");

}

function renderCategoryChips(){

    var container = ct$("ct-builder-category-chips");

    var html = "";

    Object.keys(CATEGORIES).forEach(function(key){

        var cat = CATEGORIES[key];

        var active = key === builderCategory;

        html += '<button type="button" class="ct-category-chip' + (active ? " active" : "") +

            '" data-category="' + key + '" style="' +

            (active ? "background:" + cat.color + ";" : "") +

            '">' + cat.icon + ' ' + cat.label + '</button>';

    });

    container.innerHTML = html;

    container.querySelectorAll("[data-category]").forEach(function(chip){

        chip.addEventListener("click", function(){

            builderCategory = chip.dataset.category;

            renderCategoryChips();

        });

    });

}

function renderBlocksList(){

    var list = ct$("ct-blocks-list");

    var html = "";

    builderBlocks.forEach(function(block){

        html += '<div class="ct-block-row" draggable="true" data-block-id="' + block.id + '">' +

            '<div class="ct-block-drag-handle">⋮⋮</div>' +

            '<input type="text" class="ct-block-input" data-field="label" data-id="' + block.id + '" placeholder="Block label" value="' + escapeHtml(block.label) + '">' +

            '<input type="number" min="0" class="ct-block-input" data-field="duration" data-id="' + block.id + '" placeholder="min" value="' + block.duration + '">' +

            '<select class="ct-block-select" data-field="intensity" data-id="' + block.id + '">' +

                INTENSITIES.map(function(level){

                    return '<option value="' + level + '"' + (block.intensity === level ? " selected" : "") + '>' + level + '</option>';

                }).join("") +

            '</select>' +

            '<input type="text" class="ct-block-input" data-field="notes" data-id="' + block.id + '" placeholder="Notes" value="' + escapeHtml(block.notes) + '">' +

            '<button type="button" class="ct-block-remove" data-remove-block="' + block.id + '">✕</button>' +

        '</div>';

    });

    list.innerHTML = html;

    attachBlockRowEvents();

}

function attachBlockRowEvents(){

    var list = ct$("ct-blocks-list");

    list.querySelectorAll("[data-field]").forEach(function(input){

        var eventName = input.tagName === "SELECT" ? "change" : "input";

        input.addEventListener(eventName, function(){

            var id = input.dataset.id;

            var field = input.dataset.field;

            var block = builderBlocks.find(function(b){ return b.id === id; });

            if(!block){

                return;

            }

            block[field] = field === "duration" ? input.value : input.value;

            updateBuilderTotal();

        });

    });

    list.querySelectorAll("[data-remove-block]").forEach(function(btn){

        btn.addEventListener("click", function(){

            var id = btn.dataset.removeBlock;

            builderBlocks = builderBlocks.filter(function(b){ return b.id !== id; });

            renderBlocksList();

            updateBuilderTotal();

        });

    });

    list.querySelectorAll(".ct-block-row").forEach(function(row){

        row.addEventListener("dragstart", function(){

            draggedBlockId = row.dataset.blockId;

            row.classList.add("ct-dragging");

        });

        row.addEventListener("dragend", function(){

            row.classList.remove("ct-dragging");

            list.querySelectorAll(".ct-block-row").forEach(function(r){

                r.classList.remove("ct-drag-over");

            });

        });

        row.addEventListener("dragover", function(event){

            event.preventDefault();

            if(row.dataset.blockId !== draggedBlockId){

                row.classList.add("ct-drag-over");

            }

        });

        row.addEventListener("dragleave", function(){

            row.classList.remove("ct-drag-over");

        });

        row.addEventListener("drop", function(event){

            event.preventDefault();

            row.classList.remove("ct-drag-over");

            var targetId = row.dataset.blockId;

            if(!draggedBlockId || draggedBlockId === targetId){

                return;

            }

            var fromIndex = builderBlocks.findIndex(function(b){ return b.id === draggedBlockId; });

            var toIndex = builderBlocks.findIndex(function(b){ return b.id === targetId; });

            if(fromIndex === -1 || toIndex === -1){

                return;

            }

            var moved = builderBlocks.splice(fromIndex, 1)[0];

            builderBlocks.splice(toIndex, 0, moved);

            draggedBlockId = null;

            renderBlocksList();

        });

    });

}

function updateBuilderTotal(){

    var total = builderBlocks.reduce(function(sum, block){

        return sum + (Number(block.duration) || 0);

    }, 0);

    ct$("ct-builder-total").textContent = "Total: " + total + " min";

}

function addBuilderBlock(){

    var block = { id: makeId("blk"), label:"", duration:10, intensity:"easy", notes:"" };

    builderBlocks.push(block);

    renderBlocksList();

    updateBuilderTotal();

    var newRow = document.querySelector('[data-block-id="' + block.id + '"] .ct-block-input');

    if(newRow){

        newRow.focus();

    }

}

function saveWorkoutFromBuilder(){

    var name = ct$("ct-builder-name").value.trim();

    if(name === ""){

        alert("Give this workout a name before saving.");

        return;

    }

    if(builderBlocks.length === 0){

        alert("Add at least one block before saving.");

        return;

    }

    var cleanedBlocks = builderBlocks.map(function(block){

        return {

            id: block.id,

            label: (block.label || "").trim() || "Block",

            duration: Number(block.duration) || 0,

            intensity: INTENSITIES.indexOf(block.intensity) !== -1 ? block.intensity : "easy",

            notes: (block.notes || "").trim()

        };

    });

    var notes = ct$("ct-builder-notes").value.trim();

    if(builderEditingId){

        var existing = getWorkoutById(builderEditingId);

        existing.name = name;

        existing.category = builderCategory;

        existing.blocks = cleanedBlocks;

        existing.notes = notes;

        existing.updatedAt = new Date().toISOString();

    }
    else{

        library.push({

            id: makeId("ct"),

            name: name,

            category: builderCategory,

            blocks: cleanedBlocks,

            notes: notes,

            createdAt: new Date().toISOString(),

            updatedAt: new Date().toISOString()

        });

    }

    saveLibraryToStorage();

    closeBuilder();

    renderLibraryGrid();

    renderAttachWorkoutSelect();

    renderStats();

}

/* ==========================================
   Attach Panel: Workout Select
========================================== */

function renderAttachWorkoutSelect(){

    var select = ct$("ct-attach-workout-select");

    var current = select.value;

    var html = '<option value="">Select a workout from your library…</option>';

    library.forEach(function(workout){

        var cat = CATEGORIES[workout.category] || CATEGORIES.other;

        html += '<option value="' + workout.id + '">' + cat.icon + ' ' + escapeHtml(workout.name) + '</option>';

    });

    select.innerHTML = html;

    if(library.some(function(w){ return w.id === current; })){

        select.value = current;

    }

}

/* ==========================================
   Attach Panel: Week / Day Selectors
========================================== */

function renderWeekChips(){

    var container = ct$("ct-attach-weeklist");

    var html = "";

    for(var n = 1; n <= WEEKS.length; n++){

        html += '<div class="ct-week-chip' + (n === attachWeek ? " active" : "") +

            '" data-week="' + n + '">Wk ' + n + '</div>';

    }

    container.innerHTML = html;

    container.querySelectorAll("[data-week]").forEach(function(chip){

        chip.addEventListener("click", function(){

            attachWeek = Number(chip.dataset.week);

            renderWeekChips();

            renderDayPills();

            renderDayPreview();

            renderStats();

        });

    });

}

function dayMinutesFor(week, dayKey){

    var overrides = loadOverrides();

    var dayOverride = overrides[week] && overrides[week][dayKey];

    var entries = (dayOverride && dayOverride.crossTraining) || [];

    return entries.reduce(function(sum, entry){

        return sum + parseMinutes(entry.duration);

    }, 0);

}

function renderDayPills(){

    var container = ct$("ct-attach-daypills");

    var html = "";

    DAYS.forEach(function(dayKey){

        var minutes = dayMinutesFor(attachWeek, dayKey);

        html += '<div class="ct-day-pill' + (dayKey === attachDay ? " active" : "") +

            '" data-day="' + dayKey + '">' +

            '<span>' + dayKey + '</span>' +

            (minutes > 0 ? '<span class="ct-day-pill-badge">' + minutes + 'm</span>' : '') +

        '</div>';

    });

    container.innerHTML = html;

    container.querySelectorAll("[data-day]").forEach(function(pill){

        pill.addEventListener("click", function(){

            attachDay = pill.dataset.day;

            renderDayPills();

            renderDayPreview();

        });

    });

}

function renderDayPreview(){

    var preview = ct$("ct-day-preview");

    var dayIndex = DAYS.indexOf(attachDay);

    var adjustedDays = getAdjustedWeekDays(attachWeek);

    var day = adjustedDays[dayIndex];

    var week = WEEKS[attachWeek - 1];

    var phaseInfo = PHASES[week.phase];

    var overrides = loadOverrides();

    var dayOverride = (overrides[attachWeek] && overrides[attachWeek][attachDay]) || {};

    var entries = dayOverride.crossTraining || [];

    var attachedHtml = "";

    if(entries.length === 0){

        attachedHtml = '<div class="ct-preview-empty">No cross training attached to this day yet.</div>';

    }
    else{

        entries.forEach(function(entry, index){

            var isLibraryEntry = !!entry._ctLibraryId;

            attachedHtml += '<div class="ct-attached-item">' +

                '<div class="ct-attached-item-info">' +

                    '<strong>' + escapeHtml(entry.activity || "Cross training") + '</strong>' +

                    '<span>' + escapeHtml(entry.duration || "") + (entry.intensity ? " · " + escapeHtml(entry.intensity) : "") + '</span>' +

                '</div>' +

                (isLibraryEntry

                    ? '<button type="button" class="ct-detach-btn" data-detach-index="' + index + '">Detach</button>'

                    : '<span class="ct-detach-btn" style="opacity:.5;cursor:default;">Added in Marathon</span>'

                ) +

            '</div>';

        });

    }

    preview.innerHTML =

        '<div class="ct-preview-head">' +

            '<div>' +

                '<div class="ct-preview-week">Week ' + attachWeek + ' · ' + attachDay + '</div>' +

                '<div class="ct-preview-dates">' + weekRange(attachWeek) + ' · ' + phaseInfo.label + '</div>' +

            '</div>' +

        '</div>' +

        '<div class="ct-preview-main"><strong>' + escapeHtml(day.session) + '</strong> — ' + day.miles + ' mi @ ' + escapeHtml(day.pace) + '</div>' +

        '<div class="ct-preview-attached-title">Cross Training Attached</div>' +

        attachedHtml;

    preview.querySelectorAll("[data-detach-index]").forEach(function(btn){

        btn.addEventListener("click", function(){

            detachEntryAtIndex(Number(btn.dataset.detachIndex));

        });

    });

}

function detachEntryAtIndex(index){

    var overrides = loadOverrides();

    if(!overrides[attachWeek] || !overrides[attachWeek][attachDay] || !overrides[attachWeek][attachDay].crossTraining){

        return;

    }

    overrides[attachWeek][attachDay].crossTraining.splice(index, 1);

    saveOverrides(overrides);

    renderDayPreview();

    renderDayPills();

    renderStats();

}

/* ==========================================
   Attach Action
========================================== */

function attachWorkoutToDay(){

    var errorEl = ct$("ct-attach-error");

    errorEl.textContent = "";

    errorEl.className = "ct-attach-error";

    var workoutId = ct$("ct-attach-workout-select").value;

    if(!workoutId){

        errorEl.textContent = "Choose a workout to attach first.";

        return;

    }

    var workout = getWorkoutById(workoutId);

    if(!workout){

        errorEl.textContent = "That workout could not be found.";

        return;

    }

    var overrides = loadOverrides();

    if(!overrides[attachWeek]){

        overrides[attachWeek] = {};

    }

    if(!overrides[attachWeek][attachDay]){

        overrides[attachWeek][attachDay] = {};

    }

    if(!overrides[attachWeek][attachDay].crossTraining){

        overrides[attachWeek][attachDay].crossTraining = [];

    }

    var existingEntries = overrides[attachWeek][attachDay].crossTraining;

    var alreadyAttached = existingEntries.some(function(entry){

        return entry._ctLibraryId === workout.id;

    });

    if(alreadyAttached){

        errorEl.textContent =

            'This workout is already attached to this day. Detach it below first if you want to reattach an updated version.';

        return;

    }

    workout.blocks.forEach(function(block){

        existingEntries.push({

            activity: workout.name + " — " + block.label,

            duration: block.duration + " min",

            intensity: block.intensity,

            notes: block.notes || "",

            _ctLibraryId: workout.id,

            _ctLibraryName: workout.name

        });

    });

    saveOverrides(overrides);

    renderDayPreview();

    renderDayPills();

    renderStats();

    errorEl.className = "ct-attach-success";

    errorEl.textContent = '"' + workout.name + '" attached to Week ' + attachWeek + ' · ' + attachDay + ".";

}

/* ==========================================
   Stats
========================================== */

function renderStats(){

    ct$("ct-stat-library").textContent = library.length;

    var overrides = loadOverrides();

    var weekMinutes = 0;

    DAYS.forEach(function(dayKey){

        weekMinutes += dayMinutesFor(attachWeek, dayKey);

    });

    ct$("ct-stat-week-min").textContent = Math.round(weekMinutes);

    var cycleMinutes = 0;

    var daysCovered = 0;

    for(var n = 1; n <= WEEKS.length; n++){

        DAYS.forEach(function(dayKey){

            var minutes = dayMinutesFor(n, dayKey);

            cycleMinutes += minutes;

            var dayOverride = overrides[n] && overrides[n][dayKey];

            if(dayOverride && dayOverride.crossTraining && dayOverride.crossTraining.length > 0){

                daysCovered++;

            }

        });

    }

    ct$("ct-stat-cycle-min").textContent = Math.round(cycleMinutes);

    ct$("ct-stat-days-covered").textContent = daysCovered;

}

/* ==========================================
   Event Wiring
========================================== */

function attachEvents(){

    ct$("ct-new-workout-btn").addEventListener("click", function(){

        openBuilder(null);

    });

    ct$("ct-modal-close").addEventListener("click", closeBuilder);

    ct$("ct-builder-cancel").addEventListener("click", closeBuilder);

    ct$("ct-modal-overlay").addEventListener("click", function(event){

        if(event.target === ct$("ct-modal-overlay")){

            closeBuilder();

        }

    });

    ct$("ct-add-block-btn").addEventListener("click", addBuilderBlock);

    ct$("ct-builder-save").addEventListener("click", saveWorkoutFromBuilder);

    ct$("ct-search").addEventListener("input", function(event){

        searchQuery = event.target.value;

        renderLibraryGrid();

    });

    ct$("ct-attach-workout-select").addEventListener("change", renderDayPreview);

    ct$("ct-attach-btn").addEventListener("click", attachWorkoutToDay);

}

/* ==========================================
   Initialize
========================================== */

function init(){

    if(!ct$("ct-root")){

        return;

    }

    library = loadLibrary();

    attachWeek = (typeof getCurrentWeek === "function") ? getCurrentWeek() : 1;

    attachDay = "Mon";

    renderFilterChips();

    renderLibraryGrid();

    renderAttachWorkoutSelect();

    renderWeekChips();

    renderDayPills();

    renderDayPreview();

    renderStats();

    attachEvents();

}

init();
