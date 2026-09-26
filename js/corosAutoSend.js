/* ==========================================
   Southbound — send the coach's workouts to a client's COROS automatically

   For clients whose COROS is connected on this device, with "Send my
   coach's workouts automatically" on (Settings; on unless they turn it
   off: "coros-auto-send" = "off"). Runs on every page load from
   js/loadHeader.js, after the coach's newest plan has come down
   (js/coachPlanSync.js):
     - the next 14 days of every active coach plan ("coach-plans")
     - sends what isn't on COROS yet, updates what the coach changed
       (js/corosSend.js, the same path as the Send buttons)
     - says so in a toast; problems (a run the coach removed, one COROS
       won't let change) are shown once each, not on every page load
       ("coros-auto-noticed": key -> what was shown)
   Nothing to do = no COROS calls at all. Runs only while the app is
   open: sending with the app closed would need a server holding every
   client's COROS sign-in.
========================================== */

import { loadCoachPlans } from "./coachPlanStore.js";
import { entryFor, loadSent, sendState, sendToCoros, sendSummary, isCorosConnected } from "./corosSend.js";
import { courseHash } from "./corosWorkout.js";

export const AUTO_KEY = "coros-auto-send";
const NOTICED_KEY = "coros-auto-noticed";
const DAYS_AHEAD = 14;

const pad = n => String(n).padStart(2, "0");
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function autoSendOn() {
    try { return localStorage.getItem(AUTO_KEY) !== "off"; } catch { return false; }
}
export function setAutoSend(on) {
    localStorage.setItem(AUTO_KEY, on ? "on" : "off");
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
}

function loadNoticed() {
    try { return JSON.parse(localStorage.getItem(NOTICED_KEY) || "{}") || {}; } catch { return {}; }
}

// What a day's state looks like, so the same problem isn't reported twice.
const signature = (entry, state) => (state === "gone" ? "gone" : `changed:${courseHash(entry.course)}`);

/** The coach-plan days in the next two weeks that need sending (pure given storage). */
export function pendingEntries(now = new Date()) {
    const today = isoDate(now);
    const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() + i); return isoDate(d); });
    const sent = loadSent();
    const noticed = loadNoticed();
    const plans = loadCoachPlans().filter(p => p.status !== "archived" && p.generatedPlan);
    return {
        today,
        entries: plans.flatMap(p => dates.map(d => entryFor(p, d)))
            .filter(e => {
                const st = sendState(e, sent);
                if (st === "none") return true;
                if (st === "changed" || st === "gone") return noticed[e.key] !== signature(e, st);
                return false;
            })
    };
}

let running = false;

/** Returns the send result, or null when it's off / not connected / nothing to do. */
export async function runCorosAutoSend({ now = new Date(), notify = true } = {}) {
    if (running || !autoSendOn() || !isCorosConnected()) return null;
    const { today, entries } = pendingEntries(now);
    if (!entries.length) return null;
    running = true;
    try {
        const result = await sendToCoros(entries, { today });
        // Anything still changed / gone after trying was reported: remember it.
        const sent = loadSent();
        const noticed = loadNoticed();
        for (const e of entries) {
            const st = sendState(e, sent);
            if (st === "changed" || st === "gone") noticed[e.key] = signature(e, st);
            else delete noticed[e.key];
        }
        localStorage.setItem(NOTICED_KEY, JSON.stringify(noticed));
        if (notify) await tell(result);
        return result;
    } catch (error) {
        console.warn("Southbound: automatic COROS send failed.", error);
        return null;
    } finally {
        running = false;
    }
}

async function tell(result) {
    const summary = sendSummary(result);
    const { toast, sbAlert } = await import("./ui.js");
    if (result.notes.length) {
        toast(`${summary ? `${summary}. ` : ""}${result.notes.length === 1 ? "1 workout needs" : `${result.notes.length} workouts need`} a look in the COROS app.`, {
            type: "info",
            action: { label: "Details", onClick: () => sbAlert(result.notes.join("\n\n"), { title: "COROS" }) }
        });
    } else if (result.created || result.updated) {
        toast(`${summary} automatically. Your watch gets them when it syncs.`);
    }
}
