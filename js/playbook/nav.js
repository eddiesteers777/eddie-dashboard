// Southbound Playbook: replaces the flat tab row with a group switch (Plan / Run / Team) and one short row of
// that group's tools. The old links stay in the HTML as the fallback if this script doesn't run.
import { GROUPS, locate, toolsOf } from "./navModel.js";

export function buildNav(nav) {
    if (!nav || nav.dataset.pbNav) return;
    const here = locate(location.pathname);
    const util = document.createElement("div");
    util.className = "pb-util";
    // Keep the theme switch and sync status (shell.js wires them).
    nav.querySelectorAll("[data-pb-sync],[data-pb-theme]").forEach(n => { n.classList.remove("pb-tab"); n.classList.add("pb-util-btn"); util.append(n); });
    const seg = document.createElement("div");
    seg.className = "pb-seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Playbook section");
    const row = document.createElement("div");
    row.className = "pb-subnav";
    const paint = (id) => {
        seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.group === id)));
        row.replaceChildren(...toolsOf(id).map(t => {
            const a = document.createElement("a");
            a.href = t.file; a.className = "pb-subtab"; a.textContent = t.label;
            if (t.file === here.file) a.setAttribute("aria-current", "page");
            return a;
        }));
    };
    for (const g of GROUPS) {
        const b = document.createElement("button");
        b.type = "button"; b.dataset.group = g.id; b.textContent = g.label;
        b.addEventListener("click", () => paint(g.id));
        seg.append(b);
    }
    nav.replaceChildren(seg, row, util);
    nav.classList.add("pb-nav");
    nav.dataset.pbNav = "1";
    paint(here.group);
}
