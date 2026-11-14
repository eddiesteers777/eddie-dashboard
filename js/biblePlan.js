/* ==========================================
   Southbound — Bible in a year plan (pure)

   Our own simple plan: the 66 books in order, all 1,189 chapters spread over
   365 days (3 or 4 chapters a day). Only book and chapter references, no Bible
   text. "bible-plan" = { id: "year", start: "YYYY-MM-DD", read: { "12": [0,2] },
   log: { "YYYY-MM-DD": 12 }, lock: { date, day } }.
   Reading carries over: the day shown is the first one not finished, held
   steady for the calendar day (lock). Tests: tests/biblePlan.test.mjs.
========================================== */

export const BIBLE_PLAN_KEY = "bible-plan";
export const PLAN_DAYS = 365;

const BOOKS = [
    ["Genesis", 50], ["Exodus", 40], ["Leviticus", 27], ["Numbers", 36], ["Deuteronomy", 34], ["Joshua", 24], ["Judges", 21], ["Ruth", 4],
    ["1 Samuel", 31], ["2 Samuel", 24], ["1 Kings", 22], ["2 Kings", 25], ["1 Chronicles", 29], ["2 Chronicles", 36], ["Ezra", 10], ["Nehemiah", 13],
    ["Esther", 10], ["Job", 42], ["Psalm", 150], ["Proverbs", 31], ["Ecclesiastes", 12], ["Song of Solomon", 8], ["Isaiah", 66], ["Jeremiah", 52],
    ["Lamentations", 5], ["Ezekiel", 48], ["Daniel", 12], ["Hosea", 14], ["Joel", 3], ["Amos", 9], ["Obadiah", 1], ["Jonah", 4], ["Micah", 7],
    ["Nahum", 3], ["Habakkuk", 3], ["Zephaniah", 3], ["Haggai", 2], ["Zechariah", 14], ["Malachi", 4],
    ["Matthew", 28], ["Mark", 16], ["Luke", 24], ["John", 21], ["Acts", 28], ["Romans", 16], ["1 Corinthians", 16], ["2 Corinthians", 13],
    ["Galatians", 6], ["Ephesians", 6], ["Philippians", 4], ["Colossians", 4], ["1 Thessalonians", 5], ["2 Thessalonians", 3], ["1 Timothy", 6],
    ["2 Timothy", 4], ["Titus", 3], ["Philemon", 1], ["Hebrews", 13], ["James", 5], ["1 Peter", 5], ["2 Peter", 3], ["1 John", 5], ["2 John", 1],
    ["3 John", 1], ["Jude", 1], ["Revelation", 22]
];

export const TOTAL_CHAPTERS = BOOKS.reduce((n, b) => n + b[1], 0);

let cache = null;
/** 365 days; each day is a list of chapter references like "Genesis 1". */
export function planDays() {
    if (cache) return cache;
    const chapters = BOOKS.flatMap(([name, n]) => Array.from({ length: n }, (_, i) => `${name} ${i + 1}`));
    cache = Array.from({ length: PLAN_DAYS }, (_, d) => chapters.slice(Math.floor(d * chapters.length / PLAN_DAYS), Math.floor((d + 1) * chapters.length / PLAN_DAYS)));
    return cache;
}

export function startPlan(startKey) {
    return { id: "year", start: startKey, read: {}, log: {}, lock: null };
}

export function cleanPlan(saved) {
    if (!saved || saved.id !== "year" || !/^\d{4}-\d{2}-\d{2}$/.test(saved.start || "")) return null;
    return { id: "year", start: saved.start, read: saved.read && typeof saved.read === "object" ? saved.read : {}, log: saved.log && typeof saved.log === "object" ? saved.log : {}, lock: saved.lock || null };
}

export const chaptersOn = day => planDays()[day] || [];
export const readCount = (plan, day) => (plan.read?.[day] || []).length;
export const dayDone = (plan, day) => chaptersOn(day).length > 0 && readCount(plan, day) >= chaptersOn(day).length;

/** First day not finished (PLAN_DAYS when the whole year is read). */
export function firstOpenDay(plan) {
    for (let d = 0; d < PLAN_DAYS; d++) if (!dayDone(plan, d)) return d;
    return PLAN_DAYS;
}

/** The day to show on a calendar day: held steady all day, then moves on to the first open one. */
export function dayFor(plan, today) {
    if (plan.lock && plan.lock.date === today) return plan.lock.day;
    return Math.min(firstOpenDay(plan), PLAN_DAYS - 1);
}

const dayNumber = key => Math.floor(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400000);

/** Plan days a person would be on by calendar (0 on the start date). */
export const expectedDay = (plan, today) => Math.max(0, dayNumber(today) - dayNumber(plan.start));
export const daysBehind = (plan, today, day) => Math.max(0, expectedDay(plan, today) - day);

/** Lock the shown day for this calendar day; returns a new plan. */
export function withLock(plan, today) {
    const day = dayFor(plan, today);
    return plan.lock && plan.lock.date === today && plan.lock.day === day ? plan : { ...plan, lock: { date: today, day } };
}

/** Flip one chapter; keeps the log (which calendar day finished which plan day) in step. */
export function toggleChapter(plan, today, day, index) {
    const cur = new Set(plan.read?.[day] || []);
    if (cur.has(index)) cur.delete(index); else cur.add(index);
    const read = { ...plan.read }, log = { ...plan.log };
    if (cur.size) read[day] = [...cur].sort((a, b) => a - b); else delete read[day];
    const next = { ...plan, read, log };
    if (dayDone(next, day)) next.log[today] = day; else if (next.log[today] === day) delete next.log[today];
    return next;
}

/** Monday to Sunday of the week holding `today`: { key, label, state: "done" | "today" | "open" | "ahead" }. */
export function weekStrip(plan, today) {
    const base = new Date(`${today}T12:00:00`);
    const monday = new Date(base); monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const state = key === today ? "today" : plan.log?.[key] !== undefined ? "done" : key > today ? "ahead" : "open";
        return { key, label: "MTWTFSS"[i], date: d.getDate(), state, done: plan.log?.[key] !== undefined };
    });
}
