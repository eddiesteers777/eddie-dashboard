/* ==========================================
   Southbound — what goes in a fueling plan's PDF (pure)

   pdfModel(plan, schedule, opts) turns a saved (or on-screen) fueling
   plan (the shape buildPlanObject() in js/fueling.js writes) and its
   race-day schedule (buildSchedule in js/fuelSchedule.js) into plain rows
   for js/fuelPdf.js to draw: the header, the targets with how they were
   set, what to carry, the drink recipe, the schedule checkpoint by
   checkpoint, the hour-by-hour check, a packing checklist and, last, the
   popular fueling sources (js/fuelSources.js). Everything is already in
   words; the drawing code only lays it out.

     opts: { unit: "oz" | "ml", today: Date, sources: true }

   pdfSafe(text) swaps characters the PDF's built-in fonts can't draw
   (⅛, →, ≈ ...) for plain ones. pdfFileName(plan) -> "southbound-fuel-
   chicago-long-run.pdf".

   Unit-tested in tests/fuelPdf.test.mjs.
========================================== */

import { formatClock, recipeParts, drinkRecipe, drinkIncluded, caffeineMg } from "./fuelSchedule.js";
import { fluidText, fluidWords } from "./fluidUnits.js";
import { calculateTargets, formatDuration } from "./fuelTargets.js";
import { sourcesByGroup, sourceLine, SOURCES_NOTE } from "./fuelSources.js";

const SWAPS = [
    [/(\d) ?⅛/g, "$1 1/8"], [/(\d) ?⅜/g, "$1 3/8"], [/(\d) ?⅝/g, "$1 5/8"], [/(\d) ?⅞/g, "$1 7/8"], [/(\d) ?⅓/g, "$1 1/3"], [/(\d) ?⅔/g, "$1 2/3"],
    [/⅛/g, "1/8"], [/⅜/g, "3/8"], [/⅝/g, "5/8"], [/⅞/g, "7/8"], [/⅓/g, "1/3"], [/⅔/g, "2/3"],
    [/→/g, "->"], [/←/g, "<-"], [/≈/g, "~"], [/−/g, "-"], [/✓/g, ""], [/₂/g, "2"], [/[  ]/g, " "],
    [/[^\x20-\x7e -ÿ–—‘’“”•…·]/g, ""]
];

/** Text the PDF's standard fonts can draw. */
export function pdfSafe(text) {
    let t = String(text ?? "");
    for (const [re, to] of SWAPS) t = t.replace(re, to);
    return t.replace(/ {2,}/g, " ").trim();
}

export function pdfFileName(plan) {
    const slug = String(plan?.name || "fueling-plan").toLowerCase().normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "fueling-plan";
    return `southbound-fuel-${slug}.pdf`;
}

const mi = n => (n == null ? "" : String(Math.round(n * 10) / 10));
const BASIS = { measured: "Measured", yours: "Your number", estimate: "Estimate" };

function partWords(part) {
    if (!part) return "";
    return /^Rep /.test(part) ? `During ${part.toLowerCase()}` : part === "Recovery" ? "On a recovery" : `In the ${part.toLowerCase()}`;
}

