/* ==========================================
   Southbound — a fueling plan as a PDF (drawing + download)

   downloadFuelPdf(plan, { unit }) loads jsPDF on the first tap (from
   jsDelivr; the service worker keeps it after that), draws the rows from
   pdfModel (js/fuelPdfModel.js) onto US Letter pages and hands the file
   over: the phone's share sheet where it can take a file (iPhone / the
   installed app: Save to Files, Messages, AirDrop...), else a download.
   Nothing is uploaded: the PDF is made on the device.

   It's drawn as Southbound, not as a generic report: the app's own fonts
   (fonts/pdf/, made by scripts/build-pdf-fonts.py: Big Shoulders Display
   titles, Instrument Sans text, IBM Plex Mono numbers, the Saira wordmark), the forest /
   tan / cream palette, the SB mark and its tan slash, the reaction
   drawings, a race-bib header, a course map of every gel and bottle, and
   a pocket card to cut out. Without the fonts (a failed load) it falls
   back to the PDF's built-in ones and still works.

   downloadSourcesPdf({ unit }) is The Fuel Shelf (popular products) alone.
========================================== */

import { pdfModel, pdfSafe, pdfFileName } from "./fuelPdfModel.js";
import { buildSchedule, scheduleInputFromPlan } from "./fuelSchedule.js";
import { toast, sbChoose } from "./ui.js";

export const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";

let jspdfPromise = null;
function loadJsPdf() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!jspdfPromise) {
        jspdfPromise = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = JSPDF_URL;
            s.async = true;
            s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("jsPDF missing")));
            s.onerror = () => reject(new Error("jsPDF didn't load"));
            document.head.appendChild(s);
        }).catch(error => { jspdfPromise = null; throw error; });
    }
    return jspdfPromise;
}

// ---------- Fonts ----------

const FONT_FILES = {
    display: ["BigShouldersDisplay-Bold.ttf", "SBDisplay", "normal"],
    body: ["InstrumentSans-Regular.ttf", "SBBody", "normal"],
    bodyBold: ["InstrumentSans-Bold.ttf", "SBBody", "bold"],
    mono: ["IBMPlexMono-Medium.ttf", "SBMono", "normal"],
    brand: ["Saira-ExtraBold.ttf", "SBBrand", "normal"]
};

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = "";
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
}

let fontsPromise = null;
function loadFonts() {
    if (!fontsPromise) {
        fontsPromise = Promise.all(Object.entries(FONT_FILES).map(async ([key, [file]]) => {
            const res = await fetch(new URL(`../fonts/pdf/${file}`, import.meta.url));
            if (!res.ok) throw new Error(`font ${file}`);
            return [key, toBase64(await res.arrayBuffer())];
        })).then(Object.fromEntries).catch(() => { fontsPromise = null; return null; });
    }
    return fontsPromise;
}

// ---------- Drawings (the brand's own SVGs, as PNGs) ----------

const ART = {
    markCream: ["brand/sb-mark.svg", 372, 238],
    markForest: ["brand/sb-mark-forest.svg", 372, 238],
    fuel: ["emoji/sb_fuel.svg", 128, 128],
    hydrate: ["emoji/sb_hydrate.svg", 128, 128],
    raceDay: ["emoji/sb_race_day.svg", 128, 128],
    longRun: ["emoji/sb_long_run.svg", 128, 128],
    water: ["habit-icons/water.svg", 128, 128],
    fruit: ["habit-icons/fruit.svg", 128, 128]
};

function svgPng(path, w, h) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            try {
                const c = document.createElement("canvas");
                c.width = w; c.height = h;
                c.getContext("2d").drawImage(img, 0, 0, w, h);
                resolve(c.toDataURL("image/png"));
            } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = new URL(`../${path}`, import.meta.url).href;
    });
}

let artPromise = null;
function loadArt() {
    if (!artPromise) {
        artPromise = Promise.all(Object.entries(ART).map(async ([key, [path, w, h]]) => [key, await svgPng(path, w, h)]))
            .then(Object.fromEntries);
    }
    return artPromise;
}

// ---------- Palette (brand/sb-mark.svg's colours + the app's earthy tones, tuned for paper) ----------

const C = {
    forest: [14, 37, 27], forest2: [27, 52, 39], tan: [184, 155, 110], tanLight: [214, 193, 158], tanDeep: [150, 120, 76],
    cream: [243, 239, 230], paper: [251, 248, 241], panel: [242, 236, 224], panel2: [247, 243, 235],
    ink: [21, 33, 26], muted: [104, 111, 103], line: [221, 212, 194],
    sage: [92, 138, 104], sageLight: [205, 224, 209], ochre: [190, 138, 52], ochreLight: [240, 222, 186],
    slate: [76, 124, 133], slateLight: [205, 223, 226], brick: [176, 84, 64]
};

const PAGE = { w: 612, h: 792, m: 40, bottom: 742 };

/** A page-drawing kit around one jsPDF document. */
function kit(JsPDF, { fonts = null, art = {} } = {}) {
    const doc = new JsPDF({ unit: "pt", format: "letter", compress: true });
    const fam = { display: ["helvetica", "bold"], body: ["helvetica", "normal"], bodyBold: ["helvetica", "bold"], mono: ["courier", "bold"], brand: ["helvetica", "bold"] };
    if (fonts) {
        for (const [key, [file, name, style]] of Object.entries(FONT_FILES)) {
            doc.addFileToVFS(file, fonts[key]);
            doc.addFont(file, name, style);
            fam[key] = [name, style];
        }
    }
    const k = {
        doc, art, fonts: Boolean(fonts), W: PAGE.w, H: PAGE.h, M: PAGE.m, CW: PAGE.w - 2 * PAGE.m, y: 0,
        // Display text is always capitals (as in the app), the fallback too.
        setF(kind, size, color = C.ink) {
            doc.setFont(...fam[kind]);
            doc.setFontSize(size);
            doc.setTextColor(...color);
            k.kind = kind;
        },
        prep(t) { const s = pdfSafe(t); return k.kind === "display" || k.kind === "brand" ? s.toUpperCase() : s; },
        text(t, x, y, opts = {}) {
            const s = k.prep(t);
            if (opts.charSpace && opts.align) {
                const w = k.width(s, opts.charSpace);
                const x0 = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
                doc.text(s, x0, y, { charSpace: opts.charSpace });
                return;
            }
            doc.text(s, x, y, opts);
        },
        width(t, charSpace = 0) { const s = k.prep(t); return doc.getTextWidth(s) + charSpace * Math.max(0, s.length - 1); },
        wrap(t, w) { return doc.splitTextToSize(k.prep(t), w); },
        fit(t, w) {
            let s = k.prep(t);
            if (doc.getTextWidth(s) <= w) return s;
            while (s.length > 1 && doc.getTextWidth(`${s}…`) > w) s = s.slice(0, -1);
            return `${s.trimEnd()}…`;
        },
        fill(c) { doc.setFillColor(...c); },
        stroke(c, w = 0.6) { doc.setDrawColor(...c); doc.setLineWidth(w); },
        opacity(a) { try { doc.setGState(new doc.GState({ opacity: a })); } catch { /* older jsPDF */ } },
        image(key, x, y, w, h) { if (art[key]) { try { doc.addImage(art[key], "PNG", x, y, w, h); } catch { /* skip */ } } },
        paper() { k.fill(C.paper); doc.rect(0, 0, PAGE.w, PAGE.h, "F"); },
        // The tan slash from the SB mark: Southbound's section marker.
        slash(x, y, h = 15, color = C.tan) {
            k.fill(color);
            doc.lines([[6, 0], [-h * 0.32, h], [-6, 0]], x + h * 0.32, y, [1, 1], "F", true);
        },
        // Diagonal speed streaks behind a forest band.
        streaks(x, top, height, count = 6, gap = 30, right = null) {
            // Kept inside [x, right] when a right edge is given.
            if (right != null) x = Math.max(x, right - (count - 1) * gap - 14 - height * 0.42);
            k.opacity(0.13);
            k.fill(C.tan);
            for (let i = 0; i < count; i++) {
                const x0 = x + i * gap, w = i % 2 ? 7 : 14;
                doc.lines([[w, 0], [-height * 0.42, height], [-w, 0]], x0 + height * 0.42, top, [1, 1], "F", true);
            }
            k.opacity(1);
        }
    };
    return k;
}

