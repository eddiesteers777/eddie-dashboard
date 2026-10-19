import test from "node:test";
import assert from "node:assert/strict";
import { cleanConditions, conditionsText, CONDITIONS } from "../js/runConditions.js";

test("only known tags, no repeats, at most three, in list order", () => {
    assert.deepEqual(cleanConditions(["windy", "hot", "hot", "lava"]), ["hot", "windy"]);
    assert.deepEqual(cleanConditions(["snow", "rain", "windy", "cold", "hot"]), ["hot", "cold", "windy"]);
    assert.deepEqual(cleanConditions(undefined), []);
    assert.deepEqual(cleanConditions("hot"), []);
});

test("shown as plain words", () => {
    assert.equal(conditionsText(["humid", "hot"]), "Hot · Humid");
    assert.equal(conditionsText([]), "");
    assert.ok(CONDITIONS.every(c => c.label && c.key));
});
