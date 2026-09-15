/* ==========================================
   EddieOS Food Search

   Searches real food/product databases so nutrition
   entries don't have to be typed in by hand.

   - Open Food Facts: no API key, huge branded/barcode
     product database. Tried first.
   - USDA FoodData Central: free API key, better for
     whole/generic foods (e.g. "banana", "chicken breast").
     Only used if the user has entered a key in Settings,
     and only to fill in results Open Food Facts didn't
     already cover.

   Every result is normalized to the same shape so the
   rest of the app never needs to know which source it
   came from:

   {
       id, name, brand, source,
       per100g: { calories, protein, carbs, fat, sodium },
       servingGrams: number|null,
       servingDesc: string|null
   }

   Nutrient values are always per 100g — the most reliable
   basis both databases share — plus an optional serving
   size when the source provides one, so the UI can offer
   a one-tap "1 serving" quantity alongside a manual gram
   amount.
========================================== */

import { getUserSettings } from "./userSettings.js";

const OFF_LEGACY_SEARCH_URL =
    "https://world.openfoodfacts.org/cgi/search.pl";

const OFF_SALICIOUS_SEARCH_URL =
    "https://search.openfoodfacts.org/search";

const USDA_SEARCH_URL =
    "https://api.nal.usda.gov/fdc/v1/foods/search";

function round(value, decimals = 1) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        return 0;
    }

    const factor = 10 ** decimals;
    return Math.round(n * factor) / factor;
}

function parseServingGrams(servingSize) {
    if (!servingSize || typeof servingSize !== "string") {
        return null;
    }

    const match = servingSize.match(/([\d.]+)\s*g\b/i);
    return match ? Number(match[1]) : null;
}

function normalizeOffProduct(product) {
    const n = product.nutriments || {};

    const per100g = {
        calories: round(n["energy-kcal_100g"] ?? 0),
        protein: round(n["proteins_100g"] ?? 0),
        carbs: round(n["carbohydrates_100g"] ?? 0),
        fat: round(n["fat_100g"] ?? 0),
        // Open Food Facts stores sodium in grams per 100g.
        sodium: round((n["sodium_100g"] ?? 0) * 1000, 0)
    };

    // Skip results with no usable calorie data at all —
    // these are almost always non-food or malformed entries.
    if (!per100g.calories) {
        return null;
    }

    const name =
        product.product_name ||
        product.product_name_en ||
        product.generic_name;

    if (!name) {
        return null;
    }

    return {
        id: `off-${product.code || product._id || name}`,
        name,
        brand: product.brands
            ? product.brands.split(",")[0].trim()
            : "",
        source: "Open Food Facts",
        per100g,
        servingGrams: parseServingGrams(product.serving_size),
        servingDesc: product.serving_size || null
    };
}

async function searchOpenFoodFactsLegacy(query) {
    const url =
        `${OFF_LEGACY_SEARCH_URL}?search_terms=${encodeURIComponent(query)}` +
        "&search_simple=1&action=process&json=1&page_size=15" +
        "&fields=product_name,product_name_en,generic_name,brands,code,_id,nutriments,serving_size";

    const response = await fetch(url, {
        headers: { Accept: "application/json" }
    });

    if (!response.ok) {
        throw new Error(`Open Food Facts legacy search failed (${response.status})`);
    }

    const data = await response.json();
    const products = Array.isArray(data.products) ? data.products : [];

    return products
        .map(normalizeOffProduct)
        .filter(Boolean);
}

async function searchOpenFoodFactsSalicious(query) {
    const url =
        `${OFF_SALICIOUS_SEARCH_URL}?q=${encodeURIComponent(query)}` +
        "&page_size=15&langs=en" +
        "&fields=product_name,product_name_en,generic_name,brands,code,nutriments,serving_size";

    const response = await fetch(url, {
        headers: { Accept: "application/json" }
    });

    if (!response.ok) {
        throw new Error(`Open Food Facts search failed (${response.status})`);
    }

    const data = await response.json();

    // The exact success shape isn't documented publicly at the time
    // this was written, so this tries every plausible layout rather
    // than assuming one: a flat array of products, an ElasticSearch
    // -style hits.hits[]._source wrapper, or hits as the array itself.
    const rawProducts =
        (Array.isArray(data.hits) && data.hits[0]?._source
            ? data.hits.map(h => h._source)
            : Array.isArray(data.hits)
                ? data.hits
                : Array.isArray(data.hits?.hits)
                    ? data.hits.hits.map(h => h._source || h)
                    : []);

    return rawProducts
        .map(normalizeOffProduct)
        .filter(Boolean);
}

