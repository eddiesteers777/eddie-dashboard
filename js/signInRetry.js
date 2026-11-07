/* ==========================================================
   signInRetry.js -- try a sign-in call again when the network drops it.

   In the iPhone Home Screen app (2026-11-07) Google's window handed back
   its token and the very next call, Firebase's sign-in request, failed
   with auth/network-request-failed in the same second. iOS can drop the
   first request after the app comes back from Google's window. The token
   is still good, so the same call is tried again after a short wait.
   Pure: the call and the wait are passed in, so it is unit-tested.
   ========================================================== */

export const RETRY_WAITS_MS = [900, 1800];

/** Runs `attempt()`; on auth/network-request-failed waits and tries again, up to waits.length more times. */
export async function retryOnNetworkError(attempt, { waits = RETRY_WAITS_MS, wait = ms => new Promise(r => setTimeout(r, ms)), onRetry = () => {} } = {}) {
    for (let i = 0; ; i++) {
        try {
            return await attempt();
        } catch (error) {
            if (error?.code !== "auth/network-request-failed" || i >= waits.length) throw error;
            onRetry(i + 1);
            await wait(waits[i]);
        }
    }
}
