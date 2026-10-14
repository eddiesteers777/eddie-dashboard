/* ==========================================
   Southbound — the athlete's fueling profile (pure)

   What an athlete tells the Fueling page once and keeps: body weight,
   what they take in now, gut tolerance, sweat, sodium, the products and
   schedule they like. Stored as the cloud-synced key "fueling-profile":

     { v: 1, fields: { <key>: { v: value, at: ms } } }

   One timestamp per field, so two phones that each change a different
   answer both keep theirs (mergeProfiles: newest per field), and an
   empty box never wipes a known answer (setProfileFields skips blanks;
   only clearProfileField removes one). Weights are stored in pounds and
   fluids in ounces, whatever the athlete reads them in.

   Kept apart from plans and drafts: a plan holds the numbers it was
   built with; the profile is what a new plan starts from.

     PROFILE_FIELDS                 every field: label, kind, check
     validateField(key, value)      -> { ok, value, problem }
     setProfileFields(p, values, now) -> { profile, saved: [keys], problems }
     clearProfileField(p, key, now)
     resetProfile()                 -> an empty profile
     mergeProfiles(a, b)            newest answer per field
     profileValue(p, key)           the stored value or undefined
     fieldStatus(p, key)            "measured" | "yours" | "estimate"
     sessionFromProfile(p)          the calculator's athlete inputs
     profileDiff(p, session)        fields where a plan differs
     lbToKg / kgToLb / weightIn / weightFromDisplay

   Unit-tested in tests/fuelProfile.test.mjs.
========================================== */

export const PROFILE_VERSION = 1;
export const PROFILE_KEY = "fueling-profile";

const LB_PER_KG = 2.20462;
export const lbToKg = lb => Math.round((Number(lb) / LB_PER_KG) * 10) / 10;
export const kgToLb = kg => Math.round(Number(kg) * LB_PER_KG * 10) / 10;
/** Pounds -> what the athlete reads ("lb" | "kg"). */
export const weightIn = (lb, unit) => (unit === "kg" ? lbToKg(lb) : Math.round(Number(lb) * 10) / 10);
/** What the athlete typed in their unit -> pounds. */
export const weightFromDisplay = (value, unit) => (unit === "kg" ? kgToLb(value) : Number(value));

const choice = list => value => (list.includes(value) ? { ok: true, value } : { ok: false, problem: "Pick one of the options." });
const number = (min, max, words) => value => {
    const n = Number(value);
    if (String(value ?? "").trim() === "" || !Number.isFinite(n)) return { ok: false, blank: String(value ?? "").trim() === "", problem: `Enter a number for ${words}.` };
    if (n < min || n > max) return { ok: false, problem: `${words[0].toUpperCase()}${words.slice(1)} should be between ${min} and ${max}.` };
    return { ok: true, value: Math.round(n * 10) / 10 };
};

export const FUEL_PREFERENCES = ["gels", "drinkmix", "chews", "bars", "homemade", "combination"];

/*
 * kind: "personal" = about the athlete (saved as they change it on the
 * calculator); "default" = a starting assumption for new plans (only set
 * on the Profile view); "pref" = how they like plans built.
 * measured: the field holds a measured number (a sweat test), not a guess.
 */
