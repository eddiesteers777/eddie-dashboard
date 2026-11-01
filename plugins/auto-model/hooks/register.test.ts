import { test, expect } from 'claude-code/testing'

const OPUS = 'claude-opus-5-5'

function engine(on: any, seen: any[], context = 1000) {
  on('command.register', () => ({ value: { command: 'auto-model' } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.model', () => ({ value: OPUS }))
  on('agent.list', () => ({ value: [{ id: 'a1', type: 'Explore', description: '', status: 'running' }, { id: 'f1', type: 'fork', description: '', status: 'running' }] }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_: any, e: any) {
    seen.push({ model: e.model, effort: e.effort, agentId: e.agentId })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: e.model, input_tokens: 10, output_tokens: 10, cache_read_input_tokens: context, cache_creation_input_tokens: 0 } }
  })
}

async function run($: any, input: any) {
  const s = $.turn.step(input)
  for await (const _ of s) { /* drain */ }
  return s.result
}

const step = (turnId: string, agentId?: string) => ({ turnId, index: 0, model: OPUS, effort: 'high' as const, messageCount: 3, ...(agentId ? { agentId } : {}) })

test('quick question on a short chat: small model, low thinking', async ($, on) => {
  const seen: any[] = []
  engine(on, seen)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'what does git stash do?', turnId: 't1' } as any)
  await run($, step('t1'))
  expect(seen[0]).toEqual({ model: 'claude-haiku-5-5', effort: 'low', agentId: undefined })
})

test('long chat keeps its model and only lowers thinking', async ($, on) => {
  const seen: any[] = []
  engine(on, seen, 80_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'audit the whole codebase for security problems', turnId: 't1' } as any)
  await run($, step('t1'))
  await $.turn.start({ text: 'what does git stash do?', turnId: 't2' } as any)
  await run($, step('t2'))
  expect(seen[0].model).toBe(OPUS)
  expect(seen[1]).toEqual({ model: OPUS, effort: 'low', agentId: undefined })
})

test('search helpers go smallest; forks keep the parent model', async ($, on) => {
  const seen: any[] = []
  engine(on, seen)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($, step('t9', 'a1'))
  await run($, step('t9', 'f1'))
  expect(seen[0]).toEqual({ model: 'claude-haiku-5-5', effort: 'low', agentId: 'a1' })
  expect(seen[1]).toEqual({ model: OPUS, effort: 'high', agentId: 'f1' })
})
