// Pure prompt classifier: no engine calls, so it costs nothing and is unit-tested.

export type Tier = 'quick' | 'standard' | 'deep'

export type Pick = { tier: Tier; reason: string }

// Asked for by name anywhere in the prompt ("use opus", "@haiku", "think hard").
const FORCE: readonly [RegExp, Tier, string][] = [
  [/\b(ultrathink|think (really |very )?hard|think deeply)\b/i, 'deep', 'asked to think hard'],
  [/(^|\s)[@!]?(use |on )?(opus|fable)\b/i, 'deep', 'asked for the big model'],
  [/(^|\s)[@!]?(use |on )?sonnet\b/i, 'standard', 'asked for Sonnet'],
  [/(^|\s)[@!]?(use |on )?haiku\b/i, 'quick', 'asked for Haiku'],
]

// Short replies that carry on the work already going: keep the last turn's model.
const CONTINUE =
  /^(y|yes|yeah|yep|ok|okay|sure|go|go ahead|do it|continue|keep going|next|proceed|push|push it|ship it|sounds good|looks good|lgtm|perfect|great|thanks?|thank you|step \d+|try again|again|fix it|same|and\??)[.!?\s]*$/i

// Big jobs: planning, auditing, building something new, cross-cutting changes.
const DEEP = [
  /\b(architect(ure)?|redesign|re-?architect|refactor (the|all|every|whole)|rewrite)\b/i,
  /\b(audit|security review|threat model|deep dive|root cause|investigate why)\b/i,
  /\b(plan (out|the)|roadmap|design (a|the) (system|architecture|schema))\b/i,
  /\b(build|implement|create|make) (a|an|the) (new )?(feature|system|engine|app|mod|plugin|integration|module|page|dashboard)\b/i,
  /\b(across|throughout) (the )?(whole |entire )?(codebase|repo|project|app)\b/i,
  /\b(migrate|migration|race condition|deadlock|memory leak|performance (issue|problem))\b/i,
  /\bstep \d+ of\b|\bphase [a-z0-9]+\b/i,
]

// Hands-on coding work: worth Sonnet, not a tiny model.
const WORK =
  /\b(fix|debug|implement|add|change|update|edit|write|refactor|rename|remove|delete|test|build|deploy|commit|merge|push|install|configure|set up|setup|migrate|optimi[sz]e|review|generate|convert|port)\b/i

// Things that look like code or a pasted error.
const CODE = /```|\b(error|exception|traceback|stack trace|undefined is not|TypeError|ReferenceError|SyntaxError)\b|[{};]\s*$|=>|\bfunction\b|\bconst\b|\bimport\b|\.(js|ts|tsx|py|css|html|json|md|rules)\b/i

// Questions that only need an answer, not work.
const QUESTION = /^(what|what's|whats|who|when|where|which|why|how (do|does|can|much|many|long|old)|is|are|can|could|does|do|did|should|explain|define|tell me|remind me|summari[sz]e)\b/i

export function pickTier(text: string, last?: Tier): Pick {
  const t = text.trim()
  if (t === '') return { tier: last ?? 'standard', reason: 'no text: kept the last model' }

  for (const [re, tier, reason] of FORCE) if (re.test(t)) return { tier, reason }

  if (CONTINUE.test(t)) return { tier: last ?? 'standard', reason: 'a short follow-up: kept the last model' }

  const words = t.split(/\s+/).length
  const lines = t.split('\n').length

  if (words > 220 || lines > 25) return { tier: 'deep', reason: 'a long, detailed prompt' }
  if (DEEP.some(re => re.test(t))) return { tier: 'deep', reason: 'a big job (design, audit or a new build)' }

  const hasCode = CODE.test(t)
  const isWork = WORK.test(t)

  if (QUESTION.test(t) && !hasCode && !isWork && words <= 40)
    return { tier: 'quick', reason: 'a quick question' }
  if (!hasCode && !isWork && words <= 12)
    return { tier: 'quick', reason: 'a short message' }

  return { tier: 'standard', reason: hasCode ? 'code or an error to work on' : 'everyday work' }
}

// Model families from smallest to largest. The session's own model is the ceiling:
// auto-model only ever steps down from it, never up.
const RANK: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }

export const MODELS = { quick: 'claude-haiku-5-5', standard: 'claude-sonnet-5-5' } as const

export function familyOf(model: string): string | undefined {
  return Object.keys(RANK).find(f => model.toLowerCase().includes(f))
}

export function modelFor(tier: Tier, sessionModel: string): string {
  if (tier === 'deep') return sessionModel
  const want = MODELS[tier]
  const have = familyOf(sessionModel)
  const wantRank = RANK[familyOf(want) ?? ''] ?? 0
  const haveRank = have === undefined ? undefined : RANK[have]
  // An unknown session model (a gateway alias) is left alone.
  if (haveRank === undefined || haveRank <= wantRank) return sessionModel
  return want
}

export function shortName(model: string): string {
  const f = familyOf(model)
  return f ? f.charAt(0).toUpperCase() + f.slice(1) : model
}
