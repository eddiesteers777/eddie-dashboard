/* ==========================================
   Southbound — soccer homework (pure)

   Skills a soccer client practices between sessions. The coach assigns
   one (a title, an optional YouTube link trimmed to a clip, how often,
   a due date); the client logs each practice (a count and how it felt).
   One doc per assignment in `homework`; the practices ride in its `logs`
   list (the client may change only that list). Unit-tested in
   tests/homeworkModel.test.mjs.
========================================== */

export const CADENCES = [
    { value: "once", label: "Once" },
    { value: "weekly", label: "Weekly" },
    { value: "daily", label: "Daily" },
    { value: "goal", label: "Goal" }
];
export const FEELS = [
    { value: "easy", label: "Easy" },
    { value: "okay", label: "Okay" },
    { value: "hard", label: "Hard" }
];
export const SKILLS = ["Weak foot", "First touch", "Passing", "Dribbling", "Finishing", "Scanning", "Juggling", "Fitness"];
export const MAX_LOGS = 200;

// A YouTube video id from the usual link shapes, or "" when it isn't one.
export function parseYouTube(input) {
    const text = String(input || "").trim();
    if (!text) return "";
    let url;
    try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return ""; }
    const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "").toLowerCase();
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/")[1] || "";
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
        if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
        else {
            const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
            if (m) id = m[2];
        }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
}

// "1:10" / "70" / "1:02:03" -> seconds; "" or nonsense -> null.
export function parseClock(input) {
    const text = String(input ?? "").trim();
    if (!text) return null;
    if (!/^\d+(:\d{1,2}){0,2}$/.test(text)) return null;
    const parts = text.split(":").map(Number);
    if (parts.slice(1).some(n => n > 59)) return null;
    return parts.reduce((total, n) => total * 60 + n, 0);
}
export function clockText(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "";
    const s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const two = n => String(n).padStart(2, "0");
    return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

// The embed address (no cookies until played), trimmed to the clip.
export function embedUrl(videoId, startSec = null, endSec = null) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || "")) return "";
    const q = ["rel=0", "playsinline=1", "modestbranding=1"];
    if (Number.isInteger(startSec) && startSec > 0) q.push(`start=${startSec}`);
    if (Number.isInteger(endSec) && endSec > 0) q.push(`end=${endSec}`);
    return `https://www.youtube-nocookie.com/embed/${videoId}?${q.join("&")}`;
}
export const watchUrl = videoId => /^[A-Za-z0-9_-]{11}$/.test(videoId || "") ? `https://www.youtube.com/watch?v=${videoId}` : "";
export const thumbUrl = videoId => /^[A-Za-z0-9_-]{11}$/.test(videoId || "") ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";

