/* ==========================================
   EddieOS Pace Calculator
   Plain classic script — no import/export,
   so nothing can fail on module resolution.
========================================== */

console.log("EddieOS Pace Calculator");

/* ==========================================
   Constants
========================================== */

var KM_PER_MILE = 1.609344;

/* Canonical race distances, stored in km */
var PRESETS = [

    { label:"1 Mile",        km:1.60934  },
    { label:"5K",             km:5        },
    { label:"10K",            km:10       },
    { label:"15K",            km:15       },
    { label:"10 Mile",        km:16.09344 },
    { label:"Half Marathon",  km:21.0975  },
    { label:"Marathon",       km:42.195   }

];

/* ==========================================
   State
========================================== */

var solveMode = "pace";

var unit = "mi";

/* ==========================================
   DOM Helpers
========================================== */

function pc$(id){

    return document.getElementById(id);

}

function toKm(value){

    return unit === "mi" ? value * KM_PER_MILE : value;

}

function fromKm(km){

    return unit === "mi" ? km / KM_PER_MILE : km;

}

/* ==========================================
   Formatting Helpers
========================================== */

function pad2(n){

    return String(Math.round(n)).padStart(2,"0");

}

function formatTime(totalSeconds){

    if(!isFinite(totalSeconds) || totalSeconds < 0){

        return "--:--";

    }

    var total = Math.round(totalSeconds);

    var hours = Math.floor(total / 3600);

    var minutes = Math.floor((total % 3600) / 60);

    var seconds = total % 60;

    if(hours > 0){

        return hours + ":" + pad2(minutes) + ":" + pad2(seconds);

    }

    return minutes + ":" + pad2(seconds);

}

function formatPace(secondsPerUnit){

    if(!isFinite(secondsPerUnit) || secondsPerUnit < 0){

        return "--:--";

    }

    var total = Math.round(secondsPerUnit);

    var minutes = Math.floor(total / 60);

    var seconds = total % 60;

    return minutes + ":" + pad2(seconds);

}

/* ==========================================
   Input Readers
========================================== */

function readNumber(id){

    var el = pc$(id);

    if(!el){

        return null;

    }

    var raw = el.value.trim();

    if(raw === ""){

        return null;

    }

    var value = Number(raw);

    return isNaN(value) ? null : value;

}

function getDistanceValue(){

    return readNumber("pc-distance-input");

}

function getTimeSeconds(){

    var h = readNumber("pc-time-h");

    var m = readNumber("pc-time-m");

    var s = readNumber("pc-time-s");

    if(h === null && m === null && s === null){

        return null;

    }

    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);

}

function getPaceSeconds(){

    var m = readNumber("pc-pace-m");

    var s = readNumber("pc-pace-s");

    if(m === null && s === null){

        return null;

    }

    return (m || 0) * 60 + (s || 0);

}

function setTimeInputs(totalSeconds){

    var total = Math.round(totalSeconds);

    var hours = Math.floor(total / 3600);

    var minutes = Math.floor((total % 3600) / 60);

    var seconds = total % 60;

    pc$("pc-time-h").value = hours;

    pc$("pc-time-m").value = minutes;

    pc$("pc-time-s").value = seconds;

}

function setPaceInputs(secondsPerUnit){

    var total = Math.round(secondsPerUnit);

    var minutes = Math.floor(total / 60);

    var seconds = total % 60;

    pc$("pc-pace-m").value = minutes;

    pc$("pc-pace-s").value = seconds;

}

function setDistanceInput(value){

    pc$("pc-distance-input").value = Math.round(value * 1000) / 1000;

}

/* ==========================================
   Solve Mode + Unit Toggle
========================================== */

function setSolveMode(mode){

    solveMode = mode;

    document

    .querySelectorAll("[data-solve]")

    .forEach(function(btn){

        btn.classList.toggle(

            "active",

            btn.dataset.solve === mode

        );

    });

    pc$("pc-field-distance").classList.toggle(

        "pc-field-hidden", mode === "distance"

    );

    pc$("pc-field-time").classList.toggle(

        "pc-field-hidden", mode === "time"

    );

    pc$("pc-field-pace").classList.toggle(

        "pc-field-hidden", mode === "pace"

    );

    clearError();

}

function setUnit(next){

    unit = next;

    document

    .querySelectorAll("[data-unit]")

    .forEach(function(btn){

        btn.classList.toggle(

            "active",

            btn.dataset.unit === next

        );

    });

    var unitLabel = unit === "mi" ? "mi" : "km";

    pc$("pc-distance-unit-label").textContent = unitLabel;

    pc$("pc-pace-unit-label").textContent =

        unit === "mi" ? "(per mile)" : "(per km)";

    populatePresets();

    clearError();

}

function populatePresets(){

    var select = pc$("pc-distance-preset");

    var current = select.value;

    var options = ['<option value="">Common distances…</option>'];

    PRESETS.forEach(function(preset){

        var value = fromKm(preset.km);

        options.push(

            '<option value="' + value + '">' + preset.label + '</option>'

        );

    });

    select.innerHTML = options.join("");

    select.value = current || "";

}

