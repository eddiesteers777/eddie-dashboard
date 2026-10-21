// Share button behaviour shared by the board and the practice planner.
import { shareUrl } from "./shareModel.js";

export async function shareLink(token, { title, text }, toast) {
    const url = shareUrl(location.origin, token);
    if (navigator.share) {
        try { await navigator.share({ title, text, url }); return; }
        catch (e) { if (e && e.name === "AbortError") return; /* otherwise fall back to copying */ }
    }
    try {
        await navigator.clipboard.writeText(url);
        toast("Link copied. Player names are left off.");
    } catch {
        const { sbAlert } = await import("../ui.js");
        await sbAlert(url, { title: "Copy this link" });
    }
}
