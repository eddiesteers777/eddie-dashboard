// Unit tests for the Southbound reaction emojis (js/emoji.js).
// Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    EMOJI, EMOJI_CATEGORIES, QUICK_REACTIONS, emojiById, emojiImg, hasEmoji, onlyEmoji,
    renderEmojiText, emojiPlainText, insertToken
} from "../js/emoji.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the set: 24 emojis, each drawn, each in a known category", () => {
    assert.equal(EMOJI.length, 24);
    assert.equal(new Set(EMOJI.map(e => e.id)).size, 24, "IDs are unique");
    const cats = new Set(EMOJI_CATEGORIES.map(c => c.key));
    for (const e of EMOJI) {
        assert.match(e.id, /^sb_[a-z_]+$/);
        assert.ok(cats.has(e.category), `${e.id} category`);
        const file = join(root, "emoji", `${e.id}.svg`);
        assert.ok(existsSync(file), `emoji/${e.id}.svg is missing (run node scripts/build-emoji.mjs)`);
        const svg = readFileSync(file, "utf8");
        assert.match(svg, /viewBox="0 0 64 64"/);
        assert.ok(!/<script|href="http/i.test(svg), `${e.id} is a plain drawing`);
    }
    for (const id of QUICK_REACTIONS) assert.ok(emojiById(id), id);
});

test("tokens become drawings; the words stay", () => {
    const html = renderEmojiText("Tempo was sharp :sb_big_effort: see you Sunday");
    assert.match(html, /^Tempo was sharp <img class="sb-emoji" src="emoji\/sb_big_effort.svg" alt="Big Effort"/);
    assert.match(html, /see you Sunday$/);
    assert.equal(renderEmojiText("no tokens here"), "no tokens here");
    assert.equal(renderEmojiText(":sb_nope: stays"), ":sb_nope: stays", "unknown tokens stay as typed");
    // A message that's only reactions shows them big.
    assert.ok(onlyEmoji(" :sb_great_work: :sb_high_five: "));
    assert.ok(!onlyEmoji("Nice :sb_great_work:"));
    assert.match(renderEmojiText(":sb_great_work:"), /class="sb-emoji is-big".*width="40"/);
    assert.ok(hasEmoji("a :sb_pr: b") && !hasEmoji("a :sb_zzz: b") && !hasEmoji(null));
    assert.equal(emojiImg("sb_nope"), "");
});

test("emails get the label, not a token", () => {
    assert.equal(emojiPlainText("New PR :sb_pr: :sb_nope:"), "New PR [PR] :sb_nope:");
    assert.equal(emojiPlainText(undefined), "");
});

test("inserting at the cursor keeps the spacing tidy", () => {
    assert.deepEqual(insertToken("", "sb_pr"), { text: ":sb_pr: ", cursor: 8 });
    assert.deepEqual(insertToken("Nice", "sb_pr"), { text: "Nice :sb_pr: ", cursor: 13 });
    assert.deepEqual(insertToken("Nice work", "sb_pr", 4), { text: "Nice :sb_pr: work", cursor: 12 });
    assert.deepEqual(insertToken("Nice work", "sb_pr", 5, 9), { text: "Nice :sb_pr: ", cursor: 13 });
});
