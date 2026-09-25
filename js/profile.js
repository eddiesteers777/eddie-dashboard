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

const $ = id => document.getElementById(id);

// requestedServices on the application -> a starting "main sport".
function sportFromServices(services = []) {
    if (services.includes("running")) return "running";
    if (services.some(s => s.startsWith("soccer"))) return "soccer";
    if (services.includes("strength")) return "strength";
    return "";
}

function showIntro(record) {
    const intro = $("profileIntro");
    intro.innerHTML = isIntakeComplete(record)
        ? `<strong>Thanks, your coach has this.</strong> Update it any time something changes: a new goal, a new schedule, a niggle.`
        : `<strong>About 3 minutes.</strong> The more your coach knows, the better your plan fits. Only the main goal is required, and only you and your coach can see any of this.`;
    intro.hidden = false;
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
        primaryGoal: profile?.applicationMessage || "",
        primarySport: sportFromServices(services)
    };

    $("profileLoading").hidden = true;
    showIntro(record);
    mountProfileForm($("profileForm"), {
        clientUid: user.uid,
        record,
        mode: "client",
        prefill,
        onSaved: saved => showIntro(saved)
    });
});
