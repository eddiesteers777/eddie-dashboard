/* ==========================================
   Southbound — coach invite link maker (coach.html)

   A first name and a sport make a link to start.html (js/startFlow.js:
   inviteLink / inviteMessage). Nothing is saved or sent anywhere.
========================================== */
import { INVITE_CHOICES, inviteLink, inviteMessage, cleanInviteName } from "./startFlow.js";
import { toast } from "./ui.js";

const nameEl = document.getElementById("ciName");
const sportsEl = document.getElementById("ciSports");
const outEl = document.getElementById("ciLink");
const linkBtn = document.getElementById("ciCopyLink");
const textBtn = document.getElementById("ciCopyText");
let sport = "";

function draw() {
    sportsEl.innerHTML = INVITE_CHOICES.map(c => `<button type="button" class="ci-sport ${sport === c.value ? "on" : ""}" data-v="${c.value}" aria-pressed="${sport === c.value}">${c.label}</button>`).join("");
    const url = sport ? inviteLink(nameEl.value, sport) : "";
    outEl.textContent = url || "Pick a sport to make their link.";
    outEl.classList.toggle("ci-empty", !url);
    linkBtn.disabled = textBtn.disabled = !url;
}
async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done, { type: "success" }); }
    catch { toast("Couldn't copy. Press and hold the link to copy it.", { type: "error" }); }
}
sportsEl.addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) { sport = b.dataset.v; draw(); } });
nameEl.addEventListener("input", draw);
linkBtn.addEventListener("click", () => sport && copy(inviteLink(nameEl.value, sport), "Link copied"));
textBtn.addEventListener("click", () => sport && copy(inviteMessage(cleanInviteName(nameEl.value), sport), "Message copied"));
draw();
