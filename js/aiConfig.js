/* ==========================================
   AI helper settings

   The address of the Southbound AI helper (cloudflare-worker/ai-helper.js)
   once it's deployed on Cloudflare: docs/AI_HELPER_SETUP.md. Until then
   "Describe it" in the Client Hub stays off and the Coach Dashboard's
   setup list says so. Not a secret: the helper only answers approved
   coaches, and the AI key lives on Cloudflare, never here.
========================================== */

export const AI_HELPER_URL = "REPLACE_WITH_YOUR_WORKER_URL";

export function isAiConfigured() {
    return /^https:\/\//.test(AI_HELPER_URL);
}
