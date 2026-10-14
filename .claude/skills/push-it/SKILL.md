---
name: push-it
description: Merge the current feature branch to main and publish it, the way Eddie expects. Use only when Eddie says "push it" or "push" for work already committed on the branch.
---

# Push it

Eddie's "push it" means: merge the tested feature branch into `main` (GitHub Pages deploys `main` automatically) and switch back. Never do this without his words in the current message.

1. `git status --short`: if anything is uncommitted, stop and say what (don't commit it silently unless it's this task's work and tests pass).
2. Check the branch is current: `npm run manifest` must leave `sw.js` / `site-manifest.json` unchanged (if it changes them, commit that first), and `npm run test:static` must pass. If `firestore.rules` changed on this branch, `npm run test:rules` (run from the repo folder) must pass too.
3. Merge and push exactly as CLAUDE.md says:
   `git checkout main && git pull origin main && git merge --no-edit <branch> && git push origin main`, then `git checkout <branch>`.
   If the merge conflicts, stop, abort it (`git merge --abort`), switch back and tell Eddie what conflicts.
4. Report in a few plain lines: the commit now on main, what changed for clients or for Eddie, which tests ran.
5. If `git diff <old-main>..main --name-only` includes `firestore.rules`, end with the publish steps from the `rules-change` skill (the rules are NOT auto-deployed).
