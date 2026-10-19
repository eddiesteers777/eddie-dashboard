/* ==========================================
   Southbound — questions the coach asks after a workout (pure)

   A coach can attach up to two short questions to a planned run
   ("How did the hills feel?"). They sit on the plan's day as
   day.questions (a list of text). When the client logs the run, they
   answer in their own words and the answers are saved with the log as
   result.answers: [{ q, a }]. The question text is kept beside the
   answer, so it still reads right if the coach later changes the plan.

   Idea from OpenAthlete (AGPL-3.0, post-activity feedback questions);
   original code. No DOM or storage. Unit-tested in
   tests/workoutQuestions.test.mjs.
========================================== */

export const MAX_QUESTIONS = 2;
export const MAX_QUESTION = 120;
export const MAX_ANSWER = 500;

const oneLine = v => String(v ?? "").replace(/\s+/g, " ").trim();

// The coach's text box (one question per line) or a saved list -> a clean list.
export function cleanQuestions(input) {
    const lines = Array.isArray(input) ? input : String(input ?? "").split(/\r?\n/);
    return lines.map(oneLine).filter(Boolean).map(q => q.slice(0, MAX_QUESTION)).slice(0, MAX_QUESTIONS);
}

// What the client typed for each question -> [{ q, a }], unanswered ones left out.
export function cleanAnswers(questions, typed) {
    const qs = cleanQuestions(questions);
    const list = Array.isArray(typed) ? typed : [];
    return qs.map((q, i) => ({ q, a: String(list[i] ?? "").trim().slice(0, MAX_ANSWER) })).filter(x => x.a);
}

// Saved answers back to something safe to show (older logs have none).
export function savedAnswers(result) {
    return (Array.isArray(result?.answers) ? result.answers : [])
        .filter(x => x && typeof x.q === "string" && typeof x.a === "string" && x.a.trim())
        .slice(0, MAX_QUESTIONS);
}