/* ==========================================
   Error Display
========================================== */

function showError(message){

    pc$("pc-error").textContent = message;

}

function clearError(){

    pc$("pc-error").textContent = "";

}

/* ==========================================
   Splits Table
========================================== */

function renderSplits(paceSecondsPerUnit){

    var grid = pc$("pc-splits-grid");

    var html = "";

    PRESETS.forEach(function(preset){

        var distanceInUnit = fromKm(preset.km);

        var timeSeconds = paceSecondsPerUnit * distanceInUnit;

        html +=

            '<div class="pc-split-card">' +

                '<div class="pc-split-name">' + preset.label + '</div>' +

                '<div class="pc-split-time">' + formatTime(timeSeconds) + '</div>' +

            '</div>';

    });

    grid.innerHTML = html;

}

/* ==========================================
   Result Display
========================================== */

function showResult(paceSeconds, timeSeconds, distanceValue){

    var card = pc$("pc-result-card");

    card.classList.add("visible");

    var labelMap = {

        pace:"Your Pace",

        time:"Your Time",

        distance:"Your Distance"

    };

    pc$("pc-result-label").textContent = labelMap[solveMode];

    var unitLabel = unit === "mi" ? "mi" : "km";

    var mainValue =

        solveMode === "pace"

        ? formatPace(paceSeconds) + " /" + (unit === "mi" ? "mile" : "km")

        : solveMode === "time"

        ? formatTime(timeSeconds)

        : (Math.round(distanceValue * 1000) / 1000) + " " + unitLabel;

    pc$("pc-result-value").textContent = mainValue;

    var speedPerHour = paceSeconds > 0 ? 3600 / paceSeconds : 0;

    pc$("pc-result-speed").textContent =

        (Math.round(speedPerHour * 100) / 100) +

        " " +

        (unit === "mi" ? "mph" : "km/h");

    pc$("pc-result-distance").textContent =

        (Math.round(distanceValue * 1000) / 1000) + " " + unitLabel;

    pc$("pc-result-time").textContent = formatTime(timeSeconds);

    renderSplits(paceSeconds);

}

/* ==========================================
   Calculate
========================================== */

function calculate(){

    clearError();

    var distanceValue = getDistanceValue();

    var timeSeconds = getTimeSeconds();

    var paceSeconds = getPaceSeconds();

    if(solveMode === "pace"){

        if(distanceValue === null || distanceValue <= 0){

            showError("Enter a distance greater than 0.");

            return;

        }

        if(timeSeconds === null || timeSeconds <= 0){

            showError("Enter a time greater than 0.");

            return;

        }

        paceSeconds = timeSeconds / distanceValue;

        setPaceInputs(paceSeconds);

    }
    else if(solveMode === "time"){

        if(distanceValue === null || distanceValue <= 0){

            showError("Enter a distance greater than 0.");

            return;

        }

        if(paceSeconds === null || paceSeconds <= 0){

            showError("Enter a pace greater than 0.");

            return;

        }

        timeSeconds = paceSeconds * distanceValue;

        setTimeInputs(timeSeconds);

    }
    else{

        if(timeSeconds === null || timeSeconds <= 0){

            showError("Enter a time greater than 0.");

            return;

        }

        if(paceSeconds === null || paceSeconds <= 0){

            showError("Enter a pace greater than 0.");

            return;

        }

        distanceValue = timeSeconds / paceSeconds;

        setDistanceInput(distanceValue);

    }

    showResult(paceSeconds, timeSeconds, distanceValue);

}

/* ==========================================
   Event Wiring
========================================== */

function attachEvents(){

    document

    .querySelectorAll("[data-solve]")

    .forEach(function(btn){

        btn.addEventListener("click", function(){

            setSolveMode(btn.dataset.solve);

        });

    });

    document

    .querySelectorAll("[data-unit]")

    .forEach(function(btn){

        btn.addEventListener("click", function(){

            setUnit(btn.dataset.unit);

        });

    });

    var presetSelect = pc$("pc-distance-preset");

    if(presetSelect){

        presetSelect.addEventListener("change", function(){

            if(presetSelect.value !== ""){

                pc$("pc-distance-input").value = presetSelect.value;

            }

        });

    }

    var calcBtn = pc$("pc-calculate-btn");

    if(calcBtn){

        calcBtn.addEventListener("click", calculate);

    }

    document

    .querySelectorAll(".pc-input")

    .forEach(function(input){

        input.addEventListener("keydown", function(event){

            if(event.key === "Enter"){

                calculate();

            }

        });

    });

}

/* ==========================================
   Initialize
========================================== */

function init(){

    if(!pc$("pc-root")){

        return;

    }

    populatePresets();

    setSolveMode("pace");

    setUnit("mi");

    attachEvents();

}

init();
