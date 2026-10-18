/* ==========================================
   Southbound — the session report (pure + markup)

   What a coach adds to a completed session beyond "worked on" and "next
   time": a headline (focus), the drills with an optional result, and a
   1 to 5 dot level for the skills trained. The client reads them as a
   short report. Stored on the session log (js/sessionLogs.js). Unit-
   tested in tests/sessionReport.test.mjs.
========================================== */

export const MAX_DRILLS = 12;
export const MAX_SKILLS = 8;
const text = (v, max) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);

// "Rondo 4v1 | 12 min" per line -> [{ name, result }].
export function parseDrills(input) {
    return String(input ?? "").split("\n").map(line => {
        const [name, ...rest] = line.split("|");
        return { name: text(name, 60), result: text(rest.join("|"), 20) };
    }).filter(d => d.name).slice(0, MAX_DRILLS);
}
export const drillsText = drills => (drills || []).map(d => d.result ? `${d.name} | ${d.result}` : d.name).join("\n");

export function cleanDrills(list) {
    return (Array.isArray(list) ? list : []).map(d => ({ name: text(d?.name, 60), result: text(d?.result, 20) }))
        .filter(d => d.name).slice(0, MAX_DRILLS);
}

export function cleanSkills(list) {
    const seen = new Set();
    const out = [];
    for (const s of Array.isArray(list) ? list : []) {
        const skill = text(s?.skill, 40);
        const level = Math.round(Number(s?.level));
        if (!skill || seen.has(skill) || !(level >= 1 && level <= 5)) continue;
        seen.add(skill);
        out.push({ skill, level });
    }
    return out.slice(0, MAX_SKILLS);
}

// Compare with the previous report that rated the same skill: +1, 0, null (new).
export function skillChange(skill, level, earlierLogs = []) {
    for (const log of earlierLogs) {
        const hit = (log.skills || []).find(s => s.skill === skill);
        if (hit) return level - hit.level;
    }
    return null;
}

export function hasReport(log) {
    return Boolean(log && (log.focus || (log.drills || []).length || (log.skills || []).length));
}

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function dotsHtml(level) {
    return `<span class="rep-dots" role="img" aria-label="${level} of 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= level ? "on" : ""}"></i>`).join("")}</span>`;
}

// The report's body (focus headline, drills, skill dots). The caller adds
// the date, the coach's words and what's next.
export function reportHtml(log, earlierLogs = []) {
    if (!hasReport(log)) return "";
    const drills = log.drills || [];
    const skills = log.skills || [];
    return `
        ${log.focus ? `<div class="rep-focus">${esc(log.focus)}</div>` : ""}
        ${drills.length ? `<div class="rep-block"><div class="rep-kicker">What we worked on</div><ol class="rep-drills">${drills.map((d, i) => `<li><span class="rep-n">${String(i + 1).padStart(2, "0")}</span><span class="rep-name">${esc(d.name)}</span>${d.result ? `<span class="rep-result">${esc(d.result)}</span>` : ""}</li>`).join("")}</ol></div>` : ""}
        ${skills.length ? `<div class="rep-block"><div class="rep-kicker">Skills this session</div><ul class="rep-skills">${skills.map(s => {
            const change = skillChange(s.skill, s.level, earlierLogs);
            return `<li><span>${esc(s.skill)}</span>${dotsHtml(s.level)}<span class="rep-change">${change == null ? "New" : change > 0 ? `▲${change}` : change < 0 ? `▼${-change}` : "—"}</span></li>`;
        }).join("")}</ul></div>` : ""}`;
}
