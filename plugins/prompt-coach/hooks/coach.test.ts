import { test, expect } from 'claude-code/testing'
import { namedMode, noteFor, shouldAttach } from './coach'

test('reads the mode word Eddie names', async () => {
  expect(namedMode('BUILD the share button')).toBe('BUILD')
  expect(namedMode('scout: strava api licence')).toBe('SCOUT')
  expect(namedMode('MOCKUP - new hero')).toBe('MOCKUP')
  expect(namedMode('push it')).toBe('SHIP')
  expect(namedMode('status')).toBe('STATUS')
  expect(namedMode('make sign-in easier')).toBe(undefined)
  expect(namedMode('building a plan for next week')).toBe(undefined)
})

test('the note names the mode, the rules and done', async () => {
  const named = noteFor('SHIP')
  expect(named).toContain('Mode: SHIP (named)')
  expect(named).toContain('push it')
  expect(named).toContain('Waiting to push')
  expect(named).toContain('"done"')
  expect(noteFor('fix the apply form')).toContain('Infer SCOUT')
  expect(noteFor('fix the apply form').length).toBeLessThan(700)
})

test('only real requests get the note', async () => {
  expect(shouldAttach({ text: 'fix it', origin: { kind: 'composer' } })).toBe(true)
  expect(shouldAttach({ text: 'fix it', origin: { kind: 'projects-relay' } })).toBe(true)
  expect(shouldAttach({ text: 'done', origin: { kind: 'task-notification' } })).toBe(false)
  expect(shouldAttach({ text: '/x', command: {} })).toBe(false)
  expect(shouldAttach({ text: '  ' })).toBe(false)
})
