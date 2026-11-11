// Southbound Playbook: one bottom bar for the whole Playbook (Week, Plan, Run, Team, Library), a short row of the
// current place's tools at the top, and a "more" sheet that holds Sign in, Light/Dark and the way back to the app.
// The old links stay in the HTML as the fallback if this script doesn't run.
import { GROUPS, locate, toolsOf, hasDock } from "./navModel.js";
import { icon } from "../icons.js";

function dock(here) {
    const bar = document.createElement("nav");
    bar.className = "pb-dock"; bar.setAttribute("aria-label", "Playbook");
    bar.innerHTML = GROUPS.map(g => `<a href="${g.file}" class="pb-dock-item"${g.id === here.group ? ` aria-current="page"` : ""}>${icon(g.icon)}<span>${g.label}</span></a>`).join("");
    document.body.append(bar);
    document.body.classList.add("pb-has-dock");
}

function moreSheet(util) {
    const dlg = document.createElement("dialog");
    dlg.className = "pb-menu"; dlg.setAttribute("aria-label", "Playbook menu");
    const head = document.createElement("div");
    head.className = "pb-menu-head";
    head.innerHTML = `<b>Playbook</b>`;
    const close = document.createElement("button");
    close.type = "button"; close.className = "pb-menu-x"; close.setAttribute("aria-label", "Close"); close.textContent = "Done";
    head.append(close);
    const body = document.createElement("div");
    body.className = "pb-menu-body";
    util.forEach(n => { n.classList.add("pb-menu-row"); body.append(n); });
    const back = document.createElement("a");
    back.className = "pb-menu-row pb-menu-app"; back.href = "index.html"; back.textContent = "Back to Southbound";
    body.append(back);
    dlg.append(head, body);
    close.addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    document.body.append(dlg);
    return dlg;
}

export function buildNav(nav) {
    const here = locate(location.pathname);
    if (hasDock(location.pathname) && !document.querySelector(".pb-dock")) dock(here);
    if (!nav || nav.dataset.pbNav) return;
    // Keep the theme switch and sync status (shell.js and cloud.js wire them wherever they live).
    const util = [...nav.querySelectorAll("[data-pb-sync],[data-pb-theme]")];
    util.forEach(n => n.classList.remove("pb-tab", "pb-util-btn"));
    const dlg = moreSheet(util);
    const more = document.createElement("button");
    more.type = "button"; more.className = "pb-more-btn"; more.setAttribute("aria-label", "More: sign in, light or dark"); more.setAttribute("aria-haspopup", "dialog");
    more.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>`;
    more.addEventListener("click", () => dlg.showModal());
    const row = document.createElement("div");
    row.className = "pb-subnav";
    const tools = toolsOf(here.group);
    if (tools.length <= 1) { const place = document.createElement("span"); place.className = "pb-place"; place.textContent = GROUPS.find(g => g.id === here.group)?.label || ""; row.append(place); }
    if (tools.length > 1) row.append(...tools.map(t => {
        const a = document.createElement("a");
        a.href = t.file; a.className = "pb-subtab"; a.textContent = t.label;
        if (t.file === here.file) a.setAttribute("aria-current", "page");
        return a;
    }));
    nav.replaceChildren(row, more);
    nav.classList.add("pb-nav");
    nav.dataset.pbNav = "1";
}
