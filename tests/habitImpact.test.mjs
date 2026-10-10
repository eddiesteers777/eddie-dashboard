import { test } from "node:test";
import assert from "node:assert/strict";
import { nightsFrom, habitEffects, monthRecap, waterOn, changeText, nightsToGo, tCrit90, addDays, prevMonth } from "../js/habitImpact.js";

// 120 nights. Mouth tape on every 3rd night lifts HRV by 6 ms; alcohol every 5th
// drops HRV 10 ms and adds 4 bpm; nose strip every 4th does nothing. A slow
// upward drift in HRV (a training block) shouldn't count for any habit.
function world({ days = 120, to = "2026-10-10" } = {}) {
    const from = addDays(to, -(days - 1));
    const checkins = {}, health = {}, fitness = {}, readiness = {}, nutrition = {};
    let i = 0;
    for (let d = from; d <= to; d = addDays(d, 1), i++) {
        const noise = ((i * 7919) % 11) - 5;         // deterministic wobble ±5
        const tags = [];
        if (i % 3 === 0) tags.push("mouth-tape");
        if (i % 5 === 0) tags.push("alcohol");
        if (i % 4 === 0) tags.push("nose-strip");
        const hrv = 70 + i * 0.05 + noise + (tags.includes("mouth-tape") ? 6 : 0) - (tags.includes("alcohol") ? 10 : 0);
        const rhr = 48 + (tags.includes("alcohol") ? 4 : 0) + (noise > 3 ? 1 : 0);
        health[d] = { hrv: { avg: hrv }, rhr, sleep: { asleepMin: 420 + noise * 3, score: 80 + noise } };
        readiness[d] = { score: 70, bodyScore: 70 + (hrv - 70) };
        fitness[d] = { recovery: { percent: 80 + noise } };
        checkins[d] = { energy: 3, tags, waterOz: i % 2 ? 120 : 60 };
        nutrition[addDays(d, -1)] = { water: 999 };   // the check-in's answer wins
    }
    return { from, to, checkins, health, fitness, readiness, nutrition };
}

test("each habit vs its own baseline: real effects found, null ones not", () => {
    const w = world();
    const rows = nightsFrom(w);
    const eff = habitEffects(rows, { to: w.to });
    const get = (id, key) => eff.find(e => e.id === id).results.find(r => r.key === key);
    assert.equal(get("mouth-tape", "hrv").verdict, "better");
    assert.ok(Math.abs(get("mouth-tape", "hrv").diff - 6) < 2.5, String(get("mouth-tape", "hrv").diff));
    assert.equal(get("alcohol", "hrv").verdict, "worse");
    assert.equal(get("alcohol", "rhr").verdict, "worse", "a higher resting HR is worse");
    assert.notEqual(get("nose-strip", "hrv").verdict, "better");
    assert.ok(get("mouth-tape", "hrv").lo > 0 && get("alcohol", "hrv").hi < 0);
    assert.equal(eff[0].linked.length > 0, true, "clear links sort first");
});

test("fewer than 5 with / without: says how many more", () => {
    const w = world({ days: 40 });
    for (const d of Object.keys(w.checkins)) w.checkins[d].tags = [];
    const t = Object.keys(w.checkins).sort().slice(-3);
    for (const d of t) w.checkins[d].tags = ["sauna"];
    const eff = habitEffects(nightsFrom(w), { to: w.to });
    const sauna = eff.find(e => e.id === "sauna");
    assert.equal(sauna.results.find(r => r.key === "hrv").verdict, "few");
    assert.equal(nightsToGo(sauna), 2);
    assert.equal(sauna.nights, 3);
});

test("water: the check-in's answer, else the Nutrition log; higher-water days compared", () => {
    assert.equal(waterOn("2026-10-09", { "2026-10-10": { waterOz: 96 } }, { "2026-10-09": { water: 40 } }), 96);
    assert.equal(waterOn("2026-10-09", {}, { "2026-10-09": { water: 40 } }), 40);
    assert.equal(waterOn("2026-10-09", {}, { "2026-10-09": { water: 0 } }), null);
    const w = world();
    const water = habitEffects(nightsFrom(w), { to: w.to }).find(e => e.id === "water");
    assert.ok(water && /^\d+\+ oz of water$/.test(water.label), water?.label);
    assert.ok(water.total >= 80);
});

test("habits that share their nights say so", () => {
    const w = world();
    for (const [d, c] of Object.entries(w.checkins)) if (c.tags.includes("alcohol")) c.tags.push("late-meal");
    const eff = habitEffects(nightsFrom(w), { to: w.to });
    assert.equal(eff.find(e => e.id === "late-meal").overlap?.id, "alcohol");
});

test("monthly recap: averages vs last month, habit nights, water, best day", () => {
    const w = world();
    const r = monthRecap({ ...w, month: "2026-09", today: w.to });
    assert.equal(r.days, 30);
    assert.equal(r.checkins, 30);
    const hrv = r.averages.find(a => a.key === "hrv");
    assert.ok(hrv.avg > 60 && hrv.prev > 60 && hrv.change != null);
    assert.equal(r.habits.find(h => h.id === "mouth-tape").nights, 10);
    assert.equal(Math.round(r.water.avg), 90);
    assert.ok(r.best.values.readiness >= r.worst.values.readiness);
    const cur = monthRecap({ ...w, month: "2026-10", today: w.to });
    assert.equal(cur.to, "2026-10-10");
    assert.equal(cur.days, 10);
    assert.equal(prevMonth("2026-01"), "2025-12");
});

test("words and numbers", () => {
    assert.equal(changeText(12.4, "min"), "+12 min");
    assert.equal(changeText(-75, "min"), "−1h 15m");
    assert.equal(changeText(-3.24, "bpm"), "−3.2 bpm");
    assert.equal(changeText(4, "%"), "+4%");
    assert.equal(changeText(-0.2, "min"), "±0 min");
    assert.ok(Math.abs(tCrit90(4) - 2.132) < 0.06 && Math.abs(tCrit90(10) - 1.812) < 0.02 && Math.abs(tCrit90(30) - 1.697) < 0.01);
});

test("water split never puts every day on one side", () => {
    const w = world({ days: 60 });
    let i = 0;
    for (const d of Object.keys(w.checkins).sort()) w.checkins[d].waterOz = i++ % 3 ? 70 : 110;   // two-thirds at 70
    const water = habitEffects(nightsFrom(w), { to: w.to }).find(e => e.id === "water");
    assert.match(water.label, /^More than 70 oz/);
    assert.ok(water.nights > 0 && water.nights < water.total);
});
