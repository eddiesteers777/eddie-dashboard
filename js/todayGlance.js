/* ==========================================
   Southbound — the client's Today at a glance (Phase 8)

   Client Management Phase 8 (docs/CLIENT_MANAGEMENT_PLAN.md): the
   client sees TODAY, NEXT, CHECK-IN and COACH without hunting. Pure:
   the words for Today's NEXT line and the weekly check-in rows on the
   coach card. js/todayClient.js and js/coachCard.js draw them;
   tests/todayGlance.test.mjs.
========================================== */

const pad = n => String(n).padStart(2, "0");
const parse = iso => { const [y, m, d] = String(iso).split("-").map(Number); return new Date(y, m - 1, d); };
const toIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return toIso(d); };
const shortDate = iso => parse(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// Monday of the week holding `iso` (check-ins are kept by it, js/checkins.js).
export function mondayOf(iso) {
    const d = parse(iso);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return toIso(d);
}

// "17:30" -> "5:30 PM"
export function niceTime(hhmm) {
    if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return hhmm || "";
    const [h, m] = hhmm.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

// "Today" / "Tomorrow" / "Mon, Oct 5", plus " · 5:00 PM" for a session.
export function whenLabel(date, today, startTime = "") {
    const day = date === today ? "Today" : date === addDays(today, 1) ? "Tomorrow" : shortDate(date);
    return startTime ? `${day} · ${niceTime(startTime)}` : day;
}

// A week item (js/weekModel.js) in a few words: "10 mi long run",
// "6 mi workout · Tempo", "Strength · Full Body A", "Soccer · 1-on-1".
export function whatLabel(item) {
    if (!item) return "";
    if (item.kind === "run" && item.miles && item.title !== "Logged run") {
        const title = String(item.title).toLowerCase();
        // The session name only when it says more than the type ("Easy run"
        // on an easy day says nothing new).
        const extra = item.detail && item.detail.toLowerCase() !== title ? ` · ${item.detail}` : "";
        return `${item.miles} mi ${title}${extra}`;
    }
    if (item.kind === "strength") return /strength/i.test(item.title || "") ? item.title : `Strength · ${item.title}`;
    return item.title || "";
}

// Today's NEXT line from nextWorkout()'s { date, item } (plus `items`,
// everything on that day): { when, what }. One session carries its time
// in `when`; a run and a session the same day read "4 mi easy run +
// Soccer · 1-on-1 at 5:00 PM".
export function nextLine(next, today) {
    if (!next?.item) return null;
    const items = next.items?.length ? next.items : [next.item];
    if (items.length === 1) {
        const [item] = items;
        return { when: whenLabel(next.date, today, item.kind === "session" ? item.startTime : ""), what: whatLabel(item) };
    }
    return {
        when: whenLabel(next.date, today),
        what: items.map(i => i.kind === "session" && i.startTime ? `${whatLabel(i)} at ${niceTime(i.startTime)}` : whatLabel(i)).join(" + ")
    };
}

// The day's empty state: what someone who only books sessions sees is
// "No session today", not "Rest day".
export function quietDayTitle({ plan = true } = {}) {
    return plan ? "Rest day" : "No session today";
}

// The weekly check-in on the coach card. Check-ins are kept by week
// (Monday to Sunday), so this week's is due by Sunday: a soft line early
// in the week, a prompt from Friday. A reply from the coach stays news
// for this week and the one before, not forever.
//   checkins: the client's own, any order ({ weekOf, status, coachFeedback })
// Returns rows { kind, title, detail, note, soon } (soon = goes last).
export function checkinRows(today, checkins = []) {
    const thisMonday = mondayOf(today);
    const lastMonday = addDays(thisMonday, -7);
    const dow = (parse(today).getDay() + 6) % 7; // 0 = Mon ... 6 = Sun
    const rows = [];
    const thisWeek = checkins.find(c => c.weekOf === thisMonday);
    if (!thisWeek) {
        if (dow >= 4) {
            rows.push({
                kind: "checkin-due",
                title: dow === 6 ? "Weekly check-in due today" : "Weekly check-in due",
                detail: `Two minutes: how did this week go?${dow === 4 ? " Due Sunday." : dow === 5 ? " Due tomorrow." : ""}`
            });
        } else {
            rows.push({ kind: "checkin-soon", title: "Check-in due Sunday", detail: "Two minutes at the end of your week. Start it any time.", soon: true });
        }
    } else if (thisWeek.status !== "reviewed") {
        rows.push({ kind: "checkin-sent", title: "Check-in sent", detail: "Your coach will reply here and by email", soon: true });
    }
    const reply = checkins
        .filter(c => c.status === "reviewed" && String(c.coachFeedback || "").trim() && c.weekOf >= lastMonday)
        .sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0];
    if (reply) {
        rows.push({ kind: "checkin-reply", title: "Your coach replied to your check-in", detail: `Week of ${shortDate(reply.weekOf)}`, note: reply.coachFeedback });
    }
    return rows;
}
