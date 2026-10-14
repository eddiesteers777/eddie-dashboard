// Strength units (pure, no DOM, no storage): tests/strengthUnits.test.mjs.
// Every weight is STORED in pounds (strength-plan, strength-history, the volume totals), so older
// data and every reader stay right; kg is only how a weight is shown and typed. Effort is stored
// as RPE; "reps in reserve" is another way of showing it (RIR = 10 − RPE).

export const LB_PER_KG = 2.20462262;
export const SETTINGS_KEY = "strength-settings";
export const DEFAULT_SETTINGS = { unit: "lb", effort: "rpe" };

export function cleanSettings(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    return {
        unit: s.unit === "kg" ? "kg" : "lb",
        effort: s.effort === "rir" ? "rir" : "rpe"
    };
}

const tenth = n => Math.round(n * 10) / 10;

// Pounds as stored -> the number shown (to 0.1, "100" not "100.0").
export function toDisplay(lb, unit = "lb") {
    const n = Number(lb) || 0;
    return tenth(unit === "kg" ? n / LB_PER_KG : n);
}

// What was typed -> pounds to store (to 0.01, so 102.5 kg comes back as 102.5 kg).
export function fromDisplay(value, unit = "lb") {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return unit === "kg" ? Math.round(n * LB_PER_KG * 100) / 100 : tenth(n);
}

export const unitLabel = unit => (unit === "kg" ? "kg" : "lb");
export const unitWord = unit => (unit === "kg" ? "kilograms" : "pounds");

// The +/- step in workout mode and the input's step.
export const stepFor = unit => (unit === "kg" ? 2.5 : 5);

// One tap of +/- on a stored weight: move in the shown unit, store pounds.
export function nudge(lb, unit, direction) {
    const shown = toDisplay(lb, unit);
    const step = stepFor(unit);
    const next = Math.max(0, tenth(shown + step * Math.sign(direction || 0)));
    return fromDisplay(next, unit);
}

export function weightText(lb, unit = "lb") {
    return `${toDisplay(lb, unit)} ${unitLabel(unit)}`;
}

// Exercises done with your own body: pull-ups, dips, push-ups... The weight box is then load ADDED.
export function isBodyweightEquipment(equipment) {
    return /^(body ?only|body ?weight|none|no equipment)$/i.test(String(equipment || "").trim());
}

// "bw" / "weighted" when chosen; otherwise read from the equipment, so pull-ups saved before this
// show as bodyweight with nothing to redo.
export function isBodyweight(exercise) {
    if (exercise?.load === "bw") return true;
    if (exercise?.load === "weighted") return false;
    return isBodyweightEquipment(exercise?.equipment);
}

// The load on one set as words: "185 lb", "84 kg", "BW", "BW + 25 lb".
export function loadText(lb, unit = "lb", bodyweight = false) {
    const n = Number(lb) || 0;
    if (bodyweight) return n > 0 ? `BW + ${weightText(n, unit)}` : "BW";
    return n > 0 ? weightText(n, unit) : "";
}

// One set for chips and lists: "84×5", "BW×10", "BW+10×8", "30s".
export function setShort(set, unit = "lb", { time = false, bodyweight = false } = {}) {
    if (time) return `${Number(set?.duration) || 0}s`;
    const n = Number(set?.weight) || 0;
    const reps = Number(set?.reps) || 0;
    if (bodyweight) return `${n > 0 ? `BW+${toDisplay(n, unit)}` : "BW"}×${reps}`;
    return n > 0 ? `${toDisplay(n, unit)}×${reps}` : String(reps);
}

/* ---------- Effort: RPE or reps in reserve ---------- */

export function rirFromRpe(rpe) {
    const n = Number(rpe);
    return Number.isFinite(n) && n >= 1 && n <= 10 ? 10 - n : null;
}

export function rpeFromRir(rir) {
    const n = Number(rir);
    return Number.isFinite(n) && n >= 0 && n <= 9 ? 10 - n : "";
}

export function effortLabel(mode) {
    return mode === "rir" ? "RIR" : "RPE";
}

// "RPE 8" / "2 RIR" (one rep left: "1 RIR", none: "0 RIR").
export function effortText(rpe, mode = "rpe") {
    const n = Number(rpe);
    if (!Number.isFinite(n) || n < 1 || n > 10) return "";
    return mode === "rir" ? `${10 - n} RIR` : `RPE ${n}`;
}

// The choices for a set's effort menu, as { value (the RPE to store), label, selected }.
// RIR offers 0–5 (the useful range); an older RPE below 5 still shows as its own choice.
export function effortOptions(mode, currentRpe) {
    const current = Number(currentRpe) || 0;
    if (mode !== "rir") {
        return Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1), selected: current === i + 1 }));
    }
    const rpes = [10, 9, 8, 7, 6, 5];
    if (current >= 1 && current < 5) rpes.push(current);
    return rpes.map(rpe => ({ value: rpe, label: String(10 - rpe), selected: current === rpe }));
}

/* ---------- Plates ---------- */

const PLATES = {
    lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] },
    kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] }
};

// Plates per side for a stored weight, in the shown unit.
export function plateMath(lb, unit = "lb") {
    const set = PLATES[unit === "kg" ? "kg" : "lb"];
    const total = toDisplay(lb, unit);
    if (total <= set.bar) return { bar: set.bar, total, perSide: 0, plates: [] };
    let left = (total - set.bar) / 2;
    const perSide = left;
    const plates = [];
    for (const size of set.plates) {
        while (left >= size - 0.01) { plates.push(size); left -= size; }
    }
    return { bar: set.bar, total, perSide, plates };
}

// Total volume (stored lb × reps) as shown: "12,400 lb" / "5,625 kg".
export function volumeText(lbTotal, unit = "lb") {
    const shown = Math.round(unit === "kg" ? (Number(lbTotal) || 0) / LB_PER_KG : Number(lbTotal) || 0);
    return `${shown.toLocaleString("en-US")} ${unitLabel(unit)}`;
}
