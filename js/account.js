/* ==========================================
   The account button (premium shell): a circle in the header, showing the
   person's Google photo or their initials, that opens the account sheet
   (#accountDialog in components/header.html: name, Profile, Settings,
   quick add, sync, Sign in / Sign out). The sign-in, sign-out, name and sync
   controls keep their ids; js/loadHeader.js still wires them.

   Pure parts (initials, safe photo address) are in js/accountModel.js.
========================================== */

import { icon } from "./icons.js";
import { cachedRole } from "./role.js";
import { initialsOf, safePhotoUrl, accountLabel } from "./accountModel.js";

function paintOne(el, user) {
    const photo = safePhotoUrl(user?.photoURL);
    const initials = initialsOf(user?.displayName);
    const fallback = () => {
        el.innerHTML = initials ? `<span class="avatar-initials" aria-hidden="true">${initials}</span>` : icon("user");
    };
    if (user && photo) {
        const img = new Image();
        img.alt = "";
        img.className = "avatar-photo";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", fallback, { once: true });
        img.src = photo;
        el.replaceChildren(img);
    } else if (user) {
        fallback();
    } else {
        el.innerHTML = icon("user");
    }
}

// Called with the signed-in user, or null for a guest, whenever sign-in changes.
export function paintAccount(user) {
    document.querySelectorAll("[data-avatar]").forEach(el => paintOne(el, user));
    document.querySelectorAll("[data-account]").forEach(btn => btn.setAttribute("aria-label", accountLabel(user)));
    document.querySelectorAll("[data-auth=in]").forEach(el => { el.hidden = !user; });
    document.querySelectorAll("[data-auth=out]").forEach(el => { el.hidden = Boolean(user); });
    const sub = document.getElementById("accountSub");
    if (sub) sub.textContent = user ? "Signed in with Google" : "Not signed in";
    document.querySelector(".sb-account")?.classList.toggle("is-guest", !user);
    // The name under the avatar in the computer sidebar.
    document.querySelectorAll("[data-side-name]").forEach(el => { el.textContent = user ? (user.displayName || "Account") : "Sign in"; });
    paintRole(user ? cachedRole() : null);
}

// The role under the name. Painted again once the profile has answered (js/loadHeader.js), so a device
// that didn't know the role yet doesn't leave it blank.
export function paintRole(role) {
    document.querySelectorAll("[data-side-role]").forEach(el => { el.textContent = role === "coach" ? "Coach" : role ? "Client" : ""; });
}

// Wires every [data-account] button to open the sheet.
export function initAccount() {
    const dialog = document.getElementById("accountDialog");
    if (!dialog) return;
    document.querySelectorAll("[data-account]").forEach(btn => {
        btn.addEventListener("click", () => {
            if (!dialog.open) dialog.showModal();
            btn.setAttribute("aria-expanded", "true");
        });
    });
    // A tap outside the sheet, or on a link inside it, closes it.
    dialog.addEventListener("click", event => {
        if (event.target === dialog || event.target.closest("a[href]")) dialog.close();
    });
    dialog.addEventListener("close", () => {
        document.querySelectorAll("[data-account]").forEach(btn => btn.setAttribute("aria-expanded", "false"));
    });
}
