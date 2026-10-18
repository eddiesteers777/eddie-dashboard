import assert from "node:assert/strict";
import {
    parseYouTube, parseClock, clockText, embedUrl, progress, standing, streak, cleanAssignment, validAssignment,
    cleanLog, sortForClient, weekStart, addDays, targetPerWeek, recentPractices
} from "../js/homeworkModel.js";

const ID = "dQw4w9WgXcQ";
for (const u of [`https://www.youtube.com/watch?v=${ID}`, `youtube.com/watch?v=${ID}&t=30`, `https://youtu.be/${ID}?si=x`,
    `https://m.youtube.com/watch?v=${ID}`, `https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`])
    assert.equal(parseYouTube(u), ID, u);
for (const u of ["", "hello", "https://vimeo.com/123", "https://evil.com/watch?v=" + ID, `https://youtube.com.evil.com/watch?v=${ID}`, "https://youtube.com/watch?v=short", "javascript:alert(1)"])
    assert.equal(parseYouTube(u), "", u);

assert.equal(parseClock("1:10"), 70); assert.equal(parseClock("70"), 70); assert.equal(parseClock("1:02:03"), 3723);
assert.equal(parseClock(""), null); assert.equal(parseClock("1:75"), null); assert.equal(parseClock("abc"), null);
assert.equal(clockText(70), "1:10"); assert.equal(clockText(3723), "1:02:03"); assert.equal(clockText(-1), "");

assert.equal(embedUrl(ID, 70, 220), `https://www.youtube-nocookie.com/embed/${ID}?rel=0&playsinline=1&modestbranding=1&start=70&end=220`);
assert.equal(embedUrl("bad"), "");

// 2026-10-14 is a Wednesday.
assert.equal(weekStart("2026-10-14"), "2026-10-12"); assert.equal(weekStart("2026-10-18"), "2026-10-12"); assert.equal(addDays("2026-10-31", 1), "2026-11-01");
const wk = (n, logs) => ({ cadence: "weekly", timesPerWeek: n, logs: logs.map(date => ({ date })) });
assert.equal(progress(wk(3, ["2026-10-12", "2026-10-12", "2026-10-13"]), "2026-10-14").done, 2); // same day counts once
assert.equal(progress(wk(3, ["2026-10-05"]), "2026-10-14").done, 0); // last week doesn't count
assert.equal(progress(wk(3, ["2026-10-12", "2026-10-13", "2026-10-14"]), "2026-10-14").complete, true);
assert.equal(progress({ cadence: "once", logs: [] }, "2026-10-14").complete, false);
assert.equal(progress({ cadence: "goal", goal: 50, logs: [{ date: "2026-10-12", count: 38 }, { date: "2026-10-13", count: 31 }] }, "2026-10-14").done, 38);
assert.equal(targetPerWeek({ cadence: "daily" }), 7);

assert.equal(standing(wk(3, ["2026-10-12", "2026-10-13"]), "2026-10-14"), "on-track");
assert.equal(standing(wk(3, []), "2026-10-17"), "behind");
assert.equal(standing({ cadence: "once", dueDate: "2026-10-10", logs: [] }, "2026-10-14"), "overdue");
assert.equal(standing({ cadence: "once", dueDate: "2026-10-10", logs: [{ date: "2026-10-09" }] }, "2026-10-14"), "done");
assert.equal(standing({ status: "archived", cadence: "once", logs: [] }, "2026-10-14"), "archived");

assert.equal(streak([{ logs: [{ date: "2026-10-14" }, { date: "2026-10-13" }] }, { logs: [{ date: "2026-10-12" }] }], "2026-10-14"), 3);
assert.equal(streak([{ logs: [{ date: "2026-10-13" }] }], "2026-10-14"), 1); // yesterday still counts
assert.equal(streak([{ logs: [{ date: "2026-10-10" }] }], "2026-10-14"), 0);

const a = cleanAssignment({ title: "  Wall passes  ", videoUrl: `https://youtu.be/${ID}`, startSec: 70, endSec: 60, cadence: "weekly", timesPerWeek: 9, minutes: 10, dueDate: "2026-10-24", askClip: "yes" });
assert.equal(a.title, "Wall passes"); assert.equal(a.videoId, ID); assert.equal(a.startSec, 70); assert.equal(a.endSec, null);
assert.equal(a.timesPerWeek, 3); assert.equal(a.askClip, false); assert.equal(a.goal, null);
assert.equal(cleanAssignment({ title: "x", startSec: 5 }).startSec, null); // no video, no clip
assert.equal(validAssignment(cleanAssignment({ title: "" })), "Give it a title.");
assert.equal(validAssignment(cleanAssignment({ title: "J", cadence: "goal" })), "Set the goal number.");
assert.equal(cleanAssignment({ title: "x", cadence: "nope" }).cadence, "once");

const l = cleanLog({ date: "2026-10-14", count: "38", feel: "okay", note: "n".repeat(400) }, 5);
assert.equal(l.count, 38); assert.equal(l.feel, "okay"); assert.equal(l.note.length, 300); assert.equal(l.at, 5);
assert.equal(cleanLog({ count: -4, feel: "wow" }, 0).count, null);

const list = [
    { id: "a", cadence: "once", dueDate: "2026-10-20", logs: [{ date: "2026-10-14" }], createdMs: 1 },
    { id: "b", cadence: "once", dueDate: "2026-10-24", logs: [], createdMs: 2 },
    { id: "c", cadence: "once", dueDate: "2026-10-18", logs: [], createdMs: 3 },
    { id: "d", status: "archived", cadence: "once", logs: [] }
];
assert.deepEqual(sortForClient(list, "2026-10-14").map(h => h.id), ["c", "b", "a"]);
assert.equal(recentPractices([{ id: "a", logs: [{ at: 5 }, { at: 1 }] }], 3).length, 1);
console.log("homeworkModel ok");
