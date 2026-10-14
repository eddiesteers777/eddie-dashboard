/* ==========================================
   Southbound — popular fueling sources (pure)

   A reference list of widely used gels, chews, drink mixes, electrolyte
   products and everyday foods, per serving, so an athlete can add one to
   their Fueling Library in a tap and the fueling PDF can print a quick
   reference. Numbers are APPROXIMATE, taken from makers' published labels
   (US versions, one common flavor): flavors, countries and recipes
   change, so the page and the PDF always say to check the packet.

     SOURCE_GROUPS          [{ id, title, note }]
     POPULAR_SOURCES        [{ id, group, name, serving, carbs, sodium,
                               caffeineMg, fluidOz, category, note }]
                            sodium null = very little / varies;
                            caffeineMg a range is written in note
     sourcesByGroup()       [{ ...group, items }]
     toLibraryItem(src, id) the Fueling Library's item shape
     sourceLine(src)        "25 g carbs · 20 mg sodium · 100 mg caffeine"

   Unit-tested in tests/fuelPdf.test.mjs.
========================================== */

export const SOURCES_NOTE = "Approximate values per serving from makers' labels (US, one common flavor). Flavors, countries and recipes differ: check your packet.";

export const SOURCE_GROUPS = [
    { id: "gels", title: "Gels", note: "Take with a few sips of water." },
    { id: "chews", title: "Chews and blocks", note: "Easier to split up; chew between sips." },
    { id: "drinks", title: "Drink mixes", note: "Carbs and sodium in the bottle; sip steadily." },
    { id: "electrolytes", title: "Electrolytes (little or no carbs)", note: "Sodium for long or hot days; still need carbs from elsewhere." },
    { id: "food", title: "Everyday foods", note: "Cheap and real; practice them in training first." }
];

const s = (id, group, name, serving, carbs, sodium, caffeineMg, category, extra = {}) =>
    ({ id, group, name, serving, carbs, sodium, caffeineMg, category, fluidOz: 0, note: "", ...extra });

