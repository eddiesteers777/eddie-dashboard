/* ==========================================
   Southbound — GPX for a route (pure)

   GPX 1.1 for a watch. <ele> goes in only when a height was fetched for
   every point of this exact route, so a stale elevation never reaches a
   file. The climb in the description is the same range the page shows.
========================================== */

const esc = s => String(s).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

export function buildGpx({ name = "Southbound route", coords, heightsM = null, miles = 0, climbText = "" }) {
    const hasEle = Array.isArray(heightsM) && heightsM.length === coords.length;
    const desc = `${Number(miles).toFixed(2)} mi, ${coords.length} points` +
        (hasEle ? `, with elevation${climbText ? " (climb " + climbText + ", not exact)" : ""}` : ", no elevation") + ".";
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Southbound" xmlns="http://www.topografix.com/GPX/1/1">\n` +
        `<metadata><name>${esc(name)}</name><desc>${esc(desc)}</desc></metadata>\n<trk><name>${esc(name)}</name><trkseg>\n`;
    coords.forEach((p, i) => {
        gpx += `<trkpt lat="${p[0].toFixed(6)}" lon="${p[1].toFixed(6)}">` + (hasEle ? `<ele>${heightsM[i].toFixed(1)}</ele>` : "") + "</trkpt>\n";
    });
    return { text: gpx + "</trkseg></trk></gpx>\n", hasEle, points: coords.length };
}

/** Reads track points back out: [{ lat, lon, ele|null }]. Enough for tests and a future import. */
export function parseGpxPoints(text) {
    const pts = [];
    for (const m of String(text).matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)"\s*(?:\/>|>([\s\S]*?)<\/trkpt>)/g)) {
        const ele = /<ele>([-\d.]+)<\/ele>/.exec(m[3] || "");
        pts.push({ lat: +m[1], lon: +m[2], ele: ele ? +ele[1] : null });
    }
    return pts;
}

export function gpxFileName(name) {
    const slug = String(name || "route").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "route";
    return `southbound-${slug}.gpx`;
}
