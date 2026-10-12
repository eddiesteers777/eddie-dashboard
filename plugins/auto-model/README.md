# Auto model

Reads each prompt and runs that turn on the smallest Claude model that fits it, so quick questions don't use up your plan on a big model.

| Prompt | Model |
|---|---|
| Quick questions, short chat | Haiku |
| Everyday coding work, pasted errors | Sonnet |
| Big jobs (audits, redesigns, new builds, long prompts) | Your chosen model |
| Short follow-ups ("yes", "push it") | Same as the last prompt |

It only steps down from your chosen model, never up. Force one with "use haiku", "use sonnet", "use opus" or "think hard".

`/auto-model status` · `/auto-model on` · `/auto-model off`

## Install

```
/plugin install auto-model --marketplace eddiesteers777/eddie-dashboard
```
