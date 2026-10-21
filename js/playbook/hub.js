import "./shell.js";
import { glance, dayLabel } from "./glance.js";
import { KIND_LABELS } from "./teamModel.js";

const g = glance();
const box = document.getElementById("glance");
if (box && g.players) {
    const tile = (href, num, label) => { const a = document.createElement("a"); a.className = "pb-stat"; a.href = href; const n = document.createElement("b"); n.textContent = num; const l = document.createElement("span"); l.textContent = label; a.append(n, l); return a; };
    box.replaceChildren(
        tile("playbook-roster.html", String(g.players), "Players"),
        tile("playbook-team.html", g.lastDay ? `${g.lastDay.came}/${g.players}` : "–", g.lastDay ? `Came · ${KIND_LABELS[g.lastDay.kind]} ${dayLabel(g.lastDay.date)}` : "No days yet"),
        tile("playbook-team.html", String(g.owed), g.owed === 1 ? "Run owed" : "Runs owed"),
        tile("playbook-team.html", String(g.flagged), "Worth a word")
    );
    box.hidden = false;
}
