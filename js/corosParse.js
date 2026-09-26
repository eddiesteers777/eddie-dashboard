/* ==========================================
   Southbound — reading COROS's replies (pure)

   COROS's connection answers a tool call with "content": either JSON
   (as structured content or as text) or plain "Key: value" text blocks.
   Where the list of activities sits has varied (activities, records,
   data, a bare list, one level deeper...), and missing it silently
   showed "no activities" to someone who runs every day. So:
     - findRecords() looks for the activity list wherever it is
     - describeShape() says what a reply looked like, for the COROS
       diagnostic when the list really is empty
   Unit-tested in tests/corosParse.test.mjs.
========================================== */

// What an activity has (any one is enough).
const ACTIVITY_KEYS = /^(labelid|label_id|activityid|activity_id|sporttype|sport_type|sporttypecode|starttime|start_time|startdate|start_date|distance|distancemeters|distance_meters|totaltime|duration)$/i;
const looksLikeActivity = x => x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).some(k => ACTIVITY_KEYS.test(k));

// The tool result -> the value inside it (structured content, JSON text, or text).
export function unwrapResult(result) {
    if (!result) return null;
    if (result.structuredContent) return result.structuredContent;
    if (Array.isArray(result.content)) {
        for (const item of result.content) {
            if (item?.json) return item.json;
            if (typeof item?.text === "string") {
                try { return JSON.parse(item.text); } catch { return { text: item.text }; }
            }
        }
    }
    return result;
}

// Text replies -> objects. COROS writes its list of runs as text:
//   1. Outdoor Run — 2026-09-26
//      Location: 19 mile long run
//      Time Window: startTimestamp=1790420165 | endTimestamp=1790429021
//      Duration: 2:24:52 | Distance: 30.61 km
//      LabelId: 480614647400005733 | SportType: 100
// (its real layout, 2026-09-26). Also read: bullets / **bold** / headings,
// several pairs on one line ("|" or ","), key=value pairs, markdown tables.
// A run starts at a heading ("1. Outdoor Run — date"), when a key
// repeats, or after a blank line; every pair in between belongs to it.
const keyOf = k => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const PAIR = /^([A-Za-z][A-Za-z0-9 _()/-]{0,40}):\s*(.*)$/;
const EQ_PAIR = /^([A-Za-z][A-Za-z0-9_]{0,40})=(.*)$/;
const DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

function parseTable(lines) {
    const rows = lines.filter(l => /^\s*\|.*\|\s*$/.test(l));
    if (rows.length < 2) return [];
    const cells = l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
    const head = cells(rows[0]).map(keyOf);
    return rows.slice(1)
        .filter(r => !/^\s*\|?\s*:?-{2,}/.test(r))
        .map(r => { const c = cells(r); const o = {}; head.forEach((h, i) => { if (h) o[h] = c[i] ?? ""; }); return o; });
}

// One line -> [[key, value], ...], or null when it isn't "Key: value" text.
function linePairs(line) {
    const parts = line.split(/\s*[,;|]\s*(?=[A-Za-z][A-Za-z0-9 _()/-]{0,40}(?::\s|=))/);
    const pairs = [];
    for (const part of parts) {
        const m = part.match(PAIR) || part.match(EQ_PAIR);
        if (!m) return pairs.length ? pairs : null;
        let [k, v] = [m[1], m[2].trim()];
        const inner = v.match(EQ_PAIR);                  // "Time Window: startTimestamp=1790420165"
        if (inner) [k, v] = [inner[1], inner[2].trim()];
        if (v) pairs.push([keyOf(k), v]);
    }
    return pairs.length ? pairs : null;
}

