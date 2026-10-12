import type { Register } from 'claude-code'
import { pickTier, modelFor, shortName, type Tier } from './classify'

const KEY = 'enabled'

export const register: Register = on => {
  // turnId -> the tier picked for that turn. Every model request of a turn uses
  // one model, so a turn never switches halfway through its work.
  const turns = new Map<string, Tier>()
  let last: Tier | undefined
  let enabled = true

  on('session.start', async ($, e, next) => {
    enabled = (await $.store.get(KEY)) !== false
    await $.command.register({
      name: 'auto-model',
      description: 'Auto model: on, off, or status (which model the last prompt went to and why)',
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
    return {
      text: [
        `Auto model is ${enabled ? 'on' : 'off'}. Your chosen model (the ceiling): ${model}.`,
        `Quick questions -> ${shortName(modelFor('quick', model))}, everyday work -> ${shortName(modelFor('standard', model))}, big jobs -> ${shortName(model)}.`,
        'Force one in a prompt: "use haiku", "use sonnet", "use opus" or "think hard". `/auto-model off` turns it off.',
      ].join('\n'),
    }
  })

  on('turn.start', async ($, e, next) => {
    if (enabled) {
      const pick = pickTier(e.text, last)
      turns.set(e.turnId, pick.tier)
      last = pick.tier
      const model = modelFor(pick.tier, await $.session.model())
      $.ui.status(`auto-model: ${shortName(model)} (${pick.reason})`)
      if (turns.size > 50) turns.delete(turns.keys().next().value!)
    }
    return next(e)
  })

  // Rewrite the model on the main loop's requests only; subagents keep their own.
  on('turn.step', async function* ($, e, next) {
    const tier = e.agentId === undefined && enabled ? turns.get(e.turnId) : undefined
    const model = tier ? modelFor(tier, e.model) : e.model
    return yield* next(model === e.model ? e : { ...e, model })
  })
}
