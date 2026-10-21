// Playbook team: attendance, make-up runs and duty rotation. Pure model (no DOM).
// Players are referenced by roster id (rosterModel.js). First names only live in the roster.

export const MARKS = Object.freeze(["here", "late", "absent", "excused"]);
export const MARK_LABELS = Object.freeze({ here: "Here", late: "Late", absent: "Absent", excused: "Excused" });
export const KINDS = Object.freeze(["practice", "game", "other"]);
export const KIND_LABELS = Object.freeze({ practice: "Practice", game: "Game", other: "Other" });
export const DEFAULT_JOBS = Object.freeze([
    { name: "Carry the balls", count: 1 }, { name: "Set up and pick up cones", count: 2 },
    { name: "Water and first aid bag", count: 1 }, { name: "Goals and bibs", count: 2 }
]);

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const nextId = (prefix, list) => prefix + (1 + Math.max(0, ...list.map(x => Number(String(x.id).slice(prefix.length)) || 0)));
const uniq = a => [...new Set(a)];

export function emptyTeam() {
    return { penalty: "2 laps", jobs: DEFAULT_JOBS.map((j, i) => ({ id: "j" + (i + 1), ...j })), sessions: [], runs: [] };
}

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---- sessions ----
export function findSession(team, date, kind) { return team.sessions.find(s => s.date === date && s.kind === kind) || null; }
export function openSession(team, date, kind = "practice") {
    if (!isDate(date) || !KINDS.includes(kind)) return { team, id: null };
    const have = findSession(team, date, kind);
    if (have) return { team, id: have.id };
    const id = nextId("s", team.sessions);
    const sessions = [...team.sessions, { id, date, kind, label: "", marks: {}, duty: {}, captain: "" }].slice(-400);
    return { team: { ...team, sessions }, id };
}
export const sortedSessions = team => [...team.sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
export function deleteSession(team, sid) {
    return { ...team, sessions: team.sessions.filter(s => s.id !== sid), runs: team.runs.filter(r => r.sid !== sid) };
}
export function setLabel(team, sid, label) { return mapSession(team, sid, s => ({ ...s, label: str(label, 40) })); }
const mapSession = (team, sid, fn) => ({ ...team, sessions: team.sessions.map(s => (s.id === sid ? fn(s) : s)) });

// ---- attendance, and the runs it creates ----
// Absent (not excused) owes a make-up run. Changing the mark removes a run that was not run yet.
export function setMark(team, sid, rid, mark) {
    const s = team.sessions.find(x => x.id === sid);
    if (!s || !rid) return team;
    const next = mark && MARKS.includes(mark) ? mark : null;
    let t = mapSession(team, sid, x => {
        const marks = { ...x.marks };
        if (next) marks[rid] = next; else delete marks[rid];
        return { ...x, marks };
    });
    const has = t.runs.find(r => r.sid === sid && r.rid === rid);
    if (next === "absent" && !has) t = { ...t, runs: [...t.runs, { id: nextId("x", t.runs), rid, sid, owed: t.penalty, done: false, doneAt: 0 }] };
    if (next !== "absent" && has && !has.done) t = { ...t, runs: t.runs.filter(r => r !== has) };
    return t;
}
export function markAll(team, sid, rids, mark, onlyUnmarked = true) {
    let t = team;
    const s = team.sessions.find(x => x.id === sid);
    if (!s) return team;
    for (const rid of rids) if (!onlyUnmarked || !s.marks[rid]) t = setMark(t, sid, rid, mark);
    return t;
}
export function counts(team, sid) {
    const out = { here: 0, late: 0, absent: 0, excused: 0 };
    const s = team.sessions.find(x => x.id === sid);
    for (const m of Object.values(s?.marks || {})) if (m in out) out[m]++;
    return out;
}

export function setPenalty(team, text) { return { ...team, penalty: str(text, 40) || "2 laps" }; }
export function setRunDone(team, runId, done, now = Date.now()) {
    return { ...team, runs: team.runs.map(r => (r.id === runId ? { ...r, done: Boolean(done), doneAt: done ? now : 0 } : r)) };
}
export function setRunText(team, runId, owed) { return { ...team, runs: team.runs.map(r => (r.id === runId ? { ...r, owed: str(owed, 40) || r.owed } : r)) }; }
export const pendingRuns = team => team.runs.filter(r => !r.done);
export function runsByPlayer(team) {
    const m = new Map();
    for (const r of pendingRuns(team)) m.set(r.rid, [...(m.get(r.rid) || []), r]);
    return m;
}

// ---- season numbers ----
// Excused days don't count against anyone. Late counts as attended.
export function attendance(team, rid) {
    let here = 0, late = 0, absent = 0, excused = 0;
    for (const s of team.sessions) {
        const m = s.marks[rid];
        if (m === "here") here++; else if (m === "late") late++; else if (m === "absent") absent++; else if (m === "excused") excused++;
    }
    const counted = here + late + absent;
    // Misses in a row, newest first; excused and unmarked days don't break or add to it.
    let streak = 0;
    for (const s of [...team.sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))) {
        const m = s.marks[rid];
        if (m === "absent") streak++; else if (m === "here" || m === "late") break;
    }
    return { here, late, absent, excused, counted, streak, pct: counted ? Math.round(((here + late) / counted) * 100) : null };
}
// Who is worth a word: two misses in a row, or under 75% after at least four counted days.
export function needsAttention(team, roster) {
    return roster.map(p => ({ p, a: attendance(team, p.id) })).filter(({ a }) => a.streak >= 2 || (a.counted >= 4 && a.pct < 75));
}

