/* ==========================================
   Southbound — the "Hot out?" card on a workout page (pure)

   The client types today's feels-like temperature (a forecast they read,
   never looked up for them: Southbound doesn't know where they run) and
   sees what the heat rules (js/planRules.js proposeHeatAdjustment) would
   change. Nothing changes on its own: "Ask my coach" sends the usual
   change request, and the coach decides.

   heatCardModel({ day, feelsLikeF, minutes, dateText }) -> {
     show, empty, extreme, adjustmentSec, paceFrom, paceTo, headline, lines[], options[], message }
   Unit-tested in tests/heatCard.test.mjs.
========================================== */

import { plannedSteps } from "./workoutExecution.js";
import { proposeHeatAdjustment } from "./planRules.js";

const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const OPTION_TEXT = {
    move: "Move it to a cooler time of day",
    shorten: "Shorten it",
    skip: "Skip it",
    shift_time: "Run at a cooler time of day"
};
const EFFORT = { tempo: "a steady, comfortable-hard effort", interval: "the reps by effort", long: "an easy, steady effort", easy: "an easy, conversational effort" };

/** What the heat rules need to know about one planned run. */
export function heatSession(day, minutes = 0) {
    const steps = plannedSteps(day?.workout);
    const work = steps.filter(s => s.kind === "work");
    const target = work.find(s => s.target && Number.isFinite(s.target.lo));
    const type = day?.type;
    const kind = type === "long" ? "long" : work.length >= 3 ? "interval" : ["tempo", "workout"].includes(type) ? "tempo" : type === "easy" || type === "recovery" || type === "run" ? "easy" : "tempo";
    return { kind, minutes: Number(minutes) || 0, paceSec: target ? Math.round((target.target.lo + target.target.hi) / 2) : null };
}

export function heatCardModel({ day, feelsLikeF, minutes = 0, dateText = "" } = {}) {
    const session = heatSession(day, minutes);
    const typed = feelsLikeF !== "" && feelsLikeF != null && Number.isFinite(Number(feelsLikeF));
    if (!typed) return { show: false, empty: true, session };
    const f = Number(feelsLikeF);
    const r = proposeHeatAdjustment(session, { feelsLikeF: f, source: "typed by you" });
    if (r.proposal === "none") {
        return { show: false, empty: false, session, headline: "No heat change", lines: ["At or below 68°F feels-like the rules don't change this run."] };
    }
    const extreme = r.proposal === "options_first";
    const options = r.options.filter(o => OPTION_TEXT[o]).map(o => OPTION_TEXT[o]);
    const slow = r.paceFrom != null ? `Slow down by about ${r.adjustmentSec} s a mile (${mmss(r.paceFrom)} to ${mmss(r.paceTo)})` : `Slow down a little, by about ${r.adjustmentSec} s a mile`;
    const lines = [r.reason.replace(/^Graduated from 68°F, scaled for /, "Scaled for ").replace(/\. These numbers are assumptions, not validated\.$/, ".")];
    lines.push(...r.notes.filter(n => !/slower pace may not/.test(n)));
    lines.push(`Run by effort (RPE) either way: ${EFFORT[session.kind]}.`);
    const message = `Hot day${dateText ? ` (${dateText})` : ""}: I read a feels-like of ${Math.round(f)}°F. ${extreme
        ? "Could this run move, get shorter, or be skipped?"
        : r.paceFrom != null ? `Could this run go from ${mmss(r.paceFrom)} to ${mmss(r.paceTo)} per mile?` : "Could this run be eased a little?"} The app suggested that from my number. It's a forecast I read, not a measurement.`;
    return {
        show: true, empty: false, extreme, session, adjustmentSec: r.adjustmentSec, paceFrom: r.paceFrom, paceTo: r.paceTo,
        headline: extreme ? `${Math.round(f)}°F: move, shorten or skip first` : r.paceFrom != null ? `${mmss(r.paceFrom)} → ${mmss(r.paceTo)} per mile` : `About ${r.adjustmentSec} s a mile slower`,
        lines, options: extreme ? [...options, slow + " (last choice)"] : options, message
    };
}
