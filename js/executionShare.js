/* ==========================================
   Southbound — share a rebuilt workout as an image

   A Share button on the rep-by-rep card (Analytics' key workouts, the
   client's workout page) opens a preview of one tall image in
   Southbound's own style (forest, tan, cream; Bebas / Inter / JetBrains
   Mono; the SB mark): the workout, the run's distance and time, how much
   was done and how much was on target, every rep with its time and its
   difference from the target, recoveries, warm-up and cool-down. Share
   opens the phone's share sheet (save to Photos, Strava, Messages...);
   Save image downloads it. Nothing leaves the device unless the person
   shares it.

   shareCardModel(x, meta)   pure: what the card says (unit-tested)
   cardHeight(model)         pure: how tall it draws
   drawShareCard(canvas, model)   draws it (1080 wide)
   registerShare(x, meta)    remembers an execution for its Share button
   openShareCard(x, meta)    the preview dialog
   (The button: executionHtml(x, { share: true }) in js/executionView.js.)
========================================== */

import { clockText } from "./workoutExecution.js";

const MILE = 1609.344;
export const CARD_W = 1080;
export const MIN_H = 1350;   // 4:5, the tallest most feeds show whole

const C = {
    bg: "#0F2019", surface: "#17291F", line: "rgba(243,239,230,0.12)", text: "#F3EFE6", muted: "rgba(243,239,230,0.62)",
    tan: "#C9AD84", within: "#94B89D", fast: "#87B5AE", slow: "#D4AA62", bad: "#D9705A", done: "#C9AD84", unobserved: "rgba(243,239,230,0.45)"
};
const RESULT = { within: "On target", fast: "Fast", slow: "Slow", partial: "Cut short", missed: "Missed", unobserved: "Not in laps", done: "Done" };

const signed = sec => {
    if (sec == null) return "";
    const r = Math.round(sec);
    return r === 0 ? "0:00" : `${r < 0 ? "−" : "+"}${clockText(Math.abs(r))}`;
};
const dateWords = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function rowOf(s) {
    const state = s.status === "done" ? s.verdict || "done" : s.status;
    let actual = "";
    if (s.actual) {
        if (s.normalizedSec != null) actual = clockText(s.normalizedSec, { tenths: s.normalizedSec < 300 });
        else if (s.durationSec && s.actual.paceSec) actual = `${clockText(s.actual.paceSec)}/mi`;
        else actual = clockText(s.actual.seconds, { tenths: s.actual.seconds < 300 });
    }
    const delta = s.deltaSec != null ? signed(s.deltaSec) : s.deltaPace != null ? `${signed(s.deltaPace)}/mi` : "";
    return {
        label: s.of > 1 ? `Rep ${s.rep}${s.part ? `.${s.part}` : ""}` : s.amount,
        actual, delta, state, result: RESULT[state] || "",
        hr: s.actual?.hr || null,
        note: s.status === "partial" ? s.notes?.[0] || "" : ""
    };
}

/**
 * What the image says. meta: { date, name?, runMeters?, runSec?, who? }
 * -> { date, title, name, stats: [{ label, value }], sets: [{ head, sub, rows, summary }], easy: [text], read, footer }
 */
