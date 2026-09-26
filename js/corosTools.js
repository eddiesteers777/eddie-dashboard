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
