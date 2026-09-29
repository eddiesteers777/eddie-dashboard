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

// ---- Closed-ended answers (profile step 2, 2026-09-29) ----

export const EVENT_TYPES = [
    { value: "5k", label: "5K" }, { value: "10k", label: "10K" },
    { value: "half", label: "Half marathon" }, { value: "marathon", label: "Marathon" },
    { value: "ultra", label: "Ultra" }, { value: "trail", label: "Trail race" },
    { value: "triathlon", label: "Triathlon" }, { value: "tryout", label: "Tryout" },
    { value: "season", label: "A season" }, { value: "tournament", label: "Tournament" },
    { value: "other", label: "Something else" }
];

export const YEARS = [
    { value: "new", label: "Just starting" }, { value: "lt1", label: "Under a year" },
    { value: "1-3", label: "1–3 years" }, { value: "3-5", label: "3–5 years" },
    { value: "5-10", label: "5–10 years" }, { value: "10+", label: "10+ years" }
];

// How long they can run without stopping (the generator's run/walk start).
export const RUN_START = [
    { value: "running", label: "30 minutes or more" },
    { value: "run20", label: "About 20 minutes" },
    { value: "run10", label: "10–15 minutes" },
    { value: "run5", label: "About 5 minutes" },
    { value: "run1", label: "About a minute" },
    { value: "walk", label: "I walk, not run yet" }
];

export const TRAIN_WHERE = [
    { value: "gym", label: "A gym" }, { value: "home", label: "At home" },
    { value: "outside", label: "Outside / roads" }, { value: "trails", label: "Trails" },
    { value: "track", label: "A track" }, { value: "field", label: "A field" }
];

export const EQUIPMENT = [
    { value: "bodyweight", label: "Just my body" }, { value: "bands", label: "Bands" },
    { value: "dumbbells", label: "Dumbbells" }, { value: "kettlebells", label: "Kettlebells" },
    { value: "barbell", label: "Barbell and rack" }, { value: "machines", label: "Gym machines" },
    { value: "treadmill", label: "Treadmill" }
];

export const TIME_OF_DAY = [
    { value: "early", label: "Early (before 7)" }, { value: "morning", label: "Morning" },
    { value: "midday", label: "Midday" }, { value: "afternoon", label: "After school / work" },
    { value: "evening", label: "Evening" }
];

export const SESSION_LENGTH = [
    { value: "20", label: "20 min" }, { value: "30", label: "30 min" }, { value: "45", label: "45 min" },
    { value: "60", label: "An hour" }, { value: "90", label: "90 min+" }
];

export const SOCCER_POSITIONS = [
    { value: "gk", label: "Goalkeeper" }, { value: "defender", label: "Defender" },
    { value: "midfield", label: "Midfield" }, { value: "forward", label: "Forward" },
    { value: "anywhere", label: "Anywhere / not sure" }
];

export const SOCCER_LEVELS = [
    { value: "rec", label: "Rec" }, { value: "school", label: "School team" },
    { value: "club", label: "Club" }, { value: "travel", label: "Travel / competitive" },
    { value: "academy", label: "Academy / ECNL / MLS Next" }, { value: "college", label: "College" },
    { value: "adult", label: "Adult league" }
];

export const FEET = [
    { value: "right", label: "Right" }, { value: "left", label: "Left" }, { value: "both", label: "Both" }
];

export const FEEDBACK_STYLES = [
    { value: "direct", label: "Straight to the point" },
    { value: "encouraging", label: "Encouraging" },
    { value: "detailed", label: "Detail and numbers" },
    { value: "mix", label: "A mix" }
];

export const OBSTACLES = [
    { value: "time", label: "Finding time" }, { value: "motivation", label: "Motivation" },
    { value: "consistency", label: "Staying consistent" }, { value: "injury", label: "Staying healthy" },
    { value: "knowhow", label: "Knowing what to do" }, { value: "energy", label: "Energy / sleep" },
    { value: "other", label: "Something else" }
];

export const BODY_AREAS = [
    { value: "neck", label: "Neck" }, { value: "shoulder", label: "Shoulder" }, { value: "back", label: "Back" },
    { value: "hip", label: "Hip" }, { value: "hamstring", label: "Hamstring" }, { value: "quad", label: "Quad" },
    { value: "knee", label: "Knee" }, { value: "shin", label: "Shin" }, { value: "calf", label: "Calf / Achilles" },
    { value: "ankle", label: "Ankle" }, { value: "foot", label: "Foot" }, { value: "other", label: "Somewhere else" }
];

