# Prompt coach

Adds a short checklist the model reads with every prompt you send. Your words are never changed: the note rides beside them, and you don't see it.

The note says:

- **Mode:** the word you started with (SCOUT, MOCKUP, BUILD, SHIP, STATUS; "push it" counts as SHIP) and what that mode means. If you didn't name one, the model picks one and says which in one line.
- **Done:** the model says in one line what "done" looks like before it starts.
- **Rules:** no merge or deploy without "push it"; mock up before big UI changes; a typed yes before any action on your computer or a live system; a Firestore rules change means "Rules paste needed".
- **Reports** end with "Waiting to push: ..." or "Nothing to push."

It skips slash commands and background notices, and adds about 120 words per prompt.

`/prompt-coach status` (shows the note) · `/prompt-coach on` · `/prompt-coach off`

## Install

It turns on by itself in Claude Code sessions on this repo (`.claude/settings.json`). Anywhere else:

```
/plugin install prompt-coach --marketplace eddiesteers777/eddie-dashboard
```
