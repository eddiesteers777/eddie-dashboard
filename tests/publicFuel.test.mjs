import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RUN_TYPES, DEFAULTS, parseMinutes, readFuelForm, planFromForm, fuelPlanHtml } from "../js/publicFuelModel.js";
import { fuelForRun } from "../js/workoutFuel.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const form = extra => ({ type: "long", distance: "12", time: "", weight: "", weightUnit: "lb", temperature: "", humidity: "", tolerance: "", stomach: "", sweat: "", caffeine: false, unit: "oz", ...extra });

test("times read as minutes or hours:minutes", () => {
    assert.equal(parseMinutes("105"), 105);
    assert.equal(parseMinutes("1:45"), 105);
    assert.equal(parseMinutes("1:45:30"), 106);
    assert.equal(parseMinutes(""), null);
    for (const bad of ["abc", "1:75", "1:5", "-5", "1,45"]) assert.ok(Number.isNaN(parseMinutes(bad)), bad);
});

test("it needs a distance or a time, and says which is wrong", () => {
    assert.deepEqual(readFuelForm(form({ distance: "" })), { ok: false, error: "Tell me how far or how long the run is.", field: "distance" });
    assert.equal(readFuelForm(form({ distance: "0" })).field, "distance");
    assert.equal(readFuelForm(form({ distance: "400" })).field, "distance");
    assert.equal(readFuelForm(form({ distance: "abc" })).field, "distance");
    assert.equal(readFuelForm(form({ distance: "", time: "5" })).field, "time", "5 minutes is too short to plan");
    assert.equal(readFuelForm(form({ time: "later" })).field, "time");
    assert.equal(readFuelForm(form({ weight: "heavy" })).field, "weight");
    assert.equal(readFuelForm(form({ weight: "20" })).field, "weight");
    assert.equal(readFuelForm(form({ temperature: "500" })).field, "temperature");
    assert.equal(readFuelForm(form({ humidity: "150" })).field, "humidity");
    assert.equal(readFuelForm(form({ type: "swim" })).field, "type");
});

test("a distance alone is enough, and the guesses are said out loud", () => {
    const r = readFuelForm(form());
    assert.equal(r.ok, true);
    assert.equal(r.run.durationMin, undefined, "the time is left for the engine to estimate");
    assert.equal(r.profile.bodyWeight, DEFAULTS.weightLb);
    assert.equal(r.profile.temperature, DEFAULTS.temperature);
    const said = r.assumptions.join(" | ");
    assert.match(said, /No weight entered: using 165 lb/);
    assert.match(said, /No weather entered: using 75 °F and 55% humidity/);
    assert.match(said, /middle/);
    assert.match(said, /No time entered/);
});

test("what they type is used and not called an assumption", () => {
    const r = readFuelForm(form({ time: "1:45", weight: "72", weightUnit: "kg", temperature: "90", humidity: "70", tolerance: "low", stomach: "sensitive", sweat: "high", caffeine: true, unit: "ml" }));
    assert.equal(r.ok, true);
    assert.equal(r.run.durationMin, 105);
    assert.equal(Math.round(r.profile.bodyWeight), 159, "72 kg is about 159 lb");
    assert.equal(r.profile.temperature, 90);
    assert.equal(r.profile.tolerance, "low");
    assert.equal(r.profile.caffeineWanted, true);
    assert.equal(r.unit, "ml");
    assert.deepEqual(r.assumptions, [], "everything was answered");
    assert.equal(readFuelForm(form({ temperature: "90" })).assumptions.some(a => /No humidity entered: using 55% humidity/.test(a)), true, "only the missing half of the weather is assumed");
});

test("the plan is exactly the app's own fuel plan for the same run", () => {
    const r = readFuelForm(form({ time: "1:45", weight: "165", temperature: "75", humidity: "55", tolerance: "moderate", stomach: "normal", sweat: "moderate" }));
    const direct = fuelForRun(r.run, { profile: r.profile, library: [], unit: "oz" });
    const out = planFromForm(form({ time: "1:45", weight: "165", temperature: "75", humidity: "55", tolerance: "moderate", stomach: "normal", sweat: "moderate" }));
    assert.equal(out.ok, true);
    assert.equal(out.view.tiles[0].value, String(direct.targets.carbsPerHour));
    assert.equal(out.view.tiles[2].value, String(direct.targets.sodiumPerHour));
    assert.equal(out.view.gels.length, direct.gels.length);
    assert.deepEqual(out.view.gels.map(g => g.clock), direct.gels.map(g => g.clock));
});

test("longer runs carry more; a short easy run needs nothing", () => {
    const carbs = f => Number(planFromForm(form(f)).view.tiles[0].value);
    assert.ok(carbs({ time: "3:00" }) > carbs({ time: "1:15" }), "three hours asks for more than 75 minutes");
    const short = planFromForm(form({ type: "easy", distance: "3", time: "" }));
    assert.equal(short.view.none, true);
    assert.equal(short.view.tiles.length, 0);
    assert.equal(short.view.gels.length, 0);
    assert.match(fuelPlanHtml(short.view), /doesn't need fuel/);
});

test("gel times start at 0:30 and the mile is only shown when a distance was given", () => {
    const withMiles = planFromForm(form({ time: "2:00" })).view;
    assert.equal(withMiles.gels[0].clock, "0:30");
    assert.ok(withMiles.gels[0].mile > 0);
    const timeOnly = planFromForm(form({ distance: "", time: "2:00" })).view;
    assert.equal(timeOnly.gels[0].mile, null, "no distance, no mile markers");
    assert.ok(!/around mile/.test(fuelPlanHtml(timeOnly)));
});

test("millilitres switch the fluid line", () => {
    const view = planFromForm(form({ time: "2:00", unit: "ml" })).view;
    assert.match(view.tiles[1].unit, /ml/);
    assert.match(view.during.join(" "), /ml fluid an hour/);
});

test("the page text is escaped and says it isn't medical advice", () => {
    const html = fuelPlanHtml(planFromForm(form({ time: "2:00" })).view);
    assert.match(html, /not medical advice/);
    assert.match(html, /never for the first time on race day/);
    assert.ok(!/<script/i.test(html));
    const view = planFromForm(form({ time: "2:00" })).view;
    view.title = '<img src=x onerror=alert(1)>';
    assert.ok(!/<img/.test(fuelPlanHtml(view)), "titles are escaped");
});

test("every run type the form offers is one the model reads", () => {
    const html = read("fuel.html");
    const offered = [...html.match(/id="pfType"[\s\S]*?<\/select>/)[0].matchAll(/value="([^"]+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(offered, RUN_TYPES.map(t => t.value).sort());
});

test("the public page needs no account, stores nothing and sends nothing", () => {
    const html = read("fuel.html");
    assert.ok(!/loadHeader\.js|cloudSync|firestore/i.test(html), "no app header, sync or database");
    assert.match(html, /loadPublicHeader\.js/);
    for (const file of ["js/publicFuel.js", "js/publicFuelModel.js"]) {
        const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        assert.ok(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|sendBeacon|firebase|indexedDB/.test(src), `${file} stores and sends nothing`);
    }
    assert.match(html, /<title>Free Fueling Calculator \| Southbound Coaching<\/title>/);
    assert.match(read("home.html"), /href="fuel\.html"/, "Home links to it");
    assert.match(read("pace.html"), /href="fuel\.html"/, "and so does the pace calculator");
    assert.match(html, /href="apply\.html\?service=running"/);
});