export const INJURY_STATUS = [
    { value: "now", label: "Hurts now" },
    { value: "recovering", label: "Getting better" },
    { value: "past", label: "Healed — keep an eye on it" }
];

// A short readiness screen, based on the PAR-Q+ general questions. A "yes"
// doesn't stop anyone training; it tells the coach to check first.
export const HEALTH_QUESTIONS = [
    { value: "heart", label: "Heart condition or high blood pressure", ask: "Has a doctor ever said you have a heart condition or high blood pressure?", askChild: "Has a doctor ever said they have a heart condition or high blood pressure?" },
    { value: "chest", label: "Chest pain", ask: "Do you get chest pain at rest, in daily life, or when you exercise?", askChild: "Do they get chest pain at rest, in daily life, or when they exercise?" },
    { value: "dizzy", label: "Dizziness or fainting", ask: "In the last year, have you lost your balance from dizziness or passed out?", askChild: "In the last year, have they lost their balance from dizziness or passed out?" },
    { value: "chronic", label: "Another long-term condition", ask: "Have you been diagnosed with another long-term condition (like asthma, diabetes or epilepsy)?", askChild: "Have they been diagnosed with another long-term condition (like asthma, diabetes or epilepsy)?" },
    { value: "meds", label: "Medicine for a long-term condition", ask: "Do you take prescribed medicine for a long-term condition?", askChild: "Do they take prescribed medicine for a long-term condition?" },
    { value: "joints", label: "Bone, joint or muscle problem", ask: "Do you have a bone, joint or muscle problem that more activity could make worse?", askChild: "Do they have a bone, joint or muscle problem that more activity could make worse?" },
    { value: "supervised", label: "Told to exercise only with medical supervision", ask: "Has a doctor said you should only exercise with medical supervision?", askChild: "Has a doctor said they should only exercise with medical supervision?" }
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
            { key: "birthYear", type: "year", label: "Birth year", ask: "Birth year", askChild: "Athlete's birth year", hint: "Just the year — it's for age groups and training zones." },
            { key: "phone", type: "tel", max: 30, label: "Phone", ask: "Best phone number for texts about sessions" }
        ]
    },
    {
        title: "Contacts",
        fields: [
            { key: "emergencyName", type: "text", max: 80, label: "Emergency contact", ask: "Emergency contact's name" },
            { key: "emergencyPhone", type: "tel", max: 30, label: "Emergency phone", ask: "Their phone number" },
            { key: "emergencyRelation", type: "text", max: 40, label: "Relationship", ask: "How are they related to you?", askChild: "How are they related to the athlete?" },
            { key: "guardianName", type: "text", max: 80, when: "self", label: "Parent / guardian", ask: "Parent or guardian's name (if you're under 18)" },
            { key: "guardianPhone", type: "tel", max: 30, when: "self", label: "Parent / guardian phone", ask: "Parent or guardian's phone (if you're under 18)" }
        ]
    },
    {
        title: "Training",
        fields: [
            { key: "primarySport", type: "select", options: SPORTS, label: "Main sport", ask: "Main sport" },
            { key: "teamOrLevel", type: "text", max: 120, label: "Team / level", ask: "Team, level or position (if any)" },
            { key: "currentTraining", type: "textarea", max: 1000, label: "Training right now", ask: "What does a normal week of training look like right now?" },
            { key: "weeklyMileage", type: "miles", label: "Miles per week", ask: "Miles per week right now (runners)" },
            { key: "runsPerWeek", type: "count", max: 7, label: "Runs per week", ask: "Runs in a normal week (runners)" },
            { key: "longestRun", type: "miles", cap: 100, label: "Longest recent run", ask: "Longest run in the last month, in miles (runners)" },
            { key: "yearsRunning", type: "select", options: YEARS, label: "Running for", ask: "How long have you been running?" },
            { key: "runStart", type: "select", options: RUN_START, label: "Runs non-stop for", ask: "How long can you run without stopping?" },
            { key: "strengthExperience", type: "select", options: STRENGTH_LEVELS, label: "Strength experience", ask: "Strength training experience" },
            { key: "availabilityDays", type: "days", label: "Days available", ask: "Which days can you usually train?" },
            { key: "availabilityNotes", type: "text", max: 300, label: "Schedule notes", ask: "Best times, or anything about your schedule" },
            { key: "timeOfDay", type: "multi", options: TIME_OF_DAY, label: "Best time of day", ask: "Best time of day to train" },
            { key: "sessionLength", type: "select", options: SESSION_LENGTH, label: "Time per session", ask: "How long can a normal session be?" },
            { key: "trainWhere", type: "multi", options: TRAIN_WHERE, label: "Trains at", ask: "Where do you usually train?" },
            { key: "equipment", type: "multi", options: EQUIPMENT, label: "Equipment", ask: "What equipment can you use?" }
        ]
    },
    {
        title: "Soccer",
        fields: [
            { key: "soccerPosition", type: "select", options: SOCCER_POSITIONS, label: "Position", ask: "Position (soccer players)" },
            { key: "soccerLevel", type: "select", options: SOCCER_LEVELS, label: "Level", ask: "What level do you play?" , askChild: "What level do they play?" },
            { key: "strongFoot", type: "select", options: FEET, label: "Stronger foot", ask: "Stronger foot" },
            { key: "yearsPlaying", type: "select", options: YEARS, label: "Playing for", ask: "How long have you played?", askChild: "How long have they played?" }
        ]
    },
    {
        title: "Goals",
        fields: [
            { key: "primaryGoal", type: "textarea", max: 500, required: true, label: "Main goal", ask: "What's the main thing you want to achieve?" },
            { key: "secondaryGoals", type: "textarea", max: 500, label: "Other goals", ask: "Anything else you'd like to work on?" },
            { key: "eventType", type: "select", options: EVENT_TYPES, label: "Event type", ask: "What kind of event is it?" },
            { key: "targetEvent", type: "text", max: 120, label: "Aiming for", ask: "A race, tryout, season or event you're aiming for" },
            { key: "targetDate", type: "date", label: "Date", ask: "When is it?" }
        ]
    },
    {
        title: "Coaching",
        fields: [
            { key: "coachingWants", type: "textarea", max: 1000, label: "Wants from a coach", ask: "What do you want from a coach?" },
            { key: "workedBefore", type: "textarea", max: 1000, label: "What's worked", ask: "What has worked for you before?" },
            { key: "notWorked", type: "textarea", max: 1000, label: "What hasn't", ask: "What hasn't worked?" },
            { key: "feedbackStyle", type: "select", options: FEEDBACK_STYLES, label: "Feedback style", ask: "How do you like feedback?" },
            { key: "obstacle", type: "select", options: OBSTACLES, label: "Biggest obstacle", ask: "What usually gets in the way?" }
        ]
    },
    {
        title: "Anything I should know",
        fields: [
            { key: "injuries", type: "textarea", max: 1000, label: "Injuries / limits", ask: "Injuries, or anything that limits training (optional)", hint: "Only you and your coach can see this." },
            { key: "injuryAreas", type: "multi", options: BODY_AREAS, label: "Where", ask: "Where is it?" },
            { key: "injuryStatus", type: "select", options: INJURY_STATUS, label: "How it is now", ask: "How is it now?" }
        ]
    },
    {
        title: "Health check",
        fields: [
            { key: "healthFlags", type: "health", options: HEALTH_QUESTIONS, label: "Health check", ask: "Health check (tick any that are true)", hint: "Only you and your coach can see this. A yes doesn't stop you training; it means check with your doctor first." },
            { key: "healthNote", type: "textarea", max: 500, label: "Health notes", ask: "Anything your coach should know about that?" }
        ]
    }
];

