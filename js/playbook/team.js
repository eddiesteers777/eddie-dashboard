import "./shell.js";
import * as T from "./teamModel.js";
import * as R from "./rosterModel.js";
import { KEYS } from "./store.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const readTeam = () => { try { return T.loadTeam(localStorage.getItem(KEYS.team)); } catch { return T.emptyTeam(); } };
const readRoster = () => { try { return R.parseRoster(localStorage.getItem(KEYS.roster) || "") || []; } catch { return []; } };

let team = readTeam(), roster = readRoster();
let day = { date: T.todayKey(), kind: "practice" };
let pickJob = null, contacts = {}, conRid = null;
try { contacts = T.parseContacts(localStorage.getItem(KEYS.contacts) || ""); } catch {}

function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }
function save(next) {
    team = next;
    try { localStorage.setItem(KEYS.team, T.serializeTeam(team)); } catch { toast("Couldn't save on this device"); }
    render();
}
const fmt = d => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const nameOf = rid => roster.find(p => p.id === rid)?.name || "";
const current = () => T.findSession(team, day.date, day.kind);
// A day is only saved once something is marked on it.
function ensure() {
    const s = current();
    if (s) return s.id;
    const r = T.openSession(team, day.date, day.kind);
    team = r.team;
    return r.id;
}

function render() {
    const has = roster.length > 0;
    $("noRoster").hidden = has; $("body").hidden = !has;
    $("print").hidden = $("settings").hidden = !has;
    if (!has) { $("summary").textContent = ""; return; }
    const s = current();
    const c = s ? T.counts(team, s.id) : { here: 0, late: 0, absent: 0, excused: 0 };
    $("date").value = day.date; $("kind").value = day.kind; $("label").value = s ? s.label : "";
    $("summary").textContent = `${T.KIND_LABELS[day.kind]} · ${fmt(day.date)}`;
    $("printTitle").textContent = `${T.KIND_LABELS[day.kind]} · ${fmt(day.date)}${s && s.label ? " · " + s.label : ""}`;
    const unmarked = roster.length - c.here - c.late - c.absent - c.excused;
    $("counts").textContent = [`${c.here} here`, c.late && `${c.late} late`, c.absent && `${c.absent} absent`, c.excused && `${c.excused} excused`, unmarked > 0 && `${unmarked} not marked`].filter(Boolean).join(" · ");

    const past = $("past"); past.replaceChildren(new Option("Choose…", ""));
    for (const x of T.sortedSessions(team)) { const k = T.counts(team, x.id); past.add(new Option(`${fmt(x.date)} · ${T.KIND_LABELS[x.kind]} · ${k.here + k.late} came`, x.id)); }

    const att = $("att"); att.replaceChildren();
    for (const p of roster) {
        const li = h("li", "tm-row");
        const who = h("div", "tm-who"); who.append(h("b", "", p.name), h("small", "", p.num == null ? "" : "#" + p.num));
        const seg = h("div", "tm-seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", `${p.name} attendance`);
        const mark = s ? s.marks[p.id] : null;
        for (const m of T.MARKS) {
            const b = h("button", "tm-m tm-" + m, T.MARK_LABELS[m]); b.type = "button"; b.setAttribute("aria-pressed", String(mark === m));
            b.onclick = () => { const sid = ensure(); save(T.setMark(team, sid, p.id, mark === m ? null : m)); };
            seg.append(b);
        }
        li.append(who, seg); att.append(li);
    }

    const owed = [...T.runsByPlayer(team).entries()].filter(([rid]) => nameOf(rid));
    const runs = $("runs"); runs.replaceChildren();
    $("runsHint").textContent = owed.length ? "" : `Nobody owes a run. Mark a player Absent and they owe: ${team.penalty}.`;
    for (const [rid, list] of owed) for (const r of list) {
        const sess = team.sessions.find(x => x.id === r.sid);
        const li = h("li", "tm-row");
        const who = h("div", "tm-who"); who.append(h("b", "", nameOf(rid)), h("small", "", `${r.owed} · missed ${sess ? fmt(sess.date) + " " + T.KIND_LABELS[sess.kind].toLowerCase() : ""}`));
        const b = h("button", "pb-btn pb-primary", "Ran it"); b.type = "button";
        b.onclick = () => { save(T.setRunDone(team, r.id, true)); toast(`${nameOf(rid)} is square`); };
        li.append(who, b); runs.append(li);
    }

    const duty = $("duty"); duty.replaceChildren();
    {
        const cap = s?.captain && nameOf(s.captain) ? s.captain : "";
        const li = h("li", "tm-row");
        const who = h("div", "tm-who"); who.append(h("b", "", "Captain of the day"), h("small", "", cap ? nameOf(cap) : "Nobody yet"));
        const b = h("button", "pb-btn", "Change"); b.type = "button"; b.onclick = () => openPick("captain");
        li.append(who, b); duty.append(li);
    }
    for (const job of team.jobs) {
        const rids = (s?.duty[job.id] || []).filter(nameOf);
        const li = h("li", "tm-row");
        const who = h("div", "tm-who"); who.append(h("b", "", job.name), h("small", "", rids.length ? rids.map(nameOf).join(", ") : `Nobody yet (${job.count})`));
        const b = h("button", "pb-btn", "Change"); b.type = "button"; b.onclick = () => openPick(job.id);
        li.append(who, b); duty.append(li);
    }
    $("suggest").dataset.arm = "";
    $("suggest").textContent = "Pick who is next";

    const flagged = T.needsAttention(team, roster);
    const fl = $("flags"); fl.hidden = !flagged.length; fl.replaceChildren();
    if (flagged.length) {
        fl.append(h("b", "", "Worth a word"));
        for (const { p, a } of flagged) fl.append(h("span", "", `${p.name}: ${a.streak >= 2 ? a.streak + " misses in a row" : a.pct + "% attendance"}`));
    }
    const season = $("season"); season.replaceChildren();
    const pending = T.runsByPlayer(team);
    for (const p of roster) {
        const a = T.attendance(team, p.id);
        const li = h("li", "tm-row tm-srow");
        const who = h("div", "tm-who"); who.append(h("b", "", p.name), h("small", "", a.counted ? `${a.here + a.late} of ${a.counted} ${a.counted === 1 ? "day" : "days"}${a.excused ? " · " + a.excused + " excused" : ""}${pending.get(p.id) ? " · owes " + pending.get(p.id).length : ""}` : "No days yet"));
        const pct = h("span", "tm-pct", a.pct == null ? "–" : a.pct + "%");
        const cb = h("button", "pb-btn", contacts[p.id] ? "Contact" : "Add contact"); cb.type = "button"; cb.onclick = () => openContact(p.id);
        li.append(who, pct, cb); season.append(li);
    }
}

