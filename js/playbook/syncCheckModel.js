// Southbound Playbook: the words for the opt-in sync check (?pbcheck). Pure: no browser here.
// It compares three copies of the roster: on this device, at the last sync, and in the account.
import { parseRoster } from "./rosterModel.js";

const count = text => {
    if (text == null) return null;
    const list = parseRoster(text);
    return list ? list.length : "unreadable";
};
const players = n => (n == null ? "none saved" : n === "unreadable" ? "saved but unreadable" : `${n} player${n === 1 ? "" : "s"}`);
const when = ms => (ms ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "unknown");

// info: { signedIn, linked: "yes"|"no"|"other", state, local, snapshot, remote: { v, at }|undefined,
//         read: { ok, error, ms, hadDoc }|null, changed: [keys] }
export function describeCheck(info) {
    const lines = [];
    lines.push(["Signed in", info.signedIn ? "yes" : "no"]);
    lines.push(["Linked to this account", { yes: "yes", no: "not yet", other: "another account" }[info.linked] || "unknown"]);
    lines.push(["Sync line says", info.state || "unknown"]);
    const r = info.read;
    lines.push(["Last account read", !r ? "not tried" : r.ok ? `worked in ${r.ms} ms${r.hadDoc ? "" : " (no Playbook doc found)"}` : `failed: ${r.error || "no reason given"}`]);
    const onDevice = count(info.local), atSync = count(info.snapshot), inAccount = info.remote ? count(info.remote.v) : null;
    lines.push(["Roster on this phone", players(onDevice)]);
    lines.push(["Roster at last sync", players(atSync)]);
    lines.push(["Roster in your account", r && r.ok ? `${players(inAccount)}${info.remote ? `, saved ${when(info.remote.at)}` : ""}` : "couldn't read"]);
    lines.push(["Changed here, not sent yet", info.changed && info.changed.length ? info.changed.join(", ") : "nothing"]);
    // The one case worth a button: the account has players and this phone shows fewer.
    const canLoad = Boolean(r && r.ok && typeof inAccount === "number" && inAccount > 0 && (typeof onDevice !== "number" || onDevice < inAccount));
    return { lines, canLoad, inAccount };
}
