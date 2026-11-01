// Route / Safety / Fuel / Save tabs under the map (routes.html). One panel shows at a time.
// The panels keep their markup and ids, so js/routes.js fills them whether or not they are showing.
const tabs = [...document.querySelectorAll("#rbTabs [data-tab]")];

export function showTab(name) {
    if (!tabs.some(t => t.dataset.tab === name)) name = "route";
    tabs.forEach(t => {
        const on = t.dataset.tab === name;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        t.classList.toggle("is-on", on);
    });
    document.querySelectorAll("[data-panel]").forEach(p => { p.hidden = p.dataset.panel !== name; });
}

tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
    tab.addEventListener("keydown", e => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        showTab(next.dataset.tab);
    });
});
showTab("route");
// Opening the safety strip from the Safe Map button or a tapped stretch on the map jumps to the Safety tab.
document.addEventListener("rb:show-tab", e => showTab(e.detail));
