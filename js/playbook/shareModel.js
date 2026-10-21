// Southbound Playbook: share links. A board or a practice plan is packed into the part of the web
// address after "#", so it never goes to a server. The page that opens it (playbook-view.html) is read-only.
// Player names never go into a board link (numbers only). The team link (kind "game") carries first names and asks the coach first.
import { parseBoard } from "./boardModel.js";
import * as D from "./drillModel.js";
import * as P from "./practiceModel.js";
import { parseGame, slotCount, slotPositions } from "./gameModel.js";

export const MAX_TOKEN = 60000;      // longest link text we will open
const MAX_JSON = 200000;

const b64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64 = t => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

async function pipe(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
}

// Text for the link: "z" + compressed when the browser can, otherwise "r" + plain.
export async function encodePayload(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === "function") {
        try { return "z" + b64(await pipe(bytes, new CompressionStream("deflate-raw"))); } catch { /* fall through */ }
    }
    return "r" + b64(bytes);
}

export async function decodePayload(token) {
    try {
        if (typeof token !== "string" || token.length < 2 || token.length > MAX_TOKEN) return null;
        let bytes = unb64(token.slice(1));
        if (token[0] === "z") {
            if (typeof DecompressionStream !== "function") return null;
            bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
        } else if (token[0] !== "r") return null;
        if (bytes.length > MAX_JSON) return null;
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
}

export const stripNames = board => ({
    ...board,
    home: board.home.map(p => ({ ...p, name: "", rid: "" })),
    away: board.away.map(p => ({ ...p, name: "", rid: "" }))
});

export const boardPayload = board => ({ v: 1, k: "board", board: stripNames(board) });

export function practicePayload(practice, drills) {
    const byId = new Map(drills.map(d => [d.id, d]));
    const used = [];
    for (const it of practice.items) {
        const d = byId.get(it.drillId);
        if (d && !used.some(u => u.id === d.id)) used.push({ ...d, boardId: "", seed: undefined });
    }
    return { v: 1, k: "practice", practice, drills: used };
}

// Team link for parents and players: first names only, no attendance, runs or contacts. The coach confirms before sharing.
export function gamePayload(date, game, roster, team, session) {
    const name = rid => roster.find(p => p.id === rid)?.name || "";
    const bench = p => game.squad.filter(r => !(game.lineups[p] || []).includes(r)).map(name).filter(Boolean);
    const duty = [];
    for (const j of team?.jobs || []) { const names = ((session?.duty || {})[j.id] || []).map(name).filter(Boolean); if (names.length) duty.push({ job: j.name, names }); }
    return {
        v: 1, k: "game", date, opp: game.opp, formation: game.formation, periods: game.periods, minutes: game.minutes,
        lineups: game.lineups.map(row => row.map(name)), bench: game.lineups.map((_, p) => bench(p)), duty, captain: name(session?.captain || "")
    };
}

// Anything that arrives in a link is cleaned the same way as a file: unknown fields drop, numbers clamp.
export function parsePayload(o) {
    if (!o || o.v !== 1) return null;
    if (o.k === "board") {
        const b = o.board && parseBoard(JSON.stringify({ app: "playbook-board", ...o.board }));
        return b ? { kind: "board", board: stripNames(b) } : null;
    }
    if (o.k === "practice") {
        const practice = P.parsePractice(o.practice);
        if (!practice) return null;
        const drills = [];
        for (const d of Array.isArray(o.drills) ? o.drills.slice(0, 20) : []) {
            const c = D.normalizeDrill(d, typeof d?.id === "string" ? d.id.slice(0, 40) : "");
            if (c) drills.push({ ...c, boardId: "" });
        }
        return { kind: "practice", practice, drills };
    }
    if (o.k === "game") {
        const g = parseGame({ formation: o.formation, periods: o.periods, minutes: o.minutes, opp: o.opp });
        const n = slotCount(g.formation);
        const nm = v => (typeof v === "string" ? v.trim().slice(0, 24) : "");
        const lineups = Array.from({ length: g.periods }, (_, p) => Array.from({ length: n }, (_, i) => nm(o.lineups?.[p]?.[i])));
        const bench = Array.from({ length: g.periods }, (_, p) => (Array.isArray(o.bench?.[p]) ? o.bench[p] : []).slice(0, 40).map(nm).filter(Boolean));
        const duty = (Array.isArray(o.duty) ? o.duty : []).slice(0, 12).map(d => ({ job: nm(d?.job) || "", names: (Array.isArray(d?.names) ? d.names : []).slice(0, 6).map(nm).filter(Boolean) })).filter(d => d.job && d.names.length);
        const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : "";
        return { kind: "game", game: { ...g, lineups, bench, duty, date, captain: nm(o.captain) } };
    }
    return null;
}

export const shareUrl = (origin, token) => `${origin}/playbook-view.html#${token}`;

// "Copy to my Playbook" for a practice: drills with the same name are reused, new ones are added.
export function importPractice(myDrills, myPractices, shared, now = Date.now()) {
    let drills = myDrills;
    const map = new Map();
    for (const d of shared.drills) {
        const same = drills.find(x => x.name.toLowerCase() === d.name.toLowerCase());
        if (same) { map.set(d.id, same.id); continue; }
        const r = D.saveDrill(drills, { ...d, id: "" });
        drills = r.list;
        map.set(d.id, r.id);
    }
    const practice = { ...shared.practice, items: shared.practice.items.filter(i => map.has(i.drillId)).map(i => ({ ...i, drillId: map.get(i.drillId) })) };
    const saved = P.savePractice(myPractices, practice, null, now);
    return { drills, practices: saved.list, practiceId: saved.id, practice };
}

// In already-escaped update text, a Playbook link on our own host becomes an "Open it" link (anything else stays text).
export function linkifyPlaybook(escaped, host) {
    const h = String(host || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!h) return escaped;
    return escaped.replace(new RegExp(`https://${h}/playbook-view\\.html#[A-Za-z0-9_-]+`, "g"), url => `<a class="updates-open" href="${url}">Open it \u2192</a>`);
}