// ---- dates (local YYYY-MM-DD, as the rest of the app) ----
const pad = n => String(n).padStart(2, "0");
export const isoOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parse = iso => { const [y, m, d] = String(iso).split("-").map(Number); return new Date(y, m - 1, d); };
export function addDays(iso, n) { const d = parse(iso); d.setDate(d.getDate() + n); return isoOf(d); }
export function weekStart(iso) { const d = parse(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoOf(d); } // Monday

// ---- progress ----
const logDays = hw => new Set((hw.logs || []).map(l => l.date));

// What "done" means this week, for the assignment's cadence.
export function targetPerWeek(hw) {
    if (hw.cadence === "daily") return 7;
    if (hw.cadence === "weekly") return Math.min(7, Math.max(1, hw.timesPerWeek || 1));
    return 1;
}

export function progress(hw, today) {
    const logs = hw.logs || [];
    const total = logs.length;
    if (hw.cadence === "goal") {
        const best = logs.reduce((m, l) => Math.max(m, Number(l.count) || 0), 0);
        const goal = hw.goal || 0;
        return { kind: "goal", done: best, target: goal, complete: goal > 0 && best >= goal, today: logs.some(l => l.date === today), label: goal ? `Best ${best} · goal ${goal}` : `Best ${best}` };
    }
    if (hw.cadence === "once") {
        return { kind: "once", done: total ? 1 : 0, target: 1, complete: total > 0, today: logs.some(l => l.date === today), label: total ? "Done" : "Not yet" };
    }
    const start = weekStart(today), end = addDays(start, 6);
    const thisWeek = new Set((hw.logs || []).filter(l => l.date >= start && l.date <= end).map(l => l.date)).size;
    const target = targetPerWeek(hw);
    return { kind: "week", done: thisWeek, target, complete: thisWeek >= target, today: logDays(hw).has(today), label: `${thisWeek} of ${target} this week` };
}

// "ahead" / "on-track" / "behind" / "done" / "overdue" for the coach's list.
export function standing(hw, today) {
    if (hw.status === "archived") return "archived";
    const p = progress(hw, today);
    if (p.complete) return "done";
    if (hw.dueDate && hw.dueDate < today && hw.cadence === "once") return "overdue";
    if (p.kind === "week" && hw.cadence !== "once") {
        const dayOfWeek = ((parse(today).getDay() + 6) % 7) + 1; // Mon=1..Sun=7
        const expected = Math.floor(p.target * dayOfWeek / 7);
        return p.done >= expected ? "on-track" : "behind";
    }
    if (hw.dueDate && hw.dueDate < today) return "overdue";
    return "on-track";
}

export const STANDING_LABEL = { done: "Done", "on-track": "On track", behind: "Behind", overdue: "Overdue", archived: "Archived" };

// A consecutive-days streak ending today or yesterday, across all assignments.
export function streak(list, today) {
    const days = new Set();
    (list || []).forEach(hw => (hw.logs || []).forEach(l => days.add(l.date)));
    let cursor = days.has(today) ? today : addDays(today, -1);
    let n = 0;
    while (days.has(cursor)) { n++; cursor = addDays(cursor, -1); }
    return n;
}

// Newest practice across the list, for "came in" on the coach's dashboard.
export function recentPractices(list, sinceMs) {
    const out = [];
    (list || []).forEach(hw => (hw.logs || []).forEach(l => {
        if ((l.at || 0) >= sinceMs) out.push({ hw, log: l });
    }));
    return out.sort((a, b) => (b.log.at || 0) - (a.log.at || 0));
}

// "3× a week" / "Daily" / "Once" / "Goal 50".
export function cadenceText(hw) {
    if (hw.cadence === "daily") return "Daily";
    if (hw.cadence === "weekly") return `${targetPerWeek(hw)}× a week`;
    if (hw.cadence === "goal") return hw.goal ? `Goal ${hw.goal}` : "Goal";
    return "Once";
}

// ---- cleaning what the coach typed ----
const text = (v, max) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);

export function cleanAssignment(input = {}) {
    const videoId = parseYouTube(input.videoUrl || "") || (/^[A-Za-z0-9_-]{11}$/.test(input.videoId || "") ? input.videoId : "");
    let start = Number.isInteger(input.startSec) ? input.startSec : null;
    let end = Number.isInteger(input.endSec) ? input.endSec : null;
    if (!videoId || start == null || start < 0) start = null;
    if (!videoId || end == null || end <= (start || 0)) end = null;
    const cadence = CADENCES.some(c => c.value === input.cadence) ? input.cadence : "once";
    const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
    return {
        title: text(input.title, 100),
        skill: text(input.skill, 40),
        note: text(input.note, 1000),
        videoId, startSec: start, endSec: end,
        cadence,
        timesPerWeek: cadence === "weekly" ? (int(input.timesPerWeek, 1, 7) || 3) : null,
        minutes: int(input.minutes, 1, 240),
        goal: cadence === "goal" ? int(input.goal, 1, 100000) : null,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || "") ? input.dueDate : null,
        askClip: input.askClip === true
    };
}

export function validAssignment(a) {
    if (!a.title) return "Give it a title.";
    if (a.cadence === "goal" && !a.goal) return "Set the goal number.";
    return "";
}

export function cleanLog({ date, count = null, feel = "", note = "" } = {}, now = Date.now()) {
    const n = Math.round(Number(count));
    return {
        date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : isoOf(new Date(now)),
        count: Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null,
        feel: FEELS.some(f => f.value === feel) ? feel : "",
        note: text(note, 300),
        at: now
    };
}

// Sort for the client: today's unfinished first, then due soonest, done last.
export function sortForClient(list, today) {
    const rank = hw => { const p = progress(hw, today); return p.complete ? 3 : p.today ? 2 : 1; };
    return [...list].filter(h => h.status !== "archived").sort((a, b) =>
        rank(a) - rank(b) || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")) || (a.createdMs || 0) - (b.createdMs || 0));
}
