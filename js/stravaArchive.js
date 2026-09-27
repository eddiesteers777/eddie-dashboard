/* ==========================================
   Southbound — reading a Strava archive (on the device, no upload)

   Strava's "Download your archive" is a .zip with activities.csv (one row
   per activity: date, type, name, distance, time, heart rate…) and an
   activities/ folder of the original files (.fit.gz from a watch, .gpx,
   .tcx…). readArchive() takes the .zip, the unzipped folder or any mix of
   files and returns compact activities (js/stravaHistory.js format):
     - a FIT file gives the exact start, the watch's local date, laps and
       fastest efforts (js/fitParse.js); its csv row adds the name
     - an activity with no readable file comes from its csv row
   Nothing leaves the device here; GPS points are never kept.
   The csv and zip readers are unit-tested in tests/stravaArchive.test.mjs.
========================================== */

import { readFit, sportType } from "./fitParse.js";

// ---------- csv ----------

/** RFC 4180 csv -> rows of strings (quoted commas, quotes and line breaks). */
export function parseCsv(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    const s = String(text || "").replace(/^﻿/, "");
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quoted) {
            if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && s[i + 1] === "\n") i++;
            row.push(field); rows.push(row); row = []; field = "";
        } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 1 || r[0] !== "");
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Strava's "Activity Date" -> Unix seconds, read as UTC (the archive's
 * dates are UTC; importing checks that against the FIT files).
 * "Sep 27, 2025, 11:05:23 AM", "27 Sep 2025, 11:05:23", "2025-09-27 11:05:23".
 */
export function csvDate(text) {
    const t = String(text || "").trim();
    let y, mo, d, h, mi, s, ap;
    let m = t.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AaPp][Mm])?$/);
    if (m) { [, mo, d, y, h, mi, s, ap] = m; mo = MONTHS.indexOf(mo.toLowerCase()); }
    else if ((m = t.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AaPp][Mm])?$/))) { [, d, mo, y, h, mi, s, ap] = m; mo = MONTHS.indexOf(mo.toLowerCase()); }
    else if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/))) { [, y, mo, d, h, mi, s] = m; mo = Number(mo) - 1; }
    else return null;
    if (mo < 0) return null;
    let hour = Number(h) % (ap ? 12 : 24);
    if (ap && /p/i.test(ap)) hour += 12;
    return Date.UTC(Number(y), mo, Number(d), hour, Number(mi), Number(s || 0)) / 1000;
}

const num = v => {
    const t = String(v ?? "").trim();
    if (!t) return null;
    const n = Number(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, "") : t);
    return Number.isFinite(n) ? n : null;
};

/** Strava's activity types -> Southbound's. */
export function csvType(text) {
    const t = String(text || "").toLowerCase();
    if (/run/.test(t)) return "run";
    if (/ride|cycl|bike/.test(t)) return "ride";
    if (/swim/.test(t)) return "swim";
    if (/walk/.test(t)) return "walk";
    if (/hike/.test(t)) return "hike";
    if (/weight/.test(t)) return "strength";
    if (/row/.test(t)) return "row";
    if (/workout|crossfit|hiit|yoga|pilates|elliptical|stair|training/.test(t)) return "workout";
    return "other";
}

/**
 * activities.csv -> [{ activityId, file, name, type, csvSec, moving, elapsed,
 * distance (m), avgHr, maxHr, ascent }]. Columns are found by name; Strava
 * repeats some (Distance: the first in the athlete's units, a later one in
 * meters), so the meters column is the one that agrees with speed x time.
 */
export function readActivitiesCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const head = rows[0].map(h => h.trim().toLowerCase());
    const cols = name => head.map((h, i) => (h === name ? i : -1)).filter(i => i >= 0);
    const first = name => cols(name)[0];
    const last = name => cols(name).at(-1);
    const C = {
        id: first("activity id"), date: first("activity date"), name: first("activity name"), type: first("activity type"),
        elapsed: first("elapsed time"), moving: first("moving time"), speed: first("average speed"),
        avgHr: first("average heart rate"), maxHr: last("max heart rate"), ascent: first("elevation gain"),
        file: first("filename"), distances: cols("distance")
    };
    if (C.date == null) throw new Error("This doesn't look like Strava's activities.csv (no Activity Date column).");
    return rows.slice(1).map(r => {
        const at = i => (i == null ? null : r[i]);
        const moving = num(at(C.moving)), elapsed = num(at(C.elapsed)), speed = num(at(C.speed));
        const dists = C.distances.map(i => num(r[i])).filter(v => v != null && v > 0);
        const candidates = [...(dists.length > 1 ? [dists.at(-1)] : []), ...(dists.length ? [dists[0] * 1000, dists[0] * 1609.344] : [])];
        const guess = speed && (moving || elapsed) ? speed * (moving || elapsed) : null;
        const distance = !candidates.length ? 0
            : guess ? candidates.reduce((a, b) => (Math.abs(b - guess) < Math.abs(a - guess) ? b : a))
            : candidates[0];
        return {
            activityId: String(at(C.id) ?? "").trim() || null,
            file: String(at(C.file) ?? "").trim() || null,
            name: String(at(C.name) ?? "").trim(),
            type: csvType(at(C.type)),
            csvSec: csvDate(at(C.date)),
            moving: moving != null ? Math.round(moving) : null,
            elapsed: elapsed != null ? Math.round(elapsed) : null,
            distance: Math.round(distance),
            avgHr: num(at(C.avgHr)) != null ? Math.round(num(at(C.avgHr))) : null,
            maxHr: num(at(C.maxHr)) != null ? Math.round(num(at(C.maxHr))) : null,
            ascent: num(at(C.ascent)) != null ? Math.round(num(at(C.ascent))) : null
        };
    }).filter(a => a.csvSec != null);
}

