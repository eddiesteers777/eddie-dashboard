// The Pace Calculator's Heart Rate tab (pace-calculator.html and the public pace.html).
// Wires the form to js/hrZones.js. Stores and sends nothing, like the rest of the calculator.
import { hrZones, zoneRange } from "./hrZones.js";

const $ = id => document.getElementById(id);

const HELP = {
    threshold: "Don't know it? After a warm-up, run 30 minutes hard on your own. Your average heart rate over the last 20 minutes is close to your threshold.",
    max: "Use the highest heart rate your watch has recorded in a hard race or hill repeats. Age formulas can be off by 10 beats or more.",
    reserve: "Take your resting heart rate on waking, before you get up, a few mornings in a row, and use the lowest."
};
const LABEL = { threshold: "Friel", max: "% of max", reserve: "Karvonen" };
const NOTE = {
    threshold: "Joe Friel's running zones, worked out from your lactate-threshold heart rate. Most easy running belongs in Zones 1 and 2.",
    max: "Five zones as a share of your maximum heart rate. Most easy running belongs in Zones 1 and 2.",
    reserve: "The Karvonen method: your resting heart rate plus a share of the range between resting and max. It suits runners with a low resting heart rate better than max alone."
};

function init() {
    const root = $("hr-method");
    if (!root) return;
    let method = "threshold";

    const show = next => {
        method = next;
        root.querySelectorAll("[data-hr-method]").forEach(b => {
            const on = b.dataset.hrMethod === method;
            b.classList.toggle("active", on);
            b.setAttribute("aria-pressed", String(on));
        });
        document.querySelectorAll("[data-hr-for]").forEach(f => { f.hidden = !f.dataset.hrFor.split(" ").includes(method); });
        $("hr-help").textContent = HELP[method];
        $("hr-error").textContent = "";
        $("hr-result-card").hidden = true;
    };

    const calculate = () => {
        const out = hrZones({ method, lthr: $("hr-lthr").value, max: $("hr-max").value, rest: $("hr-rest").value });
        $("hr-error").textContent = out.error || "";
        if (out.error) { $("hr-result-card").hidden = true; return; }
        const table = $("hr-zones-table");
        table.replaceChildren(...out.zones.map(z => {
            const row = document.createElement("div");
            row.className = "pc-zones-row";
            const name = document.createElement("span");
            name.className = "pc-zones-name";
            name.textContent = `Zone ${z.key} · ${z.name}`;
            const range = document.createElement("span");
            range.className = "pc-zones-range";
            range.textContent = zoneRange(z);
            row.append(name, range);
            return row;
        }));
        $("hr-method-label").textContent = LABEL[method];
        $("hr-note").textContent = NOTE[method];
        $("hr-result-card").hidden = false;
    };

    root.addEventListener("click", e => {
        const b = e.target.closest("[data-hr-method]");
        if (b) show(b.dataset.hrMethod);
    });
    $("hr-calc-btn").addEventListener("click", calculate);
    document.querySelectorAll(".pc-hr-fields input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") calculate(); }));
}

init();
