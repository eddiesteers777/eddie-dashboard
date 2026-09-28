/* ==========================================
   Southbound — writes that don't wait for a connection

   Firestore keeps writes on this device (js/firebase.js: the persistent
   cache) and sends them when the connection comes back, even after the
   app was closed. A write's promise only settles when the server has it,
   so awaiting one offline would leave a "Saving…" button spinning. This
   settles it early instead: offline (or no answer within a few seconds
   on a bad connection) counts as saved on the device and pending sync.
   The Firestore queue sends it exactly once (the doc IDs are fixed, so a
   retry lands on the same record). When the server finally answers,
   "sb:write-synced" / "sb:write-failed" go out for the offline indicator
   (js/netStatus.js), which tells the person.

   await settleWrite(setDoc(ref, ...), "Your run", ref) -> { queued: false } saved
                                             -> { queued: true } on this device
   A real refusal while online (e.g. permission-denied) still throws.
========================================== */

const WAIT_MS = 8000;

// Firestore runs its work in order, so a read from the device copy queued
// right after a write only finishes once that write is stored on the
// device. Without this wait, a write made on a page opened offline could
// be lost if the app was closed straight away (2026-09-28).
async function storedOnDevice(ref) {
    if (!ref) return;
    try {
        const { getDocFromCache } = await import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js");
        await Promise.race([getDocFromCache(ref).catch(() => null), new Promise(resolve => setTimeout(resolve, 3000))]);
    } catch { /* best effort */ }
}

export async function settleWrite(write, label = "Your change", ref = null) {
    const report = queued => {
        if (!queued) return;
        write.then(
            () => window.dispatchEvent(new CustomEvent("sb:write-synced", { detail: { label } })),
            error => window.dispatchEvent(new CustomEvent("sb:write-failed", { detail: { label, code: error?.code || "" } }))
        );
    };
    if (navigator.onLine === false) {
        report(true);
        await storedOnDevice(ref);
        return { queued: true };
    }
    let timer;
    const slow = new Promise(resolve => { timer = setTimeout(() => resolve("slow"), WAIT_MS); });
    try {
        const outcome = await Promise.race([write.then(() => "done"), slow]);
        if (outcome === "slow") {
            report(true);
            await storedOnDevice(ref);
            return { queued: true };
        }
        return { queued: false };
    } finally {
        clearTimeout(timer);
    }
}

// The line a save shows when it was only kept on the device.
export const QUEUED_NOTE = "Saved on this phone. It'll sync when you're back online.";
