/* ==========================================
   Southbound — Contact (public site)

   A question form that needs no sign-in. Saves to Firestore first
   (the coach sees it on the Coach Dashboard even if email isn't set
   up), then emails the coach alert as a bonus.
========================================== */

import { INTEREST_OPTIONS, interestLabel, submitInquiry } from "./inquiries.js";
import { sendInquiryEmail } from "./emailNotify.js";

const form = document.getElementById("contactForm");
const nameEl = document.getElementById("contactName");
const emailEl = document.getElementById("contactEmail");
const phoneEl = document.getElementById("contactPhone");
const interestEl = document.getElementById("contactInterest");
const ageWrap = document.getElementById("contactAgeWrap");
const ageEl = document.getElementById("contactAge");
const messageEl = document.getElementById("contactMessage");
const trapEl = document.getElementById("sbLeaveEmpty");
const loadedAt = Date.now();
const submitBtn = document.getElementById("contactSubmitBtn");
const msgEl = document.getElementById("contactMsg");
const successEl = document.getElementById("contactSuccess");
const successText = document.getElementById("contactSuccessText");

interestEl.innerHTML = INTEREST_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

// Links like contact.html?about=soccer_group preselect the topic.
const about = new URLSearchParams(window.location.search).get("about");
if (INTEREST_OPTIONS.some(o => o.value === about)) interestEl.value = about;

const who = () => form.querySelector("input[name=contactWho]:checked")?.value || "self";

form.addEventListener("change", event => {
    if (event.target.name === "contactWho") ageWrap.hidden = who() !== "child";
});

function showMsg(text) {
    msgEl.textContent = text;
    msgEl.classList.add("pub-apply-msg-error");
    msgEl.hidden = false;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

form.addEventListener("submit", async event => {
    event.preventDefault();
    msgEl.hidden = true;

    const data = {
        name: nameEl.value.trim(),
        email: emailEl.value.trim(),
        phone: phoneEl.value.trim(),
        interest: interestEl.value,
        who: who(),
        athleteAge: ageEl.value.trim(),
        message: messageEl.value.trim()
    };

    if (!data.name) { showMsg("Please add your name."); nameEl.focus(); return; }
    if (!data.email && !data.phone) { showMsg("Please add an email or phone number so I can reply."); emailEl.focus(); return; }
    if (data.email && !EMAIL_RE.test(data.email)) { showMsg("That email address doesn't look right."); emailEl.focus(); return; }
    if (!data.message) { showMsg("Please add your question."); messageEl.focus(); return; }

    // A bot filled the hidden field, or submitted faster than a person
    // could type a question: act like it worked, save nothing.
    if (trapEl.value || Date.now() - loadedAt < 2500) {
        form.hidden = true;
        successEl.hidden = false;
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
        // Firestore waits indefinitely on a blocked connection (e.g. a
        // school filter); give up after 15s so the visitor sees an error.
        await Promise.race([
            submitInquiry(data),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000))
        ]);
        sendInquiryEmail({ ...data, interest: interestLabel(data.interest) }).catch(() => {});

        const firstName = data.name.split(/\s+/)[0];
        const via = data.email && data.phone ? "by email or phone" : data.email ? "by email" : "by phone";
        successText.textContent = `Thanks, ${firstName} -- I'll get back to you ${via} soon.`;
        form.hidden = true;
        successEl.hidden = false;
    } catch (error) {
        console.error("Contact form submit failed:", error);
        showMsg(error.message === "timeout"
            ? "This is taking too long -- your network may be blocking it. Try again on another connection (like cell data)."
            : "Couldn't send your question. Check your connection and try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Send Question";
    }
});
