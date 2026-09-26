// Unit tests for the coach's own marathon plan as COROS workouts (js/marathonCoros.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { planDayFromMarathon, marathonCourse, marathonTitle, marathonPreview } from "../js/marathonCoros.js";

const PACES = [
    ["Recovery", "8:45–9:30 /mi"], ["Easy", "8:15–9:00 /mi"], ["Long Run", "7:50–8:40 /mi"],
    ["Marathon Pace", "6:58–7:05 /mi"], ["Steady", "7:20–7:40 /mi"], ["Threshold", "6:35–6:50 /mi"],
    ["Cruise Intervals", "6:30–6:45 /mi"], ["10K Pace", "6:15–6:25 /mi"], ["5K / VO₂max", "6:00–6:10 /mi"],
    ["Hill Repeats / Fartlek", "Run by effort"]
];
const day = (session, miles, pace, race = false) => ({ session, miles, pace, race });
const miles = c => c.sections.reduce((t, s) => t + (s.intervalGroup ? s.repeats * s.sets.reduce((a, x) => a + (x.targetType === 1 ? x.targetValue : 0), 0) : s.targetType === 1 ? s.targetValue : 0), 0) / 1609.344;

test("mile repeats: warm-up, 6 x 1 mi at threshold pace with 90s jog, cool-down", () => {
    const c = marathonCourse(day("Mile repeats: 6x1mi @ Threshold", 8, "Threshold"), PACES);
    assert.equal(c.courseName, "Mile repeats · 8 mi");
    assert.equal(c.sections.length, 3);
    const [warm, group, cool] = c.sections;
    assert.equal(warm.sectionType, 1);
    assert.deepEqual(group, { intervalGroup: true, repeats: 6, sets: [
        { sectionType: 2, targetType: 1, targetValue: 1609, intensityType: 2, intensityValueStart: 245, intensityValueEnd: 255 },
        { sectionType: 3, targetType: 2, targetValue: 90, intensityType: 1, sectionIntensity: 1 }
    ] });
    assert.equal(cool.sectionType, 4);
    assert.match(c.courseDescription, /^Mile repeats: 6x1mi @ Threshold\n\n/);
    assert.match(c.courseDescription, /your plan's paces/);
    assert.match(c.courseDescription, /Southbound Coaching · marathon plan$/);
});

test("a marathon-pace block inside a long run, at the plan's MP range", () => {
    const c = marathonCourse(day("19mi w/ 7-8mi continuous Marathon Pace, full fueling rehearsal", 19, "MP"), PACES);
    assert.equal(c.courseName, "Long run · 19 mi");
    assert.deepEqual(c.sections.map(s => [s.sectionType, Math.round(s.targetValue / 160.9344) / 10]), [[1, 10], [2, 7], [4, 2]]);
    assert.deepEqual([c.sections[1].intensityValueStart, c.sections[1].intensityValueEnd], [260, 264]);
    assert.equal(c.sections[0].intensityType, 1, "easy miles by heart rate");
    const peak = marathonCourse(day("PEAK: 20-mile long run w/ 10-12mi continuous Marathon Pace", 20, "MP"), PACES);
    assert.equal(peak.courseName, "20-mile long run · 20 mi");
    assert.equal(Math.round(miles(peak)), 20);
});

test("time reps, seconds reps, recoveries as written", () => {
    const cruise = marathonCourse(day("Cruise intervals: 5x6min @ threshold, 2min jog", 7, "Cruise"), PACES).sections[1];
    assert.equal(cruise.repeats, 5);
    assert.deepEqual([cruise.sets[0].targetType, cruise.sets[0].targetValue, cruise.sets[1].targetValue], [2, 360, 120]);
    const hills = marathonCourse(day("Hill repeats: 8x45s @ strong effort", 5, "Hill effort"), PACES).sections[1];
    assert.deepEqual([hills.repeats, hills.sets[0].targetValue, hills.sets[0].intensityType, hills.sets[0].sectionIntensity], [8, 45, 2, 5]);
    const fartlek = marathonCourse(day("Fartlek: 8x1min surge / 1min float", 6, "Fartlek"), PACES).sections[1];
    assert.equal(fartlek.sets[1].targetValue, 60);
    const k = planDayFromMarathon(day("1K repeats: 6x1K @ 10K pace", 8, "10K pace"), PACES).workout.sets[0];
    assert.deepEqual([k.amount, k.unit, k.pace], [1, "km", "6:15-6:25"]);
});

test("finishes, races, and a fueling test that isn't a race", () => {
    const fin = planDayFromMarathon(day("Long run, last 2mi @ Steady", 11, "Steady"), PACES).workout;
    assert.deepEqual([fin.warmup, fin.sets[0].amount, fin.sets[0].effort, fin.sets[1].amount, fin.sets[1].pace, fin.cooldown], [null, 9, "easy", 2, "7:20-7:40", null]);
    const tenK = marathonCourse(day("RACE: 10K Tune-Up (Sun Sep 13) + warm-up/cooldown", 8, "Race"), PACES);
    assert.equal(tenK.courseName, "10K Tune-Up · 8 mi");
    assert.equal(Math.round(tenK.sections[1].targetValue), 9978);
    const raceDay = marathonCourse(day("RACE DAY: Indianapolis Monumental Marathon - Goal 3:05:00", 26.2, "Race", true), PACES);
    assert.equal(raceDay.courseName, "Indianapolis Monumental Marathon · 26.2 mi");
    assert.equal(raceDay.sections.length, 1);
    const fuel = marathonCourse(day("6mi @ Marathon Pace, full race-day fueling test", 10, "MP"), PACES);
    assert.equal(Math.round(miles(fuel)), 10, "not read as a race");
    assert.equal(Math.round(fuel.sections[1].targetValue / 1609.344), 6);
});

test("easy days are one heart-rate section; rest days send nothing", () => {
    const e = marathonCourse(day("Easy aerobic", 5, "Easy"), PACES);
    assert.deepEqual(e.sections, [{ sectionType: 2, targetType: 1, targetValue: 8047, intensityType: 1, sectionIntensity: 2 }]);
    assert.equal(marathonCourse(day("Recovery jog", 3, "Recovery"), PACES).sections[0].sectionIntensity, 1);
    assert.equal(marathonCourse(day("Rest", 0, ""), PACES), null);
    assert.equal(marathonTitle("Long run - comfortable, finish strong"), "Long run");
    assert.equal(marathonTitle("6mi, last 2mi @ Steady", 6), "Run");
});

// Custom workouts written on the Marathon page: what the watch gets.
const preview = (session, miles, pace = "Threshold") => marathonPreview(day(session, miles, pace), PACES);

test("custom: exact paces, rep times, reps without units, distance recoveries", () => {
    assert.deepEqual(preview("8x800 @ 2:55, 400m jog", 7).steps, ["0.5 mi warm-up", "8 × 800 m @ 5:52/mi with 400 m jog", "0.5 mi cool-down"]);
    assert.deepEqual(preview("4 easy + 2 @ 6:45", 6).steps, ["4 mi easy (heart-rate zone 2)", "2 mi @ 6:45/mi"]);
    assert.deepEqual(preview("5x1mi @ 6:30, 2min rest", 8).steps, ["1 mi warm-up", "5 × 1 mi @ 6:30/mi with 2 min rest", "1 mi cool-down"]);
    assert.deepEqual(preview("12x400 @ 85s, 200m jog", 7).steps[1], "12 × 400 m @ 5:42/mi with 200 m jog");
    assert.deepEqual(preview("6x1K @ 3:45/km, 2min jog", 8).steps[1], "6 × 1 km @ 6:02/mi with 2 min jog");
    assert.deepEqual(preview("1.5 WU, 20min @ tempo, 1.5 CD", 6).steps, ["1.5 mi warm-up", "20 min @ 6:35–6:50/mi", "1.5 mi cool-down"]);
    assert.deepEqual(preview("10mi w/ last 3 @ MP", 10, "MP").steps, ["7 mi easy (heart-rate zone 2)", "3 mi @ 6:58–7:05/mi"]);
    assert.deepEqual(preview("6 easy + 6x20s strides", 6.5, "Easy").steps[1], "6 × 0:20 @ strides (pace zone 6) with 1 min jog");
    // The watch gets the same: 800 m reps at 5:52/mi = 219 s/km.
    const c = marathonCourse(day("8x800 @ 2:55, 400m jog", 7, "VO2max"), PACES);
    assert.deepEqual(c.sections[1].sets, [
        { sectionType: 2, targetType: 1, targetValue: 800, intensityType: 2, intensityValueStart: 219, intensityValueEnd: 219 },
        { sectionType: 3, targetType: 1, targetValue: 400, intensityType: 1, sectionIntensity: 1 }
    ]);
});

test("custom: mixed repeats go to COROS as one interval group", () => {
    const text = "2 mi warm up, 4x(1mi @ MP, 1mi @ threshold), 2 mi cool down";
    assert.deepEqual(preview(text, 12, "MP").steps, ["2 mi warm-up", "4 × (1 mi @ 6:58–7:05/mi, 1 mi @ 6:35–6:50/mi)", "2 mi cool-down"]);
    const g = marathonCourse(day(text, 12, "MP"), PACES).sections[1];
    assert.equal(g.repeats, 4);
    assert.deepEqual(g.sets.map(s => [s.sectionType, s.targetValue, s.intensityValueStart]), [[2, 1609, 260], [2, 1609, 245]]);
    assert.match(marathonCourse(day(text, 12, "MP"), PACES).courseDescription, /4 × \(1 mi @ 6:58–7:05\/mi, 1 mi @ 6:35–6:50\/mi\)/);
});

test("custom: says what it couldn't read and when the parts don't add up", () => {
    const p = preview("2mi WU, 3x2mi @ 6:40-6:50 w/ 3min jog, 2mi CD", 10);
    assert.deepEqual(p.notes, ["These parts add up to about 11 mi; the day says 10 mi."]);
    const q = preview("3mi easy, 4x(fast-ish bits), 2mi @ MP", 8);
    assert.deepEqual(q.unread, ["4x(fast-ish bits)"]);
    assert.equal(preview("Rest", 0, ""), null);
});
