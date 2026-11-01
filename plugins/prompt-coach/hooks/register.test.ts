import { test, expect } from 'claude-code/testing'

test('the note rides beside the prompt and the words stay the same', async ($, on) => {
  let seen: { text: string; context?: readonly string[] } | undefined
  on('command.register', () => ({ value: { command: 'prompt-coach' } }))
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => {
    seen = { text: e.text, context: e.context }
    return { text: e.text, context: e.context }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'BUILD the share button' })
  expect(seen?.text).toBe('BUILD the share button')
  expect(seen?.context?.length).toBe(1)
  expect(seen?.context?.[0]).toContain('Mode: BUILD (named)')
})

test('/prompt-coach off stops the note', async ($, on) => {
  let seen: readonly string[] | undefined = ['unset']
  on('command.register', () => ({ value: { command: 'prompt-coach' } }))
  on('store.get', () => ({ value: false }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => {
    seen = e.context
    return { text: e.text, context: e.context }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'fix the apply form' })
  expect(seen).toBe(undefined)
})
