/* ==========================================
   Southbound habit icons: the list

   Pure (no DOM), shared by the Habits page, the
   75-Day page, the icon picker and the drawing
   script (scripts/build-habit-icons.mjs, which
   fails if an ID here has no drawing or the
   other way round). Each icon is habit-icons/<id>.svg.

   A habit stores its icon as "hb:<id>". Habits
   saved before these icons existed carry a line
   icon name ("droplet", "bookOpen"...) or none;
   they get a drawn icon from their name, then
   from the old icon, so nobody has to redo them.
========================================== */

export const HABIT_ICON_CATEGORIES = ["Faith & mind", "Training", "Food & drink", "Recovery", "Life"];

// keywords: a word in the habit name that suggests the icon. A word
// matches whole or with an ending ("run" -> "runs", "running"; "lift" ->
// "lifting"); a "*" at the end matches any word starting with it
// ("meditat*" -> "meditating"); phrases with a space match as written.
// A "~" marks a weak word that only helps when nothing better fits.
export const HABIT_ICONS = [
    // ---- Faith & mind ----
    { id: "pray", label: "Prayer", category: "Faith & mind", keywords: ["pray", "prayer", "devotion", "devotional", "faith", "church", "worship", "quiet time"] },
    { id: "bible", label: "Bible", category: "Faith & mind", keywords: ["bible", "scripture", "verse", "psalm", "gospel"] },
    { id: "read", label: "Read", category: "Faith & mind", keywords: ["read", "book", "pages", "page", "chapter", "audiobook", "kindle"] },
    { id: "journal", label: "Journal", category: "Faith & mind", keywords: ["journal", "diary", "write", "writing", "reflect"] },
    { id: "meditate", label: "Meditate", category: "Faith & mind", keywords: ["meditat*", "mindful", "calm", "headspace", "stillness"] },
    { id: "gratitude", label: "Gratitude", category: "Faith & mind", keywords: ["gratitude", "grateful", "thankful", "thanks", "kindness", "kind"] },
    { id: "study", label: "Study", category: "Faith & mind", keywords: ["study", "learn", "class", "homework", "school", "course", "lesson", "spanish", "language"] },

    // ---- Training ----
    { id: "run", label: "Run", category: "Training", keywords: ["run", "running", "jog", "mile", "miles", "cardio", "race", "marathon", "5k", "10k", "~training"] },
    { id: "workout", label: "Workout", category: "Training", keywords: ["workout", "exercise", "gym", "hiit", "fitness", "sweat", "crossfit", "move", "~active"] },
    { id: "strength", label: "Strength", category: "Training", keywords: ["strength", "lift", "lifting", "weights", "squat", "deadlift", "bench", "push-up", "pushup", "pull-up", "pullup", "dumbbell"] },
    { id: "stretch", label: "Stretch", category: "Training", keywords: ["stretch", "mobility", "yoga", "foam roll", "flexib*", "pilates"] },
    { id: "steps", label: "Steps", category: "Training", keywords: ["step", "steps", "walk", "hike", "10,000", "10000", "10k steps", "10000 steps"] },
    { id: "bike", label: "Bike", category: "Training", keywords: ["bike", "cycl*", "ride", "spin", "peloton"] },
    { id: "swim", label: "Swim", category: "Training", keywords: ["swim", "pool", "laps"] },
    { id: "core", label: "Core", category: "Training", keywords: ["core", "abs", "plank", "sit-up", "situp", "crunch"] },
    { id: "ball", label: "Soccer", category: "Training", keywords: ["soccer", "ball", "touches", "juggl*", "dribbl*", "footwork", "futbol", "football", "shooting"] },

    // ---- Food & drink ----
    { id: "protein", label: "Protein", category: "Food & drink", keywords: ["protein", "meat", "chicken", "eggs", "shake"] },
    { id: "water", label: "Water", category: "Food & drink", keywords: ["water", "hydrat*", "oz", "ounce", "ounces", "bottle", "gallon", "liter", "litre", "~drink"] },
    { id: "veggies", label: "Veggies", category: "Food & drink", keywords: ["veg", "veggie", "veggies", "vegetable", "greens", "salad", "plants"] },
    { id: "fruit", label: "Fruit", category: "Food & drink", keywords: ["fruit", "apple", "berries", "banana"] },
    { id: "meals", label: "Meals", category: "Food & drink", keywords: ["meal", "meals", "eat", "eating", "food", "calorie", "macro", "nutrition", "diet", "breakfast", "lunch", "dinner", "track food"] },
    { id: "mealprep", label: "Meal prep", category: "Food & drink", keywords: ["meal prep", "prep", "cook", "cooking", "recipe", "groceries"] },
    { id: "nosugar", label: "No sugar", category: "Food & drink", keywords: ["sugar", "sweets", "candy", "dessert", "soda", "junk", "fast food"] },
    { id: "noalcohol", label: "No alcohol", category: "Food & drink", keywords: ["alcohol", "beer", "wine", "sober", "booze", "liquor", "no drinking"] },
    { id: "coffee", label: "Coffee", category: "Food & drink", keywords: ["coffee", "caffeine", "tea", "espresso"] },
    { id: "vitamins", label: "Vitamins", category: "Food & drink", keywords: ["vitamin*", "supplement*", "creatine", "pill", "medicine", "meds", "fish oil", "magnesium"] },
    { id: "fasting", label: "Fasting", category: "Food & drink", keywords: ["fast", "fasting", "intermittent*", "16:8"] },

    // ---- Recovery ----
    { id: "sleep", label: "Sleep", category: "Recovery", keywords: ["sleep", "bed", "bedtime", "nap", "~rest", "~hrs", "~hours"] },
    { id: "cold", label: "Cold plunge", category: "Recovery", keywords: ["cold", "ice", "plunge", "ice bath"] },
    { id: "sauna", label: "Sauna", category: "Recovery", keywords: ["sauna", "hot tub", "steam", "heat"] },
    { id: "sun", label: "Sunlight", category: "Recovery", keywords: ["sun", "sunlight", "sunshine", "morning light", "daylight"] },
    { id: "screens", label: "Less screen", category: "Recovery", keywords: ["screen", "screens", "phone", "social media", "instagram", "tiktok", "scroll", "tv", "netflix", "video games"] },
    { id: "breathe", label: "Breathe", category: "Recovery", keywords: ["breath", "breathe", "breathing", "breathwork"] },

    // ---- Life ----
    { id: "love", label: "Love", category: "Life", keywords: ["wife", "husband", "spouse", "partner", "girlfriend", "boyfriend", "date night", "marriage", "love"] },
    { id: "family", label: "Family", category: "Life", keywords: ["family", "kids", "son", "daughter", "parents", "mom", "dad", "children"] },
    { id: "friends", label: "Friends", category: "Life", keywords: ["friend", "friends", "~call", "~text", "~connect", "community", "team"] },
    { id: "tidy", label: "Tidy up", category: "Life", keywords: ["clean", "tidy", "chores", "laundry", "dishes", "make bed", "declutter", "house"] },
    { id: "money", label: "Money", category: "Life", keywords: ["money", "budget", "save", "saving", "finance", "spend", "invest", "no spend"] },
    { id: "work", label: "Work", category: "Life", keywords: ["work", "email", "inbox", "deep work", "business", "job", "project", "office"] },
    { id: "music", label: "Music", category: "Life", keywords: ["music", "guitar", "piano", "instrument", "sing", "practice"] },
    { id: "nature", label: "Outside", category: "Life", keywords: ["outside", "outdoor", "outdoors", "nature", "garden", "fresh air", "park"] },
    { id: "dog", label: "Pet", category: "Life", keywords: ["dog", "pet", "puppy", "cat"] },
    { id: "weigh", label: "Weigh in", category: "Life", keywords: ["weigh", "weight in", "scale", "body weight", "~weight"] },
    { id: "teeth", label: "Teeth", category: "Life", keywords: ["floss", "teeth", "brush", "dentist", "skincare", "skin care"] },
    { id: "goal", label: "Goal", category: "Life", keywords: ["~goal", "~target", "~focus", "~plan"] },
    { id: "star", label: "Star", category: "Life", keywords: [] },
    { id: "check", label: "Check", category: "Life", keywords: ["~complete", "~done", "~daily", "~habit"] }
];

