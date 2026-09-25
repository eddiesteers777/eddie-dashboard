/* ==========================================
   Southbound — Client profile schema (pure)

   The fields of clientRecords/{clientUid}: who the client is and how to
   coach them, entered once by the client (profile.html) and editable by
   their linked coach (Client Hub -> Profile). Name, email, services,
   status and start date are NOT here -- they already live on
   userProfiles / coachLinks and aren't duplicated.

   Nothing coach-private belongs in this document: the client can read
   all of it. Private coach notes are a separate, coach-only collection
   (coachNotes, js/clientNotes.js).

   firestore.rules (validClientRecord) enforces the same keys, types and
   sizes -- keep the two in step. Unit-tested in
   tests/clientRecordSchema.test.mjs.
========================================== */

export const DAYS = [
    { value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }, { value: "wed", label: "Wed" },
    { value: "thu", label: "Thu" }, { value: "fri", label: "Fri" }, { value: "sat", label: "Sat" },
    { value: "sun", label: "Sun" }
];

export const SPORTS = [
    { value: "running", label: "Running" },
    { value: "strength", label: "Strength training" },
    { value: "soccer", label: "Soccer" },
    { value: "general", label: "General fitness" },
    { value: "other", label: "Something else" }
];

export const STRENGTH_LEVELS = [
    { value: "none", label: "New to it" },
    { value: "some", label: "Some experience" },
    { value: "experienced", label: "Experienced" }
];

// Every field, in form order. `ask` is how the client's own form phrases
// it; `label` is the coach-side label. `when` shows a field only for one
// kind of account (training yourself vs. signing up your child).
export const SECTIONS = [
    {
        title: "About you",
        fields: [
            { key: "whoTrains", type: "choice", label: "Who's training", ask: "Who's training?", options: [
                { value: "self", label: "Me" },
                { value: "child", label: "My child (or someone I'm signing up)" }
            ] },
            { key: "preferredName", type: "text", max: 60, when: "self", label: "Goes by", ask: "What should your coach call you?" },
            { key: "athleteName", type: "text", max: 60, when: "child", label: "Athlete", ask: "Athlete's first name" },
            { key: "birthYear", type: "year", label: "Birth year", ask: "Birth year", askChild: "Athlete's birth year", hint: "Just the year -- it's for age groups and training zones." },
            { key: "phone", type: "tel", max: 30, label: "Phone", ask: "Best phone number for texts about sessions" }
        ]
    },
    {
        title: "Training",
        fields: [
            { key: "primarySport", type: "select", options: SPORTS, label: "Main sport", ask: "Main sport" },
            { key: "teamOrLevel", type: "text", max: 120, label: "Team / level", ask: "Team, level or position (if any)" },
            { key: "currentTraining", type: "textarea", max: 1000, label: "Training right now", ask: "What does a normal week of training look like right now?" },
            { key: "weeklyMileage", type: "miles", label: "Miles per week", ask: "Miles per week right now (runners)" },
            { key: "strengthExperience", type: "select", options: STRENGTH_LEVELS, label: "Strength experience", ask: "Strength training experience" },
            { key: "availabilityDays", type: "days", label: "Days available", ask: "Which days can you usually train?" },
            { key: "availabilityNotes", type: "text", max: 300, label: "Schedule notes", ask: "Best times, or anything about your schedule" }
        ]
    },
    {
        title: "Goals",
        fields: [
            { key: "primaryGoal", type: "textarea", max: 500, required: true, label: "Main goal", ask: "What's the main thing you want to achieve?" },
            { key: "secondaryGoals", type: "textarea", max: 500, label: "Other goals", ask: "Anything else you'd like to work on?" },
            { key: "targetEvent", type: "text", max: 120, label: "Aiming for", ask: "A race, tryout, season or event you're aiming for" },
            { key: "targetDate", type: "date", label: "Date", ask: "When is it?" }
        ]
    },
    {
        title: "Coaching",
        fields: [
            { key: "coachingWants", type: "textarea", max: 1000, label: "Wants from a coach", ask: "What do you want from a coach?" },
            { key: "workedBefore", type: "textarea", max: 1000, label: "What's worked", ask: "What has worked for you before?" },
            { key: "notWorked", type: "textarea", max: 1000, label: "What hasn't", ask: "What hasn't worked?" }
        ]
    },
    {
        title: "Anything I should know",
        fields: [
            { key: "injuries", type: "textarea", max: 1000, label: "Injuries / limits", ask: "Injuries, or anything that limits training (optional)", hint: "Only you and your coach can see this." }
        ]
    }
];

export const FIELDS = SECTIONS.flatMap(s => s.fields);
export const FIELD_KEYS = FIELDS.map(f => f.key);

// Stored alongside the fields (also listed in firestore.rules).
export const META_KEYS = ["clientUid", "intakeComplete", "intakeCompletedAt", "updatedAt", "updatedBy"];

const YEAR_MIN = 1920;

// Form values -> the stored field values: trims text, caps lengths,
// drops unknown keys and values outside the allowed choices, and blanks
// fields that don't apply to this kind of account. Returns only field
// keys (no meta).
export function sanitizeClientRecord(input = {}, { currentYear = new Date().getFullYear() } = {}) {
    const out = {};
    const whoTrains = input.whoTrains === "child" ? "child" : "self";

    for (const field of FIELDS) {
        const raw = input[field.key];
        let value;
        switch (field.type) {
            case "choice":
            case "select": {
                const allowed = field.options.map(o => o.value);
                value = allowed.includes(raw) ? raw : "";
                break;
            }
            case "year": {
                const n = Number.parseInt(raw, 10);
                value = Number.isInteger(n) && n >= YEAR_MIN && n <= currentYear ? n : null;
                break;
            }
            case "miles": {
                const n = Number(raw);
                value = raw === "" || raw == null || !Number.isFinite(n) || n < 0 ? null : Math.min(Math.round(n * 10) / 10, 500);
                break;
            }
            case "days": {
                const allowed = DAYS.map(d => d.value);
                const list = Array.isArray(raw) ? raw : [];
                value = allowed.filter(d => list.includes(d));
                break;
            }
            case "date":
                value = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
                break;
            default:
                value = typeof raw === "string" ? raw.trim().slice(0, field.max || 1000) : "";
        }
        if (field.when && field.when !== whoTrains) value = "";
        out[field.key] = value;
    }
    out.whoTrains = whoTrains;
    return out;
}

// "Filled in" means the essentials are there: a main goal and a sport.
export function isIntakeComplete(record) {
    return Boolean(record && String(record.primaryGoal || "").trim() && record.primarySport);
}

// The name to use for the person being coached.
export function athleteDisplayName(record, fallback = "") {
    if (!record) return fallback;
    if (record.whoTrains === "child" && record.athleteName) return record.athleteName;
    return record.preferredName || fallback;
}

// For showing a stored value back to a person.
export function displayValue(field, value) {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return "";
    switch (field.type) {
        case "choice":
        case "select":
            return field.options.find(o => o.value === value)?.label || "";
        case "days":
            return DAYS.filter(d => value.includes(d.value)).map(d => d.label).join(", ");
        case "miles":
            return `${value} mi`;
        case "date": {
            const [y, m, d] = value.split("-").map(Number);
            return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }
        default:
            return String(value);
    }
}
