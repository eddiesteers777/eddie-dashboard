/* ==========================================
   Southbound — Send to COROS

   Puts planned runs on the athlete's own COROS schedule (their watch
   syncs it): createScheduledWorkout for a new day, and for a day sent
   before whose workout has changed, queryScheduledWorkoutDetails +
   updateScheduledWorkout (a full replacement, as COROS asks).
   What was sent is remembered in "coros-sent" (cloud-synced, so
   another device knows): { "programId|date": { idInPlan, hash, name,
   date, sentAt } }.

   COROS can't move or delete a scheduled workout from outside its app,
   so when a sent day no longer has a run (the coach moved or removed
   it) the athlete is told to remove it in the COROS app.
   The course itself comes from js/corosWorkout.js.
========================================== */

import { callTool, isCorosConnected } from "./corosClient.js";
import { courseFromDay, courseHash, sendableDate, idInPlanFrom } from "./corosWorkout.js";
import { typeLabel } from "./coachingPlanModel.js";

export { isCorosConnected };

const KEY = "coros-sent";
const ymd = date => String(date).replace(/-/g, "");
const pause = ms => new Promise(r => setTimeout(r, ms));

export function loadSent() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}
function saveSent(map) {
    localStorage.setItem(KEY, JSON.stringify(map));
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
}

export const sentKey = (programId, date) => `${programId}|${date}`;

// A plan day -> what we'd send (or null for a day with nothing to run).
export function entryFor(program, date) {
    const day = (program?.generatedPlan?.weeks || []).flatMap(w => w.days || []).find(d => d.date === date);
    const course = day ? courseFromDay(day, { title: typeLabel(day.type) || "Run", coachName: program.coachName || "" }) : null;
    return { key: sentKey(program.id, date), date, course };
}

// "none" (not sent) | "sent" (on COROS, up to date) | "changed" (sent, plan changed since) | "gone" (sent, no run now)
export function sendState(entry, sent = loadSent()) {
    const rec = sent[entry.key];
    if (!rec) return entry.course ? "none" : "empty";
    if (!entry.course) return "gone";
    return rec.hash === courseHash(entry.course) ? "sent" : "changed";
}

/**
 * entries: [{ key, date, course }] -> { created, updated, unchanged, notes: [text] }
 * One call at a time, a moment apart, so COROS doesn't see a burst.
 */
export async function sendToCoros(entries, { today }) {
    const sent = loadSent();
    const out = { created: 0, updated: 0, unchanged: 0, notes: [] };
    const nice = date => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    let calls = 0;
    const call = async (name, args) => { if (calls++) await pause(350); return callTool(name, args); };

    for (const e of entries) {
        const rec = sent[e.key];
        if (!e.course) {
            if (rec) out.notes.push(`${nice(e.date)}: there's no run that day any more. Remove "${rec.name}" in the COROS app.`);
            continue;
        }
        if (!sendableDate(e.date, today)) continue;
        const hash = courseHash(e.course);
        try {
            if (rec && rec.hash === hash) { out.unchanged++; continue; }
            if (rec && !rec.idInPlan) {
                out.notes.push(`${nice(e.date)}: this workout changed, but Southbound can't update that one. Change it in the COROS app.`);
                continue;
            }
            if (rec) {
                const details = await call("queryScheduledWorkoutDetails", { date: ymd(e.date), idInPlan: rec.idInPlan });
                if (/editable\\?"?\s*[:=]\s*false/i.test(JSON.stringify(details))) {
                    out.notes.push(`${nice(e.date)}: COROS won't let this one change (done already, or edited in the COROS app).`);
                    continue;
                }
                const result = await call("updateScheduledWorkout", { date: ymd(e.date), idInPlan: rec.idInPlan, course: e.course });
                sent[e.key] = { ...rec, idInPlan: idInPlanFrom(result) || rec.idInPlan, hash, name: e.course.courseName, sentAt: Date.now() };
                out.updated++;
            } else {
                const result = await call("createScheduledWorkout", { date: ymd(e.date), course: e.course });
                sent[e.key] = { idInPlan: idInPlanFrom(result), hash, name: e.course.courseName, date: e.date, sentAt: Date.now() };
                out.created++;
            }
            saveSent(sent);
        } catch (error) {
            out.notes.push(`${nice(e.date)}: ${error.message || "COROS didn't take it."}`);
            if (/401|Reconnect COROS|not connected/i.test(error.message || "")) break;
        }
    }
    return out;
}

// "2 workouts sent to COROS, 1 updated" for a toast.
export function sendSummary(r) {
    const parts = [];
    if (r.created) parts.push(`${r.created} ${r.created === 1 ? "workout" : "workouts"} sent to COROS`);
    if (r.updated) parts.push(`${r.updated} updated`);
    if (!parts.length && r.unchanged) parts.push("Already on your COROS schedule");
    return parts.join(", ");
}
