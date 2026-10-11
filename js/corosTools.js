/* ==========================================
   Southbound — what COROS's connection offers (pure)

   COROS's connection (the MCP service js/corosData.js reads from)
   lists its "tools". The ones that only read (query..., get...) let
   Southbound show runs; anything else might be able to change things
   in the athlete's COROS account, such as sending a workout to the
   watch. The COROS diagnostic shows this list so we can see, with a
   real account, what's possible. Unit-tested in tests/corosTools.test.mjs.
========================================== */

const READ = /^(query|get|list|search|fetch|read|describe|find)/i;
const WORKOUTISH = /workout|training|plan|schedule|course|program|interval/i;

// tools: [{ name, description }] -> { read: [names], write: [names], workout: [names] }
export function sortCorosTools(tools) {
    const names = (tools || []).map(t => String(t?.name || "")).filter(Boolean).sort();
    const write = names.filter(n => !READ.test(n));
    return {
        read: names.filter(n => READ.test(n)),
        write,
        workout: write.filter(n => WORKOUTISH.test(n))
    };
}

// The one-line answer for the diagnostic.
export function corosToolsSummary(tools) {
    const { read, write, workout } = sortCorosTools(tools);
    if (!read.length && !write.length) return { status: "warn", text: "COROS didn't list any tools." };
    const parts = [`Reads: ${read.join(", ") || "none"}.`];
    if (workout.length) parts.push(`Could send workouts or plans: ${workout.join(", ")}.`);
    else if (write.length) parts.push(`Can also change: ${write.join(", ")} (nothing about workouts).`);
    else parts.push("Read-only: nothing here can send a workout to the watch.");
    return { status: workout.length ? "pass" : "warn", text: parts.join(" ") };
}

// Everything COROS says about its workout / plan tools (read and write):
// name, what it does, and the fields it takes. Copied by the diagnostic
// so the exact format can be pasted to whoever builds "send to watch".
export function workoutToolDetails(tools) {
    return (tools || [])
        .filter(t => t?.name && WORKOUTISH.test(t.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => ({ name: t.name, description: t.description || "", inputSchema: t.inputSchema || {} }));
}

// Daily health data (sleep, HRV, resting heart rate, stress...): which read
// tools might have it. Decides how close a WHOOP-style readiness score can
// get. The five Analytics already uses don't count (recovery status is
// read on its own).
const HEALTH = /sleep|hrv|heart|rhr|resting|daily|wellness|body|stress|spo2|oxygen|breath|respir|metric|health|recovery|readiness|battery/i;
const ALREADY = new Set(["querySportRecords", "getActivityDetail", "queryTrainingLoadAssessment", "queryFitnessAssessmentOverview"]);

export function healthTools(tools) {
    return (tools || [])
        .filter(t => t?.name && READ.test(t.name) && !ALREADY.has(t.name) && (HEALTH.test(t.name) || HEALTH.test(t.description || "")) && !WORKOUTISH.test(t.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => ({ name: t.name, description: t.description || "", inputSchema: t.inputSchema || {} }));
}

// The diagnostic's line about it.
export function healthSummary(tools) {
    const found = healthTools(tools);
    const words = found.map(t => t.name);
    const text = `${found.map(t => `${t.name} ${t.description}`).join(" ")}`;
    const has = { sleep: /sleep/i.test(text), hrv: /hrv|heart rate variability/i.test(text), rhr: /resting/i.test(text) };
    const listed = [has.sleep && "sleep", has.hrv && "HRV", has.rhr && "resting heart rate"].filter(Boolean);
    return {
        status: listed.length ? "pass" : "warn",
        text: found.length
            ? `COROS shares: ${words.join(", ")}${listed.length ? ` (mentions ${listed.join(", ")})` : ""}.`
            : "No sleep / HRV / resting heart rate tools listed beyond recovery status."
    };
}

// Can COROS take a strength workout from Southbound? Read from the
// workout tools' own descriptions and fields (the connection only lists
// what it accepts), so the answer comes from the real account, not a guess.
// -> { status: "pass" | "warn", answer: "yes" | "no" | "unclear", text }
// Not "sets" / "reps": a run's interval groups use those words too.
const STRENGTH = /strength|\bgym\b|weight ?(training|lifting)|weightlifting|barbell|dumbbell/i;
export function strengthSupport(tools) {
    const writers = (tools || []).filter(t => t?.name && !READ.test(t.name) && WORKOUTISH.test(t.name));
    if (!writers.length) return { status: "warn", answer: "no", text: "No: COROS lists no tool that can send a workout." };
    const hits = writers.filter(t => STRENGTH.test(`${t.description || ""} ${JSON.stringify(t.inputSchema || {})}`));
    if (hits.length) return { status: "pass", answer: "yes", text: `Maybe: ${hits.map(t => t.name).join(", ")} mention strength. Tap "Copy COROS workout tool details" and send it over so it can be built.` };
    const sport = writers.map(t => t.inputSchema?.properties?.sportType || t.inputSchema?.properties?.course?.properties?.sportType).find(Boolean);
    const words = sport ? [sport.description, Array.isArray(sport.enum) ? `takes ${sport.enum.join(", ")}` : ""].filter(Boolean).join("; ") : "";
    return {
        status: "warn",
        answer: sport ? "no" : "unclear",
        text: sport
            ? `Not that we can see: ${writers.map(t => t.name).join(", ")} say nothing about strength${words ? ` (sport type: ${words.slice(0, 160)})` : ""}.`
            : `Unclear: ${writers.map(t => t.name).join(", ")} don't say which sports they take. Tap "Copy COROS workout tool details" and send it over.`
    };
}
