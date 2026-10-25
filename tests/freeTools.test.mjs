// Free tools page (tools.html): one page for the pace calculator, the fueling calculator and the Playbook.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const tools = read("tools.html");

test("tools.html has a tab and a panel for each tool, one tool shows at a time, and each has its own link", () => {
    assert.match(tools, /role="tablist"/);
    for (const id of ["pace", "fueling", "playbook", "challenge"]) {
        assert.match(tools, new RegExp(`<a href="#${id}" id="tab-${id}" class="tl-tab" role="tab" aria-controls="tool-${id}" data-tool="${id}"`), id);
        assert.match(tools, new RegExp(`<section class="tl-sec" id="tool-${id}" role="tabpanel" aria-labelledby="tab-${id}"`), id);
        assert.match(tools, new RegExp(`data-photo="${id}"`), `${id} has a hero photo`);
    }
    // Only the first tool is open in the markup; the script opens the one in the link.
    assert.equal((tools.match(/class="tl-sec" id="tool-[a-z]+"[^>]* hidden>/g) || []).length, 3);
    assert.match(tools, /id="paceMount"/);
    assert.match(tools, /id="fuelMount"/);
    const js = read("js/tools.js");
    assert.match(js, /const TOOLS = \["pace", "fueling", "playbook", "challenge"\]/);
    assert.match(js, /if \(loaders\[name\] && !started\[name\]\)/, "a calculator loads the first time its tab opens");
    assert.match(js, /\$\("tool-" \+ t\)/, "sections are named tool-*, so the browser does not jump to a #pace link");
});

test("the calculators are loaded from their own pages, not copied, and those sources still have what the loader takes", () => {
    const js = read("js/tools.js");
    assert.match(js, /sourceDoc\("pace\.html"\)/);
    assert.match(js, /sourceDoc\("fueling\.html"\)/);
    assert.match(read("pace.html"), /id="pc-root"/);
    const fuel = read("fueling.html");
    assert.match(fuel, /<main class="fueling-page"/);
    for (const id of ["fuelStepBar", "fuelAnnounce", "fuelPlanSheet"]) assert.match(fuel, new RegExp(`id="${id}"`), id);
    assert.ok(existsSync(new URL("../js/hrZonesTool.js", import.meta.url)));
});

test("the page is public, sits in the sitemap, and wears the app navigation when signed in", () => {
    assert.match(tools, /<link rel="canonical" href="https:\/\/southboundcoaching\.com\/tools\.html">/);
    assert.match(read("sitemap.xml"), /southboundcoaching\.com\/tools\.html</);
    assert.match(tools, /classList\.add\("tl-app"\)/);
    assert.match(read("js/tools.js"), /loadHeader\.js/);
    assert.match(read("js/tools.js"), /sb-guest-fueling/, "a guest's fueling work is set aside at sign-in, as on the Fueling page");
});

test("every public page points its free-tool links at tools.html", () => {
    assert.match(read("components/publicHeader.html"), /<a href="tools\.html" class="pub-nav-link" data-page="tools\.html">Free tools<\/a>/);
    for (const f of readdirSync(new URL("..", import.meta.url)).filter(n => n.endsWith(".html"))) {
        const html = read(f);
        assert.ok(!/<a href="(pace|fueling|playbook)\.html">(Pace calculator|Fueling calculator|Soccer Playbook)<\/a>/.test(html), `${f} footer links to tools.html`);
    }
    assert.match(read("fuel.html"), /replace\("tools\.html#fueling"\)/);
});

test("signed in, every account reaches the three tools from More, the Tools menu and search", () => {
    const more = read("more.html");
    for (const id of ["pace", "fueling", "playbook"]) assert.match(more, new RegExp(`<a href="tools\\.html#${id}" class="more-row">`), id);
    assert.match(read("components/header.html"), /<a href="tools\.html" class="eos-dropdown-link">Free Tools<\/a>/);
    const lh = read("js/loadHeader.js");
    assert.match(lh, /label: "Free Tools", href: "tools\.html"[^}]*(?<!requires: ")\}/);
    assert.doesNotMatch(lh.match(/label: "Free Tools"[^\n]*/)[0], /requires:/, "no service is needed to open it");
    assert.match(lh, /"tools\.html": "more"/);
    assert.doesNotMatch(read("js/navAccess.js"), /"tools\.html"/, "tools.html is open to every signed-in account");
});

test("a signed-out visit to the Fueling page (no plan link) goes to the Free tools page", () => {
    assert.match(read("js/loadHeader.js"), /page === "fueling\.html" && !window\.location\.search\) \{ window\.location\.replace\("tools\.html#fueling"\)/);
});

test("the fueling steps scroll to their own section on this page, not the top of it", () => {
    assert.match(read("js/fuelSteps.js"), /main\.closest\("\.tl-sec"\)/);
});
