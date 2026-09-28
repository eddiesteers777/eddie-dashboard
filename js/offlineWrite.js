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

   await settleWrite(setDoc(...), "Your run") -> { queued: false } saved
                                             -> { queued: true } on this device
   A real refusal while online (e.g. permission-denied) still throws.
========================================== */

const WAIT_MS = 8000;

export async function settleWrite(write, label = "Your change") {
    const report = queued => {
        if (!queued) return;
        write.then(
            () => window.dispatchEvent(new CustomEvent("sb:write-synced", { detail: { label } })),
            error => window.dispatchEvent(new CustomEvent("sb:write-failed", { detail: { label, code: error?.code || "" } }))
        );
    };
    if (navigator.onLine === false) {
        report(true);
        return { queued: true };
    }
    let timer;
    const slow = new Promise(resolve => { timer = setTimeout(() => resolve("slow"), WAIT_MS); });
    try {
        const outcome = await Promise.race([write.then(() => "done"), slow]);
        if (outcome === "slow") {
            report(true);
            return { queued: true };
        }
        return { queued: false };
    } finally {
        clearTimeout(timer);
    }
}

// The line a save shows when it was only kept on the device.
export const QUEUED_NOTE = "Saved on this phone. It'll sync when you're back online.";
