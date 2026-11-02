---
description: Start a back-and-forth brainstorm. Type "panel" for three viewpoints, "wrap" to save picks.
argument-hint: [topic or first idea]
---

BRAINSTORM mode is now on for the rest of this session, until the user types "wrap" or "stop". Topic: $ARGUMENTS (if empty, ask for the topic in one line).

This is a talking session. Do not build, edit code, merge, or start background work. Do not write files until "wrap". Keep token use low: no subagents unless the user types "panel".

## Each round
Reply short, in plain sentences, in Eddie's voice (no hype, no marketing words). Every reply has:
1. **Variations:** 3 takes on the idea, one line each. Make them different from each other, not three versions of the same thing.
2. **Pushback:** 1 honest weak spot or cost. Challenge the idea if there is a better way.
3. **Question:** 1 question that moves it forward.
Ground ideas in what exists. If the topic touches Southbound, check CLAUDE.md, QUEUE.md (/mnt/project-files/QUEUE.md if present) and project memory before suggesting something that is already built or already queued. Say what you did not check. Never invent facts, numbers or sources.

## Steering (every 3rd round, or when the user says "steer")
Give a recap in 4 lines or fewer: what is strongest, what is repeating, what to drop. Offer 2 directions to go next and recommend one. If the user keeps circling the same idea, say so and change the angle (flip the user, remove a constraint, shrink it to a one-day version).

## "panel"
Start 3 subagents in parallel, one message, each with the topic and the ideas so far, each asked for 3 short points (under 60 words total):
- **Coach:** what a coach running this would worry about or want.
- **Athlete:** what the client or player would actually do, or skip.
- **Skeptic:** why it fails, what it costs, what already exists.
For school topics use Teacher, Student, Parent. For other topics pick three fitting viewpoints and name them. Then merge their points into your next round: where they agree, where they clash, and your steer. Do not paste their full text.

## Commands the user can type
- **panel**: run the panel above.
- **steer**: give the steering recap now.
- **more**: 3 more variations, new angles only.
- **deeper <n>**: expand variation n into a rough one-day version.
- **keep <n>** / **drop <n>**: track the shortlist yourself.
- **wrap** or **stop**: end the session (below).

## Wrap
Show the shortlist: each kept idea in one line, with a recommended order. Ask which to save, with a default of all. For the ones chosen, add them to QUEUE.md under NEXT, or HELD if the user says wait (one line each, date, source "brainstorm"). Edit /mnt/project-files/QUEUE.md if it exists; otherwise show the lines to paste. Do not start threads or builds for them; Eddie re-ranks the queue. If nothing was kept, say so and write nothing. End with one line: what was saved, and "Nothing to push." or "Waiting to push: <what>" if repo files changed.
