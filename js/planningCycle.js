/* ==========================================
   Southbound — a planning cycle (pure)

   Weekly planning P3 (docs/WEEKLY_PLANNING_AUDIT.md, section 9.3). One
   record per athlete per planned week: the exact Planning Context the
   chatbot saw, every answer pasted back (up to 3), what the coach did
   with each changed day (took it / kept theirs, with an optional
   one-tap reason), and what was approved: Eddie's own plan straight
   away (with Undo), a client's as a draft, then what was published.
   P4 fills in the outcome; P6 learns from the saved cycles.

   Stored in Firestore as planningCycles/{coachUid}_{athleteUid}_{weekOf}
   (athleteUid = the coach's own uid for his own training), coach only.
   The big parts are JSON strings so the rules can cap their size:
   context ≤ 60,000, proposals ≤ 80,000, review / approved ≤ 20,000,
   outcome ≤ 40,000 characters (CAPS).

   cycleId, newCycle, withContext, withProposal, withApproval, withUndo,
   withPublished, toDoc / fromDoc, cycleSummary, REASONS
   Unit-tested in tests/planningCycle.test.mjs.
========================================== */

import { dayLine } from "./planPrompt.js";

export const CYCLE_VERSION = 1;
export const CAPS = { context: 60000, proposals: 80000, review: 20000, approved: 20000, outcome: 40000 };
export const KEEP_PROPOSALS = 3;

/** Why the coach kept their own day (or changed the chatbot's): one tap, optional. */
export const REASONS = [
    { key: "load", label: "Recent load" },
    { key: "schedule", label: "Schedule / travel" },
    { key: "preference", label: "Athlete preference" },
    { key: "pain", label: "Injury or pain" },
    { key: "disagree", label: "I disagree with the evidence" },
    { key: "race", label: "Race or event" },
    { key: "other", label: "Other" }
];
const REASON_KEYS = new Set(REASONS.map(r => r.key));

const clip = (s, n) => String(s ?? "").slice(0, n);

/** "coach_athlete_2026-10-12" */
export const cycleId = (coachUid, athleteUid, weekOf) => `${coachUid}_${athleteUid}_${weekOf}`;