// ---------- Shared pieces ----------

function wordmark(k, x, y, { color = C.cream, sub = C.tan, size = 15 } = {}) {
    k.setF("brand", size, color);
    k.text("Southbound", x, y);
    k.setF("bodyBold", size * 0.42, sub);
    k.text("COACHING", x + 1, y + size * 0.62, { charSpace: size * 0.16 });
}

function runningHeader(k, title, label = "FUEL PLAN") {
    const { doc, M, W } = k;
    k.image("markForest", M, 22, 22, 14);
    k.setF("brand", 8, C.forest);
    k.text("Southbound", M + 28, 32);
    const after = M + 28 + k.width("Southbound") + 10;
    k.setF("bodyBold", 6.5, C.tanDeep);
    k.text(k.fit(title ? `${label}  ·  ${String(title).toUpperCase()}` : label, W - M - after - 60), after, 32, { charSpace: 0.9 });
    k.stroke(C.tan, 0.8); doc.line(M, 42, W - M, 42);
    k.y = 62;
}

function newPage(k, title) {
    k.doc.addPage();
    k.paper();
    if (title === SHELF) runningHeader(k, "", "THE FUEL SHELF  ·  CONTINUED");
    else runningHeader(k, title);
}
const SHELF = "The Fuel Shelf";

function ensure(k, h, title) {
    if (k.y + h > PAGE.bottom) newPage(k, title);
}

// What fits on one page below the running header.
const PAGE_ROOM = PAGE.bottom - 62;

// A section stays on one page: `need` is the whole section's height (its
// heading is ~30 more), so when it won't fit where we are it starts on the
// next page. Only a section taller than a page splits, and then it starts
// at the top of one.
function section(k, num, title, note, titleForPages, need = 40) {
    ensure(k, Math.min(30 + need, PAGE_ROOM), titleForPages);
    const { M, W } = k;
    k.y += 16;
    k.slash(M, k.y - 13, 16);
    k.setF("mono", 8, C.tanDeep);
    k.text(String(num).padStart(2, "0"), M + 17, k.y - 1);
    k.setF("display", 20, C.forest);
    k.text(title, M + 34, k.y + 1);
    if (note) { k.setF("body", 7.5, C.muted); k.text(note, W - M, k.y, { align: "right" }); }
    k.y += 14;
}

function chip(k, label, x, y, { fill = C.panel, color = C.forest, align = "left" } = {}) {
    k.setF("bodyBold", 6, color);
    const w = k.width(label.toUpperCase(), 0.6) + 10;
    const x0 = align === "right" ? x - w : x;
    k.fill(fill); k.doc.roundedRect(x0, y - 7.5, w, 11, 5.5, 5.5, "F");
    k.text(label.toUpperCase(), x0 + 5, y, { charSpace: 0.6 });
    return w;
}

const BASIS_CHIP = {
    "Measured": { fill: C.sageLight, color: [40, 84, 52] },
    "Your number": { fill: C.ochreLight, color: [112, 76, 18] },
    "Worked out": { fill: C.panel, color: C.forest },
    "Estimate": { fill: C.panel, color: C.muted }
};

function bar(k, x, y, w, h, frac, { color = C.tan, track = C.line, tick = null } = {}) {
    const { doc } = k;
    k.fill(track); doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
    const fw = Math.max(0, Math.min(1, frac)) * w;
    if (fw > h) { k.fill(color); doc.roundedRect(x, y, fw, h, h / 2, h / 2, "F"); }
    else if (fw > 0) { k.fill(color); doc.circle(x + h / 2, y + h / 2, h / 2, "F"); }
    if (tick != null) { k.stroke(C.forest, 1); doc.line(x + tick * w, y - 2, x + tick * w, y + h + 2); }
}

// Tiny pictograms drawn in the brand style: a forest outline, flat fills.
function gelIcon(k, x, y, color = C.tan) {
    const { doc } = k;
    k.fill(color); k.stroke(C.forest, 0.9);
    doc.roundedRect(x, y + 1, 9, 12, 1.6, 1.6, "FD");
    doc.line(x, y + 4.5, x + 9, y + 4.5);
}
function bottleIcon(k, x, y, color = C.slate) {
    const { doc } = k;
    k.fill(color); k.stroke(C.forest, 0.9);
    doc.rect(x + 2.8, y, 3.4, 2.6, "FD");
    doc.roundedRect(x, y + 2.6, 9, 10.4, 2, 2, "FD");
}
function flagIcon(k, x, y) {
    const { doc } = k;
    k.stroke(C.forest, 1); doc.line(x + 1, y, x + 1, y + 13);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        k.fill((r + c) % 2 ? C.cream : C.forest);
        doc.rect(x + 1.5 + c * 2.6, y + r * 2.6, 2.6, 2.6, "F");
    }
}
function startIcon(k, x, y) {
    k.fill(C.forest); k.doc.circle(x + 4.5, y + 7, 3.6, "F");
    k.fill(C.cream); k.doc.circle(x + 4.5, y + 7, 1.4, "F");
}

