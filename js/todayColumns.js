/* ==========================================
   Southbound — Today in two columns on a computer (redesign step 10)

   At 1024px and wider, Today's sections go into two columns: the day on
   the left (today's workout, the week), everything around it on the
   right (readiness, From Your Coach, habits, numbers, food). The page
   heading and the tool tiles stay full width. Narrower than that, the
   sections go back to one column in the order they had.

   todayColumn(id)        pure: "main" | "side" | "full" (unit-tested)
   applyTodayColumns()    wraps the current order into the two columns
   unwrapTodayColumns()   puts them back (js/app.js calls it before it
                          reorders a client's sections, then applies again)
========================================== */

export const MAIN_SECTIONS = Object.freeze(["todayCard", "weekSection", "thisWeekCard", "todayTiles"]);
export const FULL_SECTIONS = Object.freeze(["todayTools"]);
export const WIDE = "(min-width: 1024px)";

export function todayColumn(id) {
    if (MAIN_SECTIONS.includes(id)) return "main";
    if (FULL_SECTIONS.includes(id)) return "full";
    return "side";
}

let order = null;   // the sections, in page order, while wrapped

function host() { return document.querySelector("main.container"); }
function hero() { return host()?.querySelector(":scope > .eos-today-hero") || null; }

export function unwrapTodayColumns() {
    const main = host(), top = hero();
    if (!main || !order) return;
    let anchor = top;
    for (const el of order) {
        if (anchor) anchor.after(el); else main.prepend(el);
        anchor = el;
    }
    main.querySelector(":scope > .today-cols")?.remove();
    main.classList.remove("has-today-cols");
    order = null;
}

export function applyTodayColumns() {
    const main = host(), top = hero();
    if (!main || !top || order || !document.getElementById("todayCard")) return;
    if (!window.matchMedia?.(WIDE).matches) return;
    const sections = [...main.children].filter(el => el.tagName === "SECTION" && el !== top && el.id);
    if (!sections.length) return;
    order = sections;
    const cols = document.createElement("div");
    cols.className = "today-cols";
    const left = document.createElement("div"); left.className = "today-col today-col-main";
    const right = document.createElement("div"); right.className = "today-col today-col-side";
    cols.append(left, right);
    top.after(cols);
    let after = cols;
    for (const el of sections) {
        const where = todayColumn(el.id);
        if (where === "main") left.append(el);
        else if (where === "side") right.append(el);
        else { after.after(el); after = el; }
    }
    main.classList.add("has-today-cols");
}

let watching = false;
export function watchTodayColumns() {
    applyTodayColumns();
    if (watching || !window.matchMedia) return;
    watching = true;
    window.matchMedia(WIDE).addEventListener?.("change", e => { if (e.matches) applyTodayColumns(); else unwrapTodayColumns(); });
}
