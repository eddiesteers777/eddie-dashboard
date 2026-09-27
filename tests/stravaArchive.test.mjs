// Unit tests for reading a Strava archive (js/stravaArchive.js). Run: npm run test:static
process.env.TZ = "America/Chicago";
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { parseCsv, csvDate, readActivitiesCsv, listZip, readZipEntry, readArchive, activityKey, csvShift } from "../js/stravaArchive.js";
import { steadyRun, buildZip } from "./fitFixture.mjs";

// Strava's real header (English account): some columns repeat (Elapsed Time, Distance, Max Heart Rate…).
const HEAD = "Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance,Max Speed,Average Speed,Elevation Gain,Elevation Loss,Elevation Low,Elevation High,Max Grade,Average Grade,Average Positive Grade,Average Negative Grade,Max Cadence,Average Cadence,Max Heart Rate,Average Heart Rate,Max Watts,Average Watts,Calories";
const row = o => [o.id, `"${o.date}"`, `"${o.name}"`, o.type, `"${o.desc || ""}"`, o.elapsed, o.km, o.max ?? "", "", "false", "", "", o.file || "", "", "", `${o.elapsed}.0`, `${o.moving}.0`, `${o.km * 1000}`, "", (o.km * 1000 / o.moving).toFixed(3), o.gain ?? "", "", "", "", "", "", "", "", "", "", `${o.max ?? ""}`, `${o.hr ?? ""}`, "", "", ""].join(",");
const START = Date.UTC(2026, 8, 26, 10, 56, 5) / 1000;
const CSV = [HEAD,
    row({ id: "15001", date: "Sep 26, 2026, 10:56:05 AM", name: "19 mile long run, MP finish", type: "Run", desc: 'Felt "great",\nfueled every 30', elapsed: 8856, moving: 8692, km: 30.614, hr: 146, max: 163, gain: 90, file: "activities/21491610379.fit.gz" }),
    row({ id: "9001", date: "Apr 20, 2026, 1:42:00 PM", name: "Boston Marathon", type: "Run", elapsed: 11350, moving: 11300, km: 42.3, hr: 158, max: 171, gain: 250, file: "activities/9900001.gpx" }),
    row({ id: "501", date: "Jan 3, 2019, 12:15:00 AM", name: "Treadmill", type: "Run", elapsed: 2400, moving: 2400, km: 8, hr: 140 }),
    row({ id: "502", date: "Jun 1, 2019, 3:00:00 PM", name: "Evening Ride", type: "Ride", elapsed: 3600, moving: 3500, km: 30 }),
    row({ id: "503", date: "Jun 2, 2019, 3:00:00 PM", name: "Lift", type: "Weight Training", elapsed: 2700, moving: 2700, km: 0 })
].join("\r\n");

test("csv: quoted commas, quotes and line breaks; a leading BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\n');
    assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"\nthere']]);
});

test("csv dates are read as UTC in Strava's formats", () => {
    assert.equal(csvDate("Sep 26, 2026, 10:56:05 AM"), START);
    assert.equal(csvDate("26 Sep 2026, 10:56:05"), START);
    assert.equal(csvDate("2026-09-26 10:56:05"), START);
    assert.equal(csvDate("Jan 3, 2019, 12:15:00 AM"), Date.UTC(2019, 0, 3, 0, 15) / 1000);
    assert.equal(csvDate("Apr 20, 2026, 1:42:00 PM"), Date.UTC(2026, 3, 20, 13, 42) / 1000);
    assert.equal(csvDate("yesterday"), null);
});

test("activities.csv: meters from the right Distance column, types, names", () => {
    const rows = readActivitiesCsv(CSV);
    assert.equal(rows.length, 5);
    assert.deepEqual(rows[0], { activityId: "15001", file: "activities/21491610379.fit.gz", name: "19 mile long run, MP finish", type: "run", csvSec: START, moving: 8692, elapsed: 8856, distance: 30614, avgHr: 146, maxHr: 163, ascent: 90 });
    assert.deepEqual(rows.map(r => r.type), ["run", "run", "run", "ride", "strength"]);
    // An older export with one Distance column in miles: speed x time decides the unit.
    const miles = readActivitiesCsv("Activity ID,Activity Date,Activity Type,Distance,Moving Time,Average Speed\n7,\"May 1, 2016, 11:00:00 AM\",Run,6.2,3000,3.3256");
    assert.equal(miles[0].distance, 9978);
    assert.throws(() => readActivitiesCsv("Name,When\nx,y"), /activities\.csv/);
});