function openPick(jid) {
    pickJob = jid;
    const job = jid === "captain" ? { name: "Captain of the day" } : team.jobs.find(j => j.id === jid), s = current();
    $("pickTitle").textContent = job.name;
    const box = $("pickList"); box.replaceChildren();
    const have = new Set(jid === "captain" ? [s?.captain].filter(Boolean) : s?.duty[jid] || []);
    for (const p of roster) {
        const lab = h("label", "tm-pickrow"); const c = h("input"); c.type = "checkbox"; c.value = p.id; c.checked = have.has(p.id);
        const m = s?.marks[p.id];
        if (jid === "captain") c.onchange = () => { if (c.checked) box.querySelectorAll("input").forEach(o => { if (o !== c) o.checked = false; }); };
        lab.append(c, h("span", "", p.name + (m === "absent" || m === "excused" ? " (out)" : "")));
        box.append(lab);
    }
    $("pickDlg").showModal();
}
function pickedIds() { return [...$("pickList").querySelectorAll("input:checked")].map(i => i.value); }

function openContact(rid) {
    conRid = rid;
    const c = contacts[rid] || { parent: "", phone: "" };
    $("conTitle").textContent = `${nameOf(rid)}'s family`;
    $("conParent").value = c.parent; $("conPhone").value = c.phone;
    showLinks();
    $("conDlg").showModal();
}
function showLinks() {
    for (const [id, scheme] of [["conCall", "tel"], ["conText", "sms"]]) {
        const href = T.phoneHref(scheme, $("conPhone").value);
        $(id).toggleAttribute("aria-disabled", !href);
        if (href) $(id).setAttribute("href", href); else $(id).removeAttribute("href");
    }
}