// ---------- zip + gzip ----------

async function inflate(bytes, format) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
export const gunzip = bytes => inflate(bytes, "gzip");

const u16 = (b, p) => b[p] | (b[p + 1] << 8);
const u32 = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0;
const u64 = (b, p) => u32(b, p) + u32(b, p + 4) * 2 ** 32;
const slice = async (blob, from, to) => new Uint8Array(await blob.slice(from, to).arrayBuffer());

/**
 * The entries of a .zip (a File or Blob), reading only its directory, so a
 * multi-GB archive with photos is fine: [{ name, method, compSize, size, offset }].
 */
export async function listZip(blob) {
    const tailLen = Math.min(blob.size, 65557 + 20);
    const tail = await slice(blob, blob.size - tailLen, blob.size);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("This file isn't a .zip archive.");
    let count = u16(tail, e + 10), cdSize = u32(tail, e + 12), cdOffset = u32(tail, e + 16);
    if (cdOffset === 0xFFFFFFFF || count === 0xFFFF) {                   // zip64
        const loc = e - 20;
        if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new Error("This .zip is too large to read here.");
        const z = await slice(blob, u64(tail, loc + 8), u64(tail, loc + 8) + 56);
        count = u64(z, 32); cdSize = u64(z, 40); cdOffset = u64(z, 48);
    }
    const cd = await slice(blob, cdOffset, cdOffset + cdSize);
    const dec = new TextDecoder();
    const out = [];
    for (let p = 0, n = 0; n < count && p + 46 <= cd.length; n++) {
        if (u32(cd, p) !== 0x02014b50) break;
        const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
        let compSize = u32(cd, p + 20), size = u32(cd, p + 24), offset = u32(cd, p + 42);
        const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
        for (let x = 0; x + 4 <= extra.length;) {
            const id = u16(extra, x), len = u16(extra, x + 2);
            if (id === 1) {
                let q = x + 4;
                if (size === 0xFFFFFFFF) { size = u64(extra, q); q += 8; }
                if (compSize === 0xFFFFFFFF) { compSize = u64(extra, q); q += 8; }
                if (offset === 0xFFFFFFFF) offset = u64(extra, q);
            }
            x += 4 + len;
        }
        out.push({ name: dec.decode(cd.subarray(p + 46, p + 46 + nameLen)), method: u16(cd, p + 10), compSize, size, offset });
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}

/** One zip entry's bytes. */
export async function readZipEntry(blob, entry) {
    const head = await slice(blob, entry.offset, entry.offset + 30);
    if (u32(head, 0) !== 0x04034b50) throw new Error("Damaged .zip entry");
    const start = entry.offset + 30 + u16(head, 26) + u16(head, 28);
    const data = await slice(blob, start, start + entry.compSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflate(data, "deflate-raw");
    throw new Error("Unsupported .zip compression");
}

// ---------- the archive ----------

// Lets the page draw the progress bar between batches. A message, not a
// timer: browsers slow timers in a tab that isn't in front (to once a
// minute after a few minutes), which made a big archive crawl.
function breather() {
    if (typeof MessageChannel !== "function") return Promise.resolve();
    return new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
        channel.port2.postMessage(0);
    });
}

