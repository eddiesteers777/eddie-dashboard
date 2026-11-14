/* ==========================================
   Southbound — send a saved route to COROS

   Uses COROS's own `uploadRouteFile` tool through the app's existing
   COROS connection (js/corosClient.js). The route lands in the COROS
   app's Routes list within a few minutes, then syncs to the watch.
   "Sent" means COROS accepted the file, not that it is on the watch.
   COROS refuses the same file twice until the old route is deleted in
   its app, and that refusal is passed on in plain words.
   Never tested against a real account when this was written.
========================================== */

import { buildGpx, gpxFileName } from "./routeGpx.js";

export const ON_FOOT = 2; // COROS route types: 1 = cycling, 2 = on foot (shown as running)

/** The exact arguments for `uploadRouteFile`, built from a saved route record. */
export function routeUploadArgs(rec) {
    const name = String(rec.name || "Southbound route").slice(0, 95);
    const gpx = buildGpx({ name, coords: rec.line, miles: rec.miles });
    return { fileName: gpxFileName(name), fileContent: gpx.text, routeName: name, routeType: ON_FOOT };
}

function resultText(result) {
    const parts = Array.isArray(result?.content) ? result.content : [];
    return parts.map(c => c?.text || "").join(" ").trim();
}

/** Sends one route. Throws an Error with a plain message when COROS says no. Returns the sent time on success. */
export async function sendRouteToCoros(rec, callTool, now = Date.now()) {
    if (!rec || !Array.isArray(rec.line) || rec.line.length < 2) throw new Error("This route has no line to send.");
    const result = await callTool("uploadRouteFile", routeUploadArgs(rec));
    if (result?.isError) {
        const text = resultText(result);
        if (/already|exist|duplicate|process/i.test(text)) throw new Error("COROS already has this route, or is still processing it. Delete the old copy in the COROS app to send it again.");
        throw new Error(text || "COROS did not accept the route.");
    }
    return now;
}

export const sentLabel = rec => (rec && rec.corosSentAt ? "Sent to COROS" : "Not sent");
