/* ==========================================
   Southbound — Weekly Planning page (planning.html, coach only)

   Eddie's own week, on his marathon plan (js/planningData.js), drawn by
   js/planningView.js. Clients' weeks are planned in the Client Hub's
   Planning tab; the chips here link there.
========================================== */

import { mountPlanning } from "./planningView.js";
import { selfWeek, applySelf, undoSelf, planningLog } from "./planningData.js";
import { selfState } from "./athleteSources.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const adapter = {
    who: "self",
    firstName: "",
    key: "self",
    // His strength lives on its own page; the chatbot copies that column as it is.
    scope: "runs",
    async load(today, { from, to }) {
        const [{ state }, week] = await Promise.all([selfState(today), selfWeek(from, to)]);
        this.planDays = week.planDays;
        return {
            state, plan: week.plan, paces: week.paces, done: new Set(), record: null,
            noPlan: week.planDays.length ? null : "Your marathon plan has no days in these dates. Write the week on the Marathon page, or copy the brief to plan it from scratch."
        };
    },
    async apply({ days, from, to }) {
        const id = await applySelf(days, this.planDays || [], { from, to });
        if (!id) return null;
        return { message: `${days.length} ${days.length === 1 ? "day" : "days"} changed in your plan.`, undo: () => undoSelf(id) };
    },
    log: () => planningLog(),
    undo: id => undoSelf(id)
};

mountPlanning($("planningRoot"), adapter);

// Clients: each opens their own Planning tab in the hub.
import("./coachAccess.js").then(m => m.listMyClients()).then(links => {
    const nav = $("plWho");
    const seen = new Set();
    const chips = (links || []).filter(l => l.clientUid && !seen.has(l.clientUid) && seen.add(l.clientUid))
        .sort((a, b) => String(a.clientName || "").localeCompare(String(b.clientName || "")))
        .map(l => `<a class="pl-chip" href="client.html?uid=${encodeURIComponent(l.clientUid)}&tab=planning">${esc(String(l.clientName || "Client").split(" ")[0])}</a>`);
    if (chips.length) nav.insertAdjacentHTML("beforeend", chips.join(""));
}).catch(() => { /* Me still works */ });
