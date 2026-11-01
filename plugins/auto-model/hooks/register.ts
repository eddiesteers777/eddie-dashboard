import type { Register } from 'claude-code'
import { pickTier, modelFor, shortName, type Tier } from './classify'
import { subagentTier, effortFor, mainModel, isCorrection, record, tuned, readStats, type Stats, type Effort, STICKY_TOKENS } from './tune'

const KEY = 'enabled'
const STATS = 'stats'

type TurnPlan = { tier: Tier; model?: string }

export const register: Register = on => {
  // turnId -> the plan for that turn. Every request of a turn uses one model,
  // so a turn never switches halfway through its work.
  const turns = new Map<string, TurnPlan>()
  const agentTypes = new Map<string, string>()
  let enabled = true
  let stats: Stats = readStats(undefined)
  let lastTier: Tier | undefined
  let lastModel: string | undefined
  let lastContext = 0
  const used: Record<string, number> = {}

  on('session.start', async ($, e, next) => {
    enabled = (await $.store.get(KEY)) !== false
    stats = readStats(await $.store.get(STATS))
    await $.command.register({
      name: 'auto-model',
      description: 'Auto model: on, off, or status (models in use, self-tuning, tokens this session)',
      argumentHint: 'on | off | status',
    })
    return next(e)
  })

  on('command.run', { command: 'auto-model' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      enabled = arg === 'on'
      await $.store.set(KEY, enabled)
      if (!enabled) $.ui.status(undefined)
      return { text: `Auto model is ${arg}.${enabled ? '' : ' Every turn runs on your chosen model.'}` }
    }
    const model = await $.session.model()
    const rate = (t: 'quick' | 'standard') =>
      stats[t].n < 1 ? 'no data yet' : `${Math.round((100 * stats[t].miss) / stats[t].n)}% corrected${stats[t].lifted ? ', stepped up' : ''}`
    const tokens = Object.entries(used).map(([m, n]) => `${shortName(m)} ${Math.round(n / 1000)}k`).join(', ') || 'none yet'
    return {
      text: [
        `Auto model is ${enabled ? 'on' : 'off'}. Your chosen model (the ceiling): ${model}.`,
        `Quick -> ${shortName(modelFor('quick', model))} (low thinking), everyday -> ${shortName(modelFor('standard', model))} (medium), big jobs -> ${shortName(model)}.`,
        'Search and lookup helpers run on the smallest model; other helpers on the middle one.',
        `Long chats (over ${STICKY_TOKENS / 1000}k tokens) keep their model and only lower the thinking level, since a switch re-reads the whole chat.`,
        `Self-tuning: quick ${rate('quick')}; everyday ${rate('standard')}.`,
        `Tokens this session: ${tokens}.`,
        'Force one in a prompt: "use haiku", "use sonnet", "use opus" or "think hard". `/auto-model off` turns it off.',
      ].join('\n'),
    }
  })

  on('turn.start', async ($, e, next) => {
    if (enabled && e.agentId === undefined) {
      // Learn from the follow-up: a correction right after a smaller-model turn is a miss.
      if (lastTier && lastTier !== 'deep') {
        stats = record(stats, lastTier, isCorrection(e.text))
        await $.store.set(STATS, stats)
      }
      const pick = pickTier(e.text, lastTier)
      const tier = tuned(pick.tier, stats)
      turns.set(e.turnId, { tier })
      lastTier = pick.tier
      if (turns.size > 50) turns.delete(turns.keys().next().value!)
      const want = modelFor(tier, await $.session.model())
      const { model, sticky } = mainModel(want, lastModel, lastContext)
      const why = tier !== pick.tier ? `${pick.reason}; stepped up after corrections` : pick.reason
      $.ui.status(`auto-model: ${shortName(model)} (${sticky ? 'kept for a long chat, lighter thinking' : why})`)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!enabled) return yield* next(e)
    if (e.agentId !== undefined && !agentTypes.has(e.agentId)) {
      const found = (await $.agent.list()).find(a => a.id === e.agentId)
      agentTypes.set(e.agentId, found?.type ?? '')
      if (agentTypes.size > 200) agentTypes.delete(agentTypes.keys().next().value!)
    }
    const result = yield* next(plan(e))
    // The main chat's last request size is what a model switch would re-read.
    if (e.agentId === undefined && result.usage) {
      lastModel = result.usage.model
      lastContext = result.usage.input_tokens + result.usage.cache_read_input_tokens + result.usage.cache_creation_input_tokens
    }
    return result
  })

  function plan<E extends { turnId: string; model: string; effort?: Effort; agentId?: string }>(e: E): E {
    let tier: Tier | undefined
    let model = e.model
    if (e.agentId === undefined) {
      const turn = turns.get(e.turnId)
      if (turn) {
        tier = turn.tier
        if (!turn.model) turn.model = mainModel(modelFor(tier, e.model), lastModel, lastContext).model
        model = turn.model
      }
    } else {
      tier = subagentTier(agentTypes.get(e.agentId) || undefined)
      model = modelFor(tier, e.model)
    }
    if (tier === undefined) return e
    const effort = effortFor(tier, e.effort)
    return model === e.model && effort === e.effort ? e : { ...e, model, effort }
  }

  // Tokens per model this session, for /auto-model status.
  on('turn.complete', ($, e, next) => {
    const u = e.usage
    if (u) {
      used[u.model] = (used[u.model] ?? 0) + u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
    }
    return next(e)
  })
}
