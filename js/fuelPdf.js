/* ==========================================
   Southbound — a fueling plan as a PDF (drawing + download)

   downloadFuelPdf(plan, { unit }) loads jsPDF on the first tap (from
   jsDelivr; the service worker keeps it after that), draws the rows from
   pdfModel (js/fuelPdfModel.js) onto US Letter pages and hands the file
   over: the phone's share sheet where it can take a file (iPhone / the
   installed app: Save to Files, Messages, AirDrop...), else a download.
   Nothing is uploaded: the PDF is made on the device.

   downloadSourcesPdf({ unit }) is the popular-products guide alone.
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

// The cream-and-tan mark as a PNG for the header band.
let markPromise = null;
function markPng() {
    if (!markPromise) {
        markPromise = new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                try {
                    const c = document.createElement("canvas");
                    c.width = 372; c.height = 238;
                    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
                    resolve(c.toDataURL("image/png"));
                } catch { resolve(null); }
            };
            img.onerror = () => resolve(null);
            img.src = new URL("../brand/sb-mark.svg", import.meta.url).href;
        });
    }
    return markPromise;
}

const C = {
    forest: [14, 37, 27], tan: [184, 155, 110], cream: [243, 239, 230], ink: [28, 36, 31],
    muted: [104, 112, 106], line: [214, 208, 196], soft: [247, 244, 238],
    good: [77, 128, 92], bad: [176, 84, 64], warn: [168, 122, 40]
};

const PAGE = { w: 612, h: 792, m: 42 };

/** Draws the model into a jsPDF document. Exported for the browser tests. */
export function drawPdf(JsPDF, model, { mark = null } = {}) {
    const doc = new JsPDF({ unit: "pt", format: "letter" });
    const W = PAGE.w, M = PAGE.m, CW = W - 2 * M;
    let y = 0;

    const font = (size, style = "normal", color = C.ink) => { doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color); };
    const text = (t, x, yy, opts) => doc.text(pdfSafe(t), x, yy, opts);
    const wrap = (t, width) => doc.splitTextToSize(pdfSafe(t), width);
    const newPage = () => { doc.addPage(); y = M; };
    const ensure = h => { if (y + h > PAGE.h - M - 18) newPage(); };

    const section = (title, sub = "") => {
        ensure(46);
        y += 10;
        doc.setFillColor(...C.tan); doc.rect(M, y - 9, 3, 13, "F");
        font(12.5, "bold", C.forest); text(title.toUpperCase(), M + 10, y + 2);
        if (sub) { font(8.5, "normal", C.muted); text(sub, W - M, y + 2, { align: "right" }); }
        y += 14;
    };

    const para = (t, { size = 9.5, color = C.ink, style = "normal", indent = 0, gap = 3 } = {}) => {
        font(size, style, color);
        const lines = wrap(t, CW - indent);
        const lh = size * 1.3;
        for (const line of lines) { ensure(lh); doc.text(line, M + indent, y + size * 0.8); y += lh; }
        y += gap;
    };

    // ---- Header band ----
    const h = model.header;
    doc.setFillColor(...C.forest); doc.rect(0, 0, W, 112, "F");
    doc.setFillColor(...C.tan); doc.rect(0, 112, W, 3, "F");
    if (mark) { try { doc.addImage(mark, "PNG", M, 24, 58, 37); } catch { /* no logo */ } }
    font(8, "bold", C.tan); text("SOUTHBOUND COACHING · FUELING PLAN", M + (mark ? 72 : 0), 34);
    font(21, "bold", C.cream);
    const titleLines = wrap(h.title, CW - (mark ? 72 : 0) - 90).slice(0, 2);
    titleLines.forEach((line, i) => doc.text(line, M + (mark ? 72 : 0), 57 + i * 22));
    font(9.5, "normal", C.cream); text(h.subtitle, M + (mark ? 72 : 0), titleLines.length > 1 ? 99 : 76);
    font(8.5, "normal", C.tan); text(h.date, W - M, 34, { align: "right" });
    y = 132;

    // ---- Stat boxes ----
    const stats = h.stats.slice(0, 6);
    if (stats.length) {
        const gap = 6, bw = (CW - gap * (stats.length - 1)) / stats.length;
        stats.forEach((s, i) => {
            const x = M + i * (bw + gap);
            doc.setFillColor(...C.soft); doc.setDrawColor(...C.line); doc.roundedRect(x, y, bw, 50, 4, 4, "FD");
            font(7, "bold", C.muted); text(s.label.toUpperCase(), x + 8, y + 13);
            font(14, "bold", C.forest); text(s.value, x + 8, y + 31);
            if (s.sub) { font(7, "normal", C.muted); text(s.sub, x + 8, y + 43); }
        });
        y += 62;
    }

    // ---- Targets ----
    section("Targets", "per hour · whole run");
    {
        const gap = 8, bw = (CW - gap * 2) / 3;
        model.targets.forEach((t, i) => {
            const x = M + i * (bw + gap);
            doc.setDrawColor(...C.tan); doc.setLineWidth(1); doc.roundedRect(x, y, bw, 46, 4, 4, "S");
            font(8, "bold", C.muted); text(t.label.toUpperCase(), x + 10, y + 14);
            if (t.basis) { font(7, "normal", C.tan); text(t.basis, x + bw - 10, y + 14, { align: "right" }); }
            font(15, "bold", C.forest); text(t.perHour, x + 10, y + 33);
            font(8.5, "normal", C.muted); text(t.total, x + bw - 10, y + 33, { align: "right" });
        });
        doc.setLineWidth(0.5);
        y += 56;
    }
    if (model.why.length) {
        font(8.5, "bold", C.muted); ensure(14); text("How the targets were set", M, y + 7); y += 12;
        model.why.forEach(w => para(w, { size: 8.5, color: C.muted, gap: 1 }));
        y += 2;
    }
    para(`Caffeine: ${model.caffeine}`, { size: 9, color: C.muted });

    // ---- What to carry + drink ----
    if (model.carry.length || model.drink || model.before) {
        section("What you need");
        if (model.before) para(`Before: ${model.before}`, { size: 9.5 });
        model.carry.forEach(c => {
            ensure(16);
            font(10, "bold", C.forest); text(`${c.qty} ×`, M, y + 9);
            font(10, "bold", C.ink); text(c.name, M + 28, y + 9);
            font(8.5, "normal", C.muted); text(c.each, W - M, y + 9, { align: "right" });
            y += 15;
        });
        if (model.drink) {
            y += 4;
            const d = model.drink;
            const lines = [d.perBottle, d.batch, d.totals, d.notes].filter(Boolean);
            const wrapped = lines.map(l => wrap(l, CW - 24));
            const boxH = 24 + wrapped.reduce((n, l) => n + l.length * 12, 0);
            ensure(boxH + 6);
            doc.setFillColor(...C.soft); doc.roundedRect(M, y, CW, boxH, 4, 4, "F");
            font(9, "bold", C.forest); text(`Your drink · ${d.bottles} bottle${d.bottles === 1 ? "" : "s"} · each bottle:`, M + 12, y + 15);
            let yy = y + 28;
            wrapped.forEach((ls, i) => {
                font(9, i === 0 ? "bold" : "normal", i === 0 ? C.ink : C.muted);
                ls.forEach(l => { doc.text(l, M + 12, yy); yy += 12; });
            });
            y += boxH + 8;
        }
    }

    // ---- Schedule ----
    if (model.schedule.length) {
        section("Race-day schedule", model.schedule.some(r => r.clock) ? "time · clock · mile" : "time · mile");
        const hasClock = model.schedule.some(r => r.clock);
        const colTime = M, colClock = M + 40, colMile = M + (hasClock ? 98 : 44), colWhat = colMile + 40;
        const whatW = W - M - colWhat;
        model.schedule.forEach((r, i) => {
            font(9.5, "bold", C.ink);
            const whatLines = wrap(r.what, whatW);
            font(8, "normal", C.muted);
            const detailLines = r.detail ? wrap(r.detail, whatW) : [];
            const rowH = 8 + whatLines.length * 12 + detailLines.length * 10.5;
            ensure(rowH);
            if (i % 2 === 0) { doc.setFillColor(...C.soft); doc.rect(M - 4, y, CW + 8, rowH, "F"); }
            const dot = r.kind === "gel" ? (r.caffeine ? C.warn : C.tan) : r.kind === "sip" || r.kind === "bottle" ? [80, 126, 140] : C.forest;
            doc.setFillColor(...dot); doc.circle(colWhat - 8, y + 9, 2.4, "F");
            font(9.5, "bold", C.forest); text(r.time, colTime, y + 12);
            if (hasClock) { font(8.5, "normal", C.muted); text(r.clock, colClock, y + 12); }
            font(8.5, "normal", C.muted); text(r.mile ? `mi ${r.mile}` : "", colMile, y + 12);
            let yy = y + 12;
            font(9.5, "bold", C.ink); whatLines.forEach(l => { doc.text(l, colWhat, yy); yy += 12; });
            font(8, "normal", C.muted); detailLines.forEach(l => { doc.text(l, colWhat, yy - 1); yy += 10.5; });
            y += rowH;
        });
        y += 6;
    }

    // ---- Hour by hour ----
    if (model.hours.length) {
        section("Hour by hour", "what you take in vs the target");
        const cols = [M, M + 110, M + 230, M + 350, W - M];
        // Keep the table on one page when it fits on one.
        const tableH = 13 + model.hours.length * 15;
        ensure(tableH < PAGE.h - 2 * M - 40 ? tableH : 16);
        font(7.5, "bold", C.muted);
        ["HOUR", "CARBS", "FLUID", "SODIUM"].forEach((t, i) => text(t, cols[i], y + 8));
        text("", cols[4], y + 8, { align: "right" });
        y += 13;
        model.hours.forEach(hr => {
            ensure(15);
            doc.setDrawColor(...C.line); doc.line(M, y, W - M, y);
            font(9, "normal", C.ink);
            text(hr.label, cols[0], y + 10); text(hr.carbs, cols[1], y + 10); text(hr.fluid, cols[2], y + 10); text(hr.sodium, cols[3], y + 10);
            font(8.5, "bold", hr.status === "On target" ? C.good : hr.status ? C.warn : C.muted);
            text(hr.status, cols[4], y + 10, { align: "right" });
            y += 15;
        });
        y += 6;
    }

    // ---- Worth a look ----
    if (model.warnings.length) {
        section("Worth a look");
        model.warnings.forEach(w => para(`• ${w}`, { size: 9, color: C.ink, indent: 4, gap: 2 }));
    }

    // ---- Checklist ----
    if (model.checklist.length) {
        section("Packing checklist");
        model.checklist.forEach(c => {
            font(9.5, "normal", C.ink);
            const lines = wrap(c, CW - 20);
            ensure(lines.length * 12 + 4);
            doc.setDrawColor(...C.forest); doc.setLineWidth(0.8); doc.rect(M, y + 1, 9, 9, "S"); doc.setLineWidth(0.5);
            lines.forEach((l, i) => doc.text(l, M + 17, y + 9 + i * 12));
            y += lines.length * 12 + 4;
        });
    }

    // ---- Popular fueling sources ----
    if (model.sources) drawSources(doc, model.sources, { font, text, wrap, newPage, ensure, getY: () => y, setY: v => { y = v; }, startNewPage: true });

    // ---- Footer on every page ----
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setDrawColor(...C.line); doc.line(M, PAGE.h - 34, W - M, PAGE.h - 34);
        font(7.5, "normal", C.muted);
        text(model.footer, M, PAGE.h - 22);
        text(`${p} / ${pages}`, W - M, PAGE.h - 22, { align: "right" });
    }
    return doc;
}