function parseTextBlocks(text) {
    const lines = String(text).split(/\r?\n/);
    const table = parseTable(lines).filter(looksLikeActivity);
    if (table.length) return table;
    const items = [];
    let cur = null;
    const flush = () => { if (cur && Object.keys(cur).length) items.push(cur); cur = null; };
    for (const raw of lines) {
        const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\*\*|__/g, "").replace(/^#+\s*/, "").trim();
        if (!line) { if (cur && looksLikeActivity(cur)) flush(); continue; }
        const pairs = linePairs(line);
        if (!pairs) {
            // A heading. "Outdoor Run — 2026-09-26" starts a run and says what and when.
            if (cur && looksLikeActivity(cur)) flush();
            const date = line.match(DATE);
            cur = date && !/\bto\b/i.test(line)
                ? { title: line.split(/\s+[—–-]\s+/)[0].trim(), date: date[1] }
                : null;
            continue;
        }
        for (const [k, v] of pairs) {
            if (!cur) cur = {};
            if (k in cur && looksLikeActivity(cur)) flush(), cur = {};
            cur[k] = v;
        }
    }
    flush();
    return items.filter(looksLikeActivity);
}

// The activity list, wherever it is (searches a few levels down).
export function findRecords(value, depth = 0) {
    if (value == null || depth > 4) return [];
    if (Array.isArray(value)) {
        if (value.some(looksLikeActivity)) return value.filter(v => v && typeof v === "object");
        for (const v of value) { const found = findRecords(v, depth + 1); if (found.length) return found; }
        return [];
    }
    if (typeof value === "string") {
        try { return findRecords(JSON.parse(value), depth + 1); } catch { return parseTextBlocks(value); }
    }
    if (typeof value !== "object") return [];
    for (const key of ["activities", "records", "list", "data", "items", "result", "sportRecords", "dataList"]) {
        if (key in value) { const found = findRecords(value[key], depth + 1); if (found.length) return found; }
    }
    for (const [key, v] of Object.entries(value)) {
        if (key === "text" && typeof v === "string") { const found = findRecords(v, depth + 1); if (found.length) return found; }
        else if (v && typeof v === "object") { const found = findRecords(v, depth + 1); if (found.length) return found; }
    }
    return [];
}

// "2:24:52" / "35:20" / "1h 5m" / 3120 -> seconds (null when unreadable).
export function durationSeconds(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value).trim();
    const clock = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?/);
    if (clock) {
        const [a, b, c] = clock.slice(1).map(Number);
        return clock[3] != null ? a * 3600 + b * 60 + c : a * 60 + b;
    }
    const hms = text.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s)?/i);
    if (hms && (hms[1] || hms[2] || hms[3])) return (+hms[1] || 0) * 3600 + (+hms[2] || 0) * 60 + (+hms[3] || 0);
    const n = parseFloat(text);
    return Number.isFinite(n) ? n : null;
}

// "30.61 km" / "679 m" / "5 mi" / 8046 -> meters.
export function distanceMeters(value, unitHint = "") {
    const text = String(value ?? "").trim().toLowerCase();
    const n = parseFloat(text.replace(/,/g, ""));
    if (!Number.isFinite(n)) return 0;
    const unit = String(unitHint).toLowerCase() || (text.match(/[a-z]+$/)?.[0] ?? "");
    if (/^mi/.test(unit) || unit.includes("mile")) return n * 1609.344;
    if (/^(km|kilomet)/.test(unit)) return n * 1000;
    return n;
}

const pick = (a, ...keys) => { for (const k of keys) if (a?.[k] != null && a[k] !== "") return a[k]; return null; };
const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * One COROS activity (from JSON or from text) -> the same record with
 * plain, ready-to-use fields added, so every page reads it the same way:
 * labelId, sportType (number), sport ("Outdoor Run"), name, startTime (ISO),
 * date (local yyyy-mm-dd), distance / distanceMeters (meters), duration /
 * durationSeconds (seconds), pace_seconds_per_mile, avgHr, calories.
 */
