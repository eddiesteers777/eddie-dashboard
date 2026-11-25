// Settings > Look (Eddie, 2026-11-25, steps 3 and 4 of making Southbound look as premium as Anchor Board):
// a colourway (Fog, Forest, Pitch, Track, Dusk, Slate) and the mode (Light, Night, Match device).
// js/appLookBoot.js holds the choice (window.SouthboundLook), saves it and applies it; this only draws the
// swatches and buttons and keeps them in step.
(function () {
    var look = window.SouthboundLook;
    var modes = document.getElementById("lookMode"), schemes = document.getElementById("lookScheme");
    if (!modes && !schemes) return;
    if (!look) { var sec = document.getElementById("lookSettings"); if (sec) sec.hidden = true; return; }
    if (modes) modes.innerHTML = look.modes.map(function (m) {
        return '<button type="button" class="st-btn" data-look="' + m[0] + '" aria-pressed="false">' + m[1] + "</button>";
    }).join("");
    if (schemes) schemes.innerHTML = look.schemes.map(function (s) {
        return '<button type="button" class="st-swatch" data-scheme="' + s[0] + '" aria-pressed="false">' +
            '<i style="background:linear-gradient(135deg,' + s[2] + "," + s[3] + ')"></i>' + s[1] + "</button>";
    }).join("");
    function sync() {
        var cur = look.get();
        document.querySelectorAll("#lookMode [data-look]").forEach(function (b) {
            var on = b.getAttribute("data-look") === cur.m;
            b.setAttribute("aria-pressed", on ? "true" : "false");
            b.classList.toggle("st-btn-main", on);
        });
        document.querySelectorAll("#lookScheme [data-scheme]").forEach(function (b) {
            b.setAttribute("aria-pressed", b.getAttribute("data-scheme") === cur.c ? "true" : "false");
        });
    }
    document.addEventListener("click", function (e) {
        var b = e.target.closest("#lookMode [data-look], #lookScheme [data-scheme]");
        if (!b) return;
        if (b.hasAttribute("data-look")) look.set({ m: b.getAttribute("data-look") });
        else look.set({ c: b.getAttribute("data-scheme") });
    });
    window.addEventListener("southbound-look", sync);
    sync();
})();
