/* ==========================================
   Southbound — parent link: the coach's side (glue)

   Players row "Share with parent" (soccer-coach.html) and the refresh when a
   session summary is sent (soccer-session.html). The private snapshot rules
   are in js/parentLink.js and firestore.rules (parentLinks).
========================================== */

import { listMyParentLinks, saveParentLink, deleteParentLink, newToken, snapshotForPlayer, parentUrl, shareMessage } from "./parentLink.js";
import { sbChoose, sbPrompt, toast, friendlyError } from "./ui.js";

const today = () => new Date().toLocaleDateString("en-CA");
const baseUrl = () => new URL("./", location.href).href;

// Rebuild the snapshot of every player in `uids` that already has a link (quietly; never blocks a send).
export async function refreshParentLinks({ coachUid, coachName, uids, names = new Map(), requests, homework }) {
    try {
        const links = (await listMyParentLinks(coachUid)).filter(l => uids.includes(l.clientUid));
        await Promise.all(links.map(l => saveParentLink(l.token, snapshotForPlayer({
            clientUid: l.clientUid, coachUid, playerName: names.get(l.clientUid) || l.firstName, coachName, requests, homework, today: today()
        }))));
    } catch (error) { console.warn("Southbound: parent links not refreshed.", error?.code || error); }
}

async function copy(url) {
    try { await navigator.clipboard.writeText(url); toast("Link copied"); }
    catch { await sbPrompt("Copy this link", { title: "Parent link", defaultValue: url, confirmLabel: "Done" }).catch(() => {}); }
}

async function send(snapshot, url) {
    const text = shareMessage(snapshot, url);
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e?.name === "AbortError") return; } }
    location.href = `mailto:?subject=${encodeURIComponent(`${snapshot.firstName}'s soccer update`)}&body=${encodeURIComponent(text)}`;
}

// ctx: { coachUid, coachName, uid, name, requests, homework }
export async function shareWithParent(ctx) {
    const build = () => snapshotForPlayer({ clientUid: ctx.uid, coachUid: ctx.coachUid, playerName: ctx.name, coachName: ctx.coachName, requests: ctx.requests, homework: ctx.homework, today: today() });
    try {
        const first = ctx.name.split(" ")[0];
        const existing = (await listMyParentLinks(ctx.coachUid)).find(l => l.clientUid === ctx.uid);
        if (!existing) {
            const pick = await sbChoose(`Anyone with the link can read ${first}'s first name, the last session summary and open homework. Nothing else. You can turn it off any time.`, {
                title: "Share with parent",
                choices: [{ value: "make", label: "Create the link", primary: true }]
            });
            if (pick !== "make") return null;
            const token = newToken();
            const snap = build();
            await saveParentLink(token, snap);
            const url = parentUrl(token, baseUrl());
            await copy(url);
            return { token, created: true };
        }
        const url = parentUrl(existing.token, baseUrl());
        const pick = await sbChoose(`The parent link for ${first} is on. Anyone with it can read ${first}'s update.`, {
            title: "Parent link",
            choices: [
                { value: "copy", label: "Copy link", primary: true },
                { value: "send", label: "Send to parent" },
                { value: "refresh", label: "Update it now" },
                { value: "new", label: "New link (the old one stops)" },
                { value: "off", label: "Turn it off" }
            ]
        });
        if (pick === "copy") await copy(url);
        else if (pick === "send") await send(existing, url);
        else if (pick === "refresh") { await saveParentLink(existing.token, build()); toast("Updated"); }
        else if (pick === "new") { const token = newToken(); await saveParentLink(token, build()); await deleteParentLink(existing.token); await copy(parentUrl(token, baseUrl())); }
        else if (pick === "off") { await deleteParentLink(existing.token); toast("Parent link turned off"); }
        return { token: existing.token };
    } catch (error) {
        console.error(error);
        toast(friendlyError(error, "update the parent link"), { type: "error" });
        return null;
    }
}
