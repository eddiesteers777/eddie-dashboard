/* ==========================================
   Southbound — the water sheet's numbers (pure)

   Water lives where the Nutrition page already keeps it: the day record
   "nutrition-YYYY-MM-DD" has `water` (oz). The sheet adds `waterLog`
   ([{ t: "HH:MM", oz }]) so each drink can be pinned on the jug. If the
   Nutrition page changes the total by hand, the log is reconciled to it
   (an "earlier" drink with no time fills a gap; extra entries are trimmed).
   Unit-tested in tests/waterModel.test.mjs.
========================================== */

export const PRESETS = Object.freeze([
    { oz: 8, label: "sip" }, { oz: 12, label: "glass" }, { oz: 16, label: "half bottle" }, { oz: 24, label: "my bottle", main: true }
]);
export const DAY_START = 7 * 60;   // an even day runs 7 am to 9 pm
export const DAY_END = 21 * 60;
export const MAX_ADD = 200;
export const MAX_TOTAL = 600;

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The nutrition key the Nutrition page uses for a moment (it keys by the UTC date). */
export function nutritionKey(date = new Date()) { return "nutrition-" + date.toISOString().split("T")[0]; }

export function minutesOf(date = new Date()) { return date.getHours() * 60 + date.getMinutes(); }
export function clock(date = new Date()) { return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }

/** "6:40 am" from "06:40". */
export function timeText(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ""));
    if (!m) return "";
    const h = Number(m[1]), ap = h >= 12 ? "pm" : "am";
    return `${h % 12 || 12}:${m[2]} ${ap}`;
}

/** { total, log } for a day record, with the log reconciled to the total. */
export function readWater(day) {
    const total = Math.max(0, Math.round(num(day?.water)));
    let log = (Array.isArray(day?.waterLog) ? day.waterLog : [])
        .map(e => ({ t: typeof e?.t === "string" ? e.t : null, oz: Math.round(num(e?.oz)) }))
        .filter(e => e.oz > 0);
    let sum = log.reduce((s, e) => s + e.oz, 0);
    while (sum > total && log.length) { sum -= log[log.length - 1].oz; log = log.slice(0, -1); }
    if (total > sum) log = [{ t: null, oz: total - sum }, ...log];
    return { total, log };
}

/** A new day record with a drink added (null when the amount isn't usable). */
export function addWater(day, oz, at = "") {
    const amount = Math.round(num(oz));
    if (!(amount > 0) || amount > MAX_ADD) return null;
    const { total, log } = readWater(day);
    if (total + amount > MAX_TOTAL) return null;
    return { ...day, water: total + amount, waterLog: [...log, { t: at || null, oz: amount }] };
}

/** A new day record without the latest drink (null when there is none). */
export function undoLast(day) {
    const { log } = readWater(day);
    if (!log.length) return null;
    const rest = log.slice(0, -1);
    return { ...day, water: rest.reduce((s, e) => s + e.oz, 0), waterLog: rest };
}

/** Running level after each drink: [{ t, oz, level }]. */
export function pins(log) {
    let level = 0;
    return log.map(e => ({ ...e, level: (level += e.oz) }));
}

/** Ounces an even day (7 am to 9 pm) puts you at by this minute of the day. */
export function paceOz(goal, minutes) {
    const f = Math.min(1, Math.max(0, (minutes - DAY_START) / (DAY_END - DAY_START)));
    return Math.round(goal * f);
}

/** The next 3-hour mark ahead of now, and the ounces that keep you on pace there (null once done or after 9 pm). */
export function nextTip(total, goal, minutes) {
    if (total >= goal) return null;
    const mark = [9, 12, 15, 18, 21].map(h => h * 60).find(m => m > minutes);
    if (!mark) return { oz: goal - total, byText: "tonight" };
    const need = Math.max(0, paceOz(goal, mark) - total);
    const oz = Math.max(4, Math.ceil(need / 4) * 4);
    const h = mark / 60;
    return { oz, byText: `${h % 12 || 12} ${h >= 12 ? "pm" : "am"}` };
}
