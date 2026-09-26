/* ==========================================
   Southbound — Client directory (coach side)

   Loads everything the coach can already read about their linked
   clients, using the existing data modules -- nothing new is stored:
     coachLinks  (js/coachAccess.js listMyClients)
     userProfiles (js/userProfile.js getProfile)
     sharedPlans (js/coachAccess.js readSharedPlanDoc)
     checkins    (js/checkins.js listCheckinsForMyClients)
     bookingRequests (js/scheduling.js listRequestsForMyClients)
     coachingPlans / drafts (js/coachingPlans.js) -- plans the coach publishes
     clientRecords (js/clientRecords.js getClientRecord) -- the profile;
               `record` is null when not filled in, undefined when it
               couldn't be read (e.g. rules not published yet)
   js/clientSummary.js turns the result into what the pages show.
========================================== */

import { listMyClients, readSharedPlanDoc } from "./coachAccess.js";
import { getProfile } from "./userProfile.js";
import { listCheckinsForMyClients } from "./checkins.js";
import { listRequestsForMyClients } from "./scheduling.js";
import { getClientRecord } from "./clientRecords.js";
import { listPrivateNotes, listUpdatesForClient } from "./clientNotes.js";
import { listPlansForClient, listDraftsForClient, getVersion } from "./coachingPlans.js";
import { listResultsForClient } from "./workoutResults.js";
import { listChangeRequestsForCoach } from "./changeRequests.js";

// [] if results can't be read (rules not published yet, offline...).
const resultsFor = uid => listResultsForClient(uid).catch(error => {
    console.warn("Southbound: workout results unavailable.", error?.code || error);
    return [];
});

// Published plans for one client, each active one with its current
// version's plan attached (so the hub is right even before the client's
// app has pulled it). [] if they can't be read (rules not published).
async function publishedPlans(clientUid) {
    try {
        const headers = await listPlansForClient(clientUid);
        return Promise.all(headers.map(async h => {
            if (h.status !== "active") return h;
            const v = await getVersion(h.id, h.version).catch(() => null);
            return { ...h, plan: v?.plan || null };
        }));
    } catch (error) {
        console.warn("Southbound: coaching plans unavailable.", error?.code || error);
        return [];
    }
}

// undefined = couldn't read (rules not published yet, offline...).
const orUndefined = promise => promise.catch(error => {
    console.warn("Southbound: client notes unavailable.", error);
    return undefined;
});

// null = no profile yet; undefined = couldn't read it.
const readRecord = uid => getClientRecord(uid).catch(error => {
    console.warn("Southbound: client profile unavailable.", error);
    return undefined;
});

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
// Change requests need the Phase F rules; before they're published this
// quietly returns nothing.
const changesFor = (clientUid = null) => listChangeRequestsForCoach(clientUid).catch(error => {
    if (error?.code !== "permission-denied") console.warn("Southbound: change requests unavailable.", error);
    return [];
});

export async function loadClientDirectory() {
    const [links, checkins, requests, changes] = await Promise.all([
        listMyClients(),
        quiet(listCheckinsForMyClients()),
        quiet(listRequestsForMyClients()),
        changesFor()
    ]);
    const checkinsBy = groupByClient(checkins);
    const requestsBy = groupByClient(requests);
    const changesBy = groupByClient(changes);

    return Promise.all(links.map(async link => {
        const [profile, shared, record, coachingPlans, results] = await Promise.all([
            quiet(getProfile(link.clientUid)),
            quiet(readSharedPlanDoc(link.clientUid)),
            readRecord(link.clientUid),
            publishedPlans(link.clientUid),
            resultsFor(link.clientUid)
        ]);
        return {
            link,
            profile,
            shared,
            record,
            coachingPlans,
            results,
            checkins: checkinsBy.get(link.clientUid) || [],
            requests: requestsBy.get(link.clientUid) || [],
            changes: changesBy.get(link.clientUid) || []
        };
    }));
}

// One client by uid, or null if this coach isn't linked to them.
export async function loadClientRecord(clientUid) {
    const links = await listMyClients();
    const link = links.find(l => l.clientUid === clientUid);
    if (!link) return null;
    const [profile, shared, checkins, requests, record, privateNotes, updates, coachingPlans, planDrafts, results, changes] = await Promise.all([
        quiet(getProfile(clientUid)),
        quiet(readSharedPlanDoc(clientUid)),
        quiet(listCheckinsForMyClients()),
        quiet(listRequestsForMyClients()),
        readRecord(clientUid),
        orUndefined(listPrivateNotes(clientUid)),
        orUndefined(listUpdatesForClient(clientUid)),
        publishedPlans(clientUid),
        listDraftsForClient(clientUid).catch(() => []),
        resultsFor(clientUid),
        changesFor(clientUid)
    ]);
    return {
        link,
        profile,
        shared,
        record,
        privateNotes,
        updates,
        coachingPlans,
        planDrafts,
        results,
        changes,
        checkins: (checkins || []).filter(c => c.clientUid === clientUid),
        requests: (requests || []).filter(r => r.clientUid === clientUid)
    };
}
