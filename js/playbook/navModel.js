// Southbound Playbook: the tool navigation, grouped so it never wraps (pure; tested in tests/playbookNav.test.mjs).
// Three groups match the Playbook hub (Plan, Run the day, Team). Each page belongs to one group.
export const GROUPS = Object.freeze([
    { id: "plan", label: "Plan", tools: [
        { file: "playbook-board.html", label: "Board" },
        { file: "playbook-drills.html", label: "Drills" },
        { file: "playbook-practice.html", label: "Practice" },
        { file: "playbook-season.html", label: "Season" }
    ] },
    { id: "run", label: "Run", tools: [
        { file: "playbook-fitness.html", label: "Fitness" },
        { file: "playbook-conditioning.html", label: "Conditioning" }
    ] },
    { id: "team", label: "Team", tools: [
        { file: "playbook-roster.html", label: "Roster" },
        { file: "playbook-team.html", label: "Attendance" },
        { file: "playbook-game.html", label: "Lineup" }
    ] }
]);

// Pages that are a step inside a tool: they belong to the tool's group and highlight it.
const INSIDE = Object.freeze({ "playbook-run.html": "playbook-practice.html", "playbook-results.html": "playbook-fitness.html" });

const fileOf = (path = "") => String(path).split("?")[0].split("#")[0].split("/").pop() || "";

// Which group and tool is this page? Unknown page: the first group, no tool highlighted.
export function locate(path) {
    const f = fileOf(path), target = INSIDE[f] || f;
    for (const g of GROUPS) {
        const t = g.tools.find(x => x.file === target);
        if (t) return { group: g.id, file: t.file };
    }
    return { group: GROUPS[0].id, file: "" };
}

export const toolsOf = id => (GROUPS.find(g => g.id === id) || GROUPS[0]).tools;