// ---- captain of the day ----
export const setCaptain = (team, sid, rid) => mapSession(team, sid, s => ({ ...s, captain: rid || "" }));
export function suggestCaptain(team, sid, roster) {
    const s = team.sessions.find(x => x.id === sid);
    if (!s) return team;
    const marked = Object.keys(s.marks).length > 0;
    const pool = roster.filter(p => (marked ? s.marks[p.id] === "here" || s.marks[p.id] === "late" : p.here));
    const n = new Map(), last = new Map();
    for (const o of team.sessions) if (o.id !== sid && o.captain) { n.set(o.captain, (n.get(o.captain) || 0) + 1); if (o.date > (last.get(o.captain) || "")) last.set(o.captain, o.date); }
    const pick = [...pool].sort((a, b) => (n.get(a.id) || 0) - (n.get(b.id) || 0) || (last.get(a.id) || "").localeCompare(last.get(b.id) || "") || pool.indexOf(a) - pool.indexOf(b))[0];
    return pick ? setCaptain(team, sid, pick.id) : team;
}
export const captainCount = (team, rid) => team.sessions.filter(s => s.captain === rid).length;

// ---- parent contacts: kept on this device only (never synced) ----
export function setContact(map, rid, parent, phone) {
    const next = { ...map };
    const p = str(parent, 40), ph = str(phone, 24);
    if (!p && !ph) delete next[rid]; else next[rid] = { parent: p, phone: ph };
    return next;
}
export const serializeContacts = map => JSON.stringify({ app: "playbook-contacts", v: 1, contacts: map });
export function parseContacts(text) {
    try {
        const o = JSON.parse(text);
        if (!o || o.app !== "playbook-contacts" || !o.contacts || typeof o.contacts !== "object") return {};
        const out = {};
        for (const [rid, c] of Object.entries(o.contacts)) if (c && (str(c.parent, 40) || str(c.phone, 24))) out[String(rid).slice(0, 20)] = { parent: str(c.parent, 40), phone: str(c.phone, 24) };
        return out;
    } catch { return {}; }
}
// A phone number as a tel:/sms: link; null when it doesn't look like one.
export const phoneHref = (scheme, phone) => { const d = String(phone || "").replace(/[^\d+]/g, ""); return d.replace(/\D/g, "").length >= 7 ? `${scheme}:${d}` : null; };