function footers(k, model) {
    const { doc, W, H, M } = k;
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        k.stroke(C.tan, 0.8); doc.line(M, H - 42, W - M, H - 42);
        k.image("markForest", M, H - 34, 20, 12.8);
        k.setF("brand", 7.5, C.forest);
        k.text("Southbound Coaching", M + 26, H - 26);
        k.setF("bodyBold", 5.5, C.tanDeep);
        k.text(String(model.tagline || "").toUpperCase(), M + 26, H - 18.5, { charSpace: 0.9 });
        k.setF("body", 6.5, C.muted);
        k.text(model.footer, W / 2 + 40, H - 24, { align: "center" });
        k.setF("mono", 8, C.forest);
        k.text(`${String(p).padStart(2, "0")} / ${String(pages).padStart(2, "0")}`, W - M, H - 24, { align: "right" });
    }
}

// ---------- The plan ----------

function headerBand(k, model) {
    const { doc, W, M } = k;
    const h = model.header;
    k.setF("display", 40);
    const lines = k.wrap(h.title, 320).slice(0, 2);
    const bandH = lines.length > 1 ? 196 : 176;
    k.fill(C.forest); doc.rect(0, 0, W, bandH, "F");
    k.streaks(W - 330, 0, bandH, 7, 34);
    k.fill(C.tan); doc.rect(0, bandH, W, 4, "F");

    k.image("markCream", M, 28, 50, 32);
    wordmark(k, M + 60, 46);

    k.setF("bodyBold", 7.5, C.tan);
    k.text(`FUEL PLAN  ·  ${model.isRace ? "RACE DAY" : "TRAINING RUN"}`, M, 92, { charSpace: 1.6 });

    // The title in the display face, the way every Southbound page header reads.
    k.setF("display", 40, C.cream);
    lines.forEach((line, i) => k.text(line, M, 126 + i * 33));
    k.setF("body", 9.5, C.tanLight);
    const sub = h.subtitle.replace(/ · (Race|Training) plan$/, "");
    if (sub) k.text(k.fit(sub, 330), M, 126 + (lines.length - 1) * 33 + 22);

    // A race bib: the run at a glance.
    const bw = 166, bh = 128, bx = W - M - bw, by = 28;
    k.fill(C.cream); doc.roundedRect(bx, by, bw, bh, 6, 6, "F");
    k.fill(C.tan); doc.roundedRect(bx, by, bw, 22, 6, 6, "F"); doc.rect(bx, by + 12, bw, 10, "F");
    k.fill(C.forest);
    [[bx + 10, by + 11], [bx + bw - 10, by + 11], [bx + 10, by + bh - 10], [bx + bw - 10, by + bh - 10]].forEach(([cx, cy]) => doc.circle(cx, cy, 2.4, "F"));
    k.setF("display", 12, C.forest);
    k.text("SOUTHBOUND", bx + bw / 2, by + 15.5, { align: "center", charSpace: 2 });
    const time = h.stats.find(s => s.label === "Time")?.value || "";
    const dist = h.stats.find(s => s.label === "Distance")?.value || "";
    const start = h.stats.find(s => s.label === "Start")?.value || "";
    k.setF("bodyBold", 6.5, C.muted);
    k.text(model.isRace ? "FINISH IN" : "RUN TIME", bx + bw / 2, by + 38, { align: "center", charSpace: 1.4 });
    k.setF("display", 50, C.forest);
    k.text(time, bx + bw / 2, by + 82, { align: "center" });
    k.setF("bodyBold", 7.5, C.forest);
    const meta = [dist, start ? `Start ${start}` : ""].filter(Boolean).join("  ·  ");
    if (meta) k.text(meta, bx + bw / 2, by + 99, { align: "center" });
    k.setF("mono", 7.5, C.tanDeep);
    k.text(`${model.targetCarbs || 0} G CARBS / HR`, bx + bw / 2, by + 113, { align: "center" });

    k.setF("body", 7.5, C.muted);
    k.text(`Made in Southbound on ${h.date}`, M, bandH + 20);
    k.setF("mono", 7, C.muted);
    k.text("southboundcoaching.com", W - M, bandH + 20, { align: "right" });
    k.y = bandH + 30;
}

function planSection(k, model, title) {
    const { doc, M, W } = k;
    let left = 4;
    model.brief.forEach((line, i) => {
        k.setF(i === 0 ? "bodyBold" : "body", i === 0 ? 10 : 9.5);
        left += k.wrap(line, 262 - 14).length * (i === 0 ? 13.5 : 12.8) + 5;
    });
    k.setF("body", 7.5);
    const whyH = model.why.length ? 12 + model.why.reduce((n, w) => n + k.wrap(w, k.CW).length * 9.5, 0) : 0;
    section(k, 1, "The plan", "per hour  ·  what you carry", title, Math.max(left, 182) + 4 + whyH);
    const top = k.y;
    // Left: the plan in plain words, the way a coach would say it.
    const lw = 262;
    let ly = top + 4;
    k.setF("body", 9.5, C.ink);
    model.brief.forEach((line, i) => {
        if (i === 0) k.setF("bodyBold", 10, C.forest); else k.setF("body", 9.5, C.ink);
        const ls = k.wrap(line, lw - 14);
        ls.forEach(l => { doc.text(l, M + 14, ly + 9); ly += i === 0 ? 13.5 : 12.8; });
        ly += 5;
    });
    k.fill(C.tan); doc.rect(M, top + 2, 3, Math.max(20, ly - top - 6), "F");

    // Right: three target gauges.
    const rx = M + 288, rw = W - M - rx;
    let ry = top;
    model.targets.forEach(t => {
        k.fill(C.panel2); k.stroke(C.line, 0.6); doc.roundedRect(rx, ry, rw, 50, 5, 5, "FD");
        k.setF("bodyBold", 6.5, C.muted);
        k.text(`${t.label.toUpperCase()} / HOUR`, rx + 10, ry + 13, { charSpace: 1 });
        if (t.basis) { const st = BASIS_CHIP[t.basis] || BASIS_CHIP.Estimate; chip(k, t.basis, rx + rw - 8, ry + 13, { ...st, align: "right" }); }
        k.setF("display", 26, C.forest);
        const num = String(t.value ?? "");
        k.text(num, rx + 10, ry + 38);
        const nw = k.width(num);
        k.setF("body", 8.5, C.muted);
        k.text(t.unitShort, rx + 13 + nw, ry + 38);
        k.setF("mono", 6.8, C.ink);
        k.text(t.plannedText, rx + rw - 10, ry + 32, { align: "right" });
        const frac = t.target ? t.planned / (t.target * 1.3) : 0;
        const ok = t.target && t.planned >= t.target * 0.85 && t.planned <= t.target * 1.2;
        bar(k, rx + rw - 118, ry + 38, 108, 4.5, frac, { color: ok ? C.sage : C.ochre, tick: 1 / 1.3 });
        ry += 56;
    });
    k.setF("bodyBold", 6.5, C.muted);
    k.text("CAFFEINE", rx + 10, ry + 8, { charSpace: 1 });
    k.setF("mono", 7.5, C.ink);
    k.text(model.caffeine, rx + 60, ry + 8);
    ry += 14;

    k.y = Math.max(ly, ry) + 4;
    if (model.why.length) {
        k.setF("bodyBold", 6.5, C.tanDeep);
        k.text("HOW THESE WERE SET", M, k.y + 6, { charSpace: 1.2 });
        k.y += 10;
        k.setF("body", 7.5, C.muted);
        model.why.forEach(w => k.wrap(w, k.CW).forEach(l => { doc.text(l, M, k.y + 7); k.y += 9.5; }));
        k.y += 2;
    }
}

