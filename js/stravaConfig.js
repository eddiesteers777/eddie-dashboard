/* ==========================================
   Strava connection settings

   Fill these in once you've created a Strava API app
   (https://www.strava.com/settings/api) and deployed the broker
   worker in /cloudflare-worker. Kept in their own file (no side
   effects) so the Coach Dashboard can show whether Strava is set up
   without starting the sign-in flow that js/stravaAuth.js runs.
========================================== */

export const STRAVA_CLIENT_ID = "REPLACE_WITH_STRAVA_CLIENT_ID";
export const STRAVA_BROKER_URL = "REPLACE_WITH_YOUR_WORKER_URL";

export function isStravaConfigured() {
    return !STRAVA_CLIENT_ID.startsWith("REPLACE_") && !STRAVA_BROKER_URL.startsWith("REPLACE_");
}