export const PROFILE_FIELDS = {
    weightUnit: { label: "Weight in", kind: "pref", check: choice(["lb", "kg"]) },
    bodyWeight: { label: "Body weight", kind: "personal", unit: "lb", check: number(60, 400, "body weight (lb)") },
    currentCarbIntake: { label: "Carbs you take in now", kind: "personal", unit: "g/hr", check: number(0, 120, "carbs you take in now (g/hr)") },
    tolerance: { label: "Fueling tolerance", kind: "personal", check: choice(["low", "moderate", "high"]) },
    stomachSensitivity: { label: "Stomach", kind: "personal", check: choice(["sensitive", "normal", "iron"]) },
    sweatRate: { label: "Sweat rate (your guess)", kind: "personal", check: choice(["low", "moderate", "high"]) },
    sweatRateMeasured: { label: "Sweat rate (measured)", kind: "personal", unit: "oz/hr", measured: true, check: number(4, 100, "measured sweat rate (oz/hr)") },
    sweatSodium: { label: "Salty sweat (your guess)", kind: "personal", check: choice(["unknown", "light", "average", "heavy"]) },
    sweatSodiumMeasured: { label: "Sweat sodium (measured)", kind: "personal", unit: "mg/L", measured: true, check: number(100, 3500, "measured sweat sodium (mg/L)") },
    typicalSodiumIntake: { label: "Sodium you take in now", kind: "personal", unit: "mg/hr", check: number(0, 2000, "sodium you take in now (mg/hr)") },
    fuelPreferences: {
        label: "What you like to use", kind: "pref",
        check: value => {
            const list = Array.isArray(value) ? value.filter(v => FUEL_PREFERENCES.includes(v)) : null;
            return list ? { ok: true, value: [...new Set(list)] } : { ok: false, problem: "Pick what you like to use." };
        }
    },
    caffeineWanted: { label: "Caffeine in plans", kind: "pref", check: value => ({ ok: true, value: value === true || value === "true" }) },
    firstGelMin: { label: "First gel at", kind: "pref", unit: "min", check: number(5, 90, "first gel time (minutes)") },
    temperature: { label: "Usual temperature", kind: "default", unit: "°F", check: number(-20, 120, "temperature (°F)") },
    humidity: { label: "Usual humidity", kind: "default", unit: "%", check: number(0, 100, "humidity (%)") },
    preferredItems: {
        label: "Products you like", kind: "pref",
        check: value => (Array.isArray(value) ? { ok: true, value: [...new Set(value.map(String))].slice(0, 60) } : { ok: false, problem: "Not a list." })
    },
    preferredRecipe: { label: "Your usual drink recipe", kind: "pref", check: value => ({ ok: true, value: String(value ?? "").slice(0, 80) }) }
};

/** What the calculator falls back to when the profile has nothing (the page's own defaults). */
export const ASSUMED = {
    bodyWeight: 165, tolerance: "moderate", stomachSensitivity: "normal", sweatRate: "moderate",
    sweatSodium: "unknown", temperature: 75, humidity: 55, fuelPreferences: ["gels"], caffeineWanted: false,
    firstGelMin: 30, weightUnit: "lb"
};

export function resetProfile() {
    return { v: PROFILE_VERSION, fields: {} };
}

/** Reads whatever was stored (a string, an object, junk) into a profile. */
export function readProfile(raw) {
    let data = raw;
    if (typeof raw === "string") { try { data = JSON.parse(raw); } catch { data = null; } }
    const out = resetProfile();
    const fields = data && typeof data === "object" ? data.fields : null;
    if (!fields || typeof fields !== "object") return out;
    for (const [key, entry] of Object.entries(fields)) {
        if (!PROFILE_FIELDS[key] || !entry || typeof entry !== "object" || !("v" in entry)) continue;
        if (entry.v == null) { out.fields[key] = { v: null, at: Number(entry.at) || 0, cleared: true }; continue; }
        const r = PROFILE_FIELDS[key].check(entry.v);
        if (r.ok) out.fields[key] = { v: r.value, at: Number(entry.at) || 0 };
    }
    return out;
}

export function validateField(key, value) {
    const def = PROFILE_FIELDS[key];
    if (!def) return { ok: false, problem: "Unknown field." };
    return def.check(value);
}

export const profileValue = (profile, key) => profile?.fields?.[key]?.v;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Saves the given answers. Blank answers are skipped (an empty box never
 * wipes a known value); answers that don't check out are skipped and
 * reported; an unchanged answer keeps its old time.
 */