export function shareCardModel(x, meta = {}) {
    const work = x.steps.filter(s => s.kind === "work");
    const sets = (x.sets || []).map(set => {
        const steps = work.filter(s => s.set === set.set);
        const first = steps[0];
        const rec = x.steps.find(s => s.kind === "recovery" && s.set === set.set && !s.part);
        const bits = [];
        if (set.avgSec != null && steps.length > 1) bits.push(`avg ${clockText(set.avgSec, { tenths: set.avgSec < 300 })}`);
        else if (set.avgPace && steps.length > 1) bits.push(`avg ${clockText(set.avgPace)}/mi`);
        if (set.spreadSec != null && steps.length > 2) bits.push(`spread ${Math.round(set.spreadSec * 10) / 10} s`);
        if (set.avgHr && steps.length > 1) bits.push(`${set.avgHr} bpm`);
        return {
            head: `${set.label}${set.target ? ` @ ${set.target}` : ""}`,
            sub: rec ? `${rec.amount} ${rec.effort || "recovery"}` : first?.effort && !set.target ? first.effort : "",
            rows: steps.map(rowOf),
            summary: bits.join(" · ")
        };
    });
    const c = x.completion, t = x.targetCompliance;
    const stats = [];
    if (meta.runMeters) stats.push({ label: "Distance", value: `${(meta.runMeters / MILE).toFixed(2)} mi` });
    if (meta.runSec) stats.push({ label: "Time", value: clockText(meta.runSec) });
    if (c) stats.push({ label: work.length > 1 && work.every(s => s.of > 1) ? "Reps done" : "Done", value: c.pct == null ? "—" : `${c.done + c.partial}/${c.planned}` });
    if (t) stats.push({ label: "On target", value: `${t.within}/${t.judged}` });
    const easy = x.steps.filter(s => (s.kind === "warmup" || s.kind === "cooldown") && s.actual)
        .map(s => `${s.kind === "warmup" ? "Warm-up" : "Cool-down"} ${(s.actual.meters / MILE).toFixed(2)} mi @ ${clockText(s.actual.paceSec)}/mi`);
    const title = (x.sets || []).map(s => s.label).join(" + ") || "Workout";
    const name = meta.name && !/^\d/.test(meta.name) && meta.name.length <= 40 && meta.name.toLowerCase() !== title.toLowerCase() ? meta.name : "";
    return {
        date: meta.date ? dateWords(meta.date) : "", title, name, stats: stats.slice(0, 4), sets, easy,
        read: (x.read || [])[0] || "",
        footer: x.matchConfidence === "exact" ? "Planned vs actual · every lap matched to the plan" : x.matchConfidence === "approximate" ? "Planned vs actual · laps matched approximately" : "Planned vs actual · a rough match (mile laps)",
        who: meta.who || ""
    };
}

// ---------- layout (pure) ----------

const PAD = 72, ROW = 58, SET_HEAD = 64, SET_GAP = 24, STAT_H = 150, FOOT = 118;
const twoCols = n => n > 10;

/** How tall the card draws (at least 1350). */
export function cardHeight(model) {
    let h = PAD + 64 + 32;                       // brand row
    h += (model.name ? 46 : 0) + 104 * (model.title.length > 22 ? 2 : 1) + 28;
    h += model.stats.length ? STAT_H + 32 : 0;
    for (const s of model.sets) {
        const rows = twoCols(s.rows.length) ? Math.ceil(s.rows.length / 2) : s.rows.length;
        h += SET_HEAD + rows * ROW + (s.summary ? 40 : 0) + SET_GAP;
    }
    h += model.easy.length ? 54 : 0;
    h += FOOT + PAD;                             // footer
    return Math.max(MIN_H, Math.ceil(h));
}

// ---------- drawing (browser) ----------

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function fitText(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
    return `${t}…`;
}

function wrap(ctx, text, max, lines = 2) {
    const words = text.split(" ");
    const out = [];
    let line = "";
    for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (ctx.measureText(next).width > max && line) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
    if (out.length > lines) { out.length = lines; out[lines - 1] = fitText(ctx, `${out[lines - 1]}…`, max); }
    return out;
}

const markImage = () => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "brand/sb-mark.svg";
});

async function fontsReady() {
    if (!document.fonts?.load) return;
    await Promise.all([
        '96px "Bebas Neue"', '600 28px "Inter"', '400 28px "Inter"', '500 32px "JetBrains Mono"', '800 30px "Saira"'
    ].map(f => document.fonts.load(f).catch(() => null)));
}

