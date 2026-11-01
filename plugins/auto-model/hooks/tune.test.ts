import { test, expect } from 'claude-code/testing'
import { subagentTier, effortFor, mainModel, isCorrection, record, tuned, freshStats, readStats, STICKY_TOKENS } from './tune'

test('subagents: search helpers go smallest, forks keep the parent model', async () => {
  expect(subagentTier('Explore')).toBe('quick')
  expect(subagentTier('web-fetch')).toBe('quick')
  expect(subagentTier('general-purpose')).toBe('standard')
  expect(subagentTier('Plan')).toBe('standard')
  expect(subagentTier('fork')).toBe('deep')
  expect(subagentTier(undefined)).toBe('standard')
})

test('thinking level only ever goes down', async () => {
  expect(effortFor('quick', 'high')).toBe('low')
  expect(effortFor('standard', 'xhigh')).toBe('medium')
  expect(effortFor('standard', 'low')).toBe('low')
  expect(effortFor('deep', 'high')).toBe('high')
  expect(effortFor('quick', undefined)).toBe(undefined)
  expect(effortFor('quick', 8000)).toBe(8000)
})

test('a long conversation stays on its model instead of paying to re-cache', async () => {
  const opus = 'claude-opus-5-5', haiku = 'claude-haiku-5-5'
  expect(mainModel(haiku, opus, 5_000)).toEqual({ model: haiku, sticky: false })
  expect(mainModel(haiku, opus, STICKY_TOKENS + 1)).toEqual({ model: opus, sticky: true })
  expect(mainModel(opus, haiku, STICKY_TOKENS + 1)).toEqual({ model: opus, sticky: false })
  expect(mainModel(haiku, undefined, 99_999)).toEqual({ model: haiku, sticky: false })
})

test('spots corrections, not ordinary follow-ups', async () => {
  expect(isCorrection("that's wrong")).toBe(true)
  expect(isCorrection('no, I meant the coach page')).toBe(true)
  expect(isCorrection('still broken on my phone')).toBe(true)
  expect(isCorrection('not what I asked for')).toBe(true)
  expect(isCorrection('push it')).toBe(false)
  expect(isCorrection('now add a share button')).toBe(false)
  expect(isCorrection('note: keep it short')).toBe(false)
})

test('a tier that keeps missing is lifted, and drops back once reliable', async () => {
  let s = freshStats()
  for (let i = 0; i < 4; i++) s = record(s, 'quick', i % 2 === 0)
  expect(s.quick.lifted).toBe(false) // too few turns to judge
  for (let i = 0; i < 4; i++) s = record(s, 'quick', i % 2 === 0)
  expect(s.quick.lifted).toBe(true)
  expect(tuned('quick', s)).toBe('standard')
  for (let i = 0; i < 40; i++) s = record(s, 'quick', false)
  expect(s.quick.lifted).toBe(false)
  expect(tuned('quick', s)).toBe('quick')
  expect(tuned('deep', s)).toBe('deep')
})

test('stored stats from an older version are checked', async () => {
  expect(readStats(undefined)).toEqual(freshStats())
  expect(readStats({ quick: 1 })).toEqual(freshStats())
  const s = record(freshStats(), 'standard', true)
  expect(readStats(JSON.parse(JSON.stringify(s)))).toEqual(s)
})
