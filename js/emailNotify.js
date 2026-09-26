/* ==========================================
   Southbound — Email Notifications (EmailJS)

   A static site has no server, so emails go out through EmailJS from
   the browser: a public key (meant to be exposed, like the Firebase
   config) plus a service and two templates set up in Eddie's EmailJS
   account. The free plan allows 200 emails a month and 2 templates,
   so everything is built on exactly two:

   1. "Coach alert" -- the recipient is fixed to Eddie's own address
      INSIDE EmailJS (never in this public repo), so these can only
      ever reach him. Used for booking requests, new applications,
      website questions and submitted check-ins.
   2. "Client update" -- sent to the client ({{to_email}}). Used for
      booking approvals/denials and check-in feedback.

   Both templates use the same variables: {{subject}}, {{headline}},
   {{details}}, {{link}}; the client one also uses {{to_name}}.

   Until the values below are filled in, emails are skipped quietly
   (logged to the console) -- bookings, applications and check-ins
   all work fully without them; this only adds the email on top. The
   Coach Dashboard's "Still to set up" card shows which are off.
========================================== */

const SERVICE_ID = "service_vgrqpxp";
const TEMPLATE_COACH_ALERT_ID = "template_09f1ynl";
const TEMPLATE_CLIENT_UPDATE_ID = "template_y44xbx1";
const PUBLIC_KEY = "LmASOr5Jpz-ykYRgm";

const isSet = value => !value.startsWith("YOUR_");
const coreConfigured = () => isSet(SERVICE_ID) && isSet(PUBLIC_KEY);

export function isEmailConfigured() {
    return coreConfigured() && isSet(TEMPLATE_COACH_ALERT_ID) && isSet(TEMPLATE_CLIENT_UPDATE_ID);
}

// Which email features are live -- shown on the Coach Dashboard so an
// unconfigured feature is visible instead of silently doing nothing.
export function getEmailSetupStatus() {
    return {
        coachAlerts: coreConfigured() && isSet(TEMPLATE_COACH_ALERT_ID),
        clientUpdates: coreConfigured() && isSet(TEMPLATE_CLIENT_UPDATE_ID)
    };
}

// Absolute link to a page of this site, wherever it's hosted.
function pageUrl(page) {
    return new URL(page, window.location.href).href;
}

let loadPromise = null;
function loadEmailJs() {
    if (window.emailjs) return Promise.resolve(window.emailjs);
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
        script.onload = () => {
            try {
                window.emailjs.init({ publicKey: PUBLIC_KEY });
                resolve(window.emailjs);
            } catch (error) { reject(error); }
        };
        script.onerror = () => reject(new Error("emailjs-load-failed"));
        document.head.appendChild(script);
    });
    return loadPromise;
}

async function send(templateId, params) {
    if (!coreConfigured() || !isSet(templateId)) {
        console.warn("Southbound: this email isn't set up yet (js/emailNotify.js) -- skipped it; everything else still went through.");
        return false;
    }
    try {
        const emailjs = await loadEmailJs();
        await emailjs.send(SERVICE_ID, templateId, params);
        return true;
    } catch (error) {
        console.warn("Southbound: email notification failed to send.", error);
        return false;
    }
}

function coachAlert({ subject, headline, details, page }) {
    return send(TEMPLATE_COACH_ALERT_ID, { subject, headline, details, link: pageUrl(page) });
}

function clientUpdate({ toEmail, toName, subject, headline, details, page }) {
    if (!toEmail) return Promise.resolve(false);
    return send(TEMPLATE_CLIENT_UPDATE_ID, {
        to_email: toEmail,
        to_name: toName || "there",
        subject, headline, details,
        link: pageUrl(page)
    });
}

const lines = (...parts) => parts.filter(Boolean).join("\n");

// Same labels as SERVICES in js/userProfile.js (not imported: that
// module pulls in Firestore, which email sending doesn't need).
const SERVICE_LABELS = {
    online_coaching: "Online Coaching",
    running: "Running Coaching",
    strength: "Strength Coaching",
    soccer_1on1: "1-on-1 Soccer",
    soccer_group: "Group Soccer"
};

// "2026-09-21" -> "Sep 21"
function niceDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || "")) return isoDate || "";
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function sessionLine({ sessionType, label, dayLabel, startTime, endTime }) {
    return `${sessionType || "Session"}${label ? ` (${label})` : ""}: ${dayLabel || ""}s, ${startTime || ""}–${endTime || ""}`;
}

// ---- To the coach ----

export function sendBookingRequestEmail({ clientName, dates, ...session }) {
    const count = dates?.length || 1;
    return coachAlert({
        subject: `New session request from ${clientName || "a client"}`,
        headline: `${clientName || "A client"} requested ${count === 1 ? "a session" : `${count} sessions`}.`,
        details: lines(sessionLine(session), dates?.[0] ? `Starting ${niceDate(dates[0])}` : ""),
        page: "schedule.html?tab=availability"
    });
}