export function pdfModel(plan, schedule, { unit = "oz", today = new Date(), sources = true } = {}) {
    const fl = oz => fluidText(oz, unit);
    const hours = (Number(plan.duration) || schedule?.durationMin || 0) / 60;
    const session = plan.session || {};
    const s = schedule || { events: [], hours: [], warnings: [], totals: {}, targetTotals: {}, bottles: [] };

    // How the targets were set: worked out again from the plan's own inputs;
    // a target the person typed over is said as theirs.
    let calc = null;
    try { calc = plan.session ? calculateTargets({ ...session, duration: Number(plan.duration) || undefined }) : null; } catch { calc = null; }
    const typed = k => calc && Number(plan[k]) !== calc[k];
    const targets = [
        { label: "Carbs", perHour: `${plan.carbsPerHour} g/hr`, total: `${Math.round(plan.carbsPerHour * hours)} g`, basis: typed("carbsPerHour") ? "Your number" : calc ? "Worked out" : "" },
        { label: "Fluid", perHour: `${fl(plan.fluidPerHour)}/hr`, total: fl(Math.round(plan.fluidPerHour * hours)), basis: typed("fluidPerHour") ? "Your number" : calc ? BASIS[calc.basis?.fluid] || "" : "" },
        { label: "Sodium", perHour: `${plan.sodiumPerHour} mg/hr`, total: `${Math.round(plan.sodiumPerHour * hours)} mg`, basis: typed("sodiumPerHour") ? "Your number" : calc ? BASIS[calc.basis?.sodium] || "" : "" }
    ];
    const why = [];
    if (calc) {
        const carbs = (calc.why || []).map(w => w.label).filter(Boolean);
        if (carbs.length) why.push(`Carbs: ${carbs.join("; ")}.`);
        const fluid = (calc.fluidWhy || []).map(w => w.label).filter(Boolean);
        if (fluid.length) why.push(`Fluid: ${fluid.join("; ")}.`);
        const sodium = (calc.sodiumWhy || []).map(w => w.label).filter(Boolean);
        if (sodium.length) why.push(`Sodium: ${sodium.join("; ")}.`);
    }

    const caffeine = s.totals?.caffeineMg
        ? `${s.totals.caffeineMg} mg${s.totals.caffeineUnknown ? ` + ${s.totals.caffeineUnknown} serving(s) with no mg on file` : ""}`
        : s.totals?.caffeineUnknown ? `${s.totals.caffeineUnknown} caffeinated serving(s), mg not on file` : "None";

    const header = {
        title: plan.name || "Fueling plan",
        subtitle: [plan.workout && plan.workout !== "—" ? plan.workout : "", plan.mode === "race" ? "Race plan" : "Training plan"].filter(Boolean).join(" · "),
        date: today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        stats: [
            { label: "Time", value: plan.duration ? formatDuration(plan.duration) : "—" },
            s.distanceMi ? { label: "Distance", value: `${mi(s.distanceMi)} mi` } : null,
            s.startTod ? { label: "Start", value: s.startTod } : null,
            { label: "Carbs", value: `${s.totals?.carbs ?? 0} g`, sub: `target ${s.targetTotals?.carbs ?? Math.round(plan.carbsPerHour * hours)} g` },
            { label: "Fluid", value: s.totals?.fluid ? fl(s.totals.fluid) : "None carried", sub: `target ${fl(s.targetTotals?.fluid ?? 0)}` },
            { label: "Sodium", value: `${s.totals?.sodium ?? 0} mg`, sub: `target ${s.targetTotals?.sodium ?? 0} mg` }
        ].filter(Boolean)
    };

    // What to carry.
    const carry = (plan.items || []).filter(i => Number(i.qty) > 0).map(i => ({
        name: i.name,
        qty: Number(i.qty),
        each: [`${Number(i.carbs) || 0} g carbs`, `${Number(i.sodium) || 0} mg sodium`, caffeineMg(i) ? `${caffeineMg(i)} mg caffeine` : ""].filter(Boolean).join(" · ")
    }));
    const diy = plan.diyInputs || null;
    let drink = null;
    if (diy && drinkIncluded(plan.includeHomemadeDrink, diy)) {
        const r = drinkRecipe(diy);
        drink = {
            bottles: r.bottles,
            perBottle: `${fl(r.bottleOz)} water + ${recipeParts(r).join(" + ") || "nothing added"}`,
            batch: r.bottles > 1 ? `For all ${r.bottles}: ${fl(r.bottleOz * r.bottles)} water + ${recipeParts(r, { batch: true }).join(" + ")}` : "",
            totals: `${Math.round(r.totals.carbs)} g carbs · ${Math.round(r.totals.sodium)} mg sodium in all`,
            notes: diy.notes || ""
        };
    }

    const scheduleRows = (s.events || []).map(e => {
        let what = e.text;
        let detail = "";
        if (e.kind === "gel") {
            what = `Gel ${e.gel}: ${e.text}`;
            detail = [partWords(e.part), e.movedFrom ? `moved off ${String(e.movedFrom.part).toLowerCase()}` : "", `${e.carbs} g carbs · ${e.sodium} mg sodium`, e.caffeineMg ? `${e.caffeineMg} mg caffeine` : "", "chase with a few sips"].filter(Boolean).join(" · ");
        } else if (e.kind === "sip") {
            what = `Drink ${e.sip}: ${e.text}`;
            const until = e.endMile != null ? `mile ${mi(e.endMile)}` : formatClock(e.endMin);
            detail = [partWords(e.part), e.fluid ? fl(e.fluid) : "", `${e.carbs} g carbs · ${e.sodium} mg sodium`, `sip steadily until ${until}`].filter(Boolean).join(" · ");
        } else if (e.kind === "bottle") {
            const b = s.bottles?.[e.bottle - 1];
            if (b) detail = `${fl(b.oz)} · ${b.carbs} g carbs · ${b.sodium} mg sodium · ${b.ozPerMile != null ? `about ${fl(b.ozPerMile)} each mile` : `about ${fl(b.ozPer10Min)} every 10 min`}`;
        }
        return { time: formatClock(e.min), clock: e.tod || "", mile: e.mile != null ? mi(e.mile) : "", what, detail, kind: e.kind, caffeine: Boolean(e.caffeine) };
    });

    const hourRows = (s.hours || []).map(h => ({
        label: `${formatClock(h.fromMin)} – ${formatClock(h.toMin)}`,
        carbs: `${h.carbs} of ${h.targetCarbs} g`,
        fluid: `${fl(h.fluid)} of ${fl(h.targetFluid)}`,
        sodium: `${h.sodium} of ${h.targetSodium} mg`,
        status: h.status === "low" ? "Low" : h.status === "high" ? "High" : h.status === "none" ? "" : "On target"
    }));

    const gels = (s.gels || []).length;
    const checklist = [
        ...carry.map(c => `${c.qty} × ${c.name}`),
        drink ? `${drink.bottles} bottle${drink.bottles === 1 ? "" : "s"} of your drink, mixed the night before` : "",
        plan.preWorkoutFood ? `Before: ${plan.preWorkoutFood}` : "",
        gels ? "Gels where you can reach them without stopping" : "",
        "Practice this plan in training before race day"
    ].filter(Boolean);

    return {
        header,
        targets,
        why,
        caffeine,
        carry,
        drink,
        before: plan.preWorkoutFood || "",
        schedule: scheduleRows,
        hours: hourRows,
        warnings: (s.warnings || []).map(w => fluidWords(w, unit)),
        checklist,
        sources: sources ? { note: SOURCES_NOTE, groups: sourcesByGroup().map(g => ({ title: g.title, note: g.note, items: g.items.map(x => ({ name: x.name, serving: x.serving, line: sourceLine(x, fl), note: x.note })) })) } : null,
        footer: "General guidance, not medical advice. Practice any plan in training first. southboundcoaching.com"
    };
}
