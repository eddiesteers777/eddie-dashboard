/* ==========================================
   Southbound — the Coach Dashboard's "today" list (pure)

   Everything that needs the coach, in one list: every client's attention
   items (needsAttention in js/clientSummary.js, via attentionQueue in
   js/feedbackModel.js) plus new people (applications, website questions,
   accounts waiting for approval). This file groups them by task, counts
   them for the one-line summary, and hides the ones the coach marked
   "Done for today" (coach-queue-done: { itemKey: "YYYY-MM-DD" },
   cloud-synced, so it holds on every device and resets tomorrow).
   Unit-tested in tests/coachToday.test.mjs.
========================================== */

// Task groups, most pressing first. `kinds` are needsAttention kinds plus
// the new-people kinds below; anything unknown lands in Follow up.
export const TASK_GROUPS = [
    { id: "urgent", label: "Urgent", kinds: ["pain", "health"] },
    { id: "reply", label: "Waiting on your reply", kinds: ["change", "checkin", "booking"] },
    { id: "new", label: "New people", kinds: ["pending", "application", "question"] },
    { id: "plans", label: "Plans and training", kinds: ["missed", "skipped", "plan-unseen", "race", "plan"] },
    { id: "followup", label: "Follow up", kinds: ["session-log", "no-show", "quiet", "no-checkin", "profile", "sessions", "intake"] }
];

const groupOf = kind => TASK_GROUPS.find(g => g.kinds.includes(kind)) || TASK_GROUPS[TASK_GROUPS.length - 1];

// What a group's line in the summary says: "2 check-ins to answer" style.
const SUMMARY_WORDS = {
    urgent: ["urgent", "urgent"],
    reply: ["waiting on your reply", "waiting on your reply"],
    new: ["new person", "new people"],
    plans: ["plan or training item", "plan and training items"],
    followup: ["follow-up", "follow-ups"]
};

const ms = v => (typeof v === "number" ? v : v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : Date.parse(v) || 0);

// One stable key per item, so "Done for today" finds it again.
export const itemKey = item => `${item.uid || ""}|${item.kind}|${item.text}`;

/**
 * New people for the list: applications not handled yet, website
 * questions not answered, accounts waiting for approval. An application
 * whose person has already signed in shows once, as the account.
 *   applications: [{ id, name, services, createdAt, status }]
 *   inquiries:    [{ id, name, topic (label), createdAt, status }]
 *   pending:      [{ uid, displayName, email, createdAt }]
 *   matchOf(profile) -> the application that belongs to that account, or null
 *   serviceLabel(value) -> "Running coaching"
 */
export function newPeopleItems({ applications = [], inquiries = [], pending = [], matchOf = () => null, serviceLabel = v => v } = {}) {
    const items = [];
    const claimed = new Set();
    for (const p of pending) {
        const app = matchOf(p);
        if (app) claimed.add(app.id);
        const name = p.displayName || p.email || "Someone";
        items.push({
            kind: "pending", uid: `acct:${p.uid}`, name,
            text: app ? "Applied and signed in. Approve them to start coaching" : "Signed in to the app and is waiting for you to approve them",
            href: "clients.html?tab=pending", at: ms(app?.createdAt) || ms(p.createdAt) || ms(p.applicationSubmittedAt) || undefined
        });
    }
    for (const a of applications) {
        if (a.status === "handled" || claimed.has(a.id)) continue;
        const services = (a.services || []).map(serviceLabel).join(", ").toLowerCase();
        items.push({
            kind: "application", uid: `app:${a.id}`, name: a.name || "Someone",
            text: `Applied${services ? ` for ${services}` : ""}. Get in touch`,
            href: "#applications", at: ms(a.createdAt) || undefined
        });
    }
    for (const q of inquiries) {
        if (q.status === "handled") continue;
        items.push({
            kind: "question", uid: `inq:${q.id}`, name: q.name || "Someone",
            text: `Asked a question${q.topic ? ` about ${String(q.topic).toLowerCase()}` : ""} on the website`,
            href: "#inquiries", at: ms(q.createdAt) || undefined
        });
    }
    return items;
}

// Items not marked done for `today`, and how many were.
export function splitDone(items = [], done = {}, today = "") {
    const shown = [];
    const hidden = [];
    for (const item of items) (done[itemKey(item)] === today ? hidden : shown).push(item);
    return { shown, hidden };
}

// Drop "done" marks from earlier days.
export function pruneDone(done = {}, today = "") {
    return Object.fromEntries(Object.entries(done || {}).filter(([, day]) => day === today));
}

const rankIn = (g, kind) => { const i = g.kinds.indexOf(kind); return i < 0 ? g.kinds.length : i; };

// Items -> [{ id, label, items }] in TASK_GROUPS order, empty groups left
// out. Within a group: the order given (urgency, then client), with the
// longest-waiting first among items of the same kind.
export function groupByTask(items = []) {
    return TASK_GROUPS
        .map(g => ({
            id: g.id,
            label: g.label,
            items: items
                .map((item, i) => ({ item, i }))
                .filter(({ item }) => groupOf(item.kind) === g)
                .sort((a, b) => rankIn(g, a.item.kind) - rankIn(g, b.item.kind)
                    || (a.item.at && b.item.at ? a.item.at - b.item.at : 0) || a.i - b.i)
                .map(({ item }) => item)
        }))
        .filter(g => g.items.length);
}

// Items -> [{ uid, name, items }] in the order given (the queue already
// puts the most urgent client first; new people come last).
export function groupByPerson(items = []) {
    const out = [];
    const at = new Map();
    for (const item of items) {
        if (!at.has(item.uid)) { at.set(item.uid, out.length); out.push({ uid: item.uid, name: item.name, items: [] }); }
        out[at.get(item.uid)].items.push(item);
    }
    return out;
}

// "Good morning, Eddie".
export function greeting(date = new Date(), name = "") {
    const h = date.getHours();
    const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    const first = String(name || "").trim().split(/\s+/)[0];
    return first ? `${part}, ${first}` : part;
}

// { headline, detail } for the line under the greeting.
export function summaryLine(groups = [], hiddenCount = 0) {
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    const done = hiddenCount ? ` ${hiddenCount} marked done for today.` : "";
    if (!total) {
        return { headline: hiddenCount ? "That's everything for today" : "Nothing needs you right now", detail: done.trim() };
    }
    const parts = groups.map(g => {
        const n = g.items.length;
        const [one, many] = SUMMARY_WORDS[g.id] || [g.label.toLowerCase(), g.label.toLowerCase()];
        return `${n} ${n === 1 ? one : many}`;
    });
    return {
        headline: `${total} thing${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} you today`,
        detail: `${parts.join(" · ")}.${done}`
    };
}

// "just now", "3 hours ago", "yesterday", "4 days ago", "3 weeks ago".
export function waitedText(at, now = Date.now()) {
    if (!at) return "";
    const mins = Math.max(0, Math.round((now - at) / 60000));
    if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(mins / 1440);
    if (days === 1) return "yesterday";
    if (days < 14) return `${days} days ago`;
    return `${Math.floor(days / 7)} weeks ago`;
}
