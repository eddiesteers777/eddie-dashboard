/* ==========================================
   Southbound — sunrise and sunset for a place and day (pure)

   The standard sunrise equation (NOAA-style, about a minute or two
   off at most). Used by the route safety rating to tell daylight,
   low light (30 min either side of sunrise and sunset) and night.
   Times are plain milliseconds (UTC); nothing leaves the device.
========================================== */

const DAY_MS = 86400000;
const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const toJulian = ms => ms / DAY_MS + 2440587.5;
const fromJulian = j => Math.round((j - 2440587.5) * DAY_MS);

/**
 * Sunrise and sunset for the solar day that contains `ms` at that longitude.
 * -> { sunrise, sunset } in ms, or { polar: "day" | "night" } when the sun never sets or never rises.
 */
export function sunTimes(ms, lat, lon) {
    const localDay = Math.floor((ms + lon / 360 * DAY_MS) / DAY_MS); // whole days since 1970 at that longitude
    const n = localDay + 2440588 - 2451545; // days since 2000-01-01 noon
    const jStar = n + 0.0008 - lon / 360;
    const M = (357.5291 + 0.98560028 * jStar) % 360;
    const C = 1.9148 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 0.0003 * Math.sin(rad(3 * M));
    const lambda = (M + C + 180 + 102.9372) % 360;
    const transit = 2451545 + jStar + 0.0053 * Math.sin(rad(M)) - 0.0069 * Math.sin(rad(2 * lambda));
    const sinDec = Math.sin(rad(lambda)) * Math.sin(rad(23.4397));
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosW = (Math.sin(rad(-0.833)) - Math.sin(rad(lat)) * sinDec) / (Math.cos(rad(lat)) * cosDec);
    if (cosW < -1) return { polar: "day" };
    if (cosW > 1) return { polar: "night" };
    const w = deg(Math.acos(cosW)) / 360;
    return { sunrise: fromJulian(transit - w), sunset: fromJulian(transit + w) };
}

export const LOW_LIGHT_MS = 30 * 60000;

/** "day" | "dusk" (within 30 min of sunrise or sunset) | "night" at time `ms`. */
export function lightAt(ms, sun) {
    if (!sun) return "day";
    if (sun.polar) return sun.polar === "day" ? "day" : "night";
    if (Math.abs(ms - sun.sunrise) <= LOW_LIGHT_MS || Math.abs(ms - sun.sunset) <= LOW_LIGHT_MS) return "dusk";
    return ms > sun.sunrise && ms < sun.sunset ? "day" : "night";
}

/**
 * Rush hour is an assumption, not traffic data: weekdays 7–9 am and 4–6 pm, in this
 * device's local time.
 */
export function isRushHour(ms) {
    const d = new Date(ms);
    const day = d.getDay(), h = d.getHours() + d.getMinutes() / 60;
    if (day === 0 || day === 6) return false;
    return (h >= 7 && h < 9) || (h >= 16 && h < 18);
}

/** "6:30 am" in this device's local time. */
export function clockText(ms) {
    const d = new Date(ms);
    const h = d.getHours(), m = d.getMinutes();
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
