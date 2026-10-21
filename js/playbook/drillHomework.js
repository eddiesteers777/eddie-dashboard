// Drill -> homework: pure helpers (no DOM, no network). The homework itself is saved by js/homework.js.
import { boardPayload, encodePayload, decodePayload, parsePayload } from "./shareModel.js";

export const MAX_DIAGRAM = 4000;

const SKILL_BY_TOPIC = { Passing: "Passing", Receiving: "First touch", Dribbling: "Dribbling", Finishing: "Finishing", Conditioning: "Fitness", "Warm-up": "Fitness", Possession: "Passing", "Small-sided": "", Pressing: "Fitness" };
export const skillFor = topic => SKILL_BY_TOPIC[topic] || "";

// "Setup: ... / How: ... / Focus: a · b" in the player's words, kept under the 1000-character note limit.
export function noteFor(d) {
    const parts = [];
    if (d.equipment?.length) parts.push("You need: " + d.equipment.join(", "));
    if (d.setup) parts.push("Setup: " + d.setup);
    if (d.how) parts.push("How: " + d.how);
    if (d.points?.length) parts.push("Focus: " + d.points.slice(0, 4).join(" · "));
    if (d.easier?.length) parts.push("Too hard? " + d.easier[0]);
    let out = parts.join("\n");
    while (out.length > 1000 && parts.length > 1) { parts.pop(); out = parts.join("\n"); }
    return out.slice(0, 1000);
}

// Only drills one player can do alone make sense as homework; the rest still work, we just say so.
export const soloFriendly = d => (d.minPlayers || 1) <= 2;

// A compact, name-free copy of the drill's diagram as a link-safe string, or "" when there is none or it is too big.
export async function diagramToken(board) {
    if (!board) return "";
    const token = await encodePayload(boardPayload(board));
    return token.length <= MAX_DIAGRAM ? token : "";
}
export async function diagramBoard(token) {
    if (typeof token !== "string" || !token || token.length > MAX_DIAGRAM) return null;
    const p = parsePayload(await decodePayload(token));
    return p && p.kind === "board" ? p.board : null;
}

export function assignmentFor(d, { diagram = "", due = "", cadence = "weekly", timesPerWeek = 3 } = {}) {
    return {
        title: d.name, skill: skillFor(d.topic), note: noteFor(d), cadence, timesPerWeek,
        minutes: Math.min(240, Math.max(1, d.minutes || 10)), dueDate: due, diagram
    };
}
