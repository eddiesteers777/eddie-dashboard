/* ==========================================
   EddieOS — COROS Freshness

   Pages that passively read the cached COROS
   snapshot (Dashboard, Weekly Review) shouldn't
   just show a number as if it's live -- if COROS's
   own servers have been unreliable (confirmed: they
   sometimes are), a stale number should say so
   instead of quietly implying it's current.
========================================== */

/**
 * Turns a snapshot's fetchedAt timestamp into a short,
 * honest description of how fresh that data actually is.
 */
export function describeCorosFreshness(fetchedAt) {
    if (!fetchedAt) {
        return "Latest COROS reading";
    }

    const ageMs = Date.now() - fetchedAt;
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours < 0) {
        return "Latest COROS reading";
    }

    if (ageHours < 3) {
        return "Synced recently";
    }

    if (ageHours < 24) {
        return `Synced ${Math.round(ageHours)}h ago`;
    }

    const ageDays = Math.round(ageHours / 24);
    return `Synced ${ageDays}d ago — may be outdated`;
}

/**
 * True once a snapshot is old enough that showing its number
 * without any caveat would be actively misleading.
 */
export function isCorosStale(fetchedAt) {
    if (!fetchedAt) {
        return false;
    }

    return (Date.now() - fetchedAt) > 24 * 60 * 60 * 1000;
}
