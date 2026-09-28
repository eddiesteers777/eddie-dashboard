// Unit tests for the Southbound habit icons (js/habitIconSet.js).
// Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    HABIT_ICONS, HABIT_ICON_CATEGORIES, suggestIcons, habitIconId, habitIconSrc, storedIcon, searchIcons, habitIconById
} from "../js/habitIconSet.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("every icon has a drawing, a label and a known category, and no drawing is left over", () => {
    const ids = HABIT_ICONS.map(i => i.id);
    assert.equal(new Set(ids).size, ids.length, "IDs are unique");
    assert.ok(ids.length >= 40);
    for (const i of HABIT_ICONS) {
        assert.match(i.id, /^[a-z]+$/);
        assert.ok(i.label, i.id);
        assert.ok(HABIT_ICON_CATEGORIES.includes(i.category), i.id);
        const file = join(root, "habit-icons", `${i.id}.svg`);
        assert.ok(existsSync(file), `${i.id}.svg exists`);
        const svg = readFileSync(file, "utf8");
        assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 64 64"/);
        // Two identical attributes on one element make the whole file fail to draw.
        for (const tag of svg.match(/<[a-zA-Z][^>]*>/g)) {
            const names = [...tag.matchAll(/\s([a-z-]+)=/g)].map(m => m[1]);
            assert.equal(new Set(names).size, names.length, `${i.id}: repeated attribute in ${tag.slice(0, 60)}`);
        }
        assert.doesNotMatch(svg, /id="(?!hb-)/, `${i.id}: clip ids are prefixed`);
    }
    const files = readdirSync(join(root, "habit-icons")).filter(f => f.endsWith(".svg")).map(f => f.replace(".svg", ""));
    assert.deepEqual(files.sort(), [...ids].sort());
});

test("Eddie's own habits and the client starter list get the right icon", () => {
    const cases = {
        "Prayer": "pray", "Bible": "bible", "Training Complete": "run", "Strength": "strength",
        "Stretch / Mobility": "stretch", "Protein Goal": "protein", "Water Goal": "water",
        "Sleep 7+ hrs": "sleep", "Read 10 Pages": "read", "Time with Wife": "love",
        "Move your body": "workout", "Drink water": "water", "Sleep 7+ hours": "sleep",
        "Eat a vegetable": "veggies", "Stretch 10 minutes": "stretch"
    };
    for (const [name, id] of Object.entries(cases)) assert.equal(suggestIcons(name)[0], id, name);
});

test("suggestions read what people type", () => {
    const cases = {
        "Drink 100oz": "water", "Read the Bible": "bible", "No phone after 9pm": "screens",
        "10k steps": "steps", "10,000 steps": "steps", "Juggle 100 touches": "ball", "Cold shower": "cold",
        "No soda": "nosugar", "No alcohol": "noalcohol", "Morning walk": "steps", "Call mom": "family",
        "Floss": "teeth", "Take creatine": "vitamins", "Spanish lesson": "study", "Run 3 miles": "run",
        "Meditating": "meditate", "Swimming": "swim", "Stay hydrated": "water", "Lifting": "strength",
        "Journaling": "journal", "Eat 5 servings of vegetables": "veggies", "Budget check": "money",
        "Sauna 20 min": "sauna", "Date night": "love", "Meal prep Sunday": "mealprep", "Plank 2 min": "core",
        "Coffee before 10": "coffee", "Weigh in": "weigh", "Clean the kitchen": "tidy", "Get outside": "nature",
        "Morning sunlight": "sun", "Box breathing": "breathe", "Practice guitar": "music", "Walk": "steps",
        "Bike ride": "bike", "16:8 fast": "fasting", "Gratitude list": "gratitude"
    };
    for (const [name, id] of Object.entries(cases)) assert.equal(suggestIcons(name)[0], id, name);
});

test("no suggestion for words it doesn't know, and no false hits inside words", () => {
    assert.deepEqual(suggestIcons("gibberish xyz"), []);
    assert.deepEqual(suggestIcons(""), []);
    assert.ok(!suggestIcons("Workout").includes("work"), "work is not inside workout");
    assert.ok(!suggestIcons("Ready for the day").includes("read"), "ready is not read");
    assert.ok(!suggestIcons("Sunday reset").includes("sun"), "Sunday is not the sun");
    assert.ok(suggestIcons("Protein Goal", 4).includes("goal"), "weak words still show further down");
    assert.ok(suggestIcons("anything", 2).length <= 2);
});

test("a habit's icon: picked, else from its name, else from its old line icon, else a star", () => {
    assert.equal(habitIconId({ name: "Water Goal", icon: "hb:coffee" }), "coffee", "a pick wins over the name");
    assert.equal(habitIconId({ name: "Water Goal", icon: "droplet" }), "water");
    assert.equal(habitIconId({ name: "Bible", icon: "bookOpen" }), "bible", "the name beats the old line icon");
    assert.equal(habitIconId({ name: "Zzz thing", icon: "dumbbell" }), "strength");
    assert.equal(habitIconId({ name: "Something", icon: "hb:gone" }), "star", "an unknown pick falls back");
    assert.equal(habitIconId({ name: "Something" }), "star");
    assert.equal(habitIconId(null), "star");
    assert.equal(storedIcon("water"), "hb:water");
    assert.equal(storedIcon("nope"), "hb:star");
    assert.equal(habitIconSrc("water"), "habit-icons/water.svg");
    assert.equal(habitIconSrc("nope"), "habit-icons/star.svg");
    assert.equal(habitIconById("sleep").label, "Sleep");
});

test("picker search finds by label, category and keyword", () => {
    assert.equal(searchIcons("").length, HABIT_ICONS.length);
    assert.ok(searchIcons("sle").includes("sleep"));
    assert.ok(searchIcons("pet").includes("dog"));
    assert.ok(searchIcons("yoga").includes("stretch"));
    assert.deepEqual(new Set(searchIcons("recovery")), new Set(HABIT_ICONS.filter(i => i.category === "Recovery").map(i => i.id)));
    assert.deepEqual(searchIcons("qqqq"), []);
});
