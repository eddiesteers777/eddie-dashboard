import "./shell.js";
import { glance, dayLabel } from "./glance.js";
import { KIND_LABELS } from "./teamModel.js";
import { continueCard } from "./continueModel.js";
import { KEYS } from "./store.js";

// A practice you started and have not cleared: one tap back to it.
try {
    const c = continueCard(localStorage.getItem(KEYS.practice));
    const el = document.getElementById("continue");
    if (c && el) {
        el.href = c.href;
        document.getElementById("contTitle").textContent = c.title;
        document.getElementById("contMeta").textContent = c.meta;
        el.hidden = false;
    }
} catch { /* storage unavailable: no card */ }

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
