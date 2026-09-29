/* ==========================================
   Southbound — Client History (pure)

   The Client Hub's History tab: the whole relationship with one client,
   oldest application to today's check-in. The events come from
   buildTimeline in js/clientSummary.js (derived from what's already
   stored; nothing new is saved). This file filters, searches, pages and
   groups them by month, and counts what's happened. Unit-tested in
   tests/clientTimeline.test.mjs.
========================================== */

// History filters, in the order the chips show. `group` values are the
// ones buildTimeline gives each event.
export const TIMELINE_GROUPS = [
    { value: "plan", label: "Plan" },
    { value: "workouts", label: "Workouts" },
    { value: "checkins", label: "Check-ins" },
    { value: "sessions", label: "Sessions" },
    { value: "messages", label: "Updates" },
    { value: "notes", label: "Private notes" },
    { value: "profile", label: "Profile", also: ["account"] }
];

const groupsFor = value => {
    const g = TIMELINE_GROUPS.find(x => x.value === value);
    return g ? [g.value, ...(g.also || [])] : [];
};

// Events in one filter (or all) whose words match the search.
export function filterTimeline(events = [], { group = "all", query = "" } = {}) {
    const groups = group && group !== "all" ? groupsFor(group) : null;
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return events.filter(e => {
        if (groups && !groups.includes(e.group)) return false;
        if (!words.length) return true;
        const hay = `${e.text} ${e.detail || ""}`.toLowerCase();
        return words.every(w => hay.includes(w));
    });
}

// How many events each chip would show, e.g. { all: 40, plan: 6, ... }.
export function groupCounts(events = []) {
    const counts = { all: events.length };
    for (const g of TIMELINE_GROUPS) counts[g.value] = events.filter(e => groupsFor(g.value).includes(e.group)).length;
    return counts;
}

// Newest-first events -> [{ key: "2026-09", label: "September 2026", events }].
export function groupByMonth(events = []) {
    const out = [];
    for (const e of events) {
        const key = String(e.date || "").slice(0, 7);
        if (!key) continue;
        let bucket = out[out.length - 1];
        if (!bucket || bucket.key !== key) {
            const [y, m] = key.split("-").map(Number);
            bucket = { key, label: new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }), events: [] };
            out.push(bucket);
        }
        bucket.events.push(e);
    }
    return out;
}

// What the relationship adds up to, for the line above the list.
export function historyStats(events = []) {
    const count = kinds => events.filter(e => kinds.includes(e.kind)).length;
    const first = events.length ? events[events.length - 1] : null;
    return {
        since: first?.date || "",
        workouts: count(["workout"]),
        skipped: count(["workout-skipped"]),
        checkins: count(["checkin"]),
        sessions: count(["session"]),
        updates: count(["update"]),
        publishes: count(["plan-published"]),
        changes: count(["change"]),
        notes: count(["note"])
    };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "12 workouts logged · 4 check-ins · 3 sessions · 5 updates from you".
export function statsLine(stats) {
    return [
        stats.workouts ? `${plural(stats.workouts, "workout")} logged` : "",
        stats.skipped ? `${stats.skipped} skipped` : "",
        stats.checkins ? plural(stats.checkins, "check-in") : "",
        stats.sessions ? `${plural(stats.sessions, "session")} held` : "",
        stats.publishes ? `${plural(stats.publishes, "plan publish", "plan publishes")}` : "",
        stats.changes ? plural(stats.changes, "change request") : "",
        stats.updates ? `${plural(stats.updates, "update")} from you` : ""
    ].filter(Boolean).join(" · ");
}

// "Tue, Sep 29" (or "Tue, Sep 29, 2025" in another year) and "6:05 PM".
export function eventDay(e, thisYear = new Date().getFullYear()) {
    const d = new Date(e.at);
    return d.toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== thisYear ? { year: "numeric" } : {})
    });
}

export const HISTORY_PAGE = 60;
