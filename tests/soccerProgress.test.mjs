import test from "node:test";
import assert from "node:assert/strict";
import { soccerProgress } from "../js/soccerProgress.js";

const req = (id, dates, logs) => ({ id, status: "approved", dates, allDates: dates, logs, startTime: "17:30", endTime: "18:30", sessionType: "soccer" });

test("nothing yet means no card", () => {
    const p = soccerProgress([], [], "2026-11-08");
    assert.equal(p.show, false);
    assert.equal(p.sessions, 0);
    assert.equal(p.last, null);
});

test("counts completed sessions only, and finds the latest note", () => {
    const requests = [
        req("a", ["2026-10-27", "2026-11-03", "2026-11-10"], {
            "2026-10-27": { status: "completed", workedOn: "First touch" },
            "2026-11-03": { status: "completed", workedOn: "Finishing", nextTime: "Weaker foot" }
        }),
        req("b", ["2026-11-05"], { "2026-11-05": { status: "no-show" } })
    ];
    const p = soccerProgress(requests, [], "2026-11-08");
    assert.equal(p.sessions, 2);
    assert.deepEqual(p.last, { date: "2026-11-03", workedOn: "Finishing", nextTime: "Weaker foot" });
    assert.equal(p.show, true);
});

test("practices count only the last 30 days of the player's own logs", () => {
    const hw = [{ logs: [{ date: "2026-11-07" }, { date: "2026-11-01" }, { date: "2026-10-01" }, { date: "2026-12-01" }] }, { logs: [{ date: "2026-10-20" }] }];
    const p = soccerProgress([], hw, "2026-11-08");
    assert.equal(p.practices, 3);
    assert.equal(p.show, true);
});
