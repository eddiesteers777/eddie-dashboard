/* ==========================================
   Southbound — exercise demo switches

   REMOTE_DEMOS_ENABLED turns on the licensed MuscleWiki videos (real
   people, male and female) in the How to sheet. Leave it false until the
   getExerciseDemo Cloud Function is deployed with its MUSCLEWIKI_API_KEY
   secret (functions/README.md); while false the sheet uses our own 3D
   clips and drawn figure only, exactly as before.
   See .claude/skills/exercise-demo-integration/SKILL.md.
========================================== */

export const REMOTE_DEMOS_ENABLED = false;
