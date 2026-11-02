/* ==========================================
   Southbound — this week's run count for the completion moment (js/celebrate.js)

   weekProgressNow() reads the same week My Plan shows (js/weekModel.js
   buildWeek over the device's plans) and returns { runsDone, runsPlanned,
   milesDone, milesPlanned }, or null when there is no planned run this week.
   Kept apart from js/celebrate.js so that file stays free of storage reads
   (its unit tests run without a device). Never throws: a failure just
   leaves the "This week" strip out of the moment.
========================================== */

import { buildWeek } from "./weekModel.js";
import { weekInputs } from "./weekData.js";
import { weekRunProgress } from "./celebrate.js";
import { mondayOf } from "./coachingPlanModel.js";

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function weekProgressNow(now = new Date()) {
    try {
        const today = iso(now);
        return weekRunProgress(buildWeek(mondayOf(today), weekInputs(), today));
    } catch (error) {
        console.error("Southbound: this week's runs unavailable for the completion moment.", error);
        return null;
    }
}
