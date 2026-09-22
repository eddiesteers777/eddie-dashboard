/* ==========================================
   EddieOS — Email Notifications (EmailJS)

   This is a static site with no server, so real email needs a
   client-side-safe service -- EmailJS lets a browser send email
   directly using a public key (like a Firebase config value, it's
   meant to be exposed) plus a Service ID and Template ID you create
   in your own EmailJS account. Free tier covers ~200 emails/month,
   which is plenty for a personal training client list.

   ---- One-time setup (does this once, outside of code) ----
   1. Sign up free at https://www.emailjs.com
   2. Email Services -> Add a service (Gmail is the easiest) -> copy
      its Service ID into SERVICE_ID below.
   3. Email Templates -> create two templates:
        a) "Booking Request" -- sent to YOU when a client requests a
           session. Suggested variables: {{client_name}},
           {{session_type}}, {{label}}, {{day_label}}, {{start_time}},
           {{end_time}}, {{session_count}}, {{first_date}}, {{link}}.
           Copy its Template ID into TEMPLATE_REQUEST_ID.
        b) "Booking Response" -- sent to the CLIENT when you approve
           or deny. Suggested variables: {{coach_name}}, {{status}},
           {{session_type}}, {{label}}, {{day_label}}, {{start_time}},
           {{end_time}}, {{coach_note}}, {{link}}. Copy its Template
           ID into TEMPLATE_RESPONSE_ID.
        Both templates need a "To email" field set to {{to_email}}.
   4. Account -> General -> copy your Public Key into PUBLIC_KEY.

   Until all four values below are filled in, emails are silently
   skipped (logged to console only) -- the booking flow itself works
   fully either way, this only gates the email alert on top of it.
========================================== */

const SERVICE_ID = "YOUR_EMAILJS_SERVICE_ID";
const TEMPLATE_REQUEST_ID = "YOUR_EMAILJS_REQUEST_TEMPLATE_ID";
const TEMPLATE_RESPONSE_ID = "YOUR_EMAILJS_RESPONSE_TEMPLATE_ID";
const PUBLIC_KEY = "YOUR_EMAILJS_PUBLIC_KEY";

export function isEmailConfigured() {
    return ![SERVICE_ID, TEMPLATE_REQUEST_ID, TEMPLATE_RESPONSE_ID, PUBLIC_KEY].some(v => v.startsWith("YOUR_"));
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
    if (!isEmailConfigured()) {
        console.warn("EddieOS: EmailJS isn't set up yet (js/emailNotify.js) -- skipping the email, the booking itself still went through.");
        return false;
    }
    try {
        const emailjs = await loadEmailJs();
        await emailjs.send(SERVICE_ID, templateId, params);
        return true;
    } catch (error) {
        console.warn("EddieOS: email notification failed to send.", error);
        return false;
    }
}

export async function sendBookingRequestEmail({ coachEmail, coachName, clientName, sessionType, label, dayLabel, startTime, endTime, dates, link }) {
    return send(TEMPLATE_REQUEST_ID, {
        to_email: coachEmail,
        coach_name: coachName || "",
        client_name: clientName || "",
        session_type: sessionType || "",
        label: label || "",
        day_label: dayLabel || "",
        start_time: startTime || "",
        end_time: endTime || "",
        session_count: dates?.length || 1,
        first_date: dates?.[0] || "",
        link: link || ""
    });
}

export async function sendBookingResponseEmail({ clientEmail, clientName, coachName, status, sessionType, label, dayLabel, startTime, endTime, coachNote, link }) {
    return send(TEMPLATE_RESPONSE_ID, {
        to_email: clientEmail,
        client_name: clientName || "",
        coach_name: coachName || "",
        status: status || "",
        session_type: sessionType || "",
        label: label || "",
        day_label: dayLabel || "",
        start_time: startTime || "",
        end_time: endTime || "",
        coach_note: coachNote || "",
        link: link || ""
    });
}
