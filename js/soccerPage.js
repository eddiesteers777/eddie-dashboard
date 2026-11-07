/* Soccer page (soccer.html): the 1-on-1 / Group switch shows one panel at a time. Plain buttons, no data. */
const buttons = [...document.querySelectorAll(".sp-seg-btn")];
const show = (name) => {
    buttons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.panel === name)));
    document.querySelectorAll(".sp-panel").forEach(p => { p.hidden = p.id !== "sp-" + name; });
};
buttons.forEach(b => b.addEventListener("click", () => show(b.dataset.panel)));
// ?service=soccer_group (from Packages) opens the group panel.
if (new URLSearchParams(location.search).get("service") === "soccer_group") show("group");