function courseMap(k, model, title) {
    const m = model.map;
    if (!m || (!m.gels.length && !m.bottles.length && !m.sips.length)) return;
    const { doc, M, W } = k;
    const below = (m.bottles.length ? 1 : 0) + (m.sips.length ? 1 : 0);
    const mapH = 84 + below * 13 + (m.gels.length ? 0 : -20);
    section(k, 2, "The course", m.distanceMi ? "every gel and bottle, by mile" : "every gel and bottle, by minute", title, mapH + 8);
    const top = k.y;
    k.fill(C.panel2); doc.roundedRect(M, top, k.CW, mapH, 6, 6, "F");
    const x0 = M + 26, x1 = W - M - 26, axisY = top + (m.gels.length ? 58 : 38);
    const labelY = axisY + 12 + below * 13;
    const byMile = Boolean(m.distanceMi);
    const span = byMile ? m.distanceMi : m.durationMin || 1;
    const pos = (mile, min) => x0 + (x1 - x0) * Math.max(0, Math.min(1, (byMile ? (mile ?? (min / (m.durationMin || 1)) * span) : min) / span));

    // Bottles and drink-mix stretches under the line.
    m.bottles.forEach((b, i) => {
        const a = pos(b.startMile, b.startMin), z = pos(b.endMile, b.endMin);
        k.fill(i % 2 ? [96, 142, 150] : C.slate); doc.roundedRect(a + 1, axisY + 9, Math.max(4, z - a - 2), 10, 3, 3, "F");
        k.setF("bodyBold", 6, C.cream);
        if (z - a > 46) k.text(`BOTTLE ${b.n}`, (a + z) / 2, axisY + 16.2, { align: "center", charSpace: 0.6 });
    });
    m.sips.forEach((d, i) => {
        const a = pos(d.startMile, d.startMin), z = pos(d.endMile, d.endMin);
        k.fill(i % 2 ? C.ochreLight : [232, 206, 158]); doc.roundedRect(a + 1, axisY + 22, Math.max(4, z - a - 2), 8, 3, 3, "F");
        k.setF("bodyBold", 5.5, [112, 76, 18]);
        if (z - a > 40) k.text(`DRINK ${d.n}`, (a + z) / 2, axisY + 27.8, { align: "center" });
    });

    // The line, its ticks and the two ends.
    k.stroke(C.forest, 2.2); doc.line(x0, axisY, x1, axisY);
    const step = byMile ? (span <= 8 ? 1 : span <= 16 ? 2 : 5) : (span <= 90 ? 15 : 30);
    k.setF("mono", 6.2, C.muted);
    for (let v = step; v < span - step * 0.4; v += step) {
        const x = x0 + (x1 - x0) * (v / span);
        k.stroke(C.forest, 0.8); doc.line(x, axisY - 3, x, axisY + 3);
        k.text(byMile ? String(v) : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`, x, labelY, { align: "center" });
    }
    k.fill(C.forest); doc.circle(x0, axisY, 4.2, "F");
    k.fill(C.cream); doc.circle(x0, axisY, 1.6, "F");
    flagIcon(k, x1 - 1, axisY - 14);
    k.setF("bodyBold", 6, C.forest);
    k.text("START", x0 - 14, labelY, { charSpace: 0.6 });
    k.text("FINISH", x1 + 14, labelY, { align: "right", charSpace: 0.6 });
    if (m.startTod || m.finishTod) {
        k.setF("mono", 6, C.muted);
        if (m.startTod) k.text(m.startTod, x0 - 14, labelY + 8);
        if (m.finishTod) k.text(m.finishTod, x1 + 14, labelY + 8, { align: "right" });
    }

    // Gels above the line, numbered; caffeinated in ochre; close ones staggered.
    let lastX = -999, row = 0;
    m.gels.forEach(g => {
        const x = pos(g.mile, g.min);
        row = x - lastX < 26 ? (row + 1) % 2 : 0;
        lastX = x;
        const cy = axisY - 20 - row * 18;
        k.stroke(C.forest, 0.7); doc.line(x, axisY, x, cy + 7);
        k.fill(g.caffeine ? C.ochre : C.tan); k.stroke(C.forest, 1.1); doc.circle(x, cy, 7, "FD");
        k.setF("bodyBold", 7, C.forest);
        k.text(String(g.n), x, cy + 2.5, { align: "center" });
        k.setF("mono", 5.8, g.caffeine ? [112, 76, 18] : C.ink);
        k.text(`${g.time}${g.caffeine ? " CAF" : ""}`, x, cy - 10, { align: "center" });
    });

    // Key.
    const ky = top + 12;
    let kx = M + 12;
    k.fill(C.tan); k.stroke(C.forest, 0.8); doc.circle(kx + 3, ky - 2.5, 3, "FD");
    k.setF("body", 6.5, C.muted); k.text("Gel", kx + 9, ky); kx += 26;
    if (m.gels.some(g => g.caffeine)) { k.fill(C.ochre); doc.circle(kx + 3, ky - 2.5, 3, "FD"); k.text("Caffeinated", kx + 9, ky); kx += 48; }
    if (m.bottles.length) { k.fill(C.slate); doc.roundedRect(kx, ky - 5, 12, 5, 2, 2, "F"); k.text("Bottle", kx + 16, ky); kx += 40; }
    if (m.sips.length) { k.fill([232, 206, 158]); doc.roundedRect(kx, ky - 5, 12, 5, 2, 2, "F"); k.text("Drink mix", kx + 16, ky); }
    k.y = top + mapH + 8;
}

function scheduleSection(k, model, title) {
    if (!model.schedule.length) return;
    const { doc, M, W } = k;
    const hasClock = model.schedule.some(r => r.clock);
    const xTime = M + 10, xClock = M + 50, xMile = M + (hasClock ? 104 : 54), xIcon = xMile + 46, xWhat = xIcon + 20;
    const ww = W - M - xWhat - 8;
    // Normal rows, or compact ones when that keeps the whole schedule on one
    // page (a long race with 20+ checkpoints).
    const sizes = compact => compact
        ? { what: 8.5, whatLine: 10, detail: 6.8, detailLine: 8.2, pad: 6, time: 8.8, base: 10.5, icon: 0.8 }
        : { what: 9.5, whatLine: 11.5, detail: 7.5, detailLine: 9.5, pad: 10, time: 10, base: 12.5, icon: 1 };
    const rowH = (r, z) => {
        k.setF("bodyBold", z.what); const a = k.wrap(r.what, ww).length;
        k.setF("body", z.detail); const b = r.detail ? k.wrap(r.detail, ww).length : 0;
        return z.pad + a * z.whatLine + b * z.detailLine;
    };
    const total = z => model.schedule.reduce((n, r) => n + rowH(r, z), 0) + 4;
    const roomed = PAGE_ROOM - 30;
    const z = total(sizes(false)) > roomed && total(sizes(true)) <= roomed ? sizes(true) : sizes(false);
    const heading = model.isRace ? "Race-day schedule" : "Run schedule";
    section(k, 3, heading, hasClock ? "time  ·  clock  ·  mile" : "time  ·  mile", title, total(z));
    model.schedule.forEach((r, i) => {
        k.setF("bodyBold", z.what);
        const what = k.wrap(r.what, ww);
        k.setF("body", z.detail);
        const detail = r.detail ? k.wrap(r.detail, ww) : [];
        const h = z.pad + what.length * z.whatLine + detail.length * z.detailLine;
        if (k.y + h > PAGE.bottom) {
            newPage(k, title);
            k.setF("bodyBold", 7, C.tanDeep);
            k.text(`${heading.toUpperCase()}  ·  CONTINUED`, M, k.y + 2, { charSpace: 1.2 });
            k.y += 12;
        }
        const y = k.y;
        const base = y + z.base;
        if (i % 2 === 0) { k.fill(C.panel2); doc.rect(M, y, k.CW, h, "F"); }
        const accent = r.kind === "gel" ? (r.caffeine ? C.ochre : C.tan) : r.kind === "bottle" ? C.slate : r.kind === "sip" ? C.ochreLight : C.forest;
        k.fill(accent); doc.rect(M, y, 3, h, "F");
        k.setF("mono", z.time, C.forest); k.text(r.time, xTime, base + 0.5);
        if (hasClock) { k.setF("mono", z.detail, C.muted); k.text(r.clock, xClock, base); }
        k.setF("mono", z.detail, C.ink); k.text(r.mile !== "" ? `MI ${r.mile}` : "", xMile, base);
        const iy = base - 9.5 * z.icon;
        if (r.kind === "gel") gelIcon(k, xIcon, iy, r.caffeine ? C.ochre : C.tan);
        else if (r.kind === "bottle") bottleIcon(k, xIcon, iy);
        else if (r.kind === "sip") bottleIcon(k, xIcon, iy, C.ochreLight);
        else if (r.kind === "finish") flagIcon(k, xIcon, iy);
        else startIcon(k, xIcon, iy);
        let yy = base;
        k.setF("bodyBold", z.what, C.ink); what.forEach(l => { doc.text(l, xWhat, yy); yy += z.whatLine; });
        k.setF("body", z.detail, C.muted); detail.forEach(l => { doc.text(l, xWhat, yy - 1.5); yy += z.detailLine; });
        k.y += h;
    });
    k.y += 4;
}

function needSection(k, model, title) {
    if (!model.carry.length && !model.drink && !model.before) return;
    const { doc, M, W } = k;
    const colW = model.drink ? 250 : k.CW;
    // Measure both columns first so they stay together.
    k.setF("body", 7.5);
    const carryH = 22 + model.carry.length * 26 + (model.before ? 14 + k.wrap(model.before, colW - 20).length * 10 : 0);
    const dx = M + colW + 18, dw = W - M - dx;
    const drinkFont = kind => kind === "perBottle" ? k.setF("bodyBold", 8.5, C.cream)
        : kind === "totals" ? k.setF("mono", 7.5, C.tan) : k.setF("body", 8, C.tanLight);
    let drinkLines = [];
    if (model.drink) {
        // Each line is measured in the font it's drawn in (below).
        const wrapIn = (kind, text) => { drinkFont(kind); return k.wrap(text, dw - 24).map(l => [kind, l]); };
        drinkLines = [
            ...wrapIn("perBottle", model.drink.perBottle),
            ...(model.drink.batch ? wrapIn("batch", model.drink.batch) : []),
            ["totals", model.drink.totals],
            ...(model.drink.notes ? wrapIn("notes", model.drink.notes) : [])
        ];
    }
    const drinkH = model.drink ? 52 + drinkLines.length * 11 : 0;
    section(k, 4, "What you need", "", title, Math.max(carryH, drinkH) + 8);
    const top = k.y;

    k.image("fuel", M, top - 2, 26, 26);
    k.setF("bodyBold", 6.5, C.tanDeep);
    k.text("IN YOUR POCKETS", M + 32, top + 13, { charSpace: 1.2 });
    let y = top + 28;
    if (!model.carry.length) { k.setF("body", 8.5, C.muted); k.text("No gels or chews in this plan.", M + 32, y + 6); y += 18; }
    model.carry.forEach(c => {
        k.setF("display", 22, C.forest);
        const q = `${c.qty}×`;
        k.text(q, M, y + 14);
        k.setF("bodyBold", 9.5, C.ink); k.text(k.fit(c.name, colW - 42), M + 36, y + 7);
        k.setF("body", 7.5, C.muted); k.text(k.fit(c.each, colW - 42), M + 36, y + 17);
        y += 26;
    });
    if (model.before) {
        chip(k, "Before", M, y + 8, { fill: C.forest, color: C.cream });
        k.setF("body", 8.5, C.ink);
        k.wrap(model.before, colW - 52).forEach((l, i) => doc.text(l, M + 48, y + 8 + i * 10.5));
        y += 14 + k.wrap(model.before, colW - 52).length * 10;
    }

    if (model.drink) {
        k.fill(C.forest); doc.roundedRect(dx, top, dw, drinkH, 7, 7, "F");
        k.streaks(dx + dw - 140, top, drinkH, 4, 22, dx + dw - 6);
        k.image("hydrate", dx + dw - 46, top + 8, 36, 36);
        k.setF("bodyBold", 6.5, C.tan);
        k.text("YOUR DRINK", dx + 14, top + 18, { charSpace: 1.4 });
        k.setF("display", 18, C.cream);
        k.text(`${model.drink.bottles} bottle${model.drink.bottles === 1 ? "" : "s"}, each:`, dx + 14, top + 38);
        let yy = top + 54;
        drinkLines.forEach(([kind, l]) => {
            drinkFont(kind);
            doc.text(l, dx + 14, yy); yy += 11;
        });
    }
    k.y = top + Math.max(y - top, drinkH) + 8;
}

function hoursSection(k, model, title) {
    if (!model.hours.length) return;
    const { doc, M, W } = k;
    const rowH = 30;
    section(k, 5, "Hour by hour", "what you take in against the target", title, model.hours.length * rowH + 4);
    const metrics = [["carbs", "Carbs", "g"], ["fluid", "Fluid", null], ["sodium", "Sodium", "mg"]];
    model.hours.forEach((h, i) => {
        ensure(k, rowH, title);
        const y = k.y;
        if (i % 2 === 0) { k.fill(C.panel2); doc.rect(M, y, k.CW, rowH - 2, "F"); }
        k.setF("mono", 8.5, C.forest);
        k.text(h.label.replace(/\s/g, ""), M + 8, y + 17);
        metrics.forEach(([key, label, unitWord], j) => {
            const x = M + 92 + j * 128;
            const [have, want] = h.nums?.[key] || [0, 0];
            k.setF("bodyBold", 5.8, C.muted);
            k.text(label.toUpperCase(), x, y + 10, { charSpace: 0.8 });
            k.setF("mono", 7, C.ink);
            const val = key === "fluid" ? `${h.fluidText[0]} / ${h.fluidText[1]}` : `${have} / ${want} ${unitWord}`;
            k.text(val, x + 112, y + 10, { align: "right" });
            const ok = want && have >= want * 0.85 && have <= want * 1.2;
            bar(k, x, y + 15, 112, 4.5, want ? have / (want * 1.4) : 0, { color: ok ? C.sage : C.ochre, tick: 1 / 1.4 });
        });
        if (h.status) {
            const st = h.status === "On target" ? { fill: C.sageLight, color: [40, 84, 52] } : { fill: C.ochreLight, color: [112, 76, 18] };
            chip(k, h.status, W - M - 8, y + 18, { ...st, align: "right" });
        }
        k.y += rowH;
    });
    k.y += 4;
}

function notesSection(k, model, title) {
    const { doc, M, W } = k;
    const hasWarn = model.warnings.length > 0;
    const extra = model.isRace ? model.sideways : model.practice;
    if (!hasWarn && !(extra && extra.length)) return;
    k.setF("body", 8.5);
    const warnH = hasWarn ? 22 + model.warnings.reduce((n, w) => n + k.wrap(w, k.CW - 30).length, 0) * 11 + 8 : 0;
    const sideH = model.isRace && model.sideways.length ? 28 + model.sideways.length * 13 : 0;
    const logH = !model.isRace && model.practice?.length ? 30 + model.practice.length * 22 + 16 + 8 : 0;
    section(k, 6, model.isRace ? "Coach's notes" : "Coach's notes + your log", "", title, warnH + sideH + logH);
    if (hasWarn) {
        k.setF("body", 8.5);
        const lines = model.warnings.flatMap(w => k.wrap(w, k.CW - 30).map((l, i) => [i === 0, l]));
        const h = 22 + lines.length * 11;
        ensure(k, h + 6, title);
        const y = k.y;
        k.fill(C.ochreLight); doc.roundedRect(M, y, k.CW, h, 5, 5, "F");
        k.fill(C.ochre); doc.rect(M, y, 4, h, "F");
        k.setF("bodyBold", 6.5, [112, 76, 18]);
        k.text("WORTH A LOOK", M + 14, y + 13, { charSpace: 1.2 });
        let yy = y + 25;
        lines.forEach(([first, l]) => {
            k.setF("body", 8.5, C.ink);
            if (first) { k.fill(C.ochre); doc.circle(M + 16, yy - 3, 1.6, "F"); }
            doc.text(l, M + 22, yy); yy += 11;
        });
        k.y = y + h + 8;
    }
    if (model.isRace && model.sideways.length) {
        k.setF("body", 8.5);
        const rows = model.sideways.map(s => { const [head, ...rest] = s.split(": "); return [head, rest.join(": ")]; });
        const h = 20 + rows.length * 13;
        ensure(k, h, title);
        k.setF("bodyBold", 6.5, C.tanDeep);
        k.text("IF IT GOES SIDEWAYS", M, k.y + 8, { charSpace: 1.2 });
        k.y += 24;
        rows.forEach(([head, rest]) => {
            k.slash(M, k.y - 7.5, 9, C.tan);
            k.setF("bodyBold", 8.5, C.forest); k.text(head, M + 12, k.y);
            const hw = k.width(head) + 5;
            k.setF("body", 8.5, C.ink); k.text(k.fit(rest, k.CW - 14 - hw), M + 12 + hw, k.y);
            k.y += 13;
        });
        k.y += 4;
    }
    if (!model.isRace && model.practice?.length) {
        const h = 30 + model.practice.length * 22 + 16;
        ensure(k, h, title);
        const y = k.y;
        k.stroke(C.forest, 0.9); k.fill([255, 255, 255]);
        doc.roundedRect(M, y, k.CW, h, 6, 6, "FD");
        k.setF("display", 15, C.forest);
        k.text("After the run", M + 14, y + 20);
        k.setF("body", 7.5, C.muted);
        k.text("Fill this in while it's fresh. It's how the next plan gets better.", M + 104, y + 19);
        let yy = y + 42;
        model.practice.forEach(p => {
            k.setF("bodyBold", 8.5, C.ink);
            k.text(p.label, M + 14, yy);
            const x = M + 170;
            k.stroke(C.line, 0.8);
            if (p.kind === "count") {
                doc.line(x, yy + 2, x + 40, yy + 2);
                k.setF("body", 8.5, C.muted); k.text(`of ${p.of}`, x + 46, yy);
            } else if (p.kind === "scale") {
                for (let n = 1; n <= 5; n++) {
                    k.stroke(C.forest, 0.8); doc.circle(x + 6 + (n - 1) * 26, yy - 3, 7, "S");
                    k.setF("mono", 7.5, C.forest); k.text(String(n), x + 6 + (n - 1) * 26, yy - 0.5, { align: "center" });
                }
                k.setF("body", 7, C.muted); k.text(`1 = ${p.low}  ·  5 = ${p.high}`, x + 140, yy - 1);
            } else {
                doc.line(x, yy + 2, W - M - 14, yy + 2);
                doc.line(M + 14, yy + 18, W - M - 14, yy + 18);
                yy += 16;
            }
            yy += 22;
        });
        k.y = y + h + 8;
    }
}

function checklistSection(k, model, title) {
    if (!model.checklist.length) return;
    const { doc, M } = k;
    const n = model.checklist.length, gap = 14, w = (k.CW - gap * (n - 1)) / n;
    k.setF("body", 8.5);
    const cols = model.checklist.map(g => g.items.map(it => k.wrap(it, w - 16)));
    const h = 22 + Math.max(...cols.map(c => c.reduce((s, ls) => s + ls.length * 10.5 + 5, 0)));
    section(k, 7, model.isRace ? "Race-day checklist" : "Checklist", "", title, h);
    const top = k.y;
    model.checklist.forEach((g, i) => {
        const x = M + i * (w + gap);
        k.setF("bodyBold", 7, C.forest);
        k.text(g.title.toUpperCase(), x, top + 8, { charSpace: 1 });
        k.fill(C.tan); doc.rect(x, top + 12, 24, 2, "F");
        let y = top + 26;
        cols[i].forEach(ls => {
            k.stroke(C.forest, 0.9); doc.roundedRect(x, y - 7.5, 8.5, 8.5, 1.5, 1.5, "S");
            k.setF("body", 8.5, C.ink);
            ls.forEach((l, j) => doc.text(l, x + 14, y + j * 10.5));
            y += ls.length * 10.5 + 5;
        });
    });
    k.y = top + h + 4;
}

function pocketCards(k, model, title) {
    const rows = model.pocket;
    if (!rows.length) return;
    const { doc, M } = k;
    const dense = rows.length > 18;
    const rh = dense ? 10.5 : 13, cw = 250, gap = k.CW - cw * 2;
    const ch = 40 + rows.length * rh + 20;
    section(k, 8, "Pocket card", "cut along the dashed line  ·  one for your pocket, one for your bottle", title, ch + 18);
    const top = k.y + 4;
    const hasClock = rows.some(r => r.clock);
    [0, 1].forEach(c => {
        const x = M + c * (cw + gap);
        doc.setLineDashPattern([3, 2.5], 0);
        k.stroke(C.muted, 0.6); doc.roundedRect(x - 6, top - 6, cw + 12, ch + 12, 4, 4, "S");
        doc.setLineDashPattern([], 0);
        k.fill([255, 255, 255]); doc.roundedRect(x, top, cw, ch, 5, 5, "F");
        k.fill(C.forest); doc.roundedRect(x, top, cw, 30, 5, 5, "F"); doc.rect(x, top + 20, cw, 10, "F");
        k.streaks(x + cw - 80, top, 30, 3, 18, x + cw - 4);
        k.image("markCream", x + 9, top + 8, 22, 14);
        k.setF("display", 13, C.cream);
        if (k.width(model.header.title) > cw - 100) k.setF("display", 10.5, C.cream);
        k.text(k.fit(model.header.title, cw - 100), x + 38, top + 20);
        k.setF("mono", 6.8, C.tan);
        k.text(`${model.targetCarbs || 0} G/HR`, x + cw - 10, top + 19, { align: "right" });
        let y = top + 30 + (dense ? 11 : 14);
        rows.forEach((r, i) => {
            if (i % 2 === 1) { k.fill(C.panel2); doc.rect(x, y - rh + 3.5, cw, rh, "F"); }
            const dot = r.kind === "gel" ? (r.caffeine ? C.ochre : C.tan) : r.kind === "bottle" ? C.slate : r.kind === "sip" ? C.ochreLight : C.forest;
            k.fill(dot); doc.circle(x + 9, y - 2.5, 2.4, "F");
            k.setF("mono", dense ? 7.6 : 8.6, C.forest); k.text(r.time, x + 16, y);
            if (hasClock) { k.setF("mono", dense ? 6.4 : 7, C.muted); k.text(r.clock, x + 50, y); }
            k.setF("mono", dense ? 6.8 : 7.6, C.ink); k.text(r.mile !== "" ? `MI ${r.mile}` : "", x + (hasClock ? 100 : 56), y);
            k.setF("bodyBold", dense ? 7 : 8, r.caffeine ? [112, 76, 18] : C.ink); k.text(r.what, x + cw - 10, y, { align: "right" });
            y += rh;
        });
        k.setF("brand", 6.5, C.forest);
        k.text("Southbound", x + 10, top + ch - 7);
        const t = model.targets;
        k.setF("mono", 6.2, C.muted);
        k.text(`${t[0]?.perHour || ""}  ·  ${t[1]?.perHour || ""}  ·  ${t[2]?.perHour || ""}`, x + cw - 10, top + ch - 7, { align: "right" });
    });
    k.y = top + ch + 14;
}

// ---------- The Fuel Shelf (popular products) ----------

const SHELF_ART = { gels: "fuel", chews: "fuel", drinks: "hydrate", electrolytes: "water", food: "fruit" };

function shelfHeader(k, sources, { first = true } = {}) {
    const { doc, W, M } = k;
    const bandH = first ? 132 : 0;
    if (!first) return;
    k.fill(C.forest); doc.rect(0, 0, W, bandH, "F");
    k.streaks(W - 300, 0, bandH, 7, 32);
    k.fill(C.tan); doc.rect(0, bandH, W, 4, "F");
    k.image("markCream", M, 24, 40, 25.6);
    wordmark(k, M + 48, 39, { size: 12 });
    k.setF("display", 38, C.cream);
    k.text("The Fuel Shelf", M, 92);
    k.setF("body", 9, C.tanLight);
    k.text("Popular gels, chews, drinks and real food, per serving. Add any of them to your library in Southbound.", M, 110);
    k.image("raceDay", W - M - 64, 30, 64, 64);
    k.setF("body", 7, C.muted);
    k.wrap(sources.note, k.CW).forEach((l, i) => doc.text(l, M, bandH + 20 + i * 9));
    k.y = bandH + 36;
}

function shelfCard(k, item, x, y, w, h) {
    const { doc } = k;
    const caf = /(\d+)\s*mg caffeine/.exec(item.line)?.[1];
    const carbs = Number(/(\d+)\s*g carbs/.exec(item.line)?.[1] || 0);
    const sodium = /(\d+)\s*mg sodium/.exec(item.line)?.[1];
    const water = /with (.+) water/.exec(item.line)?.[1];
    k.fill([255, 255, 255]); k.stroke(C.line, 0.6); doc.roundedRect(x, y, w, h, 5, 5, "FD");
    k.fill(caf ? C.ochre : C.tan); doc.rect(x, y + 6, 3, h - 12, "F");
    k.setF("bodyBold", 8.8, C.ink);
    k.text(k.fit(item.name, w - 24), x + 12, y + 14);
    k.setF("body", 6.8, C.muted);
    k.text(k.fit(item.serving, w - 24), x + 12, y + 23.5);
    // Carbs: a bar against 80 g and the number in the display face.
    k.setF("display", 17, C.forest);
    k.text(`${carbs}`, x + 12, y + 43);
    const cw = k.width(`${carbs}`);
    k.setF("bodyBold", 5.6, C.muted);
    k.text("G CARBS", x + 14 + cw, y + 43, { charSpace: 0.5 });
    bar(k, x + 12, y + 47, 100, 3.5, carbs / 80, { color: C.tan });
    k.setF("mono", 7, C.ink);
    k.text(sodium ? `${sodium} mg sodium` : "little sodium", x + w - 10, y + 36, { align: "right" });
    if (water) { k.setF("mono", 6.4, C.muted); k.text(`+ ${water} water`, x + w - 10, y + 45, { align: "right" }); }
    if (caf) chip(k, `${caf} mg caffeine`, x + w - 10, water ? y + 26 : y + 46, { fill: C.ochreLight, color: [112, 76, 18], align: "right" });
    if (item.note) {
        k.setF("body", 6.6, C.muted);
        k.wrap(item.note, w - 24).slice(0, 2).forEach((l, i) => doc.text(l, x + 12, y + 62 + i * 8.5));
    }
}

function drawShelf(k, sources, { first = true } = {}) {
    if (!sources) return;
    const { doc, M } = k;
    const shelfTitle = SHELF;
    if (first) shelfHeader(k, sources);
    else { k.doc.addPage(); k.paper(); shelfHeader(k, sources); }
    const gap = 10, w = (k.CW - gap) / 2;
    const pairH = pair => 56 + Math.max(...pair.map(it => (it.note ? Math.min(2, k.wrap(it.note, w - 24).length) * 8.5 + 4 : 0)));
    for (const g of sources.groups) {
        // A group (heading + all its cards) stays on one page.
        k.setF("body", 6.6);
        let groupH = 34;
        for (let i = 0; i < g.items.length; i += 2) groupH += pairH(g.items.slice(i, i + 2)) + gap;
        ensure(k, Math.min(groupH, PAGE_ROOM), shelfTitle);
        k.y += 6;
        k.image(SHELF_ART[g.id] || "fuel", M, k.y - 4, 22, 22);
        k.setF("display", 17, C.forest);
        k.text(g.title, M + 28, k.y + 12);
        k.setF("body", 7.5, C.muted);
        k.text(g.note, k.W - M, k.y + 11, { align: "right" });
        k.y += 22;
        k.setF("body", 6.6);
        for (let i = 0; i < g.items.length; i += 2) {
            const pair = g.items.slice(i, i + 2);
            const h = pairH(pair);
            ensure(k, h + gap, shelfTitle);
            pair.forEach((it, j) => shelfCard(k, it, M + j * (w + gap), k.y, w, h));
            k.setF("body", 6.6);
            k.y += h + gap;
        }
    }
}

// ---------- Documents ----------

/** Draws a plan's model. Exported for the browser tests. */
export function drawPdf(JsPDF, model, assets = {}) {
    const k = kit(JsPDF, assets);
    const title = model.header.title;
    k.paper();
    headerBand(k, model);
    planSection(k, model, title);
    courseMap(k, model, title);
    scheduleSection(k, model, title);
    needSection(k, model, title);
    hoursSection(k, model, title);
    notesSection(k, model, title);
    checklistSection(k, model, title);
    pocketCards(k, model, title);
    if (model.sources) drawShelf(k, model.sources, { first: false });
    footers(k, model);
    k.doc.setProperties({ title: `${title} · Southbound fuel plan`, subject: "Fueling plan", author: "Southbound Coaching", creator: "Southbound" });
    return k.doc;
}

function drawShelfDoc(JsPDF, model, assets = {}) {
    const k = kit(JsPDF, assets);
    k.paper();
    drawShelf(k, model.sources, { first: true });
    footers(k, model);
    k.doc.setProperties({ title: "The Fuel Shelf · Southbound", subject: "Popular fueling sources", author: "Southbound Coaching", creator: "Southbound" });
    return k.doc;
}

async function assets() {
    const [JsPDF, fonts, art] = await Promise.all([loadJsPdf(), loadFonts(), loadArt()]);
    return { JsPDF, fonts, art };
}

/** The PDF as a Blob, for a plan object (buildPlanObject's shape). */
export async function fuelPdfBlob(plan, { unit = "oz", sources = false } = {}) {
    const { JsPDF, fonts, art } = await assets();
    const schedule = buildSchedule(scheduleInputFromPlan(plan));
    const model = pdfModel(plan, schedule, { unit, sources });
    return drawPdf(JsPDF, model, { fonts, art }).output("blob");
}

export async function sourcesPdfBlob({ unit = "oz" } = {}) {
    const { JsPDF, fonts, art } = await assets();
    const model = pdfModel({ name: "The Fuel Shelf" }, null, { unit, sources: true });
    return drawShelfDoc(JsPDF, model, { fonts, art }).output("blob");
}

/** Hands a finished PDF to the person: the share sheet when the phone takes files, else a download. */
async function deliver(blob, name, title) {
    const file = new File([blob], name, { type: "application/pdf" });
    let canShare = false;
    try { canShare = Boolean(navigator.canShare?.({ files: [file] })); } catch { canShare = false; }
    if (canShare) {
        // The share sheet needs a fresh tap (making the PDF took a moment).
        const choice = await sbChoose("Your PDF is ready.", {
            title,
            choices: [{ label: "Save file", value: "save" }, { label: "Share / Save to Files", value: "share", primary: true }]
        });
        if (!choice) return;
        if (choice === "share") {
            try { await navigator.share({ files: [file], title }); return; }
            catch (error) { if (error?.name === "AbortError") return; }
        }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast("PDF downloaded.");
}

async function run(button, make, name, title) {
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "Making the PDF…"; }
    try {
        const blob = await make();
        await deliver(blob, name, title);
    } catch (error) {
        console.warn("Fueling PDF:", error);
        toast(navigator.onLine === false
            ? "The PDF maker needs a connection the first time. Try again online, or use Print."
            : "Couldn't make the PDF. Try again, or use Print.", { type: "error" });
    } finally {
        if (button) { button.disabled = false; button.textContent = label; }
    }
}

export function downloadFuelPdf(plan, { unit = "oz", button = null } = {}) {
    return run(button, () => fuelPdfBlob(plan, { unit }), pdfFileName(plan), plan.name || "Fueling plan");
}

export function downloadSourcesPdf({ unit = "oz", button = null } = {}) {
    return run(button, () => sourcesPdfBlob({ unit }), "southbound-fuel-shelf.pdf", "The Fuel Shelf");
}
