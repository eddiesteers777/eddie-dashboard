// Southbound Playbook: the pure rules for cloud sync (no browser, no Firebase here).
// The cloud copy is one document: { keys: { "<storage key>": { v: "<text>" | null, at: <ms> } } }.
// Per key, whichever side changed since the last sync wins; a key changed on both
// sides keeps the newer one. The first time an account meets a device that already holds
// work, the two sets can be combined (mergeStates) so nothing is lost.
import { KEYS } from "./store.js";
import * as L from "./boardLibrary.js";
import * as DR from "./drillModel.js";
import * as PM from "./practiceModel.js";
import * as RO from "./rosterModel.js";
import { parseBoard, serialize } from "./boardModel.js";

export const SYNC_KEYS = Object.freeze([KEYS.board, KEYS.boardId, KEYS.library, KEYS.drills, KEYS.practice, KEYS.practiceId, KEYS.practices, KEYS.roster]);
export const MAX_VALUE_BYTES = 200 * 1024; // one key; the whole document stays well under Firestore's 1 MB
export const MAX_DOC_BYTES = 900 * 1024;

const norm = v => (typeof v === "string" ? v : null);
const bytes = s => (s == null ? 0 : new TextEncoder().encode(s).length);

export const hasWork = state => SYNC_KEYS.some(k => norm(state?.[k]) != null);

// What to do for each key. local/snapshot: { key: text|null }. remote: { key: { v, at } } or {}.
// Returns { push: { key: text|null }, apply: { key: text|null }, tooBig: [keys] }.
export function planSync({ local, snapshot = {}, remote = {}, localTimes = {} }) {
    const push = {}, apply = {}, tooBig = [];
    for (const k of SYNC_KEYS) {
        const l = norm(local[k]);
        const s = norm(snapshot[k]);
        const r = remote[k] ? norm(remote[k].v) : undefined; // undefined = the cloud has never heard of this key
        const localChanged = l !== s;
        const remoteChanged = r !== undefined && r !== s;
        if (localChanged && remoteChanged && l !== r) {
            // Both sides edited: the newer edit wins.
            const lt = Number(localTimes[k]) || 0, rt = Number(remote[k].at) || 0;
            if (lt >= rt) push[k] = l; else apply[k] = r;
        } else if (localChanged) {
            if (l !== r) push[k] = l;
        } else if (remoteChanged && r !== l) {
            apply[k] = r;
        }
        if (k in push && bytes(push[k]) > MAX_VALUE_BYTES) { tooBig.push(k); delete push[k]; }
    }
    return { push, apply, tooBig };
}

export function docBytes(keys) {
    let n = 0;
    for (const e of Object.values(keys || {})) n += bytes(e?.v) + 40;
    return n;
}

// ---- combining two sets of work (first sync of a device that already has work) ----
function freshId(prefix, taken) {
    let n = 1 + Math.max(0, ...[...taken].map(i => Number(String(i).slice(1)) || 0));
    while (taken.has(prefix + n)) n++;
    return prefix + n;
}

