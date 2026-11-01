// Pure tuning rules for auto-model: subagents, thinking level, cache-aware
// switching and the self-tuning that steps a tier up when it keeps falling short.
// No engine calls, so it is unit-tested.

import { familyOf, modelFor, type Tier } from './classify'

// ---- Subagents --------------------------------------------------------------
// A subagent starts with a fresh context, so moving it to a smaller model costs
// no cache. Search and lookup helpers go smallest; a fork shares the parent's
// cached context, so it keeps the parent's model.
const QUICK_AGENTS = /^(explore|web-fetch|claude-code-guide|statusline-setup)$/i

export function subagentTier(type: string | undefined): Tier {
  if (!type) return 'standard'
  if (/^fork$/i.test(type)) return 'deep'
  if (QUICK_AGENTS.test(type)) return 'quick'
  return 'standard'
}

// ---- Thinking level ----------------------------------------------------------
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number
const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const WANT: Record<Tier, (typeof LEVELS)[number] | undefined> = { quick: 'low', standard: 'medium', deep: undefined }

/** Lower the thinking level for small work. Never raises it; a number is left alone. */
export function effortFor(tier: Tier, current: Effort | undefined): Effort | undefined {
  const want = WANT[tier]
  if (current === undefined || typeof current === 'number' || want === undefined) return current
  return LEVELS.indexOf(want) < LEVELS.indexOf(current) ? want : current
}

// ---- Cache-aware switching ----------------------------------------------------
// Switching the main chat to another model re-sends the whole conversation to a
// model with no cache of it (a cache write costs ~12x a cache read). On a long
// conversation that costs more than the smaller model saves, so stay put and
// lower the thinking level instead.
export const STICKY_TOKENS = 30_000

export function mainModel(want: string, last: string | undefined, contextTokens: number): { model: string; sticky: boolean } {
  if (!last || last === want || contextTokens < STICKY_TOKENS) return { model: want, sticky: false }
  // Stepping up is always allowed: the work needs it.
  const rank = (m: string) => ['haiku', 'sonnet', 'opus', 'fable'].indexOf(familyOf(m) ?? '')
  if (rank(want) > rank(last)) return { model: want, sticky: false }
  return { model: last, sticky: true }
}

// ---- Self-tuning ---------------------------------------------------------------
// A follow-up like "that's wrong" or "still broken" right after a small-model turn
// counts as a miss for that tier. If a tier misses too often it is lifted one
// step; once it has been reliable again it drops back. Old turns fade (x0.9).
const CORRECTION =
  /^(no\b|nope\b|wrong\b)|\b(that'?s (wrong|not (right|it|what i))|not what i (asked|meant|wanted)|didn'?t work|doesn'?t work|still (broken|wrong|not working|failing)|you (missed|forgot|broke)|try again|redo|that broke)\b/i

export function isCorrection(text: string): boolean {
  return CORRECTION.test(text.trim())
}

export type TierStats = { n: number; miss: number; lifted: boolean }
export type Stats = { quick: TierStats; standard: TierStats }

export const freshStats = (): Stats => ({
  quick: { n: 0, miss: 0, lifted: false },
  standard: { n: 0, miss: 0, lifted: false },
})

const DECAY = 0.9
const LIFT_AT = 0.25
const DROP_AT = 0.08
const MIN_SAMPLES = 5

export function record(stats: Stats, tier: Tier, missed: boolean): Stats {
  if (tier === 'deep') return stats
  const s = stats[tier]
  const n = s.n * DECAY + 1
  const miss = s.miss * DECAY + (missed ? 1 : 0)
  const rate = miss / n
  const lifted = n >= MIN_SAMPLES && rate > LIFT_AT ? true : rate < DROP_AT ? false : s.lifted
  return { ...stats, [tier]: { n, miss, lifted } }
}

/** The tier to run after self-tuning: a lifted tier runs one step up. */
export function tuned(tier: Tier, stats: Stats): Tier {
  if (tier === 'quick' && stats.quick.lifted) return 'standard'
  if (tier === 'standard' && stats.standard.lifted) return 'deep'
  return tier
}

/** Accepts what an earlier version stored; anything else starts fresh. */
export function readStats(v: unknown): Stats {
  const ok = (t: any) => t && typeof t.n === 'number' && typeof t.miss === 'number' && typeof t.lifted === 'boolean'
  const s = v as any
  return s && ok(s.quick) && ok(s.standard) ? s : freshStats()
}

export { modelFor }
