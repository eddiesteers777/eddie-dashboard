// Playbook: saved boards on this device (pure functions; the page does the storage).
import { parseBoard, serialize } from "./boardModel.js";

export const MAX_BOARDS = 200;

export const emptyLibrary = () => ({ boards: [] });

const newId = lib => "b" + (1 + Math.max(0, ...lib.boards.map(b => Number(b.id.slice(1)) || 0)));

// Save `board` under its title. With an id that exists it updates that entry, otherwise adds one.
export function saveBoard(lib, board, id, now) {
    const at = now || Date.now();
    const name = (board.title || "Untitled board").slice(0, 60);
    if (id && lib.boards.some(b => b.id === id)) {
        return { id, lib: { boards: lib.boards.map(b => (b.id === id ? { ...b, name, updatedAt: at, board } : b)) } };
    }
    const nid = newId(lib);
    return { id: nid, lib: { boards: [{ id: nid, name, updatedAt: at, board }, ...lib.boards].slice(0, MAX_BOARDS) } };
}

export function duplicateBoard(lib, id, now) {
    const src = lib.boards.find(b => b.id === id);
    if (!src) return { id: null, lib };
    const board = { ...src.board, title: (src.name + " copy").slice(0, 60) };
    return saveBoard(lib, board, null, now);
}

export const deleteBoard = (lib, id) => ({ boards: lib.boards.filter(b => b.id !== id) });
export const sortedBoards = lib => [...lib.boards].sort((a, b) => b.updatedAt - a.updatedAt);

export function serializeLibrary(lib) {
    return JSON.stringify({ app: "playbook-library", v: 1, boards: lib.boards.map(b => ({ id: b.id, name: b.name, updatedAt: b.updatedAt, board: JSON.parse(serialize(b.board)) })) });
}

// Accepts the whole library file; broken boards are skipped, never the whole file.
export function parseLibrary(text) {
    let o;
    try { o = JSON.parse(text); } catch { return null; }
    if (!o || !["playbook-library", "calera-library"].includes(o.app) || !Array.isArray(o.boards)) return null;
    const boards = [];
    const used = new Set(o.boards.map(e => e && e.id).filter(i => typeof i === "string" && /^b\d+$/.test(i)));
    const seen = new Set();
    let next = 1 + Math.max(0, ...[...used].map(i => Number(i.slice(1))));
    for (const e of o.boards.slice(0, MAX_BOARDS)) {
        const board = e && parseBoard(JSON.stringify(e.board));
        if (!board) continue;
        // Keep a valid, unique id so links to a saved board stay put; give the rest a new one.
        const keep = typeof e.id === "string" && /^b\d+$/.test(e.id) && !seen.has(e.id);
        const id = keep ? e.id : "b" + next++;
        seen.add(id);
        boards.push({ id, name: String(e.name || board.title).slice(0, 60), updatedAt: Number.isFinite(e.updatedAt) ? e.updatedAt : 0, board });
    }
    return { boards };
}

// Put imported boards in front of what is already saved (new ids, nothing overwritten).
export function mergeLibrary(lib, incoming) {
    let out = lib;
    for (const b of [...incoming.boards].reverse()) out = saveBoard(out, b.board, null, b.updatedAt || undefined).lib;
    return out;
}

export function loadLibrary(text) {
    const parsed = text ? parseLibrary(text) : null;
    return parsed || emptyLibrary();
}
