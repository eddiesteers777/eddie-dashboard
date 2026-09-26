/* ==========================================
   Southbound — reaction emojis (the list + text tokens, pure)

   Southbound's own reaction language for the personal side of coaching:
   coach replies, updates, check-ins, workout notes, celebrations. Never
   a replacement for the app's working icons (js/icons.js) or for words:
   the text carries the meaning, the emoji adds the feeling.

   Stored by stable ID, not Unicode, so they look the same on every
   phone: a message holds the token ":sb_great_work:" and the app draws
   emoji/sb_great_work.svg. Anything that can't draw images (emails)
   gets the label instead: "[Great Work]".

   The drawings come from scripts/build-emoji.mjs. The picker UI is
   js/emojiPicker.js. Unit-tested in tests/emoji.test.mjs.
========================================== */

export const EMOJI_CATEGORIES = [
    { key: "training", label: "Training" },
    { key: "recovery", label: "Recovery" },
    { key: "coach", label: "Coach" },
    { key: "milestones", label: "Milestones" }
];

export const EMOJI = [
    { id: "sb_locked_in", label: "Locked In", category: "training" },
    { id: "sb_lets_go", label: "Let's Go", category: "training" },
    { id: "sb_strong", label: "Strong", category: "training" },
    { id: "sb_long_run", label: "Long Run", category: "training" },
    { id: "sb_big_effort", label: "Big Effort", category: "training" },
    { id: "sb_trail", label: "Trail", category: "training" },
    { id: "sb_soccer", label: "Soccer", category: "training" },

    { id: "sb_easy_day", label: "Easy Day", category: "recovery" },
    { id: "sb_recovery", label: "Recovery", category: "recovery" },
    { id: "sb_sleep", label: "Sleep", category: "recovery" },
    { id: "sb_hydrate", label: "Hydrate", category: "recovery" },
    { id: "sb_fuel", label: "Fuel Up", category: "recovery" },

    { id: "sb_southbound", label: "Southbound", category: "coach" },
    { id: "sb_great_work", label: "Great Work", category: "coach" },
    { id: "sb_high_five", label: "High Five", category: "coach" },
    { id: "sb_coach_eye", label: "Coach's Eye", category: "coach" },
    { id: "sb_check", label: "Done", category: "coach" },
    { id: "sb_adjust", label: "Adjust", category: "coach" },
    { id: "sb_scheduled", label: "Scheduled", category: "coach" },

    { id: "sb_pr", label: "PR", category: "milestones" },
    { id: "sb_race_day", label: "Race Day", category: "milestones" },
    { id: "sb_finish", label: "Finish", category: "milestones" },
    { id: "sb_tired_proud", label: "Tired but Proud", category: "milestones" },
    { id: "sb_survived", label: "Survived", category: "milestones" }
];

// The handful a coach reaches for most, shown as one-tap buttons.
export const QUICK_REACTIONS = ["sb_great_work", "sb_big_effort", "sb_strong", "sb_high_five", "sb_coach_eye"];

const BY_ID = new Map(EMOJI.map(e => [e.id, e]));
export const emojiById = id => BY_ID.get(id) || null;
export const emojiAsset = id => `emoji/${id}.svg`;
export const emojiToken = id => `:${id}:`;

const TOKEN = /:(sb_[a-z_]+):/g;
const escAttr = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function emojiImg(id, { size = 22, className = "" } = {}) {
    const e = emojiById(id);
    if (!e) return "";
    return `<img class="sb-emoji${className ? ` ${className}` : ""}" src="${emojiAsset(id)}" alt="${escAttr(e.label)}" title="${escAttr(e.label)}" width="${size}" height="${size}" draggable="false">`;
}

// Is there anything to draw? (Known tokens only.)
export function hasEmoji(text) {
    return [...String(text ?? "").matchAll(TOKEN)].some(m => BY_ID.has(m[1]));
}

// A message that is nothing but reactions ("great work!" as one emoji)
// shows them bigger, the way chat apps do.
export function onlyEmoji(text) {
    const s = String(text ?? "");
    return hasEmoji(s) && s.replace(TOKEN, (t, id) => (BY_ID.has(id) ? "" : t)).trim() === "";
}

/**
 * Already-escaped HTML text -> the same text with known tokens drawn.
 * Tokens are plain ASCII, so escaping never touches them. Unknown
 * tokens stay as typed.
 */
export function renderEmojiText(html, { size } = {}) {
    const s = String(html ?? "");
    if (!s.includes(":sb_")) return s;
    const big = onlyEmoji(s);
    return s.replace(TOKEN, (t, id) => (BY_ID.has(id) ? emojiImg(id, { size: size || (big ? 40 : 22), className: big ? "is-big" : "" }) : t));
}

// For places that can't draw images (emails, notifications): "[Great Work]".
export function emojiPlainText(text) {
    return String(text ?? "").replace(TOKEN, (t, id) => (BY_ID.has(id) ? `[${BY_ID.get(id).label}]` : t));
}

// Insert a token into text at a cursor position, with sensible spacing.
// -> { text, cursor }
export function insertToken(text, id, start = String(text ?? "").length, end = start) {
    const s = String(text ?? "");
    const before = s.slice(0, start), after = s.slice(end);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const trail = after && !/^\s/.test(after) ? " " : after ? "" : " ";
    const piece = `${lead}${emojiToken(id)}${trail}`;
    return { text: before + piece + after, cursor: before.length + piece.length };
}
