// Fitness results over time: each player's own tests, newest first. No ranking.
import "./shell.js";
import * as F from "./fitnessModel.js";
import { KEYS } from "./store.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const toast = msg => { const t = $("toast"); if (!t) return; t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); };

let results = [];
try { results = F.parse(localStorage.getItem(KEYS.baseline) || ""); } catch {}
const players = F.byPlayer(results);
$("rsEmpty").hidden = players.length > 0;
$("rsCopy").hidden = players.length === 0;
const list = $("rsList");
for (const p of players) {
    const card = h("div", "rs-card"); card.append(h("h3", "", p.name));
    for (const d of p.days) {
        const row = h("div", "rs-day");
        row.append(h("span", "", d.date), h("span", "", [d.mile ? "Mile " + F.mileText(d.mile) : "", d.beep ? "Beep " + F.beepText(d.beep) : ""].filter(Boolean).join(" · ")));
        card.append(row);
    }
    for (const c of Object.values(p.change)) card.append(h("p", "rs-change", c));
    list.append(card);
}
$("rsCopy").onclick = async () => {
    const text = F.summaryText(results);
    try { await navigator.clipboard.writeText(text); toast("Summary copied"); }
    catch { const { sbAlert } = await import("../ui.js"); await sbAlert(text, { title: "Copy this summary" }); }
};