/** A short, stable fingerprint of a string (FNV-1a, hex): which context a proposal answered. */
export function hashText(text) {
    let h = 0x811c9dc5;
    const s = String(text ?? "");
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

export function newCycle({ coachUid, athleteUid, from, to }) {
    return {
        id: cycleId(coachUid, athleteUid, from),
        coachUid, athleteUid, weekOf: from, weekTo: to, version: CYCLE_VERSION,
        status: "open", context: null, contextHash: "", proposals: [], review: [], approved: null, outcome: null
    };
}

// A context too big for the cap loses the facts' basis lines first, then the plan lines.
function fitContext(context) {
    let text = JSON.stringify(context);
    if (text.length <= CAPS.context) return context;
    const lean = { ...context, sections: context.sections.map(s => ({ ...s, facts: s.facts.map(f => ({ ...f, basis: [] })) })) };
    text = JSON.stringify(lean);
    if (text.length <= CAPS.context) return lean;
    return { ...lean, plan: { lines: [] }, notes: clip(lean.notes, 500), trimmed: true };
}

/** The Planning Context as it was copied (the latest copy wins: it's what the chatbot saw). */
export function withContext(cycle, context, { at = Date.now() } = {}) {
    const fitted = fitContext(context);
    return { ...cycle, context: { ...fitted, savedAt: at }, contextHash: hashText(JSON.stringify(fitted)) };
}

/**
 * A pasted answer, as Southbound read it. read = parseReply's result plus
 * `changed` (the days that would change, each with before / after days).
 * Keeps the newest 3. -> { cycle, proposalId }
 */
export function withProposal(cycle, read, { text = "", at = Date.now(), source = "paste" } = {}) {
    const id = `a${at.toString(36)}`;
    const proposal = {
        id, source, at, contextHash: cycle.contextHash || "",
        text: clip(text, 12000),
        days: (read.changed || []).map(d => ({
            date: d.date,
            was: d.before ? dayLine(d.before) : "",
            line: d.after ? dayLine(d.after) : "",
            note: clip(d.note, 300),
            why: clip(read.why?.[d.date], 300)
        })),
        same: (read.same || 0) + Math.max(0, (read.days?.length || 0) - (read.changed?.length || 0)),
        skipped: (read.skipped || []).length,
        unread: (read.unread || []).length,
        problems: (read.problems || []).slice(0, 10).map(p => ({ date: p.date, why: clip(p.why, 200) }))
    };
    return { cycle: { ...cycle, proposals: [...(cycle.proposals || []), proposal].slice(-KEEP_PROPOSALS) }, proposalId: id };
}

/**
 * The coach's call on each changed day, and what was approved.
 *   taken:   Set of dates applied
 *   reasons: { date: { key, words } } (optional, any day)
 *   planRef: { store: "self", logId } | { store: "coachingPlans", planId, draft: true }
 */
export function withApproval(cycle, { proposalId, taken, reasons = {}, planRef, at = Date.now() }) {
    const proposal = (cycle.proposals || []).find(p => p.id === proposalId) || (cycle.proposals || []).at(-1);
    const days = proposal?.days || [];
    const review = days.map(d => {
        const r = taken.has(d.date) ? null : reasons[d.date];
        const key = r && REASON_KEYS.has(r.key) ? r.key : "";
        return {
            date: d.date, proposalId: proposal.id,
            action: taken.has(d.date) ? "accepted" : "kept-mine",
            ...(key ? { reason: key } : {}),
            ...(key === "other" && r.words ? { words: clip(r.words, 200) } : {})
        };
    });
    const approvedDays = days.filter(d => taken.has(d.date)).map(d => ({ date: d.date, line: d.line }));
    return {
        ...cycle,
        status: "approved",
        review: [...(cycle.review || []).filter(x => x.proposalId !== proposal?.id), ...review],
        approved: { at, proposalId: proposal?.id || "", planRef, days: approvedDays }
    };
}

/** Eddie's Undo: the record stays (what was approved and then taken back is worth knowing). */
export function withUndo(cycle, { at = Date.now() } = {}) {
    if (!cycle.approved) return cycle;
    return { ...cycle, status: "undone", approved: { ...cycle.approved, undoneAt: at } };
}

/**
 * A client's draft went out: what the published plan says on the approved
 * days (the coach may have edited them after approving).
 */
export function withPublished(cycle, { planId, version, plan, at = Date.now() }) {
    const ref = cycle.approved?.planRef;
    if (!ref || ref.store !== "coachingPlans" || ref.planId !== planId || cycle.approved.published) return cycle;
    const byDate = new Map((plan?.weeks || []).flatMap(w => w.days || []).map(d => [d.date, d]));
    const days = cycle.approved.days.map(d => ({ date: d.date, line: byDate.has(d.date) ? dayLine(byDate.get(d.date)) : "" }));
    const edited = days.filter((d, i) => d.line !== cycle.approved.days[i].line).length;
    return { ...cycle, approved: { ...cycle.approved, published: { at, version, days, edited } } };
}

// ---------- Firestore shape ----------

const fit = (value, cap) => {
    const text = value == null ? "" : JSON.stringify(value);
    return text.length <= cap ? text : "";
};

/** The stored document (without the server's timestamps). */
export function toDoc(cycle) {
    let proposals = [...(cycle.proposals || [])];
    // Too big: drop the oldest answers, then shorten the pasted text.
    while (proposals.length > 1 && JSON.stringify(proposals).length > CAPS.proposals) proposals = proposals.slice(1);
    if (JSON.stringify(proposals).length > CAPS.proposals) proposals = proposals.map(p => ({ ...p, text: clip(p.text, 2000) }));
    return {
        coachUid: cycle.coachUid, athleteUid: cycle.athleteUid,
        weekOf: cycle.weekOf, weekTo: cycle.weekTo, version: CYCLE_VERSION, status: cycle.status,
        contextHash: clip(cycle.contextHash, 16),
        context: fit(cycle.context, CAPS.context),
        proposals: fit(proposals, CAPS.proposals),
        review: fit(cycle.review || [], CAPS.review),
        approved: fit(cycle.approved, CAPS.approved),
        outcome: fit(cycle.outcome, CAPS.outcome)
    };
}

const parse = (text, fallback) => {
    if (!text) return fallback;
    try { return JSON.parse(text); } catch { return fallback; }
};

export function fromDoc(id, d = {}) {
    return {
        id, coachUid: d.coachUid, athleteUid: d.athleteUid, weekOf: d.weekOf, weekTo: d.weekTo,
        version: d.version || CYCLE_VERSION, status: d.status || "open", contextHash: d.contextHash || "",
        context: parse(d.context, null), proposals: parse(d.proposals, []), review: parse(d.review, []),
        approved: parse(d.approved, null), outcome: parse(d.outcome, null),
        createdAt: d.createdAt?.toMillis?.() ?? null, updatedAt: d.updatedAt?.toMillis?.() ?? null
    };
}

/** One line for a history list. */
export function cycleSummary(cycle) {
    const accepted = (cycle.review || []).filter(r => r.action === "accepted").length;
    const kept = (cycle.review || []).filter(r => r.action === "kept-mine").length;
    const reasons = {};
    for (const r of cycle.review || []) if (r.reason) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const reasonWords = Object.entries(reasons).map(([k, n]) => `${REASONS.find(r => r.key === k)?.label.toLowerCase() || k}${n > 1 ? ` ×${n}` : ""}`);
    const pub = cycle.approved?.published;
    const state = cycle.status === "undone" ? "undone"
        : cycle.status === "approved" ? (cycle.approved?.planRef?.store === "coachingPlans" ? (pub ? "published" : "in a draft") : "applied")
        : cycle.proposals?.length ? "answer read, not applied" : "brief copied";
    return {
        weekOf: cycle.weekOf, weekTo: cycle.weekTo, state, accepted, kept, reasons: reasonWords,
        answers: (cycle.proposals || []).length, editedAfter: pub?.edited || 0
    };
}
