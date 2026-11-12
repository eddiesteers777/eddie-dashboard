import test from "node:test";
import assert from "node:assert/strict";
import { lineShape, lineSvg } from "../js/greetingTrail.js";

test("four lines, one per logo colour, each ending on the same point", () => {
    const s = lineShape({ w: 350, fs: 44 });
    assert.equal(s.paths.length, 4);
    assert.equal(new Set(s.paths.map(p => p.d.split(" ").slice(-2).join(" "))).size, 1, "all four merge onto one line");
    assert.deepEqual(s.paths.map(p => p.color), ["#C7D6E4", "#8FC3EE", "#8FD0B2", "#D2AD62"]);
});

test("the dot sits on the merged line, inside the box, and the words' path starts above the top line", () => {
    const s = lineShape({ w: 350, fs: 44 });
    assert.ok(s.dot.cx + s.dot.r <= s.w && s.dot.cy + s.dot.r <= s.h);
    const topY = +s.paths[0].d.match(/^M\S+ (\S+)/)[1], textY = +s.textPath.match(/^M\S+ (\S+)/)[1];
    assert.ok(textY < topY, "the words ride above the line, not on it");
});

test("wider box, same shape stretched; the svg holds four lines, the dot, a mask and the escaped words", () => {
    const narrow = lineShape({ w: 300, fs: 40 }), wide = lineShape({ w: 560, fs: 40 });
    assert.equal(narrow.paths[0].d.split(" ")[1], wide.paths[0].d.split(" ")[1], "same start");
    const html = lineSvg(wide, "GOOD <B> & EDDIE", 40);
    assert.equal((html.match(/class="gr-line-path"/g) || []).length, 4);
    assert.match(html, /<circle /);
    assert.match(html, /<mask /);
    assert.match(html, /GOOD &lt;B&gt; &amp; EDDIE/);
});