// ---- duty ----
export function addJob(team, name, count = 1) {
    const n = str(name, 40);
    if (!n || team.jobs.some(j => j.name.toLowerCase() === n.toLowerCase())) return team;
    return { ...team, jobs: [...team.jobs, { id: nextId("j", team.jobs), name: n, count: clampCount(count) }].slice(0, 12) };
}
const clampCount = c => Math.min(6, Math.max(1, Math.round(Number(c)) || 1));
export function removeJob(team, jid) {
    return { ...team, jobs: team.jobs.filter(j => j.id !== jid), sessions: team.sessions.map(s => { const duty = { ...s.duty }; delete duty[jid]; return { ...s, duty }; }) };
}
export function setJob(team, jid, patch) {
    return { ...team, jobs: team.jobs.map(j => (j.id === jid ? { ...j, name: str(patch.name ?? j.name, 40) || j.name, count: clampCount(patch.count ?? j.count) } : j)) };
}
export function setDuty(team, sid, jid, rids) {
    return mapSession(team, sid, s => ({ ...s, duty: { ...s.duty, [jid]: uniq(rids).slice(0, 6) } }));
}
// How often each player has had a job on other days (this job, then any job).
function dutyHistory(team, sid) {
    const byJob = new Map(), any = new Map(), last = new Map();
    for (const s of team.sessions) {
        if (s.id === sid) continue;
        for (const [jid, rids] of Object.entries(s.duty || {})) for (const rid of rids) {
            const k = jid + "|" + rid;
            byJob.set(k, (byJob.get(k) || 0) + 1);
            any.set(rid, (any.get(rid) || 0) + 1);
            if (s.date > (last.get(rid) || "")) last.set(rid, s.date);
        }
    }
    return { byJob, any, last };
}
// Fair next-up: from the players who came, whoever has done this job the least, then any job the least,
// then whoever went longest ago. One player doesn't get two jobs the same day unless there aren't enough.
export function suggestDuty(team, sid, roster, { keep = false } = {}) {
    const s = team.sessions.find(x => x.id === sid);
    if (!s) return team;
    const hist = dutyHistory(team, sid);
    const marked = Object.keys(s.marks).length > 0;
    const pool = roster.filter(p => (marked ? s.marks[p.id] === "here" || s.marks[p.id] === "late" : p.here));
    const used = new Set();
    let t = team;
    const duty = { ...s.duty };
    for (const job of team.jobs) {
        if (keep && (duty[job.id] || []).length) { (duty[job.id]).forEach(r => used.add(r)); continue; }
        const picks = [];
        for (let n = 0; n < job.count; n++) {
            const cands = pool.filter(p => !picks.includes(p.id));
            const fresh = cands.filter(p => !used.has(p.id));
            const from = fresh.length ? fresh : cands;
            from.sort((a, b) =>
                (hist.byJob.get(job.id + "|" + a.id) || 0) - (hist.byJob.get(job.id + "|" + b.id) || 0) ||
                (hist.any.get(a.id) || 0) - (hist.any.get(b.id) || 0) ||
                (hist.last.get(a.id) || "").localeCompare(hist.last.get(b.id) || "") ||
                pool.indexOf(a) - pool.indexOf(b));
            if (!from.length) break;
            picks.push(from[0].id); used.add(from[0].id);
        }
        duty[job.id] = picks;
    }
    return mapSession(t, sid, x => ({ ...x, duty }));
}

// ---- save / load ----
export const serializeTeam = team => JSON.stringify({ app: "playbook-team", v: 1, ...team });

export function parseTeam(text) {
    let o;
    try { o = JSON.parse(text); } catch { return null; }
    if (!o || o.app !== "playbook-team") return null;
    const base = emptyTeam();
    const jobs = [], jseen = new Set();
    for (const j of Array.isArray(o.jobs) ? o.jobs.slice(0, 12) : []) {
        const name = str(j?.name, 40);
        if (!name) continue;
        const id = typeof j.id === "string" && /^j\d+$/.test(j.id) && !jseen.has(j.id) ? j.id : nextId("j", [...jobs, { id: "j0" }]);
        jseen.add(id); jobs.push({ id, name, count: clampCount(j.count) });
    }
    const sessions = [], sseen = new Set();
    for (const s of Array.isArray(o.sessions) ? o.sessions.slice(-400) : []) {
        if (!s || !isDate(s.date) || !KINDS.includes(s.kind)) continue;
        if (sessions.some(x => x.date === s.date && x.kind === s.kind)) continue;
        const id = typeof s.id === "string" && /^s\d+$/.test(s.id) && !sseen.has(s.id) ? s.id : nextId("s", sessions);
        sseen.add(id);
        const marks = {};
        for (const [rid, m] of Object.entries(s.marks && typeof s.marks === "object" ? s.marks : {})) if (MARKS.includes(m)) marks[String(rid).slice(0, 20)] = m;
        const duty = {};
        for (const [jid, rids] of Object.entries(s.duty && typeof s.duty === "object" ? s.duty : {})) if (Array.isArray(rids)) duty[jid] = uniq(rids.filter(r => typeof r === "string")).slice(0, 6);
        sessions.push({ id, date: s.date, kind: s.kind, label: str(s.label, 40), marks, duty, captain: typeof s.captain === "string" ? s.captain.slice(0, 20) : "" });
    }
    const ids = new Set(sessions.map(s => s.id));
    const runs = [], rseen = new Set();
    for (const r of Array.isArray(o.runs) ? o.runs.slice(-2000) : []) {
        if (!r || !ids.has(r.sid) || typeof r.rid !== "string") continue;
        const id = typeof r.id === "string" && /^x\d+$/.test(r.id) && !rseen.has(r.id) ? r.id : nextId("x", [...runs, { id: "x0" }]);
        rseen.add(id);
        runs.push({ id, rid: r.rid.slice(0, 20), sid: r.sid, owed: str(r.owed, 40) || "2 laps", done: r.done === true, doneAt: Number(r.doneAt) || 0 });
    }
    return { penalty: str(o.penalty, 40) || base.penalty, jobs: jobs.length ? jobs : (Array.isArray(o.jobs) ? [] : base.jobs), sessions, runs };
}
export const loadTeam = text => (text ? parseTeam(text) : null) || emptyTeam();
