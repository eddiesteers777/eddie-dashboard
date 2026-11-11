// Southbound Playbook: the navigation model, five bottom-bar places (pure; tested in tests/playbookNav.test.mjs).
// Week is the home page; Plan, Run, Team and Library each hold a short row of tools. Each page belongs to one place.
export const GROUPS = Object.freeze([
    { id: "week", label: "Week", icon: "home", file: "playbook.html", tools: [] },
    { id: "plan", label: "Plan", icon: "target", file: "playbook-board.html", tools: [
        { file: "playbook-board.html", label: "Board" },
        { file: "playbook-practice.html", label: "Practice" },
        { file: "playbook-season.html", label: "Season" }
    ] },
    { id: "run", label: "Run", icon: "activity", file: "playbook-live.html", tools: [
        { file: "playbook-live.html", label: "Game day" },
        { file: "playbook-fitness.html", label: "Fitness" },
        { file: "playbook-conditioning.html", label: "Conditioning" }
    ] },
    { id: "team", label: "Team", icon: "users", file: "playbook-roster.html", tools: [
        { file: "playbook-roster.html", label: "Roster" },
        { file: "playbook-team.html", label: "Attendance" },
        { file: "playbook-game.html", label: "Lineup" }
    ] },
    { id: "library", label: "Library", icon: "bookOpen", file: "playbook-drills.html", tools: [
        { file: "playbook-drills.html", label: "Drills" }
    ] }
]);

// Pages that are a step inside a tool: they belong to the tool's place and highlight it.
const INSIDE = Object.freeze({ "playbook-run.html": "playbook-practice.html", "playbook-results.html": "playbook-fitness.html" });
// Pages that run on their own and keep the screen to themselves (no bottom bar).
export const FOCUS_PAGES = Object.freeze(["playbook-run.html"]);

const fileOf = (path = "") => String(path).split("?")[0].split("#")[0].split("/").pop() || "";

// Which place and tool is this page? The home page and unknown pages: Week, no tool highlighted.
export function locate(path) {
    const f = fileOf(path), target = INSIDE[f] || f;
    for (const g of GROUPS) {
        const t = g.tools.find(x => x.file === target);
        if (t) return { group: g.id, file: t.file };
    }
    return { group: GROUPS[0].id, file: "" };
}

export const toolsOf = id => (GROUPS.find(g => g.id === id) || GROUPS[0]).tools;
export const hasDock = path => !FOCUS_PAGES.includes(fileOf(path));
