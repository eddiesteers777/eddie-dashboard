// The app's look from the first frame (Eddie, 2026-11-25: Southbound should feel as smooth as Anchor Board).
// A plain script in each app page's <head>, beside a static link to css/skin.css, so the page
// paints in the right look straight away. Before, js/loadHeader.js loaded js/appLook.js once the page was running,
// so every page showed the plain dark colours first and then swapped to the mist ground. Same idea as Anchor Board's
// js/scheme.js. It adds html.al-on, the mode, and, once the body exists, the still background layer (.al-bg);
// js/appLook.js still starts the dark-panel tagging. The Playbook keeps its own look (html.pb-app).
//
// Night mode (step 3, 2026-11-25). The choice is Light, Night or Match device, saved on this device under
// "southbound-look" so every page reads it with no wait. Light is the default, so nobody's app changes until they
// pick Night in Settings. On <html> it sets:
//   data-sb-mode = light or night (what is showing; "auto" follows the phone)
//   .al-light = only in light mode; css/skin.css part 3 (mist ground, deep cards) hangs off it.
// Night is the fog-blue glass look on its own (css/skin.css part 2), the look the app wore 2026-10-29 to 2026-11-20.
// Settings uses window.SouthboundLook.set({ m: "night" }); other tabs and the phone's own dark mode follow.
//
// Colourways (step 4, 2026-11-25, Eddie: "All six"): Fog (default), Forest, Pitch, Track, Dusk, Slate. Saved with the
// mode as { c, m } and synced to the account (js/cloudSync.js EXACT_KEYS), so a new phone picks it up.
//   data-sb-scheme = the colourway; css/skin.css redefines its colour tokens for each one.
// The list below is written by scripts/build-colorways.mjs: [id, name, main, deep, phone bar colour].
(function () {
    var h = document.documentElement;
    if (h.classList.contains("pb-app")) return;
    var K = "southbound-look";
    var MODES = [["light", "Light"], ["night", "Night"], ["auto", "Match device"]];
    // colourways:start (npm run colorways writes this; don't edit by hand)
    var SCHEMES = [
        ["fog", "Fog", "#3E5C78", "#142130", "#1C2834"],
        ["forest", "Forest", "#2F5B45", "#0F2019", "#1C3428"],
        ["pitch", "Pitch", "#1F7A49", "#0A321D", "#123E27"],
        ["track", "Track", "#8C4030", "#33160F", "#3A1D16"],
        ["dusk", "Dusk", "#41458F", "#15173A", "#1A1B36"],
        ["slate", "Slate", "#46515F", "#171C23", "#22272E"]
    ];
    // colourways:end
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    function clean(o) {
        o = o && typeof o === "object" ? o : {};
        var m = MODES.some(function (x) { return x[0] === o.m; }) ? o.m : "light";
        var c = SCHEMES.some(function (x) { return x[0] === o.c; }) ? o.c : "fog";
        return { c: c, m: m, at: +o.at || 0 };
    }
    function read() { try { return clean(JSON.parse(localStorage.getItem(K) || "null")); } catch (e) { return clean(null); } }
    function modeOf(o) { return o.m === "auto" ? (mq && mq.matches ? "night" : "light") : o.m; }
    function tell() { try { window.dispatchEvent(new CustomEvent("southbound-look", { detail: cur })); } catch (e) { /* old browser */ } }
    function apply(o) {
        var mode = modeOf(o);
        h.setAttribute("data-sb-mode", mode);
        h.setAttribute("data-sb-scheme", o.c);
        h.classList.toggle("al-light", mode === "light");
        // The phone's status bar takes the colourway's deep ground.
        var s = SCHEMES.filter(function (x) { return x[0] === o.c; })[0] || SCHEMES[0];
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta && /^#1c2834$/i.test(meta.getAttribute("data-sb-fog") || meta.getAttribute("content") || "")) {
            meta.setAttribute("data-sb-fog", "#1c2834");
            meta.setAttribute("content", s[4]);
        }
    }
    var cur = read();
    h.classList.add("al-on");
    // Side menu folded to icons on a computer (step 5, js/sideMenu.js). This device only, read here so the page
    // paints at the right width.
    try { if (localStorage.getItem("southbound-side-min") === "1") h.classList.add("sb-side-min"); } catch (e) { /* storage unavailable: open */ }
    apply(cur);
    function set(o) {
        cur = clean({ c: (o && o.c) || cur.c, m: (o && o.m) || cur.m, at: Date.now() });
        try { localStorage.setItem(K, JSON.stringify(cur)); } catch (e) { /* private mode: this page still changes */ }
        apply(cur);
        tell();
        return cur;
    }
    // Another tab changed it, or the phone went dark.
    window.addEventListener("storage", function (e) { if (e.key === K) { cur = read(); apply(cur); tell(); } });
    if (mq) {
        var onMq = function () { if (cur.m === "auto") { apply(cur); tell(); } };
        if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
    }
    // The theme-color tag comes after this script in <head>, so set the bar again once it exists.
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { apply(cur); });
    window.SouthboundLook = { modes: MODES, schemes: SCHEMES, get: function () { return cur; }, set: set, mode: function () { return modeOf(cur); } };
    function layer() {
        if (!document.body || document.querySelector("body>.al-bg")) return;
        var bg = document.createElement("div");
        bg.className = "al-bg";
        bg.setAttribute("aria-hidden", "true");
        document.body.prepend(bg);
    }
    if (document.body) layer(); else document.addEventListener("DOMContentLoaded", layer);
})();