function drawSources(doc, sources, k) {
    const W = PAGE.w, M = PAGE.m, CW = W - 2 * M;
    if (k.startNewPage) k.newPage();
    let y = k.getY();
    doc.setFillColor(...C.forest); doc.rect(M, y, CW, 44, "F");
    k.font(15, "bold", C.cream); k.text("Popular fueling sources", M + 14, y + 20);
    k.font(8.5, "normal", C.tan); k.text("A quick reference: carbs, sodium and caffeine per serving", M + 14, y + 35);
    y += 54;
    k.font(8, "normal", C.muted);
    k.wrap(sources.note, CW).forEach(l => { doc.text(l, M, y + 7); y += 10; });
    y += 4;
    k.setY(y);
    for (const g of sources.groups) {
        k.ensure(40);
        y = k.getY() + 8;
        doc.setFillColor(...C.tan); doc.rect(M, y - 8, 3, 12, "F");
        k.font(11, "bold", C.forest); k.text(g.title, M + 9, y + 2);
        k.font(8, "normal", C.muted); k.text(g.note, W - M, y + 2, { align: "right" });
        y += 10;
        k.setY(y);
        g.items.forEach((item, i) => {
            const noteLines = item.note ? k.wrap(item.note, CW - 16) : [];
            const rowH = 26 + noteLines.length * 9.5;
            k.ensure(rowH);
            y = k.getY();
            if (i % 2 === 0) { doc.setFillColor(...C.soft); doc.rect(M - 4, y, CW + 8, rowH, "F"); }
            k.font(9.5, "bold", C.ink); k.text(item.name, M + 4, y + 11);
            k.font(8, "normal", C.muted); k.text(item.serving, W - M - 4, y + 11, { align: "right" });
            k.font(8.5, "normal", C.forest); k.text(item.line, M + 4, y + 22);
            k.font(7.5, "italic", C.muted); noteLines.forEach((l, j) => doc.text(l, M + 4, y + 31 + j * 9.5));
            k.setY(y + rowH);
        });
        k.setY(k.getY() + 4);
    }
}