const BY_ID = new Map(HABIT_ICONS.map(i => [i.id, i]));
export const DEFAULT_HABIT_ICON = "star";

export function habitIconById(id) {
    return BY_ID.get(id) || null;
}

export function habitIconSrc(id) {
    return `habit-icons/${BY_ID.has(id) ? id : DEFAULT_HABIT_ICON}.svg`;
}

// "Drink 100oz" -> "drink 100 oz"; "Stretch / Mobility" -> "stretch mobility".
function normalize(text) {
    return ` ${String(text ?? "").toLowerCase()
        .replace(/(\d)([a-z])/g, "$1 $2")
        .replace(/([a-z])(\d)/g, "$1 $2")
        .replace(/[^a-z0-9:,+*'-]+/g, " ")
        .replace(/'/g, "")
        .trim()} `;
}

const ENDINGS = ["s", "es", "ing", "ed", "er", "ers"];

function wordMatches(k, word) {
    if (k.endsWith("*")) return word.startsWith(k.slice(0, -1));
    if (word === k) return true;
    if (!word.startsWith(k)) return false;
    const rest = word.slice(k.length);
    // "running", "swimming": the last letter doubled before the ending.
    return ENDINGS.includes(rest) || (rest[0] === k.at(-1) && ENDINGS.includes(rest.slice(1)));
}

