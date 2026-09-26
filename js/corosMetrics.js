/* ==========================================
   Southbound — COROS fitness numbers for Analytics (pure)

   Reads the three COROS replies Analytics asks for (training load,
   recovery, fitness assessment) into the numbers its cards show. COROS
   answers in text (see js/corosParse.js) or JSON, and the exact wording
   of these three hasn't been seen yet, so each number is found by its
   label anywhere in the reply ("Load Ratio: 1.18", "vo2Max": 58.2,
   "Marathon: 3:05:12"...). When a reply lists several days, the newest
   day wins. Whatever isn't found stays "—", and the COROS diagnostic
   can copy the replies so the wording can be matched.
   Unit-tested in tests/corosMetrics.test.mjs.
========================================== */

// Any reply -> searchable text (JSON is printed one key per line).
export function replyText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value.text === "string" && Object.keys(value).length === 1) return value.text;
    try { return JSON.stringify(value, null, 1); } catch { return String(value); }
}

// A list of days -> only the newest day's part (dates as yyyy-mm-dd or yyyyMMdd).
function newestPart(text) {
    const re = /\b(20\d{2})-?(\d{2})-?(\d{2})\b/g;
    const hits = [];
    let m;
    while ((m = re.exec(text))) hits.push({ at: m.index, key: `${m[1]}${m[2]}${m[3]}` });
    const days = new Set(hits.map(h => h.key));
    if (days.size < 2) return text;
    const newest = [...days].sort().pop();
    const start = hits.find(h => h.key === newest).at;
    const next = hits.find(h => h.at > start && h.key !== newest);
    const lineStart = text.lastIndexOf("\n", start) + 1;
    return text.slice(lineStart, next ? text.lastIndexOf("\n", next.at) + 1 || next.at : undefined);
}

const number = (text, re) => {
    const m = text.match(re);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) ? n : null;
};
const LABEL_GAP = String.raw`[^\d\n]{0,24}?`;

export function readLoad(value) {
    const text = newestPart(replyText(value));
    const short = number(text, new RegExp(String.raw`short[\s_-]*term[\s_-]*(?:training[\s_-]*)?load` + LABEL_GAP + String.raw`(\d+(?:\.\d+)?)`, "i"))
        ?? number(text, new RegExp(String.raw`acute[\s_-]*(?:training[\s_-]*)?load` + LABEL_GAP + String.raw`(\d+(?:\.\d+)?)`, "i"));
    const long = number(text, new RegExp(String.raw`long[\s_-]*term[\s_-]*(?:training[\s_-]*)?load` + LABEL_GAP + String.raw`(\d+(?:\.\d+)?)`, "i"))
        ?? number(text, new RegExp(String.raw`(?:chronic[\s_-]*(?:training[\s_-]*)?load|base[\s_-]*fitness)` + LABEL_GAP + String.raw`(\d+(?:\.\d+)?)`, "i"));
    const ratio = number(text, new RegExp(String.raw`load[\s_-]*ratio` + LABEL_GAP + String.raw`(\d+(?:\.\d+)?)`, "i"));
    const comment = (text.match(/(?:comment|status|assessment)"?\s*[:=]\s*"?([A-Za-z][^"\n|]{2,120})/i)?.[1] || "").trim();
    return { short, long, ratio, comment };
}

export function readRecovery(value) {
    const text = newestPart(replyText(value));
    const percent = number(text, new RegExp(String.raw`recover\w*` + String.raw`[^\d\n]{0,30}?(\d{1,3}(?:\.\d+)?)\s*%`, "i"))
        ?? number(text, new RegExp(String.raw`recovery[\s_-]*(?:percent\w*|rate|score|pct|value)` + LABEL_GAP + String.raw`(\d{1,3}(?:\.\d+)?)`, "i"));
    const status = (text.match(/(?:recovery[\s_-]*)?(?:status|state|level)"?\s*[:=]\s*"?([A-Za-z][^"\n|,]{1,60})/i)?.[1] || "").trim();
    const hours = number(text, /(\d{1,3})\s*(?:h\b|hrs?\b|hours?)[^\n]{0,20}(?:to|until|left|remaining)?[^\n]{0,20}recover/i)
        ?? number(text, new RegExp(String.raw`(?:full[\s_-]*)?recovery[\s_-]*(?:time|hours)` + LABEL_GAP + String.raw`(\d{1,3})`, "i"));
    return { percent: percent != null && percent <= 100 ? percent : null, status, hours };
}

export function readFitness(value) {
    const text = replyText(value);
    const vo2 = number(text, new RegExp(String.raw`vo[2₂][\s_-]*max` + LABEL_GAP + String.raw`(\d{2}(?:\.\d+)?)`, "i"));
    let marathon = null;
    const clock = text.match(/(?<!half[\s_-]?)marathon[^\n]{0,60}?(\d{1,2}:\d{2}:\d{2})/i);
    if (clock) marathon = clock[1];
    else {
        const secs = number(text, /(?<!half[\s_-]?)marathon\w*"?\s*[:=]\s*"?(\d{4,5})\b/i);
        if (secs && secs > 5400 && secs < 36000) marathon = clockText(secs);
    }
    // Threshold pace, shown per mile like the rest of the app.
    let threshold = "";
    const pace = text.match(/threshold[\s_-]*pace[^\d\n]{0,20}?(\d{1,2}):(\d{2})\s*\/\s*(km|mi)/i);
    if (pace) {
        const secs = Number(pace[1]) * 60 + Number(pace[2]);
        threshold = `${clockText(pace[3].toLowerCase() === "km" ? secs * 1.609344 : secs)}/mi`;
    }
    return { vo2, marathon, threshold };
}

export function clockText(seconds) {
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

// Normalized runs (js/corosParse.js normalizeActivity) -> rows for "Recent COROS Runs", newest first.
export function recentRunRows(activities, limit = 10) {
    return (activities || [])
        .filter(a => a && Number(a.distance) > 0)
        .sort((a, b) => String(b.startTime || b.date || "").localeCompare(String(a.startTime || a.date || "")))
        .slice(0, limit)
        .map(a => {
            const miles = Number(a.distance) / 1609.344;
            const when = a.date ? new Date(`${a.date}T12:00:00`) : null;
            return {
                id: String(a.labelId || ""),
                name: a.name || a.sport || "Run",
                when: when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "",
                miles: `${miles.toFixed(miles < 10 ? 2 : 1)} mi`,
                time: Number(a.duration) > 0 ? clockText(a.duration) : "",
                pace: Number(a.pace_seconds_per_mile) > 0 ? `${clockText(a.pace_seconds_per_mile)}/mi` : "",
                hr: Number(a.avgHr) > 0 ? `${Math.round(a.avgHr)} bpm` : ""
            };
        });
}