export function normalizeActivity(a) {
    if (!a || typeof a !== "object") return a;
    const out = { ...a };

    const id = pick(a, "labelId", "label_id", "labelid", "activityId", "activityid", "activity_id", "id");
    if (id != null) out.labelId = String(id);

    const code = Number(pick(a, "sportType", "sport_type", "sporttype", "sportTypeCode", "sport_type_code"));
    if (Number.isFinite(code)) out.sportType = code;
    const sport = pick(a, "sport", "sportName", "sport_name", "title");
    if (sport) out.sport = String(sport);
    const name = pick(a, "name", "activity_name", "location", "title");
    if (name) out.name = String(name);

    // When: a unix timestamp beats a bare date (a bare date read as UTC shifts a day in the US).
    let when = null;
    const stamp = pick(a, "starttimestamp", "startTimestamp", "start_timestamp");
    const start = stamp ?? pick(a, "startTime", "start_time", "starttime", "startDate", "start_date", "startdate");
    if (start != null) {
        const n = Number(start);
        if (Number.isFinite(n) && n > 1e8) when = new Date(n < 1e11 ? n * 1000 : n);
        else if (/^\d{8}$/.test(String(start))) when = new Date(`${String(start).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}T12:00:00`);
        else if (/^\d{4}-\d{2}-\d{2}$/.test(String(start))) when = new Date(`${start}T12:00:00`);
        else when = new Date(String(start));
    }
    if ((!when || Number.isNaN(when.getTime())) && a.date && DATE.test(String(a.date))) when = new Date(`${String(a.date).match(DATE)[1]}T12:00:00`);
    if (when && !Number.isNaN(when.getTime())) {
        out.startTime = out.start_time = when.toISOString();
        out.date = localDay(when);
    }

    const rawDistance = pick(a, "distanceMeters", "distance_meters", "distancemeters", "distance");
    if (rawDistance != null) {
        const meters = Math.round(distanceMeters(rawDistance, pick(a, "distanceUnit", "distance_unit") || "") * 10) / 10;
        out.distance = out.distanceMeters = out.distance_meters = meters;
        delete out.distanceUnit; delete out.distance_unit;
    }

    const secs = durationSeconds(pick(a, "durationSeconds", "duration_seconds", "duration", "totalTime", "total_time", "totaltime"));
    if (secs != null) out.duration = out.durationSeconds = out.duration_seconds = secs;

    const pacePerKm = durationSeconds(String(pick(a, "average_pace", "averagePace", "avg_pace") ?? "").replace(/\s*\/\s*km.*$/i, ""));
    if (pacePerKm && /km/i.test(String(pick(a, "average_pace", "averagePace", "avg_pace")))) out.pace_seconds_per_mile = Math.round(pacePerKm * 1.609344);
    else if (out.distance > 0 && out.duration > 0) out.pace_seconds_per_mile = Math.round(out.duration / (out.distance / 1609.344));

    const hr = parseFloat(pick(a, "avg_hr", "avgHr", "averageHr", "average_heart_rate", "avgHeartRate"));
    if (Number.isFinite(hr)) out.avgHr = hr;
    const cal = parseFloat(String(pick(a, "calories", "calorie") ?? "").replace(/,/g, ""));
    if (Number.isFinite(cal)) out.calories = cal;
    return out;
}

// A short picture of a reply: object{code,message,data{list[0]}}.
export function describeShape(value, depth = 0) {
    if (value == null) return "nothing";
    if (Array.isArray(value)) return `list[${value.length}]${value.length && depth < 2 ? ` of ${describeShape(value[0], depth + 1)}` : ""}`;
    if (typeof value === "string") return `text "${value.replace(/\s+/g, " ").trim().slice(0, 80)}${value.length > 80 ? "…" : ""}"`;
    if (typeof value !== "object") return typeof value;
    const keys = Object.keys(value).slice(0, 8);
    if (depth >= 2) return `{${keys.join(",")}}`;
    return `{${keys.map(k => (value[k] && typeof value[k] === "object") || typeof value[k] === "string" && value[k].length > 30 ? `${k}: ${describeShape(value[k], depth + 1)}` : k).join(", ")}}`;
}