/** Draws the card on `canvas` (resized to fit). Resolves when done. */
export async function drawShareCard(canvas, model) {
    await fontsReady();
    const mark = await markImage();
    const H = cardHeight(model);
    canvas.width = CARD_W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const W = CARD_W, inner = W - PAD * 2;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // A quiet tan edge down the left, the brand's slash.
    ctx.fillStyle = C.tan; ctx.fillRect(0, 0, 10, H);

    let y = PAD;
    // Brand row: the mark, the name, the date.
    if (mark) ctx.drawImage(mark, PAD, y, 64 * (186 / 119), 64);
    ctx.fillStyle = C.text; ctx.font = '800 30px "Saira", sans-serif'; ctx.textBaseline = "middle";
    ctx.fillText("SOUTHBOUND", PAD + (mark ? 64 * (186 / 119) + 20 : 0), y + 32);
    ctx.textAlign = "right"; ctx.fillStyle = C.tan; ctx.font = '600 26px "Inter", sans-serif';
    ctx.fillText(model.date.toUpperCase(), W - PAD, y + 32);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    y += 64 + 32;

    // Title.
    if (model.name) { ctx.fillStyle = C.tan; ctx.font = '600 30px "Inter", sans-serif'; ctx.fillText(fitText(ctx, model.name.toUpperCase(), inner), PAD, y + 30); y += 46; }
    ctx.fillStyle = C.text; ctx.font = '96px "Bebas Neue", sans-serif';
    for (const line of wrap(ctx, model.title.toUpperCase(), inner, 2)) { y += 96; ctx.fillText(line, PAD, y); y += 8; }
    y += 28;

    // Stats.
    if (model.stats.length) {
        const gap = 18, w = (inner - gap * (model.stats.length - 1)) / model.stats.length;
        model.stats.forEach((s, i) => {
            const x0 = PAD + i * (w + gap);
            ctx.fillStyle = C.surface; roundRect(ctx, x0, y, w, STAT_H, 22); ctx.fill();
            ctx.fillStyle = C.text; ctx.font = '62px "Bebas Neue", sans-serif';
            ctx.fillText(fitText(ctx, s.value, w - 40), x0 + 24, y + 82);
            ctx.fillStyle = C.tan; ctx.font = '600 21px "Inter", sans-serif';
            ctx.fillText(s.label.toUpperCase(), x0 + 24, y + 122);
        });
        y += STAT_H + 32;
    }

    // Each set, rep by rep.
    for (const set of model.sets) {
        ctx.fillStyle = C.tan; ctx.font = '50px "Bebas Neue", sans-serif';
        ctx.fillText(fitText(ctx, set.head.toUpperCase(), inner * 0.68), PAD, y + 44);
        if (set.sub) { ctx.textAlign = "right"; ctx.fillStyle = C.muted; ctx.font = '500 24px "Inter", sans-serif'; ctx.fillText(fitText(ctx, set.sub, inner * 0.3), W - PAD, y + 40); ctx.textAlign = "left"; }
        y += SET_HEAD;
        const cols = twoCols(set.rows.length) ? 2 : 1;
        const per = Math.ceil(set.rows.length / cols);
        const colW = (inner - (cols - 1) * 32) / cols;
        set.rows.forEach((r, i) => {
            const col = Math.floor(i / per), x0 = PAD + col * (colW + 32), ry = y + (i % per) * ROW;
            const color = C[r.state] || C.text;
            ctx.strokeStyle = C.line; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x0, ry); ctx.lineTo(x0 + colW, ry); ctx.stroke();
            ctx.fillStyle = color; roundRect(ctx, x0, ry + 13, 8, ROW - 26, 4); ctx.fill();
            ctx.fillStyle = C.muted; ctx.font = '600 26px "Inter", sans-serif';
            ctx.fillText(fitText(ctx, r.label, colW * 0.24), x0 + 24, ry + 39);
            ctx.fillStyle = C.text; ctx.font = '500 32px "JetBrains Mono", monospace';
            ctx.fillText(r.actual || "—", x0 + colW * 0.27, ry + 40);
            ctx.fillStyle = color; ctx.font = '500 28px "JetBrains Mono", monospace';
            ctx.fillText(r.delta, x0 + colW * (cols === 1 ? 0.52 : 0.55), ry + 39);
            ctx.textAlign = "right"; ctx.font = '600 24px "Inter", sans-serif';
            ctx.fillText(r.result, x0 + colW, ry + 38);
            if (cols === 1 && r.hr) {
                // Heart rate in its own column, before the result (one column only).
                ctx.fillStyle = C.muted; ctx.font = '400 22px "Inter", sans-serif';
                ctx.fillText(`${r.hr} bpm`, x0 + colW - 172, ry + 38);
            }
            ctx.textAlign = "left";
        });
        y += per * ROW;
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
        if (set.summary) { ctx.fillStyle = C.muted; ctx.font = '500 24px "Inter", sans-serif'; ctx.fillText(set.summary, PAD, y + 34); y += 40; }
        y += SET_GAP;
    }

    // Warm-up and cool-down.
    if (model.easy.length) {
        ctx.fillStyle = C.muted; ctx.font = '400 25px "Inter", sans-serif';
        ctx.fillText(fitText(ctx, model.easy.join("   ·   "), inner), PAD, y + 30); y += 54;
    }

    // Footer.
    const fy = H - PAD - 64;
    ctx.strokeStyle = C.tan; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(PAD, fy); ctx.lineTo(PAD + 120, fy); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillStyle = C.tan; ctx.font = '600 24px "Inter", sans-serif';
    ctx.fillText("southboundcoaching.com", W - PAD, fy + 44);
    const url = ctx.measureText("southboundcoaching.com").width;
    ctx.textAlign = "left"; ctx.fillStyle = C.muted; ctx.font = '500 22px "Inter", sans-serif';
    ctx.fillText(fitText(ctx, model.footer, inner - url - 40), PAD, fy + 44);
    ctx.fillText("Negative = faster than the target", PAD, fy + 76);
    return canvas;
}

