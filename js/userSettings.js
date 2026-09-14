/* ==========================================
   EddieOS User Settings

   Single source of truth for user-editable goals/preferences —
   used by settings.html to edit them, and by the Dashboard and
   Marathon page to actually display them. Previously this data
   lived only in a Firestore doc that only settings.js itself ever
   read, so nothing else in the app could see it even though it
   was being saved correctly. Backed by localStorage instead, like
   every other piece of data in the app, so cloudSync.js's existing
   pull/push already keeps it synced across devices for free.
========================================== */

const KEY = "user-settings";

const DEFAULTS = {

    units: "Miles",
    weekStart: "Sunday",

    goalTime: "",
    weeklyMileage: 0,

    aiEnabled: true,
    weeklyInsights: true,
    dailyRecommendations: false

};

export function getUserSettings(){

    try {

        const raw = localStorage.getItem(KEY);

        const saved = raw ? JSON.parse(raw) : {};

        return { ...DEFAULTS, ...saved };

    } catch (error) {

        console.error("getUserSettings: could not read saved settings", error);

        return { ...DEFAULTS };

    }

}

export function saveUserSettings(partial){

    const merged = { ...getUserSettings(), ...partial };

    localStorage.setItem(KEY, JSON.stringify(merged));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});

    return merged;

}