export function mergeStates(local, remote) {
    const out = {};
    // Roster: same first name = same player.
    const lr = RO.parseRoster(norm(local[KEYS.roster]) || "") || [];
    const rr = RO.parseRoster(norm(remote[KEYS.roster]) || "") || [];
    const players = [...lr];
    const rosterMap = new Map();
    for (const p of rr) {
        const same = players.find(x => x.name.toLowerCase() === p.name.toLowerCase());
        if (same) { rosterMap.set(p.id, same.id); continue; }
        const id = players.some(x => x.id === p.id) ? RO.nextId(players) : p.id;
        rosterMap.set(p.id, id);
        players.push({ ...p, id });
    }
    if (players.length) out[KEYS.roster] = RO.serializeRoster(players);

    const remapBoard = b => ({ ...b, home: b.home.map(p => (p.rid ? { ...p, rid: rosterMap.get(p.rid) || "" } : p)) });

    // Saved boards: same name and time = same board.
    const ll = L.loadLibrary(norm(local[KEYS.library]));
    const rl = L.loadLibrary(norm(remote[KEYS.library]));
    const boards = [...ll.boards];
    const boardMap = new Map();
    for (const b of rl.boards) {
        const same = boards.find(x => x.name === b.name && x.updatedAt === b.updatedAt);
        if (same) { boardMap.set(b.id, same.id); continue; }
        const id = boards.some(x => x.id === b.id) ? freshId("b", new Set(boards.map(x => x.id))) : b.id;
        boardMap.set(b.id, id);
        boards.push({ ...b, id, board: remapBoard(b.board) });
    }
    if (boards.length) out[KEYS.library] = L.serializeLibrary({ boards: boards.slice(0, L.MAX_BOARDS) });

    // Drills: same name = same drill (the starter drills match this way).
    const ld = DR.parseDrills(norm(local[KEYS.drills]) || "") || [];
    const rd = DR.parseDrills(norm(remote[KEYS.drills]) || "") || [];
    const drills = [...ld];
    const drillMap = new Map();
    for (const d of rd) {
        const same = drills.find(x => x.name.toLowerCase() === d.name.toLowerCase());
        if (same) { drillMap.set(d.id, same.id); continue; }
        const id = drills.some(x => x.id === d.id) ? freshId("d", new Set(drills.map(x => x.id))) : d.id;
        drillMap.set(d.id, id);
        drills.push({ ...d, id, boardId: d.boardId ? boardMap.get(d.boardId) || "" : "" });
    }
    if (drills.length) out[KEYS.drills] = DR.serializeDrills(drills);

    // Saved practices.
    const remapPractice = p => ({ ...p, items: p.items.map(i => ({ ...i, drillId: drillMap.get(i.drillId) || i.drillId })) });
    const lp = PM.parsePracticeList(norm(local[KEYS.practices]) || "");
    const rp = PM.parsePracticeList(norm(remote[KEYS.practices]) || "");
    const practices = [...lp];
    const practiceMap = new Map();
    for (const e of rp) {
        const same = practices.find(x => x.name === e.name && x.updatedAt === e.updatedAt);
        if (same) { practiceMap.set(e.id, same.id); continue; }
        const id = practices.some(x => x.id === e.id) ? freshId("p", new Set(practices.map(x => x.id))) : e.id;
        practiceMap.set(e.id, id);
        practices.push({ ...e, id, practice: remapPractice(e.practice) });
    }
    if (practices.length) out[KEYS.practices] = PM.serializePracticeList(practices.slice(0, 100));

    // What was open: this device's wins; otherwise the account's, pointed at the merged ids.
    if (norm(local[KEYS.board])) { out[KEYS.board] = local[KEYS.board]; if (norm(local[KEYS.boardId])) out[KEYS.boardId] = local[KEYS.boardId]; }
    else if (norm(remote[KEYS.board])) {
        const b = parseBoard(remote[KEYS.board]);
        if (b) out[KEYS.board] = serialize(remapBoard(b));
        const id = boardMap.get(norm(remote[KEYS.boardId]));
        if (id) out[KEYS.boardId] = id;
    }
    if (norm(local[KEYS.practice])) { out[KEYS.practice] = local[KEYS.practice]; if (norm(local[KEYS.practiceId])) out[KEYS.practiceId] = local[KEYS.practiceId]; }
    else if (norm(remote[KEYS.practice])) {
        try {
            const p = PM.parsePractice(JSON.parse(remote[KEYS.practice]));
            if (p) out[KEYS.practice] = JSON.stringify(remapPractice(p));
        } catch { /* skip an unreadable draft */ }
        const id = practiceMap.get(norm(remote[KEYS.practiceId]));
        if (id) out[KEYS.practiceId] = id;
    }
    return out;
}
