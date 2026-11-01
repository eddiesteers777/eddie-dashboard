/* ==========================================
   Southbound — homework quality flags (pure)

   Flags practices a coach may want to look at. They never block, hide or
   grade anything: the practice already counts, and the coach decides.
   "Looks good" saves the existing `reviewedAt`, which clears every flag
   raised by logs written before it (tests/homeworkQuality.test.mjs).
   Thresholds are the coach's to change here, not invented standards.
========================================== */
export const CATCH_UP_PER_DAY = 3;   // this many practices logged on one day
export const HARD_IN_A_ROW = 3;      // this many "Hard" feels in a row
export const QUIET_DAYS = 7;         // no practice for this long

const DAY = 864e5;
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);

// -> [{ kind, text }] for one assignment. `now` is ms.
export function qualityFlags(hw, now = Date.now()) {
    if (!hw || hw.status === "archived") return [];
    const reviewed = Number(hw.reviewedMs) || 0;
    const logs = [...(hw.logs || [])].sort((a, b) => (a.at || 0) - (b.at || 0));
    const fresh = logs.filter(l => (l.at || 0) > reviewed);
    const out = [];

    if (hw.cadence === "goal") {
        const n = fresh.filter(l => l.count == null).length;
        if (n) out.push({ kind: "no-count", text: `${n} practice${n === 1 ? "" : "s"} logged with no count, and this one is counted toward a goal.` });
    }

    const perDay = new Map();
    for (const l of fresh) {
        const k = dayOf(l.at || 0);
        perDay.set(k, (perDay.get(k) || 0) + 1);
    }
    const heavy = [...perDay.entries()].find(([, n]) => n >= CATCH_UP_PER_DAY);
    if (heavy) out.push({ kind: "catch-up", text: `${heavy[1]} practices were logged on one day. They may be catching up.` });

    const lastFeels = logs.slice(-HARD_IN_A_ROW);
    if (lastFeels.length === HARD_IN_A_ROW && lastFeels.every(l => l.feel === "hard") && lastFeels.some(l => (l.at || 0) > reviewed)) {
        out.push({ kind: "hard", text: `The last ${HARD_IN_A_ROW} felt Hard. The drill may be too tough.` });
    }

    if (hw.cadence !== "once") {
        const lastAt = logs.length ? (logs[logs.length - 1].at || 0) : (hw.createdMs || 0);
        const since = Math.max(lastAt, reviewed);
        if (since && now - since >= QUIET_DAYS * DAY) out.push({ kind: "quiet", text: `Nothing logged for ${QUIET_DAYS} days or more.` });
    }
    return out;
}

export const flagCount = (list, now) => (list || []).reduce((n, hw) => n + qualityFlags(hw, now).length, 0);
