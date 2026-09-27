/* ==========================================
   Southbound — FIT file reader (pure, no library)

   FIT is the file a watch records (COROS, Garmin, Wahoo…) and the
   original upload Strava keeps in its archive (activities/123.fit.gz).
   readFit(bytes) -> one activity:
     { sport, subSport, startSec (Unix), start (ISO), offsetMin (local time
       vs UTC, from the watch), localDate, distance (m), duration (moving
       / timer s), elapsed (s), avgHr, maxHr, ascent, calories,
       manufacturer, product, laps: [{ i, m, s, hr, intensity }],
       best: { mile, k5, k10, half, full } fastest efforts in seconds (runs) }
   Only the messages Southbound uses are kept (file_id, record distance +
   time, lap, session, activity); GPS positions are read past and never kept.
   Unit-tested in tests/fitParse.test.mjs.
========================================== */

export const FIT_EPOCH = 631065600;          // 1989-12-31T00:00:00Z in Unix seconds
export const EFFORTS = { mile: 1609.344, k5: 5000, k10: 10000, half: 21097.5, full: 42195 };
const MAX_SPEED = 9;                          // m/s (2:59/mi): faster jumps are GPS glitches

// base type -> [bytes, kind, invalid value]
const BASE = {
    0x00: [1, "u", 0xFF], 0x01: [1, "s", 0x7F], 0x02: [1, "u", 0xFF], 0x0A: [1, "u", 0], 0x0D: [1, "b"],
    0x83: [2, "s", 0x7FFF], 0x84: [2, "u", 0xFFFF], 0x8B: [2, "u", 0],
    0x85: [4, "s", 0x7FFFFFFF], 0x86: [4, "u", 0xFFFFFFFF], 0x8C: [4, "u", 0], 0x88: [4, "f"],
    0x89: [8, "f"], 0x8E: [8, "b"], 0x8F: [8, "b"], 0x90: [8, "b"], 0x07: [1, "str"]
};
// Global messages and the fields kept from each.
const KEEP = {
    0: [1, 2],                                        // file_id: manufacturer, product
    18: [2, 5, 6, 7, 8, 9, 11, 16, 17, 22, 253],      // session
    19: [2, 7, 8, 9, 15, 23, 253],                    // lap
    20: [5, 253],                                     // record: distance, timestamp
    34: [5, 253]                                      // activity: local_timestamp, timestamp
};

function readValue(dv, p, size, type, le) {
    const [bytes, kind, invalid] = BASE[type] || [1, "b"];
    if (size !== bytes || kind === "b" || kind === "str") return null;
    let v;
    if (bytes === 1) v = kind === "s" ? dv.getInt8(p) : dv.getUint8(p);
    else if (bytes === 2) v = kind === "s" ? dv.getInt16(p, le) : dv.getUint16(p, le);
    else if (bytes === 4) v = kind === "f" ? dv.getFloat32(p, le) : kind === "s" ? dv.getInt32(p, le) : dv.getUint32(p, le);
    else v = dv.getFloat64(p, le);
    return v === invalid || Number.isNaN(v) ? null : v;
}

/** Walks every FIT message (chained files too) and calls onMessage(global, fields) for the kept ones. */
function walk(bytes, onMessage) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 12) throw new Error("Not a FIT file");
    let start = 0;
    while (start + 12 <= bytes.length) {
        const headerSize = bytes[start];
        if ((headerSize !== 12 && headerSize !== 14) || String.fromCharCode(...bytes.subarray(start + 8, start + 12)) !== ".FIT") {
            if (start === 0) throw new Error("Not a FIT file");
            break;
        }
        const end = Math.min(bytes.length, start + headerSize + dv.getUint32(start + 4, true));
        const defs = {};
        let p = start + headerSize, lastTime = null;
        while (p < end) {
            const h = bytes[p++];
            let local, compressedTime = null;
            if (h & 0x80) {                                   // compressed timestamp header
                local = (h >> 5) & 3;
                const off = h & 0x1F;
                if (lastTime != null) { compressedTime = (lastTime & ~0x1F) + off; if (off < (lastTime & 0x1F)) compressedTime += 0x20; lastTime = compressedTime; }
            } else if (h & 0x40) {                            // definition
                local = h & 0x0F;
                const le = bytes[p + 1] === 0;
                const global = le ? dv.getUint16(p + 2, true) : dv.getUint16(p + 2, false);
                const n = bytes[p + 4];
                p += 5;
                const fields = [];
                for (let i = 0; i < n; i++, p += 3) fields.push([bytes[p], bytes[p + 1], bytes[p + 2]]);
                let devSize = 0;
                if (h & 0x20) { const dn = bytes[p++]; for (let i = 0; i < dn; i++, p += 3) devSize += bytes[p + 1]; }
                defs[local] = { global, le, fields, devSize, size: fields.reduce((t, f) => t + f[1], 0) };
                continue;
            } else local = h & 0x0F;
            const def = defs[local];
            if (!def) throw new Error("FIT data before its definition");
            const keep = KEEP[def.global];
            if (keep) {
                const msg = {};
                let q = p;
                for (const [num, size, type] of def.fields) {
                    if (keep.includes(num)) msg[num] = readValue(dv, q, size, type, def.le);
                    q += size;
                }
                if (msg[253] != null) lastTime = msg[253];
                else if (compressedTime != null) msg[253] = compressedTime;
                onMessage(def.global, msg);
            } else {
                // Other messages can still carry the timestamp that compressed headers count from.
                let q = p;
                for (const [num, size, type] of def.fields) { if (num === 253) { const t = readValue(dv, q, size, type, def.le); if (t != null) lastTime = t; } q += size; }
            }
            p += def.size + def.devSize;
        }
        start = end + 2;                                      // skip the file CRC
    }
}

