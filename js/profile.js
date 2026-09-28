/* ==========================================
   Southbound — My Profile (profile.html)

   The client's intake: who they are, how they train, their goals and
   what they want from a coach. Saved to clientRecords/{uid}
   (js/clientRecords.js); their linked coach sees it in the Client Hub.
   First time through, it's prefilled from their application so they
   never type the same thing twice.
========================================== */

import { listenForAuth } from "./auth.js";
import { getMyProfile } from "./userProfile.js";
import { getMyClientRecord } from "./clientRecords.js";
import { isIntakeComplete } from "./clientRecordSchema.js";
import { mountProfileForm } from "./clientProfileForm.js";
import { mountIntakeGuide } from "./intakeGuide.js";
import { recentWeeklyMiles, sportFromServices } from "./intakeFlow.js";

const $ = id => document.getElementById(id);

function showIntro(record) {
    const intro = $("profileIntro");
    intro.innerHTML = isIntakeComplete(record)
        ? `<strong>Thanks, your coach has this.</strong> Update it any time something changes: a new goal, a new schedule, a niggle.`
        : `<strong>About 3 minutes.</strong> The more your coach knows, the better your plan fits. Only the main goal is required, and only you and your coach can see any of this.`;
    intro.hidden = false;
}

const readJson = key => {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
};

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// About how many miles a week they've run lately, from what this device
// already has (their COROS history and Running Log, both cloud-synced).
function milesSuggestion() {
    const coros = readJson("coros-run-history");
    const log = readJson("running-log");
    return recentWeeklyMiles({
        corosRuns: Object.values(coros?.runs || {}),
        logEntries: Array.isArray(log?.entries) ? log.entries : []
    }, todayIso());
}

let started = false;

listenForAuth(async user => {
    if (!user || started) return;
    started = true;

    const [profile, record] = await Promise.all([
        getMyProfile().catch(() => null),
        getMyClientRecord().catch(error => {
            console.warn("Southbound: couldn't read your profile.", error);
            return null;
        })
    ]);

    const services = profile?.services?.length ? profile.services : (profile?.requestedServices || []);
    const prefill = {
        whoTrains: "self",
        preferredName: String(profile?.displayName || user.displayName || "").trim().split(/\s+/)[0] || "",
        primaryGoal: profile?.applicationMessage || "",
        primarySport: sportFromServices(services)
    };

    $("profileLoading").hidden = true;

    // The full form on one page (?edit=all, or "Edit everything" in the guide).
    const showFullForm = (current = record) => {
        $("profileGuide").hidden = true;
        $("profileSub").textContent = "Everything on one page. Save when you're done.";
        showIntro(current);
        $("profileForm").hidden = false;
        mountProfileForm($("profileForm"), {
            clientUid: user.uid,
            record: current,
            mode: "client",
            prefill,
            onSaved: saved => showIntro(saved)
        });
        $("profileBackToGuide").hidden = false;
    };

    if (new URLSearchParams(location.search).get("edit") === "all") {
        showFullForm();
        return;
    }

    $("profileGuide").hidden = false;
    mountIntakeGuide($("profileGuide"), {
        clientUid: user.uid,
        record,
        prefill,
        suggestion: milesSuggestion(),
        onFullForm: () => { location.href = "profile.html?edit=all"; }
    });
});
