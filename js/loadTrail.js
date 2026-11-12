// Load check, pure part: turns what the browser measured about one page load into short lines.
// Used by js/loadCheck.js (the opt-in readout). Times are seconds since the page started.

const sec = ms => (ms / 1000).toFixed(1) + "s";

/** The slowest `count` files of a load: [{ name, start, duration, size, fromWorker }]. */
export function slowest(resources, count = 4) {
    return [...resources]
        .map(r => ({
            name: String(r.name || "").replace(/^https?:\/\/[^/]+\//, "").slice(0, 38),
            start: r.startTime || 0,
            duration: r.duration || 0,
            size: r.transferSize || 0,
            fromWorker: (r.workerStart || 0) > 0
        }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, count);
}

/** Lines for one load. `m` is the first time (ms) each milestone was seen, or undefined if it never was. */
export function loadLines({ navType = "navigate", milestones = {}, resources = [], worker = "", now = 0, version = "" }) {
    const lines = [];
    lines.push(`page ${navType}${worker ? ", " + worker : ""}${version ? ", v" + version : ""}`);
    const order = [["header", "top bar"], ["splashGone", "splash gone"], ["greeting", "greeting"], ["filled", "no empty spots"]];
    for (const [key, label] of order) {
        const at = milestones[key];
        lines.push(`${label.padEnd(15)}${at === undefined ? "not yet (" + sec(now) + " in)" : sec(at)}`);
    }
    const fromWorker = resources.filter(r => (r.workerStart || 0) > 0).length;
    const bytes = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
    lines.push(`${resources.length} files, ${fromWorker} from this phone's saved copy, ${Math.round(bytes / 1024)} KB over the network`);
    for (const s of slowest(resources)) lines.push(`  ${sec(s.start)} +${sec(s.duration)} ${s.name}${s.fromWorker ? "" : " (net)"}`);
    return lines;
}
