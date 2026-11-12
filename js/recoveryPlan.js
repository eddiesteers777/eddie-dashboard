/* ==========================================
   Southbound — the post-race recovery plan (pure, unit-tested)

   Eddie's rules (2026-11-12), four weeks:
     week 1   walking and easy cross-training (bike or swim). No running.
     week 2-4 easy runs only, the same miles every week (it does not build).
     strength comes back in week 2, very light, and builds slowly:
              wk 2: one session, one set  ·  wk 3: one session, two sets
              wk 4: two sessions, two sets
   The numbers a person may change: start date, easy miles per run, runs a
   week (2 to 4) and a race name for the label. Everything else is the rule.

   recoveryPlan(settings) -> { plan, name, kind, problems }
   `plan` has the coach-plan shape (weeks, days) plus generator.settings with
   engine "recovery", so the plan screen can tell it from a race plan.
========================================== */

export const RECOVERY_WEEKS = 4;
const CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const RUN_DAYS = { 2: ["TUE", "SAT"], 3: ["TUE", "THU", "SAT"], 4: ["TUE", "THU", "SAT", "SUN"] };
const PHASES = ["Rest and walk", "Easy return", "Easy, steady", "Easy, steady"];

const D = iso => new Date(`${iso}T12:00:00`);
const iso = t => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const t = D(s); t.setDate(t.getDate() + n); return iso(t); };
export const mondayOf = s => { const t = D(s); return addDays(s, -((t.getDay() + 6) % 7)); };

const EXERCISES = [["Goblet Squat", "8", 60], ["Dumbbell Romanian Deadlift", "8", 60], ["Band Hip Raise", "12", 30], ["Dead Bug", "8", 30]];
function strengthDay(sets) {
    return {
        title: "Recovery Strength, Light", minutes: 20, goal: "Recovery", notes: "Very light. Stop well short of tired.",
        exercises: EXERCISES.map(([name, reps, restSec]) => ({ name, sets, reps, weight: null, rpe: null, rir: null, restSec, superset: false, note: "", video: "" }))
    };
}

// Strength sessions in a week: [day code, sets].
const STRENGTH = { 2: [["MON", 1]], 3: [["MON", 2]], 4: [["MON", 2], ["FRI", 2]] };

const WALK = "Walk 20 to 30 minutes, easy";
const CROSS = "Easy bike or swim, 30 minutes";
const WEEK1 = { MON: WALK, TUE: CROSS, WED: WALK, THU: CROSS, FRI: "", SAT: "Walk or easy bike, 30 to 40 minutes", SUN: "" };

export function cleanSettings(raw = {}) {
    const runsPerWeek = [2, 3, 4].includes(Number(raw.runsPerWeek)) ? Number(raw.runsPerWeek) : 3;
    const easyMiles = Math.min(8, Math.max(1, Math.round((Number(raw.easyMiles) || 3) * 2) / 2));
    return {
        engine: "recovery",
        startDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate || "") ? mondayOf(raw.startDate) : "",
        raceName: String(raw.raceName || "").slice(0, 60).trim(),
        easyMiles, runsPerWeek
    };
}

export function recoveryPlan(raw = {}) {
    const st = cleanSettings(raw);
    if (!st.startDate) return { problems: ["Pick a start date."], plan: null };
    const runDays = RUN_DAYS[st.runsPerWeek];
    const weeks = [];
    for (let w = 1; w <= RECOVERY_WEEKS; w++) {
        const startDate = addDays(st.startDate, (w - 1) * 7);
        const strength = new Map(w === 1 ? [] : STRENGTH[w]);
        const days = CODES.map((code, i) => {
            const date = addDays(startDate, i);
            if (w === 1) {
                const text = WEEK1[code];
                return text ? { date, day: code, type: "cross", miles: 0, session: text } : { date, day: code, type: "rest", miles: 0, session: "" };
            }
            if (runDays.includes(code)) return { date, day: code, type: "easy", miles: st.easyMiles, session: `Easy run, ${st.easyMiles} mi` };
            if (strength.has(code)) return { date, day: code, type: "strength", miles: 0, session: "Recovery Strength, Light", strength: strengthDay(strength.get(code)) };
            if (code === "WED") return { date, day: code, type: "cross", miles: 0, session: CROSS };
            return { date, day: code, type: "rest", miles: 0, session: "" };
        });
        weeks.push({
            week: w, phase: PHASES[w - 1], startDate,
            plannedMiles: days.reduce((t, d) => t + d.miles, 0), days, supplemental: []
        });
    }
    const name = st.raceName ? `Recovery after ${st.raceName}` : "Post Marathon Recovery";
    return {
        problems: [], name, kind: "race",
        plan: { weeks, trainingStartDate: st.startDate, generator: { settings: st } }
    };
}
