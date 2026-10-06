/* ==========================================
   Southbound — the Planning Brief and the chatbot prompt (pure)

   Weekly planning P2 (docs/WEEKLY_PLANNING_AUDIT.md, section 8.2). From
   the Planning Context (js/planningContext.js):

   planningBrief(context)   about one screen of plain text answering eight
                            questions: where they are, what we're trying to
                            do, what happened, how they're responding, the
                            current constraint, the priority (Southbound's
                            reading; the coach decides), what to be careful
                            about, and what's missing. No "safe" / "unsafe",
                            no injury prediction, readiness is "a rough
                            guide", one metric never decides alone.
   chatbotPrompt(context, { runsOnly, paces })
                            the brief + Southbound's facts with kind and
                            confidence + the coach's notes + the week as it
                            stands, one line a day, + the rules + the answer
                            format the paste-back reads (js/planPrompt.js
                            answerFormatLines, the same as the Client Hub's
                            Copy chatbot prompt). Works with any chatbot.
   Unit-tested in tests/planningContext.test.mjs.
========================================== */

import { factLines } from "./planningContext.js";
import { answerFormatLines, strengthLibraryLine } from "./planPrompt.js";

const short = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fact = (context, path) => {
    for (const sec of context.sections) for (const f of sec.facts) if (f.path === path) return f;
    return null;
};
const join = parts => parts.filter(Boolean).join(" ");
const sentence = text => (text && !/[.!?]$/.test(text) ? `${text}.` : text || "");

/** The eight questions, one short paragraph each. */
export function briefSections(context) {
    const f = path => fact(context, path);
    const who = context.athlete.who === "self" ? "You" : (context.athlete.firstName || "They");
    const top = context.priorities[0] || null;
    const conf = x => (x ? ` (${x.confidence} confidence)` : "");
    // "Steady: … been." + "(low confidence)" -> "Steady: … been (low confidence)."
    const withConf = (text, x) => `${String(text).replace(/\.$/, "")}${conf(x)}`;

    const race = f("goals.targetRace"), goal = f("goals.goalTime"), days = f("goals.daysToRace"), phase = f("goals.phase");
    const pred = f("fitness.raceTime"), coros = f("fitness.coros");
    const where = race
        ? join([sentence(`${race.value}${days ? `, ${days.value} away` : ""}${goal ? `, goal ${goal.value}` : ""}`),
            pred ? sentence(`Southbound predicts ${withConf(pred.value, pred)}${pred.basis[0] ? `: ${pred.basis[0]}` : ""}`) : "",
            coros ? sentence(`COROS: ${coros.value}`) : ""])
        : join([pred ? sentence(`Southbound predicts ${withConf(pred.value, pred)}`) : "", sentence("No race in the plan yet")]);

    const aim = join([top ? sentence(top.title) : "", phase ? sentence(`The plan says: ${phase.value}`) : "", f("goals.primary") ? sentence(`Their goal in their words: ${f("goals.primary").value}`) : ""]);

    const weeks = f("load.lastWeeks"), wtd = f("load.weekToDate"), longRuns = f("load.longRuns"), keys = f("preparation.keySessions"), strength = f("load.strength");
    const recent = join([weeks ? sentence(`Last weeks: ${weeks.value}`) : "", wtd ? sentence(wtd.value) : "", longRuns ? sentence(`Long runs in 8 weeks: ${longRuns.value}`) : "",
        keys ? sentence(`Key sessions in 6 weeks: ${keys.value}`) : "", strength ? sentence(`Strength: ${strength.value}`) : ""]) || "Not much logged recently.";

    const reading = f("response.reading"), eff = f("response.efficiency"), effort = f("response.effort"), exec = f("response.execution");
    const responding = join([reading ? sentence(withConf(reading.value, reading)) : "", eff ? sentence(`Easy runs: ${eff.value}`) : "", effort ? sentence(`Effort: ${effort.value}`) : "", exec ? sentence(`Workouts: ${exec.value}`) : ""])
        || "Not enough yet to read how the training is landing.";

    const pct = f("load.percentile"), decision = f("decision.weekly"), limits = f("constraints.limits"), busy = f("schedule.busyDays"), requests = f("constraints.openRequests"), days2 = f("schedule.availableDays");
    const constraint = join([pct ? sentence(`Recent load is ${pct.value}`) : "", decision ? sentence(`Southbound's weekly check: ${decision.value}`) : "",
        limits ? sentence(`Limits: ${limits.value}`) : "", days2 ? sentence(`Can train: ${days2.value}`) : "", busy ? sentence(`Busy: ${busy.value}`) : "", requests ? sentence(`Asked to change: ${requests.value}`) : ""])
        || "Nothing stands out.";

    const priority = top ? join([sentence(top.title), sentence(top.text), top.evidence.length ? sentence(`Evidence: ${top.evidence.join("; ")}`) : "", context.priorities.length > 1 ? sentence(`Also: ${context.priorities.slice(1).map(p => p.title.toLowerCase()).join("; ")}`) : ""])
        : "Nothing in particular: keep the plan as written.";

    const pain = f("constraints.painOrSick"), ready = f("readiness.score") || f("readiness.classic");
    const careful = join([pain ? sentence(`Reported: ${pain.value}. Check in before anything hard; Southbound doesn't diagnose`) : "",
        decision && /Ease|Recover|Absorb/.test(decision.value) ? sentence(`Stacking hard days this week (the weekly check says ${decision.value.split(":")[0]})`) : "",
        ready ? sentence(`Readiness ${ready.value} is a rough guide, not a measurement`) : "",
        limits && !/None right now/.test(limits.value) ? sentence(`Their limits: ${limits.value}`) : ""])
        || "Nothing specific beyond the usual: no two hard days in a row.";

    const missing = context.unknowns.length ? context.unknowns.slice(0, 4).map(u => sentence(u.what)).join(" ") : "Nothing important is missing.";
    return [
        { n: 1, q: "Where they are now", a: where },
        { n: 2, q: "What we're trying to accomplish", a: aim || "No goal written down yet." },
        { n: 3, q: "What happened recently", a: recent },
        { n: 4, q: "How they're responding", a: responding },
        { n: 5, q: "The current constraint", a: constraint },
        { n: 6, q: "The primary training priority (Southbound's reading; the coach decides)", a: priority },
        { n: 7, q: "Be careful about", a: careful },
        { n: 8, q: "What's missing", a: missing }
    ].map(x => (who === "You" ? { ...x, q: x.q.replace("they are", "you are").replace("they're", "you're") } : x));
}

