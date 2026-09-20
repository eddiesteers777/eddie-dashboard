/* ==========================================
   EddieOS Habit Icon Inference

   Shared by habits.js and 75day.html (same
   underlying "habits"/"entries" localStorage
   data, two different pages showing it) so a
   habit gets the same icon and color no matter
   which page you're looking at it from.

   Keyword -> icon/color, checked in order (most
   specific first) so e.g. "Bible" and "Read 5
   Pages" both land in book territory but get
   different colors. Habits added through the
   "+ Habit" field never got an icon field at all
   until this existed, which is why they used to
   all render as a plain star.
========================================== */

const HABIT_ICON_RULES = [
    { keywords: ["prayer", "pray", "devotion"], icon: "pray", color: "var(--purple)" },
    { keywords: ["bible", "scripture"], icon: "bookOpen", color: "var(--amber)" },
    { keywords: ["read", "book", "page"], icon: "bookOpen", color: "var(--green)" },
    { keywords: ["stretch", "mobility", "yoga", "foam roll"], icon: "stretch", color: "var(--teal)" },
    { keywords: ["strength", "lift", "weights"], icon: "dumbbell", color: "var(--orange)" },
    { keywords: ["run", "cardio", "training", "workout", "exercise"], icon: "activity", color: "var(--orange)" },
    { keywords: ["protein"], icon: "drumstick", color: "var(--red)" },
    { keywords: ["water", "hydrat"], icon: "droplet", color: "var(--primary)" },
    { keywords: ["sleep", "rest", "nap"], icon: "moon", color: "var(--indigo)" },
    { keywords: ["wife", "husband", "spouse", "family", "kids", "date night"], icon: "heart", color: "var(--red)" },
    { keywords: ["meditat", "mindful", "journal", "gratitude"], icon: "moon", color: "var(--purple)" },
    { keywords: ["nutrition", "diet", "meal", "food", "eat"], icon: "apple", color: "var(--green)" },
    { keywords: ["step", "walk"], icon: "footprint", color: "var(--teal)" },
    { keywords: ["vitamin", "supplement", "medicine", "pill"], icon: "checkCircle", color: "var(--green)" }
];

export function inferHabitVisual(name) {
    const lower = String(name ?? "").toLowerCase();
    const match = HABIT_ICON_RULES.find(rule => rule.keywords.some(k => lower.includes(k)));

    return match
        ? { icon: match.icon, color: match.color }
        : { icon: "star", color: "var(--primary)" };
}

export function habitVisual(h) {
    const inferred = inferHabitVisual(h.name);

    return {
        icon: h.icon || inferred.icon,
        color: h.color || inferred.color
    };
}
