/* ==========================================
   Southbound — completion moments (2026-10-17)

   celebrateRun({ kind, title, miles })   a workout just marked done or
       logged: a tan ring draws round a check, short tan and sage rays
       burst out, and a mono kicker + display title show for ~1.6s. It
       never blocks taps and resolves when it has gone, so the effort
       question (js/effortCard.js) opens after it, not over it.
   celebrateHabit(target, { allDone })    a habit just checked off: the
       circle pops, a sage ring ripples out and six sparks fly; the last
       habit of the day also sweeps a tan shine across its card.

   Light on purpose: CSS keyframes (css/style.css "COMPLETION MOMENTS"),
   no library. Reduced motion: the run badge only fades, a habit doesn't
   move at all (its sage fill already says done). The toast stays the
   spoken message; everything here is aria-hidden.
========================================== */

const KICKERS = { run: "Run done", strength: "Strength done", session: "Session done" };

// What the run moment says. Pure, so it's unit-tested.
export function celebrationFor({ kind = "run", title = "", miles = 0 } = {}) {
    const name = String(title || "").replace(/\s+/g, " ").trim();
    const mi = Number(miles);
    const detail = kind === "run" && mi > 0 ? `${Number.isInteger(mi) ? mi : mi.toFixed(1)} mi` : "";
    return { kicker: KICKERS[kind] || "Workout done", title: name.length > 28 ? `${name.slice(0, 27)}…` : name, detail };
}

export function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function buzz(pattern) {
    try { navigator.vibrate?.(pattern); } catch { /* not on iPhone; fine */ }
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let current = null;

export function celebrateRun(info = {}) {
    if (typeof document === "undefined") return Promise.resolve();
    current?.remove();
    const { kicker, title, detail } = celebrationFor(info);
    const still = reducedMotion();
    const rays = still ? "" : Array.from({ length: 12 }, (_, i) =>
        `<i class="sb-cel-ray${i % 3 === 1 ? " is-sage" : i % 3 === 2 ? " is-cream" : ""}" style="--a:${i * 30 + 15}deg;--d:${(i % 2) * 40}ms"></i>`).join("");
    const el = document.createElement("div");
    el.className = `sb-cel-run${still ? " is-still" : ""}`;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
        <div class="sb-cel-medal">
            ${rays}
            <svg viewBox="0 0 96 96" class="sb-cel-ringsvg">
                <circle class="sb-cel-track" cx="48" cy="48" r="42"/>
                <circle class="sb-cel-arc" cx="48" cy="48" r="42" pathLength="100"/>
                <path class="sb-cel-tick" d="M31 49.5l11 11 23-25" pathLength="100"/>
            </svg>
        </div>
        <p class="sb-cel-kicker">${esc(kicker)}${detail ? ` · ${esc(detail)}` : ""}</p>
        ${title ? `<p class="sb-cel-title">${esc(title)}</p>` : ""}`;
    document.body.appendChild(el);
    current = el;
    if (!still) buzz([14, 50, 24]);
    return new Promise(resolve => {
        const life = still ? 1100 : 1650;
        setTimeout(() => el.classList.add("is-out"), life);
        setTimeout(() => { el.remove(); if (current === el) current = null; resolve(); }, life + 320);
    });
}

export function celebrateHabit(target, { allDone = false } = {}) {
    if (!target || typeof document === "undefined" || reducedMotion()) return;
    target.classList.remove("sb-cel-pop");
    void target.offsetWidth; // restart the pop when tapped again quickly
    target.classList.add("sb-cel-pop");
    const burst = document.createElement("span");
    burst.className = "sb-cel-burst";
    burst.setAttribute("aria-hidden", "true");
    burst.innerHTML = `<i class="sb-cel-ripple"></i>${Array.from({ length: 6 }, (_, i) => `<i class="sb-cel-spark" style="--a:${i * 60}deg"></i>`).join("")}`;
    target.appendChild(burst);
    setTimeout(() => { burst.remove(); target.classList.remove("sb-cel-pop"); }, 700);
    buzz(allDone ? [10, 40, 18] : 8);
    if (allDone) {
        const card = target.closest("[data-cel-card]");
        if (card) {
            card.classList.remove("sb-cel-all");
            void card.offsetWidth;
            card.classList.add("sb-cel-all");
            setTimeout(() => card.classList.remove("sb-cel-all"), 1300);
        }
    }
}