export const POPULAR_SOURCES = [
    // Gels
    s("maurten-gel-100", "gels", "Maurten Gel 100", "1 gel (40 g)", 25, 20, 0, "gels"),
    s("maurten-gel-100-caf", "gels", "Maurten Gel 100 CAF 100", "1 gel (40 g)", 25, 20, 100, "gels"),
    s("gu-energy-gel", "gels", "GU Energy Gel", "1 gel (32 g)", 22, 60, 0, "gels", { note: "Some flavors have 20 or 40 mg caffeine; sodium 55–125 mg by flavor." }),
    s("gu-roctane-gel", "gels", "GU Roctane Energy Gel", "1 gel (32 g)", 21, 125, 35, "gels", { note: "Caffeine 0–70 mg by flavor." }),
    s("sis-go-isotonic", "gels", "SiS GO Isotonic Energy Gel", "1 gel (60 ml)", 22, 10, 0, "gels", { note: "Made to take without water." }),
    s("sis-beta-fuel-gel", "gels", "SiS Beta Fuel Gel", "1 gel (60 ml)", 40, 20, 0, "gels"),
    s("pf-30-gel", "gels", "Precision Fuel PF 30 Gel", "1 gel (51 g)", 30, null, 0, "gels", { note: "Very little sodium; a caffeinated version has 100 mg." }),
    s("honey-stinger-gel", "gels", "Honey Stinger Organic Energy Gel", "1 gel (32 g)", 24, 50, 0, "gels"),
    s("huma-chia-gel", "gels", "Huma Chia Energy Gel", "1 gel (39 g)", 21, 105, 0, "gels", { note: "A \"Plus\" version has about 240 mg sodium." }),
    s("hammer-gel", "gels", "Hammer Gel", "1 gel (33 g)", 22, 25, 0, "gels"),
    // Chews
    s("clif-bloks", "chews", "Clif Bloks Energy Chews", "3 pieces (30 g)", 24, 50, 0, "chews", { note: "Some flavors have 25–50 mg caffeine; \"salted\" versions about 200 mg sodium." }),
    s("gu-chews", "chews", "GU Energy Chews", "4 pieces (30 g)", 23, 50, 0, "chews", { note: "Some flavors have 20 mg caffeine." }),
    s("honey-stinger-chews", "chews", "Honey Stinger Energy Chews", "1 pack (50 g)", 39, 80, 0, "chews"),
    // Drink mixes (fluid = the water it's usually mixed in)
    s("tailwind", "drinks", "Tailwind Endurance Fuel", "1 scoop in 16–24 oz", 25, 303, 0, "drinkmix", { fluidOz: 20, note: "Caffeinated flavors have 35 mg a scoop." }),
    s("maurten-160", "drinks", "Maurten Drink Mix 160", "1 pouch in 500 ml", 39, 200, 0, "drinkmix", { fluidOz: 17 }),
    s("maurten-320", "drinks", "Maurten Drink Mix 320", "1 pouch in 500 ml", 79, 400, 0, "drinkmix", { fluidOz: 17 }),
    s("skratch-sport", "drinks", "Skratch Labs Sport Hydration Mix", "1 scoop in 16 oz", 20, 380, 0, "drinkmix", { fluidOz: 16 }),
    s("gatorade-endurance", "drinks", "Gatorade Endurance Formula", "12 oz", 22, 300, 0, "drinkmix", { fluidOz: 12, note: "What many big marathons serve on course." }),
    // Electrolytes
    s("lmnt", "electrolytes", "LMNT Electrolyte Drink Mix", "1 stick", 0, 1000, 0, "other", { fluidOz: 16 }),
    s("ph-1500", "electrolytes", "Precision Hydration PH 1500 tablet", "1 tablet in 500 ml", 0, 750, 0, "other", { fluidOz: 17 }),
    s("saltstick-caps", "electrolytes", "SaltStick Caps", "1 capsule", 0, 215, 0, "other"),
    s("nuun-sport", "electrolytes", "Nuun Sport tablet", "1 tablet in 16 oz", 4, 300, 0, "other", { fluidOz: 16 }),
    // Everyday foods
    s("banana", "food", "Banana", "1 medium", 27, 1, 0, "other"),
    s("dates", "food", "Medjool dates", "1 date", 18, 0, 0, "other"),
    s("honey", "food", "Honey", "1 tablespoon", 17, 1, 0, "other"),
    s("maple", "food", "Maple syrup", "1 tablespoon", 13, 2, 0, "other"),
    s("pretzels", "food", "Salted pretzels", "1 oz (28 g)", 23, 350, 0, "bars", { note: "Sodium varies a lot by brand." }),
    s("gummies", "food", "Gummy bears", "about 10 pieces", 22, 10, 0, "chews"),
    s("cola", "food", "Cola", "8 oz", 26, 30, 23, "drinkmix", { fluidOz: 8, note: "Flat cola settles many stomachs late in a race." }),
    s("table-salt", "food", "Table salt (in your own drink)", "¼ teaspoon", 0, 575, 0, "other")
];

export function sourcesByGroup(list = POPULAR_SOURCES) {
    return SOURCE_GROUPS.map(g => ({ ...g, items: list.filter(x => x.group === g.id) })).filter(g => g.items.length);
}

export function sourceLine(src, fluidText = oz => `${oz} oz`) {
    const bits = [`${src.carbs} g carbs`];
    bits.push(src.sodium == null ? "little sodium" : `${src.sodium} mg sodium`);
    if (src.caffeineMg) bits.push(`${src.caffeineMg} mg caffeine`);
    if (src.fluidOz) bits.push(`with ${fluidText(src.fluidOz)} water`);
    return bits.join(" · ");
}

/** A Fueling Library item (js/fueling.js shape) from a source. */
export function toLibraryItem(src, id) {
    return {
        id,
        name: src.name,
        category: src.category,
        carbs: src.carbs,
        sodium: src.sodium ?? 0,
        fluid: src.fluidOz || 0,
        caffeine: Boolean(src.caffeineMg),
        caffeineMg: src.caffeineMg || 0,
        serving: src.serving,
        price: "",
        sourceId: src.id
    };
}