const pad = n => String(n).padStart(2, "0");
const dateOf = unixSec => { const d = new Date(unixSec * 1000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

/**
 * Fastest time (s) to cover each distance anywhere in the run, from the
 * record stream [{ t, d }] (seconds, meters). Linear in the stream length.
 */
export function bestEfforts(points, targets = EFFORTS) {
    // Clean: distance never goes backwards; a jump faster than MAX_SPEED is dropped.
    const t = [], d = [];
    let drop = 0, prev = null;
    for (const pt of points) {
        if (pt.t == null || pt.d == null) continue;
        if (prev) {
            const dt = pt.t - prev.t, dd = pt.d - prev.d;
            if (dt <= 0) continue;
            if (dd < 0) { drop += dd; }
            else if (dd / dt > MAX_SPEED) drop += dd;
        }
        prev = pt;
        const clean = pt.d - drop;
        t.push(pt.t);
        d.push(d.length ? Math.max(d[d.length - 1], clean) : clean);
    }
    const out = {};
    for (const [key, D] of Object.entries(targets)) {
        if (!d.length || d[d.length - 1] - d[0] < D) { out[key] = null; continue; }
        let best = Infinity, i = 0;
        for (let j = 1; j < d.length; j++) {
            while (i + 1 < j && d[j] - d[i + 1] >= D) i++;
            if (d[j] - d[i] < D) continue;
            // Start partway through segment i -> i+1 so the effort is exactly D.
            const extra = d[j] - d[i] - D;
            const seg = d[i + 1] - d[i];
            const startT = seg > 0 ? t[i] + Math.min(1, extra / seg) * (t[i + 1] - t[i]) : t[i];
            best = Math.min(best, t[j] - startT);
        }
        out[key] = Number.isFinite(best) ? Math.round(best) : null;
    }
    return out;
}

/** FIT bytes (Uint8Array) -> the activity, or throws when it isn't a readable FIT file. */
export function readFit(bytes) {
    let fileId = null, activity = null;
    const sessions = [], laps = [], points = [];
    walk(bytes, (global, m) => {
        if (global === 0 && !fileId) fileId = m;
        else if (global === 18) sessions.push(m);
        else if (global === 19) laps.push(m);
        else if (global === 20) { if (m[5] != null && m[253] != null) points.push({ t: m[253], d: m[5] / 100 }); }
        else if (global === 34) activity = m;
    });
    if (!sessions.length && !points.length) throw new Error("No activity in this FIT file");
    // One activity per file; a multisport file is read by its biggest session.
    const s = sessions.slice().sort((a, b) => (b[9] || 0) - (a[9] || 0))[0] || {};
    const startFit = s[2] ?? points[0]?.t ?? activity?.[253];
    if (startFit == null) throw new Error("No start time in this FIT file");
    const startSec = startFit + FIT_EPOCH;
    const offsetSec = activity?.[5] != null && activity?.[253] != null ? activity[5] - activity[253] : null;
    const validOffset = offsetSec != null && Math.abs(offsetSec) <= 14 * 3600 ? Math.round(offsetSec / 900) * 900 : null;
    const sport = s[5] ?? null;
    const distance = s[9] != null ? s[9] / 100 : points.length ? points[points.length - 1].d - points[0].d : 0;
    return {
        sport, subSport: s[6] ?? null,
        startSec, start: new Date(startSec * 1000).toISOString(),
        offsetMin: validOffset == null ? null : validOffset / 60,
        localDate: validOffset == null ? null : dateOf(startSec + validOffset),
        distance: Math.round(distance),
        duration: s[8] != null ? Math.round(s[8] / 1000) : s[7] != null ? Math.round(s[7] / 1000) : null,
        elapsed: s[7] != null ? Math.round(s[7] / 1000) : null,
        avgHr: s[16] ?? null, maxHr: s[17] ?? null,
        ascent: s[22] ?? null, calories: s[11] ?? null,
        manufacturer: fileId?.[1] ?? null, product: fileId?.[2] ?? null,
        laps: laps.map((l, idx) => ({
            i: idx + 1,
            m: l[9] != null ? Math.round(l[9] / 100) : 0,
            s: l[8] != null ? Math.round(l[8] / 100) / 10 : l[7] != null ? Math.round(l[7] / 100) / 10 : 0,
            hr: l[15] ?? null,
            intensity: l[23] ?? null
        })).filter(l => l.s > 0),
        best: sport === 1 ? bestEfforts(points) : null
    };
}

// FIT sport numbers -> Southbound's activity types.
const SPORTS = { 1: "run", 2: "ride", 5: "swim", 11: "walk", 17: "hike", 10: "strength", 4: "cardio", 15: "row" };
export const sportType = (sport, subSport) => (sport === 10 && subSport !== 20 ? "workout" : SPORTS[sport] || "other");
