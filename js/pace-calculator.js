/* ==========================================
   Southbound Pace Calculator
   Plain classic script — no import/export,
   so nothing can fail on module resolution.
========================================== */

console.log("Southbound Pace Calculator");

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

    initToolTabs();
    initRaceSplits();
    initTrainingZones();

}

/* ==========================================
   Tool tab switching
========================================== */

function initToolTabs(){

    document.querySelectorAll("[data-pc-tool]").forEach(function(btn){

        btn.addEventListener("click", function(){

            var tool = btn.dataset.pcTool;

            document.querySelectorAll("[data-pc-tool]").forEach(function(b){
                b.classList.toggle("active", b === btn);
            });

            document.querySelectorAll("[data-pc-panel]").forEach(function(panel){
                panel.classList.toggle("active", panel.dataset.pcPanel === tool);
            });

        });

    });

}

function populateDistancePreset(selectId){

    var select = pc$(selectId);

    if(!select){
        return;
    }

    select.innerHTML = PRESETS.map(function(p, i){
        var selected = p.label === "Marathon" ? " selected" : "";
        return "<option value=\"" + i + "\"" + selected + ">" + p.label + "</option>";
    }).join("");

}

/* ==========================================
   Race Split Planner

   Negative split uses an exact two-half model:
   first half run at evenPace*(1+d), second half
   at evenPace*(1-d). Because both halves cover
   the same distance, the weighted average is
   exactly evenPace regardless of d -- so the
   generated splits always sum to the real goal
   time, not an approximation of it.
========================================== */

function initRaceSplits(){

    populateDistancePreset("rs-distance-preset");

    document.querySelectorAll("#rs-style-toggle .pc-unit-btn").forEach(function(btn){
        btn.addEventListener("click", function(){
            document.querySelectorAll("#rs-style-toggle .pc-unit-btn").forEach(function(b){
                b.classList.toggle("active", b === btn);
            });
        });
    });

    document.querySelectorAll("#rs-unit-toggle .pc-unit-btn").forEach(function(btn){
        btn.addEventListener("click", function(){
            document.querySelectorAll("#rs-unit-toggle .pc-unit-btn").forEach(function(b){
                b.classList.toggle("active", b === btn);
            });
        });
    });

    var calcBtn = pc$("rs-calc-btn");

    if(calcBtn){
        calcBtn.addEventListener("click", calculateSplits);
    }

}

function calculateSplits(){

    var errorEl = pc$("rs-error");
    errorEl.style.display = "none";

    var distIndex = Number(pc$("rs-distance-preset").value);
    var preset = PRESETS[distIndex];

    if(!preset){
        errorEl.textContent = "Choose a distance.";
        errorEl.style.display = "block";
        return;
    }

    var h = Number(pc$("rs-goal-h").value) || 0;
    var m = Number(pc$("rs-goal-m").value) || 0;
    var s = Number(pc$("rs-goal-s").value) || 0;
    var goalSeconds = h * 3600 + m * 60 + s;

    if(goalSeconds <= 0){
        errorEl.textContent = "Enter a goal time.";
        errorEl.style.display = "block";
        return;
    }

    var unit = document.querySelector("#rs-unit-toggle .active").dataset.rsUnit;
    var style = document.querySelector("#rs-style-toggle .active").dataset.rsStyle;

    var distanceInUnit = unit === "mi" ? preset.km / 1.609344 : preset.km;
    var evenPace = goalSeconds / distanceInUnit;

    var d = 0.02; // 2% -- a moderate, not-extreme negative split
    var firstHalfPace = style === "negative" ? evenPace * (1 + d) : evenPace;
    var secondHalfPace = style === "negative" ? evenPace * (1 - d) : evenPace;

    var totalUnits = Math.ceil(distanceInUnit);
    var halfDistance = distanceInUnit / 2;

    var rows = [];
    var cumulativeDistance = 0;
    var cumulativeTime = 0;

    for(var i = 1; i <= totalUnits; i++){

        var unitLength = (i === totalUnits && distanceInUnit % 1 !== 0)
            ? distanceInUnit - (totalUnits - 1)
            : 1;

        var unitStart = cumulativeDistance;
        var unitEnd = cumulativeDistance + unitLength;

        // A unit that straddles the halfway point is split proportionally
        // between the two paces so the exact-average property still holds.
        var beforeHalf = Math.max(0, Math.min(unitLength, halfDistance - unitStart));
        var afterHalf = unitLength - beforeHalf;

        var splitSeconds = (beforeHalf * firstHalfPace) + (afterHalf * secondHalfPace);
        var thisUnitPace = splitSeconds / unitLength;

        cumulativeDistance = unitEnd;
        cumulativeTime += splitSeconds;

        var label;

        if(i === totalUnits && unitLength < 1){
            label = (unit === "mi" ? "Final " : "Final ") + unitLength.toFixed(2) + " " + unit;
        } else {
            label = (unit === "mi" ? "Mile " : "KM ") + i;
        }

        rows.push({
            label: label,
            pace: formatPace(thisUnitPace) + "/" + unit,
            split: formatTime(splitSeconds),
            cumulative: formatTime(cumulativeTime)
        });

    }

    renderSplitsTable(rows);
    pc$("rs-result-card").style.display = "block";

}

