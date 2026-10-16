/* ==========================================================
   interestPicker.js -- "What are you training for?"

   A small card on the free calculators that appears only AFTER
   someone has their result (value first, never a gate). Its three
   links (in pace.html) open the application with that
   service already chosen; which services exist stays js/services.js's
   business, and tests/interestPicker.test.mjs checks the links against
   it. This script only reveals the card. It stores nothing and sends
   nothing; "No thanks" just hides it for this visit.
   ========================================================== */

/** Is an element on screen (not hidden, not display:none)? */
export function isShown(el) {
    if (!el || el.hidden) return false;
    return getComputedStyle(el).display !== "none";
}

function mount(root) {
    const selectors = (root.dataset.watch || "").split(",").map(s => s.trim()).filter(Boolean);
    const watched = selectors.flatMap(sel => [...document.querySelectorAll(sel)]);
    let dismissed = false;

    const reveal = () => {
        if (dismissed || !root.hidden) return;
        if (watched.some(isShown)) {
            root.hidden = false;
            observer.disconnect();
        }
    };
    // Results appear by class, inline style or the hidden attribute, depending on the tool.
    const observer = new MutationObserver(reveal);
    for (const el of watched) observer.observe(el, { attributes: true, attributeFilter: ["class", "style", "hidden"] });

    root.querySelector("[data-interest-dismiss]")?.addEventListener("click", () => {
        dismissed = true;
        root.hidden = true;
        observer.disconnect();
    });
    reveal();
}

if (typeof document !== "undefined") {
    const root = document.getElementById("interestPicker");
    if (root) mount(root);
}
