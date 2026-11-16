/* ==========================================
   Southbound — Bible notes, verse to carry, book map (pure)

   Only references and the person's own words are stored, never Bible text
   (the ESV is licensed, so the app links out to esv.org instead).
   "bible-note-<id>" = { id, ref, date, says, does, updatedAt } (one key per note, like prayer requests).
   "bible-carry" = { ref, words, date }: the verse to carry, shown on Today on that date.
   Tests: tests/bibleNotes.test.mjs.
========================================== */

import { BOOKS, planDays } from "./biblePlan.js";

export const NOTE_PREFIX = "bible-note-";
export const CARRY_KEY = "bible-carry";

const trim = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
let counter = 0;
const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const keyFor = id => NOTE_PREFIX + id;

/** "Luke 8, Psalm 46" for a list of chapters. */
export const refLabel = chapters => (chapters || []).join(", ");

/** The book a reference starts with: "1 Samuel 3:4" -> "1 Samuel", "Psalm 46" -> "Psalm". */
export function bookOf(ref) {
    const s = String(ref || "").trim();
    const hit = BOOKS.map(b => b[0]).filter(n => s.toLowerCase().startsWith(n.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    return hit || "";
}

export function newNote({ ref, says, does }, today) {
    const r = trim(ref, 80), s = trim(says, 400), d = trim(does, 400);
    if (!r || (!s && !d)) return null;
    return { id: newId(), ref: r, date: today, says: s, does: d, updatedAt: Date.now() };
}
export function cleanNote(saved) {
    if (!saved || saved.deleted || typeof saved.id !== "string" || typeof saved.ref !== "string" || !saved.ref.trim()) return null;
    return { id: saved.id, ref: trim(saved.ref, 80), date: /^\d{4}-\d{2}-\d{2}$/.test(saved.date || "") ? saved.date : "", says: trim(saved.says, 400), does: trim(saved.does, 400), updatedAt: Number(saved.updatedAt) || 0 };
}
export const editNote = (n, { says, does }) => ({ ...n, says: trim(says, 400), does: trim(does, 400), updatedAt: Date.now() });
export const tombstone = n => ({ id: n.id, deleted: true, updatedAt: Date.now() });

export function loadNotes(storage) {
    const out = [];
    for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!k || !k.startsWith(NOTE_PREFIX)) continue;
        try { const n = cleanNote(JSON.parse(storage.getItem(k))); if (n) out.push(n); } catch { /* skip */ }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

/** Notes matching a search (words in the reference or either answer) and an optional book. */
export function filterNotes(notes, query = "", book = "") {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return notes.filter(n => (!book || bookOf(n.ref) === book) && words.every(w => `${n.ref} ${n.says} ${n.does}`.toLowerCase().includes(w)));
}
/** Books that have notes, in Bible order, with counts. */
export function noteBooks(notes) {
    const counts = new Map();
    for (const n of notes) { const b = bookOf(n.ref); if (b) counts.set(b, (counts.get(b) || 0) + 1); }
    return BOOKS.map(b => b[0]).filter(b => counts.has(b)).map(b => ({ book: b, count: counts.get(b) }));
}

export function cleanCarry(saved) {
    if (!saved || typeof saved.ref !== "string" || !saved.ref.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(saved.date || "")) return null;
    return { ref: trim(saved.ref, 60), words: trim(saved.words, 200), date: saved.date };
}
/** The verse to show on Today: only on the day it was picked. */
export const carryFor = (saved, today) => { const c = cleanCarry(saved); return c && c.date === today ? c : null; };

/** The link to read a reference on esv.org (a link out only, no text is copied). */
export const esvUrl = ref => `https://www.esv.org/${encodeURIComponent(String(ref).trim()).replace(/%20/g, "+")}/`;

/** One entry per book: chapters read (from the plan's check-offs) of the book's total. */
export function bookProgress(plan) {
    const read = new Map();
    if (plan) {
        const days = planDays(plan.id);
        for (const [day, idxs] of Object.entries(plan.read || {})) for (const i of idxs) {
            const ch = days[Number(day)]?.[i]; if (!ch) continue;
            read.set(ch.slice(0, ch.lastIndexOf(" ")), (read.get(ch.slice(0, ch.lastIndexOf(" "))) || 0) + 1);
        }
    }
    return BOOKS.map(([name, total]) => { const n = Math.min(total, read.get(name) || 0); return { name, total, read: n, done: n >= total, started: n > 0 }; });
}

const ABBR = { Judges: "Jdg", Jude: "Jude", Philippians: "Php", Philemon: "Phm", "Song of Solomon": "Son", Psalm: "Psa" };
export const bookAbbr = name => ABBR[name] || name.replace(/\s+/g, "").slice(0, 3);