export function setProfileFields(profile, values, now = Date.now()) {
    const out = readProfile(profile);
    const saved = [];
    const problems = {};
    for (const [key, raw] of Object.entries(values || {})) {
        if (!PROFILE_FIELDS[key]) continue;
        if (raw == null || (typeof raw === "string" && raw.trim() === "")) continue;
        const r = PROFILE_FIELDS[key].check(raw);
        if (!r.ok) { if (!r.blank) problems[key] = r.problem; continue; }
        if (same(out.fields[key]?.v, r.value)) continue;
        out.fields[key] = { v: r.value, at: now };
        saved.push(key);
    }
    return { profile: out, saved, problems };
}

/** Removes one answer on purpose (the Profile view's Clear). A cleared field is kept as a dated blank so another device's older answer doesn't come back. */
export function clearProfileField(profile, key, now = Date.now()) {
    const out = readProfile(profile);
    if (!PROFILE_FIELDS[key]) return out;
    out.fields[key] = { v: null, at: now, cleared: true };
    return out;
}

/** Newest answer per field (each device's time). Cleared fields stay cleared until a newer answer. */
export function mergeProfiles(a, b) {
    const pa = rawFields(a), pb = rawFields(b);
    const out = { v: PROFILE_VERSION, fields: {} };
    for (const key of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
        if (!PROFILE_FIELDS[key]) continue;
        const x = pa[key], y = pb[key];
        out.fields[key] = !x ? y : !y ? x : (Number(y.at) || 0) > (Number(x.at) || 0) ? y : x;
    }
    return out;
}
function rawFields(p) {
    let data = p;
    if (typeof p === "string") { try { data = JSON.parse(p); } catch { data = null; } }
    return data && typeof data.fields === "object" && data.fields ? data.fields : {};
}

/** "measured" (a sweat test), "yours" (the athlete said so), or "estimate" (nothing saved: the page's assumption). */
export function fieldStatus(profile, key) {
    const v = profileValue(profile, key);
    if (v == null) return "estimate";
    return PROFILE_FIELDS[key]?.measured ? "measured" : "yours";
}

export const STATUS_WORDS = { measured: "Measured", yours: "Your profile", estimate: "Estimate" };

// The calculator's inputs the profile can fill (session field -> profile key).
const SESSION_KEYS = ["bodyWeight", "currentCarbIntake", "tolerance", "stomachSensitivity", "sweatRate", "sweatRateMeasured",
    "sweatSodium", "sweatSodiumMeasured", "typicalSodiumIntake", "fuelPreferences", "caffeineWanted", "temperature", "humidity", "firstGelMin"];

/** The athlete inputs for a new plan: the profile's answers, else the page's assumptions (marked). */
export function sessionFromProfile(profile) {
    const values = {};
    const status = {};
    for (const key of SESSION_KEYS) {
        const v = profileValue(profile, key);
        if (v != null) { values[key] = v; status[key] = fieldStatus(profile, key); }
        else if (key in ASSUMED) { values[key] = ASSUMED[key]; status[key] = "estimate"; }
        else { values[key] = ""; status[key] = "estimate"; }
    }
    return { values, status };
}

/** Personal fields where a plan's own numbers differ from the profile (e.g. an old plan's body weight). */
export function profileDiff(profile, session = {}) {
    const out = [];
    for (const key of SESSION_KEYS) {
        if (PROFILE_FIELDS[key].kind !== "personal") continue;
        const mine = profileValue(profile, key);
        if (mine == null) continue;
        const theirs = session[key];
        if (theirs == null || theirs === "" || (typeof theirs === "number" && theirs === 0 && !mine)) continue;
        const a = typeof mine === "number" ? Number(theirs) : theirs;
        if (!same(a, mine)) out.push({ key, label: PROFILE_FIELDS[key].label, plan: theirs, profile: mine });
    }
    return out;
}

/** The personal answers a calculator session holds, ready for setProfileFields. */
export function profileFieldsFromSession(session = {}, keys = SESSION_KEYS) {
    const out = {};
    for (const key of keys) if (key in session) out[key] = session[key];
    return out;
}
