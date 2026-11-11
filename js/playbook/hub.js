import "./shell.js";
import { glance, dayLabel } from "./glance.js";
import { KIND_LABELS, loadTeam } from "./teamModel.js";
import { continueCard } from "./continueModel.js";
import { weekView } from "./weekModel.js";
import { parsePracticeList } from "./practiceModel.js";
import { KEYS } from "./store.js";

const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const link = (href, cls, text) => { const a = h("a", cls, text); a.href = href; return a; };

// A practice you started and have not cleared: one tap back to it.
try {
    const c = continueCard(read(KEYS.practice));
    const el = document.getElementById("continue");
    if (c && el) {
        el.href = c.href;
        document.getElementById("contTitle").textContent = c.title;
        document.getElementById("contMeta").textContent = c.meta;
        el.hidden = false;
    }
} catch { /* storage unavailable: no card */ }

// This week: the next game and the next practice from the Season tab.
function drawWeek() {
    const box = document.getElementById("wkCards");
    if (!box) return;
    const v = weekView(loadTeam(read(KEYS.team)));
    const cards = [];
    if (v.game) {
        const g = v.game, c = h("section", "wk-card game");
        c.append(h("div", "wk-k", g.when || "Next game"), h("h2", "", g.title), h("div", "wk-count", g.count),
            h("div", "wk-meta", [g.arrive && `Arrive ${g.arrive}`, g.where].filter(Boolean).join(" · ") || "Add kickoff and arrive time in Season"));
        const act = h("div", "wk-act");
        act.append(g.hasLineup ? link(`playbook-live.html?date=${g.date}`, "pb-btn pb-primary", "Game day") : link(`playbook-game.html?date=${g.date}`, "pb-btn pb-primary", "Set lineup"), g.hasLineup ? link(`playbook-game.html?date=${g.date}`, "pb-btn", "Lineup") : link("playbook-season.html", "pb-btn", "Details"));
        c.append(act); cards.push(c);
    }
    if (v.practice) {
        const p = v.practice, plan = p.planId ? parsePracticeList(read(KEYS.practices) || "").find(x => x.id === p.planId) : null;
        const c = h("section", "wk-card prac");
        c.append(h("div", "wk-k", "Next practice"), h("h2", "", p.when), h("div", "wk-meta", plan ? `${plan.name} · ${plan.practice.total} min` : "No plan yet"));
        const act = h("div", "wk-act");
        act.append(plan ? link(`playbook-run.html?plan=${encodeURIComponent(plan.id)}`, "pb-btn pb-primary", "Run practice") : link("playbook-practice.html", "pb-btn pb-primary", "Plan it"), link("playbook-season.html", "pb-btn", "Edit"));
        c.append(act); cards.push(c);
    }
    if (v.empty) {
        const c = h("section", "wk-card wk-empty");
        c.append(h("div", "wk-k", "This week"), h("h2", "", "Nothing scheduled"), h("p", "", "Add a practice or a game and it shows here with a countdown."),
            link("playbook-season.html", "pb-btn pb-primary", "Add to schedule"));
        cards.push(c);
        const all = document.getElementById("phAll");
        if (all) all.open = true; // first visit: show what the tools are
    }
    box.replaceChildren(...cards);
}
try { drawWeek(); } catch (e) { console.warn("Southbound: Playbook week.", e); }

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
