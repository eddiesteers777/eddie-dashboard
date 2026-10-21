// Playbook game day: pure model (no DOM). A game plan lives on a "game" session of the Team tab.
// Lineups are one array of 11 player ids per period (half or quarter), in formation slot order (GK first).
import { FORMATIONS, formationSlots } from "./boardModel.js";

export const PERIOD_CHOICES = Object.freeze([2, 4]);
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export function newGame() {
    return { opp: "", formation: "4-4-2", periods: 2, minutes: 30, squad: [], lineups: [] };
}
export const periodName = (game, i) => (game.periods === 4 ? "Q" + (i + 1) : i === 0 ? "1st half" : "2nd half");
export const slotCount = formation => formationSlots(formation).length;

// "GK", then DEF / MID / FWD by line (the last line is FWD, the first DEF, any lines between MID).
export function slotPositions(formation) {
    const lines = formation.split("-").map(Number);
    const out = ["GK"];
    lines.forEach((n, i) => { for (let j = 0; j < n; j++) out.push(i === 0 ? "DEF" : i === lines.length - 1 ? "FWD" : "MID"); });
    return out;
}

const blank = (formation, periods) => Array.from({ length: periods }, () => Array(slotCount(formation)).fill(""));
const fit = (lineups, formation, periods) => {
    const n = slotCount(formation);
    return Array.from({ length: periods }, (_, p) => Array.from({ length: n }, (_, s) => lineups[p]?.[s] || ""));
};

export function setFormation(game, formation) {
    if (!FORMATIONS.includes(formation) || formation === game.formation) return game;
    return { ...game, formation, lineups: blank(formation, game.periods) };
}
export function setPeriods(game, periods) {
    if (!PERIOD_CHOICES.includes(periods) || periods === game.periods) return game;
    return { ...game, periods, minutes: periods === 4 ? 15 : 30, lineups: fit(game.lineups, game.formation, periods) };
}
export const setMinutes = (game, m) => ({ ...game, minutes: Math.min(60, Math.max(5, Math.round(Number(m)) || game.minutes)) });
export const setOpponent = (game, opp) => ({ ...game, opp: str(opp, 40) });

export function setSquad(game, ids) {
    const squad = [...new Set(ids.filter(x => typeof x === "string"))].slice(0, 40);
    // Anyone who left the squad leaves the lineups too.
    return { ...game, squad, lineups: game.lineups.map(l => l.map(r => (squad.includes(r) ? r : ""))) };
}
export function toggleSquad(game, rid) {
    return setSquad(game, game.squad.includes(rid) ? game.squad.filter(x => x !== rid) : [...game.squad, rid]);
}

// Put a player in a slot for one period. If they already play elsewhere that period, the two swap.
export function setSlot(game, period, slot, rid) {
    const lineups = fit(game.lineups, game.formation, game.periods);
    const row = lineups[period];
    if (!row || slot < 0 || slot >= row.length) return game;
    if (rid && !game.squad.includes(rid)) return game;
    const there = rid ? row.indexOf(rid) : -1;
    if (there >= 0 && there !== slot) row[there] = row[slot];
    row[slot] = rid || "";
    return { ...game, lineups };
}
export const clearLineups = game => ({ ...game, lineups: blank(game.formation, game.periods) });
export const benchFor = (game, period) => game.squad.filter(r => !(game.lineups[period] || []).includes(r));

// Minutes each squad player is on the field (every squad player is listed, 0 if never).
export function minutes(game) {
    const out = Object.fromEntries(game.squad.map(r => [r, 0]));
    for (const row of game.lineups) for (const r of row) if (r && r in out) out[r] += game.minutes;
    return out;
}
export function spread(game) {
    const v = Object.values(minutes(game));
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : { min: 0, max: 0 };
}

// Changes going into each period: who comes off, who comes on.
export function changes(game) {
    const out = [];
    for (let p = 1; p < game.periods; p++) {
        const a = game.lineups[p - 1] || [], b = game.lineups[p] || [];
        out.push({ period: p, off: a.filter(r => r && !b.includes(r)), on: b.filter(r => r && !a.includes(r)) });
    }
    return out;
}

// Fair plan: each period the players with the fewest minutes so far play. A player who stays on keeps their slot,
// newcomers take the freed slots by best position match. One goalkeeper plays the whole game when the squad has one.
export function autoPlan(game, roster) {
    const n = slotCount(game.formation), pos = slotPositions(game.formation);
    const byId = new Map(roster.map(p => [p.id, p]));
    const squad = game.squad.filter(r => byId.has(r));
    const lineups = blank(game.formation, game.periods);
    if (!squad.length) return { ...game, lineups };
    const gk = squad.find(r => byId.get(r).pos === "GK") || "";
    const played = new Map(squad.map(r => [r, 0]));
    const score = (rid, want) => { const p = byId.get(rid).pos; return p === want ? 0 : p === "Any" ? 1 : want === "GK" || p === "GK" ? 3 : 2; };
    let prev = [];
    for (let p = 0; p < game.periods; p++) {
        const field = squad.filter(r => r !== gk);
        const need = Math.min(n - (gk ? 1 : 0), field.length);
        const pool = [...field].sort((a, b) => played.get(a) - played.get(b) || (prev.includes(b) ? 1 : 0) - (prev.includes(a) ? 1 : 0) || squad.indexOf(a) - squad.indexOf(b));
        const on = pool.slice(0, need);
        const row = Array(n).fill("");
        if (gk) { row[0] = gk; }
        // stayers keep their slot
        for (let s = 0; s < n; s++) { const r = prev[s]; if (r && r !== gk && on.includes(r)) row[s] = r; }
        const todo = on.filter(r => !row.includes(r));
        for (let s = 0; s < n && todo.length; s++) {
            if (row[s]) continue;
            let best = 0;
            todo.forEach((r, i) => { if (score(r, pos[s]) < score(todo[best], pos[s])) best = i; });
            row[s] = todo.splice(best, 1)[0];
        }
        // fewer than 11 available: a GK-less squad still fills slot 0 first via the loop above
        lineups[p] = row;
        for (const r of row) if (r) played.set(r, played.get(r) + 1);
        prev = row;
    }
    return { ...game, lineups };
}

export function parseGame(o) {
    const base = newGame();
    if (!o || typeof o !== "object") return null;
    const formation = FORMATIONS.includes(o.formation) ? o.formation : base.formation;
    const periods = PERIOD_CHOICES.includes(o.periods) ? o.periods : base.periods;
    const squad = [...new Set((Array.isArray(o.squad) ? o.squad : []).filter(x => typeof x === "string").map(x => x.slice(0, 20)))].slice(0, 40);
    const lineups = fit(Array.isArray(o.lineups) ? o.lineups.map(l => (Array.isArray(l) ? l.map(x => (typeof x === "string" && squad.includes(x) ? x : "")) : [])) : [], formation, periods);
    // a player can appear once per period
    for (const row of lineups) row.forEach((r, i) => { if (r && row.indexOf(r) !== i) row[i] = ""; });
    return { opp: str(o.opp, 40), formation, periods, minutes: Math.min(60, Math.max(5, Math.round(Number(o.minutes)) || base.minutes)), squad, lineups };
}
