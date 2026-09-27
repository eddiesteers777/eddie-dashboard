// Builds small FIT files for tests (tests/fitParse.test.mjs, tests/stravaArchive.test.mjs).
// Real watch files carry GPS, so none are kept in this public repo: these are made up.
const FIT_EPOCH = 631065600;
const TYPES = { 0x00: 1, 0x02: 1, 0x84: 2, 0x85: 4, 0x86: 4 };

function writer() {
    const bytes = [];
    const put = (v, size, be = false) => { const b = []; for (let i = 0; i < size; i++) b.push(Number((BigInt.asUintN(size * 8, BigInt(Math.round(v))) >> BigInt(8 * i)) & 0xFFn)); bytes.push(...(be ? b.reverse() : b)); };
    return { bytes, put };
}

/**
 * A running activity: points [{ t: seconds from start, d: meters, hr }],
 * laps [{ start, elapsed, timer, m, hr, intensity }], session totals.
 * Exercises what real files do: a big-endian session definition, a
 * developer field on records, compressed-timestamp records and GPS fields.
 */
export function buildFit({ startSec, offsetSec = -18000, sport = 1, subSport = 0, points = [], laps = [], session = {}, manufacturer = 294, product = 804, compressed = true } = {}) {
    const w = writer();
    const fit = s => s - FIT_EPOCH;
    const defs = {};
    const define = (local, global, fields, { be = false, dev = 0 } = {}) => {
        w.bytes.push(0x40 | (dev ? 0x20 : 0) | local, 0, be ? 1 : 0);
        w.put(global, 2, be);
        w.bytes.push(fields.length);
        for (const [num, type] of fields) w.bytes.push(num, TYPES[type], type);
        if (dev) w.bytes.push(1, 0, dev, 0);
        defs[local] = { fields, be, dev };
    };
    const data = (local, values, header = local) => {
        const { fields, be, dev } = defs[local];
        w.bytes.push(header);
        fields.forEach(([, type], i) => w.put(values[i] ?? (type === 0x85 ? 0x7FFFFFFF : 2 ** (8 * TYPES[type]) - 1), TYPES[type], be));
        for (let i = 0; i < dev; i++) w.bytes.push(0xAB);
    };
    define(0, 0, [[0, 0x00], [1, 0x84], [2, 0x84], [4, 0x86]]);
    data(0, [4, manufacturer, product, fit(startSec)]);
    define(1, 20, [[253, 0x86], [0, 0x85], [1, 0x85], [5, 0x86], [3, 0x02]], { dev: 2 });
    define(2, 20, [[0, 0x85], [1, 0x85], [5, 0x86], [3, 0x02]]);
    points.forEach((p, i) => {
        const ts = fit(startSec) + p.t;
        const gps = [Math.round(39.77 * 2 ** 31 / 180), Math.round(-86.16 * 2 ** 31 / 180)];
        if (compressed && i % 2 === 1) data(2, [...gps, p.d * 100, p.hr], 0x80 | (2 << 5) | (ts & 0x1F));
        else data(1, [ts, ...gps, p.d * 100, p.hr]);
    });
    define(3, 19, [[253, 0x86], [2, 0x86], [7, 0x86], [8, 0x86], [9, 0x86], [15, 0x02], [23, 0x00]]);
    for (const l of laps) data(3, [fit(startSec) + l.start + l.elapsed, fit(startSec) + l.start, l.elapsed * 1000, l.timer * 1000, l.m * 100, l.hr, l.intensity ?? 0]);
    define(4, 18, [[253, 0x86], [2, 0x86], [5, 0x00], [6, 0x00], [7, 0x86], [8, 0x86], [9, 0x86], [11, 0x84], [16, 0x02], [17, 0x02], [22, 0x84]], { be: true });
    data(4, [fit(startSec) + (session.elapsed || 0), fit(startSec), sport, subSport, (session.elapsed || 0) * 1000, (session.timer || 0) * 1000, session.m != null ? session.m * 100 : null, session.calories, session.avgHr, session.maxHr, session.ascent]);
    define(5, 34, [[253, 0x86], [5, 0x86]]);
    const end = fit(startSec) + (session.elapsed || 0);
    data(5, [end, end + offsetSec]);
    const header = writer();
    header.bytes.push(14, 0x20); header.put(2132, 2); header.put(w.bytes.length, 4);
    header.bytes.push(0x2E, 0x46, 0x49, 0x54, 0, 0);    // ".FIT", header CRC (not checked)
    return new Uint8Array([...header.bytes, ...w.bytes, 0, 0]);
}

/** A steady run: `km` kilometers at `secPerKm`, one point a second. */
export function steadyRun({ startSec, km, secPerKm, hr = 150, offsetSec = -18000, ...rest }) {
    const total = Math.round(km * secPerKm);
    const points = Array.from({ length: total + 1 }, (_, t) => ({ t, d: Math.round(t / secPerKm * 1000 * 100) / 100, hr }));
    const laps = [];
    for (let k = 0; k < Math.ceil(km); k++) {
        const m = Math.min(1000, km * 1000 - k * 1000);
        laps.push({ start: k * secPerKm, elapsed: m / 1000 * secPerKm, timer: m / 1000 * secPerKm, m, hr });
    }
    return buildFit({ startSec, offsetSec, points, laps, session: { elapsed: total, timer: total, m: km * 1000, avgHr: hr, maxHr: hr + 12, ascent: 40, calories: 700 }, ...rest });
}

/** A minimal ZIP for the archive reader: stored entries, or deflated with `deflate` (e.g. zlib.deflateRawSync). */
export function buildZip(files, { deflate = null } = {}) {
    const w = writer();
    const central = [];
    const enc = new TextEncoder();
    for (const [name, content] of Object.entries(files)) {
        const nameBytes = enc.encode(name);
        const raw = typeof content === "string" ? enc.encode(content) : content;
        const body = deflate ? new Uint8Array(deflate(raw)) : raw;
        const method = deflate ? 8 : 0;
        const offset = w.bytes.length;
        w.put(0x04034b50, 4); w.put(20, 2); w.put(0, 2); w.put(method, 2); w.put(0, 4); w.put(0, 4);
        w.put(body.length, 4); w.put(raw.length, 4); w.put(nameBytes.length, 2); w.put(0, 2);
        w.bytes.push(...nameBytes);
        for (const b of body) w.bytes.push(b);
        central.push({ nameBytes, comp: body.length, size: raw.length, offset, method });
    }
    const cdStart = w.bytes.length;
    for (const c of central) {
        w.put(0x02014b50, 4); w.put(20, 2); w.put(20, 2); w.put(0, 2); w.put(c.method, 2); w.put(0, 4); w.put(0, 4);
        w.put(c.comp, 4); w.put(c.size, 4); w.put(c.nameBytes.length, 2); w.put(0, 2); w.put(0, 2); w.put(0, 2); w.put(0, 2); w.put(0, 4);
        w.put(c.offset, 4); w.bytes.push(...c.nameBytes);
    }
    const cdSize = w.bytes.length - cdStart;
    w.put(0x06054b50, 4); w.put(0, 2); w.put(0, 2); w.put(central.length, 2); w.put(central.length, 2); w.put(cdSize, 4); w.put(cdStart, 4); w.put(0, 2);
    return new Uint8Array(w.bytes);
}
