import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the phone tab bar marks the current tab for screen readers", () => {
    const src = read("js/loadHeader.js");
    const tab = src.slice(src.indexOf('class="eos-bottomnav-item'), src.indexOf('class="eos-bottomnav-item') + 260);
    assert.match(tab, /aria-current="page"/, "the active bottom tab carries aria-current");
    assert.match(tab, /tab\.key === activeTab/, "and only the active one");
});

test("the public footer's page links have a real tap area", () => {
    const css = read("css/public.css");
    const rule = css.match(/\.pub-footer p a\{([^}]*)\}/);
    assert.ok(rule, "footer page links are styled as a menu, not bare inline text");
    assert.match(rule[1], /display:\s*inline-block/);
    const pad = rule[1].match(/padding:\s*(\d+)px/);
    const line = rule[1].match(/line-height:\s*(\d+)px/);
    assert.ok(pad && line && Number(pad[1]) * 2 + Number(line[1]) >= 24, "at least 24px tall (WCAG 2.2 target size)");
});