test("zip: entries listed from the directory, stored and deflated both read", async () => {
    const zip = buildZip({ "export_1/activities.csv": "hello", "export_1/activities/1.fit.gz": new Uint8Array([1, 2, 3]) });
    const blob = new Blob([zip]);
    const entries = await listZip(blob);
    assert.deepEqual(entries.map(e => e.name), ["export_1/activities.csv", "export_1/activities/1.fit.gz"]);
    assert.equal(new TextDecoder().decode(await readZipEntry(blob, entries[0])), "hello");
    const deflated = new Blob([buildZip({ "a.txt": "x".repeat(5000) }, { deflate: zlib.deflateRawSync })]);
    const [e] = await listZip(deflated);
    assert.ok(e.compSize < 100);
    assert.equal(new TextDecoder().decode(await readZipEntry(deflated, e)), "x".repeat(5000));
    await assert.rejects(listZip(new Blob(["not a zip"])), /isn't a \.zip/);
});

test("the whole archive: the watch file for its run, the csv for the rest", async () => {
    const fit = zlib.gzipSync(steadyRun({ startSec: START, km: 30.614, secPerKm: 284, hr: 146 }));
    const zip = buildZip({ "activities.csv": CSV, "activities/21491610379.fit.gz": fit, "activities/9900001.gpx": "<gpx/>", "media/x.jpg": new Uint8Array(10) }, { deflate: zlib.deflateRawSync });
    const progress = [];
    const { activities, stats } = await readArchive([new File([zip], "export_123.zip")], { onProgress: p => progress.push(p) });
    assert.deepEqual(stats, { rows: 5, fitRead: 1, fromCsv: 4, unreadable: 0, skipped: 0, shiftSec: 0, notFit: 1 });
    assert.deepEqual(progress.at(-1), { done: 1, total: 1 });
    const long = activities.find(a => a.k === "f21491610379");
    assert.equal(long.src, "fit");
    assert.equal(long.n, "19 mile long run, MP finish");
    assert.equal(long.a, "15001");
    assert.equal(long.d, "2026-09-26");
    assert.equal(long.m, 30614);
    assert.equal(long.b.length, 5);
    assert.ok(long.b[3] > 0 && long.b[4] === null, "a half inside the 19-miler, no marathon");
    const boston = activities.find(a => a.n === "Boston Marathon");
    assert.deepEqual([boston.k, boston.src, boston.d, boston.m, boston.h], ["f9900001", "csv", "2026-04-20", 42300, 158]);
    // 12:15 am UTC on Jan 3 was the evening of Jan 2 in Chicago.
    assert.equal(activities.find(a => a.a === "501").d, "2019-01-02");
    assert.equal(activities.find(a => a.a === "502").y, "ride");
});

test("loose files work too, and a csv written in local time is corrected by the watch files", async () => {
    const local = CSV.replace("Sep 26, 2026, 10:56:05 AM", "Sep 26, 2026, 5:56:05 AM").replace("Jan 3, 2019, 12:15:00 AM", "Jan 2, 2019, 7:15:00 PM");
    const fit = zlib.gzipSync(steadyRun({ startSec: START, km: 10, secPerKm: 300 }));
    const bad = zlib.gzipSync(new Uint8Array([1, 2, 3]));
    const { activities, stats } = await readArchive([new File([local], "activities.csv"), new File([fit], "21491610379.fit.gz"), new File([bad], "5.fit.gz")]);
    assert.equal(stats.fitRead, 1);
    assert.equal(stats.unreadable, 1);
    assert.equal(stats.shiftSec, -5 * 3600);
    assert.equal(activities.find(a => a.a === "501").t, Date.UTC(2019, 0, 3, 0, 15) / 1000);
    assert.equal(csvShift([]), 0);
});

test("an activity has the same key from its file or its csv row", () => {
    assert.equal(activityKey({ file: "activities/21491610379.fit.gz" }), "f21491610379");
    assert.equal(activityKey({ file: "21491610379.fit.gz", activityId: "15001" }), "f21491610379");
    assert.equal(activityKey({ activityId: "15001" }), "a15001");
    assert.equal(activityKey({ startSec: 99 }), "t99");
});
