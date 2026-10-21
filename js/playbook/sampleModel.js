// Playbook sample team: pure model. A made-up U12 team so a new coach can see every tool filled in.
// Sample players carry the note "Sample" and sample days the label "Sample", so removing them never touches real data.
import * as R from "./rosterModel.js";
import * as T from "./teamModel.js";

export const SAMPLE = "Sample";
const PLAYERS = ["Maya 1 GK", "Jordan 4 DEF", "Eli 5 DEF", "Sam 3 DEF", "Priya 8 MID", "Marcus 10 MID", "Lena 6 MID", "Theo 7 MID", "Ava 9 FWD", "Noah 11 FWD", "Zoe 14 FWD", "Ben 2 DEF", "Isla 15 MID", "Kai 17 FWD"];

const dayKey = (now, back) => { const d = new Date(now); d.setDate(d.getDate() - back); return T.todayKey(d); };

export const isSample = p => p && p.note === SAMPLE;
export const hasSample = (roster, team) => roster.some(isSample) || team.sessions.some(s => s.label === SAMPLE);

// Adds the sample players and three past days. Only for an empty roster; returns null otherwise.
export function loadSample(roster, team, now = new Date()) {
    if (roster.length) return null;
    const { list } = R.addBulk([], PLAYERS.join("\n"));
    const players = list.map(p => ({ ...p, note: SAMPLE }));
    const ids = players.map(p => p.id);
    let t = team;
    const plan = [
        { back: 6, kind: "practice", absent: [2, 9], late: [5], excused: [11], cap: 5, duty: [[0, [1]], [1, [3, 6]], [2, [4]], [3, [7, 12]]] },
        { back: 3, kind: "practice", absent: [9], late: [], excused: [], cap: 8, duty: [[0, [10]], [1, [0, 2]], [2, [12]], [3, [1, 13]]] },
        { back: 1, kind: "game", absent: [], late: [3], excused: [6], cap: 4, duty: [[0, [13]], [1, [5, 11]], [2, [7]], [3, [8, 9]]] }
    ];
    for (const d of plan) {
        const o = T.openSession(t, dayKey(now, d.back), d.kind);
        t = T.setLabel(o.team, o.id, SAMPLE);
        for (const i of ids.keys()) {
            const mark = d.absent.includes(i) ? "absent" : d.late.includes(i) ? "late" : d.excused.includes(i) ? "excused" : "here";
            t = T.setMark(t, o.id, ids[i], mark);
        }
        t = T.setCaptain(t, o.id, ids[d.cap]);
        for (const [j, who] of d.duty) if (t.jobs[j]) t = T.setDuty(t, o.id, t.jobs[j].id, who.map(i => ids[i]));
    }
    // One make-up run already paid off, so both states show.
    const first = t.runs.find(r => r.rid === ids[2]);
    if (first) t = T.setRunDone(t, first.id, true, now.getTime());
    return { roster: players, team: t };
}

export function removeSample(roster, team) {
    let t = team;
    for (const s of team.sessions) if (s.label === SAMPLE) t = T.deleteSession(t, s.id);
    return { roster: roster.filter(p => !isSample(p)), team: t };
}
