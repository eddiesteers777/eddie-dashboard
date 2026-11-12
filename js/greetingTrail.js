/* ==========================================
   Southbound — the Today greeting on the logo's top line (option A, Eddie 2026-11-12)

   "Good evening, Eddie" rides the top line of the logo: flat at first, then easing
   down with the curve toward the dot. The four logo lines draw in, and the words are
   revealed along the same line at the same pace. The shape is the logo's own
   (brand/sb-mark.svg), stretched to the width of the hero. Plays once per page load;
   with reduced motion it is just drawn (css/greeting.css). The real <h1> stays in the
   page (visually hidden) for screen readers. Pure shape maths so it is unit tested.
========================================== */

const COLORS = ["#C7D6E4", "#8FC3EE", "#8FD0B2", "#D2AD62"];   // the logo's lines, top to bottom
const SPACING = [0, 10, 20, 30];
const X0 = 3;
const DOT_R = 4.5;

/**
 * The four lines, the dot and the path the words ride, for a box `w` wide with text `fs` px tall.
 * -> { w, h, paths: [{ d, color }], textPath, dot: { cx, cy, r }, pathLength }
 */
export function lineShape({ w, fs }) {
    const t = Math.round(fs * 1.15);              // y of the top line: room above it for the words
    const xe = w - 16;
    const c1 = +(X0 + 0.515 * (xe - X0)).toFixed(1);   // the logo's control points, scaled to this width
    const c2 = +(X0 + 0.603 * (xe - X0)).toFixed(1);
    const ye = t + 45;
    const curve = (y, end, dy = 0) => `M${X0} ${y + dy} C${c1} ${y + dy} ${c2} ${end + dy} ${xe} ${end + dy}`;
    return {
        w, h: ye + 10,
        paths: SPACING.map((o, i) => ({ d: curve(t + o, ye), color: COLORS[i] })),
        textPath: curve(t, ye, -Math.round(fs * 0.38)),
        dot: { cx: w - DOT_R, cy: ye, r: DOT_R }
    };
}

export function lineSvg(shape, text, fs, still = false) {
    const id = "grp" + shape.w;
    return `<svg viewBox="0 0 ${shape.w} ${shape.h}" width="${shape.w}" height="${shape.h}" aria-hidden="true" class="${still ? "gr-still" : ""}">`
        + `<defs><path id="${id}" d="${shape.textPath}"/>`
        + `<mask id="${id}m" maskUnits="userSpaceOnUse" x="-20" y="-60" width="${shape.w + 40}" height="${shape.h + 120}"><path class="gr-wipe" d="${shape.textPath}" pathLength="1" stroke="#fff" fill="none" stroke-width="${Math.round(fs * 2.4)}"/></mask></defs>`
        + shape.paths.map((p, i) => `<path class="gr-line-path" d="${p.d}" stroke="${p.color}" pathLength="1" style="--i:${i}"/>`).join("")
        + `<circle class="gr-dot" cx="${shape.dot.cx}" cy="${shape.dot.cy}" r="${shape.dot.r}"/>`
        + `<g mask="url(#${id}m)"><text class="gr-text" font-size="${fs}"><textPath href="#${id}" startOffset="0">${text.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</textPath></text></g></svg>`;
}

/**
 * Put the greeting on the line under `heading` (the real <h1>, kept for screen readers).
 * -> { set(text, { final }) }: the first call waits briefly for the name (final = the full greeting),
 * so the animation plays once with the whole phrase; later calls just change the words.
 */
export function greetingLine(heading) {
    const holder = document.createElement("div");
    holder.className = "gr-line";
    heading.classList.add("gr-hidden");
    heading.insertAdjacentElement("afterend", holder);
    let text = "", drawn = false, starting = false, timer = 0;

    const draw = still => {
        const w = Math.round(Math.min(holder.parentElement?.getBoundingClientRect().width || 320, 560)) || 320;
        const base = parseFloat(getComputedStyle(heading).fontSize) || 38;
        let fs = Math.round(base * 1.15);
        let shape = lineShape({ w, fs });
        holder.innerHTML = lineSvg(shape, text.toUpperCase(), fs, still);
        // Shrink until the whole phrase fits on the line.
        const tp = holder.querySelector("textPath");
        const max = holder.querySelector("defs path").getTotalLength() * 0.93;
        for (let i = 0; i < 16 && tp.getComputedTextLength() > max; i++) {
            fs = Math.round(fs * 0.95 * 10) / 10;
            shape = lineShape({ w, fs });
            holder.innerHTML = lineSvg(shape, text.toUpperCase(), fs, still);
            if (i > 14) break;
        }
        drawn = true;
    };
    const start = () => {
        clearTimeout(timer);
        if (starting) return;
        starting = true;
        const go = () => draw(false);
        // Fonts first: measuring with the fallback face would size the words wrong.
        const fonts = document.fonts?.load
            ? Promise.race([document.fonts.load("800 40px 'Big Shoulders Display'"), new Promise(r => setTimeout(r, 1200))]).catch(() => {})
            : Promise.resolve();
        // And not under the launch splash (a fresh session shows it for ~4.5 s): play when it fades.
        const splashGone = new Promise(resolve => {
            const splash = document.getElementById("splashScreen");
            if (!splash) return resolve();
            const t0 = Date.now();
            const check = () => (!splash.isConnected || splash.classList.contains("eos-splash-hide") || Date.now() - t0 > 7000) ? resolve() : setTimeout(check, 100);
            check();
        });
        Promise.all([fonts, splashGone]).then(go, go);
    };
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
        if (!drawn) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => draw(true), 150);
    });

    return {
        set(next, { final = true } = {}) {
            text = next;
            if (drawn) draw(true);
            else if (starting) return;
            else if (final) start();
            else if (!timer) timer = setTimeout(start, 700);
        }
    };
}
