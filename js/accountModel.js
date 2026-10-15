/* ==========================================
   The account button in the header (premium shell): what its avatar shows.
   Pure: no DOM, so it is unit tested (tests/accountModel.test.mjs).
   js/account.js paints it. Only the display name is used, never the email.
========================================== */

const WORD = /[\p{L}\p{N}]/u;

// The first letter of the first and last name: "Maya Lopez" -> "ML", "Maya" -> "M",
// "Maya J. Lopez" -> "ML". Nothing readable (empty, emoji only) -> "".
export function initialsOf(name) {
    const words = String(name || "").trim().split(/\s+/).filter(word => WORD.test(word));
    if (!words.length) return "";
    const letter = word => Array.from(word.replace(/^[^\p{L}\p{N}]+/u, ""))[0] || "";
    const first = letter(words[0]);
    if (words.length === 1) return first.toUpperCase();
    return (first + letter(words[words.length - 1])).toUpperCase();
}

// A profile photo is used only when it is an https address (Google's are). Anything else is ignored
// and the initials show, so a bad value can never put a script or a local file in an <img>.
export function safePhotoUrl(url) {
    const value = String(url || "").trim();
    if (!/^https:\/\/[^\s"'<>]+$/i.test(value)) return "";
    return value;
}

// The words a screen reader hears on the avatar button.
export function accountLabel(user) {
    if (!user) return "Account: sign in";
    const first = String(user.displayName || "").trim().split(/\s+/)[0];
    return first ? `Account: ${first}` : "Account";
}
