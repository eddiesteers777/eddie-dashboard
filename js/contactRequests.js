/* ==========================================================
   contactRequests.js -- links into the Contact form that arrive
   with the topic chosen and the message already written, e.g.
   contact.html?about=other&request=delete-account

   The words are fixed here, never taken from the link, so a link
   can't put its own text in front of someone. Pure, so it's
   unit-tested.
   ========================================================== */

export const REQUESTS = Object.freeze({
    "delete-account": Object.freeze({
        about: "other",
        message: "Please delete my Southbound account and everything in it (my profile, plans, workout logs, check-ins and messages). Please let me know once it's done."
    })
});

/** The request a link asks for, or null. */
export function requestFor(key) {
    return Object.prototype.hasOwnProperty.call(REQUESTS, key) ? REQUESTS[key] : null;
}
