// Settings > Look (Eddie, 2026-11-25, step 3 of making Southbound look as premium as Anchor Board): Light, Night or
// Match device. js/appLookBoot.js holds the choice (window.SouthboundLook) and saves it on this device; this only
// draws the three buttons and keeps them in step. Colourways join this section in step 4.
(function () {
    var box = document.getElementById("lookMode");
    var look = window.SouthboundLook;
    if (!box) return;
    if (!look) { var sec = document.getElementById("lookSettings"); if (sec) sec.hidden = true; return; }
    box.innerHTML = look.modes.map(function (m) {
        return '<button type="button" class="st-btn" data-look="' + m[0] + '" aria-pressed="false">' + m[1] + "</button>";
    }).join("");
    function sync() {
        var cur = look.get().m;
        box.querySelectorAll("button").forEach(function (b) {
            var on = b.getAttribute("data-look") === cur;
            b.setAttribute("aria-pressed", on ? "true" : "false");
            b.classList.toggle("st-btn-main", on);
        });
    }
    box.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-look]");
        if (b) look.set({ m: b.getAttribute("data-look") });
    });
    window.addEventListener("southbound-look", sync);
    sync();
})();
