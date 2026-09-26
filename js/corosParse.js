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

// Text replies -> objects. COROS may write a list of runs as text:
// "Key: value" lines, with or without bullets / numbers / **bold**,
// one run per block, all on one line ("Date: ..., Distance: ..."), or
// as a markdown table. A new run starts when a key repeats, after a
// blank line or a heading, or on a table row.
const keyOf = k => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const PAIR = /^([A-Za-z][A-Za-z0-9 _()/-]{0,40}):\s*(.*)$/;

function parseTable(lines) {
    const rows = lines.filter(l => /^\s*\|.*\|\s*$/.test(l));
    if (rows.length < 2) return [];
    const cells = l => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
    const head = cells(rows[0]).map(keyOf);
    return rows.slice(1)
        .filter(r => !/^\s*\|?\s*:?-{2,}/.test(r))
        .map(r => { const c = cells(r); const o = {}; head.forEach((h, i) => { if (h) o[h] = c[i] ?? ""; }); return o; });
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
        // Several "Key: value" pairs on one line = one run.
        const parts = line.split(/\s*[,;|]\s*(?=[A-Za-z][A-Za-z0-9 _()/-]{0,40}:\s)/);
        if (parts.length > 1 && parts.every(p => PAIR.test(p))) {
            flush();
            cur = {};
            for (const p of parts) { const m = p.match(PAIR); cur[keyOf(m[1])] = m[2].trim(); }
            flush();
            continue;
        }
        const m = line.match(PAIR);
        if (!m || !m[2]) { if (cur && looksLikeActivity(cur)) flush(); continue; }  // a heading
        const k = keyOf(m[1]);
        if (!cur) cur = {};
        if (k in cur) { flush(); cur = {}; }
        cur[k] = m[2].trim();
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
