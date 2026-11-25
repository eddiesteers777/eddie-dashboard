// The side menu (step 5 of the premium look, 2026-11-25): components/header.html, js/sideMenu.js, css/skin.css part 4.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const header = read("components/header.html");
const skin = read("css/skin.css");
const part4 = skin.slice(skin.indexOf("/* Part 4: the side menu"));

test("every section in the menu has an icon tile, a name and a one-line hint", () => {
    const nav = header.slice(header.indexOf('<nav class="navbar eos-navbar"'), header.indexOf("</nav>"));
    const rows = nav.match(/class="(eos-nav-item|eos-dropdown-trigger)"[\s\S]*?(<\/a>|<\/summary>)/g);
    assert.ok(rows.length >= 8);
    for (const row of rows) {
        assert.match(row, /class="sb-side-ic"/);
        assert.match(row, /<span class="sb-side-txt"><span>[^<]+<\/span><small class="sb-side-hint">[^<]+<\/small><\/span>/);
    }
});

test("the phone's Menu button opens the side menu, which has its fold and close buttons", () => {
    assert.match(header, /<nav class="navbar eos-navbar" id="sbSideNav" aria-label="Main menu">/);
    assert.match(header, /class="eos-mobile-icon-btn sb-menu-btn"\s+aria-label="Menu"\s+aria-controls="sbSideNav"\s+aria-expanded="false"/);
    assert.match(header, /class="sb-side-fold"/);
    assert.match(header, /class="sb-side-close"/);
    assert.match(read("js/icons.js"), /\n    menu: `/);
});

test("the header loads the side menu script, and the computer's Search opens the search", () => {
    const lh = read("js/loadHeader.js");
    assert.match(lh, /import\("\.\/sideMenu\.js"\)\.then\(m => m\.wireSideMenu\(\)\)/);
    assert.match(lh, /querySelector\("\.eos-navbar \.search-btn"\)\?\.addEventListener\("click", openSearch\)/);
    const js = read("js/sideMenu.js");
    assert.match(js, /export function wireSideMenu\(/);
    assert.match(js, /"southbound-side-min"/);
});

test("the side menu is drawn in colour tokens only, so it follows the colourway", () => {
    assert.ok(part4.length > 1000);
    assert.equal(part4.match(/#[0-9a-fA-F]{3,6}\b/g), null);
    assert.match(part4, /html\.al-on\.sb-side-min:not\(\.sb-guest\) body\{padding-left:var\(--sb-side-min\)\}/);
    assert.match(part4, /html\.al-on\.sb-drawer:not\(\.sb-guest\) body \.eos-navbar\{transform:none;visibility:visible/);
});
