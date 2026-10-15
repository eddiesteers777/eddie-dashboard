/* ==========================================
   Train's pictures (premium shell, details): the week as what she did, and a
   small shape under every finished workout. Pure: no DOM reads, no storage,
   so it is unit tested (tests/trainShapes.test.mjs).

   Nothing here is invented. A run with saved laps (COROS) is its laps: each as
   wide as its distance, as tall as its pace; a run without laps is one even
   step at its average pace; a strength workout is a bar per exercise, as tall
   as its sets; a cross-training session is one low block.
========================================== */

const MILE = 1609.344;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Pace -> height, 0..1: 5:00 a mile is the top, 15:00 the bottom; absolute, so a steady run looks steady.
const paceLevel = secPerMile => clamp((900 - secPerMile) / 600, 0.15, 1);

const COLOR = { run: "214,185,142", strength: "160,187,156", cross: "236,230,212" };

// One workout -> [{ w (relative width), level (0..1) }]. `laps` = [{ m (metres), s (seconds) }] when saved.
export function sessionShape(session, laps = null) {
    if (session?.type === "strength") {
        const exercises = session.strength?.exercises || [];
        const parts = exercises.map(ex => ({ w: 1, level: clamp((ex.sets?.length || 0) / 6, 0.25, 1) }));
        return parts.length ? parts : [{ w: 1, level: 0.5 }];
    }
    if (session?.type === "run") {
        const usable = (laps || []).filter(l => l.m > 0 && l.s > 0).slice(0, 80);
        if (usable.length > 1) return usable.map(l => ({ w: l.m, level: paceLevel(l.s / (l.m / MILE)) }));
        const pace = Number(session.run?.paceSec)
            || (session.run?.meters > 0 && session.run?.movingSec > 0 ? session.run.movingSec / (session.run.meters / MILE) : 0);
        return [{ w: 1, level: pace > 0 ? paceLevel(pace) : 0.5 }];
    }
    return [{ w: 1, level: 0.4 }];
}

const Y = level => 38 - (clamp(level, 0, 1) * 34 + 2);

// The small picture (decorative: the row beside it says it all in words).
export function miniShapeSvg(parts, type = "run") {
    if (!parts?.length) return "";
    const total = parts.reduce((t, p) => t + p.w, 0) || 1;
    const rgb = COLOR[type] || COLOR.run;
    let x = 0;
    const segs = parts.map(p => { const x0 = x; x += (p.w / total) * 100; return { x0, x1: x, y: Y(p.level), level: p.level }; });
    const alpha = level => (level > 0.7 ? ".34" : ".2");
    // Strength: separate bars with a gap; the rest: one stepped outline.
    if (type === "strength") {
        const gap = Math.min(3, 100 / segs.length * 0.3);
        const bars = segs.map(s => ({ ...s, x0: s.x0 + gap / 2, x1: s.x1 - gap / 2 }));
        const rects = bars.map(s => `<rect x="${s.x0.toFixed(1)}" y="${s.y.toFixed(1)}" width="${(s.x1 - s.x0).toFixed(1)}" height="${(38 - s.y).toFixed(1)}" fill="rgba(${rgb},${alpha(s.level)})"/>`).join("");
        const tops = bars.map(s => `M${s.x0.toFixed(1)} ${s.y.toFixed(1)} L${s.x1.toFixed(1)} ${s.y.toFixed(1)}`).join(" ");
        return `<svg class="mini" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">${rects}<path d="${tops}" fill="none" stroke="rgba(242,237,225,.85)" stroke-width="1.6" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
    }
    const rects = segs.map(s => `<rect x="${s.x0.toFixed(1)}" y="${s.y.toFixed(1)}" width="${(s.x1 - s.x0 + 0.4).toFixed(1)}" height="${(38 - s.y).toFixed(1)}" fill="rgba(${rgb},${alpha(s.level)})"/>`).join("");
    const top = segs.map((s, i) => `${i ? "L" : "M"}${s.x0.toFixed(1)} ${s.y.toFixed(1)} L${s.x1.toFixed(1)} ${s.y.toFixed(1)}`).join(" ");
    return `<svg class="mini" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">${rects}<path d="${top}" fill="none" stroke="rgba(242,237,225,.85)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

const addDays = (date, n) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The week from Monday as a week for the ridge (js/weekRidge.js): each day holds what she did, by miles run.
// `feed` = completed sessions ({ date, type, run: { meters } }).
export function actualWeek(feed, monday, today) {
    const days = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const items = (feed || []).filter(s => s.date === date).map(s => ({
            kind: s.type === "run" || s.type === "strength" ? s.type : "cross",
            title: s.title || "",
            miles: s.type === "run" ? Math.round(((s.run?.meters || 0) / MILE) * 10) / 10 : 0,
            source: { type: "actual" }
        }));
        const isToday = date === today;
        return { date, items, isToday, status: items.length ? "done" : isToday ? "today" : "upcoming" };
    });
    return { monday, days };
}
