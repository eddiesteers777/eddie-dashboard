# Auto model

Saves plan usage. Each prompt, and each helper agent Claude starts, runs on the smallest Claude model and thinking level that fits the job. It never goes above the model you chose.

| What | Model | Thinking |
|---|---|---|
| Quick questions, short chat | Haiku | low |
| Everyday coding work, pasted errors | Sonnet | medium |
| Big jobs (audits, redesigns, new builds, long prompts) | Your chosen model | yours |
| Short follow-ups ("yes", "push it") | Same as the last prompt | |
| Search and lookup helpers (Explore, web fetch) | Haiku | low |
| Other helpers (general-purpose, Plan) | Sonnet | medium |
| Forked helpers (share your chat) | Your chosen model | yours |

**Long chats stay on one model.** Switching models makes the new one read the whole chat again at full price (about 12 times what a cached read costs). Once a chat passes 30k tokens, auto-model keeps the current model for a smaller job and only lowers the thinking level. Stepping up is always allowed.

**It tunes itself.** If you reply "that's wrong", "didn't work", "not what I asked" or similar right after a Haiku or Sonnet turn, that counts as a miss. When more than a quarter of a tier's recent turns miss, that tier steps up one model. Once it has been reliable again (under 8%), it steps back down. It changes its own settings, never its code. On your computer this carries across sessions. In a cloud session it starts fresh each time.

Force one in a prompt: "use haiku", "use sonnet", "use opus" or "think hard".

`/auto-model status` (models, self-tuning, tokens this session) · `/auto-model on` · `/auto-model off`

## Install

It turns on by itself in Claude Code sessions on this repo (`.claude/settings.json`). Anywhere else:

```
/plugin install auto-model --marketplace eddiesteers777/eddie-dashboard
```
