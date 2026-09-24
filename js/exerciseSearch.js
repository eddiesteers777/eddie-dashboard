/* ==========================================
   Southbound Exercise Search

   Searches the free-exercise-db dataset (876
   exercises, public domain / Unlicense) for the
   Strength plan builder. The whole dataset is
   about 1MB, so it's fetched once and cached in
   memory rather than hitting a live search API
   on every keystroke -- no rate limits, no CORS
   uncertainty, no third-party API to go down.

   Served through jsDelivr's GitHub mirror rather
   than raw.githubusercontent.com directly, for a
   real CDN with guaranteed CORS headers -- the
   same hosting pattern already used elsewhere in
   this project for other external libraries.
========================================== */

const DATASET_URL =
    "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json";

const IMAGE_BASE =
    "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/";

let cache = null;
let loadingPromise = null;

async function loadDataset() {
    if (cache) {
        return cache;
    }

    if (loadingPromise) {
        return loadingPromise;
    }

    loadingPromise = fetch(DATASET_URL)
        .then(response => {
            if (!response.ok) {
                throw new Error(
                    `Exercise database failed to load (${response.status})`
                );
            }

            return response.json();
        })
        .then(data => {
            cache = Array.isArray(data) ? data : [];
            return cache;
        })
        .catch(error => {
            loadingPromise = null;
            throw error;
        });

    return loadingPromise;
}

function imageUrl(exercise) {
    const first = exercise.images?.[0];
    return first ? `${IMAGE_BASE}${first}` : null;
}

function normalize(exercise) {
    return {
        id: exercise.id,
        name: exercise.name,
        equipment: exercise.equipment || "no equipment",
        level: exercise.level || null,
        category: exercise.category || null,
        primaryMuscles: exercise.primaryMuscles || [],
        secondaryMuscles: exercise.secondaryMuscles || [],
        instructions: exercise.instructions || [],
        image: imageUrl(exercise)
    };
}

/**
 * Searches the exercise dataset by name, muscle, or equipment.
 * Loads the dataset on first call (from any page) and reuses it
 * for the rest of the session after that.
 */
export async function searchExercises(query) {
    const trimmed = query.trim().toLowerCase();

    if (!trimmed) {
        return [];
    }

    const exercises = await loadDataset();

    const matches = exercises.filter(ex => {
        const haystack = [
            ex.name,
            ex.equipment,
            ...(ex.primaryMuscles || []),
            ...(ex.secondaryMuscles || [])
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return haystack.includes(trimmed);
    });

    // Shorter names that contain the query tend to be the more
    // "canonical" version of a lift -- "Machine Bench Press" over
    // "Bench Press - Powerlifting" for a plain "bench press" search.
    matches.sort((a, b) => a.name.length - b.name.length);

    return matches.slice(0, 25).map(normalize);
}

/**
 * Look up one exercise by its dataset id -- used when re-opening
 * a saved plan exercise to show its muscle/equipment info again
 * without re-running a search.
 */
export async function getExerciseById(id) {
    const exercises = await loadDataset();
    const found = exercises.find(ex => ex.id === id);
    return found ? normalize(found) : null;
}