export function sendApplicationEmail({ applicantName, applicantEmail, requestedServices, message }) {
    return coachAlert({
        subject: `New application: ${applicantName || "someone new"}`,
        headline: `${applicantName || "Someone"} applied to train with you.`,
        details: lines(
            applicantEmail ? `Email: ${applicantEmail}` : "",
            `Interested in: ${(requestedServices || []).map(v => SERVICE_LABELS[v] || v).join(", ") || "not specified"}`,
            message ? `Message: ${message}` : ""
        ),
        page: "clients.html?tab=pending"
    });
}

export function sendInquiryEmail({ name, email, phone, interest, who, athleteAge, message }) {
    return coachAlert({
        subject: `New question from ${name || "the website"}`,
        headline: `${name || "Someone"} sent a question through the website.`,
        details: lines(
            `About: ${interest}`,
            who === "child" ? `For their child${athleteAge ? ` (age ${athleteAge})` : ""}` : "",
            email ? `Email: ${email}` : "",
            phone ? `Phone: ${phone}` : "",
            `Message: ${message}`
        ),
        page: "coach.html#inquiries"
    });
}

export function sendCheckinSubmittedEmail({ clientName, weekOf, rating, notes }) {
    return coachAlert({
        subject: `${clientName || "A client"} checked in`,
        headline: `${clientName || "A client"} submitted their check-in for the week of ${niceDate(weekOf) || "this week"}.`,
        details: lines(rating ? `Rating: ${rating}/5` : "", notes ? `Notes: ${notes}` : ""),
        page: "checkin.html?tab=review"
    });
}

// ---- To the client ----

export function sendBookingResponseEmail({ clientEmail, clientName, coachName, status, coachNote, ...session }) {
    const approved = status === "approved";
    return clientUpdate({
        toEmail: clientEmail,
        toName: clientName,
        subject: approved ? "Your session is booked" : "About your session request",
        headline: `${coachName || "Your coach"} ${approved ? "approved" : "couldn't make"} your session request.`,
        details: lines(sessionLine(session), coachNote ? `Note: ${coachNote}` : ""),
        page: "schedule.html?tab=book"
    });
}

export function sendCheckinReviewedEmail({ clientEmail, clientName, coachName, weekOf, feedback }) {
    return clientUpdate({
        toEmail: clientEmail,
        toName: clientName,
        subject: "Your coach replied to your check-in",
        headline: `${coachName || "Your coach"} reviewed your check-in for the week of ${niceDate(weekOf) || "this week"}.`,
        details: feedback ? `Feedback: ${feedback}` : "",
        page: "checkin.html"
    });
}

// Coach sent the client an update (js/clientNotes.js). The client
// template is fixed text ("your coach sent you something, open the
// app"), so the update itself is only ever read in the app.
export function sendCoachUpdateEmail({ clientEmail, clientName, coachName, text }) {
    return clientUpdate({
        toEmail: clientEmail,
        toName: clientName,
        subject: "An update from your coach",
        headline: `${coachName || "Your coach"} sent you an update.`,
        details: text ? `"${text}"` : "",
        page: "updates.html"
    });
}

// Coach published a plan or a new version of one (js/coachingPlans.js).
export function sendPlanPublishedEmail({ clientEmail, clientName, coachName, planName, firstVersion }) {
    return clientUpdate({
        toEmail: clientEmail,
        toName: clientName,
        subject: firstVersion ? "Your training plan is ready" : "Your training plan was updated",
        headline: `${coachName || "Your coach"} ${firstVersion ? "published your plan" : "updated your plan"}${planName ? `: ${planName}` : ""}.`,
        details: "Open the app to see what's changed.",
        page: "plan.html"
    });
}

// A client flagged pain or discomfort on a workout (js/workoutResults.js).
export function sendPainFlagEmail({ clientName, date, title, painNote }) {
    return coachAlert({
        subject: `${clientName || "A client"} flagged pain on a workout`,
        headline: `${clientName || "A client"} flagged pain or discomfort on ${title || "a workout"} (${date}).`,
        details: painNote ? `"${painNote}"` : "No details given.",
        page: "clients.html"
    });
}

export function sendChangeRequestEmail({ clientName, reasonLabel, date, message }) {
    return coachAlert({
        subject: `${clientName || "A client"} asked for a plan change`,
        headline: `${clientName || "A client"} asked for a change${date ? ` for ${date}` : ""} (${reasonLabel || "other"}).`,
        details: message ? `"${message}"` : "",
        page: "coach.html"
    });
}

export function sendChangeReplyEmail({ clientEmail, clientName, coachName, text }) {
    return clientUpdate({
        toEmail: clientEmail,
        toName: clientName,
        subject: "Your coach answered your change request",
        headline: `${coachName || "Your coach"} answered your change request.`,
        details: text ? `"${text}"` : "",
        page: "plan.html"
    });
}