/**
 * Open Food Facts's actively-maintained search (search-a-licious) is
 * tried first. Its exact response shape isn't publicly documented as
 * of this writing, so it's parsed defensively above. If it returns
 * nothing usable — including because of that shape uncertainty — the
 * older /cgi/search.pl endpoint is tried as a fallback. That endpoint
 * still works but has had real documented outages and is explicitly
 * marked "not recommended for new integrations" by Open Food Facts
 * themselves, which is why it's the fallback and not the primary.
 */
async function searchOpenFoodFacts(query) {
    try {
        const results = await searchOpenFoodFactsSalicious(query);

        if (results.length) {
            return results;
        }
    } catch (error) {
        console.warn("Open Food Facts (search-a-licious) failed:", error);
    }

    return searchOpenFoodFactsLegacy(query);
}

const USDA_NUTRIENT_NUMBERS = {
    "1008": "calories",
    "1003": "protein",
    "1005": "carbs",
    "1004": "fat",
    "1093": "sodium"
};

function normalizeUsdaFood(food) {
    const per100g = {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        sodium: 0
    };

    for (const nutrient of food.foodNutrients || []) {
        const key = USDA_NUTRIENT_NUMBERS[String(nutrient.nutrientNumber)];

        if (key) {
            per100g[key] = round(
                nutrient.value ?? 0,
                key === "sodium" ? 0 : 1
            );
        }
    }

    if (!per100g.calories) {
        return null;
    }

    const servingGrams =
        food.servingSize &&
        String(food.servingSizeUnit || "").toLowerCase() === "g"
            ? Number(food.servingSize)
            : null;

    return {
        id: `usda-${food.fdcId}`,
        name: food.description,
        brand: food.brandName || food.brandOwner || "",
        source: "USDA",
        per100g,
        servingGrams,
        servingDesc:
            servingGrams
                ? `${servingGrams} g`
                : null
    };
}

async function searchUsda(query, apiKey) {
    const url =
        `${USDA_SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}` +
        `&query=${encodeURIComponent(query)}&pageSize=15`;

    const response = await fetch(url, {
        headers: { Accept: "application/json" }
    });

    if (!response.ok) {
        throw new Error(`USDA search failed (${response.status})`);
    }

    const data = await response.json();
    const foods = Array.isArray(data.foods) ? data.foods : [];

    return foods
        .map(normalizeUsdaFood)
        .filter(Boolean);
}

function dedupeByName(results) {
    const seen = new Set();
    const out = [];

    for (const item of results) {
        const key = item.name.trim().toLowerCase();

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        out.push(item);
    }

    return out;
}

/**
 * Searches for foods matching the query. Tries Open Food Facts
 * first; if a USDA API key is saved in Settings, USDA results
 * are appended as a fallback for whole/generic foods. Errors
 * from either source are non-fatal — a failure in one source
 * just means fewer results, not a broken search.
 */
export async function searchFoods(query) {
    const trimmed = query.trim();

    if (!trimmed) {
        return [];
    }

    const results = [];

    try {
        results.push(...await searchOpenFoodFacts(trimmed));
    } catch (error) {
        console.warn("Open Food Facts search failed:", error);
    }

    const usdaKey = getUserSettings().usdaApiKey?.trim();

    if (usdaKey) {
        try {
            results.push(...await searchUsda(trimmed, usdaKey));
        } catch (error) {
            console.warn("USDA search failed:", error);
        }
    }

    return dedupeByName(results).slice(0, 20);
}

/**
 * Scales a normalized food's per-100g values to an actual
 * gram amount being logged.
 */
export function scaleFood(food, grams) {
    const factor = Number(grams) / 100;

    return {
        calories: Math.round(food.per100g.calories * factor),
        protein: round(food.per100g.protein * factor),
        carbs: round(food.per100g.carbs * factor),
        fat: round(food.per100g.fat * factor),
        sodium: Math.round(food.per100g.sodium * factor)
    };
}