export const FIELDS = SECTIONS.flatMap(s => s.fields);
export const FIELD_KEYS = FIELDS.map(f => f.key);

// Stored alongside the fields (also listed in firestore.rules).
export const META_KEYS = ["clientUid", "intakeComplete", "intakeCompletedAt", "updatedAt", "updatedBy", "confirmedAt", "askedAt", "healthCheckedAt"];

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
                value = raw === "" || raw == null || !Number.isFinite(n) || n < 0 ? null : Math.min(Math.round(n * 10) / 10, field.cap || 500);
                break;
            }
            case "count": {
                const n = Number.parseInt(raw, 10);
                value = raw === "" || raw == null || !Number.isInteger(n) || n < 0 ? null : Math.min(n, field.max);
                break;
            }
            case "multi":
            case "health": {
                const list = Array.isArray(raw) ? raw : [];
                value = field.options.map(o => o.value).filter(v => list.includes(v));
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

// The health-check questions they said yes to, as short labels ([] when
// none or not answered).
export function healthYeses(record) {
    if (!record || !(Number(record.healthCheckedAt) > 0)) return [];
    return HEALTH_QUESTIONS.filter(q => (record.healthFlags || []).includes(q.value)).map(q => q.label);
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
        case "multi":
        case "health":
            return field.options.filter(o => value.includes(o.value)).map(o => o.label).join(", ");
        case "count":
            return `${value} a week`;
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