function renderSplitsTable(rows){

    var container = pc$("rs-splits-table");

    if(!container){
        return;
    }

    var header =
        "<div class=\"pc-splits-row pc-splits-header\">" +
        "<span>Split</span><span>Pace</span><span>Split Time</span><span>Cumulative</span>" +
        "</div>";

    var body = rows.map(function(r){
        return "<div class=\"pc-splits-row\">" +
            "<span>" + r.label + "</span>" +
            "<span>" + r.pace + "</span>" +
            "<span>" + r.split + "</span>" +
            "<span>" + r.cumulative + "</span>" +
            "</div>";
    }).join("");

    container.innerHTML = header + body;

}

/* ==========================================
   Training Zones (Jack Daniels VDOT method)

   Two equations from Daniels & Gilbert's
   "Oxygen Power" (1979), still the standard
   reference for this method:

   VO2 = -4.60 + 0.182258v + 0.000104v^2
     (v in meters/min -- oxygen cost of running
     at a given velocity)

   %VO2max = 0.8 + 0.1894393*e^(-0.012778t)
             + 0.2989558*e^(-0.1932605t)
     (t in minutes -- how much of VO2max is
     sustainable for a given race duration)

   VDOT = VO2(at race pace) / %VO2max(at race time)

   Training paces are then the velocity that
   produces VDOT * each zone's target %VO2max,
   found by inverting the first equation.

   Verified against two independently known
   reference points before shipping (a 19:57 5K
   and a 3:10:47 marathon both correctly compute
   to VDOT 50 using these exact formulas).
========================================== */

var TRAINING_ZONES = [
    { name: "Easy", lowPct: 0.65, highPct: 0.79 },
    { name: "Marathon", lowPct: 0.84, highPct: 0.84 },
    { name: "Threshold", lowPct: 0.88, highPct: 0.88 },
    { name: "Interval", lowPct: 0.98, highPct: 0.98 },
    { name: "Repetition", lowPct: 1.05, highPct: 1.05 }
];

function vo2AtVelocity(v){
    return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

function velocityAtVo2(vo2){
    var a = 0.000104, b = 0.182258, c = -4.60 - vo2;
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

function pctVo2MaxAtTime(tMinutes){
    return 0.8
        + 0.1894393 * Math.exp(-0.012778 * tMinutes)
        + 0.2989558 * Math.exp(-0.1932605 * tMinutes);
}

function vdotFromRace(distanceMeters, timeSeconds){
    var timeMinutes = timeSeconds / 60;
    var v = distanceMeters / timeMinutes;
    var vo2 = vo2AtVelocity(v);
    var pct = pctVo2MaxAtTime(timeMinutes);
    return vo2 / pct;
}

function paceSecondsPerMile(velocityMetersPerMin){
    return (1609.344 / velocityMetersPerMin) * 60;
}

function initTrainingZones(){

    populateDistancePreset("tz-distance-preset");

    var calcBtn = pc$("tz-calc-btn");

    if(calcBtn){
        calcBtn.addEventListener("click", calculateZones);
    }

}

function calculateZones(){

    var errorEl = pc$("tz-error");
    errorEl.style.display = "none";

    var distIndex = Number(pc$("tz-distance-preset").value);
    var preset = PRESETS[distIndex];

    if(!preset){
        errorEl.textContent = "Choose a distance.";
        errorEl.style.display = "block";
        return;
    }

    var h = Number(pc$("tz-time-h").value) || 0;
    var m = Number(pc$("tz-time-m").value) || 0;
    var s = Number(pc$("tz-time-s").value) || 0;
    var timeSeconds = h * 3600 + m * 60 + s;

    if(timeSeconds <= 0){
        errorEl.textContent = "Enter your finish time.";
        errorEl.style.display = "block";
        return;
    }

    var distanceMeters = preset.km * 1000;
    var vdot = vdotFromRace(distanceMeters, timeSeconds);

    var rows = TRAINING_ZONES.map(function(zone){

        var vHigh = velocityAtVo2(vdot * zone.highPct);
        var paceFast = paceSecondsPerMile(vHigh);

        var range;

        if(zone.lowPct === zone.highPct){
            range = formatPace(paceFast) + " /mi";
        } else {
            var vLow = velocityAtVo2(vdot * zone.lowPct);
            var paceSlow = paceSecondsPerMile(vLow);
            range = formatPace(paceFast) + "\u2013" + formatPace(paceSlow) + " /mi";
        }

        return { name: zone.name, range: range };

    });

    renderZonesTable(rows, vdot);
    pc$("tz-result-card").style.display = "block";

}

function renderZonesTable(rows, vdot){

    var container = pc$("tz-zones-table");
    var vdotLabel = pc$("tz-vdot-label");

    if(vdotLabel){
        vdotLabel.textContent = "VDOT " + vdot.toFixed(1);
    }

    if(!container){
        return;
    }

    container.innerHTML = rows.map(function(r){
        return "<div class=\"pc-zones-row\">" +
            "<span class=\"pc-zones-name\">" + r.name + "</span>" +
            "<span class=\"pc-zones-range\">" + r.range + "</span>" +
            "</div>";
    }).join("");

}

init();