// ---------- the preview dialog ----------

const registry = new Map();
let wired = false;

/** Remembers an execution so its Share button (data-ex-share = plannedWorkoutId) can open it. */
export function registerShare(x, meta = {}) {
    if (!x?.plannedWorkoutId) return;
    registry.set(x.plannedWorkoutId, { x, meta });
    if (wired) return;
    wired = true;
    document.addEventListener("click", event => {
        const btn = event.target.closest?.("[data-ex-share]");
        if (!btn) return;
        const hit = registry.get(btn.dataset.exShare);
        if (hit) { event.preventDefault(); openShareCard(hit.x, hit.meta); }
    });
}

const fileName = meta => `southbound-workout-${meta.date || "run"}.png`;

export async function openShareCard(x, meta = {}) {
    const model = shareCardModel(x, meta);
    let file = null, url = "";
    const dialog = document.createElement("dialog");
    dialog.className = "sb-dialog ex-share-dialog";
    dialog.innerHTML = `
        <div class="sb-dialog-form">
            <h2 class="sb-dialog-title">Share this workout</h2>
            <div class="ex-share-preview"><p class="clients-card-note sb-wait">Making the image…</p></div>
            <p class="ex-share-hint">Share opens your phone's share sheet: save it to Photos, then add it to the activity in Strava.</p>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-tertiary" data-act="close">Close</button>
                <button type="button" class="sb-btn sb-btn-secondary" data-act="save" disabled>Save image</button>
                <button type="button" class="sb-btn sb-btn-primary" data-act="share" disabled hidden>Share</button>
            </div>
        </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => { dialog.remove(); if (url) URL.revokeObjectURL(url); });
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.showModal();

    const canvas = document.createElement("canvas");
    await drawShareCard(canvas, model);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) { dialog.querySelector(".ex-share-preview").innerHTML = `<p class="clients-card-note">Couldn't make the image on this device.</p>`; return; }
    file = new File([blob], fileName(meta), { type: "image/png" });
    url = URL.createObjectURL(blob);
    dialog.querySelector(".ex-share-preview").innerHTML = `<img src="${url}" alt="${model.title}: planned vs actual, rep by rep" width="${CARD_W}" height="${canvas.height}">`;
    const share = dialog.querySelector('[data-act="share"]'), save = dialog.querySelector('[data-act="save"]');
    save.disabled = false;
    const canShare = Boolean(navigator.canShare?.({ files: [file] }));
    if (canShare) { share.hidden = false; share.disabled = false; }

    dialog.querySelector('[data-act="close"]').addEventListener("click", () => dialog.close());
    save.addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = url; a.download = fileName(meta);
        document.body.appendChild(a); a.click(); a.remove();
    });
    share.addEventListener("click", async () => {
        try {
            await navigator.share({ files: [file], title: model.title });
            dialog.close();
        } catch (error) {
            if (error?.name !== "AbortError") save.click();   // the share sheet failed: save it instead
        }
    });
}
