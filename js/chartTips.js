/* ==========================================
   Southbound — tap or hover a chart to read it

   The idea is Apache ECharts' axis tooltip, built in a few lines so the app
   stays small and offline: a thin crosshair, a dot on the line and one line
   of text for the point nearest your finger or mouse. Arrow keys step through
   the points when the chart has focus.

   Works on any .sb-chart that js/svgCharts.js wrapped:
     data-tips='[{ x, y, t }]'   x 0–100 (% across the chart), y 0–1 (from
                                  the top) or null, t the text
     or .tr-bar[data-tip] children (the week bars), read from the page.
   One set of listeners on the document, so charts drawn later just work.
========================================== */

const CHART = ".sb-chart";

// The points of one chart, in pixels inside the wrapper.
function points(wrap) {
    const box = wrap.getBoundingClientRect();
    const bars = wrap.querySelectorAll(".tr-bar[data-tip]");
    if (bars.length) {
        return [...bars].map(bar => {
            const r = bar.getBoundingClientRect();
            const fill = bar.querySelector(".tr-bar-fill, .tr-bar-plan");
            const top = fill ? fill.getBoundingClientRect().top : r.bottom;
            return { x: r.left + r.width / 2 - box.left, y: top - box.top, t: bar.dataset.tip, el: bar };
        });
    }
    let list;
    try { list = JSON.parse(wrap.dataset.tips || "[]"); } catch { list = []; }
    const svg = wrap.querySelector("svg");
    const r = (svg || wrap).getBoundingClientRect();
    return list.map(p => ({
        x: r.left - box.left + p.x / 100 * r.width,
        y: p.y == null ? null : r.top - box.top + p.y * r.height,
        top: r.top - box.top, h: r.height, t: p.t
    }));
}

function parts(wrap) {
    let tip = wrap.querySelector(":scope > .sb-tip");
    if (!tip) {
        wrap.insertAdjacentHTML("beforeend", `<span class="sb-cross" aria-hidden="true"></span><span class="sb-dot" aria-hidden="true"></span><span class="sb-tip" role="status" aria-live="polite"></span>`);
        tip = wrap.querySelector(":scope > .sb-tip");
    }
    return { tip, cross: wrap.querySelector(":scope > .sb-cross"), dot: wrap.querySelector(":scope > .sb-dot") };
}

function show(wrap, i) {
    const pts = points(wrap);
    if (!pts.length) return;
    i = Math.max(0, Math.min(pts.length - 1, i));
    wrap._sbTip = i;
    const p = pts[i];
    const { tip, cross, dot } = parts(wrap);
    wrap.classList.add("is-reading");
    wrap.querySelectorAll(".tr-bar.is-picked").forEach(b => b.classList.remove("is-picked"));
    p.el?.classList.add("is-picked");
    cross.hidden = Boolean(p.el);
    if (!p.el) { cross.style.left = `${p.x}px`; cross.style.top = `${p.top}px`; cross.style.height = `${p.h}px`; }
    dot.hidden = p.y == null || Boolean(p.el);
    if (p.y != null) { dot.style.left = `${p.x}px`; dot.style.top = `${p.y}px`; }
    tip.textContent = p.t;
    // Above the point, kept inside the chart's width.
    const w = wrap.clientWidth, tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(w - tw, p.x - tw / 2))}px`;
    tip.style.top = `${Math.max(-tip.offsetHeight - 6, (p.y ?? p.top ?? 0) - tip.offsetHeight - 12)}px`;
}

function hide(wrap) {
    wrap.classList.remove("is-reading");
    wrap.querySelectorAll(".tr-bar.is-picked").forEach(b => b.classList.remove("is-picked"));
    wrap._sbTip = null;
}

function nearest(wrap, clientX) {
    const x = clientX - wrap.getBoundingClientRect().left;
    let best = 0, dist = Infinity;
    points(wrap).forEach((p, i) => { const d = Math.abs(p.x - x); if (d < dist) { dist = d; best = i; } });
    return best;
}

function install() {
    if (typeof document === "undefined" || document.documentElement.dataset.sbChartTips) return;
    document.documentElement.dataset.sbChartTips = "1";
    const at = e => e.target.closest?.(CHART);
    document.addEventListener("pointermove", e => { const w = at(e); if (w && e.pointerType !== "touch") show(w, nearest(w, e.clientX)); });
    document.addEventListener("pointerdown", e => {
        const w = at(e);
        document.querySelectorAll(`${CHART}.is-reading`).forEach(o => { if (o !== w) hide(o); });
        if (w) show(w, nearest(w, e.clientX));
    });
    // A finger sliding along the chart reads each point (the page still scrolls up and down).
    document.addEventListener("touchmove", e => { const w = at(e); if (w && e.touches[0]) show(w, nearest(w, e.touches[0].clientX)); }, { passive: true });
    document.addEventListener("pointerout", e => { const w = at(e); if (w && e.pointerType !== "touch" && !w.contains(e.relatedTarget)) hide(w); });
    document.addEventListener("focusout", e => { const w = at(e); if (w && !w.contains(e.relatedTarget)) hide(w); });
    document.addEventListener("keydown", e => {
        const w = e.target.matches?.(CHART) ? e.target : null;
        if (!w) return;
        const n = points(w).length, cur = w._sbTip ?? (e.key === "ArrowLeft" ? n : -1);
        const next = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: n - 1 }[e.key];
        if (next != null) { e.preventDefault(); show(w, next); }
        else if (e.key === "Escape") hide(w);
    });
    // Charts draw themselves in once per page visit; redraws after a sync stay still.
    setTimeout(() => document.documentElement.classList.add("sb-charts-drawn"), 1600);
}

install();
