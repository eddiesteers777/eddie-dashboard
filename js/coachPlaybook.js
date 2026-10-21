// Coach dashboard card: the Southbound Playbook's team numbers and shortcuts (js/playbook/glance.js).
import { glance, dayLabel } from "./playbook/glance.js";
import { KIND_LABELS } from "./playbook/teamModel.js";

const line = document.getElementById("coachPbGlance");
if (line) {
    const g = glance();
    if (!g.players) line.textContent = "Add your players on the roster, then take attendance, plan practices and draw plays.";
    else {
        const bits = [`${g.players} players`];
        if (g.lastDay) bits.push(`${g.lastDay.came} came on ${dayLabel(g.lastDay.date)} (${KIND_LABELS[g.lastDay.kind].toLowerCase()})`);
        if (g.owed) bits.push(`${g.owed} ${g.owed === 1 ? "run" : "runs"} owed`);
        if (g.flagged) bits.push(`${g.flagged} worth a word`);
        line.textContent = bits.join(" · ");
    }
}