/** The PDF as a Blob, for a plan object (buildPlanObject's shape). */
export async function fuelPdfBlob(plan, { unit = "oz", sources = true } = {}) {
    const [JsPDF, mark] = await Promise.all([loadJsPdf(), markPng()]);
    const schedule = buildSchedule(scheduleInputFromPlan(plan));
    const model = pdfModel(plan, schedule, { unit, sources });
    return drawPdf(JsPDF, model, { mark }).output("blob");
}

export async function sourcesPdfBlob({ unit = "oz" } = {}) {
    const [JsPDF, mark] = await Promise.all([loadJsPdf(), markPng()]);
    const model = pdfModel({ name: "Popular fueling sources" }, null, { unit, sources: true });
    return drawSourcesOnly(JsPDF, model, mark).output("blob");
}

function drawSourcesOnly(JsPDF, model, mark) {
    const doc = new JsPDF({ unit: "pt", format: "letter" });
    const W = PAGE.w, M = PAGE.m;
    let y = M;
    const font = (size, style = "normal", color = C.ink) => { doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(...color); };
    const text = (t, x, yy, opts) => doc.text(pdfSafe(t), x, yy, opts);
    const wrap = (t, width) => doc.splitTextToSize(pdfSafe(t), width);
    const newPage = () => { doc.addPage(); y = M; };
    const ensure = h => { if (y + h > PAGE.h - M - 18) newPage(); };
    doc.setFillColor(...C.forest); doc.rect(0, 0, W, 80, "F");
    doc.setFillColor(...C.tan); doc.rect(0, 80, W, 3, "F");
    if (mark) { try { doc.addImage(mark, "PNG", M, 20, 58, 37); } catch { /* no logo */ } }
    font(8, "bold", C.tan); text("SOUTHBOUND COACHING", M + (mark ? 72 : 0), 32);
    font(19, "bold", C.cream); text("Fueling quick reference", M + (mark ? 72 : 0), 55);
    font(8.5, "normal", C.tan); text(model.header.date, W - M, 32, { align: "right" });
    y = 98;
    drawSources(doc, model.sources, { font, text, wrap, newPage, ensure, getY: () => y, setY: v => { y = v; }, startNewPage: false });
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setDrawColor(...C.line); doc.line(M, PAGE.h - 34, W - M, PAGE.h - 34);
        font(7.5, "normal", C.muted);
        text(model.footer, M, PAGE.h - 22);
        text(`${p} / ${pages}`, W - M, PAGE.h - 22, { align: "right" });
    }
    return doc;
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
    return run(button, () => sourcesPdfBlob({ unit }), "southbound-fueling-sources.pdf", "Popular fueling sources");
}
