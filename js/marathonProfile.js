/* ==========================================
   Southbound — marathon setup from a client's profile (pure)

   What the marathon plan screen (js/marathonSetup.js) starts from, and
   how it reads a race time. Nothing is made up: what the profile lacks
   stays empty, so the coach sees what still needs filling in.
   Unit-tested in tests/marathonProfile.test.mjs.
========================================== */

import { RULES, DISTANCES } from "./marathonEngine.js";
import { settingsFromProfile, nextMonday } from "./coachPlanGenerator.js";
import { realAnswer } from "./intakeFlow.js";

export const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const clockText = sec => { const t = Math.round(sec); return t >= 3600 ? `${Math.floor(t / 3600)}:${String(Math.floor(t % 3600 / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

/** "1:45:00" -> 6300, "29:00" -> 1740 (a race time, not hours and minutes); junk -> 0. */
export function raceSeconds(text) {
    const parts = String(text || "").trim().split(":");
    if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d{1,2}$/.test(p))) return 0;
    const n = parts.map(Number);
    if (n.slice(1).some(x => x > 59)) return 0;
    return n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
}
/** The setup a client's profile suggests. Nothing is made up: what the profile lacks stays empty. */
export function marathonSettingsFromProfile(record = {}, today = isoToday(), distance = "MARATHON") {
    const D = DISTANCES[distance] || DISTANCES.MARATHON;
    const base = settingsFromProfile(record, today);
    const r = record || {};
    const isMarathon = base.raceType === D.key && base.mode === "race";
    return {
        engine: "marathon", mode: "race", raceType: D.key, distance: D.key, racePriority: "A",
        startDate: base.startDate || nextMonday(today),
        raceDate: isMarathon ? base.raceDate : "",
        goalTime: isMarathon ? base.goalTime : "",
        recentRace: null,
        currentMiles: Number(r.weeklyMileage) > 0 ? Math.round(Number(r.weeklyMileage)) : 0,
        longestRun: Number(r.longestRun) > 0 ? Number(r.longestRun) : 0,
        peakMiles: 0, longTarget: D.longCapMiles,
        runDays: base.runDays, trainDays: base.trainDays, longRunDay: base.longRunDay,
        injuryHistory: Boolean(realAnswer(r.injuries)),
        firstMarathon: /first (marathon|26)/i.test(`${r.primaryGoal || ""} ${r.targetEvent || ""}`),
        strengthDays: base.strengthDays, strengthLevel: base.strengthLevel, equipment: base.equipment,
        experience: base.experience, crossDays: 0
    };
}