/** The brief as plain text, ready to read or paste anywhere. */
export function planningBrief(context) {
    const name = context.athlete.who === "self" ? "Me" : (context.athlete.firstName || "Athlete");
    const head = `WEEKLY PLANNING BRIEF · ${name} · ${short(context.window.from)} – ${short(context.window.to)}`;
    return [head, "", ...briefSections(context).flatMap(s => [`${s.n}. ${s.q}`, `   ${s.a}`])].join("\n");
}

/**
 * The whole prompt for a chatbot. runsOnly: copy the STRENGTH column as it is
 * (Eddie's own plan keeps strength on its own page). paces: the plan's pace
 * table in words, when it has one.
 */
export function chatbotPrompt(context, { runsOnly = false, paces = "" } = {}) {
    const self = context.athlete.who === "self";
    const who = self ? "myself (I'm the coach and the athlete)" : `${context.athlete.firstName || "one of my clients"}${context.athlete.ageBand ? ` (age ${context.athlete.ageBand})` : ""}`;
    const { from, to } = context.window;
    return [
        `I'm a running coach planning ${from} to ${to} for ${who}. My coaching app, Southbound, has already worked out the facts below from the athlete's own data. Use them as they are: don't recompute paces, loads or predictions. Your job is to interpret them, set priorities, choose and order the sessions, and explain each change. I make the final decision, and I'll paste your answer back into Southbound, which reads it line by line.`,
        "",
        "## Planning brief",
        planningBrief(context),
        "",
        "## Southbound's facts (what kind of fact, how sure)",
        ...factLines(context),
        "",
        "## My notes for this week",
        context.notes || "(none)",
        "",
        "## The plan as it stands",
        paces ? `Paces in this plan: ${paces}` : "",
        "```",
        ...(context.plan.lines.length ? context.plan.lines : ["(no plan days in these dates)"]),
        "```",
        "",
        "## How to plan",
        "- Start from the plan as it stands. Change only what the facts or my notes give a reason to change, and copy the other days as they are.",
        "- Lean on facts with high or moderate confidence; when one you'd rely on is low or missing, say how that limits your advice.",
        "- Keep the week's running within the athlete's recent range (the last weeks above) unless my notes say otherwise. Never two hard days (workouts, long runs, races) in a row. Respect the days they can't train and their limits.",
        "- No \"safe\" or \"unsafe\" claims and no injury predictions. If pain or sickness is reported, keep the week easy and say I should check in with them first.",
        "- Use the plan's own paces or effort words; don't invent new pace targets.",
        "",
        ...answerFormatLines({ from, last: to, runsOnly }),
        "After the code block, for me (not the athlete): one line per day you changed, \"DATE: why\", naming the fact behind it; then what you're unsure about.",
        runsOnly ? "" : strengthLibraryLine()
    ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n").trim() + "\n";
}
