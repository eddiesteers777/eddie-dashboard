// Southbound Playbook: opt-in sync check. Only loads when the address has ?pbcheck (shell.js).
// Shows how many players this phone, the last sync and the account each hold. Nothing is sent
// anywhere; the one button only copies the account's roster onto this phone after a tap.
import { syncInfo, loadAccountRoster, recheck } from "./cloud.js";
import { describeCheck } from "./syncCheckModel.js";

const box = document.createElement("section");
box.className = "pb-synccheck";
box.setAttribute("aria-label", "Playbook sync check");
document.body.appendChild(box);

function draw(note = "") {
    const d = describeCheck(syncInfo());
    box.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = "Playbook sync check";
    box.appendChild(h);
    const dl = document.createElement("dl");
    for (const [k, v] of d.lines) {
        const dt = document.createElement("dt"); dt.textContent = k;
        const dd = document.createElement("dd"); dd.textContent = v;
        dl.append(dt, dd);
    }
    box.appendChild(dl);
    if (note) { const p = document.createElement("p"); p.className = "pb-synccheck-note"; p.textContent = note; box.appendChild(p); }
    const row = document.createElement("div");
    row.className = "pb-synccheck-row";
    const btn = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "pb-synccheck-btn"; b.textContent = label; b.addEventListener("click", fn); row.appendChild(b); return b; };
    if (d.canLoad) {
        btn(`Put the account's ${d.inAccount} players on this phone`, async e => {
            e.currentTarget.disabled = true;
            const ok = await loadAccountRoster();
            draw(ok ? "Done. Open the Roster page to see them." : "That didn't work. Take a screenshot of this box.");
        });
    }
    btn("Check again", async () => { draw("Checking…"); await recheck(); draw(); });
    btn("Close", () => box.remove());
    box.appendChild(row);
}

draw();
