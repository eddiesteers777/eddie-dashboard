import { test, expect } from 'claude-code/testing'
import { pickTier, modelFor } from './classify'

const tier = (t: string, last?: 'quick' | 'standard' | 'deep') => pickTier(t, last).tier

test('quick questions go to the small model', async () => {
  expect(tier('what does git stash do?')).toBe('quick')
  expect(tier('how many miles is a half marathon')).toBe('quick')
  expect(tier('explain what a service worker is')).toBe('quick')
  expect(tier('hello')).toBe('quick')
})

test('everyday coding work goes to Sonnet', async () => {
  expect(tier('fix the typo in js/apply.js')).toBe('standard')
  expect(tier('why does this throw TypeError: x is undefined')).toBe('standard')
  expect(tier('add a Share button to the Train page')).toBe('standard')
})

test('big jobs stay on the chosen model', async () => {
  expect(tier('audit the whole codebase for security problems')).toBe('deep')
  expect(tier('build a new feature that lets clients message the coach')).toBe('deep')
  expect(tier('refactor the whole sync layer')).toBe('deep')
  expect(tier('word '.repeat(300))).toBe('deep')
})

test('asking by name and follow-ups', async () => {
  expect(tier('use haiku: summarize this file')).toBe('quick')
  expect(tier('think hard about what is wrong here')).toBe('deep')
  expect(tier('push it', 'deep')).toBe('deep')
  expect(tier('yes', 'standard')).toBe('standard')
  expect(tier('step 8', 'deep')).toBe('deep')
})

test('never steps above the chosen model', async () => {
  expect(modelFor('quick', 'claude-opus-5-5')).toBe('claude-haiku-5-5')
  expect(modelFor('standard', 'claude-opus-5-5')).toBe('claude-sonnet-5-5')
  expect(modelFor('deep', 'claude-opus-5-5')).toBe('claude-opus-5-5')
  expect(modelFor('standard', 'claude-haiku-5-5')).toBe('claude-haiku-5-5')
  expect(modelFor('quick', 'claude-sonnet-5-5')).toBe('claude-haiku-5-5')
  expect(modelFor('quick', 'my-gateway-alias')).toBe('my-gateway-alias')
})
