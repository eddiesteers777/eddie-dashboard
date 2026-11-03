/* ==========================================
   Southbound — the water screen's numbers (pure)

   The rising-tide water screen (js/waterSheet.js) draws a sea that rises
   as you drink. These helpers hold the math so it can be tested: where
   the surface sits, how the screen is laid out, and the words on it.
   Unit-tested in tests/waterTide.test.mjs.
========================================== */

import { timeText } from "./waterModel.js";

/** How full the sea is, 0 to 1. At the goal it is full and stays full (calm over the goal). */
export function tideFrac(oz, goal) {
    const g = Number(goal) > 0 ? Number(goal) : 1;
    return Math.min(1, Math.max(0, Number(oz) || 0) / g);
}

/** The surface's y on the screen: the goal line when full, the floor when empty. */
export function tideY(oz, goal, goalY, floorY) {
    return floorY - tideFrac(oz, goal) * (floorY - goalY);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Where things sit on a screen `width` x `height` whose controls start at `lowerTop`.
 * The goal line is near the top, the big count and the finale's check share the space
 * between the goal line and the controls.
 */
export function layoutFor(width, height, lowerTop) {
    const goalY = clamp(Math.round(height * 0.155), 104, 132);
    const floorY = height - 36;
    const space = Math.max(120, lowerTop - goalY);
    const countSize = Math.round(clamp(space * 0.36, 84, 136));
    const countTop = Math.round(goalY + space * 0.16);
    const buoy = Math.round(clamp(space * 0.32, 84, 124));
    const buoyY = Math.round(goalY + space * 0.3);
    const titleTop = buoyY + Math.round(buoy / 2) + 18;
    const titleSize = Math.round(clamp(width * 0.13, 36, 52));
    return { goalY, floorY, countSize, countTop, buoy, buoyY, titleTop, titleSize, countMid: countTop + Math.round(countSize * 0.45) };
}

/** "1 PM" or "1:20 PM" from minutes since midnight. */
export function hourText(minutes) {
    const m = Math.max(0, Math.round(minutes || 0)), h = Math.floor(m / 60) % 24, mm = m % 60;
    return `${h % 12 || 12}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${h >= 12 ? "PM" : "AM"}`;
}

/** The small label under the count. */
export function countCaption(total, goal) {
    if (total < goal) return `of ${goal} oz today`;
    return total > goal ? `${total - goal} oz over the goal` : "right on the goal";
}

/** The line above the controls while the goal is still ahead. */
export function paceMessage({ total, pace, isToday, goal }) {
    if (!isToday) return { lead: `${Math.max(0, goal - total)} oz`, rest: " short of the goal that day." };
    if (total === 0) return { lead: "", rest: "Nothing yet. The dashed line is where an even day puts you." };
    const d = total - pace;
    return { lead: `${Math.abs(d)} oz ${d >= 0 ? "ahead of" : "behind"}`, rest: " an even pace." };
}

/** The finale's summary line: "116 oz · 16 over · day 6 in a row" (without the total when the big number shows it). */
export function finaleSummary(total, goal, streak = 0, { withTotal = true } = {}) {
    const parts = withTotal ? [`${total} oz`] : [];
    if (!withTotal && total === goal) parts.push("right on the goal");
    if (total > goal) parts.push(`${total - goal} over`);
    if (streak >= 2) parts.push(`day ${streak} in a row`);
    return parts.join(" · ");
}

/** The tag on the even-pace marker: "EVEN PACE · 52 OZ BY 1 PM". */
export function paceTag(pace, minutes) {
    return `Even pace · ${pace} oz by ${hourText(minutes)}`;
}

export { timeText };
