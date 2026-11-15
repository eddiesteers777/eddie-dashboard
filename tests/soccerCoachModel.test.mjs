import test from "node:test";
import assert from "node:assert/strict";
import { upcomingSessions, waitingRequests, homeworkToReview, soccerCounts } from "../js/soccerCoachModel.js";

const r = (id, who, date, status = "approved", extra = {}) => ({ id, status, clientUid: who, clientName: who, slotId: "s1", startTime: "09:00", endTime: "10:00", sessionType: "soccer", label: "Group U12", dates: [date], allDates: [date], ...extra });

test("a group session is one row with every player booked", () => {
    const rows = upcomingSessions([r("a", "Ava", "2026-11-21"), r("b", "Jordan", "2026-11-21"), r("c", "Old", "2026-11-10")], "2026-11-15");
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].players.map(p => p.name), ["Ava", "Jordan"]);
});

test("requests waiting are only the unanswered ones", () => {
    assert.equal(waitingRequests([r("a", "x", "2026-11-21", "requested"), r("b", "y", "2026-11-21")]).length, 1);
});

test("homework to review lists practices newer than the last review", () => {
    const hw = [
        { id: "1", logs: [{ at: 100 }, { at: 300 }], reviewedMs: 200 },
        { id: "2", logs: [{ at: 100 }], reviewedMs: 200 },
        { id: "3", logs: [{ at: 999 }], status: "archived" },
        { id: "4", logs: [{ at: 50 }], reviewedMs: 0 }
    ];
    const out = homeworkToReview(hw);
    assert.deepEqual(out.map(o => o.hw.id), ["1", "4"]);
    assert.equal(out[0].fresh, 1);
});

test("counts for the strip", () => {
    const c = soccerCounts({ requests: [r("a", "Ava", "2026-11-17"), r("b", "Jo", "2026-11-30"), r("c", "Zed", "2026-11-17", "requested")], homework: [{ id: "1", logs: [{ at: 5 }, { at: 6 }] }], today: "2026-11-15" });
    assert.deepEqual(c, { thisWeek: 1, requests: 1, toReview: 1, practices: 2 });
});
