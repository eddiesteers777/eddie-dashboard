// Prints a marathon engine plan as plain text, for reading a draft.
// Run: node scripts/marathon-sample.mjs [normal|first|careful|experienced|half|halffirst]
import { generateMarathonPlan } from "../js/marathonEngine.js";
import { workoutSummary } from "../js/runWorkout.js";

export const SAMPLES = {
    normal: { label: "Normal: 30 miles a week, 5 days, recent 1:45 half, goal 3:45", startDate: "2026-12-07", raceDate: "2027-03-28", goalTime: "3:45:00", recentRace: { meters: 21097.5, seconds: 6300 }, currentMiles: 30, longestRun: 10, runDays: ["MON", "TUE", "THU", "FRI", "SUN"], longRunDay: "SUN" },
    first: { label: "First marathon: 18 miles a week, 4 days, recent 29:00 5K, no goal time", startDate: "2026-12-07", raceDate: "2027-03-28", recentRace: { meters: 5000, seconds: 1740 }, currentMiles: 18, longestRun: 6, runDays: ["TUE", "THU", "SAT", "SUN"], longRunDay: "SUN", firstMarathon: true },
    careful: { label: "Careful: injury history, 25 miles a week, 4 days, goal 4:15 only, 18 weeks", startDate: "2026-11-23", raceDate: "2027-03-28", goalTime: "4:15:00", currentMiles: 25, longestRun: 8, runDays: ["TUE", "THU", "SAT", "SUN"], longRunDay: "SUN", injuryHistory: true },
    half: { label: "Half marathon, normal: 25 miles a week, 5 days, recent 47:00 10K, goal 1:40, 14 weeks", raceType: "HALF", startDate: "2026-12-21", raceDate: "2027-03-28", goalTime: "1:40:00", recentRace: { meters: 10000, seconds: 2820 }, currentMiles: 25, longestRun: 7, runDays: ["MON", "TUE", "THU", "FRI", "SUN"], longRunDay: "SUN" },
    halffirst: { label: "First half, 15 miles a week, 4 days, no race, 10 weeks", raceType: "HALF", startDate: "2027-01-18", raceDate: "2027-03-28", goalTime: "2:15:00", currentMiles: 15, longestRun: 4, runDays: ["TUE", "THU", "SAT", "SUN"], longRunDay: "SUN", firstMarathon: true },
    k5adv: { label: "5K advanced: 40 miles a week, 6 days, recent 18:30 5K, goal 17:45, 14 weeks, mile time trial, tune-up 2027-02-07", raceType: "5K", startDate: "2026-12-21", raceDate: "2027-03-27", goalTime: "17:45", recentRace: { meters: 5000, seconds: 1110 }, currentMiles: 40, longestRun: 9, runDays: ["MON", "TUE", "WED", "THU", "FRI", "SUN"], longRunDay: "SUN", timeTrial: "MILE", tuneUps: ["2027-02-07"] },
    k5beg: { label: "5K beginner: 12 miles a week, 3 days, goal 30:00, 10 weeks", raceType: "5K", startDate: "2027-01-18", raceDate: "2027-03-27", goalTime: "30:00", currentMiles: 12, longestRun: 4, runDays: ["TUE", "THU", "SUN"], longRunDay: "SUN" },
    k10elite: { label: "10K elite: 68 miles a week, 7 days, recent 15:40 5K, 16 weeks", raceType: "10K", startDate: "2026-12-07", raceDate: "2027-03-27", recentRace: { meters: 5000, seconds: 940 }, currentMiles: 68, longestRun: 12, runDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], longRunDay: "SUN" },
    experienced: { label: "Experienced: 50 miles a week, 6 days, recent 1:25 half, goal 3:05, 20 weeks", startDate: "2026-11-09", raceDate: "2027-03-28", goalTime: "3:05:00", recentRace: { meters: 21097.5, seconds: 5100 }, currentMiles: 50, longestRun: 14, runDays: ["MON", "TUE", "WED", "THU", "SAT", "SUN"], longRunDay: "SUN" }
};

export function planText(input) {
    const plan = generateMarathonPlan(input);
    if (plan.problems.length) return plan.problems.join("\n");
    const s = plan.summary, out = [];
    out.push(`${s.weeks} weeks · ${s.tier} ramp · ${s.keySessions === "BOTH" ? "speed and long-run workout every week" : "one key session a week"}`);
    out.push(`Miles: ${s.startMiles} to ${s.peakMiles} a week · longest run ${s.longestRun} mi (cap ${s.longCap})`);
    if (plan.paces) out.push(`Paces per mile: easy ${plan.paces.easy} · race ${plan.paces.marathon} · threshold ${plan.paces.threshold} · 800s ${plan.paces["800s"]}` + (s.predicted ? ` · recent race points to ${s.predicted}` : ""));
    out.push(`800s test days: ${plan.benchmarks.join(", ") || "none"}`);
    for (const w of plan.warnings) out.push(`Worth a look: ${w}`);
    let block = null;
    for (const w of plan.weeks) {
        if (w.block !== block) { block = w.block; out.push("", `== ${w.stimulus.toUpperCase()} ==`); }
        out.push(`Week ${w.index} (${w.startDate}) · ${w.miles} mi${w.down ? " · DOWN WEEK" : w.kind === "taper" ? " · taper" : w.kind === "race" ? " · race week" : w.kind === "peak" ? " · peak" : ""}`);
        for (const d of w.days) {
            if (d.type === "rest") continue;
            const detail = d.workout ? ` [${workoutSummary(d.workout)}]` : "";
            out.push(`   ${d.day} ${String(d.miles).padStart(4)} mi  ${d.session}${detail}`);
        }
    }
    return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const which = process.argv[2] || "normal";
    console.log(SAMPLES[which].label + "\n" + planText(SAMPLES[which]));
}
