/* ==========================================
   Southbound — Apply (public site)

   Guest applies for coaching/soccer services. Requires Google
   sign-in (so the application lands on a real account rather than
   an anonymous form submission), then writes requestedServices +
   applicationMessage onto that account's own profile -- which
   ensureProfile() already created as "pending" the moment they
   signed in. Applying never grants access by itself; it just gives
   the coach something to look at in My Clients -> Pending.
========================================== */

import { listenForAuth, login, getCurrentUser } from "./auth.js";
import { SERVICES, ensureProfile, getMyProfile, submitApplication } from "./userProfile.js";
import { sendApplicationEmail } from "./emailNotify.js";

// Leaves the standing invite that lets the coach's "Approve" link this
// account in one step (js/coachAccess.js). Never blocks applying.
function leaveApplyCode() {
    import("./coachAccess.js")
        .then(({ ensureApplyCode }) => ensureApplyCode())
        .catch(error => console.warn("Southbound: couldn't leave the apply code.", error));
}

const signedOutEl = document.getElementById("applySignedOut");
const formWrapEl = document.getElementById("applyForm");
const successEl = document.getElementById("applySuccess");

const applySignInBtn = document.getElementById("applySignInBtn");
const applyAvatar = document.getElementById("applyAvatar");
const applyName = document.getElementById("applyName");
const applyEmail = document.getElementById("applyEmail");
const serviceGrid = document.getElementById("applyServiceGrid");
const applicationForm = document.getElementById("applicationForm");
const applyMessage = document.getElementById("applyMessage");
const applySubmitBtn = document.getElementById("applySubmitBtn");
const applyMsg = document.getElementById("applyMsg");

serviceGrid.innerHTML = SERVICES.map(s => `
    <label class="pub-service-check">
        <input type="checkbox" value="${s.value}">
        <span>${s.label}</span>
    </label>
`).join("");

function showMsg(text, isError = false) {
    applyMsg.textContent = text;
    applyMsg.classList.toggle("pub-apply-msg-error", isError);
    applyMsg.hidden = false;
}

applySignInBtn.addEventListener("click", async () => {
    applySignInBtn.disabled = true;
    applySignInBtn.textContent = "Signing in…";
    const success = await login();
    if (!success) {
        applySignInBtn.disabled = false;
        applySignInBtn.textContent = "Sign in with Google";
    }
    // On success, listenForAuth's callback below handles the reveal.
});

applicationForm.addEventListener("submit", async event => {
    event.preventDefault();
    applySubmitBtn.disabled = true;
    applyMsg.hidden = true;

    const requestedServices = [...serviceGrid.querySelectorAll("input:checked")].map(el => el.value);
    const message = applyMessage.value.trim();

    try {
        const user = getCurrentUser();
        await submitApplication(requestedServices, message);
        leaveApplyCode();
        sendApplicationEmail({
            applicantName: user?.displayName || "",
            applicantEmail: user?.email || "",
            requestedServices,
            message,
            link: window.location.origin + window.location.pathname
        }).catch(() => {});

        formWrapEl.hidden = true;
        successEl.hidden = false;
    } catch (error) {
        console.error("Application submit failed:", error);
        showMsg("Couldn't submit your application. Try again.", true);
        applySubmitBtn.disabled = false;
    }
});

listenForAuth(async user => {
    if (!user) {
        signedOutEl.hidden = false;
        formWrapEl.hidden = true;
        successEl.hidden = true;
        return;
    }

    signedOutEl.hidden = true;

    const profile = await ensureProfile();
    const current = profile || await getMyProfile();

    applyAvatar.textContent = (user.displayName || "?").slice(0, 1).toUpperCase();
    applyName.textContent = user.displayName || "";
    applyEmail.textContent = user.email || "";

    if (current?.applicationSubmittedAt) {
        formWrapEl.hidden = true;
        successEl.hidden = false;
        if (current.status === "pending") leaveApplyCode();
    } else {
        formWrapEl.hidden = false;
        successEl.hidden = true;
    }
});
