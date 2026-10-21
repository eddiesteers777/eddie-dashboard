// A quick read of the Playbook's team numbers from this device, for the Playbook home and the coach dashboard.
import { KEYS } from "./store.js";
import * as T from "./teamModel.js";
import * as R from "./rosterModel.js";

export function glance(read = k => { try { return localStorage.getItem(k); } catch { return null; } }) {
    const roster = R.parseRoster(read(KEYS.roster) || "") || [];
    const team = T.loadTeam(read(KEYS.team));
    const last = T.sortedSessions(team)[0] || null;
    let lastDay = null;
    if (last) {
        const c = T.counts(team, last.id);
        lastDay = { date: last.date, kind: last.kind, came: c.here + c.late, marked: c.here + c.late + c.absent + c.excused };
    }
    const known = new Set(roster.map(p => p.id));
    return {
        players: roster.length,
        lastDay,
        owed: T.pendingRuns(team).filter(r => known.has(r.rid)).length,
        flagged: T.needsAttention(team, roster).length
    };
}

export const dayLabel = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