const base = path => String(path || "").split("/").pop().toLowerCase();
const isFit = name => /\.fit(\.gz)?$/i.test(name);
const pad = n => String(n).padStart(2, "0");
const localDateOf = sec => { const d = new Date(sec * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** A key that's the same whether an activity came from its file or its csv row. */
export const activityKey = ({ file, activityId, startSec }) => {
    const f = base(file).match(/^(\d+)\./);
    return f ? `f${f[1]}` : activityId ? `a${activityId}` : `t${startSec}`;
};

/** A FIT activity (+ its csv row) -> the compact stored form. */
export function fromFit(fit, row = null, file = null) {
    const type = sportType(fit.sport, fit.subSport);
    const b = fit.best;
    return {
        k: activityKey({ file: file || row?.file, activityId: row?.activityId, startSec: fit.startSec }),
        ...(row?.activityId ? { a: row.activityId } : {}),
        src: "fit",
        d: fit.localDate || localDateOf(fit.startSec),
        t: fit.startSec,
        y: row && type === "other" ? row.type : type,
        m: fit.distance || row?.distance || 0,
        s: fit.duration ?? row?.moving ?? null,
        e: fit.elapsed ?? row?.elapsed ?? null,
        h: fit.avgHr ?? row?.avgHr ?? null,
        x: fit.maxHr ?? row?.maxHr ?? null,
        g: fit.ascent ?? row?.ascent ?? null,
        n: (row?.name || "").slice(0, 60),
        ...(b && Object.values(b).some(v => v != null) ? { b: [b.mile, b.k5, b.k10, b.half, b.full] } : {})
    };
}

/** A csv row alone -> the compact stored form; shiftSec corrects csv times that weren't UTC. */
export function fromCsv(row, shiftSec = 0) {
    const t = row.csvSec - shiftSec;
    return {
        k: activityKey({ file: row.file, activityId: row.activityId, startSec: t }),
        ...(row.activityId ? { a: row.activityId } : {}),
        src: "csv", d: localDateOf(t), t, y: row.type, m: row.distance,
        s: row.moving, e: row.elapsed, h: row.avgHr, x: row.maxHr, g: row.ascent,
        n: row.name.slice(0, 60)
    };
}

/**
 * How far the csv's times are from the files' real start times (seconds,
 * median over the activities that have both). 0 when the csv is in UTC.
 */
export function csvShift(pairs) {
    const diffs = pairs.map(([row, fit]) => row.csvSec - fit.startSec).sort((a, b) => a - b);
    if (!diffs.length) return 0;
    const mid = diffs[Math.floor(diffs.length / 2)];
    return Math.abs(mid) < 20 * 60 ? 0 : Math.round(mid / 900) * 900;
}

/**
 * files: File/Blob objects with .name (and .webkitRelativePath for a folder):
 * the Strava .zip, activities.csv, .fit / .fit.gz files, or any mix.
 * -> { activities: [compact], stats: { rows, fitRead, fromCsv, unreadable, skipped, shiftSec,
 *      notFit: .gpx / .tcx files, which are read from their csv rows } }
 */
export async function readArchive(files, { onProgress = () => {} } = {}) {
    // Gather the pieces: csv text and activity files, from zips or loose files.
    const sources = [];                                 // { name, read: () => bytes }
    let csvText = null, notFit = 0;
    const otherFile = name => /\.(gpx|tcx)(\.gz)?$/i.test(name);
    for (const f of files) {
        const name = f.webkitRelativePath || f.name || "";
        if (/\.zip$/i.test(name)) {
            const entries = await listZip(f);
            const csv = entries.filter(e => base(e.name) === "activities.csv").sort((a, b) => a.name.length - b.name.length)[0];
            if (csv) csvText = new TextDecoder().decode(await readZipEntry(f, csv));
            for (const e of entries) {
                if (isFit(e.name) && /(^|\/)activities\//i.test(e.name)) sources.push({ name: e.name, read: () => readZipEntry(f, e) });
                else if (otherFile(e.name)) notFit++;
            }
        } else if (base(name) === "activities.csv") csvText = await f.text();
        else if (isFit(name)) sources.push({ name, read: async () => new Uint8Array(await f.arrayBuffer()) });
        else if (otherFile(name)) notFit++;
    }
    const rows = csvText ? readActivitiesCsv(csvText) : [];
    const rowByFile = new Map(rows.filter(r => r.file).map(r => [base(r.file), r]));
    const stats = { rows: rows.length, fitRead: 0, fromCsv: 0, unreadable: 0, skipped: 0, shiftSec: 0, notFit };
    const fits = [];                                    // [row|null, fit, name]
    for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        if (i % 20 === 0) { onProgress({ done: i, total: sources.length }); await breather(); }
        try {
            let bytes = await src.read();
            if (/\.gz$/i.test(src.name)) bytes = await gunzip(bytes);
            fits.push([rowByFile.get(base(src.name)) || null, readFit(bytes), src.name]);
            stats.fitRead++;
        } catch { stats.unreadable++; }
    }
    onProgress({ done: sources.length, total: sources.length });
    stats.shiftSec = csvShift(fits.filter(([row]) => row).map(([row, fit]) => [row, fit]));
    const byKey = new Map();
    for (const [row, fit, name] of fits) { const a = fromFit(fit, row, name); byKey.set(a.k, a); }
    for (const row of rows) {
        const a = fromCsv(row, stats.shiftSec);
        if (byKey.has(a.k)) continue;
        byKey.set(a.k, a);
        stats.fromCsv++;
    }
    if (!rows.length && !fits.length) stats.skipped = files.length;
    return { activities: [...byKey.values()], stats };
}