function keywordScore(keyword, text, words) {
    const weak = keyword.startsWith("~");
    const k = normalize(weak ? keyword.slice(1) : keyword).trim();
    let base = 0;
    if (k.includes(" ")) {
        if (text.includes(` ${k} `) || text.includes(` ${k}`)) base = 4;
    } else if (words.includes(k.replace(/\*$/, ""))) {
        base = 3;
    } else if (words.some(w => wordMatches(k, w))) {
        base = k.endsWith("*") ? 2.5 : 3;
    }
    if (!base) return 0;
    // Longer, more specific words win ties ("Read the Bible" is the Bible).
    return (weak ? base - 2.5 : base) + Math.min(k.length, 12) / 20;
}

// The icons a habit name suggests, best first (at most n).
export function suggestIcons(name, n = 4) {
    const text = normalize(name);
    const words = text.trim().split(" ").flatMap(w => [w, ...w.split(/[-,:+]/)]).filter(Boolean);
    if (!words.length) return [];
    const scored = [];
    HABIT_ICONS.forEach((icon, order) => {
        const score = Math.max(0, ...icon.keywords.map(k => keywordScore(k, text, words)));
        if (score > 0) scored.push({ id: icon.id, score, order });
    });
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    return scored.slice(0, n).map(s => s.id);
}

// The old line icons a habit may still carry, and the drawing that fits.
const LEGACY = {
    pray: "pray", bookOpen: "read", book: "read", stretch: "stretch", dumbbell: "strength",
    activity: "run", run: "run", drumstick: "protein", droplet: "water", moon: "sleep",
    heart: "love", apple: "meals", footprint: "steps", checkCircle: "check", star: "star",
    flame: "workout", sun: "sun", coffee: "coffee", users: "family"
};

// The drawn icon a habit shows: the one picked for it, else what its name
// suggests, else the drawing that matches its old line icon, else a star.
export function habitIconId(habit) {
    const stored = String(habit?.icon ?? "");
    if (stored.startsWith("hb:") && BY_ID.has(stored.slice(3))) return stored.slice(3);
    return suggestIcons(habit?.name, 1)[0] || LEGACY[stored] || DEFAULT_HABIT_ICON;
}

export function storedIcon(id) {
    return `hb:${BY_ID.has(id) ? id : DEFAULT_HABIT_ICON}`;
}

// Picker search: label, category or any keyword (weak ones too).
export function searchIcons(query) {
    const q = normalize(query).trim();
    if (!q) return HABIT_ICONS.map(i => i.id);
    const hits = new Set(suggestIcons(query, HABIT_ICONS.length));
    HABIT_ICONS.forEach(i => {
        if (i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || i.id.includes(q)
            || i.keywords.some(k => k.replace(/[~*]/g, "").startsWith(q))) hits.add(i.id);
    });
    return [...hits];
}