function openSettings() {
    $("penalty").value = team.penalty;
    const ul = $("jobs"); ul.replaceChildren();
    for (const j of team.jobs) {
        const li = h("li", "tm-jobrow");
        const n = h("input"); n.value = j.name; n.maxLength = 40; n.setAttribute("aria-label", "Job name");
        const c = h("input"); c.type = "number"; c.min = 1; c.max = 6; c.value = j.count; c.setAttribute("aria-label", "How many players");
        n.onchange = () => save(T.setJob(team, j.id, { name: n.value }));
        c.onchange = () => save(T.setJob(team, j.id, { count: c.value }));
        const d = h("button", "pb-btn", "Remove"); d.type = "button";
        d.onclick = () => { save(T.removeJob(team, j.id)); openSettings(); };
        li.append(n, c, d); ul.append(li);
    }
    if (!$("setDlg").open) $("setDlg").showModal();
}

function wire() {
    for (const k of T.KINDS) $("kind").add(new Option(T.KIND_LABELS[k], k));
    $("date").onchange = e => { if (e.target.value) { day.date = e.target.value; render(); } };
    $("kind").onchange = e => { day.kind = e.target.value; render(); };
    $("past").onchange = e => { const s = team.sessions.find(x => x.id === e.target.value); if (s) { day = { date: s.date, kind: s.kind }; render(); } };
    $("label").onchange = e => { if (!e.target.value.trim() && !current()) return; const sid = ensure(); save(T.setLabel(team, sid, e.target.value)); };
    $("allHere").onclick = () => { const sid = ensure(); save(T.markAll(team, sid, roster.map(p => p.id), "here")); };
    $("toLineup").onclick = () => {
        const s = current();
        if (!s) return toast("Take attendance first");
        const next = roster.map(p => (s.marks[p.id] ? { ...p, here: s.marks[p.id] === "here" || s.marks[p.id] === "late" } : p));
        try { localStorage.setItem(KEYS.roster, R.serializeRoster(next)); roster = next; } catch {}
        toast("Lineup now uses who came");
    };
    $("suggest").onclick = () => {
        const sid = ensure(), s = T.findSession(team, day.date, day.kind); // ensure() first: it may add the day to team
        const filled = team.jobs.every(j => (s.duty[j.id] || []).length) && Boolean(s.captain);
        const b = $("suggest");
        if (filled && b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "Tap again to re-pick all"; setTimeout(() => { b.dataset.arm = ""; b.textContent = "Pick who is next"; }, 3500); return; }
        if (!roster.length) return;
        let next = T.suggestDuty(team, sid, roster, { keep: !filled });
        if (filled || !s.captain) next = T.suggestCaptain(next, sid, roster);
        save(next);
    };
    const setPicked = ids => { const sid = ensure(); save(pickJob === "captain" ? T.setCaptain(team, sid, ids[0] || "") : T.setDuty(team, sid, pickJob, ids)); $("pickDlg").close(); };
    $("pickDone").onclick = () => setPicked(pickedIds());
    $("pickClear").onclick = () => setPicked([]);
    $("settings").onclick = openSettings;
    $("conPhone").oninput = showLinks;
    $("conCancel").onclick = () => $("conDlg").close();
    $("conSave").onclick = () => {
        contacts = T.setContact(contacts, conRid, $("conParent").value, $("conPhone").value);
        try { localStorage.setItem(KEYS.contacts, T.serializeContacts(contacts)); } catch { toast("Couldn't save on this device"); }
        $("conDlg").close(); render(); toast("Saved on this device");
    };
    $("printSeason").onclick = () => {
        document.body.classList.add("tm-print-season");
        window.addEventListener("afterprint", () => document.body.classList.remove("tm-print-season"), { once: true });
        window.print();
    };
    $("setClose").onclick = () => { save(T.setPenalty(team, $("penalty").value)); $("setDlg").close(); };
    $("addJob").onclick = () => {
        const next = T.addJob(team, $("newJob").value, $("newCount").value);
        if (next === team) return toast("Add a new job name");
        $("newJob").value = ""; save(next); openSettings();
    };
    $("print").onclick = () => window.print();
    $("backup").onclick = () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([T.serializeTeam(team)], { type: "application/json" })); a.download = "southbound-playbook-team.json";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast("Backup saved");
    };
    $("restore").onchange = async e => {
        const f = e.target.files[0]; e.target.value = "";
        if (!f) return;
        const t = T.parseTeam(await f.text());
        if (!t) return toast("That isn't a team file");
        $("setDlg").close(); save(t); toast("Restored");
    };
}

wire();
render();
