// Share button behaviour shared by the board and the practice planner.
import { shareUrl } from "./shareModel.js";

export async function shareLink(token, { title, text, copied = "Link copied. Player names are left off." }, toast) {
    const url = shareUrl(location.origin, token);
    if (navigator.share) {
        try { await navigator.share({ title, text, url }); return; }
        catch (e) { if (e && e.name === "AbortError") return; /* otherwise fall back to copying */ }
    }
    try {
        await navigator.clipboard.writeText(url);
        toast(copied);
    } catch {
        const { sbAlert } = await import("../ui.js");
        await sbAlert(url, { title: "Copy this link" });
    }
}

// Coach only: post a shared plan to one linked client's "From your coach" feed.
export async function sendToClient(token, { title }, toast) {
    const url = shareUrl(location.origin, token);
    let links = [];
    try { links = (await (await import("../coachAccess.js")).listMyClients()).filter(l => l.clientUid); }
    catch { return toast("Couldn't reach your clients. Check your connection."); }
    const { sbAlert } = await import("../ui.js");
    if (!links.length) return sbAlert("Link a client first (My Clients), then you can send them plans.", { title: "No clients yet" });
    const dlg = document.createElement("dialog");
    dlg.className = "pb-dlg dr-dlg";
    const sel = document.createElement("select");
    for (const l of links) sel.add(new Option(l.clientName || "Client", l.clientUid));
    const note = document.createElement("textarea");
    note.rows = 3; note.maxLength = 300; note.placeholder = "Add a line (optional): Try this before Thursday.";
    const h2 = Object.assign(document.createElement("h2"), { textContent: "Send to a client" });
    const l1 = document.createElement("label"); l1.append("Who", sel);
    const l2 = document.createElement("label"); l2.append("Message", note);
    const foot = document.createElement("div"); foot.className = "pb-dlg-foot";
    const cancel = Object.assign(document.createElement("button"), { type: "button", className: "pb-btn", textContent: "Cancel" });
    const go = Object.assign(document.createElement("button"), { type: "button", className: "pb-btn pb-primary", textContent: "Send" });
    cancel.onclick = () => dlg.close();
    go.onclick = async () => {
        go.disabled = true;
        try {
            const { sendClientUpdate } = await import("../clientNotes.js");
            const link = links.find(l => l.clientUid === sel.value);
            const text = [note.value.trim(), title, url].filter(Boolean).join("\n").slice(0, 2000);
            await sendClientUpdate(sel.value, text, { clientName: link?.clientName || "" });
            dlg.close(); toast(`Sent to ${(link?.clientName || "your client").split(" ")[0]}`);
        } catch (err) {
            go.disabled = false;
            const ui = await import("../ui.js");
            ui.toast(ui.friendlyError(err, "send that"), { type: "error" });
        }
    };
    foot.append(cancel, go); dlg.append(h2, l1, l2, foot);
    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
}
