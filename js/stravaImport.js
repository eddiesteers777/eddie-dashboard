/* ==========================================
   Southbound — the "Import from Strava" card on Analytics

   The person picks Strava's archive (.zip), the unzipped folder, or files
   (activities.csv, .fit / .fit.gz). js/stravaArchive.js reads them on the
   device, js/stravaHistory.js merges them into what's saved (importing
   again updates, never doubles), js/stravaStore.js saves it to their
   account, and the trends redraw (sb:strava-updated).
========================================== */

import { readArchive } from "./stravaArchive.js";
import { mergeActivities, combineRuns, stravaSummary } from "./stravaHistory.js";
import { loadStrava, saveStrava, clearStrava, STRAVA_EVENT } from "./stravaStore.js";
import { runsBetween, emptyHistory, HISTORY_KEY } from "./corosHistory.js";
import { toast, sbConfirm, friendlyError } from "./ui.js";

const $ = id => document.getElementById(id);
const monthYear = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const n = x => Number(x).toLocaleString();
const plural = (k, one, many) => `${n(k)} ${k === 1 ? one : many}`;
let busy = false;

function corosRuns() {
    try { return runsBetween(JSON.parse(localStorage.getItem(HISTORY_KEY) || "null") || emptyHistory(), "1970-01-01", "9999-12-31"); } catch { return []; }
}

function renderStatus() {
    const s = stravaSummary(loadStrava());
    $("stravaStatus").innerHTML = s.count
        ? `<strong>${plural(s.count, "Strava activity", "Strava activities")} saved</strong> (${plural(s.runs, "run", "runs")}), ${monthYear(s.from)} to ${monthYear(s.to)}.`
        : "No Strava history imported yet.";
    $("stravaRemoveBtn").hidden = !s.count;
}

function progress(done, total) {
    $("stravaProgress").hidden = false;
    $("stravaProgressBar").max = Math.max(1, total);
    $("stravaProgressBar").value = done;
    $("stravaProgressText").textContent = total ? `Reading watch files: ${n(done)} of ${n(total)}` : "Reading your archive…";
}

async function importFiles(files) {
    if (busy || !files?.length) return;
    busy = true;
    const result = $("stravaResult");
    result.hidden = true;
    result.classList.remove("is-error");
    for (const id of ["stravaZipBtn", "stravaFolderBtn", "stravaFilesBtn"]) $(id).disabled = true;
    progress(0, 0);
    try {
        const { activities, stats } = await readArchive([...files], { onProgress: ({ done, total }) => progress(done, total) });
        if (!activities.length) {
            result.textContent = stats.notFit
                ? "Those were .gpx / .tcx files. Choose activities.csv from the same Strava folder too (or the whole .zip): Southbound reads those activities from it."
                : "Nothing to import there. Choose Strava's .zip, the unzipped folder, activities.csv or .fit files.";
            result.classList.add("is-error");
            result.hidden = false;
            return;
        }
        const { store, added, updated } = mergeActivities(loadStrava(), activities);
        const imported = Object.fromEntries(activities.map(a => [a.k, store.acts[a.k]]));
        const { overlap } = combineRuns(corosRuns(), imported);
        const saved = await saveStrava(store);
        const runs = activities.filter(a => a.y === "run").length;
        const parts = [
            `Read ${plural(activities.length, "activity", "activities")} (${plural(runs, "run", "runs")}): ${n(added)} new${updated ? `, ${n(updated)} updated` : ""}.`,
            overlap ? `${plural(overlap, "run was", "runs were")} already here from COROS, so ${overlap === 1 ? "it's" : "they're"} counted once.` : "",
            stats.unreadable ? `${plural(stats.unreadable, "file", "files")} couldn't be read.` : "",
            saved ? "" : "Saved on this device; it goes to your account next time you're online."
        ];
        result.textContent = parts.filter(Boolean).join(" ");
        result.hidden = false;
        toast(added ? "Strava history imported" : "Strava history up to date");
    } catch (error) {
        result.textContent = /zip/i.test(error?.message || "") ? error.message : friendlyError(error, "read that archive");
        result.classList.add("is-error");
        result.hidden = false;
    } finally {
        busy = false;
        $("stravaProgress").hidden = true;
        for (const id of ["stravaZipBtn", "stravaFolderBtn", "stravaFilesBtn"]) $(id).disabled = false;
        renderStatus();
    }
}

function init() {
    if (!$("stravaImportPanel")) return;
    const pairs = [["stravaZipBtn", "stravaZipInput"], ["stravaFolderBtn", "stravaFolderInput"], ["stravaFilesBtn", "stravaFilesInput"]];
    for (const [btn, input] of pairs) {
        $(btn).addEventListener("click", () => $(input).click());
        $(input).addEventListener("change", async e => { await importFiles(e.target.files); e.target.value = ""; });
    }
    // Folders can be picked on a computer only.
    if (!("webkitdirectory" in $("stravaFolderInput")) || matchMedia("(pointer: coarse)").matches) $("stravaFolderBtn").hidden = true;
    $("stravaRemoveBtn").addEventListener("click", async () => {
        if (!(await sbConfirm("Your Strava activities come off the charts on every device. Your COROS runs stay. You can import the archive again any time.", { title: "Remove your Strava history?", confirmLabel: "Remove", danger: true }))) return;
        try { await clearStrava(); toast("Strava history removed"); }
        catch (error) { toast(friendlyError(error, "remove it"), { type: "error" }); }
        $("stravaResult").hidden = true;
        renderStatus();
    });
    window.addEventListener(STRAVA_EVENT, renderStatus);
    renderStatus();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
