/* ==========================================
   Southbound — Client directory (coach side)

   Loads everything the coach can already read about their linked
   clients, using the existing data modules -- nothing new is stored:
     coachLinks  (js/coachAccess.js listMyClients)
     userProfiles (js/userProfile.js getProfile)
     sharedPlans (js/coachAccess.js readSharedPlanDoc)
     checkins    (js/checkins.js listCheckinsForMyClients)
     bookingRequests (js/scheduling.js listRequestsForMyClients)
   js/clientSummary.js turns the result into what the pages show.
========================================== */

import { listMyClients, readSharedPlanDoc } from "./coachAccess.js";
import { getProfile } from "./userProfile.js";
import { listCheckinsForMyClients } from "./checkins.js";
import { listRequestsForMyClients } from "./scheduling.js";

const quiet = promise => promise.catch(error => {
    console.warn("Southbound: client data partly unavailable.", error);
    return null;
});

function groupByClient(items) {
    const map = new Map();
    for (const item of items || []) {
        if (!map.has(item.clientUid)) map.set(item.clientUid, []);
        map.get(item.clientUid).push(item);
    }
    return map;
}

// Every linked client, each as { link, profile, shared, checkins, requests }.
export async function loadClientDirectory() {
    const [links, checkins, requests] = await Promise.all([
        listMyClients(),
        quiet(listCheckinsForMyClients()),
        quiet(listRequestsForMyClients())
    ]);
    const checkinsBy = groupByClient(checkins);
    const requestsBy = groupByClient(requests);

    return Promise.all(links.map(async link => {
        const [profile, shared] = await Promise.all([
            quiet(getProfile(link.clientUid)),
            quiet(readSharedPlanDoc(link.clientUid))
        ]);
        return {
            link,
            profile,
            shared,
            checkins: checkinsBy.get(link.clientUid) || [],
            requests: requestsBy.get(link.clientUid) || []
        };
    }));
}

// One client by uid, or null if this coach isn't linked to them.
export async function loadClientRecord(clientUid) {
    const links = await listMyClients();
    const link = links.find(l => l.clientUid === clientUid);
    if (!link) return null;
    const [profile, shared, checkins, requests] = await Promise.all([
        quiet(getProfile(clientUid)),
        quiet(readSharedPlanDoc(clientUid)),
        quiet(listCheckinsForMyClients()),
        quiet(listRequestsForMyClients())
    ]);
    return {
        link,
        profile,
        shared,
        checkins: (checkins || []).filter(c => c.clientUid === clientUid),
        requests: (requests || []).filter(r => r.clientUid === clientUid)
    };
}
